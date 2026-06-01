require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk/index.js');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all origins (local dev)
}));
app.use(express.json({ limit: '10mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Semantic PDF index: title → [{ pageNum, text, embedding }] ──
const pdfIndexes = new Map();
const PDF_INDEX_LIMIT = 5; // evict oldest when over limit

function cosineSim(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // text-embedding-3-small vectors are unit-normalized
}

app.post('/api/chat', async (req, res) => {
  const { messages, bookTitle, currentPage, pageText, readingSection, tutorMode, isTutorCheckin, outlineContext, learnerHistory } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const hasImage = messages.some(m => m.imageData);

  // ── RAG: retrieve semantically relevant pages ──────────────
  let retrievedContext = '';
  const ragChunks = pdfIndexes.get(bookTitle);
  if (ragChunks?.length && !isTutorCheckin) {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const query = typeof lastUser?.content === 'string' ? lastUser.content : '';
    if (query.trim()) {
      try {
        const qEmbed = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: query.slice(0, 500),
        });
        const qVec = qEmbed.data[0].embedding;
        const hits = ragChunks
          .filter(c => c.pageNum !== currentPage)
          .map(c => ({ pageNum: c.pageNum, text: c.text, score: cosineSim(qVec, c.embedding) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .filter(c => c.score > 0.35);
        if (hits.length) {
          retrievedContext = '\n\nRELEVANT CONTEXT FROM OTHER PAGES (use [GOTO:N] to send user there if helpful):\n' +
            hits.map(c => `[p.${c.pageNum}] ${c.text.slice(0, 400)}`).join('\n\n');
        }
      } catch { /* non-fatal — continue without retrieval */ }
    }
  }

  const sectionCtx = readingSection
    ? `\n\nSection the user is reading:\n"""\n${readingSection.slice(0, 500)}\n"""`
    : '';

  const pageContext = currentPage
    ? `\n\nPage ${currentPage}${bookTitle ? ` of "${bookTitle}"` : ''}.${pageText ? `\n\nPage text:\n"""\n${pageText.slice(0, 2000)}\n"""` : ''}${sectionCtx}${retrievedContext}`
    : '';

  const outlineSection = outlineContext
    ? `\n\nBOOK OUTLINE (use these page numbers for [GOTO:N]):\n${outlineContext.slice(0, 1500)}`
    : '';

  const learnerCtx = learnerHistory
    ? `\n\nLEARNER HISTORY (pages where student struggled — use to calibrate difficulty):\n${learnerHistory}`
    : '';

  const tutorInstructions = tutorMode ? `\n\nTUTOR MODE — STRICT SOCRATIC METHOD.${outlineSection}${learnerCtx}

${isTutorCheckin
  ? `The user has been reading for a while. Ask ONE short question about what they're reading.
Hook + question only. Max 20 words total. No explanation. No [HIGHLIGHT] or [GOTO] tags.
70% open-ended: "Here's a thought — why would adding more hidden units not always help?"
30% multiple choice: "Quick check — what does ReLU output for negative inputs? A) 0  B) the input  C) −1"
If the learner history above shows gaps on topics in the current page, probe those topics.
Output ONLY the question. Nothing else.`
  : `━━━ RULES (non-negotiable) ━━━
1. NEVER give a direct answer or explanation unprompted. You are a Socratic guide, not a lecturer.
   - If the student asks "what is X?", respond with "What do you think X might mean based on the context?"
   - If they're clearly stuck, give ONE short hint (not the answer), then ask them to complete the thought.
   - Only after 3+ exchanges on the same concept may you give a direct explanation — and even then keep it brief.
2. MAX RESPONSE: 2 short sentences + 1 question. No bullet-point lectures. No walls of text.
3. When user asks about a concept:
   • If it's in the current page text → ask what they think it means. Use [HIGHLIGHT:"verbatim phrase"] ONLY when pointing them to read a specific passage (not on every reply).
   • If it's on a different page → [GOTO:N] to take them there, optionally [HIGHLIGHT:"phrase"] on that page.
   • Do NOT emit [HIGHLIGHT] on every response — only when explicitly directing them to read something.
4. Never apologize for page content or re-summarize the page. React only to what the user said.
5. Offer a visualization ONLY if the user explicitly asks for one.
6. CROSS-PAGE: Use the book outline above to find the right page number for [GOTO:N].
7. Sometimes (30% of replies in a question exchange) ask a MULTIPLE CHOICE question to test understanding:
   Format: "Quick check — [brief question]? A) [option]  B) [option]  C) [option]"

━━━ TONE ━━━
Warm, curious, brief. Like a good study partner — not a professor.
"Interesting — what would happen if φ₀ were zero? [HIGHLIGHT:"the offset φ₀ controls the height"]"
"Right track! Now look at [GOTO:28] — what does the figure there show you?"`}` : '';

  // For tutor check-ins: use a minimal system to avoid verbose responses
  const system = isTutorCheckin
    ? `You are a Socratic tutor. ${pageContext}${tutorInstructions}`
    : `You are an engaging tutor helping the user understand a PDF${bookTitle ? ` titled "${bookTitle}"` : ''}. When the user quotes text (prefixed with >), use it as context for their question.${pageContext}${tutorInstructions}

Respond in a way that feels alive and interactive:
- **Default to including a visualization** whenever it would help — diagrams for processes, interactive demos for math/physics concepts, animated flows for algorithms. Err on the side of building one rather than skipping it.
- After your explanation, **ask the user one short follow-up question** to check understanding or deepen engagement (e.g. "Does that click? What part feels fuzzy?" or a quick conceptual question for them to answer).
- Keep prose tight — no walls of text. Use headers, bold key terms, short bullet points.

PDF HIGHLIGHTING: When pointing the user to a specific passage in the PDF, or when explaining something that appears in the current page text, include [HIGHLIGHT:"exact text"] tags in your response using the verbatim wording from the page context. Max 3 highlights, each 3–12 words. These tags are invisible to the user — the PDF viewer will yellow-highlight those passages automatically. Example: [HIGHLIGHT:"activation function must be nonlinear"]

CROSS-PAGE NAVIGATION: If you need to refer the user to content on a specific different page (e.g., "this was defined back in section 2.1" or "let's look at figure 4.2"), include [GOTO:N] once at the end of your response where N is the page number. The reader will be automatically navigated there with a "back" button to return. Use sparingly — only when seeing that specific page adds real value to understanding. Do not use [GOTO:N] for the current page.

When a visualization would help, output a self-contained interactive HTML visualization in a fenced code block:
\`\`\`html
<!DOCTYPE html><html>...self-contained with inline CSS/JS...</html>
\`\`\`
Style with background color exactly #1e1e1e and light text (#e0e0e0).

━━━ VISUALIZATION LAYOUT RULES (every rule is mandatory) ━━━

STRUCTURE:
- body has THREE zones: controls strip (#ui) at top, canvas/chart in the middle (fills remaining space), concept narration line (#narration) at the bottom.
- Use flexbox: body { display:flex; flex-direction:column; height:100vh; margin:0; overflow:hidden; background:#1e1e1e; }
  #ui { flex:0 0 auto; }  #canvas-wrap { flex:1 1 0; min-height:0; }  #narration { flex:0 0 auto; }

CONTROLS (#ui strip):
- Keep controls minimal and subtle. Use small font (12px), compact padding (4px 8px).
- Labels should describe the interaction directly, e.g. "φ₀ (intercept): 1.0" — no separate instruction text.
- Max 3 controls visible at once. If more needed, hide secondary ones in a collapsed section.
- Do NOT put a legend inside the controls strip — if needed, draw the legend inside the canvas itself.
- Background MUST be #1e1e1e (same as body) — no border, no darker shade. Must be seamless.

CONCEPT NARRATION LINE (#narration) — mandatory on every visualization:
- Always include a <div id="narration"> at the bottom of the body.
- CSS: height:28px; padding:0 14px; display:flex; align-items:center; font:12px/1 system-ui,sans-serif; color:#aaa; background:#1e1e1e;
- Update its textContent on EVERY user interaction (slider change, click, hover) with a plain-English sentence explaining what the current state means conceptually.
  Examples: "slope too shallow — model under-predicts most points, loss is high"
            "near-optimal slope — residuals are small, loss approaching minimum"
            "layer 2 activating — this hidden unit detects edges in the input"
- This line is always visible and always current — it IS the explanation the user needs.
- Never leave it empty after the first render.

LABELS ON CHART:
- Axis labels: minimum 13px, color #ccc. Never smaller — tiny labels are unreadable.
- Data labels: 12px, same color as their element.
- All text must be within the canvas bounds — never clipped or overflowing the edge.
- Do NOT draw label backgrounds (no fillRect behind text) — just the text with a subtle shadow if needed.

POPUPS / TOOLTIPS:
- Hover tooltips: appear on mouseover, vanish on mouseleave. 13px, color #eee, no background box.
- No floating legend cards covering the chart. Draw the legend as small text in an empty corner.

SEAMLESS APPEARANCE — non-negotiable:
- body, #ui, #narration, and the canvas background must ALL be exactly #1e1e1e.
- NO borders, NO dividers, NO box-shadows anywhere in the layout.
- The visualization must look like it IS the chat, not a widget inside it.

When asked to create a 3D visualization from a figure image, your goal is NOT just to replicate the figure in 3D — it is to build an **interactive learning tool** around it. Think: what would help someone deeply understand the concept this figure illustrates?

Interactive learning features to include (pick what fits the concept):
- **Sliders or buttons** that animate or morph the scene — e.g. change a parameter and watch the shape/behavior update in real time
- **Clickable parts** that highlight and show a tooltip/label explaining that component
- **Step-through mode** — a "Next" button that walks through stages of a process (e.g. forward pass, each layer activating)
- **Toggle views** — e.g. show/hide connections, switch between "normal network" vs "residual network"
- **Animated flows** — particles or arrows flowing along paths to show data movement, gradient flow, etc.
- **Hover tooltips** using CSS2DObjects that appear on mouseover with a one-line explanation

UI controls: a thin strip at the TOP of the layout (not floating over the canvas). Use the flexbox structure below.

Critical rendering rules:
- Text labels: use CSS2DRenderer for crisp HTML labels (import CSS2DRenderer and CSS2DObject from three/addons/renderers/CSS2DRenderer.js). Style label divs with color:#ffffff, font-size:11px, no background — just text-shadow:0 1px 3px #000. CRITICAL: create each CSS2DObject ONCE during scene init and attach it to its mesh — NEVER create or add CSS2DObjects inside the animation loop. To update label text, mutate the existing div's textContent.
- Materials: always fully opaque (opacity:1, transparent:false) unless transparency is intentional. Use MeshStandardMaterial or MeshPhongMaterial.
- Lighting: AmbientLight (intensity 1.5) + DirectionalLight (intensity 2).
- renderer.setClearColor(0x1e1e1e, 1).
- Panels/planes: MeshBasicMaterial with solid color 0x2a2a2a, fully opaque.

Structure (copy this exactly — do not change the body/layout CSS):
\`\`\`html
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1e1e1e; display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden; }
  #ui { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 10px; background: #1e1e1e; }
  #ui button { background: #2a2a2a; color: #ccc; border: 1px solid #3a3a3a; border-radius: 4px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
  #ui button:hover { background: #333; color: #fff; border-color: #4a7ef5; }
  #ui label { font-size: 12px; color: #bbb; display: flex; align-items: center; gap: 4px; }
  #ui input[type=range] { accent-color: #4a7ef5; width: 120px; }
  #canvas-wrap { flex: 1 1 0; min-height: 0; position: relative; }
  #canvas-wrap canvas { display: block; width: 100% !important; height: 100% !important; }
  #narration { flex: 0 0 auto; height: 28px; padding: 0 14px; display: flex; align-items: center; font: 12px/1 system-ui,sans-serif; color: #888; background: #1e1e1e; }
</style>
</head>
<body>
<div id="ui"><!-- compact controls only — no instructions, no legend --></div>
<div id="canvas-wrap"><!-- canvas or SVG goes here --></div>
<div id="narration"><!-- update textContent on every interaction with a plain-English concept explanation --></div>
<script type="importmap">
{"imports": {"three": "https://cdn.jsdelivr.net/npm/three@0.171.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.171.0/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// CANVAS SIZING — always do this before drawing, or the canvas stays at 300x150:
// const wrap = document.getElementById('canvas-wrap');
// const canvas = document.createElement('canvas');
// wrap.appendChild(canvas);
// function resize() { canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight; redraw(); }
// new ResizeObserver(resize).observe(wrap);
// window.addEventListener('load', resize);
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
// scene, camera, renderer, labelRenderer, controls, interactive logic, animation loop
</script>
</body>
</html>
\`\`\`
Use OrbitControls. Make it visually faithful, interactive, and genuinely educational.`;

  // Reformat messages — convert imageData fields to Claude multipart format, strip internal fields
  const formattedMessages = messages
    .filter(m => !m._tutorCheckin) // strip internal check-in markers
    .map(m => {
      if (m.imageData) {
        return {
          role: m.role,
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: m.imageMimeType || 'image/png',
                data: m.imageData,
              },
            },
            { type: 'text', text: m.content },
          ],
        };
      }
      return { role: m.role, content: m.content };
    }).filter(m => m.content && (Array.isArray(m.content) ? m.content.length > 0 : m.content.trim()));

  // Ensure message list ends with a user turn (required by Claude API)
  const apiMessages = (() => {
    const msgs = [...formattedMessages];
    if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'user') {
      msgs.push({ role: 'user', content: isTutorCheckin ? 'Ask me a question.' : 'Continue.' });
    }
    return msgs;
  })();

  try {
    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: isTutorCheckin ? 80 : hasImage ? 8192 : 4096,
      system,
      messages: apiMessages,
    });

    const reply = response.content[0]?.text || '';
    res.json({ reply });
  } catch (err) {
    console.error('Claude error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/embed-pdf ───────────────────────────────────
// Embeds all pages of a PDF with text-embedding-3-small for RAG retrieval.
// Called once on PDF load from the frontend; stores index server-side in memory.
app.post('/api/embed-pdf', async (req, res) => {
  const { title, pages } = req.body; // pages: [{ pageNum, text }]
  if (!title || !Array.isArray(pages) || !pages.length) {
    return res.status(400).json({ error: 'title and pages[] required' });
  }
  try {
    const valid = pages.filter(p => p.text?.trim());
    const BATCH = 100;
    const chunks = [];
    for (let i = 0; i < valid.length; i += BATCH) {
      const batch = valid.slice(i, i + BATCH);
      const resp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch.map(p => p.text),
      });
      resp.data.forEach((d, j) => {
        chunks.push({ pageNum: batch[j].pageNum, text: batch[j].text, embedding: d.embedding });
      });
    }
    if (pdfIndexes.size >= PDF_INDEX_LIMIT) {
      pdfIndexes.delete(pdfIndexes.keys().next().value);
    }
    pdfIndexes.set(title, chunks);
    console.log(`[embed-pdf] indexed "${title}" — ${chunks.length} pages`);
    res.json({ ok: true, pages: chunks.length });
  } catch (err) {
    console.error('[embed-pdf]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classify-figure ─────────────────────────────
// Fast Haiku call: classifies an image as 'equation' or 'figure' in ~300ms
app.post('/api/classify-figure', async (req, res) => {
  const { imageData, imageMimeType = 'image/png' } = req.body;
  if (!imageData) return res.status(400).json({ error: 'imageData required' });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageMimeType, data: imageData } },
          {
            type: 'text',
            text: `Is the PRIMARY content of this image a mathematical equation or formula block?

Answer YES only if:
- The image shows actual math notation (equations, formulas with =, +, variables, Greek letters)
- The dominant content is math text arranged as equations

Answer NO if:
- It is a diagram, figure, chart, flowchart, architecture, graph, or illustration
- It contains shapes, boxes, arrows, or node networks
- It references an equation number ("Eq. 7.9") in a title but is itself a diagram

Reply with only: YES or NO`,
          },
        ],
      }],
    });
    const answer = response.content[0]?.text?.trim().toUpperCase();
    res.json({ type: answer === 'YES' ? 'equation' : 'figure' });
  } catch (err) {
    console.error('[classify-figure] error:', err.message);
    // On error, assume figure (safer fallback)
    res.json({ type: 'figure' });
  }
});

