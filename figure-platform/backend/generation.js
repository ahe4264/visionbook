const { generateWithModel } = require('./models');

// === Code Divider =============================================================
const BASE_ROLE = 'You are an expert Three.js developer who converts 2D textbook figures into interactive 3D web visualizations.';

// Scaffold insertion markers (must match backend/base_scene_new.html)
const UI_BEGIN_MARKER = '<!-- @FIGURE_UI_BEGIN -->';
const UI_END_MARKER = '<!-- @FIGURE_UI_END -->';
const CODE_BEGIN_MARKER = '// @FIGURE_CODE_BEGIN';
const CODE_END_MARKER = '// @FIGURE_CODE_END';
// === Code Divider =============================================================
// The output contract is stated ONCE, here. Do not restate it in the task guide,
// the scaffold intro, or the user text — it previously appeared 5-6 times per prompt.
const BASE_OUTPUT_RULES = `OUTPUT RULES - non-negotiable. Return exactly this and nothing else — no prose, no markdown, no code fences:
${UI_BEGIN_MARKER}
...HTML that belongs inside <div id="ui"> — no <html>, <head>, <body>, <script>, or <style>...
${UI_END_MARKER}
${CODE_BEGIN_MARKER}
...JavaScript for the existing <script type="module"> — no import statements, no importmap...
${CODE_END_MARKER}
Emit both marker pairs even if a section is empty. The backend keeps the scaffold and injects your payload at these markers, so never output the scaffold itself and never re-declare anything it already defines.`;

// === Code Divider =============================================================
function buildPromptHeader({ scaffold, roleSuffix = '', scaffoldIntro, framedScaffold = true }) {
    const roleLine = roleSuffix ? `${BASE_ROLE} ${roleSuffix}` : BASE_ROLE;
    const scaffoldSection = framedScaffold
        ? `--------------------------------------------------------------------------------
${scaffoldIntro}
--------------------------------------------------------------------------------
${scaffold}
--------------------------------------------------------------------------------`
        : `${scaffoldIntro}
${scaffold}`;

    return `${roleLine}

${BASE_OUTPUT_RULES}

${scaffoldSection}`;
}

// === Code Divider =============================================================
// The guide is assembled from shared blocks. The inline (default) and
// standalone-demo profiles differ only by STANDALONE_DEMO_RULES — they used to be
// two ~3.2k-token near-duplicate strings that had already drifted apart.
const SCAFFOLD_API = `WHAT THE SCAFFOLD PROVIDES (already defined — use these, never re-declare them):
- Scale guide (orthographic camera, d=3 frustum half-height): keep main geometry within ±2 units in all axes. Typical sizes: cube side 1–2 units, arrow length 1–2, plane width 2–4, sphere radius 0.05–0.15.
- setCameraView({ projection, azimuthDeg, elevationDeg, rollDeg, axisScreenAngles, obliqueAngleDeg, depthScale, zoom, target, heightFraction, distanceScale }) — source-matched camera setup.
  heightFraction: fraction of viewport height the content should fill (default 0.5; use 0.65–0.75 to fill more). Omit zoom — the scaffold auto-fits from projected scene bounds.
  Call it AFTER all geometry is in the scene, or auto-fit measures the wrong bounds. Labels come afterwards and do not affect the fit.
- #ui is always docked as a right-side column by the scaffold and grows to fit its content. setUiLayout(...) exists only for backwards compatibility and cannot change the side, overlay state, or size. Just put controls in #ui. Never restyle #ui's position/width/max-height and never build your own side panel.
- addLabel(htmlString, THREE.Vector3, options?) — floating HTML label system.
- registerInteractive(object, { title, body, tooltip }), showPopup(title, body), hidePopup, showTooltip, hideTooltip — hover/click explanations.
- compileExpr(src, vars) → f(...args); throws on a bad expression (never returns a fallback)
- bindEquationInput(inputId, targets, { variables, onChange }) — wires an <input> to plot handles; shows parse errors inline
- plotCurve3D(id, { expr, variables, domain, plane:'xy'|'xz', samples, color }) → handle
- plotParametric3D(id, { x, y, z, variables, tDomain, samples, color }) → handle
- plotSurface(id, { expr, variables, xDomain, yDomain, segments, color }) → handle
  variables: the argument names the expression may use, in order (defaults: plotCurve3D ['x'], plotParametric3D ['t'], plotSurface ['x','y']). When a plan field declares "variables" you MUST pass that same array to BOTH the plot constructor and bindEquationInput — plotCurve3D('f', { expr: 't^2' }) without { variables: ['t'] } throws "Unknown variable t" at construction and kills the whole figure.
  Handles re-sample on EVERY setter call, and the setters differ: plotCurve3D → .setExpr / .setFn / .setDomain · plotParametric3D → .setX / .setY / .setZ · plotSurface → .setExpr / .setFn. All handles also have .sample() and .remove().
- Also pre-wired, do not re-declare: _labels, _syncLabels, animate, renderer, scene, camera, controls, d, aspect, setStandardView.`;

