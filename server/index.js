import fs from "fs";

app.get("/debug-files", (req, res) => {
  const files = fs.readdirSync(path.join(__dirname, "public"));
  res.json({ files });
});

import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve the website (frontend) from /public
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

function normalizeUrl(input) {
  if (!input || typeof input !== "string") throw new Error("Missing url");
  const url = input.trim();
  if (/^https?:\/\//i.test(url)) return url;
  return `https://giveaways.random.org/verify/${url}`;
}

// Normalize weird whitespace (NBSP and friends)
function norm(s) {
  return (s || "")
    .replace(/\r/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\u202F/g, " ")
    .replace(/\u2007/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Parse Random.org verify page into rounds:
 * [{ round: 1, names: [...] }, ...]
 */
function parseRandomOrgVerify(html) {
  const $ = cheerio.load(html);

  const headingNodes = [];
  $("h1, h2, h3, h4, h5, strong, b, p, div, span").each((_, el) => {
    const t = norm($(el).text());
    if (/Result of Round #\d+/i.test(t)) headingNodes.push(el);
  });

  if (headingNodes.length === 0) {
    const t = norm($("body").text());
    if (!/Result of Round #\d+/i.test(t)) {
      throw new Error("No rounds found. Make sure you pasted a Random.org VERIFY link.");
    }
    return parseFromTextFallback(t);
  }

  const rounds = [];

  for (let i = 0; i < headingNodes.length; i++) {
    const headingEl = headingNodes[i];
    const headingText = norm($(headingEl).text());
    const roundMatch = headingText.match(/Result of Round #(\d+)/i);
    const roundNum = roundMatch ? Number(roundMatch[1]) : i + 1;

    let chunk = "";
    let cur = $(headingEl).next();

    while (cur.length) {
      const curText = norm(cur.text());
      if (/Result of Round #\d+/i.test(curText)) break;
      if (curText) chunk += "\n" + curText;
      cur = cur.next();
    }

    chunk = norm(chunk);
    const names = extractNamesFromChunk(chunk);

    if (names.length > 0) rounds.push({ round: roundNum, names });
  }

  if (rounds.length === 0) {
    throw new Error("Rounds detected but no participant lines parsed.");
  }

  rounds.sort((a, b) => a.round - b.round);
  return rounds;
}

function extractNamesFromChunk(chunkText) {
  if (!chunkText) return [];

  const lines = chunkText.split("\n").map(norm).filter(Boolean);
  const names = [];

  const reTwoNums = /^\s*\d+\.\s*\d+\.\s*(.+?)\s*$/u; // "1. 3. Name"
  const reOneNum = /^\s*\d+\.\s*(.+?)\s*$/u;         // "1. Name"

  // FIX: preserve numeric-only names like "56"
  const cleanName = (s) => {
    const v = norm(s);

    // If the entire string is digits (e.g., "56"), keep it
    if (/^\d+$/.test(v)) return v;

    // Only strip leading numbers when followed by real text (e.g., "5 Joe" -> "Joe")
    return v.replace(/^\d+\s+(?=\S)/, "").trim();
  };

  for (const line of lines) {
    let m = line.match(reTwoNums);
    if (m && m[1]) {
      const nm = cleanName(m[1]);
      if (nm) names.push(nm);
      continue;
    }

    m = line.match(reOneNum);
    if (m && m[1]) {
      const candidate = cleanName(m[1]);
      if (
        candidate &&
        !/Result of Round/i.test(candidate) &&
        !/Round #/i.test(candidate) &&
        !/Verification/i.test(candidate)
      ) {
        names.push(candidate);
      }
    }
  }

  return names;
}

function parseFromTextFallback(text) {
  const headingRe = /Result of Round #(\d+)(?:\s*–\s*FINAL)?/gi;
  const headings = [];
  let m;
  while ((m = headingRe.exec(text)) !== null) {
    headings.push({ round: Number(m[1]), index: m.index });
  }
  if (headings.length === 0) throw new Error("No rounds found.");

  const rounds = [];
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    const chunk = norm(text.slice(start, end));

    const names = [];
    const lineRe = /^\s*\d+\.\s*\d+\.\s*(.+?)\s*$/gmu;
    let lm;
    while ((lm = lineRe.exec(chunk)) !== null) {
      if (lm[1]) names.push(norm(lm[1]));
    }

    if (names.length > 0) rounds.push({ round: headings[i].round, names });
  }

  if (rounds.length === 0) throw new Error("Rounds detected but no participant lines parsed.");

  rounds.sort((a, b) => a.round - b.round);
  return rounds;
}

/**
 * Returns TWO lists:
 * - topList: numbered by round (e.g., "1. Alice")
 * - bottomList: numbered by round, bottom N (e.g., "1. Bob, Carol")
 */
function buildTwoLists(rounds, bottomCount = 1) {
  if (!Number.isInteger(bottomCount) || bottomCount < 1) {
    throw new Error("bottomCount must be an integer >= 1");
  }

  const topList = [];
  const bottomList = [];

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    const names = r.names;
    if (!names || names.length === 0) continue;

    const num = Number.isFinite(r.round) ? r.round : i + 1;

    topList.push(`${num}. ${names[0]}`);

    const n = Math.min(bottomCount, names.length);
    const bottomN = names.slice(-n).join(", ");
    bottomList.push(`${num}. ${bottomN}`);
  }

  return { topList, bottomList };
}

function buildSpotCountsFromRound1(rounds) {
  const spotCounts = {};
  const round1 = rounds.find(r => r && Number(r.round) === 1) || rounds[0];

  if (!round1 || !Array.isArray(round1.names)) return spotCounts;

  for (const raw of round1.names) {
    const name = norm(raw);
    if (!name) continue;
    spotCounts[name] = (spotCounts[name] || 0) + 1;
  }

  return spotCounts;
}


app.post("/api/gravity-final", async (req, res) => {
  try {
    const raw = (req.body?.url ?? "").toString();

    // TT-style verify retrieval: accept full verify URL, fb-wrapped URL, or just the code
    function normalizeVerifyInput(input) {
      if (!input || typeof input !== "string") throw new Error("Missing verify link / code");
      const s = input.trim();

      const m = s.match(/giveaways\.random\.org\/verify\/([a-z0-9]+)/i);
      if (m && m[1]) return `https://giveaways.random.org/verify/${m[1]}`;

      if (/^[a-z0-9]+$/i.test(s)) return `https://giveaways.random.org/verify/${s}`;

      throw new Error("Could not recognize a Random.org verify link or code.");
    }

    const verifyUrl = normalizeVerifyInput(raw);

    const resp = await fetch(verifyUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (giveaway-site)" }
    });
    if (!resp.ok) throw new Error(`Fetch failed (${resp.status}). Check the verify link/code.`);

    const html = await resp.text();

    if (/enable javascript|checking your browser|are you a robot|cloudflare/i.test(html)) {
      throw new Error("Random.org is blocking automated requests from your server (bot check).");
    }

    // Reuse your existing parser (same one TT uses)
    const rounds = parseRandomOrgVerify(html);
    if (!Array.isArray(rounds) || rounds.length === 0) {
      throw new Error("Could not parse rounds from verify page.");
    }

    // Final round = highest round number if present, else last valid
    const withNums = rounds
      .map(r => ({ r, n: Number(r?.round) }))
      .filter(x => Array.isArray(x.r?.names) && x.r.names.length > 0);

    if (withNums.length === 0) throw new Error("No round name lists found.");

    let final = withNums[withNums.length - 1].r;
    const max = withNums.reduce((best, cur) =>
      (Number.isFinite(cur.n) && cur.n > (best.n ?? -1) ? cur : best),
      { n: -1 }
    );
    if (Number.isFinite(max.n) && max.r) final = max.r;

    const finalRoundList = (final.names || []).map(x => String(x)).filter(Boolean);

    return res.json({
      ok: true,
      roundsCount: rounds.length,
      finalRoundList
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Request failed" });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const { url, bottomMode } = req.body;
    const safeUrl = normalizeUrl(url);

    const resp = await fetch(safeUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (giveaway-site)" }
    });

    if (!resp.ok) {
      throw new Error(`Fetch failed (${resp.status}). Check the verify link/code.`);
    }

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

    // ✅ NEW: spotCounts (how many paid spots each name has) from Round 1 list
    const spotCounts = buildSpotCountsFromRound1(rounds);

    res.json({
      ok: true,
      roundsCount: rounds.length,
      topList,
      bottomList,
      spotCounts
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
