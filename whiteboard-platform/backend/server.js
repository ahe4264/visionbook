require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all origins (local dev)
}));
app.use(express.json({ limit: '10mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OpenAI = require('openai');
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
  const { messages, bookTitle, currentPage, pageText, readingSection, tutorMode, isTutorCheckin, outlineContext } = req.body;

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

  const tutorInstructions = tutorMode ? `\n\nTUTOR MODE — STRICT SOCRATIC METHOD.${outlineSection}

${isTutorCheckin
  ? `The user has been reading for a while. Ask ONE short question about what they're reading.
Hook + question only. Max 20 words total. No explanation. No [HIGHLIGHT] or [GOTO] tags.
70% open: "Here's a thought — why would adding more hidden units not always help?"
30% MC: "Quick one — what does ReLU output for negative inputs? A) 0  B) the input  C) −1"
Output ONLY the question. Nothing else.`
  : `━━━ RULES (non-negotiable) ━━━
1. NEVER give direct answers or explanations unprompted. Guide — don't teach.
2. MAX RESPONSE: 2 short sentences + 1 question. No bullet-point lectures. No walls of text.
3. When user asks about a concept:
   • If it's in the current page text → ask what they think it means. Use [HIGHLIGHT:"verbatim phrase"] ONLY when pointing them to read a specific passage (not on every reply).
   • If it's on a different page → [GOTO:N] to take them there, optionally [HIGHLIGHT:"phrase"] on that page.
   • If they're stuck after 2 exchanges → give ONE sentence hint, then ask them to complete the thought.
   • Do NOT emit [HIGHLIGHT] on every response — only when explicitly directing them to read something.
4. Never apologize for page content or re-summarize the page. React only to what the user said.
5. Offer a visualization ONLY if the user explicitly asks for one.
6. CROSS-PAGE: Use the book outline above to find the right page number for [GOTO:N].

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

When asked to create a 3D visualization from a figure image, your goal is NOT just to replicate the figure in 3D — it is to build an **interactive learning tool** around it. Think: what would help someone deeply understand the concept this figure illustrates?

Interactive learning features to include (pick what fits the concept):
- **Sliders or buttons** that animate or morph the scene — e.g. change a parameter and watch the shape/behavior update in real time
- **Clickable parts** that highlight and show a tooltip/label explaining that component
- **Step-through mode** — a "Next" button that walks through stages of a process (e.g. forward pass, each layer activating)
- **Toggle views** — e.g. show/hide connections, switch between "normal network" vs "residual network"
- **Animated flows** — particles or arrows flowing along paths to show data movement, gradient flow, etc.
- **Hover tooltips** using CSS2DObjects that appear on mouseover with a one-line explanation

UI controls: render HTML buttons/sliders as DOM overlays (position:absolute over the canvas), styled dark: background #252525, color #e0e0e0, border 1px solid #3a3a3a, border-radius 5px.

Critical rendering rules:
- Text labels: use CSS2DRenderer for crisp HTML labels (import CSS2DRenderer and CSS2DObject from three/addons/renderers/CSS2DRenderer.js). Style label divs with color:#ffffff, font-weight:600, font-size:13px, background:rgba(0,0,0,0.7), padding:2px 6px, border-radius:3px. CRITICAL: create each CSS2DObject ONCE during scene init and attach it to its mesh — NEVER create or add CSS2DObjects inside the animation loop. To update label text, mutate the existing div's textContent.
- Materials: always fully opaque (opacity:1, transparent:false) unless transparency is intentional. Use MeshStandardMaterial or MeshPhongMaterial.
- Lighting: AmbientLight (intensity 1.5) + DirectionalLight (intensity 2).
- renderer.setClearColor(0x1e1e1e, 1).
- Panels/planes: MeshBasicMaterial with solid color 0x2a2a2a, fully opaque.

Structure:
\`\`\`html
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1e1e1e; overflow: hidden; width: 100vw; height: 100vh; }
  .label { color: #fff; font: 600 13px/1 sans-serif; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 3px; pointer-events: none; }
  #ui { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 8px; z-index: 10; }
  #ui button, #ui label { background: #252525; color: #e0e0e0; border: 1px solid #3a3a3a; border-radius: 5px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
  #ui button:hover { background: #333; border-color: #4a7ef5; color: #fff; }
  #ui input[type=range] { accent-color: #4a7ef5; width: 120px; }
</style>
</head>
<body>
<div id="ui"><!-- buttons/sliders here --></div>
<script type="importmap">
{"imports": {"three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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

app.get('/api/embed-status', (req, res) => {
  res.json({ indexed: pdfIndexes.has(req.query.title) });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