const FIGURE_RULES = `FIGURE RULES:
- Every visible element must be constructed as Three.js geometry (meshes, lines, points, sprites). Do NOT reproduce the figure as a texture, canvas drawing, or flat PlaneGeometry with the image drawn on it — pasting the original image onto a plane is never a valid solution.
- Keep the background white (#ffffff).
- The output should look recognizably like the source figure — same general geometry, viewpoint, labels, and proportions. It does not need to be a pixel-perfect same-size replacement.
- CAMERA / VIEW: camera pose is a standard default per projection mechanism, and PROJECTION TYPE in the user message gives the exact setCameraView call. Do not spend effort inferring exact angles from the source — spend it on ELEMENTS, geometry, and interactions. Align key visual anchors (object center, axes, labels) to similar relative positions as the source so the first frame is recognizable. You may adjust controls.target, object scale, and projection parameters; prefer setCameraView over setting camera.zoom directly, and if you do set zoom manually call camera.updateProjectionMatrix().
- Add ALL visible text labels with addLabel. Missing or wrong labels are a critical failure; match the source's font sizes and let placement reinforce depth.
- Interactions can be any type that serves the concept: sliders, buttons, panels, animations, step controls, hover/click, or direct 3D manipulation. Controls, panels, and UI affordances are welcome where they genuinely aid understanding — avoid decorative or redundant ones, but do not artificially restrict the type or amount of interaction.`;

// Only emitted when the plan actually contains the interaction — these two specs
// are ~1,100 tokens that used to ship on every generation regardless.
const CODE_EDITOR_SPEC = `"code_editor" INTERACTION — build a trace-and-playback workbench, not a run-once box. The learner writes algorithm logic, never drawing code; every pixel the figure draws comes from a recorded frame.
Each op in the plan's "api" appends a frame BEFORE returning its value — { kind (which op ran; drives caption wording and highlight style), state (a deep copy of the data at that instant), indices (the elements the op touched; the figure highlights exactly these), message (one human-readable line, e.g. "compare A[3]=2 with A[7]=14 → false") } — and an op is the ONLY route to mutation, which is what makes the replay gap-free. Freeze the API object, range-check every index, and hand out no reference to the underlying data. Seed a <textarea> with the plan's sample_code, add tabs for the buggy_code variant and a bare starter, an editable field for the plan's "input", and a Run button that disables while running — all inside #ui, which the scaffold docks into a real side column once it contains a textarea. Execute in a Web Worker built from a Blob URL (revoke it when done) with a ~1–2s wall-clock timeout AND hard caps on op and frame count; never eval learner code on the main thread. Surface syntax errors, thrown errors, timeouts, cap hits, and a missing or misnamed "entry_point" inline as the final frame with a clear message, never as a silent no-op. Replay with first / prev / play-pause / next, a speed control, an "n of N" counter, the current frame's message as caption, and a running log; rendering must be a pure function of frame[i], so scrubbing backwards looks identical to arriving there forwards. Finally test the final state against the plan's "success_check" and show a status readout distinguishing not-run / running / correct / wrong answer / error — on a wrong answer, highlight the elements that violate the property so the buggy sample is diagnosable rather than merely marked wrong.`;

