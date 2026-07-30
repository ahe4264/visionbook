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
const {
  mergePayloadIntoScaffold,
  extractPayloadFromText,
  extractPayloadFromHtml,
  formatPayload,
  looksLikeFullHtmlDocument,
} = require('./generation');

// ── Scaffold ──────────────────────────────────────────────────────────────────
const SCAFFOLD_2D_PATH = path.join(__dirname, 'base_scene_2d.html');

let _scaffold2d = null;
function getScaffold2d() {
  if (!_scaffold2d) _scaffold2d = fs.readFileSync(SCAFFOLD_2D_PATH, 'utf-8');
  return _scaffold2d;
}

// ── Library routing ───────────────────────────────────────────────────────────
function getLibraryForFigureType(figureType, renderingMode, interactions) {
  // An equation_input interaction needs live, sampled geometry driven by an edited
  // expression; a code_editor interaction needs per-frame redraw of an arbitrary
  // data structure with specific elements highlighted. Neither Mermaid nor
  // Chart.js can express either, so both win over whatever the figure type would
  // otherwise select.
  if (Array.isArray(interactions) &&
      interactions.some(i => i && (i.type === 'equation_input' || i.type === 'code_editor'))) {
    return 'svgjs';
  }
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
// SVG.js-only helper reference. Chart.js and Mermaid figures cannot call any of
// it, so it ships with the svgjs library section rather than unconditionally.
const PLOTTING_HELPERS = `
PLOTTING HELPERS (do not re-declare, and do NOT define your own X()/Y() — use plotX/plotY):
  setPlotFrame({ xDomain, yDomain, margin }) → call ONCE before creating plots; establishes world→screen and owns resize (do not write your own plot resize handler)
  plotX(worldX) / plotY(worldY) → screen px
  compileExpr(src, vars) → f(...args); throws on a bad expression and never returns a fallback
  bindEquationInput(inputId, targets, { variables, onChange }) → wires an <input> to plot handles and shows parse errors inline
  plotFunction(id, { expr, variables, domain, samples, stroke, width, dashed }) → handle
  fillBetween(id, { lower, upper, variables, domain, samples, fill, opacity }) → handle
  plotParametric(id, { x, y, variables, tDomain, samples, stroke }) → handle
  variables: the argument names the expression may use, in order (defaults: plotFunction ['x'], fillBetween ['x'], plotParametric ['t']). When a blueprint field declares "variables" you MUST pass that same array to BOTH the plot constructor and bindEquationInput — plotFunction('f', { expr: 't^2' }) without { variables: ['t'] } throws "Unknown variable t" at construction and kills the whole figure.
  integrateSimpson(fn, a, b, n) → number;  findRoot(fn, a, b, tol) → number | null
  Handles re-sample on EVERY setter call, and the setters differ: plotFunction → .setExpr / .setFn / .setDomain · fillBetween → .setLower / .setUpper / .setDomain · plotParametric → .setX / .setY. All handles also have .sample() and .remove().`;

const LIB_SECTIONS = {
  svgjs: `SVG.js v3 (global: SVG). var draw=SVG().addTo(document.getElementById('container')).size('100%','100%'); var W=600,H=Math.round(W*(3/4)); draw.viewbox(0,0,W,H). font-size in user units (no px). Hover: el.on('mousemove',e=>showTooltip('label',e)).on('mouseleave',()=>hideTooltip()).on('click',()=>showPopup('Title','body')); el.css('cursor','pointer'). window.__markRendered() synchronously at end.${PLOTTING_HELPERS}`,
  chartjs: `Chart.js v4 (global: Chart). Append <canvas style="width:100%;height:100%;display:block"> to #container; options:{responsive:true,maintainAspectRatio:false}. window.__markRendered() immediately after new Chart().`,
  mermaid: `Mermaid v11 (global: mermaid). Append div.mermaid to #container. mermaid.initialize({startOnLoad:false}); mermaid.run({nodes:[div]}).then(function(){ window.__markRendered(); /* style svg, add listeners */ }); — __markRendered() MUST be inside .then().`,
};

// Only emitted when the blueprint actually contains the interaction — these two
// specs are ~1,150 tokens that used to ship on every 2D generation regardless.
const EQUATION_INPUT_SPEC_2D = `EQUATION INPUTS (an interaction has type "equation_input") — the scaffold owns parsing and re-sampling; do not hand-roll either.
Call setPlotFrame({ xDomain, yDomain, margin }) first, then use plotX / plotY for every coordinate. Create a plot handle per field with plotFunction / fillBetween / plotParametric using the field's "domain" AND its "variables" (the constructor compiles the expression immediately and throws on an undeclared variable), then wire each input with bindEquationInput('{field.id}Input', handle, { variables: field.variables }). That bare-handle form only works for plotFunction — bindEquationInput defaults to calling .setFn, and only plotFunction has it; for a fillBetween boundary pass { handle, method: 'setLower' } or { handle, method: 'setUpper' }, and for a plotParametric component pass { handle, method: 'setX' } or { handle, method: 'setY' }, or the bare handle throws. NEVER hardcode the source figure's topology and re-solve only a few corner/scalar values — if the source shows a straight-edged region the drawn path must STILL come from sampling the compiled function, so typing a curved expression produces a curved result; a polygon built from a fixed list of corner points is a failure even when those corners are recomputed. NEVER wrap evaluation in a try/catch that silently restores a default expression or geometry — bindEquationInput already keeps the last good curve and shows the parse error inline, and your own fallback is what makes edits appear to do nothing. Recompute every derived answer the figure reports (e.g. an integral value) with integrateSimpson over the same compiled function, so the number and the picture can never disagree.`;

const CODE_EDITOR_SPEC_2D = `CODE EDITOR (an interaction has type "code_editor") — build a trace-and-playback workbench, not a run-once box. The student writes algorithm logic, never drawing code; every mark the figure draws comes from a recorded frame.
Each op in the interaction's "api" appends a frame BEFORE returning its value — { kind (which op ran; drives caption wording and highlight style), state (a deep copy of the data at that instant), indices (the elements the op touched; highlight exactly these), message (one human-readable line, e.g. "compare A[3]=2 with A[7]=14 → false") } — and an op is the ONLY route to mutation, which is what makes the replay gap-free. Freeze the API object, range-check every index, and expose no reference to the underlying data. Seed a <textarea> with "sample_code", add tabs to swap in "buggy_code" and a bare starter, an editable field for the interaction's "input", and a Run button that disables while running — all inside #ui, which the scaffold docks into a real side column once it contains a textarea, shrinking #container and firing 'fig-resize' so the figure re-lays out. Execute in a Web Worker built from a Blob URL (revoke it when done) with a ~1–2s wall-clock timeout AND hard caps on op and frame count; never eval student code on the main thread. Surface syntax errors, thrown errors, timeouts, cap hits, and a missing or misnamed "entry_point" inline as the final frame with a clear message, never as a silent no-op. Replay with first / prev / play-pause / next, a speed control, an "n of N" counter, the current frame's message as caption, and a running log; draw the structure from frame[i] alone so scrubbing backwards looks identical to arriving there forwards — do not accumulate SVG elements across frames (reuse a group you clear, or update existing shapes in place). Finally test the final state against "success_check" and show a status readout distinguishing not-run / running / correct / wrong answer / error — on a wrong answer, highlight the elements that violate the property so the buggy sample is diagnosable rather than merely marked wrong.`;

function buildSystem2dPrompt(scaffold, library, plan) {
  const libSection = LIB_SECTIONS[library] || LIB_SECTIONS.svgjs;

  const types = Array.isArray(plan?.interactions)
    ? new Set(plan.interactions.map(i => i && i.type).filter(Boolean))
    : null;
  // With no blueprint (or an unrecognisable one) keep both specs, matching the
  // old unconditional behaviour — gating only applies when we can see the plan.
  const wantEquationInput = !types || types.has('equation_input');
  const wantCodeEditor = !types || types.has('code_editor');

  return [`You are building an educational interactive figure for a textbook. The goal is a guided demo that helps students understand the concept — not just a static reconstruction.

OUTPUT: respond with ONLY these two marker-wrapped sections (include both even if empty):
  <!-- @FIGURE_UI_BEGIN --> ... <!-- @FIGURE_UI_END -->   ← HTML for #ui; no block-level tags
  // @FIGURE_CODE_BEGIN ... // @FIGURE_CODE_END           ← JS only; no <script>, no imports

SCAFFOLD (do not reproduce — backend injects your output at the markers):
${scaffold}

GLOBALS (do not re-declare): showPopup(title,body), showTooltip(text,event), hideTooltip(), #container (mount target), window.__markRendered() (call once when drawn), 'fig-resize' CustomEvent on document, setUiLayout(mode, sizePx).
  setUiLayout('overlay' | 'right' | 'bottom', sizePx?) — the scaffold ALWAYS auto-docks #ui (to 'right', or 'bottom' when narrow) and grows the dock to fit its content. Normally you do not call it: just put controls in #ui. Never restyle #ui's position/width/max-height and never build your own side panel. Docking resizes #container and fires 'fig-resize', so setPlotFrame re-lays the figure out at its new size.

LIBRARY: ${libSection}

VISUAL FIDELITY: the default state must be a faithful inline replacement for the source image.
- Color scheme: match every color exactly — axis lines, data series, fills, backgrounds
- Layout & proportions: same relative element positions, same axis ranges, same tick marks and gridlines
- Data shape: match curve trajectories, bar heights, scatter clusters, or node/edge layout — approximate magnitudes, not invented
- Labels & annotations: every label visible in the original must appear at the same position; use blueprint.reconstructionNotes for text and color coding
- Line styles: dashed vs solid, stroke weights, arrowhead presence — copy from the image
- The step-0 (default) state should look indistinguishable from the original at a glance, with no title bar or toolbar visible

TEXT PLACEMENT & READABILITY: faithful labels must still be readable.
- Treat every label, tick label, annotation, formula, and legend item as a collision-checked box, and check each one against lines, arrows, curves, points, nodes, tick marks, gridlines, controls, and other text before finalizing. Text must not sit on top of strokes or dense marks.
- If the source label is anchored to a busy line/arrow/node, keep the semantic anchor but move the text to the nearest open whitespace and connect it with a short leader line, pointer, or subtle dot.
- Draw text and label backgrounds after geometry so labels are on top. Over busy regions add a small white/translucent background rect, or a halo: text.attr({ 'paint-order':'stroke', stroke:'#fff', 'stroke-width':3, 'stroke-linejoin':'round' }).
- Do not add extra visible explanatory text inside the figure; use hover tooltips, click popups, and the scaffold narration panel for explanation.

SCALE SAFETY: figures may be stitched into chapters at different sizes.
- With Canvas, Chart.js custom drawing, or any pixel-based renderer, derive point radius, stroke width, arrowheads, ticks, label size, and annotation padding from min(plotWidth, plotHeight). Avoid large fixed pixel minimums such as Math.max(20, scaledRadius); use only small clamps that prevent invisibility.
- With SVG/viewBox geometry that already scales naturally, preserve that and avoid fixed px sizes that break it.
- If space is small, simplify or hide secondary labels instead of making marks oversized.

HOVER/CLICK (on user action only): hover → showTooltip(label,event)/hideTooltip(); cursor:pointer on interactive elements. Click → showPopup('Title','2–3 sentence explanation'). Animation: fill/opacity transitions only; no scale/translate/bounce.

CONTROLS (blueprint.interactions — render in UI section; add id="{id}Input" to every input). Each control's handler must teach the concept described in its "teaches" field:
  slider → <label>{label}: <output id="{id}Val">{default}</output><input id="{id}Input" type="range" min="{min}" max="{max}" step="{step}" value="{default}" oninput="document.getElementById('{id}Val').value=this.value;update_{id}(+this.value)"></label>  +  function update_{id}(v){}
  toggle → <label><input id="{id}Input" type="checkbox" onchange="toggle_{id}(this.checked)"> {label}</label>  +  function toggle_{id}(on){}
  button → <button onclick="trigger_{id}()">{label}</button>  +  function trigger_{id}(){}
  equation_input → one <label>{field.label} <input id="{field.id}Input" value="{field.default}"></label> per entry in the interaction's "fields"
  code_editor → a <textarea id="{id}Code"> plus sample tabs, an input for the interaction's "input", a Run button, and playback controls`,
    wantEquationInput ? EQUATION_INPUT_SPEC_2D : null,
    wantCodeEditor ? CODE_EDITOR_SPEC_2D : null,
    `DEMO STEPS (blueprint.demo_steps): if present and non-empty, build a step player in #ui:
  - A <p id="demoNarration" style="margin:0;font-size:10px;max-width:180px"> showing the current step's narration
  - <button onclick="prevStep()">◀</button> <span id="stepLabel"></span> <button onclick="nextStep()">▶</button>
  - Each step's .state sets matching interaction inputs to the specified values and calls their update functions
  - Step 0 is the default view (set on load); subsequent steps are one click away
  - Omit the player entirely if demo_steps is absent or empty`,
  ].filter(Boolean).join('\n\n');
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

  // VISUAL FIDELITY and CONTROLS in the system prompt already carry the
  // faithfulness-then-interactivity contract — do not restate it here.
  return `Build an interactive figure using ${libName}.${blueprintSection}`;
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

// ── Post-processing shared by the fresh and refinement paths ─────────────────
/**
 * Turn a raw model response into final HTML.
 *
 * Never returns the bare scaffold. When the model forgets the markers we SALVAGE
 * the response as the code payload rather than throwing: a throw inside the
 * generation loop breaks out with `failed_generation` and no retry, whereas
 * salvaged (possibly malformed) output gets caught by verify-2d, converted into
 * concrete action items, and refined on the next pass. This matches what
 * generation.js already does on the 3D refinement path.
 *
 * @param {string} scaffold - base_scene_2d.html
 * @param {string} rawText  - unprocessed model response
 * @param {string} label    - log prefix, e.g. 'generate-2d' | 'refine-2d'
 * @returns {string} HTML
 */
function finalize2dOutput(scaffold, rawText, label = 'generate-2d') {
  if (!scaffold) throw new Error('scaffold is required.');

  const out = stripFences(String(rawText || ''));
  if (!out) throw new Error(`[${label}] Model returned an empty response.`);

  if (looksLikeFullHtmlDocument(out)) return out;

  const payload = extractPayloadFromText(out);
  if (!payload) {
    console.warn(`[${label}] No scaffold markers in model response — salvaging as code payload. Raw:`, out.slice(0, 300));
    return mergePayloadIntoScaffold(scaffold, { uiHtml: '', codeJs: out });
  }

  return mergePayloadIntoScaffold(scaffold, payload);
}

// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * Generate a figure-faithful interactive HTML page.
 */
async function generate2dFigureHtml({ modelId, base64, mediaType, plan, userText, maxTokens = 16000 }) {
  if (!modelId) throw new Error('modelId is required.');
  if (!base64 || !mediaType) throw new Error('base64 and mediaType are required.');

  const scaffold = getScaffold2d();
  const library = getLibraryForFigureType(plan?.figureType, plan?.renderingMode, plan?.interactions);
  const systemPrompt = buildSystem2dPrompt(scaffold, library, plan);
  const message = buildUser2dMessage(plan, library, userText);

  const userContent = [
    { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
    { type: 'text', text: message },
  ];

  const out = await generateWithModel(modelId, { systemPrompt, userContent, maxTokens });

  return finalize2dOutput(scaffold, out, 'generate-2d');
}

// ── Refinement path ───────────────────────────────────────────────────────────
/**
 * Build the refinement system prompt by APPENDING critic feedback to the full
 * fresh-generation prompt.
 *
 * The fresh prompt is not just the scaffold — it carries the library routing
 * rules (svgjs/chartjs/mermaid have mutually exclusive __markRendered() timing),
 * GLOBALS, VISUAL FIDELITY, TEXT PLACEMENT, SCALE SAFETY, CONTROLS and DEMO
 * STEPS, plus whichever interaction specs the blueprint calls for. Slimming it
 * down for refinement would let the model reintroduce exactly the failures those
 * sections prevent — and the critic feedback driving the refinement is often
 * about them.
 */
function buildSystem2dRefinementPrompt(scaffold, library, prevHtml, evaluation, plan) {
  if (!scaffold) throw new Error('scaffold is required.');
  if (!prevHtml) throw new Error('prevHtml is required.');
  if (!evaluation) throw new Error('evaluation is required.');

  const issues = [
    ...(evaluation.failure_modes || []).map(m => `- ${m}`),
    `- geometry_accuracy: ${evaluation.geometry_accuracy}/5`,
    `- interactivity_usability: ${evaluation.interactivity_usability}/5`,
    `- faithfulness: ${evaluation.faithfulness}/5`,
    `- label_quality: ${evaluation.label_quality}/5`,
    `- concept_accuracy: ${evaluation.concept_accuracy}/5`,
    `- notes: ${evaluation.notes || ''}`,
    ...(evaluation.action_items || []).map(a => `- ACTION: ${a}`),
  ].join('\n');

  const prevPayload = extractPayloadFromHtml(prevHtml);
  const prevPayloadText = prevPayload
    ? formatPayload(prevPayload)
    : '(Could not find scaffold markers in the previous HTML. Output a fresh payload using the required markers.)';

  return `${buildSystem2dPrompt(scaffold, library, plan)}

CRITIC FEEDBACK ON PREVIOUS ATTEMPT:
${issues}

PREVIOUS GENERATED PAYLOAD (edit this; do NOT output full HTML):
${prevPayloadText}

Fix all identified failure modes and improve every score. Maintain or improve what already works well.
Return ONLY the updated marker-wrapped payload.`;
}

async function generate2dRefinedFigureHtml({
  modelId, base64, mediaType, plan, prevHtml, evaluation, userText,
  prevScreenshot, prevScreenshotMediaType, maxTokens = 16000,
}) {
  if (!modelId) throw new Error('modelId is required.');
  if (!base64 || !mediaType) throw new Error('base64 and mediaType are required.');
  if (!prevHtml) throw new Error('prevHtml is required.');
  if (!evaluation) throw new Error('evaluation is required.');

  const scaffold = getScaffold2d();
  // Route the library from the PLAN, not from the previous HTML, so the fresh and
  // refinement passes always agree. A mid-loop library switch would invalidate the
  // previous payload we are asking the model to edit.
  const library = getLibraryForFigureType(plan?.figureType, plan?.renderingMode, plan?.interactions);
  const systemPrompt = buildSystem2dRefinementPrompt(scaffold, library, prevHtml, evaluation, plan);
  const message = buildUser2dMessage(plan, library, userText);

  const userContent = [
    { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
    ...(prevScreenshot ? [{ type: 'image_url', image_url: { url: `data:${prevScreenshotMediaType || 'image/jpeg'};base64,${prevScreenshot}` } }] : []),
    {
      type: 'text',
      text: prevScreenshot
        ? `${message}\n\nThe second image above is a screenshot of the PREVIOUS attempt's rendered output (not the source figure) — use it to see exactly what broke.`
        : message,
    },
  ];

  const out = await generateWithModel(modelId, { systemPrompt, userContent, maxTokens });

  return finalize2dOutput(scaffold, out, 'refine-2d');
}

/**
 * Unified 2D entry point — routes fresh vs refinement on whether the caller has a
 * previous attempt AND its evaluation. Mirrors generation.js generateCode().
 */
async function generate2dCode(opts) {
  const { prevHtml, evaluation } = opts || {};
  const isRefinement = Boolean(prevHtml && evaluation);
  return isRefinement
    ? generate2dRefinedFigureHtml(opts)
    : generate2dFigureHtml(opts);
}

module.exports = {
  generate2dFigureHtml,
  generate2dRefinedFigureHtml,
  generate2dCode,
  buildSystem2dPrompt,
  buildSystem2dRefinementPrompt,
  finalize2dOutput,
  getLibraryForFigureType,
};
