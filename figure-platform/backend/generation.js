const { generateWithModel } = require('./models');

// === Code Divider =============================================================
const BASE_ROLE = 'You are an expert Three.js developer who converts 2D textbook figures into interactive 3D web visualizations.';

// Scaffold insertion markers (must match backend/base_scene_new.html)
const UI_BEGIN_MARKER = '<!-- @FIGURE_UI_BEGIN -->';
const UI_END_MARKER = '<!-- @FIGURE_UI_END -->';
const CODE_BEGIN_MARKER = '// @FIGURE_CODE_BEGIN';
const CODE_END_MARKER = '// @FIGURE_CODE_END';
// === Code Divider =============================================================
const BASE_OUTPUT_RULES = `OUTPUT RULES - non-negotiable:
- Your response must be only the scaffold fill-in payload, not a full HTML file.
- It must contain these exact markers (even if sections are empty):
        ${UI_BEGIN_MARKER} ... ${UI_END_MARKER}
        ${CODE_BEGIN_MARKER} ... ${CODE_END_MARKER}
- Between the UI markers: output only HTML that belongs inside <div id="ui"> (no <html>, <head>, <body>, <script>, or <style>).
- Between the code markers: output only JavaScript that runs inside the existing <script type="module">. Do NOT add imports, importmaps, or re-declare scaffold globals.
- Do not include any other text. No explanation, no markdown, no code fences.`;

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
const SHARED_SCAFFOLD_GUIDE = `SCAFFOLD MARKERS (fill these only):
- UI HTML: between ${UI_BEGIN_MARKER} and ${UI_END_MARKER}
- Module JS: between ${CODE_BEGIN_MARKER} and ${CODE_END_MARKER}

What the scaffold already provides (do NOT re-declare):
- THREE + OrbitControls imports via importmap
- renderer + <canvas id="c">, scene, orthographic camera (d, aspect), OrbitControls
- animate() render loop and ResizeObserver
- setCameraView({ projection, azimuthDeg, elevationDeg, rollDeg, zoom, target, heightFraction, distanceScale }) for source-matched camera setup
- addLabel(...) + _syncLabels() floating label system
- showPopup(title, body), hidePopup(), showTooltip(text, event), hideTooltip()
- registerInteractive(object, { title, body, tooltip, onClick? }) with built-in raycast hover/click handling

Hard constraints:
- Do not redeclare: addLabel, _labels, _syncLabels, animate, renderer, scene, camera, controls, d, aspect, setCameraView, setStandardView, showPopup, hidePopup, showTooltip, hideTooltip, registerInteractive
- Do not add any import statements or importmaps.
- Keep background white (#ffffff).
- Do NOT reproduce the figure as a texture, canvas drawing, or flat PlaneGeometry with a drawn image.
    Every visible element must be constructed as Three.js geometry (meshes, lines, points, sprites).
    Pasting the original image onto a plane is not a valid solution.
- INLINE AUGMENTATION MODE: default output must look like a same-size replacement for the original PDF figure.
- Do not rely on the PDF reader to fix composition after generation. The generated HTML itself must have the right default camera, framing, label scale, and minimal UI.

Output format (return ONLY this, nothing else):
${UI_BEGIN_MARKER}
...UI HTML...
${UI_END_MARKER}
${CODE_BEGIN_MARKER}
...JavaScript...
${CODE_END_MARKER}`;

