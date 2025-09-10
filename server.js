const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const upload = multer({ dest: "uploads/" });

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const REPO_NAME = process.env.REPO_NAME;
const OWNER = process.env.OWNER;

// serve static files from root
app.use(express.static("."));

// 🚀 Deploy endpoint
app.post("/deploy", upload.single("creds"), async (req, res) => {
  const username = req.body.username;
  if (!username) return res.status(400).send("GitHub username required!");

  // Step 1: Verify fork on GitHub
  const ghCheck = await fetch(`https://api.github.com/repos/${username}/${REPO_NAME}`);
  if (ghCheck.status !== 200) {
    return res.status(400).send("❌ Repo not forked!");
  }

  // Step 2: Save creds.json
  const credsPath = path.join("uploads", req.file.originalname);
  fs.renameSync(req.file.path, credsPath);

  // Step 3: Trigger Render Deployment
  const renderRes = await fetch("https://api.render.com/v1/services", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RENDER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: `space-xmd-${username}`,
      repo: `https://github.com/${username}/${REPO_NAME}`,
      branch: "main",
      type: "web_service",
      envVars: [{ key: "CREDS_FILE", value: credsPath }]
    })
  });

  const data = await renderRes.json();
  res.json(data);
});

app.listen(3000, () => console.log("🌍 Running on http://localhost:3000"));