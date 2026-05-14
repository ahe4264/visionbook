/**
 * rag.js — RAG layer for concept graph pipeline
 *
 * Responsibilities:
 *   1. chunkChapter(qmdPath)  → array of Section chunks (text + metadata)
 *   2. embedChunks(chunks)    → adds .embedding to each chunk
 *   3. buildIndex(chapterName)→ chunks + embeddings saved to concept-graphs/<chapter>.rag.json
 *   4. loadIndex(chapterName) → load cached index
 *   5. query(index, text, k)  → cosine top-k retrieval
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const ROOT_DIR     = path.join(__dirname, '..', '..', '..');
const QMD_DIR      = ROOT_DIR;
const INDEX_DIR    = path.join(__dirname, '..', 'concept-graphs');
const EMBED_MODEL  = 'text-embedding-3-small';
const EMBED_DIMS   = 1536;

if (!fs.existsSync(INDEX_DIR)) fs.mkdirSync(INDEX_DIR, { recursive: true });

let _openai = null;
function getOpenAI() {
  if (!_openai) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ── 1. Chunking ──────────────────────────────────────────────────────────────

// Max chars per chunk before paragraph-splitting kicks in
const MAX_CHUNK_CHARS = 1600;

/**
 * Clean markdown syntax from raw text for embedding.
 */
function cleanMarkdown(text) {
  return text
    .replace(/!\[.*?\]\(.*?\)\{[^}]*\}/g, '')   // figure lines with attrs
    .replace(/!\[.*?\]\(.*?\)/g, '')              // plain figure lines
    .replace(/\$\$[\s\S]*?\$\$/g, '[equation]')  // block math
    .replace(/\$[^$]+\$/g, '[math]')              // inline math
    .replace(/::: \{.*?\}/g, '').replace(/:::/g, '')
    .replace(/^\s*#+\s+/gm, '')
    .replace(/\*\*/g, '').replace(/`/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract figure stems referenced in a text block.
 */
function extractFigureStems(text) {
  const stems = [];
  const re = /figures\/[^/]+\/([^).]+)\.[a-z]+/gi;
  let m;
  while ((m = re.exec(text)) !== null) stems.push(m[1]);
  return [...new Set(stems)];
}

/**
 * Split a .qmd file into fine-grained chunks:
 *   1. Split on ## (H2) headings → sections
 *   2. Within each section, split on ### (H3) sub-headings
 *   3. If any chunk is still > MAX_CHUNK_CHARS, split by paragraphs
 *
 * Each chunk: { id, chapterName, chapterTitle, section, text, rawText, figureStems[] }
 */
function chunkChapter(qmdPath) {
  const raw = fs.readFileSync(qmdPath, 'utf-8');
  const lines = raw.split('\n');
  const chapterName = path.basename(qmdPath, '.qmd');
  const titleLine = lines.find(l => l.startsWith('# '));
  const chapterTitle = titleLine
    ? titleLine.replace(/^#\s+/, '').replace(/\s*\{.*\}/, '').trim()
    : chapterName;

  const chunks = [];
  let h2Label = 'Introduction';
  let h3Label = null;
  let currentLines = [];

  /**
   * Save accumulated lines as one or more chunks under (h2, h3).
   */
  const flush = (h2, h3) => {
    const rawText = currentLines.join('\n').trim();
    currentLines = [];
    if (rawText.length < 40) return;

    const sectionLabel = h3 ? `${h2} › ${h3}` : h2;
    const idBase = `${chapterName}__${(h3 ? `${h2}__${h3}` : h2)
      .replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
    const sectionStems = extractFigureStems(rawText);
    const cleanText = cleanMarkdown(rawText);
    if (cleanText.length < 40) return;

    if (cleanText.length <= MAX_CHUNK_CHARS) {
      // Fits in one chunk
      chunks.push({
        id: idBase,
        chapterName, chapterTitle,
        section: sectionLabel,
        text: cleanText,
        rawText,
        figureStems: sectionStems,
      });
    } else {
      // Paragraph-split oversized chunks
      const paragraphs = cleanText.split(/\n\n+/);
      let buf = '';
      let idx = 0;
      const pushBuf = () => {
        const t = buf.trim();
        if (t.length >= 40) {
          chunks.push({
            id: `${idBase}_p${idx}`,
            chapterName, chapterTitle,
            section: sectionLabel,
            text: t,
            rawText: t,
            figureStems: extractFigureStems(t).length ? extractFigureStems(t) : sectionStems,
          });
          idx++;
        }
        buf = '';
      };

      for (const para of paragraphs) {
        if (buf.length + para.length > MAX_CHUNK_CHARS && buf.length > 0) {
          pushBuf();
        }
        buf += (buf ? '\n\n' : '') + para;
      }
      pushBuf();
    }
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush(h2Label, h3Label);
      h2Label = line.replace(/^##\s+/, '').replace(/\s*\{.*\}/, '').trim();
      h3Label = null;
    } else if (line.startsWith('### ')) {
      flush(h2Label, h3Label);
      h3Label = line.replace(/^###\s+/, '').replace(/\s*\{.*\}/, '').trim();
    } else {
      currentLines.push(line);
    }
  }
  flush(h2Label, h3Label);

  return chunks;
}

// ── 2. Embedding ─────────────────────────────────────────────────────────────

/**
 * Embed an array of chunks (adds .embedding in-place).
 * Batches to stay within API limits.
 */
async function embedChunks(chunks) {
  const BATCH = 96; // text-embedding-3-small supports large batches
  const results = [...chunks];

  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH);
    const inputs = batch.map(c => c.text.slice(0, 8000)); // token safety
    const resp = await getOpenAI().embeddings.create({
      model: EMBED_MODEL,
      input: inputs,
      dimensions: EMBED_DIMS,
    });
    resp.data.forEach((item, j) => {
      results[i + j].embedding = item.embedding;
    });
    if (i + BATCH < results.length) {
      // Brief pause between batches
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return results;
}

// ── 3. Build + save index ────────────────────────────────────────────────────

async function buildIndex(chapterName) {
  const qmdPath = path.join(QMD_DIR, `${chapterName}.qmd`);
  if (!fs.existsSync(qmdPath)) throw new Error(`QMD not found: ${qmdPath}`);

  console.log(`[rag] chunking ${chapterName}.qmd …`);
  const chunks = chunkChapter(qmdPath);
  console.log(`[rag] ${chunks.length} sections found`);

  console.log(`[rag] embedding ${chunks.length} chunks …`);
  const embedded = await embedChunks(chunks);

  const indexPath = path.join(INDEX_DIR, `${chapterName}.rag.json`);
  fs.writeFileSync(indexPath, JSON.stringify({ chapterName, chunks: embedded }, null, 2));
  console.log(`[rag] index saved → ${indexPath}`);

  return embedded;
}

// ── 4. Load index ────────────────────────────────────────────────────────────

function loadIndex(chapterName) {
  const indexPath = path.join(INDEX_DIR, `${chapterName}.rag.json`);
  if (!fs.existsSync(indexPath)) return null;
  const { chunks } = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  return chunks;
}

// ── 5. Query: cosine top-k ───────────────────────────────────────────────────

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

async function query(chunks, queryText, k = 5) {
  const resp = await getOpenAI().embeddings.create({
    model: EMBED_MODEL,
    input: [queryText.slice(0, 8000)],
    dimensions: EMBED_DIMS,
  });
  const qEmbed = resp.data[0].embedding;

  const scored = chunks.map(c => ({ ...c, score: cosine(qEmbed, c.embedding) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

module.exports = { chunkChapter, embedChunks, buildIndex, loadIndex, query };