const GEOMETRY_TASK_GUIDE = `PHASE 1 - GEOMETRY ONLY
Goal: reconstruct the source figure as faithful static Three.js geometry.

CRITICAL — NO 2D CANVAS ALLOWED:
You MUST build a real 3D scene. Do NOT use canvas 2D drawing, CanvasTexture, or a flat PlaneGeometry with a drawn or pasted image.
Every visible element — shapes, lines, arrows, labels, axes — must be a Three.js 3D primitive (BoxGeometry, SphereGeometry, CylinderGeometry, Line, Points, ArrowHelper, etc.).
Putting the source image on a plane as a texture is always wrong.

Use the original generation instructions that affect visual reconstruction:
- You may change camera.zoom, camera position, controls.target, object scale, and projection parameters only to match the source figure's first-frame crop and perspective. If you change camera.zoom or camera bounds, call camera.updateProjectionMatrix().
- Do NOT put bulky controls, toolbars, step buttons, legends, title cards, or description panels in the UI marker block.
- UI marker block should be empty in Phase 1.

CAMERA / VIEW MATCHING REQUIREMENTS:
- The first rendered frame must be a drop-in visual replacement for the source image.
- Match the original figure's camera angle, crop, zoom, object scale, and apparent perspective.
- Before calling setCameraView, sanity-check the provided azimuth/elevation against the actual world-space coordinates you placed objects at: identify the dominant baseline/axis/edge in YOUR geometry and the direction it runs in world space (e.g. along X, along Z, diagonal), then check whether the provided azimuth would view that baseline the same way it appears in the source image (roughly broadside vs. roughly along it). If your own layout doesn't match what the provided azimuth assumes, override it with the value that actually does — you built the geometry, so you are in the best position to know which number is consistent with it. Do not blindly pass the plan's numbers through if they contradict the geometry you just built.
- Call setCameraView(...) AFTER adding all geometry and labels, using the (possibly corrected) values.
- Estimate the source view from visible cues: parallel lines imply orthographic or weak perspective; converging lines imply perspective; apparent ellipse/face shapes imply camera elevation and azimuth.
- Align key visual anchors (main object center, axes, vanishing directions, horizon/ground plane, labels, arrow endpoints, and panel boundaries) to the same relative positions in the iframe.
- Frame the scene so it matches the original figure crop. Do not force-fill if the original has whitespace; preserve the source figure's margins, aspect, and label density.

Your task:
1) Before writing any code, decide the Three.js primitive for every visible element.
     Ask: is this a line, a mesh, a point, an arrow? What geometry class? What approximate size and color?
     Express this as brief inline comments at the top of your JS block, one line per element, e.g.:
         // pinhole → SphereGeometry(0.07)  black
         // ray     → Line  dashed  grey
         // plane   → PlaneGeometry(4,3)  blue opacity 0.3
     Then build exactly those primitives — do not deviate from your own spec.
2) Remember that you are converting a 2D image into a 3D figure. First infer the camera location and angle, then reason about how that viewpoint changes the shapes you should draw: where the viewer is, how high the eye point is, and whether the view is tilted, rotated, or centered.
3) Build the static geometry first. Count the visible primitives and line segments, preserve relative scale and spacing, and take note of depth ordering and occlusion. Use projection logic to decide which edges should converge, which faces should be foreshortened, and which dimensions should compress in depth.
4) Set camera view/zoom/crop to match the source view. Tune azimuth, elevation, distance, target, and object scale until the first frame overlays the source image's shape and composition. Use setCameraView(...) instead of manually positioning camera whenever camera_view is present in the plan.
5) Add ALL visible text labels using addLabel(htmlString, THREE.Vector3, options?). Missing or incorrect labels are a critical failure. Make sure to match the font size with the original image. Treat labels and annotations as spatial cues so their placement reinforces the geometry and depth.`;

