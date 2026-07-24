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
const GENERATION_TASK_GUIDE = `SCAFFOLD MARKERS (fill these only):
- UI HTML: between ${UI_BEGIN_MARKER} and ${UI_END_MARKER}
- Module JS: between ${CODE_BEGIN_MARKER} and ${CODE_END_MARKER}

What the scaffold already provides (do NOT re-declare):
- THREE + OrbitControls imports via importmap
- renderer + <canvas id="c">, scene, orthographic camera (d=3, the frustum half-height in world-units), OrbitControls
  Scale guide: keep main geometry within ±2 units in all axes. Typical sizes: cube side 1–2 units, arrow length 1–2, plane width 2–4, sphere radius 0.05–0.15.
- animate() render loop and ResizeObserver
- setCameraView({ projection, azimuthDeg, elevationDeg, rollDeg, zoom, target, heightFraction, distanceScale }) for source-matched camera setup
  heightFraction: fraction of viewport height the content should fill (default 0.5; use 0.65–0.75 to fill more; lower if UI controls need space). Omit zoom — the scaffold auto-fits from projected scene bounds.
- addLabel(...) + _syncLabels() floating label system
- showPopup(title, body), hidePopup(), showTooltip(text, event), hideTooltip()
- registerInteractive(object, { title, body, tooltip, onClick? }) with built-in raycast hover/click handling

Hard constraints:
- Do not redeclare: addLabel, _labels, _syncLabels, animate, renderer, scene, camera, controls, d, aspect, setCameraView, setStandardView, showPopup, hidePopup, showTooltip, hideTooltip, registerInteractive
- Do not add any import statements or importmaps.
- You may change camera position, controls.target, object scale, and projection parameters to match the source figure's first-frame crop and perspective. Prefer setCameraView (which auto-fits zoom from projected bounds) over setting camera.zoom directly. If you do set camera.zoom manually, call camera.updateProjectionMatrix().
- Keep background white (#ffffff).
- Do NOT reproduce the figure as a texture, canvas drawing, or flat PlaneGeometry with a drawn image.
  Every visible element must be constructed as Three.js geometry (meshes, lines, points, sprites).
  Pasting the original image onto a plane is not a valid solution.
- The default output should look recognizably like the source figure — same general geometry, viewpoint, labels, and proportions. It does not need to be a pixel-perfect same-size replacement.
- Controls, panels, and UI affordances are acceptable when they genuinely aid understanding. Avoid decorative or redundant elements, but do not artificially restrict the type or amount of interaction.
- The generated HTML itself should have an appropriate default camera, framing, and label scale.
- CAMERA / VIEW: PROJECTION TYPE tells you which camera mechanism to use. For the pose and framing, use the plan's CAMERA VIEW parameters (azimuthDeg, elevationDeg, rollDeg, heightFraction) — pass them straight into setCameraView. Only infer these from the source image yourself when the plan omits a CAMERA VIEW block, and only override a provided value when the source plainly contradicts it.
    - Projection cues: parallel depth edges → axonometric/orthographic; vanishing-point convergence or size shrinkage with distance → perspective; undistorted front face with fixed-angle depth edges → oblique.
    - Implement the projection mechanism, not just the visual pose:
        * Axonometric / isometric / dimetric / trimetric: use an off-axis orthographic camera. Do not shear geometry. Canonical angles — isometric: azimuthDeg=45, elevationDeg=35.26; dimetric: one angle differs (read from source); trimetric: both differ. When omitting zoom, the scaffold auto-computes it from the projected bounding box extent — call setCameraView after adding all geometry.
        * Oblique / cabinet / cavalier: use a front-on orthographic camera and shear one root group so depth shifts screen position. Do not rotate the camera to fake oblique.
        * Perspective: use the scaffold's perspective projection option so distance affects apparent size.
  - Align key visual anchors (object center, axes, vanishing directions, labels) to similar relative positions as in the source. The first frame should be recognizable as the same figure.
  - Call setCameraView(...) AFTER all geometry is in the scene (labels come after setCameraView and do not affect auto-fit bounds).
    - For oblique views, add all figure geometry under a single root group, disable automatic matrix updates on that root, and apply one consistent z-to-x/y shear. Use cabinet-like depth compression for compact textbook diagrams unless the source clearly uses full cavalier depth.

- For hover/click explanations, use the scaffold helpers: registerInteractive(object, { title, body, tooltip }) or showPopup(title, body). Visible explanation panels are also acceptable if they aid understanding.
- Interactions can be any type that serves the concept: sliders, buttons, panels, animations, step controls, hover/click, or direct 3D manipulation. Avoid decorative animations with no conceptual purpose.
- If a plan interaction is type "code_editor": build a trace-and-playback demo, not a run-once box.
    1. Define the minimal operation API named in the plan's "api" so that each call AUTO-RECORDS a frame (a snapshot of the data structure/state). The student writes only algorithm logic against this API — never rendering code.
    2. In #ui add a <textarea> seeded with the plan's sample_code, a Run button, and — when the plan supplies buggy_code — a control to load the buggy variant so students can debug it.
    3. Execute student code in a Web Worker with a timeout (~1–2s) so an infinite loop or bad code can never hang the page. On error or timeout, show the message inline. (Only if a Worker is truly impractical, fall back to new Function on the main thread with a guard — but prefer the Worker.)
    4. Play the recorded frames back in the figure with step / play / pause (and a scrubber if the trace is long); the figure animates from the frames, not from a single final result.
    5. Validate the final state and tell the student whether it is correct (e.g. the array actually satisfies the heap property), not just that it ran.
- If a plan interaction is type "equation_input": add one <input> in #ui per entry in the plan's "fields", seeded with each field's default. Parse each expression at runtime over its "variables" (new Function), catch parse errors and show them inline without crashing. On every valid edit, recompute — update BOTH the plotted curve/region/surface AND any derived answer the figure reports (e.g. the integral value), so the student sees the recalculated result, not only the redrawn shape.

Your task:
1) Consider the given plan and what the figure is conceptually intended to illustrate.
2) Fix the camera type and viewing angle BEFORE speccing any geometry — take the projection mechanism from PROJECTION TYPE and the pose from the plan's CAMERA VIEW (fall back to the source image only if the plan omits it). The projection type shapes every geometry decision that follows — which edges are parallel, which faces foreshorten, what angle depth lines leave at. Do NOT call setCameraView yet; fix the angle in your head first.
   - Use the PROJECTION TYPE from the plan and the CAMERA / VIEW rules above.
   - Axonometric: isometric starts at azimuthDeg=45, elevationDeg=35.26; adjust for dimetric/trimetric cues from the source.
   - Perspective: locate the vanishing-point direction and estimate field of view from the source.
   - Oblique: camera stays front-on; all depth will be applied via shear on a root group, not camera rotation.
3) Decide the Three.js primitive for every element in the plan, informed by the camera angle you just fixed.
   Ask: is this a line, a mesh, a point, an arrow? What geometry class? What approximate size and color?
   Express this as brief inline comments at the top of your JS block, one line per element, e.g.:
     // pinhole → SphereGeometry(0.07)  black
     // ray     → Line  dashed  grey
     // plane   → PlaneGeometry(4,3)  blue opacity 0.3
   Then build exactly those primitives — do not deviate from your own spec.
4) Build the static geometry first. Count the visible primitives and line segments, preserve relative scale and spacing, and take note of depth ordering and occlusion. Use projection logic to decide which edges should converge, which faces should be foreshortened, and which dimensions should compress in depth.
5) Call setCameraView(...) AFTER all geometry is in the scene so the auto-fit has correct bounds. Pass the plan's CAMERA VIEW parameters for azimuthDeg / elevationDeg / rollDeg / heightFraction (fall back to values inferred from the source only if the plan omits them). Omit zoom — the scaffold projects the bounding box to find the right fit automatically. Example:
   setCameraView({
     projection: 'orthographic',
     azimuthDeg: 35,
     elevationDeg: 18,
     heightFraction: 0.62,
   });
6) Add ALL visible text labels using addLabel(htmlString, THREE.Vector3, options?).
    Missing or incorrect labels are a critical failure.  Make sure to match the font size with the original image. Treat labels and annotations as spatial cues so their placement reinforces the geometry and depth.
7) Render a source-matching first frame. Only after that, add interactivity:
   - Choose interaction types based on what best teaches the concept: sliders, toggles, buttons, step panels, animations, hover/click highlights, or direct 3D manipulation — all are valid.
   - Use registerInteractive(object, { title, body, tooltip }) or showPopup(title, body) for hover/click explanations on 3D objects; visible UI panels for explanations are also acceptable.
   - Keep one state object + updateScene() if multiple states are needed.
   - If demo_steps are provided, implement them as navigable steps using whatever UI best fits — visible step controls, buttons, or clicks on scene elements.

Output format (return ONLY this, nothing else):
${UI_BEGIN_MARKER}
...UI HTML...
${UI_END_MARKER}
${CODE_BEGIN_MARKER}
...JavaScript...
${CODE_END_MARKER}`;