// ── POST /api/augment-equation ─────────────────────────────
// Generates an interactive equation HTML. Call ONLY after classify-figure returns 'equation'.
app.post('/api/augment-equation', async (req, res) => {
  const { imageData, imageMimeType = 'image/png', bookTitle, pageText } = req.body;
  if (!imageData) return res.status(400).json({ error: 'imageData required' });

  const system = `You are augmenting a mathematical equation block from a PDF page.

Reproduce the equations as HTML matching the original visually (white bg, same small font, same table layout), then make every symbol and every equation row fully interactive.

━━━ FONT & SIZE (CRITICAL) ━━━
- body font-size: 12px. Do NOT use MathJax or KaTeX — use Unicode + <i><sub><sup> only.
- Line height: 1.9. Padding: 6px 10px. overflow-y: auto; width:100%; height:100%; background:#fff.

━━━ LAYOUT ━━━
- <table> with columns: LHS | = | RHS. Cell padding: 0 6px; vertical-align: middle; white-space: nowrap.
- Each <td> MUST have white-space:nowrap so equation terms never wrap to a new line.

━━━ COLOR CODING ━━━
- Variables/unknowns: #2563eb  • Parameters (β,ω,φ,θ): #b45309
- Functions (sin,exp,log…): #7c3aed  • Index letters (i,j,k): #16a34a
- Operators/delimiters: #94a3b8  • Numbers: #374151

━━━ USE THIS EXACT HTML STRUCTURE (fill in your content) ━━━

\`\`\`html
<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#fff;font:12px/1.9 Georgia,'Times New Roman',serif;color:#1a1a1a;padding:6px 10px;overflow-y:auto;width:100%;height:100%}
table{border-collapse:collapse;width:100%}
td{padding:1px 6px;vertical-align:middle;white-space:nowrap}
.sym{border-radius:2px;cursor:help;transition:background 0.12s}
.sym:hover,.sym.hl{background:rgba(74,126,245,0.15)}
tr.eq-row{cursor:pointer}
tr.eq-row:hover td{background:rgba(0,0,0,0.03)}
.guide-body{display:none;margin-top:6px}
.guide-hd{cursor:pointer;font-size:11px;color:#888;user-select:none}
</style></head><body>

<!-- YOUR EQUATIONS TABLE:
  Each <tr> gets class="eq-row" + data-title="equation meaning" + data-body="full explanation"
  Each meaningful symbol gets class="sym" + data-tip="what it means" + data-v="varname" (for cross-highlighting)
  Example fraction: <span class="sym" data-tip="partial derivative of loss w.r.t. f₂" data-v="li_f2">∂ℓᵢ/∂f₂</span>
-->
<table>
  FILL IN YOUR EQUATIONS HERE
</table>

<div style="border-top:1px dashed #ddd;margin-top:8px;padding-top:4px">
  <span class="guide-hd" onclick="var b=this.nextElementSibling;b.style.display=b.style.display==='block'?'none':'block';this.textContent=this.textContent[0]==='▸'?'▾ Symbol guide':'▸ Symbol guide'">▸ Symbol guide</span>
  <div class="guide-body" style="font-size:11px;color:#555;line-height:1.8">
    FILL IN SYMBOL GUIDE ROWS: <b>symbol</b> — meaning<br>
  </div>
</div>

<script>
document.addEventListener('keydown',e=>{if(e.key==='Escape')window.parent.postMessage({type:'alex-popup',title:null},'*')});

// Tooltip via postMessage — send cursor coords so parent can position accurately
document.querySelectorAll('.sym').forEach(el=>{
  el.addEventListener('mouseenter',e=>{
    const tip=el.dataset.tip||'';
    if(tip) window.parent.postMessage({type:'alex-tooltip',text:tip,mx:e.clientX,my:e.clientY},'*');
    if(el.dataset.v)document.querySelectorAll('[data-v="'+el.dataset.v+'"]').forEach(s=>s.classList.add('hl'));
  });
  el.addEventListener('mousemove',e=>{
    window.parent.postMessage({type:'alex-tooltip-move',mx:e.clientX,my:e.clientY},'*');
  });
  el.addEventListener('mouseleave',()=>{
    window.parent.postMessage({type:'alex-tooltip',text:null},'*');
    document.querySelectorAll('.hl').forEach(s=>s.classList.remove('hl'));
  });
});

// Click row → postMessage popup in parent (avoids cutoff inside short iframe)
document.querySelectorAll('.eq-row').forEach(row=>{
  row.addEventListener('click',()=>{
    const title=row.dataset.title||row.querySelector('td')?.textContent?.trim()||'Equation';
    const body=row.dataset.body||'';
    window.parent.postMessage({type:'alex-popup',title,body},'*');
  });
});
</script></body></html>
\`\`\`

MANDATORY — do NOT skip any of these:
1. Every <tr> MUST have class="eq-row" data-title="short equation name (≤6 words)" data-body="1-sentence explanation (≤20 words)" — no exceptions, even for simple rows.
2. Every meaningful symbol MUST be: <span class="sym" style="color:#HEXCODE" data-tip="what this means" data-v="key">symbol</span>
   Colors: variables/unknowns=#2563eb  parameters(β,ω,φ,θ,Ω)=#b45309  functions(σ,a,exp,log)=#7c3aed  indices(i,j,k,K)=#16a34a  operators=#94a3b8  numbers=#374151
   Every colored symbol needs BOTH style="color:..." AND class="sym" data-tip="..." — missing data-tip means no hover tooltip.
${bookTitle ? `Context: from "${bookTitle}".` : ''}
${pageText ? `Page context (use to write accurate explanations):\n"""\n${pageText.slice(0, 800)}\n"""` : ''}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageMimeType, data: imageData } },
          { type: 'text', text: 'Reproduce this equation block as interactive HTML. Font size MUST be 12px. Use Unicode math, not MathJax.' },
        ],
      }],
    });

    const reply = response.content[0]?.text?.trim() || '';
    let html = reply.replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '');
    if (!html.trimStart().startsWith('<')) {
      return res.status(500).json({ error: 'Model did not return valid HTML' });
    }

    // Haiku frequently omits the <script> block — always inject the canonical one.
    // Strip any partial script the model may have included, then re-inject.
    if (!html.includes('alex-popup')) {
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      const EQ_SCRIPT = `<script>
document.addEventListener('keydown',e=>{if(e.key==='Escape')window.parent.postMessage({type:'alex-popup',title:null},'*')});
document.querySelectorAll('.sym').forEach(el=>{
  el.addEventListener('mouseenter',e=>{
    const tip=el.dataset.tip||'';
    if(tip) window.parent.postMessage({type:'alex-tooltip',text:tip,mx:e.clientX,my:e.clientY},'*');
    if(el.dataset.v)document.querySelectorAll('[data-v="'+el.dataset.v+'"]').forEach(s=>s.classList.add('hl'));
  });
  el.addEventListener('mousemove',e=>{
    window.parent.postMessage({type:'alex-tooltip-move',mx:e.clientX,my:e.clientY},'*');
  });
  el.addEventListener('mouseleave',()=>{
    window.parent.postMessage({type:'alex-tooltip',text:null},'*');
    document.querySelectorAll('.hl').forEach(s=>s.classList.remove('hl'));
  });
});
document.querySelectorAll('.eq-row').forEach(row=>{
  row.addEventListener('click',()=>{
    const title=row.dataset.title||row.querySelector('td')?.textContent?.trim()||'Equation';
    const body=row.dataset.body||'';
    window.parent.postMessage({type:'alex-popup',title,body},'*');
  });
});
<\/script>`;
      if (html.includes('</body>')) {
        html = html.replace('</body>', EQ_SCRIPT + '</body>');
      } else if (html.includes('</html>')) {
        html = html.replace('</html>', EQ_SCRIPT + '</html>');
      } else {
        html += EQ_SCRIPT;
      }
    }

    // Haiku also drops class="sym" from colored spans and class="eq-row" from <tr>.
    // Without these classes the event listeners above bind to nothing → no popups at all.
    html = html.replace(/<span([^>]*style="color:#[0-9a-fA-F]{6}"[^>]*)>/gi, (m, attrs) => {
      if (/\bsym\b/.test(attrs)) return m;
      if (/\bclass=/i.test(attrs)) return m.replace(/class="([^"]*)"/i, 'class="sym $1"');
      return `<span class="sym"${attrs}>`;
    });
    html = html.replace(/<tr([^>]*)>/gi, (m, attrs) => {
      if (/\beq-row\b/.test(attrs)) return m;
      if (/\bclass=/i.test(attrs)) return m.replace(/class="([^"]*)"/i, 'class="eq-row $1"');
      return `<tr class="eq-row"${attrs}>`;
    });

    res.json({ html });
  } catch (err) {
    console.error('[augment-equation] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/modify-figure ────────────────────────────────
// Takes an existing interactive figure HTML + a user request and returns modified HTML
app.post('/api/modify-figure', async (req, res) => {
  const { currentHtml, request, bookTitle, pageText } = req.body;
  if (!currentHtml || !request) return res.status(400).json({ error: 'currentHtml and request required' });

  const system = `You are modifying an existing interactive figure HTML document based on a user request.

Rules:
- Return ONLY the complete modified HTML document — no markdown, no explanation, no code fences
- Preserve all existing interactive features (Three.js scene, SVG structure, controls) unless the request changes them
- Make ONLY the changes the user asked for — don't refactor or redesign unrelated parts
- The output must be fully self-contained and valid HTML
- Keep background colors and overall style consistent with the original
${bookTitle ? `Context: figure is from "${bookTitle}".` : ''}
${pageText ? `Page context:\n"""\n${pageText.slice(0, 600)}\n"""` : ''}`;

  try {
    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 8192,
      system,
      messages: [{
        role: 'user',
        content: `User request: "${request}"\n\nCurrent HTML:\n${currentHtml}`,
      }],
    });

    const reply = response.content[0]?.text?.trim() || '';
    // Strip any accidental code fences
    const cleaned = reply.replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '');
    if (!cleaned.trimStart().startsWith('<')) {
      return res.status(500).json({ error: 'Model did not return valid HTML' });
    }
    res.json({ html: cleaned });
  } catch (err) {
    console.error('[modify-figure] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate-explainer ──────────────────────────
// Always generates an interactive HTML explainer for a selected passage.
// Stored in the annotation so it can be replayed in future sessions.
app.post('/api/generate-explainer', async (req, res) => {
  const { selectedText, pageText, bookTitle, currentPage } = req.body;
  if (!selectedText) return res.status(400).json({ error: 'selectedText required' });

  const system = `You are building a compact interactive HTML explainer for a specific passage a student highlighted in a textbook.

Your output is a single self-contained HTML file that will be shown in a 500px-wide chat bubble.

━━━ CONTENT GOAL ━━━
Make the core concept in the selected passage immediately intuitive through interaction.
- Identify the 1-2 key ideas in the passage
- Build ONE focused interactive element (slider, animation, toggle, or step-through) that makes those ideas tangible
- Add hover tooltips on key terms (mouseenter/mouseleave only — no persistent cards)

━━━ LAYOUT (mandatory) ━━━
- body: display:flex; flex-direction:column; height:100vh; margin:0; overflow:hidden; background:#1e1e1e; color:#e0e0e0
- #ui strip at top: flex:0 0 auto; max-height:52px; padding:6px 10px; background:#1e1e1e; display:flex; flex-wrap:wrap; gap:6px; align-items:center  (NO border, NO darker bg — must be seamless)
- #canvas-wrap fills rest: flex:1 1 0; min-height:0; position:relative
- #narration at bottom: flex:0 0 auto; height:28px; padding:0 14px; display:flex; align-items:center; font:12px system-ui; color:#888; background:#1e1e1e — update textContent on every interaction
- Controls: 12px font, compact. Axis labels: min 13px. NO borders or dividers. NO popups on load. NO floating legends blocking the chart.

━━━ STYLE ━━━
background:#1e1e1e; accent:#4a7ef5; text:#e0e0e0
Button: background:#252525; border:1px solid #3a3a3a; border-radius:4px; color:#ccc; font-size:11px; padding:3px 10px
Slider: accent-color:#4a7ef5; width:100px
${bookTitle ? `Book: "${bookTitle}", page ${currentPage || '?'}.` : ''}`;

  try {
    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 4096,
      system,
      messages: [{
        role: 'user',
        content: `Selected passage:\n"""\n${selectedText.slice(0, 600)}\n"""\n\n${pageText ? `Page context:\n"""\n${pageText.slice(0, 800)}\n"""` : ''}\n\nBuild the interactive explainer. Output ONLY the HTML — no markdown, no explanation.`,
      }],
    });

    const raw = response.content[0]?.text?.trim() || '';
    const html = raw.replace(/^```html?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    if (!html.startsWith('<')) return res.status(500).json({ error: 'Model did not return HTML' });
    res.json({ html });
  } catch (err) {
    console.error('[generate-explainer] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/embed-status', (req, res) => {
  res.json({ indexed: pdfIndexes.has(req.query.title) });
});

// ── POST /api/score-answer ────────────────────────────────
// Haiku call: scores whether a student's answer is correct, partial, or wrong.
// Returns: { verdict, gap, resolved, feedback }
app.post('/api/score-answer', async (req, res) => {
  const { question, answer, prevGap, pageText } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'question and answer required' });

  const system = `You are evaluating whether a student's answer demonstrates understanding of the concept in the question.

Respond with ONLY a JSON object — no markdown, no explanation, just the JSON:
{
  "verdict": "correct" | "partial" | "wrong",
  "gap": "one sentence: what specifically is missing or wrong (null if verdict is correct)",
  "resolved": true or false (true only if prevGap was provided and this answer clearly resolves it),
  "feedback": "one warm short sentence of encouragement or gentle redirect (max 12 words)"
}

Rules:
- "correct" = student clearly shows understanding of the core concept
- "partial" = student is on the right track but missing a key part
- "wrong" = student's answer is off-track or shows a misconception
- Be generous: if the student shows the right intuition even if imprecisely worded, score "correct"
- gap should be a concise description usable by a tutor to target follow-up (e.g. "confused about why gradient reverses sign in backpropagation")`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system,
      messages: [{
        role: 'user',
        content: `Question asked: "${question}"

Student's answer: "${answer}"
${prevGap ? `\nPrevious gap to resolve: "${prevGap}"` : ''}
${pageText ? `\nPage context:\n"""\n${pageText.slice(0, 600)}\n"""` : ''}

Evaluate the student's answer.`,
      }],
    });

    const raw = response.content[0]?.text?.trim() || '';
    // Strip code fences if model wraps it
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const result = JSON.parse(jsonStr);
    res.json(result);
  } catch (err) {
    console.error('[score-answer] error:', err.message);
    // On parse/API error return a neutral result so frontend doesn't break
    res.json({ verdict: 'partial', gap: null, resolved: false, feedback: 'Good effort — keep going!' });
  }
});

