/**
 * generation-2d.js — generates inline-interactive HTML figures
 *
 * 2D figures  → scaffold-based: LLM fills marker slots in base_scene_2d.html
 * 3D/mixed    → legacy full-HTML path (Three.js ESM requires type="module")
 *
 * Library routing (2D scaffold path):
 *   flow_chart                          → Mermaid DSL
 *   scatter_plot|line_plot|bar_chart|
 *     contour_plot|multi_panel          → Chart.js
 *   everything else                    → SVG.js
 */

const fs = require('fs');
const path = require('path');
const { generateWithModel } = require('./models');

// ── Scaffold constants ────────────────────────────────────────────────────────
const SCAFFOLD_2D_PATH = path.join(__dirname, 'base_scene_2d.html');
const UI_BEGIN_MARKER = '<!-- @FIGURE_UI_BEGIN -->';
const UI_END_MARKER = '<!-- @FIGURE_UI_END -->';
const CODE_BEGIN_MARKER = '// @FIGURE_CODE_BEGIN';
const CODE_END_MARKER = '// @FIGURE_CODE_END';

let _scaffold2d = null;
function getScaffold2d() {
  if (!_scaffold2d) _scaffold2d = fs.readFileSync(SCAFFOLD_2D_PATH, 'utf-8');
  return _scaffold2d;
}

// ── Scaffold utilities ────────────────────────────────────────────────────────
function _escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractPayloadFromText(text) {
  if (!text) return null;
  const str = String(text);
  const uiRe = new RegExp(
    `${_escapeRegExp(UI_BEGIN_MARKER)}([\\s\\S]*?)${_escapeRegExp(UI_END_MARKER)}`, 'm'
  );
  const codeRe = new RegExp(
    `${_escapeRegExp(CODE_BEGIN_MARKER)}([\\s\\S]*?)${_escapeRegExp(CODE_END_MARKER)}`, 'm'
  );
  const uiMatch = str.match(uiRe);
  const codeMatch = str.match(codeRe);
  if (!uiMatch && !codeMatch) return null;
  return {
    uiHtml: uiMatch ? uiMatch[1].trim() : '',
    codeJs: codeMatch ? codeMatch[1].trim() : '',
  };
}

function mergePayloadIntoScaffold(scaffold, { uiHtml = '', codeJs = '' } = {}) {
  const replaceBlock = (src, begin, end, body) => {
    const re = new RegExp(
      `(${_escapeRegExp(begin)})([\\s\\S]*?)(${_escapeRegExp(end)})`, 'm'
    );
    if (!re.test(src)) throw new Error(`Missing scaffold marker: ${begin}`);
    const middle = body.trim() ? `\n${body.trim()}\n` : '\n';
    return src.replace(re, `$1${middle}$3`);
  };
  let out = replaceBlock(scaffold, UI_BEGIN_MARKER, UI_END_MARKER, uiHtml);
  out = replaceBlock(out, CODE_BEGIN_MARKER, CODE_END_MARKER, codeJs);
  return out;
}

// ── Library routing ───────────────────────────────────────────────────────────
function getLibraryForFigureType(figureType, renderingMode) {
  switch ((figureType || '').toLowerCase()) {
    case 'flow_chart':
      return 'mermaid';
    case 'scatter_plot':
    case 'line_plot':
    case 'bar_chart':
    case 'contour_plot':
    case 'multi_panel':
      return 'chartjs';
    default:
      return 'svgjs';
  }
}