// === Code Divider =============================================================
function getGenerationTaskGuide() {
    if (process.env.GENERATION_PROFILE !== 'standalone-demo') return GENERATION_TASK_GUIDE;

    return `SCAFFOLD MARKERS (fill these only):
- UI HTML: between ${UI_BEGIN_MARKER} and ${UI_END_MARKER}
- Module JS: between ${CODE_BEGIN_MARKER} and ${CODE_END_MARKER}

What the scaffold already provides (do NOT re-declare):
- THREE + OrbitControls imports via importmap
- renderer + <canvas id="c">, scene, orthographic camera (d=3, the frustum half-height in world-units), OrbitControls
  Scale guide: keep main geometry within ±2 units in all axes. Typical sizes: cube side 1–2 units, arrow length 1–2, plane width 2–4, sphere radius 0.05–0.15.
- animate() render loop and ResizeObserver
- setCameraView({ projection, azimuthDeg, elevationDeg, rollDeg, zoom, target, heightFraction, distanceScale })
  heightFraction: fraction of viewport height the content should fill (default 0.5; use 0.65–0.75 to fill more). Omit zoom — the scaffold auto-fits from projected scene bounds.
- addLabel(...) + _syncLabels() floating label system
- showPopup(title, body), hidePopup(), showTooltip(text, event), hideTooltip()
- registerInteractive(object, { title, body, tooltip, onClick? }) with built-in raycast hover/click handling

Hard technical constraints:
- Do not redeclare scaffold globals: addLabel, _labels, _syncLabels, animate, renderer, scene, camera, controls, d, aspect, setCameraView, setStandardView, showPopup, hidePopup, showTooltip, hideTooltip, registerInteractive.
- Do not add import statements or importmaps.
- Keep visible figure elements as real Three.js geometry (meshes, lines, points, sprites). Do NOT paste the source image onto a plane/texture/canvas.
- Keep the scene readable and mechanically robust: no controls covering important geometry, no off-screen panels, no horizontal page overflow, no decorative motion that distracts from the concept.

Standalone demo profile:
- This is a standalone interactive learning demo, not an inline PDF replacement.
- The default view should still be recognizable as the source figure, but it does not need to preserve the exact same crop, whitespace, or minimal UI.
- Use the UI marker block to create learner-facing demo affordances when they help: concise control strip, step controls, reset, parameter sliders/toggles, legend, or explanation panel.
- Do not hide all teaching behind click popups. Include at least one visible explanatory affordance in the page UI, such as a short "What this shows" panel, active step narration, or compact concept readout.
- If the figure has adjustable variables, include visible controls for the most important 1-3 variables. If it has a sequence/process, include visible step controls. If it is mostly spatial, include guided view/annotation controls.
- Interactions should be chosen from the concept, not added generically. Every visible control must change geometry, labels, highlighted state, camera/view, or explanation in a way that teaches something.
- For a "code_editor" interaction: build a trace-and-playback demo. The plan's "api" functions must auto-record a frame per call (student writes only logic); seed a <textarea> with sample_code + a Run button + a load-buggy control when buggy_code is given; run student code in a Web Worker with a ~1–2s timeout (fall back to guarded new Function only if a Worker is impractical) and show errors/timeouts inline; play recorded frames back with step/play/pause; and validate the final state, reporting whether it is correct. For an "equation_input" interaction: one <input> per plan "field" seeded with its default; parse each expression over its "variables" at runtime, catch parse errors inline, and on every valid edit recompute BOTH the redrawn curve/region/surface AND any derived answer the figure reports (e.g. the integral value).
- Direct 3D manipulation still matters: keep OrbitControls, hover/click highlights, and object-specific explanations for meaningful meshes/lines/points.
- It is acceptable for the UI to be more demo-like than figure-like: a compact title, explanation card, state readout, or guided-step bar is allowed.

Projection implementation rules:
- Axonometric / isometric / dimetric / trimetric: use an off-axis orthographic camera and no shear. Isometric: azimuthDeg=45, elevationDeg=35.26. Omit zoom and call setCameraView after all geometry — auto-fit uses projected bounds.
- Oblique / cabinet / cavalier: use a front-on orthographic camera and one sheared root group; keep the front face undistorted and compress depth for cabinet-style textbook diagrams.
- Perspective: use a true perspective camera only when the source has vanishing-point convergence or distance-based size shrinkage.

Your task:
1) Consider the plan and the source figure's teaching goal.
2) Fix the camera type and viewing angle BEFORE speccing geometry — projection mechanism from PROJECTION TYPE, pose from the plan's CAMERA VIEW (fall back to the source image only if the plan omits it). The projection type shapes every geometry decision that follows. Do NOT call setCameraView yet.
3) Decide the Three.js primitive for every major visual element, informed by the camera angle you just fixed.
4) Build a recognizable static 3D reconstruction. Call setCameraView(...) with the plan's CAMERA VIEW params AFTER all geometry is in the scene (labels follow setCameraView and do not affect auto-fit bounds).
5) Add a compact standalone demo UI that helps a learner explore the concept. Prefer meaningful controls and guided states over passive screenshots.
6) Register major explanatory objects with hover/click behavior and connect UI controls to updateScene().
7) Make sure reset returns the demo to its default state when a reset control exists.

Output format (return ONLY this, nothing else):
${UI_BEGIN_MARKER}
...UI HTML...
${UI_END_MARKER}
${CODE_BEGIN_MARKER}
...JavaScript...
${CODE_END_MARKER}`;
}