/* ──────────────────────────────────────────────────────────────────────
 * LESSON-ENGINE INTEGRATION
 *
 * Serves the compiled lesson plans, figure assets, chapter index, and a
 * persistent student model from disk. Mounted under /api/lessons/* and
 * /lesson-assets/* — the existing chat endpoints above are untouched.
 *
 * Source of truth on disk:
 *   chapter_graphs/ch01.json … ch55.json   — concept nodes + edges
 *   active-reader-demo/lesson_plans/*.json — compiled state-machine plans
 *   active-reader-demo/assets/figures/     — figure HTML + static images
 *   active-reader-demo/figures_index.json  — figure index
 *
 * ────────────────────────────────────────────────────────────────────── */
const path = require('path');
const fs   = require('fs');
const fsp  = require('fs/promises');

const REPO_ROOT          = path.resolve(__dirname, '../../');                  // /Users/su/Documents/su/alex
const DEMO_DIR           = path.join(REPO_ROOT, 'active-reader-demo');
const CHAPTER_GRAPHS_DIR = path.join(REPO_ROOT, 'chapter_graphs');
const PLANS_DIR          = path.join(DEMO_DIR, 'lesson_plans');
const ASSETS_DIR         = path.join(DEMO_DIR, 'assets');
const STUDENT_MODEL_DIR  = path.join(__dirname, 'student_model');
const FIGURES_INDEX_FILE = path.join(DEMO_DIR, 'figures_index.json');

