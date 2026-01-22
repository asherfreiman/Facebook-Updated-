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

// ---- Verify endpoint ----
// Usage: /api/verify?url=https%3A%2F%2Fgiveaways.random.org%2Fverify%2Fumvclp
function cleanRandomUrl(input) {
  if (!input) throw new Error("Missing url");
  let s = String(input).trim();

  try {
    const decoded = decodeURIComponent(s);
    s = decoded;
  } catch {}

  if (s.includes("giveaways.random.org")) {
    try {
      const u = new URL(s);
      u.searchParams.delete("fbclid");
      u.searchParams.delete("utm_source");
      u.searchParams.delete("utm_medium");
      u.searchParams.delete("utm_campaign");
      s = u.toString();
    } catch {}
  }

  if (!/^https?:\/\/giveaways\.random\.org\/(verify|list)\//i.test(s)) {
    throw new Error("URL must start with https://giveaways.random.org/verify/... or /list/...");
  }
  return s;
}

async function fetchWithTimeout(url, ms = 15000, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

app.get("/api/verify", async (req, res) => {
  try {
    const target = cleanRandomUrl(req.query.url);

    const r = await fetchWithTimeout(target, 15000, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,*/*",
      },
    });

    const html = await r.text();

    res.json({
      ok: true,
      fetched: target,
      status: r.status,
      bytes: html.length,
      preview: html.slice(0, 200),
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