const CONTENT_TASK_GUIDE = `PHASE 2 - CONTENT AND INTERACTIVITY ONLY
Goal: preserve the approved geometry exactly, then layer useful interactions and explanations on top.

Planner output usage:
- Treat the planner output as the content contract for Phase 2: implement its interactions, demo_steps, notes, and textbook context as faithfully as possible.
- Use plan elements only as anchors for selecting existing approved geometry to make interactive or explanatory. Do not rebuild those elements.
- If a planned interaction refers to geometry that exists in the approved payload, wire the interaction to that existing object or group.
- If the plan asks for an impossible or geometry-changing interaction, implement the closest content-only version and explain the concept with hover/click/popup text instead of altering locked geometry.

Use the original generation instructions that affect interactivity and teaching:
- Do NOT put bulky controls, toolbars, step buttons, legends, title cards, or description panels in the UI marker block.
- UI marker block should usually be empty. If controls are genuinely needed, add at most 2 compact sliders/toggles with very short labels; no buttons except hidden/internal triggers. Controls must be visible near an edge, with no filled box over the figure.
- Explanations must use the scaffold helpers: registerInteractive(object, { title, body, tooltip }) for meaningful objects, or showPopup(title, body) for custom click flows. Do not create visible explanation panels inside the figure.
- Interactions should be intuitive direct manipulation: OrbitControls drag/rotate, click a meaningful part, hover a label/vector/surface. No decorative animations.

Your task:
1) Treat the previous payload as locked geometry. Copy existing Three.js objects, setCameraView calls, labels, colors, positions, and scale exactly.
2) Only add or repair the interaction layer: event handlers, registerInteractive calls, compact controls, state/update functions, hover/click behavior, tooltip text, and popup text. Do not change geometry, camera, labels, colors, positions, scale, or source-matched framing to address content feedback.
3) Add interactivity after preserving the source-matching first frame:
    - Use direct manipulation first: OrbitControls, hover highlight, click-to-explain.
    - Every direct manipulation interaction must explain the concept on hover/click without adding a visible explainer panel.
    - Register every major explanatory mesh/line/group with registerInteractive(object, { title, body, tooltip }).
    - At least one meaningful object MUST produce a click popup with 2-3 sentences explaining the concept.
    - Use showPopup(title, body) only for custom click flows; otherwise prefer registerInteractive.
    - Add compact sliders/toggles only for real figure parameters (e.g. wavelength, angle, sharpness); place them near an edge without a filled panel so they do not cover geometry, labels, or equations.
    - Keep one state object + updateScene() if hidden states are needed.
    - If demo_steps are provided, make them callable from clicks on meaningful scene elements, not visible toolbar buttons.

Exclusions:
- Do not rebuild, rename, rescale, recolor, or reposition approved Phase 1 geometry.
- Do not change the default camera/crop unless the content itself makes the figure unreadable.
- Do not add visible explanation panels inside the figure.`;

const FULL_TASK_GUIDE = `FULL GENERATION MODE
When no two-phase split is being used, do both tasks in order:
1) First follow the Phase 1 geometry-only guidance until the first rendered frame matches the source.
2) Then follow the Phase 2 content guidance to add compact, pedagogically useful interactions.
Never let interaction chrome or narration compromise source-matched geometry.`;

function normalizeGenerationPhase(phase) {
    return ['geometry', 'content', 'full'].includes(phase) ? phase : 'full';
}

function buildGenerationTaskGuide(phase = 'full') {
    const resolvedPhase = normalizeGenerationPhase(phase);
    const phaseGuide = resolvedPhase === 'geometry'
        ? GEOMETRY_TASK_GUIDE
        : resolvedPhase === 'content'
            ? CONTENT_TASK_GUIDE
            : `${GEOMETRY_TASK_GUIDE}\n\n${CONTENT_TASK_GUIDE}\n\n${FULL_TASK_GUIDE}`;

    return `${SHARED_SCAFFOLD_GUIDE}\n\n${phaseGuide}`;
}

// === Code Divider =============================================================
function buildGenerationSystemPrompt(scaffold, phase = 'full') {
    if (!scaffold) throw new Error('scaffold is required.');

    const header = buildPromptHeader({
        scaffold,
        scaffoldIntro: `BASE SCAFFOLD - DO NOT copy this file into your response.
The backend will keep this scaffold and insert your payload at the markers:
- UI:   ${UI_BEGIN_MARKER} ... ${UI_END_MARKER}
- CODE: ${CODE_BEGIN_MARKER} ... ${CODE_END_MARKER}
Only output the marker blocks. Do NOT modify, remove, or re-declare anything already in the scaffold.`,
    });

    return `${header}

SCAFFOLD USAGE RULES:
- Do NOT output the scaffold.
- Output ONLY the marker-wrapped payload (UI + JS).
- The scaffold already includes the importmap and imports for Three.js + OrbitControls.
    Do NOT add another <script type="importmap"> or any import statements.
- Do NOT re-declare scaffold globals; only add objects to scene and wire UI to state.

${buildGenerationTaskGuide(phase)}`;
}
// === Code Divider =============================================================
function getPhaseScoreKeys(phase = 'full') {
    const resolvedPhase = normalizeGenerationPhase(phase);
    if (resolvedPhase === 'geometry') return ['geometry_accuracy', 'faithfulness', 'label_quality'];
    if (resolvedPhase === 'content') return ['interactivity_usability', 'concept_accuracy'];
    return ['geometry_accuracy', 'interactivity_usability', 'faithfulness', 'label_quality', 'concept_accuracy'];
}