const EQUATION_INPUT_SPEC = `"equation_input" INTERACTION — the scaffold owns parsing and re-sampling; use it, do not hand-roll either.
Add one <input> in #ui per entry in the plan's "fields", seeded with each field's default, and create a plot handle per field with plotCurve3D / plotParametric3D / plotSurface, passing the field's "variables" to the constructor as described above. plotCurve3D and plotSurface accept a bare handle: bindEquationInput('<inputId>', handle, { variables: [...] }). plotParametric3D has NO .setExpr/.setFn — only .setX/.setY/.setZ — so it must ALWAYS be bound as bindEquationInput('<inputId>', { handle, method: 'setX' }, { variables: [...] }) (or 'setY'/'setZ' for whichever component the field edits); passing it bare throws. Each <input> gets its own inline error slot, so several equation inputs may share a parent. NEVER hardcode the source figure's topology and re-solve only a few corner/scalar values — if the source shows a straight-edged region, the drawn path must STILL come from sampling the compiled function, so that typing a curved expression produces a curved result; a polygon built from a fixed list of corner points is a failure even when those corners are recomputed. NEVER wrap evaluation in a try/catch that silently restores a default expression or default geometry — bindEquationInput already keeps the last good curve and shows the parse error inline, and your own fallback is exactly what makes edits appear to do nothing. Recompute every derived answer the figure reports (e.g. an integral value) from the same compiled function, so the number and the picture can never disagree.`;

const STANDALONE_DEMO_RULES = `STANDALONE DEMO PROFILE:
- This is a standalone interactive learning demo, not an inline PDF replacement. The default view should still be recognizable as the source figure, but it does not need to preserve the exact crop, whitespace, or minimal UI.
- Use the UI marker block for learner-facing affordances where they help: a concise control strip, step controls, reset, parameter sliders/toggles, legend, or explanation panel. A compact title, explanation card, state readout, or guided-step bar is acceptable.
- Do not hide all teaching behind click popups. Include at least one visible explanatory affordance — a short "What this shows" panel, active step narration, or compact concept readout.
- If the figure has adjustable variables, expose visible controls for the most important 1–3. If it has a sequence/process, include step controls. If it is mostly spatial, include guided view/annotation controls.
- Every visible control must change geometry, labels, highlighted state, camera/view, or explanation in a way that teaches something — chosen from the concept, not added generically.
- Keep OrbitControls, hover/click highlights, and object-specific explanations for meaningful meshes/lines/points.
- Keep the scene readable and mechanically robust: no controls covering important geometry, no off-screen panels, no horizontal page overflow, no decorative motion that distracts from the concept.
- Define a single updateScene() entry point and wire every UI control to it. If you add a reset control, make it restore the default state.`;

const TASK_STEPS = `ORDER OF WORK:
1) Settle the projection mechanism and pose from the plan BEFORE speccing any geometry — projection decides which edges stay parallel, which faces foreshorten, and what angle depth lines leave at.
2) Spec every element's Three.js primitive as one inline comment per element at the top of your JS block, e.g.
     // pinhole → SphereGeometry(0.07)  black
     // ray     → Line  dashed  grey
   Then build exactly that spec — do not deviate from it.
3) Build the static geometry. Preserve relative scale, spacing, depth ordering, and occlusion.
4) VERIFY before moving on: re-check what you built against GEOMETRY NOTES and the source image, element by element — position, orientation, proportions, and shape, not just presence. Fix any mismatch now; a generic-but-plausible arrangement that skips this check is the most common way geometry ends up wrong.
5) Then, in this order: setCameraView(...) → all labels → the plan's interactions.`;

// === Code Divider =============================================================
/** Interaction types named by the plan, or null when the plan shape is unknown. */
function planInteractionTypes(plan) {
    const ip = plan?.interactionPlan || plan;
    const list = Array.isArray(ip?.interactions) ? ip.interactions : null;
    if (!list) return null;
    return new Set(list.map(i => i && i.type).filter(Boolean));
}

function getGenerationTaskGuide(plan) {
    const standalone = process.env.GENERATION_PROFILE === 'standalone-demo';
    const types = planInteractionTypes(plan);
    // With no plan (or an unrecognisable one) keep both specs, matching the old
    // unconditional behaviour — gating only kicks in when we can see the plan.
    const wantCodeEditor = !types || types.has('code_editor');
    const wantEquationInput = !types || types.has('equation_input');

    return [
        SCAFFOLD_API,
        FIGURE_RULES,
        standalone ? STANDALONE_DEMO_RULES : null,
        wantCodeEditor ? CODE_EDITOR_SPEC : null,
        wantEquationInput ? EQUATION_INPUT_SPEC : null,
        TASK_STEPS,
    ].filter(Boolean).join('\n\n');
}

