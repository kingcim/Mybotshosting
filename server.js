// server.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Render API
const RENDER_API = "https://api.render.com/v1/services";
const RENDER_KEY = process.env.RENDER_API_KEY;

// GitHub
const OWNER = "iconic05"; // your GitHub owner
const REPO_NAME = "Space-XMD"; // repo to check forks

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // serve frontend

// --- Helper: Check GitHub repo existence & fork status ---
async function checkFork(username) {
  try {
    const url = `https://api.github.com/repos/${username}/${REPO_NAME}`;
    const headers = { "User-Agent": "Space-XMD-Deployer" };

    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const res = await axios.get(url, { headers });
    const data = res.data;

    const isFork =
      !!data.fork &&
      data.parent &&
      data.parent.full_name &&
      data.parent.full_name.toLowerCase() ===
        `${OWNER.toLowerCase()}/${REPO_NAME.toLowerCase()}`;

    return { exists: true, fork: isFork, repoData: data };
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return { exists: false, fork: false };
    }
    console.error(
      "GitHub API error:",
      err.response ? err.response.data : err.message
    );
    throw new Error("GitHub API error");
  }
}

// --- API: Check fork ---
app.post("/check-fork", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Username required" });

  try {
    const result = await checkFork(username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Server error while checking GitHub." });
  }
});

// --- API: Deploy on Render ---
app.post("/deploy", async (req, res) => {
  const { repoUrl } = req.body;
  if (!repoUrl)
    return res.status(400).json({ error: "Repository URL required" });

  try {
    const response = await axios.post(
      RENDER_API,
      {
        serviceDetails: {
          name: `bot-${Date.now()}`,
          repo: repoUrl,
          branch: "main",
          env: "node",
          plan: "free",
          buildCommand: "npm install",
          startCommand: "node server.js",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${RENDER_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      success: true,
      message: "Deployment started!",
      data: response.data,
    });
  } catch (err) {
    console.error(
      "Render API error:",
      err.response ? err.response.data : err.message
    );
    res.status(500).json({ error: "Failed to start deployment." });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});