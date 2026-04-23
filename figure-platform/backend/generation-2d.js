/**
 * generation-2d.js — generates inline-interactive HTML figures
 *
 * The figure is reconstructed from scratch and embedded inside a PDF reader.
 * Default state = looks exactly like the original figure.
 * Interactivity = hover/click reveals tooltips and popups. No app chrome.
 *
 * 2D figures  → clean SVG system prompt (no Three.js noise)
 * 3D figures  → 2D prompt + Three.js boilerplate injected into user message
 * mixed       → 2D prompt + Three.js panel section injected
 */

const { generateWithModel } = require('./models');

const OUTPUT_RULES = `OUTPUT RULES — non-negotiable:
- Your response MUST be ONLY a complete, self-contained HTML file. No explanation, no markdown, no code fences.
- It MUST start with exactly: <!DOCTYPE html>
- It MUST end with exactly: </html>
- Do NOT truncate. Output every single line.
- Do NOT embed the original image. Rebuild every element in code.`;

// ── Core 2D system prompt (clean — no Three.js) ────────────────────────────
const SYSTEM_2D = `You are building an interactive figure that lives inline inside a PDF textbook page.

${OUTPUT_RULES}

━━━ THE PRIME DIRECTIVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The default view MUST look like the original figure — same layout, same proportions,
same colors, same labels. A reader glancing at the page should see the figure, not
an app. The interactivity is invisible until they interact.

BANNED from the default view:
  ✗ Title text (the PDF caption already has a title)
  ✗ Subtitle or instruction text ("Click to explore…")
  ✗ Description boxes or lesson panels
  ✗ Toolbars, sidebars, or control panels
  ✗ Buttons visible by default
  ✗ Any UI chrome that wasn't in the original figure

━━━ SIZING — MANDATORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The iframe is already sized to the original figure. Your HTML must fill it 100%.

  html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#fff; }

For SVG: <svg width="100%" height="100%" viewBox="0 0 W H"> — choose W/H to match the
  figure's aspect ratio. NEVER use fixed pixel sizes on the svg element.
For canvas/Three.js: renderer.setSize(window.innerWidth, window.innerHeight)
  + resize listener that updates renderer and camera on window resize.
For multi-panel: outer container width:100%; height:100%; display:grid — no fixed px sizes.

━━━ WHAT THE DEFAULT VIEW MUST REPRODUCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  • Exact spatial layout and proportions of the original
  • Same colors, line weights, fill patterns, node sizes
  • Every label, axis tick, node number, legend item — nothing missing
  • Font: small sans-serif, 10–13px, matching the textbook style
  • 8px inner padding inside the SVG viewBox (not on html/body)

━━━ INTERACTIVITY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Add interactions directly on figure elements. Never add chrome outside the figure.

  • Hover → tooltip near cursor + subtle highlight (color shift or stroke thickens)
  • Click → popup pinned to BOTTOM of iframe (never over the figure) + dismiss on outside-click/Escape

Tooltip (copy exactly):
  position:fixed; background:rgba(0,0,0,0.55); color:#fff;
  font:11px/1.4 sans-serif; padding:5px 8px; border-radius:4px;
  pointer-events:none; z-index:100; max-width:220px;

Popup (copy exactly):
  position:fixed; bottom:0; left:0; right:0;
  background:rgba(245,245,245,0.95); backdrop-filter:blur(6px);
  border-top:1px solid rgba(0,0,0,0.1);
  padding:8px 12px; font:12px/1.5 sans-serif; color:#333; z-index:101;

━━━ RENDERING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  • Diagrams, graphs, matrices, flow charts → inline SVG
  • Scatter/line/contour plots → SVG with correct data values from the figure
  • 3D geometry → see THREE.JS SECTION below (only if the blueprint specifies 3D)

━━━ SELF-CHECK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before outputting, verify:
  1. Default view matches original figure — layout, colors, every label?
  2. html/body have no margin/padding and background is #fff?
  3. SVG uses width="100%" height="100%" — no fixed pixel dimensions?
  4. No title, toolbar, or description visible by default?
  5. All hover/click handlers reference elements that exist in the DOM?
If any answer is NO — fix it first.

━━━ JAVASCRIPT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vanilla JS only (no libraries except Three.js when explicitly needed for 3D).
Wrap all JS in try-catch so a runtime error never leaves a blank white page.`;