// === Code Divider =============================================================
function buildGenerationSystemPrompt(scaffold, plan) {
    if (!scaffold) throw new Error('scaffold is required.');

    const header = buildPromptHeader({
        scaffold,
        scaffoldIntro: 'BASE SCAFFOLD — reference only. The backend injects your payload at the markers; do not copy this file into your response.',
    });

    return `${header}

${getGenerationTaskGuide(plan)}`;
}
// === Code Divider =============================================================
function buildGenerationRefinementPrompt(scaffold, prevHtml, evaluation, plan) {
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
        : '(Could not find scaffold markers in previous HTML. Output a fresh payload using the required markers.)';

    const header = buildPromptHeader({
        scaffold,
        roleSuffix: 'improving a previous attempt based on critic feedback.',
        scaffoldIntro: 'BASE SCAFFOLD — fixed and used at runtime. Do NOT output it.',
        framedScaffold: false,
    });

    return `${header}

${getGenerationTaskGuide(plan)}

CRITIC FEEDBACK ON PREVIOUS ATTEMPT:
${issues}

PREVIOUS GENERATED PAYLOAD (edit this; do NOT output full HTML):
${prevPayloadText}

Fix all identified failure modes and improve every score. Maintain or improve what already works well.
Return ONLY the updated marker-wrapped payload.`;
}

const PROJECTION_GUIDELINES = {
    perspective: `Use the scaffold's true perspective projection after building all geometry. Use this only when the source has real vanishing-point convergence or distance-based size shrinkage; then depth should visibly affect apparent size.`,
    axonometric: `Use ordinary orthographic projection: setCameraView({ projection: 'orthographic', axisScreenAngles, heightFraction }). If the plan gives axis_screen_angles: null (a flat 2D plot/diagram), pass axisScreenAngles: null for a front-on view. Otherwise the plan does not measure per-figure angles — use a standard isometric pose: axisScreenAngles: { x: 30, z: 30 }. The source image is a PROJECTION of a 3D object: rebuild the true object — a rectangle stays a rectangle in world space — and let the camera do the projecting. Never bake the drawn parallelogram into the geometry, and never shear geometry. Omit zoom and call setCameraView after all geometry is added — the scaffold auto-fits from the projected bounding box.`,
    oblique: `Call setCameraView({ projection: 'oblique', obliqueAngleDeg: 45, depthScale: 0.5, heightFraction }) after all geometry is added — a standard cabinet-oblique pose; the plan does not measure per-figure oblique angles. The scaffold implements oblique as a shear of the eye-space projection matrix, so the front face stays undistorted, depth edges leave at obliqueAngleDeg, and labels track the shear automatically. Build the TRUE 3D object — the shear is the camera's job. Do NOT shear geometry, do NOT wrap the figure in a sheared parent Object3D, and do NOT disable automatic matrix updates. The scaffold also provides the reveal interaction: dragging eases the shear out to expose the real 3D shape and a toggle button returns to the printed view — do not implement either yourself.
AXIS ASSIGNMENT: the pose is pinned, so in BoxGeometry(w, h, d) the w axis is screen-right, h is screen-up, and d is the receding diagonal. Before writing each BoxGeometry, look at the source image and decide which of the object's dimensions actually recedes there — do not assume it is the one the domain calls "depth". In feature-map / layer-stack diagrams the channel count is usually the w (horizontal) extent along the flow direction and a spatial dimension is d. Sanity-check the silhouette against the source: a block that should read as a long bar pointing at its neighbours must be long in w, not in d, or it will render as a sliver shooting into the page. If GEOMETRY NOTES assigns the axes in a way that contradicts the source image's silhouette, follow the image.`,
};