if (!fs.existsSync(STUDENT_MODEL_DIR)) fs.mkdirSync(STUDENT_MODEL_DIR, { recursive: true });

// Static mount for figure assets used by VISUAL/HINT lesson states
app.use('/lesson-assets', express.static(ASSETS_DIR, { maxAge: '1h' }));

// Static mount for QMD-relative figures + a sibling endpoint to fetch the
// raw QMD source. Both rooted at the repo root because the QMD figure
// links look like "figures/imaging/brdf.png" relative to the book root.
app.use('/qmd-assets', express.static(REPO_ROOT, {
  maxAge: '1h',
  setHeaders: (res) => res.set('Access-Control-Allow-Origin', '*'),
}));

app.get('/api/qmd/source', async (req, res) => {
  try {
    const name = String(req.query.name || '');
    if (!/^[a-z0-9_\-]+\.(qmd|md)$/i.test(name)) return res.status(400).json({ error: 'bad name' });
    const p = path.join(REPO_ROOT, name);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
    res.json({ name, text: await fsp.readFile(p, 'utf8') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Caches — chapter graphs and plan files are static on disk
const _chapterCache = new Map();
const _planCache    = new Map();
let   _figuresIndex = null;

async function loadChapter(n) {
  if (_chapterCache.has(n)) return _chapterCache.get(n);
  const filename = `ch${String(n).padStart(2, '0')}.json`;
  const p = path.join(CHAPTER_GRAPHS_DIR, filename);
  const raw = await fsp.readFile(p, 'utf8');
  const data = JSON.parse(raw);
  _chapterCache.set(n, data);
  return data;
}

async function listChapters() {
  const out = [];
  const dirents = await fsp.readdir(CHAPTER_GRAPHS_DIR);
  const matches = dirents.filter(f => /^ch\d{2}\.json$/.test(f)).sort();
  // Set of concept ids that have a compiled plan
  let compiledIds = new Set();
  try {
    const planFiles = (await fsp.readdir(PLANS_DIR)).filter(f => f.endsWith('.json'));
    compiledIds = new Set(planFiles.map(f => f.replace(/\.json$/, '')));
  } catch { /* no plans dir yet */ }
  for (const f of matches) {
    const n = parseInt(f.match(/^ch(\d{2})\.json$/)[1], 10);
    try {
      const ch = await loadChapter(n);
      const conceptIds = (ch.concepts || []).map(c => c.id);
      const matched = conceptIds.filter(id => compiledIds.has(id));
      // Title resolution: top-level `chapterTitle`, else first concept's
      // `position.chapter_title`, else just "Ch N". Display as "Ch N. Title".
      const rawTitle = ch.chapterTitle
                    || ch.meta?.title
                    || (ch.concepts?.[0]?.position?.chapter_title)
                    || '';
      // The raw title may already include "Ch N. " — strip it so we can
      // re-emit a consistent format.
      const bareTitle = rawTitle.replace(/^ch\s*\d+\.\s*/i, '').trim();
      const title = bareTitle ? `Ch ${n}. ${bareTitle}` : `Ch ${n}`;
      out.push({
        chapter: n,
        slug: `ch${String(n).padStart(2, '0')}`,
        title,
        concept_count: conceptIds.length,
        has_plans: matched.length > 0,
        compiled_concepts: matched.length,
      });
    } catch (e) {
      console.warn(`[lessons] failed to load ${f}:`, e.message);
    }
  }
  return out;
}

async function loadFiguresIndex() {
  if (_figuresIndex) return _figuresIndex;
  try {
    _figuresIndex = JSON.parse(await fsp.readFile(FIGURES_INDEX_FILE, 'utf8'));
  } catch (e) {
    console.warn('[lessons] figures_index.json missing:', e.message);
    _figuresIndex = { figures: [], by_concept: {} };
  }
  return _figuresIndex;
}

app.get('/api/lessons/chapters', async (_req, res) => {
  try { res.json(await listChapters()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/lessons/chapter/:n', async (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (!Number.isFinite(n)) return res.status(400).json({ error: 'bad chapter' });
  try {
    const ch = await loadChapter(n);
    const figuresIndex = await loadFiguresIndex();
    const figByConcept = figuresIndex.by_concept || {};

    let planIds = new Set();
    try {
      const planFiles = (await fsp.readdir(PLANS_DIR)).filter(f => f.endsWith('.json'));
      planIds = new Set(planFiles.map(f => f.replace(/\.json$/, '')));
    } catch {}

    const concepts = (ch.concepts || [])
      .filter(c => planIds.has(c.id))
      .map(c => ({
        id: c.id,
        title: c.title,
        kind: c.kind,
        one_liner: c.one_liner || '',
        content: c.content || '',
        key_passage: c.key_passage || null,
        example: c.example || null,
        plan_file: `lesson_plans/${c.id}.json`,
        position: c.position || {},
        section: c.position?.section || null,
        figure_count: (figByConcept[c.id] || []).length,
      }));
    const rawTitle = ch.chapterTitle
                  || ch.meta?.title
                  || (ch.concepts?.[0]?.position?.chapter_title)
                  || '';
    const bareTitle = rawTitle.replace(/^ch\s*\d+\.\s*/i, '').trim();
    res.json({
      chapter: n,
      chapter_title: bareTitle ? `Ch ${n}. ${bareTitle}` : `Ch ${n}`,
      concept_count: concepts.length,
      figures_index_size: (figuresIndex.figures || []).length,
      concepts,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/lessons/plan/:conceptId', async (req, res) => {
  const id = req.params.conceptId;
  if (!/^[a-z0-9_]+$/i.test(id)) return res.status(400).json({ error: 'bad id' });
  if (_planCache.has(id)) return res.json(_planCache.get(id));
  try {
    const p = path.join(PLANS_DIR, `${id}.json`);
    const raw = await fsp.readFile(p, 'utf8');
    const plan = JSON.parse(raw);
    _planCache.set(id, plan);
    res.json(plan);
  } catch (e) {
    res.status(404).json({ error: `plan not found: ${id}` });
  }
});

app.get('/api/lessons/figures', async (_req, res) => {
  try { res.json(await loadFiguresIndex()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Student model: event-sourced JSONL on disk, aggregated on read ───
function safeUserFile(userId) {
  const safe = String(userId || 'anon').replace(/[^a-z0-9_\-]/gi, '_').slice(0, 60) || 'anon';
  return path.join(STUDENT_MODEL_DIR, `${safe}.jsonl`);
}

app.post('/api/lessons/event', async (req, res) => {
  try {
    const { user_id, concept_id, event, payload } = req.body || {};
    if (!event) return res.status(400).json({ error: 'event required' });
    const row = { ts: new Date().toISOString(), user_id: user_id || 'anon',
                  concept_id: concept_id || null, event, payload: payload || null };
    await fsp.appendFile(safeUserFile(user_id), JSON.stringify(row) + '\n');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/lessons/student-model', async (req, res) => {
  try {
    const userId = req.query.user_id || 'anon';
    const fp = safeUserFile(userId);
    if (!fs.existsSync(fp)) return res.json({ user_id: userId, per_concept: {}, events: 0 });
    const raw = await fsp.readFile(fp, 'utf8');
    const rows = raw.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const per = {};
    for (const r of rows) {
      const id = r.concept_id || '_';
      const slot = per[id] = per[id] || {
        attempts: 0, passes: 0, fails: 0, hints: 0, interrupts: 0,
        last_event: null, completed: false,
      };
      if (r.event === 'lesson_started')   slot.attempts++;
      if (r.event === 'gate_pass')        slot.passes++;
      if (r.event === 'gate_fail')        slot.fails++;
      if (r.event === 'hint_shown')       slot.hints++;
      if (r.event === 'lesson_complete')  slot.completed = true;
      if (r.event === 'interrupt')        slot.interrupts++;
      slot.last_event = r.event;
    }
    res.json({ user_id: userId, per_concept: per, events: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Interrupt answer: LLM grounded in the active concept ─────────────
app.post('/api/lessons/answer-question', async (req, res) => {
  try {
    const { question, concept, state, history } = req.body || {};
    if (!question) return res.status(400).json({ error: 'question required' });

    const groundingBits = [];
    if (concept?.title)        groundingBits.push(`Concept: ${concept.title}`);
    if (concept?.one_liner)    groundingBits.push(`One-liner: ${concept.one_liner}`);
    if (concept?.content)      groundingBits.push(`Content:\n${concept.content.slice(0, 1500)}`);
    if (concept?.key_passage)  groundingBits.push(`Key passage: "${concept.key_passage.quote || ''}" (§${concept.key_passage.section || '?'})`);
    if (state?.kind)           groundingBits.push(`Student is currently in lesson state: ${state.kind}`);
    const grounding = groundingBits.join('\n\n');

    const systemPrompt = `You are a focused tutor answering a student's clarifying question DURING a structured lesson. Your reply should:
- Stay tightly grounded in the concept currently being taught (do not drift)
- Be short (≤4 sentences) so the lesson can resume quickly
- Use plain language; one concrete example if it helps
- Do NOT include any markdown code blocks unless absolutely necessary

${grounding}`.trim();

    const recent = Array.isArray(history) ? history.slice(-6) : [];
    const userBody = `Student question: ${question}`;
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      system: systemPrompt,
      messages: [...recent.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: userBody }],
    });
    const reply = response.content[0]?.text?.trim() || '(no reply)';
    res.json({ reply });
  } catch (e) {
    console.error('[answer-question] error:', e.message);
    res.status(500).json({ error: e.message, reply: 'Sorry — I had trouble answering that. Try rephrasing?' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Lesson plans dir: ${PLANS_DIR}`);
  console.log(`Lesson assets dir: ${ASSETS_DIR}`);
});
