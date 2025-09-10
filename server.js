import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const BASE_REPO = `${process.env.OWNER}/${process.env.REPO_NAME}`;
const REPO_NAME = process.env.REPO_NAME;

// Deploy endpoint
app.post("/deploy", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Username required" });

  try {
    // STEP 1: check if fork exists
    const forkUrl = `https://api.github.com/repos/${username}/${REPO_NAME}`;
    let forkExists = true;

    try {
      await axios.get(forkUrl, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });
    } catch {
      forkExists = false;
    }

    // STEP 2: fork repo if missing
    if (!forkExists) {
      console.log(`Forking repo for ${username}...`);
      await axios.post(
        `https://api.github.com/repos/${BASE_REPO}/forks`,
        {},
        { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
      );

      // wait a bit for GitHub to process fork
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // STEP 3: create Render service from fork
    console.log(`Creating Render service for ${username}...`);
    const createService = await axios.post(
      "https://api.render.com/v1/services",
      {
        service: {
          name: `${username}-bot`,
          repo: `https://github.com/${username}/${REPO_NAME}.git`,
          branch: "main",
          environment: "node",
          plan: "free",
          region: "oregon"
        }
      },
      { headers: { Authorization: `Bearer ${RENDER_API_KEY}` } }
    );

    return res.json({
      success: true,
      message: "Bot deployed successfully!",
      render: createService.data
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({
      error: "Deployment failed",
      details: err.response?.data || err.message
    });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Deploy server running on http://localhost:${PORT}`)
);