function buildPlanInjection(plan) {
    if (!plan) return '';
    const parts = [];
    if (plan.contextChunk) {
        parts.push(`CONTEXT FROM TEXTBOOK:\n${plan.contextChunk.slice(0, 3000)}`);
    }
    if (plan.interactionPlan) {
        const ip = plan.interactionPlan;
        // Spell out each section explicitly so the generator doesn't conflate them
        const sections = [];
        if (ip.projection_type && PROJECTION_GUIDELINES[ip.projection_type]) {
            sections.push(`PROJECTION TYPE: ${ip.projection_type}\n${PROJECTION_GUIDELINES[ip.projection_type]}`);
        }
        if (ip.elements?.length) {
            sections.push(`ELEMENTS TO RECREATE IN 3D:\n${ip.elements.map(e => `  - ${e}`).join('\n')}`);
        }
        if (ip.geometry_notes) {
            sections.push(`GEOMETRY NOTES (world-space scale, color palette, and any formula/value needed for correctness — build to these so sizes, zoom, and colors match the source; do not guess dimensions the notes already specify):\n${ip.geometry_notes}`);
        }
        if (ip.interactions?.length) {
            sections.push(`DISCRETE CONTROLS (implement every one of these in #ui, each must work independently):\n${JSON.stringify(ip.interactions, null, 2)}`);
        }
        if (ip.demo_steps?.length) {
            sections.push(`DEMO STEPS (tween through these using goToStep(); each step drives the controls above):\n${JSON.stringify(ip.demo_steps, null, 2)}`);
        }
        if (ip.axis_screen_angles !== undefined) {
            sections.push(`AXIS ANGLES: ${JSON.stringify(ip.axis_screen_angles)} — null means the source is a flat 2D figure; pass axisScreenAngles: null to setCameraView for a front-on view.`);
        }
        if (ip.camera_view) {
            sections.push(`CAMERA VIEW (framing only). Call setCameraView({ projection, ...these }) AFTER all geometry is added. Keep the projection MECHANISM from PROJECTION TYPE above (orthographic / sheared-oblique / perspective). For perspective these params set the pose (azimuth/elevation/roll); for the two parallel projections pose is a standard default (see PROJECTION TYPE above), and these params set only roll and framing (heightFraction):\n${JSON.stringify(ip.camera_view, null, 2)}`);
        }
        if (ip.camera_suggestion) {
            sections.push(`CAMERA: ${ip.camera_suggestion}`);
        }
        if (ip.notes) {
            sections.push(`NOTES: ${ip.notes}`);
        }
        parts.push(sections.join('\n\n'));
    }
    return parts.join('\n\n');
}

// The output contract lives in BASE_OUTPUT_RULES — do not restate it here.
function buildGenerationUserText(plan) {
    if (!plan) return 'Analyse this figure carefully, then return the scaffold fill-in payload.';
    return `${buildPlanInjection(plan)}\n\nFollow the interaction plan above.`;
}
// Strip accidental markdown fences and return raw content.
function stripFences(text) {
    if (typeof text !== 'string') return '';

    // Full fenced block
    const fullFence = text.match(/^\s*```[a-zA-Z]*\s*\n([\s\S]*?)\n```\s*$/);
    if (fullFence) return fullFence[1].trim();

    // Any fenced block (fallback)
    const anyFence = text.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
    if (anyFence) return anyFence[1].trim();

    return text.trim();
}

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBetweenMarkers(text, beginMarker, endMarker) {
    if (!text) return null;
    const re = new RegExp(`${escapeRegExp(beginMarker)}([\\s\\S]*?)${escapeRegExp(endMarker)}`, 'm');
    const match = String(text).match(re);
    if (!match) return null;
    return match[1].trim();
}

function extractPayloadFromText(text) {
    const uiHtml = extractBetweenMarkers(text, UI_BEGIN_MARKER, UI_END_MARKER);
    const codeJs = extractBetweenMarkers(text, CODE_BEGIN_MARKER, CODE_END_MARKER);
    if (uiHtml == null && codeJs == null) return null;
    return { uiHtml: uiHtml ?? '', codeJs: codeJs ?? '' };
}

function extractPayloadFromHtml(html) {
    const payload = extractPayloadFromText(html);
    if (!payload) return null;
    return payload;
}

function formatPayload({ uiHtml = '', codeJs = '' } = {}) {
    return `${UI_BEGIN_MARKER}\n${uiHtml || ''}\n${UI_END_MARKER}\n${CODE_BEGIN_MARKER}\n${codeJs || ''}\n${CODE_END_MARKER}`;
}

