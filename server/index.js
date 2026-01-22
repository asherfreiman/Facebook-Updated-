

app.get("/debug-files", (req, res) => {
  const files = fs.readdirSync(path.join(__dirname, "public"));
  res.json({ files });
});

import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
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

// Optional debug route (can remove after testing)
app.get("/debug-files", (req, res) => {
  try {
    const files = fs.readdirSync(publicPath);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* --- YOUR UTILITY FUNCTIONS (normalizeUrl, norm, parseRandomOrgVerify, etc.) --- */
// Copy all your functions here exactly as in your current code
// normalizeUrl, norm, parseRandomOrgVerify, parseFromTextFallback, extractNamesFromChunk
// buildTwoLists, buildSpotCountsFromRound1

/* --- API Endpoints --- */
app.post("/api/gravity-final", async (req, res) => {
  try {
    const raw = (req.body?.url ?? "").toString();

    function normalizeVerifyInput(input) {
      if (!input || typeof input !== "string") throw new Error("Missing verify link / code");
      const s = input.trim();
      const m = s.match(/giveaways\.random\.org\/verify\/([a-z0-9]+)/i);
      if (m && m[1]) return `https://giveaways.random.org/verify/${m[1]}`;
      if (/^[a-z0-9]+$/i.test(s)) return `https://giveaways.random.org/verify/${s}`;
      throw new Error("Could not recognize a Random.org verify link or code.");
    }

    const verifyUrl = normalizeVerifyInput(raw);
    const resp = await fetch(verifyUrl, { headers: { "User-Agent": "Mozilla/5.0 (giveaway-site)" } });
    if (!resp.ok) throw new Error(`Fetch failed (${resp.status}). Check the verify link/code.`);

    const html = await resp.text();
    if (/enable javascript|checking your browser|are you a robot|cloudflare/i.test(html)) {
      throw new Error("Random.org is blocking automated requests from your server (bot check).");
    }

    const rounds = parseRandomOrgVerify(html);
    if (!Array.isArray(rounds) || rounds.length === 0) throw new Error("Could not parse rounds from verify page.");

    const withNums = rounds
      .map(r => ({ r, n: Number(r?.round) }))
      .filter(x => Array.isArray(x.r?.names) && x.r.names.length > 0);

    if (withNums.length === 0) throw new Error("No round name lists found.");

    let final = withNums[withNums.length - 1].r;
    const max = withNums.reduce((best, cur) => (Number.isFinite(cur.n) && cur.n > (best.n ?? -1) ? cur : best), { n: -1 });
    if (Number.isFinite(max.n) && max.r) final = max.r;

    const finalRoundList = (final.names || []).map(x => String(x)).filter(Boolean);

    return res.json({ ok: true, roundsCount: rounds.length, finalRoundList });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Request failed" });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const { url, bottomMode } = req.body;
    const safeUrl = normalizeUrl(url);

    const resp = await fetch(safeUrl, { headers: { "User-Agent": "Mozilla/5.0 (giveaway-site)" } });
    if (!resp.ok) throw new Error(`Fetch failed (${resp.status}). Check the verify link/code.`);

    const html = await resp.text();
    if (/enable javascript|checking your browser|are you a robot|cloudflare/i.test(html)) {
      throw new Error("Random.org is blocking automated requests from your server (bot check).");
    }

    const rounds = parseRandomOrgVerify(html);

    const bottomCount = Number(bottomMode);
    if (!Number.isInteger(bottomCount) || bottomCount < 1) {
      throw new Error("bottomMode must be a whole number 1, 2, 3, ...");
    }

    const { topList, bottomList } = buildTwoLists(rounds, bottomCount);
    const spotCounts = buildSpotCountsFromRound1(rounds);

    res.json({ ok: true, roundsCount: rounds.length, topList, bottomList, spotCounts });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/* --- Start server --- */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
