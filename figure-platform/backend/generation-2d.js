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
const { mergePayloadIntoScaffold, extractPayloadFromText } = require('./generation');

// ── Scaffold ──────────────────────────────────────────────────────────────────
const SCAFFOLD_2D_PATH = path.join(__dirname, 'base_scene_2d.html');

let _scaffold2d = null;
function getScaffold2d() {
  if (!_scaffold2d) _scaffold2d = fs.readFileSync(SCAFFOLD_2D_PATH, 'utf-8');
  return _scaffold2d;
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
    svgjs: `SVG.js v3 (global: SVG). var draw=SVG().addTo(document.getElementById('container')).size('100%','100%'); var W=600,H=Math.round(W*(3/4)); draw.viewbox(0,0,W,H). font-size in user units (no px). Hover: el.on('mousemove',e=>showTooltip('label',e)).on('mouseleave',()=>hideTooltip()).on('click',()=>showPopup('Title','body')); el.css('cursor','pointer'). window.__markRendered() synchronously at end.`,
    chartjs: `Chart.js v4 (global: Chart). Append <canvas style="width:100%;height:100%;display:block"> to #container; options:{responsive:true,maintainAspectRatio:false}. window.__markRendered() immediately after new Chart().`,
    mermaid: `Mermaid v11 (global: mermaid). Append div.mermaid to #container. mermaid.initialize({startOnLoad:false}); mermaid.run({nodes:[div]}).then(function(){ window.__markRendered(); /* style svg, add listeners */ }); — __markRendered() MUST be inside .then().`,
  }[library] || `SVG.js v3 — see svgjs above.`;

  return `You are building an educational interactive figure for a textbook. The goal is a guided demo that helps students understand the concept — not just a static reconstruction.

OUTPUT: respond with ONLY these two marker-wrapped sections (include both even if empty):
  <!-- @FIGURE_UI_BEGIN --> ... <!-- @FIGURE_UI_END -->   ← HTML for #ui; no block-level tags
  // @FIGURE_CODE_BEGIN ... // @FIGURE_CODE_END           ← JS only; no <script>, no imports

SCAFFOLD (do not reproduce — backend injects your output at the markers):
${scaffold}

GLOBALS (do not re-declare): showPopup(title,body), showTooltip(text,event), hideTooltip(), #container (mount target), window.__markRendered() (call once when drawn), 'fig-resize' CustomEvent on document.

LIBRARY: ${libSection}

VISUAL FIDELITY: the default state must be a faithful inline replacement for the source image.
- Color scheme: match every color exactly — axis lines, data series, fills, backgrounds
- Layout & proportions: same relative element positions, same axis ranges, same tick marks and gridlines
- Data shape: match curve trajectories, bar heights, scatter clusters, or node/edge layout — approximate magnitudes, not invented
- Labels & annotations: every label visible in the original must appear at the same position; use blueprint.reconstructionNotes for text and color coding
- Line styles: dashed vs solid, stroke weights, arrowhead presence — copy from the image
- The step-0 (default) state should look indistinguishable from the original at a glance — a student replacing a static figure with this widget should see the same image they expect
- No title bar or toolbar visible by default

TEXT PLACEMENT & READABILITY: faithful labels must still be readable.
- Treat every label, tick label, annotation, formula, and legend item as a collision-checked object with a real text box.
- Before finalizing, check each text box against lines, arrows, curves, points, nodes, tick marks, gridlines, controls, and other text. Text must not sit on top of strokes or dense marks.
- If the source label is visually anchored to a busy line/arrow/node, keep the semantic anchor but move the text to the nearest open whitespace and connect it with a short leader line, pointer, or subtle dot if needed.
- Draw text and label backgrounds after geometry so labels are on top. For labels over busy regions, add a small white or translucent background rectangle, or use SVG paint-order/stroke halo: text.attr({ 'paint-order':'stroke', stroke:'#fff', 'stroke-width':3, 'stroke-linejoin':'round' }).
- Do not add extra visible explanatory text inside the figure; use hover tooltips, click popups, and the scaffold narration panel for explanation.

SCALE SAFETY: figures may be stitched into chapters at different sizes.
- If using Canvas, Chart.js custom drawing, or any pixel-based renderer, derive point radius, stroke width, arrowheads, ticks, label size, and annotation padding from min(plotWidth, plotHeight).
- Avoid large fixed pixel minimums such as Math.max(20, scaledRadius); use only small clamps that prevent invisibility.
- If using SVG/viewBox with naturally scaling geometry, preserve that behavior and avoid fixed px sizes that break scaling.
- If space is small, simplify or hide secondary labels instead of making marks oversized.

HOVER/CLICK (on user action only): hover → showTooltip(label,event)/hideTooltip(); cursor:pointer on interactive elements. Click → showPopup('Title','2–3 sentence explanation'). Animation: fill/opacity transitions only; no scale/translate/bounce.

CONTROLS (blueprint.interactions — render in UI section; add id="{id}Input" to every input):
  slider → <label>{label}: <output id="{id}Val">{default}</output><input id="{id}Input" type="range" min="{min}" max="{max}" step="{step}" value="{default}" oninput="document.getElementById('{id}Val').value=this.value;update_{id}(+this.value)"></label>  +  function update_{id}(v){ /* teach: blueprint.interactions[].teaches */ }
  toggle → <label><input id="{id}Input" type="checkbox" onchange="toggle_{id}(this.checked)"> {label}</label>  +  function toggle_{id}(on){}
  button → <button onclick="trigger_{id}()">{label}</button>  +  function trigger_{id}(){}
Each control's handler must teach the concept described in blueprint.interactions[].teaches.

DEMO STEPS (blueprint.demo_steps): if present and non-empty, build a step player in #ui:
  - A <p id="demoNarration" style="margin:0;font-size:10px;max-width:180px"> showing the current step's narration
  - <button onclick="prevStep()">◀</button> <span id="stepLabel"></span> <button onclick="nextStep()">▶</button>
  - Each step's .state sets matching interaction inputs to the specified values and calls their update functions
  - Step 0 is the default view (set on load); subsequent steps are one click away
  - Omit the player entirely if demo_steps is absent or empty`;
}