function formatEvaluationFeedback(evaluation, phase = 'full') {
    const scoreKeys = getPhaseScoreKeys(phase);
    const lines = [];

    for (const mode of evaluation.failure_modes || []) {
        lines.push(`- failure: ${mode}`);
    }
    for (const key of scoreKeys) {
        if (evaluation[key] === undefined || evaluation[key] === null) continue;
        lines.push(`- ${key}: ${evaluation[key]}/5`);
        const improvement = evaluation[`${key}_improvement`];
        if (improvement) lines.push(`  improvement: ${improvement}`);
    }
    if (evaluation.notes) lines.push(`- notes: ${evaluation.notes}`);
    for (const item of evaluation.action_items || []) {
        lines.push(`- action: ${item}`);
    }

    return lines.length ? lines.join('\n') : '- No structured critic feedback was provided.';
}

function buildGenerationRefinementPrompt(scaffold, prevHtml, evaluation, anchorNote = '', phase = 'full') {
    if (!scaffold) throw new Error('scaffold is required.');
    if (!prevHtml) throw new Error('prevHtml is required.');
    if (!evaluation) throw new Error('evaluation is required.');

    const prevPayload = extractPayloadFromHtml(prevHtml);
    const prevPayloadText = prevPayload
        ? formatPayload(prevPayload)
        : '(Could not find scaffold markers in previous HTML. Output a fresh payload using the required markers.)';

    const header = buildPromptHeader({
        scaffold,
        roleSuffix: 'improving a previous attempt based on critic feedback.',
        scaffoldIntro: `The BASE SCAFFOLD is fixed and will be used at runtime. Do NOT output it.
Only output an improved payload for these markers:
- UI:   ${UI_BEGIN_MARKER} ... ${UI_END_MARKER}
- CODE: ${CODE_BEGIN_MARKER} ... ${CODE_END_MARKER}`,
        framedScaffold: false,
    });

    return `${header}

${buildGenerationTaskGuide(phase)}

${anchorNote ? `ANCHOR NOTE: ${anchorNote}\n\n` : ''}CRITIC FEEDBACK ON PREVIOUS ATTEMPT:
${formatEvaluationFeedback(evaluation, phase)}

PREVIOUS GENERATED PAYLOAD (edit this; do NOT output full HTML):
${prevPayloadText}

Fix all identified failure modes and improve every phase-relevant score. Maintain or improve what already works well.
${normalizeGenerationPhase(phase) === 'content'
            ? 'Keep the approved geometry locked while fixing content and interaction issues.'
            : 'This includes re-checking the CAMERA / VIEW MATCHING REQUIREMENTS above even if no camera-specific failure mode was listed — a passing score on other metrics does not mean the camera/view is correct.'}
Return ONLY the updated marker-wrapped payload.`;
}