// ── Three.js boilerplate — injected into user message for 3D figures ────────
const THREEJS_BOILERPLATE = `
━━━ THREE.JS SECTION (3D figures only) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use Three.js r128 from unpkg CDN. Load from:
  https://unpkg.com/three@0.128.0/build/three.min.js
  https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js

NEVER fake 3D with CSS perspective/transform. Build real Three.js meshes.

MANDATORY SETUP — use this verbatim (do not change renderer background or lighting):

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(0xffffff, 1);  // WHITE — never change this
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Orthographic camera for isometric academic diagrams:
  const aspect = window.innerWidth / window.innerHeight;
  const d = 8;  // adjust scale to fit the scene
  const camera = new THREE.OrthographicCamera(-d*aspect, d*aspect, d, -d, 0.1, 1000);
  camera.position.set(10, 8, 10);  // standard isometric — tune to match original angle
  camera.lookAt(0, 0, 0);

  // Ambient light ONLY — no directional/spot/point lights (flat academic style):
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  // Resize handler (orthographic):
  window.addEventListener('resize', () => {
    const a = window.innerWidth / window.innerHeight;
    camera.left=-d*a; camera.right=d*a; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

MATERIALS — use MeshBasicMaterial (unlit = matches flat diagram style):
  Colored sphere:    new THREE.MeshBasicMaterial({ color:0xcc4444, transparent:true, opacity:0.82 })
  Outline (larger):  new THREE.MeshBasicMaterial({ color:0x222222 })  // placed behind colored sphere
  White/gray node:   new THREE.MeshBasicMaterial({ color:0xeeeeee, transparent:true, opacity:0.90 })
  Box face:          new THREE.MeshBasicMaterial({ color:0xbb7744 })
  Box edges:         new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0x333333}))

NEVER USE: MeshPhongMaterial, MeshStandardMaterial, DirectionalLight, PointLight, SpotLight.
  These produce shiny plastic balls, dark shadows, and look nothing like the original.

CAMERA ANALYSIS — before writing any code, output this comment:
  // x-axis→[dir], y-axis→[dir], z-axis→[dir]
  // elevation ~[N]°, azimuth ~[N]°
  // camera.position.set([x],[y],[z])

For loss surface / paraboloid:  L = a*(φ₀-opt₀)² + b*(φ₁-opt₁)²
  Build as BufferGeometry 60×60 grid. Color: dark rust ~#8b2a1a.
  Gradient path: small MeshBasicMaterial spheres placed ON the surface.

For multi-panel with mixed 2D+3D:
  Each panel = a <div> in a CSS grid. 3D panels get their own <canvas>.
  new THREE.WebGLRenderer({ canvas: panelCanvas }) — render into that canvas only.`;

/**
 * Generate a figure-faithful interactive HTML page.
 */
async function generate2dFigureHtml({ modelId, base64, mediaType, plan, userText, maxTokens = 16000 }) {
  if (!modelId) throw new Error('modelId is required.');
  if (!base64 || !mediaType) throw new Error('base64 and mediaType are required.');

  // Determine if Three.js is needed
  const renderingMode = plan?.renderingMode || 'auto';
  const has3d = renderingMode === '3d' || renderingMode === 'mixed' ||
    plan?.panels?.some(p => p.renderingMode === '3d');

  // Build rendering hint for user message
  let renderingHint = '';
  if (renderingMode === '3d') {
    const cam = plan?.cameraAnalysis || '';
    renderingHint = `\nRENDERING MODE: 3D — use Three.js (see THREE.JS SECTION above).${cam ? '\nCAMERA HINT: ' + cam : ''}`;
  } else if (renderingMode === 'mixed') {
    const panels3d = (plan?.panels || []).filter(p => p.renderingMode === '3d');
    renderingHint = `\nRENDERING MODE: Mixed — panels ${panels3d.map(p => p.id).join(',')} need Three.js canvas; others use SVG.` +
      panels3d.filter(p => p.cameraAnalysis).map(p => `\nPanel ${p.id} camera: ${p.cameraAnalysis}`).join('');
  } else if (renderingMode === '2d') {
    renderingHint = '\nRENDERING MODE: 2D — use inline SVG. Do NOT use Three.js.';
  }

  const planSection = plan
    ? `\n\nFIGURE BLUEPRINT:\n${JSON.stringify(plan, null, 2)}${renderingHint}`
    : renderingHint;

  // Inject Three.js boilerplate into user message only when needed
  const threeSection = has3d ? THREEJS_BOILERPLATE : '';

  const message = userText
    ? `${userText}${planSection}${threeSection}`
    : `Reconstruct this figure as an interactive HTML page.${planSection}${threeSection}

REMEMBER: The default view must look exactly like this figure — same layout, labels, colors, proportions. No title, no description text, no buttons visible by default. Interactivity lives on the elements themselves (hover → tooltip, click → bottom popup). Do NOT embed the image.`;

  const userContent = [
    { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
    { type: 'text', text: message },
  ];

  let html = await generateWithModel(modelId, {
    systemPrompt: SYSTEM_2D,
    userContent,
    maxTokens,
  });

  // Strip accidental markdown fences
  const fenced = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) html = fenced[1].trim();
  html = html
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  return html;
}

module.exports = { generate2dFigureHtml };