// ── System prompt builder ─────────────────────────────────────────────────────
function buildSystem2dPrompt(scaffold, library) {
  const libSection = {
    svgjs:   `SVG.js v3 (global: SVG). var draw=SVG().addTo(document.getElementById('container')).size('100%','100%'); var W=600,H=Math.round(W*(3/4)); draw.viewbox(0,0,W,H). font-size in user units (no px). Hover: el.on('mousemove',e=>showTooltip('label',e)).on('mouseleave',()=>hideTooltip()).on('click',()=>showPopup('Title','body')); el.css('cursor','pointer'). window.__markRendered() synchronously at end.`,
    chartjs: `Chart.js v4 (global: Chart). Append <canvas style="width:100%;height:100%;display:block"> to #container; options:{responsive:true,maintainAspectRatio:false}. window.__markRendered() immediately after new Chart().`,
    mermaid: `Mermaid v11 (global: mermaid). Append div.mermaid to #container. mermaid.initialize({startOnLoad:false}); mermaid.run({nodes:[div]}).then(function(){ window.__markRendered(); /* style svg, add listeners */ }); — __markRendered() MUST be inside .then().`,
  }[library] || `SVG.js v3 — see svgjs above.`;

  return `You are building an educational interactive figure for a textbook. The goal is a guided demo that helps students understand the concept — not just a static reconstruction.

OUTPUT: respond with ONLY these two marker-wrapped sections (include both even if empty):
  <!-- @FIGURE_UI_BEGIN --> ... <!-- @FIGURE_UI_END -->   ← HTML for #ui; no block-level tags
  // @FIGURE_CODE_BEGIN ... // @FIGURE_CODE_END           ← JS only; no <script>, no imports

SCAFFOLD (do not reproduce — backend injects your output at the markers):
${scaffold}

GLOBALS (do not re-declare): showPopup(title,body), showTooltip(text,event), hideTooltip(), #container (mount target), window.__markRendered() (call once when drawn), 'fig-resize' CustomEvent on document

LIBRARY: ${libSection}

VISUAL FIDELITY: the default state must be a faithful inline replacement for the source image.
- Color scheme: match every color exactly — axis lines, data series, fills, backgrounds
- Layout & proportions: same relative element positions, same axis ranges, same tick marks and gridlines
- Data shape: match curve trajectories, bar heights, scatter clusters, or node/edge layout — approximate magnitudes, not invented
- Labels & annotations: every label visible in the original must appear at the same position; use blueprint.reconstructionNotes for text and color coding
- Line styles: dashed vs solid, stroke weights, arrowhead presence — copy from the image
- The step-0 (default) state should look indistinguishable from the original at a glance — a student replacing a static figure with this widget should see the same image they expect
- No title bar or toolbar visible by default

HOVER/CLICK (on user action only): hover → showTooltip(label,event)/hideTooltip(); cursor:pointer on interactive elements. Click → showPopup('Title','2–3 sentence explanation'). Animation: fill/opacity transitions only; no scale/translate/bounce.

CONTROLS (blueprint.interactions — render in UI section; add id="{id}Input" to every input):
  slider → <label>{label}: <output id="{id}Val">{default}</output><input id="{id}Input" type="range" min="{min}" max="{max}" step="{step}" value="{default}" oninput="document.getElementById('{id}Val').value=this.value;update_{id}(+this.value)"></label>  +  function update_{id}(v){ /* implement blueprint.interactions[].effect */ }
  toggle → <label><input id="{id}Input" type="checkbox" onchange="toggle_{id}(this.checked)"> {label}</label>  +  function toggle_{id}(on){}
  button → <button onclick="trigger_{id}()">{label}</button>  +  function trigger_{id}(){}
Each control's handler must implement the visual change described in blueprint.interactions[].effect and teach the concept in blueprint.interactions[].teaches.

GUIDED DEMO (blueprint.demo_steps — this is the core educational feature):
The scaffold already provides a top-of-screen narration banner. Do NOT add nav or narration to the UI section.
Scaffold elements (pre-existing — do not create them): #demoPanel, #demoPanelTitle, #demoPanelStep, #demoPanelText, and ◀/▶ buttons wired to demoPrev()/demoNext().

In code:
1. Inline _demoSteps array from blueprint.demo_steps. Each step has {title, narration, control_values, focus}.
2. Show the panel: document.getElementById('demoPanel').style.display = 'block';
3. _applyDemoStep(i): (a) sync all controls to s.control_values, (b) set #demoPanelTitle.textContent = s.title, (c) set #demoPanelStep.textContent = (i+1)+' / '+_demoSteps.length, (d) set #demoPanelText.textContent = s.narration + (s.focus ? '  ' + s.focus : ''), (e) redraw/update the figure to match the new control state.
4. demoNext/demoPrev wrap with modulo.
5. Call _applyDemoStep(0) on load.

Do NOT call showPopup from _applyDemoStep — the top panel is the explainer; popups are for hover/click only.`;
}