function buildPlanInjection(plan, phase = 'full') {
    if (!plan) return '';
    const resolvedPhase = normalizeGenerationPhase(phase);
    const parts = [];
    if (plan.contextChunk && resolvedPhase !== 'geometry') {
        parts.push(`CONTEXT FROM TEXTBOOK:\n${plan.contextChunk.slice(0, 3000)}`);
    }
    if (plan.interactionPlan) {
        const ip = plan.interactionPlan;
        const sections = [];
        if (ip.elements?.length && resolvedPhase !== 'content') {
            sections.push(`ELEMENTS TO RECREATE IN 3D:\n${ip.elements.map(e => `  - ${e}`).join('\n')}`);
        }
        if (ip.elements?.length && resolvedPhase === 'content') {
            sections.push(`APPROVED GEOMETRY ANCHORS FROM PLAN (use only to identify existing objects for interactions; do not rebuild):\n${ip.elements.map(e => `  - ${e}`).join('\n')}`);
        }
        if (ip.interactions?.length && resolvedPhase !== 'geometry') {
            sections.push(`DISCRETE CONTROLS (implement every one of these in #ui, each must work independently):\n${JSON.stringify(ip.interactions, null, 2)}`);
        }
        if (ip.demo_steps?.length && resolvedPhase !== 'geometry') {
            sections.push(`DEMO STEPS (tween through these using goToStep(); each step drives the controls above):\n${JSON.stringify(ip.demo_steps, null, 2)}`);
        }
        if (ip.camera_view && resolvedPhase !== 'content') {
            sections.push(`CAMERA VIEW PARAMETERS (source-image estimate; call setCameraView with these after building geometry):\n${JSON.stringify(ip.camera_view, null, 2)}`);
        }
        if (ip.camera_suggestion && resolvedPhase !== 'content') {
            sections.push(`CAMERA: ${ip.camera_suggestion}`);
        }
        if (ip.notes) {
            sections.push(`NOTES: ${ip.notes}`);
        }
        if (sections.length) parts.push(sections.join('\n\n'));
    }
    return parts.join('\n\n');
}