// === Code Divider =============================================================
function buildGenerationSystemPrompt(scaffold) {
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

${getGenerationTaskGuide()}`;
}
// === Code Divider =============================================================
function buildGenerationRefinementPrompt(scaffold, prevHtml, evaluation) {
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
    ].join('\n');

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

${getGenerationTaskGuide()}

CRITIC FEEDBACK ON PREVIOUS ATTEMPT:
${issues}

PREVIOUS GENERATED PAYLOAD (edit this; do NOT output full HTML):
${prevPayloadText}

Fix all identified failure modes and improve every score. Maintain or improve what already works well.
This includes re-checking the CAMERA / VIEW MATCHING REQUIREMENTS above even if no camera-specific failure mode was listed — a passing score on other metrics does not mean the camera/view is correct.
Return ONLY the updated marker-wrapped payload.`;
}

const PROJECTION_GUIDELINES = {
    perspective: `Use the scaffold's true perspective projection after building all geometry. Use this only when the source has real vanishing-point convergence or distance-based size shrinkage; then depth should visibly affect apparent size.`,
    axonometric: `Use ordinary orthographic projection with an off-axis camera/view. Canonical angles: isometric → azimuthDeg=45, elevationDeg=35.26; dimetric → one angle differs from isometric (infer from source axis foreshortening); trimetric → both azimuth and elevation differ. Parallel 3D line families must remain parallel. Do not shear geometry. Omit zoom and call setCameraView after all geometry is added — the scaffold auto-fits from the projected bounding box.`,
    oblique: `Use an orthographic camera locked front-on, and create the 3D-looking depth by shearing one root group containing all figure geometry. Do not rotate the camera to fake oblique. Keep the front face undistorted; use cabinet-like depth compression unless the source clearly uses full cavalier depth.`,
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
        if (ip.camera_view) {
            sections.push(`CAMERA VIEW (estimated from the source so the first frame matches the original figure). Call setCameraView({ projection, ...these }) AFTER all geometry is added. Keep the projection MECHANISM from PROJECTION TYPE above (orthographic / sheared-oblique / perspective); these params set only the pose (azimuth/elevation/roll) and framing (heightFraction). Start from exactly these values — change an angle only if the source image plainly contradicts it:\n${JSON.stringify(ip.camera_view, null, 2)}`);
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

function buildGenerationUserText(plan) {
    if (!plan) {
        return 'Analyse this figure carefully. Then output ONLY the scaffold fill-in payload using the required markers. No explanation, no markdown, no fences.';
    }
    return `${buildPlanInjection(plan)}\n\nFollow the interaction plan above. Output ONLY the scaffold fill-in payload using the required markers. No explanation, no markdown, no fences.`;
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
        systemPrompt: buildGenerationSystemPrompt(scaffold),
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
        systemPrompt: buildGenerationRefinementPrompt(scaffold, prevHtml, evaluation),
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
                modelId, scaffold, prevHtml, evaluation, mediaType, base64,
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
    // Marker constants so the agent can instruct the model precisely.
    MARKERS: { UI_BEGIN_MARKER, UI_END_MARKER, CODE_BEGIN_MARKER, CODE_END_MARKER },
};
