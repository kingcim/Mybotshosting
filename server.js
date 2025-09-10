// server.js
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from root
app.use(express.static("."));

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const REPO_NAME = process.env.REPO_NAME || "Space-XMD";
const OWNER = process.env.OWNER || "iconic05";
const PORT = process.env.PORT || 3000;

if (!RENDER_API_KEY) {
  console.warn("⚠️  No RENDER_API_KEY found in env. Add it to .env before deploying.");
}

// Helper: Check GitHub repo existence for username
async function checkFork(username) {
  try {
    const url = `https://api.github.com/repos/${username}/${REPO_NAME}`;
    const res = await axios.get(url, {
      headers: { "User-Agent": "Space-XMD-Deployer" }
    });
    // if returns 200, repo exists under username
    const data = res.data;
    // confirm it's a fork (optional): data.fork === true and parent.full_name === `${OWNER}/${REPO_NAME}`
    const isFork = !!data.fork && data.parent && data.parent.full_name && data.parent.full_name.toLowerCase().includes(`${OWNER.toLowerCase()}/${REPO_NAME.toLowerCase()}`);
    return { exists: true, fork: isFork, repoData: data };
  } catch (err) {
    if (err.response && err.response.status === 404) return { exists: false, fork: false };
    throw err;
  }
}

// POST /check-fork => { exists:bool, fork:bool, message }
app.post("/check-fork", async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, message: "Username required" });

  try {
    const result = await checkFork(username);
    if (!result.exists) return res.json({ ok: false, exists: false, fork: false, message: "Repo not found under that username. Please fork first." });
    if (!result.fork) {
      return res.json({ ok: true, exists: true, fork: false, message: "Repo exists but not a recognized fork of the main repo." });
    }
    return res.json({ ok: true, exists: true, fork: true, message: "Fork confirmed. You can deploy." });
  } catch (err) {
    console.error("check-fork error:", err.message || err);
    return res.status(500).json({ ok: false, message: "Server error while checking GitHub." });
  }
});

// POST /deploy
// multipart: username + creds file
app.post("/deploy", upload.single("creds"), async (req, res) => {
  const username = req.body.username;
  if (!username) return res.status(400).json({ ok: false, message: "Username required" });
  if (!req.file) return res.status(400).json({ ok: false, message: "Please upload creds.json" });

  // verify fork again
  try {
    const check = await checkFork(username);
    if (!check.exists || !check.fork) {
      return res.status(400).json({ ok: false, message: "Fork not found for that username. Ask them to fork then try again." });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Error verifying fork." });
  }

  // Move creds to safe path (uploads already)
  const savedPath = path.join(__dirname, req.file.path);
  // WARNING: you should ensure uploads are secured and cleaned up in production
  console.log(`Saved creds to ${savedPath}`);

  // Create Render service via API
  if (!RENDER_API_KEY) {
    return res.status(500).json({ ok: false, message: "Render API key missing on server." });
  }

  try {
    // Build the service payload
    const serviceName = `space-xmd-${username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 30);
    const payload = {
      name: serviceName,
      repo: `https://github.com/${username}/${REPO_NAME}`,
      branch: "main",
      type: "web_service",
      envVars: [
        // You can set env vars here. We set a pointer to creds filename.
        { key: "CREDS_FILENAME", value: req.file.originalname },
        { key: "NODE_ENV", value: "production" }
      ]
    };

    const renderRes = await axios.post("https://api.render.com/v1/services", payload, {
      headers: {
        Authorization: `Bearer ${RENDER_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    // renderRes.data contains the created service
    const service = renderRes.data;
    // return service id to frontend so it can tail logs
    return res.json({ ok: true, message: "Deployment started", serviceId: service.id, service });
  } catch (err) {
    console.error("Render create service error:", err.response ? err.response.data : err.message);
    return res.status(500).json({ ok: false, message: "Render API error creating service", detail: err.response ? err.response.data : err.message });
  }
});

// SSE: /stream-logs?serviceId=xxx
// Polls Render logs endpoint every 2s and pushes new lines
app.get("/stream-logs", (req, res) => {
  const serviceId = req.query.serviceId;
  if (!serviceId) return res.status(400).send("serviceId required");

  if (!RENDER_API_KEY) {
    return res.status(500).send("Render API key not configured on server.");
  }

  res.writeHead(200, {
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache"
  });

  let lastTs = 0;
  let isAlive = true;

  // helper to push SSE event
  function pushEvent(data) {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      // client disconnected
      isAlive = false;
    }
  }

  // initial quick poll then interval
  async function poll() {
    try {
      const url = `https://api.render.com/v1/services/${serviceId}/logs?limit=200`;
      const r = await axios.get(url, {
        headers: { Authorization: `Bearer ${RENDER_API_KEY}` }
      });

      const logs = r.data || [];
      // logs might be array of objects or text - adapt
      // We'll send the full logs array back; client can format
      pushEvent({ ok: true, logs });
    } catch (err) {
      pushEvent({ ok: false, error: err.response ? err.response.data : err.message });
    }
  }

  // Immediately do a poll and then every 2.5s
  poll();
  const iv = setInterval(() => {
    if (!isAlive) return clearInterval(iv);
    poll();
  }, 2500);

  // clean up on client disconnect
  req.on("close", () => {
    clearInterval(iv);
    isAlive = false;
  });
});

// fallback route to serve index.html (for single page)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Deployer running on port ${PORT}`);
});