function buildGenerationUserText(plan, phase = 'full') {
    const resolvedPhase = normalizeGenerationPhase(phase);
    const payloadRule = 'Output ONLY the scaffold fill-in payload using the required markers. No explanation, no markdown, no fences.';

    if (resolvedPhase === 'geometry') {
        const injection = buildPlanInjection(plan, 'geometry');
        return `${injection ? `${injection}\n\n` : ''}Analyse the source figure carefully. Build only the static 3D geometry, camera, crop, colors, and labels needed for a source-matching first frame. Leave UI empty and add no interactivity. ${payloadRule}`;
    }

    if (resolvedPhase === 'content') {
        const injection = buildPlanInjection(plan, 'content');
        return `${injection ? `${injection}\n\n` : ''}Read the planner output above before editing the payload. Preserve the approved geometry from the previous payload exactly, then implement the plan's interactions, demo steps, compact controls, hover/click explanations, and concept content on top of existing objects. ${payloadRule}`;
    }

    if (!plan) {
        return `Analyse this figure carefully. First build source-matching static geometry, then add compact useful interactivity. ${payloadRule}`;
    }
    return `${buildPlanInjection(plan, 'full')}\n\nFollow the plan above: first match the source geometry and camera, then add only compact planned interactions. ${payloadRule}`;
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

    // Remove conflicting updateLabels helpers.
    const updateLabelsDupes = [...fixed.matchAll(/^[ \t]*(function updateLabels\b[^{]*\{)/gm)];
    if (updateLabelsDupes.length > 0) {
        for (let i = updateLabelsDupes.length - 1; i >= 0; i--) {
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
    phase = 'full',
    maxTokens = 16384,
    applyFixes = true,
}) {
    if (!modelId) throw new Error('modelId is required.');
    if (!scaffold) throw new Error('scaffold is required.');
    if (!mediaType || !base64) throw new Error('mediaType and base64 are required.');
    const resolvedPhase = normalizeGenerationPhase(phase);
    const resolvedUserText = userText || buildGenerationUserText(plan, resolvedPhase);

    if (!resolvedUserText) throw new Error('Could not resolve userText for generation.');

    const userContent = [
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
        { type: 'text', text: resolvedUserText },
    ];

    let out = await generateWithModel(modelId, {
        systemPrompt: buildGenerationSystemPrompt(scaffold, resolvedPhase),
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
    anchorNote = '',
    phase = 'full',
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
        { type: 'text', text: userText },
    ];

    let out = await generateWithModel(modelId, {
        systemPrompt: buildGenerationRefinementPrompt(scaffold, prevHtml, evaluation, anchorNote, phase),
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
 *   phase?: 'geometry' | 'content' | 'full',
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
        phase = 'full',
        maxTokens = 16384,
        applyFixes = true,
    } = opts;

    if (!scaffold) throw new Error('scaffold is required');
    if (!modelId) throw new Error('modelId is required');
    if (!mediaType || !base64) throw new Error('mediaType and base64 are required');

    // REFINEMENT MODE: previous generation + evaluation feedback
    if (prevHtml && evaluation) {
        const refinementUserText = userText || buildGenerationUserText(plan, phase);
        return generateRefinedFigureHtml({
            modelId,
            scaffold,
            prevHtml,
            evaluation,
            mediaType,
            base64,
            userText: refinementUserText,
            phase,
            maxTokens,
            applyFixes,
        });
    }

    // FRESH GENERATION MODE
    const generationUserText = userText || buildGenerationUserText(plan, phase);
    return generateFigureHtml({
        modelId,
        scaffold,
        mediaType,
        base64,
        plan,
        userText: generationUserText,
        phase,
        maxTokens,
        applyFixes,
    });
}

// ── Phase-specific wrappers ───────────────────────────────────────────────────
// These thin wrappers adapt the existing generators for the two-phase pipeline.
// Phase 1 focuses on static geometry only; Phase 2 layers interactivity on top.

async function generateGeometryHtml(opts) {
    return generateFigureHtml({
        ...opts,
        plan: null,
        phase: 'geometry',
        userText: opts.userText || buildGenerationUserText(null, 'geometry'),
    });
}

async function generateRefinedGeometryHtml(opts) {
    return generateRefinedFigureHtml({
        ...opts,
        phase: 'geometry',
        userText: opts.userText || buildGenerationUserText(null, 'geometry'),
    });
}

async function generateContentLayerHtml({ approvedGeometryHtml, plan, geoEvaluation, ...opts }) {
    return generateRefinedFigureHtml({
        ...opts,
        prevHtml: approvedGeometryHtml,
        evaluation: {
            failure_modes: ['No interactive controls have been added yet — geometry only'],
            notes: `Geometry approved${geoEvaluation?.overall_average ? ` with Phase 1 average ${geoEvaluation.overall_average}/5` : ''}. Add all planned interactive controls and concept explanations.`,
        },
        userText: buildGenerationUserText(plan, 'content'),
        anchorNote: 'The geometry in PREVIOUS GENERATED PAYLOAD is approved and locked. Copy it exactly. Only add planned interactions, compact controls, event handlers, tooltip text, and popup text after it. Do not modify existing Three.js objects, setCameraView calls, addLabel calls, colors, positions, scale, or framing.',
        phase: 'content',
    });
}

async function generateRefinedContentLayerHtml({ approvedGeometryHtml, plan, prevHtml, evaluation, ...opts }) {
    return generateRefinedFigureHtml({
        ...opts,
        prevHtml,
        evaluation,
        userText: buildGenerationUserText(plan, 'content'),
        anchorNote: 'Geometry from Phase 1 is locked. For this refine_generation pass, do not modify existing Three.js geometry, camera/setCameraView, addLabel calls, colors, positions, scale, or framing. Fix only the interaction layer: registerInteractive calls, event handlers, compact controls, hover/click behavior, tooltip text, and popup text.',
        phase: 'content',
    });
}

module.exports = {
    buildGenerationSystemPrompt,
    buildGenerationUserText,
    generateFigureHtml,
    generateRefinedFigureHtml,
    generateCode,
    generateGeometryHtml,
    generateRefinedGeometryHtml,
    generateContentLayerHtml,
    generateRefinedContentLayerHtml,
    extractPayloadFromHtml,
    formatPayload,
};