function replaceBetweenMarkers(source, beginMarker, endMarker, replacement) {
    const re = new RegExp(`(${escapeRegExp(beginMarker)})([\\s\\S]*?)(${escapeRegExp(endMarker)})`, 'm');
    if (!re.test(source)) {
        throw new Error(`Scaffold is missing required markers: ${beginMarker} ... ${endMarker}`);
    }
    const body = (replacement || '').trim();
    const middle = body ? `\n${body}\n` : `\n`;
    return String(source).replace(re, `$1${middle}$3`);
}

function mergePayloadIntoScaffold(scaffold, payload) {
    let merged = scaffold;
    merged = replaceBetweenMarkers(merged, UI_BEGIN_MARKER, UI_END_MARKER, payload?.uiHtml ?? '');
    merged = replaceBetweenMarkers(merged, CODE_BEGIN_MARKER, CODE_END_MARKER, payload?.codeJs ?? '');
    return merged;
}

function looksLikeFullHtmlDocument(text) {
    const prefix = String(text || '').trimStart().slice(0, 300).toLowerCase();
    return prefix.includes('<!doctype html') || prefix.includes('<html');
}

// Fix common model mistakes that can break generated scenes.
function fixGeneratedHtml(html) {
    let fixed = html;

    // Remove duplicate addLabel redeclarations (keep first occurrence from scaffold).
    const addLabelDupes = [...fixed.matchAll(/^[ \t]*(function addLabel\b[^{]*\{)/gm)];
    if (addLabelDupes.length > 1) {
        for (let i = addLabelDupes.length - 1; i >= 1; i--) {
            const start = addLabelDupes[i].index;
            let depth = 0;
            let end = start;
            for (let j = fixed.indexOf('{', start); j < fixed.length; j++) {
                if (fixed[j] === '{') depth++;
                if (fixed[j] === '}') {
                    depth--;
                    if (depth === 0) {
                        end = j + 1;
                        break;
                    }
                }
            }
            fixed = fixed.slice(0, start) + '// [auto-removed duplicate addLabel]\n' + fixed.slice(end);
        }
    }

    // Remove duplicate animate redeclarations.
    const animDupes = [...fixed.matchAll(/^[ \t]*(function animate\b[^{]*\{)/gm)];
    if (animDupes.length > 1) {
        for (let i = animDupes.length - 1; i >= 1; i--) {
            const start = animDupes[i].index;
            let depth = 0;
            let end = start;
            for (let j = fixed.indexOf('{', start); j < fixed.length; j++) {
                if (fixed[j] === '{') depth++;
                if (fixed[j] === '}') {
                    depth--;
                    if (depth === 0) {
                        end = j + 1;
                        break;
                    }
                }
            }
            fixed = fixed.slice(0, start) + '// [auto-removed duplicate animate]\n' + fixed.slice(end);
        }
    }

    // Remove DUPLICATE updateLabels helpers, keeping the first.
    // NOTE: no scaffold defines updateLabels (they use _syncLabels), so the model
    // owns this name. Removing every definition — as this loop did while it ran to
    // i >= 0 — deleted the only definition while leaving its call sites intact,
    // producing "updateLabels is not defined" at runtime. Keep the first, like
    // every other deduper below.
    const updateLabelsDupes = [...fixed.matchAll(/^[ \t]*(function updateLabels\b[^{]*\{)/gm)];
    if (updateLabelsDupes.length > 1) {
        for (let i = updateLabelsDupes.length - 1; i >= 1; i--) {
            const start = updateLabelsDupes[i].index;
            let depth = 0;
            let end = start;
            for (let j = fixed.indexOf('{', start); j < fixed.length; j++) {
                if (fixed[j] === '{') depth++;
                if (fixed[j] === '}') {
                    depth--;
                    if (depth === 0) {
                        end = j + 1;
                        break;
                    }
                }
            }
            fixed = fixed.slice(0, start) + '// [auto-removed conflicting updateLabels]\n' + fixed.slice(end);
        }
    }

    // Remove duplicate scaffold interaction helpers if the model redefines them.
    for (const helperName of ['setCameraView', 'setStandardView', 'showPopup', 'hidePopup', 'showTooltip', 'hideTooltip', 'registerInteractive']) {
        const helperDupes = [...fixed.matchAll(new RegExp(`^[ \t]*(function ${helperName}\\b[^{]*\\{)`, 'gm'))];
        if (helperDupes.length > 1) {
            for (let i = helperDupes.length - 1; i >= 1; i--) {
                const start = helperDupes[i].index;
                let depth = 0;
                let end = start;
                for (let j = fixed.indexOf('{', start); j < fixed.length; j++) {
                    if (fixed[j] === '{') depth++;
                    if (fixed[j] === '}') {
                        depth--;
                        if (depth === 0) {
                            end = j + 1;
                            break;
                        }
                    }
                }
                fixed = fixed.slice(0, start) + `// [auto-removed duplicate ${helperName}]\n` + fixed.slice(end);
            }
        }
    }

    fixed = fixed.replace(
        /addLabel\(([^,]+),\s*([^,]+),\s*true\s*\)/g,
        "addLabel($1, $2, { fontSize: '11px' })"
    );

    fixed = fixed.replace(
        /^[ \t]*const labels\s*=\s*\[\s*\]\s*;?\s*$/gm,
        '// [auto-removed: scaffold uses _labels]'
    );

    return fixed;
}

async function generateFigureHtml({
    modelId,
    scaffold,
    mediaType,
    base64,
    plan,
    userText,
    maxTokens = 16384,
    applyFixes = true,
}) {
    if (!modelId) throw new Error('modelId is required.');
    if (!scaffold) throw new Error('scaffold is required.');
    if (!mediaType || !base64) throw new Error('mediaType and base64 are required.');
    const resolvedUserText = userText || buildGenerationUserText(plan);

    if (!resolvedUserText) throw new Error('Could not resolve userText for generation.');

    const userContent = [
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
        { type: 'text', text: resolvedUserText },
    ];

    let out = await generateWithModel(modelId, {
        systemPrompt: buildGenerationSystemPrompt(scaffold, plan),
        userContent,
        maxTokens,
    });

    out = stripFences(out);

    let html;
    if (looksLikeFullHtmlDocument(out)) {
        // Backwards-compatible: sometimes models still return a full HTML document.
        html = out;
    } else {
        const payload = extractPayloadFromText(out) || { uiHtml: '', codeJs: out };
        html = mergePayloadIntoScaffold(scaffold, payload);
    }

    if (applyFixes) html = fixGeneratedHtml(html);
    return html;
}

async function generateRefinedFigureHtml({
    modelId,
    scaffold,
    prevHtml,
    evaluation,
    mediaType,
    base64,
    userText,
    plan,
    prevScreenshot,
    prevScreenshotMediaType,
    maxTokens = 16384,
    applyFixes = true,
}) {
    if (!modelId) throw new Error('modelId is required.');
    if (!scaffold) throw new Error('scaffold is required.');
    if (!prevHtml) throw new Error('prevHtml is required.');
    if (!evaluation) throw new Error('evaluation is required.');
    if (!mediaType || !base64) throw new Error('mediaType and base64 are required.');
    if (!userText) throw new Error('userText is required.');

    const userContent = [
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
        ...(prevScreenshot ? [{ type: 'image_url', image_url: { url: `data:${prevScreenshotMediaType || 'image/jpeg'};base64,${prevScreenshot}` } }] : []),
        {
            type: 'text',
            text: prevScreenshot
                ? `${userText}\n\nThe second image above is a screenshot of the PREVIOUS attempt's rendered output (not the source figure) — use it to see exactly what broke.`
                : userText,
        },
    ];

    let out = await generateWithModel(modelId, {
        systemPrompt: buildGenerationRefinementPrompt(scaffold, prevHtml, evaluation, plan),
        userContent,
        maxTokens,
    });

    out = stripFences(out);

    let html;
    if (looksLikeFullHtmlDocument(out)) {
        html = out;
    } else {
        const payload = extractPayloadFromText(out) || { uiHtml: '', codeJs: out };
        html = mergePayloadIntoScaffold(scaffold, payload);
    }

    if (applyFixes) html = fixGeneratedHtml(html);
    return html;
}

/**
 * Unified generation function that handles both fresh generation and refinement.
 * Routes to the appropriate path based on whether prevHtml and evaluation are provided.
 *
 * @param {{
 *   scaffold: string,
 *   plan?: object,
 *   prevHtml?: string,
 *   evaluation?: object,
 *   modelId?: string,
 *   mediaType?: string,
 *   base64?: string,
 *   userText?: string,
 *   maxTokens?: number,
 *   applyFixes?: boolean,
 * }} opts
 * @returns {Promise<string>} - merged HTML with injected payload
 */
async function generateCode(opts) {
    const {
        scaffold,
        plan,
        prevHtml,
        evaluation,
        modelId,
        mediaType,
        base64,
        userText,
        prevScreenshot,
        prevScreenshotMediaType,
        maxTokens = 16384,
        applyFixes = true,
        figureLabel,
    } = opts;

    if (!scaffold) throw new Error('scaffold is required');
    if (!modelId) throw new Error('modelId is required');
    if (!mediaType || !base64) throw new Error('mediaType and base64 are required');

    const generatorMode = (process.env.GENERATOR_MODE || 'single').toLowerCase();
    const isRefinement = Boolean(prevHtml && evaluation);
    const label = figureLabel || 'figure';

    // ── AGENT MODE ────────────────────────────────────────────────────────────
    // Run the bounded Claude Code agent first. It renders + self-corrects before
    // returning. If it yields nothing usable (unavailable/timeout/error), we fall
    // through to the existing single-shot generator — behavior is never worse.
    if (generatorMode === 'agent') {
        try {
            const { generateCodeAgent, summarizeEvaluation } = require('./generation-agent');
            const agentHtml = await generateCodeAgent({
                scaffold, plan, base64, mediaType, label,
                prevHtml: isRefinement ? prevHtml : undefined,
                feedbackText: isRefinement ? summarizeEvaluation(evaluation) : undefined,
            });
            if (agentHtml) return agentHtml;
            console.warn(`[generateCode] agent produced no output for ${label}; falling back to single-shot.`);
        } catch (e) {
            console.warn(`[generateCode] agent path threw for ${label} (${e.message}); falling back to single-shot.`);
        }
    }

    // ── SINGLE-SHOT (existing behavior) ─────────────────────────────────────────
    const runSingleShot = () => {
        if (isRefinement) {
            return generateRefinedFigureHtml({
                modelId, scaffold, prevHtml, evaluation, mediaType, base64, plan,
                prevScreenshot, prevScreenshotMediaType,
                userText: userText || buildGenerationUserText(plan), maxTokens, applyFixes,
            });
        }
        return generateFigureHtml({
            modelId, scaffold, mediaType, base64, plan,
            userText: userText || buildGenerationUserText(plan), maxTokens, applyFixes,
        });
    };
    const html = await runSingleShot();

    // ── ESCALATE MODE ───────────────────────────────────────────────────────────
    // Keep the fast single-shot path for the common (working) case; only pay the
    // agent's cost when the single-shot output actually fails to render.
    if (generatorMode === 'escalate') {
        try {
            const { verifyFigure } = require('./verify');
            const report = await verifyFigure(html);
            if (report.ok) return html;
            const { generateCodeAgent } = require('./generation-agent');
            const feedbackText = report.errors.map(e => `- ${e.id}: ${e.message}`).join('\n');
            console.warn(`[generateCode] single-shot failed verification for ${label} (${report.errors.length} errors); escalating to agent.`);
            const agentHtml = await generateCodeAgent({
                scaffold, plan, base64, mediaType, label,
                prevHtml: html,
                feedbackText,
            });
            return agentHtml || html;
        } catch (e) {
            console.warn(`[generateCode] escalate path failed for ${label} (${e.message}); keeping single-shot.`);
            return html;
        }
    }

    return html;
}

module.exports = {
    buildGenerationSystemPrompt,
    buildGenerationUserText,
    buildPlanInjection,
    generateFigureHtml,
    generateRefinedFigureHtml,
    generateCode,
    extractPayloadFromHtml,
    extractPayloadFromText,
    mergePayloadIntoScaffold,
    fixGeneratedHtml,
    formatPayload,
    looksLikeFullHtmlDocument,
    // Marker constants so the agent can instruct the model precisely.
    MARKERS: { UI_BEGIN_MARKER, UI_END_MARKER, CODE_BEGIN_MARKER, CODE_END_MARKER },
};