// ── User message builder ──────────────────────────────────────────────────────
function buildUser2dMessage(plan, library, userText) {
  if (userText) return userText;
  const libName = { svgjs: 'SVG.js', chartjs: 'Chart.js', mermaid: 'Mermaid' }[library] || 'SVG.js';

  let blueprintSection = '';
  if (plan) {
    const highlights = [
      plan.concept     ? `CONCEPT: ${plan.concept}` : null,
      plan.keyInsight  ? `KEY INSIGHT (what students should walk away understanding): ${plan.keyInsight}` : null,
      plan.learningObjectives?.length
        ? `LEARNING OBJECTIVES:\n${plan.learningObjectives.map(o => `  - ${o}`).join('\n')}` : null,
    ].filter(Boolean).join('\n');

    blueprintSection = (highlights ? `\n\n${highlights}` : '') +
      `\n\nFULL BLUEPRINT:\n${JSON.stringify(plan, null, 2)}`;
  }

  return `Build an educational guided demo of this figure using ${libName}.

FAITHFULNESS FIRST: the default state (step 0, no interaction yet) must be a pixel-accurate inline replacement for the source image — same colors, same data shape, same labels, same proportions. A student who sees the static figure in the textbook should recognize it immediately.

THEN EDUCATE: the demo_steps in the blueprint define a pedagogical arc — implement them faithfully so a student navigating ◀/▶ discovers the concept step by step. Each step's narration and focus field tell you exactly what the student should be seeing and thinking at that moment.${blueprintSection}`;
}

// ── Strip markdown fences ─────────────────────────────────────────────────────
function stripFences(text) {
  const m = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```\s*$/m);
  if (m) return m[1].trim();
  return text
    .replace(/^```[a-zA-Z]*\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();
}

// ── Legacy 3D path (full-HTML output) ────────────────────────────────────────
const SYSTEM_2D = `You are building an interactive SVG figure as a complete self-contained HTML file for a PDF textbook page.

OUTPUT: respond with ONLY a complete HTML file — <!DOCTYPE html> … </html>. No explanation, no markdown, no truncation. Do not embed the image.

FIDELITY: first frame = drop-in for source image.
- html,body: margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#fff
- SVG: <svg width="100%" height="100%" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet"> where W=600, H=Math.round(600/aspectRatio); never invent these numbers
- Positions as fractions: cx=fx*W, cy=fy*H — read fractions from the image, not hardcoded pixels
- font-size in SVG user units (no px suffix): <text font-size="11"> ✓   <text font-size="11px"> ✗
- Use blueprint elementSizes (strokeWidth, fontSize) directly; edge count and arrowhead directions must match exactly
- No title, toolbar, or description text visible by default

INTERACTIONS (reveal on user action only):
- Hover: stroke/opacity shift only; fixed tooltip div near cursor (position:fixed;background:rgba(0,0,0,.55);color:#fff;font:11px sans-serif;padding:3px 8px;border-radius:4px;pointer-events:none)
- Click: window.parent.postMessage({type:'alex-popup',title,body},'*') — 2–3 sentence explanation; no inline popup div; Escape dismisses
- Animation: fill transitions only (#c8e0ff/#c8f0c8); only animate if the figure shows a process or sequence; no scale/translate/bounce`;

