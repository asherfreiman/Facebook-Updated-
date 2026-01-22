import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";  // import only once

const app = express(); // app must be declared first
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// __dirname setup for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from /public
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// Redirect root "/" to welcome.html
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "welcome.html"));
});

// Optional debug route — must come after app declaration
app.get("/debug-files", (req, res) => {
  try {
    const files = fs.readdirSync(publicPath);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* --- Place all your utility functions here --- */
// normalizeUrl, norm, parseRandomOrgVerify, parseFromTextFallback, extractNamesFromChunk
// buildTwoLists, buildSpotCountsFromRound1

/* --- API Endpoints --- */
app.post("/api/gravity-final", async (req, res) => {
  // ... your existing gravity-final code
});

app.post("/api/generate", async (req, res) => {
  // ... your existing generate code
});

/* --- Start server --- */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
