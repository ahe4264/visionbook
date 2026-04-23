require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '10mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/api/chat', async (req, res) => {
  const { messages, bookTitle, currentPage, pageText, readingSection, tutorMode, isTutorCheckin } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const hasImage = messages.some(m => m.imageData);

  const sectionCtx = readingSection
    ? `\n\nSection the user is reading:\n"""\n${readingSection.slice(0, 500)}\n"""`
    : '';

  const pageContext = currentPage
    ? `\n\nPage ${currentPage}${bookTitle ? ` of "${bookTitle}"` : ''}.${pageText ? `\n\nPage text:\n"""\n${pageText.slice(0, 2000)}\n"""` : ''}${sectionCtx}`
    : '';

  const tutorInstructions = tutorMode ? `\n\nTUTOR MODE ON.
${isTutorCheckin
  ? `The user has been reading the section above for 10+ seconds. Ask them ONE question about it.
RULES: Output ONLY the question — no intro, no "Here's a question:", no preamble. Max 15 words. Make it specific to the section content.
Good example: "Why do we square the differences instead of just summing them?"
Bad example: "Great, you've been reading about loss functions! Here's my question for you: Why do we..."
`
  : `React to their answer in 1–2 sentences max: quick feedback + one short follow-up question.
If confused, offer a visualization. Stay Socratic — no lectures.`}` : '';

  // For tutor check-ins: use a minimal system to avoid verbose responses
  const system = isTutorCheckin
    ? `You are a Socratic tutor. ${pageContext}${tutorInstructions}`
    : `You are an engaging tutor helping the user understand a PDF${bookTitle ? ` titled "${bookTitle}"` : ''}. When the user quotes text (prefixed with >), use it as context for their question.${pageContext}${tutorInstructions}

Respond in a way that feels alive and interactive:
- **Default to including a visualization** whenever it would help — diagrams for processes, interactive demos for math/physics concepts, animated flows for algorithms. Err on the side of building one rather than skipping it.
- After your explanation, **ask the user one short follow-up question** to check understanding or deepen engagement (e.g. "Does that click? What part feels fuzzy?" or a quick conceptual question for them to answer).
- Keep prose tight — no walls of text. Use headers, bold key terms, short bullet points.

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
- Text labels: use CSS2DRenderer for crisp HTML labels (import CSS2DRenderer and CSS2DObject from three/addons/renderers/CSS2DRenderer.js). Style label divs with color:#ffffff, font-weight:600, font-size:13px, background:rgba(0,0,0,0.7), padding:2px 6px, border-radius:3px.
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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