// ── Legacy 3D generation (full-HTML output) ───────────────────────────────────
async function _generate2dFigureHtmlLegacy({ modelId, base64, mediaType, plan, userText, maxTokens = 16000 }) {
  const renderingMode = plan?.renderingMode || 'auto';

  let renderingHint = '';
  if (renderingMode === '3d') {
    const cam = plan?.cameraAnalysis || '';
    renderingHint = `\nRENDERING MODE: 3D — use Three.js(see THREE.JS SECTION above).${cam ? '\nCAMERA HINT: ' + cam : ''} `;
  } else if (renderingMode === 'mixed') {
    const panels3d = (plan?.panels || []).filter(p => p.renderingMode === '3d');
    renderingHint = `\nRENDERING MODE: Mixed — panels ${panels3d.map(p => p.id).join(',')} need Three.js canvas; others use SVG.` +
      panels3d.filter(p => p.cameraAnalysis).map(p => `\nPanel ${p.id} camera: ${p.cameraAnalysis} `).join('');
  } else if (renderingMode === '2d') {
    renderingHint = '\nRENDERING MODE: 2D — use inline SVG. Do NOT use Three.js.';
  }

  const aspectRatio = plan?.aspectRatio;
  const H_from_ar = aspectRatio ? Math.round(600 / aspectRatio) : null;
  const nodeR = plan?.elementSizes?.nodeRadiusFraction
    ? Math.round(plan.elementSizes.nodeRadiusFraction * 600) : null;
  const strokeW = plan?.elementSizes?.strokeWidth || null;
  const fontSize = plan?.elementSizes?.fontSize || null;
  const arrSize = plan?.elementSizes?.arrowheadSize || null;

  const geometryConstraints = (aspectRatio || nodeR)
    ? `\nGEOMETRY CONSTRAINTS(from blueprint measurements — use these exact values): ` +
    (H_from_ar ? `\n  viewBox = "0 0 600 ${H_from_ar}"  ← from aspectRatio = ${aspectRatio} ` : '') +
    (nodeR ? `\n  nodeRadius = ${nodeR} px  ← from nodeRadiusFraction = ${plan.elementSizes.nodeRadiusFraction} ` : '') +
    (strokeW ? `\n  strokeWidth = ${strokeW} ` : '') +
    (fontSize ? `\n  fontSize = ${fontSize} px` : '') +
    (arrSize ? `\n  arrowheadSize = ${arrSize} ` : '')
    : '';

  const planSection = plan
    ? `\n\nFIGURE BLUEPRINT: \n${JSON.stringify(plan, null, 2)}${renderingHint}${geometryConstraints} `
    : renderingHint;

  const has3d = renderingMode === '3d' || renderingMode === 'mixed' ||
    plan?.panels?.some(p => p.renderingMode === '3d');
  const threeSection = has3d ? THREEJS_BOILERPLATE : '';

  const message = userText
    ? `${userText}${planSection}${threeSection} `
    : `Reconstruct this figure as an interactive HTML page.${planSection}${threeSection}

STEP 1 — Build the SVG geometry using the viewBox and element sizes from GEOMETRY CONSTRAINTS above.Every node, every edge, every arrowhead, exact angles.
  STEP 2 — Add hover tooltips, click postMessage popup, and signal - flow animation on top.
No title, no description, no buttons by default. Do NOT embed the image.`;

  const userContent = [
    { type: 'image_url', image_url: { url: `data:${mediaType}; base64, ${base64} ` } },
    { type: 'text', text: message },
  ];

  let html = await generateWithModel(modelId, {
    systemPrompt: SYSTEM_2D,
    userContent,
    maxTokens,
  });

  const fenced = html.match(/```(?: html) ?\s * ([\s\S] *?)```/i);
  if (fenced) html = fenced[1].trim();
  html = html
    .replace(/^```html\s */i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  return html;
}

// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * Generate a figure-faithful interactive HTML page.
 */
async function generate2dFigureHtml({ modelId, base64, mediaType, plan, userText, maxTokens = 16000 }) {
  if (!modelId) throw new Error('modelId is required.');
  if (!base64 || !mediaType) throw new Error('base64 and mediaType are required.');

  const renderingMode = plan?.renderingMode || 'auto';
  const has3d = renderingMode === '3d' || renderingMode === 'mixed' ||
    (plan?.panels || []).some(p => p.renderingMode === '3d');

  // 3D fallback: Three.js ESM requires type="module" which can't run in the
  // regular <script> block of the 2D scaffold, so keep the full-HTML path.
  if (has3d) {
    return _generate2dFigureHtmlLegacy({ modelId, base64, mediaType, plan, userText, maxTokens });
  }

  // 2D scaffold path
  const scaffold = getScaffold2d();
  const library = getLibraryForFigureType(plan?.figureType, renderingMode);
  const systemPrompt = buildSystem2dPrompt(scaffold, library);
  const message = buildUser2dMessage(plan, library, userText);

  const userContent = [
    { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
    { type: 'text', text: message },
  ];

  let out = await generateWithModel(modelId, { systemPrompt, userContent, maxTokens });
  out = stripFences(out);

  const payload = extractPayloadFromText(out);
  if (!payload) {
    console.warn('[generate-2d] Could not extract payload from model response. Raw:', out.slice(0, 300));
    return scaffold;
  }

  return mergePayloadIntoScaffold(scaffold, payload);
}

module.exports = { generate2dFigureHtml };