// ── User message builder ──────────────────────────────────────────────────────
function buildUser2dMessage(plan, library, userText) {
  if (userText) return userText;
  const libName = { svgjs: 'SVG.js', chartjs: 'Chart.js', mermaid: 'Mermaid' }[library] || 'SVG.js';

  let blueprintSection = '';
  if (plan) {
    const highlights = [
      plan.concept ? `CONCEPT: ${plan.concept}` : null,
      plan.keyInsight ? `KEY INSIGHT (what students should walk away understanding): ${plan.keyInsight}` : null,
      plan.demo_steps?.length ? `DEMO STEPS: ${plan.demo_steps.length} guided steps — implement the step player in #ui` : null,
    ].filter(Boolean).join('\n');

    blueprintSection = (highlights ? `\n\n${highlights}` : '') +
      `\n\nFULL BLUEPRINT:\n${JSON.stringify(plan, null, 2)}`;
  }

  return `Build an interactive figure using ${libName}.

FAITHFULNESS FIRST: the default state must be a pixel-accurate inline replacement for the source image — same colors, same data shape, same labels, same proportions. A student who sees the static figure in the textbook should recognize it immediately.

THEN ADD INTERACTIVITY: implement any controls from blueprint.interactions so a student can explore the concept hands-on. Each control's handler should teach the relationship described in its "teaches" field. Use hover tooltips and click popups to surface explanations on demand.${blueprintSection}`;
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

TEXT PLACEMENT: preserve label meaning, but make text legible.
- Treat labels/ticks/annotations/formulas/legends as collision-checked boxes. Before finalizing, check them against every line, arrow, curve, node, point, tick, gridline, and other label.
- Text must not overlap strokes or dense marks. If the original label is anchored to a busy region, move it to nearby open whitespace and add a short leader line or pointer.
- Draw labels after geometry and give labels over busy regions a white/translucent background or SVG halo: paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round".
- Leave at least 4-6 SVG user units between text and nearby strokes; stagger clustered labels by at least fontSize + 4.
- Wrap long annotations into short multi-line text instead of letting them cross the figure. Keep legends outside dense data/edge regions when possible.
- Do not add extra visible explanatory prose inside the figure; use hover tooltips and click popups for explanation.

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
