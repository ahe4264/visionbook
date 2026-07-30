/**
 * critic.js — shared critic (evaluator) definition
 *
 * Used by the web generation pipeline.
 * Edit this file to change what the critic looks for, how it scores, or what it outputs.
 */

const { generateWithModel } = require('./models');
const { screenshotHtml } = require('./runtime-helpers');
const { extractPayloadFromHtml, formatPayload } = require('./generation');

const CRITIC_DEFAULT_MODEL = 'claude-opus-4.7';
const CRITIC_MAX_TOKENS = 8196;
// Change this value to start a new evaluation experiment namespace.
const CRITIC_EXPERIMENT_BASE = 'default_critic';

// ── One-shot calibration example (mpkqucxkwn9z1 — epipolar geometry figure) ──
const EXAMPLE_PAYLOAD = "<!-- @FIGURE_UI_BEGIN -->\n<label title=\"Rotating Camera 2 changes its image plane orientation and therefore where the red ray projects as an epipolar line.\">\n  Rotate Camera 2: <span id=\"rotationCamera2Value\">0°</span>\n  <input id=\"rotationCamera2\" type=\"range\" min=\"0\" max=\"360\" step=\"1\" value=\"0\">\n</label>\n<label title=\"Translating Camera 2 changes the stereo baseline T and shifts the epipole and epipolar line.\">\n  Translate Camera 2: <span id=\"translationCamera2Value\">0.0</span>\n  <input id=\"translationCamera2\" type=\"range\" min=\"-10\" max=\"10\" step=\"0.1\" value=\"0\">\n</label>\n<div style=\"display:flex;gap:4px;flex-wrap:wrap;width:230px;\">\n  <button id=\"step0\">Initial Setup</button>\n  <button id=\"step1\">Rotate Camera 2</button>\n  <button id=\"step2\">Translate Camera 2</button>\n</div>\n<div id=\"stepNarration\" style=\"max-width:245px;line-height:1.28;background:rgba(255,255,255,0.9);border:1px solid #d8d8d8;border-radius:6px;padding:7px 9px;\">\n  Here, you see the red ray from Camera 1 and its red epipolar-line projection on image plane 2.\n</div>\n<!-- @FIGURE_UI_END -->\n// @FIGURE_CODE_BEGIN\nrenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));\n\nconst state = {\n  rotationCamera2: 0,\n  translationCamera2: 0,\n  activeStep: 0,\n  tween: null\n};\n\nconst BLACK = 0x111318;\nconst SOFT_BLACK = 0x1b1d22;\nconst RED = 0xff1010;\nconst GREEN = 0x22e000;\nconst BLUE = 0x2878ff;\nconst CYAN = 0x60f3ef;\nconst MAGENTA = 0xff76b7;\nconst WHITE = 0xffffff;\n\nconst fixedGroup = new THREE.Group();\nconst dynamicGroup = new THREE.Group();\nscene.add(fixedGroup, dynamicGroup);\n\nconst worldUp = new THREE.Vector3(0, 1, 0);\nconst C1 = new THREE.Vector3(-4.65, -1.65, -0.12);\nconst P = new THREE.Vector3(0.75, 1.95, 0.56);\nconst rayDir1 = new THREE.Vector3().subVectors(P, C1).normalize();\n\n// [elided] disposeGroup / makeBasisFromNormal / addCylinderBetween / addConeAt — generic mesh plumbing\nfunction addArrow(parent, origin, dir, length, color, radius = 0.022, headScale = 1) {\n  const d0 = dir.clone().normalize();\n  const headH = Math.min(0.38 * headScale, Math.max(0.15, length * 0.26));\n  const shaftEnd = origin.clone().addScaledVector(d0, Math.max(length - headH * 0.72, 0.01));\n  const tip = origin.clone().addScaledVector(d0, length);\n  addCylinderBetween(parent, origin, shaftEnd, radius, color, 1, 16);\n  addConeAt(parent, tip, d0, radius * 5.7 * headScale, headH, color);\n  return tip;\n}\n\n// [elided] addDashedSegment / addThickPolyline / addPlanePatch\n// [elided] addPlaneOutline(parent, center, normal, w, h, color, radius) -> { corners, u, v, center, normal, width, height }\nfunction addCamera(parent, center, planeCorners, facingDir, labelSide = 1) {\n  const body = new THREE.Mesh(\n    new THREE.SphereGeometry(0.22, 40, 20),\n    new THREE.MeshBasicMaterial({ color: BLACK })\n  );\n  body.position.copy(center);\n  parent.add(body);\n\n  const aperture = new THREE.Mesh(\n    new THREE.SphereGeometry(0.12, 32, 16),\n    new THREE.MeshBasicMaterial({ color: 0x000000 })\n  );\n  aperture.position.copy(center).addScaledVector(facingDir.clone().normalize(), 0.035);\n  parent.add(aperture);\n\n  for (const c of planeCorners) addCylinderBetween(parent, center, c, 0.021, BLACK, 1, 14);\n\n  const base = center.clone().add(new THREE.Vector3(0.34 * labelSide, 0.00, -0.06));\n  addCylinderBetween(parent, center, base, 0.03, BLACK, 1, 14);\n}\n\n// [elided] addPoint / projectFromCameraToPlane / clipLineToPlaneRect / addCurvedArrow / setSerif(labelEntry, weight)\nconst plane1Normal = rayDir1.clone();\nconst basis1 = makeBasisFromNormal(plane1Normal);\nconst p1 = C1.clone().addScaledVector(rayDir1, 2.78);\nconst plane1Center = p1.clone()\n  .addScaledVector(basis1.u, -0.60)\n  .addScaledVector(basis1.v, 0.06);\n\nconst plane1 = addPlaneOutline(fixedGroup, plane1Center, plane1Normal, 3.05, 3.62, BLACK, 0.029);\naddCamera(fixedGroup, C1, plane1.corners, plane1Normal, 1);\n\nconst rayEnd = C1.clone().addScaledVector(rayDir1, 8.75);\naddCylinderBetween(fixedGroup, C1, rayEnd, 0.052, RED, 1, 24);\naddPoint(fixedGroup, p1, RED, 0.115);\naddPoint(fixedGroup, P, CYAN, 0.12);\n\nconst axisOrigin1 = plane1Center.clone().addScaledVector(plane1Normal, 0.10);\nconst x1Tip = addArrow(fixedGroup, axisOrigin1, plane1.u.clone().multiplyScalar(-1), 1.13, GREEN, 0.019, 0.92);\nconst y1Tip = addArrow(fixedGroup, axisOrigin1, plane1.v, 1.16, GREEN, 0.019, 0.92);\nconst z1Tip = addArrow(fixedGroup, axisOrigin1, plane1Normal, 0.93, GREEN, 0.019, 0.92);\n\nfunction camera2Center() {\n  return new THREE.Vector3(\n    4.20 + state.translationCamera2 * 0.18,\n    -1.62,\n    0.08 + state.translationCamera2 * 0.052\n  );\n}\n\nfunction camera2Normal() {\n  const base = new THREE.Vector3(-1.66, 0.78, 0.08).normalize();\n  return base.applyAxisAngle(worldUp, THREE.MathUtils.degToRad(state.rotationCamera2)).normalize();\n}\n\nconst labels = {\n  camera1: setSerif(addLabel('Camera 1', C1.clone().add(new THREE.Vector3(-0.76, -0.45, -0.03)), { fontSize: '34px', color: '#000' })),\n  image1: addLabel('image plane 1', plane1.corners[3].clone().add(new THREE.Vector3(-0.05, 0.23, 0)), { fontSize: '13px', color: '#111', background: 'rgba(255,255,255,0.78)' }),\n  p1: setSerif(addLabel('p<sub>1</sub>', p1.clone().add(new THREE.Vector3(-0.28, 0.34, 0.03)), { fontSize: '44px', color: '#000' }), 'bold'),\n  P: setSerif(addLabel('P', P.clone().add(new THREE.Vector3(0.02, 0.34, 0.02)), { fontSize: '25px', color: '#000' }), 'bold'),\n  ray: addLabel('ray from Camera 1', C1.clone().lerp(P, 0.55).add(new THREE.Vector3(0.10, 0.17, 0.05)), { fontSize: '13px', color: '#d40000', background: 'rgba(255,255,255,0.80)' }),\n  axes1: addLabel('coordinate axes 1', axisOrigin1.clone().add(new THREE.Vector3(-0.55, 0.22, 0.02)), { fontSize: '12px', color: '#17c900', background: 'rgba(255,255,255,0.75)' }),\n  x1: addLabel('x<sub>1</sub>', x1Tip, { fontSize: '14px', color: '#16c900', bold: true }),\n  y1: addLabel('y<sub>1</sub>', y1Tip, { fontSize: '14px', color: '#16c900', bold: true }),\n  z1: addLabel('z<sub>1</sub>', z1Tip, { fontSize: '14px', color: '#16c900', bold: true }),\n\n  camera2: setSerif(addLabel('Camera 2', new THREE.Vector3(), { fontSize: '34px', color: '#000' })),\n  image2: addLabel('image plane 2', new THREE.Vector3(), { fontSize: '13px', color: '#111', background: 'rgba(255,255,255,0.78)' }),\n  p2: setSerif(addLabel('p<sub>2</sub> ?', new THREE.Vector3(), { fontSize: '44px', color: '#000' }), 'bold'),\n  epipolar: addLabel('epipolar line on image plane 2', new THREE.Vector3(), { fontSize: '13px', color: '#d40000', background: 'rgba(255,255,255,0.82)' }),\n  rayProjection: addLabel('projection of Camera 1 ray', new THREE.Vector3(), { fontSize: '12px', color: '#d40000', background: 'rgba(255,255,255,0.78)' }),\n  e2: addLabel('e<sub>2</sub> = projection of Camera 1', new THREE.Vector3(), { fontSize: '12px', color: '#000', bold: true, background: 'rgba(255,255,255,0.78)' }),\n  p1to2: addLabel('&pi;<sub>2</sub>(p<sub>1</sub>)', new THREE.Vector3(), { fontSize: '12px', color: '#008c8c', bold: true, background: 'rgba(255,255,255,0.78)' }),\n  pointP2: addLabel('projection of P', new THREE.Vector3(), { fontSize: '12px', color: '#158000', background: 'rgba(255,255,255,0.78)' }),\n  x2: addLabel('x<sub>2</sub>', new THREE.Vector3(), { fontSize: '14px', color: '#1d63e8', bold: true }),\n  y2: addLabel('y<sub>2</sub>', new THREE.Vector3(), { fontSize: '14px', color: '#1d63e8', bold: true }),\n  z2: addLabel('z<sub>2</sub>', new THREE.Vector3(), { fontSize: '14px', color: '#1d63e8', bold: true }),\n  axes2: addLabel('coordinate axes 2', new THREE.Vector3(), { fontSize: '12px', color: '#1d63e8', background: 'rgba(255,255,255,0.75)' }),\n  RT: setSerif(addLabel('R,T', new THREE.Vector3(), { fontSize: '54px', color: '#18c900' }), 'bold'),\n  T: addLabel('T', new THREE.Vector3(), { fontSize: '20px', color: '#18c900', bold: true, background: 'rgba(255,255,255,0.62)' })\n};\n\nconst demoSteps = [\n  {\n    title: 'Initial Setup',\n    narration: 'Here, you see Camera 1 and Camera 2 with their respecti …',\n    rotationCamera2: 0,\n    translationCamera2: 0\n  },\n  {\n    title: 'Rotate Camera 2',\n    narration: 'As we rotate Camera 2, the image plane changes orientat …',\n    rotationCamera2: 45,\n    translationCamera2: 0\n  },\n  {\n    title: 'Translate Camera 2',\n    narration: 'Translating Camera 2 changes the baseline T. The epipol …',\n    rotationCamera2: 45,\n    translationCamera2: 5\n  }\n];\n\nfunction updateScene() {\n  disposeGroup(dynamicGroup);\n\n  const C2 = camera2Center();\n  const n2 = camera2Normal();\n  const b2 = makeBasisFromNormal(n2);\n  const plane2Center = C2.clone().addScaledVector(n2, 2.30)\n    .addScaledVector(b2.u, -0.05)\n    .addScaledVector(b2.v, 0.04);\n\n  const plane2 = addPlaneOutline(dynamicGroup, plane2Center, n2, 3.10, 3.64, BLACK, 0.029);\n  addCamera(dynamicGroup, C2, plane2.corners, n2, -1);\n  // [elided] dashed correspondence segments, the red epipolar line, the magenta epipolar plane, and the three projected points\n  const origin2 = plane2Center.clone().addScaledVector(n2, 0.10);\n  const x2Tip = addArrow(dynamicGroup, origin2, plane2.u.clone().multiplyScalar(-1), 1.12, BLUE, 0.019, 0.92);\n  const y2Tip = addArrow(dynamicGroup, origin2, plane2.v, 1.16, BLUE, 0.019, 0.92);\n  const z2Tip = addArrow(dynamicGroup, origin2, n2, 0.94, BLUE, 0.019, 0.92);\n\n  const tStart = C1.clone().add(new THREE.Vector3(0.05, -0.58, 0.62));\n  const tEnd = C2.clone().add(new THREE.Vector3(-0.05, -0.58, 0.62));\n  addArrow(dynamicGroup, tStart, new THREE.Vector3().subVectors(tEnd, tStart), tStart.distanceTo(tEnd), GREEN, 0.026, 1.08);\n\n  const curveStart = C1.clone().add(new THREE.Vector3(1.05, -1.05, 0.92));\n  const curveEnd = C2.clone().add(new THREE.Vector3(-1.10, -1.05, 0.92));\n  const curveControl = new THREE.Vector3((curveStart.x + curveEnd.x) * 0.5, -3.42, 1.22);\n  addCurvedArrow(dynamicGroup, curveStart, curveControl, curveEnd, GREEN, 0.032);\n\n  // [elided] labels.camera2 / image2 / p2 / epipolar / rayProjection / e2 / p1to2 / pointP2 / axes2 are repositioned the same way\n  labels.x2.pos.copy(x2Tip);\n  labels.y2.pos.copy(y2Tip);\n  labels.z2.pos.copy(z2Tip);\n  labels.T.pos.copy(tStart).lerp(tEnd, 0.5).add(new THREE.Vector3(0, 0.22, 0.02));\n  labels.RT.pos.copy(curveControl).add(new THREE.Vector3(0, -0.20, 0));\n\n  document.getElementById('rotationCamera2Value').textContent = `${Math.round(state.rotationCamera2)}\\u00b0`;\n  document.getElementById('translationCamera2Value').textContent = state.translationCamera2.toFixed(1);\n  document.getElementById('rotationCamera2').value = state.rotationCamera2;\n  document.getElementById('translationCamera2').value = state.translationCamera2;\n\n  for (let i = 0; i < 3; i++) {\n    document.getElementById(`step${i}`).classList.toggle('active', state.activeStep === i);\n  }\n  const step = demoSteps[state.activeStep];\n  document.getElementById('stepNarration').textContent = step ? step.narration : 'Adjust either slider independently to explore how camera pose changes the epipolar constraint.';\n}\n\nconst rotationInput = document.getElementById('rotationCamera2');\nconst translationInput = document.getElementById('translationCamera2');\n\nrotationInput.addEventListener('input', () => {\n  state.tween = null;\n  state.activeStep = -1;\n  state.rotationCamera2 = Number(rotationInput.value);\n  updateScene();\n});\n\ntranslationInput.addEventListener('input', () => {\n  state.tween = null;\n  state.activeStep = -1;\n  state.translationCamera2 = Number(translationInput.value);\n  updateScene();\n});\n\n// [elided] goToStep(i) — eases rotation/translation toward the step target over ~1s, calling updateScene() each frame\ndocument.getElementById('step0').addEventListener('click', () => goToStep(0));\ndocument.getElementById('step1').addEventListener('click', () => goToStep(1));\ndocument.getElementById('step2').addEventListener('click', () => goToStep(2));\nwindow.goToStep = goToStep;\n\ncamera.position.set(0.38, 3.05, 9.65);\ncontrols.target.set(0.02, -0.44, 0.24);\ncamera.zoom = 0.52;\ncamera.lookAt(controls.target);\ncamera.updateProjectionMatrix();\ncontrols.update();\nHOME_POS.copy(camera.position);\nHOME_TARGET.copy(controls.target);\nHOME_ZOOM = camera.zoom;\n\nupdateScene();\n// @FIGURE_CODE_END";

const GOLD_EVAL = {
  discrepancies: [
    'camera shapes differ: they are pyramids when they should be rectangles',
    'there are more labels than the original figure has',
    'there is an extra green arrow labelled T at the bottom',
    'blue and green axis arrows on cameras are 3D when they should be 2D',
  ],
  failure_modes: ['Wrong-Primitives', 'Depth-Wrong', 'Interaction-Broken'],
  geometry_accuracy: 2,
  interactivity_usability: 2,
  faithfulness: 4,
  label_quality: 1,
  concept_accuracy: 5,
  notes: 'Labels are too tiny, Geometry is incorrect, Rotation interaction is broken',
  action_items: [
    'Make the geometry of the cameras rectangles instead of pyramids/cones',
    'Remove unnecessary labels and increase font size of remaining ones',
    'Fix or remove the rotation interaction — it is broken',
  ],
  plan_action_items: [],
};

// ── One-shot calibration example (2D track — 14_2_9, Anton/Bivens/Davis Calculus
// 10e Fig. 14.2.9: a triangular Type-I/Type-II region-splitting figure). Real
// generation-2d.js output (context_export_html/planner_test/14_2_9__ms0prkhzvvih4.html),
// scored against the planner's own description of the source figure (no rendered
// screenshot of the original was available, so this leans on the textual QMD
// description rather than a pixel comparison the way the 3D example does) ──
const EXAMPLE_PAYLOAD_2D = "<!-- @FIGURE_UI_BEGIN -->\n<span id=\"demoNarration\" style=\"margin:0;font-size:10px;max-width:180px\">Integrating with vertical slices (Type I) requires splitting the triangle into sub-regions R1 and R2 at x = 0.</span><span><button onclick=\"prevStep()\">◀</button> <span id=\"stepLabel\">1/3</span> <button onclick=\"nextStep()\">▶</button></span><label><input id=\"integrationTypeInput\" type=\"checkbox\" onchange=\"toggle_integrationType(this.checked)\"> Type II horizontal slices</label><label>Left boundary y = <input id=\"f1Input\" value=\"-x + 1\" oninput=\"updateBoundaryEquations()\" style=\"width:86px\"></label><label>Right boundary y = <input id=\"f2Input\" value=\"x + 1\" oninput=\"updateBoundaryEquations()\" style=\"width:86px\"></label><span id=\"integralText\" style=\"font-size:10px;max-width:180px;text-shadow:0 1px 2px #fff\"></span>\n<!-- @FIGURE_UI_END -->\n// @FIGURE_CODE_BEGIN\nvar container = document.getElementById('container');\nvar draw = SVG().addTo(container).size('100%', '100%');\nvar W = 600, H = 450;\ndraw.viewbox(0, 0, W, H);\n\nvar X0 = 294, Y0 = 385, S = 84;\nvar BLUE = '#2fa8df';\nvar LEFT_FILL = '#c8e1ec';\nvar RIGHT_FILL = '#fde8b8';\nvar TYPE2_FILL = '#d9ead3';\nvar RED = '#ef4f63';\nvar AXIS = '#231f20';\n\nfunction X(x) { return X0 + S * x; }\nfunction Y(y) { return Y0 - S * y; }\n// [elided] fmt(n) — rounds and swaps the minus glyph\nfunction txt(str, x, y, size, anchor) {\n  return draw.text(str).font({\n    family: 'Times New Roman, Times, serif',\n    size: size,\n    style: 'italic',\n    anchor: anchor || 'middle'\n  }).attr({\n    x: x,\n    y: y,\n    fill: AXIS,\n    'paint-order': 'stroke',\n    stroke: '#fff',\n    'stroke-width': 3,\n    'stroke-linejoin': 'round'\n  });\n}\n\nvar fillG = draw.group();\nvar lineG = draw.group();\nvar axisG = draw.group();\nvar labelG = draw.group();\n\nvar regionType2 = fillG.polygon('').fill(TYPE2_FILL).opacity(0).stroke('none');\nvar regionLeft = fillG.polygon('').fill(LEFT_FILL).opacity(0.95).stroke('none');\nvar regionRight = fillG.polygon('').fill(RIGHT_FILL).opacity(0.95).stroke('none');\n\nvar topLine = lineG.line(0, 0, 0, 0).stroke({ color: BLUE, width: 5, linecap: 'butt', linejoin: 'round' });\nvar leftLine = lineG.line(0, 0, 0, 0).stroke({ color: BLUE, width: 5, linecap: 'round', linejoin: 'round' });\nvar rightLine = lineG.line(0, 0, 0, 0).stroke({ color: BLUE, width: 5, linecap: 'round', linejoin: 'round' });\nvar sliceL = lineG.line(0, 0, 0, 0).stroke({ color: RED, width: 4, linecap: 'butt' });\nvar sliceR = lineG.line(0, 0, 0, 0).stroke({ color: RED, width: 4, linecap: 'butt' });\nvar sliceH = lineG.line(0, 0, 0, 0).stroke({ color: BLUE, width: 4, linecap: 'round' }).opacity(0);\n\naxisG.line(12, Y0, 574, Y0).stroke({ color: AXIS, width: 2.5 });\naxisG.polygon([[574, Y0 - 10], [598, Y0], [574, Y0 + 10]]).fill(AXIS);\naxisG.line(X0, 448, X0, 40).stroke({ color: AXIS, width: 2.5 });\naxisG.polygon([[X0 - 9, 40], [X0, 14], [X0 + 9, 40]]).fill(AXIS);\naxisG.line(X(-2), Y0, X(-2), Y0 - 18).stroke({ color: AXIS, width: 2 });\naxisG.line(X(2), Y0, X(2), Y0 - 18).stroke({ color: AXIS, width: 2 });\n\ntxt('−2', X(-2) - 10, Y0 + 16, 35, 'middle');\ntxt('0', X0 + 18, Y0 + 16, 35, 'middle');\ntxt('2', X(2), Y0 + 16, 35, 'middle');\ntxt('x', 586, Y0 - 40, 35, 'middle');\ntxt('y', X0 + 28, 22, 35, 'middle');\n\nvar labelTopL = txt('y = 3', 215, 84, 38, 'middle');\nvar labelTopR = txt('y = 3', 375, 84, 38, 'middle');\nvar labelLeftEq = txt('y = −x + 1', 98, 203, 34, 'middle');\nvar labelRightEq = txt('y = x + 1', 488, 203, 34, 'middle');\nvar labelR1 = txt('R₁', 252, 155, 37, 'middle');\nvar labelR2 = txt('R₂', 337, 155, 37, 'middle');\n\n// [elided] addInteractivity(el, title, body, tip) — wires showTooltip/hideTooltip/showPopup, then is called on regionLeft, regionRight, regionType2, sliceL, sliceR, sliceH\nvar state = {\n  typeII: false,\n  f1: '-x + 1',\n  f2: 'x + 1',\n  geom: { xL: -2, xA: 0, xR: 2, yA: 1 }\n};\n\nfunction compileExpr(s) {\n  var expr = String(s || '').replace(/\\s+/g, '').replace(/\\^/g, '**');\n  expr = expr.replace(/(^|[\\+\\-\\*\\/\\(])x/g, '// @FIGURE_CODE_BEGIN1*x');\n  expr = expr.replace(/([0-9.])x/g, '// @FIGURE_CODE_BEGIN*x');\n  if (!/^[0-9xX+\\-*/().\\s*]+$/.test(expr)) throw new Error('Only arithmetic expressions in x are supported.');\n  return new Function('x', 'return Number(' + expr.replace(/X/g, 'x') + ');');\n}\n// [elided] rootBetween(fn, a, b) — bisection;  findRoot(fn, a, b, prefer) — scans 160 samples for the sign change nearest `prefer`\nfunction evaluateGeometry() {\n  try {\n    var f1 = compileExpr(state.f1), f2 = compileExpr(state.f2);\n    var xA = findRoot(function (x) { return f1(x) - f2(x); }, -3.5, 3.5, 0);\n    if (xA === null) throw new Error('No intersection');\n    var yA = f1(xA);\n    var xL = findRoot(function (x) { return f1(x) - 3; }, -3.5, Math.min(xA, 3.5), -2);\n    var xR = findRoot(function (x) { return f2(x) - 3; }, Math.max(xA, -3.5), 3.5, 2);\n    if (xL === null || xR === null || !isFinite(yA)) throw new Error('Bad boundary');\n    if (xL > xR) { var t = xL; xL = xR; xR = t; }\n    state.geom = { xL: xL, xA: xA, xR: xR, yA: yA, f1: f1, f2: f2 };\n  } catch (e) {\n    state.geom = {\n      xL: -2, xA: 0, xR: 2, yA: 1,\n      f1: function (x) { return -x + 1; },\n      f2: function (x) { return x + 1; }\n    };\n  }\n}\n// [elided] polyStr(points) — maps world points to an SVG points string\nfunction updateIntegralText() {\n  var g = state.geom;\n  var el = document.getElementById('integralText');\n  if (!el) return;\n  if (state.typeII) {\n    el.textContent = 'Type II: ∫ᵧ₌' + fmt(g.yA) + '³ ∫ₓ₌left(y)ʳⁱᵍʰᵗ⁽ʸ⁾ dA';\n  } else {\n    el.textContent = 'Type I: ∫' + fmt(g.xL) + '→' + fmt(g.xA) + '∫f₁(x)→3 dA + ∫' + fmt(g.xA) + '→' + fmt(g.xR) + '∫f₂(x)→3 dA';\n  }\n}\nfunction redraw() {\n  evaluateGeometry();\n  var g = state.geom;\n  var xL = g.xL, xA = g.xA, xR = g.xR, yA = g.yA;\n  regionLeft.plot(polyStr([[xL, 3], [xA, yA], [xA, 3]]));\n  regionRight.plot(polyStr([[xA, 3], [xA, yA], [xR, 3]]));\n  regionType2.plot(polyStr([[xL, 3], [xA, yA], [xR, 3]]));\n  topLine.plot(X(xL), Y(3), X(xR), Y(3));\n  leftLine.plot(X(xL), Y(3), X(xA), Y(yA));\n  rightLine.plot(X(xA), Y(yA), X(xR), Y(3));\n\n  var xlSlice = (xL + xA) / 2;\n  var xrSlice = (xA + xR) / 2;\n  sliceL.plot(X(xlSlice), Y(3), X(xlSlice), Y(g.f1(xlSlice)));\n  sliceR.plot(X(xrSlice), Y(3), X(xrSlice), Y(g.f2(xrSlice)));\n\n  var yh = (3 + yA) / 2;\n  var xhL = xL + (xA - xL) * ((3 - yh) / (3 - yA));\n  var xhR = xR + (xA - xR) * ((3 - yh) / (3 - yA));\n  sliceH.plot(X(xhL), Y(yh), X(xhR), Y(yh));\n\n  regionLeft.animate(160).opacity(state.typeII ? 0 : 0.95);\n  regionRight.animate(160).opacity(state.typeII ? 0 : 0.95);\n  regionType2.animate(160).opacity(state.typeII ? 0.9 : 0);\n  sliceL.animate(160).opacity(state.typeII ? 0 : 1);\n  sliceR.animate(160).opacity(state.typeII ? 0 : 1);\n  sliceH.animate(160).opacity(state.typeII ? 1 : 0);\n\n  labelR1.animate(160).opacity(state.typeII ? 0 : 1);\n  labelR2.animate(160).opacity(state.typeII ? 0 : 1);\n  labelLeftEq.text('y = ' + state.f1.replace(/-/g, '−'));\n  labelRightEq.text('y = ' + state.f2.replace(/-/g, '−'));\n  updateIntegralText();\n}\nfunction toggle_integrationType(on) {\n  state.typeII = !!on;\n  redraw();\n}\nfunction updateBoundaryEquations() {\n  state.f1 = document.getElementById('f1Input').value || '-x + 1';\n  state.f2 = document.getElementById('f2Input').value || 'x + 1';\n  redraw();\n}\n\nvar demoSteps = [\n  {\n    narration: 'Integrating with vertical slices (Type I) requires splitting the triangle into sub-regions R1 and R2 at x = 0, because the lower boundary formula abruptly changes from y = -x + 1 to y = x + 1.',\n    typeII: false\n  },\n  {\n    narration: 'Try editing the equations for the left and right boundaries. Observe how the shape of the regions and the corresponding integration limits automatically update.',\n    typeII: false\n  },\n  {\n    narration: 'Switching to horizontal slices (Type II) allows a single continuous sweep across the whole region, consolidating the problem into one double integral.',\n    typeII: true\n  }\n];\nvar currentStep = 0;\nfunction applyStep(i) {\n  currentStep = Math.max(0, Math.min(demoSteps.length - 1, i));\n  var s = demoSteps[currentStep];\n  var narr = document.getElementById('demoNarration');\n  var lab = document.getElementById('stepLabel');\n  var chk = document.getElementById('integrationTypeInput');\n  if (narr) narr.textContent = s.narration;\n  if (lab) lab.textContent = (currentStep + 1) + '/' + demoSteps.length;\n  if (chk) chk.checked = s.typeII;\n  toggle_integrationType(s.typeII);\n}\nfunction prevStep() { applyStep(currentStep - 1); }\nfunction nextStep() { applyStep(currentStep + 1); }\n\nwindow.toggle_integrationType = toggle_integrationType;\nwindow.updateBoundaryEquations = updateBoundaryEquations;\nwindow.prevStep = prevStep;\nwindow.nextStep = nextStep;\n\nredraw();\napplyStep(0);\nwindow.__markRendered();\n// @FIGURE_CODE_END";

const GOLD_EVAL_2D = {
  discrepancies: [
    'the right sub-region (R2) is filled a pale tan/orange (#fde8b8) rather than the yellow the source uses to visually distinguish it from the blue left sub-region (R1)',
    "the top boundary 'y = 3' is drawn as two separate labels (one per half) instead of one label for the single shared boundary",
    "the Type II integral display shows abstract 'left(y)'/'right(y)' placeholders instead of the explicit x = −(y−1) to x = (y−1) limits the figure is meant to teach",
  ],
  failure_modes: ['Color-Wrong', 'Interaction-Broken'],
  geometry_accuracy: 5,
  interactivity_usability: 3,
  faithfulness: 4,
  label_quality: 4,
  concept_accuracy: 3,
  notes: 'Triangle vertices, boundary lines, and the R1/R2 split are numerically exact, but the flagship equation-input interaction is silently non-functional: editing either boundary updates the label text but never the drawn triangle, undercutting the exact concept (a changing boundary formula forcing the split) it was built to teach.',
  action_items: [
    "Fix compileExpr(): its string-replacement calls insert the literal text '// @FIGURE_CODE_BEGIN1*x' / '// @FIGURE_CODE_BEGIN*x' where a regex backreference like '$11*x' / '$1*x' was clearly intended. The stray '//' starts a comment that truncates the generated Function body, so compileExpr throws on every call and evaluateGeometry silently falls back to the hardcoded default triangle — the equation inputs currently have zero visible effect on the drawn shape.",
    'Change RIGHT_FILL from the pale tan (#fde8b8) to an actual yellow so R1/R2 read as the blue/yellow split the source uses.',
    "Merge the two duplicate 'y = 3' labels into a single label for the shared top boundary.",
  ],
  plan_action_items: [],
};

// ── 10 canonical failure modes ─────────────────────────────────────────────────
const FAILURE_MODES = [
  { id: 'Depth-Wrong', desc: '3D depth/perspective interpretation is incorrect' },
  { id: 'Missing-Labels', desc: 'important text annotations are absent' },
  { id: 'Wrong-Primitives', desc: 'incorrect geometric shapes used for the concept' },
  { id: 'Interaction-Broken', desc: 'interactive controls are present but non-functional' },
  { id: 'Interaction-Missing', desc: 'no meaningful interactions beyond basic OrbitControls rotation' },
  { id: 'Camera-Wrong', desc: 'initial viewpoint differs from the source figure — wrong angle/orientation/rotation, even if all content remains visible' },
  { id: 'Scale-Wrong', desc: 'element proportions are noticeably off' },
  { id: 'Color-Wrong', desc: "colors don't match the original figure" },
  { id: 'Hallucination', desc: 'elements present that do not appear in the original' },
  { id: 'Concept-Misunderstood', desc: 'the core concept being illustrated is    misrepresented' },
];

// ── 5 primary scored metrics (each 1–5) ────────────────────────────────────────
const SCORE_METRICS = [
  {
    id: 'geometry_accuracy',
    note: [
      'Judge these five things:',
      '  • CAMERA — flag "Camera-Wrong" only if the vantage point differs enough to make the figure hard to recognize (reversed foreground/background, a key face hidden, viewed from the opposite side). Minor azimuth/zoom differences do not qualify.',
      '  • PRIMITIVES — flag "Wrong-Primitives" and cap the score when a major element uses the wrong shape (a box drawn as a cone/pyramid, a plane as a disc, a ray as a thick cylinder), even if the composition looks similar.',
      '  • PROJECTION MECHANISM — axonometric = off-axis orthographic, no shear; oblique = front-on orthographic plus a consistent depth shear; perspective = true perspective, used when the source shows convergence or distance-based shrinking.',
      '  • REPEATED ELEMENTS — compare each corresponding element\'s size and proportions to the source, not just its presence. A set that should visibly vary in size but came out uniform is a spatial error, even if each element is individually a plausible primitive.',
      '  • HARD FLOOR — if the source has genuine 3D structure (elements at different depths, occlusion, a meaningfully three-dimensional arrangement) but the generated figure flattened it into a camera-facing poster with no occlusion or depth falloff, score geometry_accuracy 1 and include "Depth-Wrong", regardless of how correct the colors/labels/elements are. Does NOT apply when the source is itself a flat 2D diagram the plan correctly renders front-on (axis_screen_angles: null).',
    ].join('\n'),
    rubric: [
      '5 – All elements represented; plausible positions, connections, proportions',
      '4 – All major elements present; minor position/alignment issues',
      '3 – 1-2 elements missing OR noticeable spatial errors; concept still recognizable',
      '2 – Multiple missing elements OR major spatial errors',
      '1 – Unrecognizable or completely wrong topology',
    ],
  },
  {
    id: 'interactivity_usability',
    note: 'CRITICAL: OrbitControls (mouse drag to rotate/zoom) does NOT count as an interaction. Meaningful interactions = buttons, sliders, toggles, step-through animations, parameter controls built by the developer.',
    rubric: [
      '5 – All planned interactions functional and pedagogically useful; count matches figure complexity (1 deep slider is correct for a single-variable concept; 3+ expected for multi-step figures); demo steps present if the plan includes them',
      '4 – Most planned interactions functional; minor usability issues; pedagogical value clear',
      '3 – At least one meaningful interaction works; some planned interactions missing or broken; or interactions only weakly connected to the concept',
      '2 – Interactions exist in code but broken or no visible effect',
      '1 – Only OrbitControls present, or no interactions at all — score MUST be 1',
    ],
  },
  {
    id: 'faithfulness',
    note: 'Judge overall visual resemblance to the source — composition, geometry, and color scheme at a glance — rather than an exhaustive checklist of small differences. For multipanel source figures where the generated figure implements a toggle/tab/step between parts (e.g. Part A vs Part B), it is correct and expected for only one part to be visible in the default screenshot; check the HTML/JS for a toggle control before penalizing a currently-hidden part as missing or absent. Do not over-penalize extra elements added beyond the source (additional UI chrome, decorative touches) unless they clutter the figure or change its overall look — flag those under the Hallucination failure mode rather than cutting this score for minor additions.',
    rubric: [
      '5 – Clearly recognizable as the same figure: correct geometry, colors, composition, and major labels all present',
      '4 – Recognizable at a glance; minor differences in color, proportion, or label placement',
      '3 – General idea clear but notable differences in geometry, composition, or missing elements',
      '2 – Hard to recognize as the same figure; significant content differences',
      '1 – Completely different or fabricated',
    ],
  },
  {
    id: 'label_quality',
    note: 'Off-screen / heavily-overlapping labels are already caught by the verifier — do not re-flag those. Judge CONTENT (right labels present, correct text, on the correct element, matching the source) and LEGIBILITY (comfortably readable even when the verifier did not call them "enormous", with a deliberate hierarchy — primary labels standing out over axis labels — matching what the source implies).',
    rubric: [
      '5 – All the right labels present, correct text on the correct elements, matching the source, AND sized/styled for easy legibility with a clear hierarchy matching the source',
      '4 – Content correct; only 1-2 minor issues (content OR sizing/hierarchy — e.g. a label slightly too small or inconsistently sized)',
      '3 – Half of labels have issues, whether content (wrong text, wrong target, missing, unclear) or legibility (uncomfortably small, inconsistent hierarchy)',
      '2 – Most labels problematic — mislabeled/missing content, or generally too small/cluttered to read comfortably',
      '1 – No labels, or all wrong/mislabeled/illegible',
    ],
  },
  {
    id: 'concept_accuracy',
    rubric: [
      '5 – All concepts accurate; interactions demonstrate correct relationships; no misinformation',
      '4 – Main concept correct; ≤1 minor detail wrong or missing',
      '3 – Main concept present; 2-3 details wrong or missing',
      '2 – Significant errors or fabrications; would mislead students',
      '1 – Completely incorrect or misleading',
    ],
  },
];

// ── Mode profiles ─────────────────────────────────────────────────────────────
// The critic serves two tracks. Everything medium-specific in the prompt lives in
// this table; buildEvalPrompt below is mode-invariant. The '3d' entry holds the
// original strings verbatim, so with mode omitted the prompt is byte-identical to
// what produced the existing `default_critic` scores.

const FRAMING_3D = `You are a strict critic of generated interactive Three.js 3D figures against original 2D textbook figure images.
You will receive the original source figure image, the generated HTML/JavaScript code, and a rendered screenshot of the generated HTML (if screenshot capture succeeds). Start by using the screenshot to help evaluate the faithfulness of the generated figure to the source figure, listing discrepancies in the primitive elements between what you see in the source figure versus what you see in the generated figure. If the screenshot was not received, mention this in the notes.
Score the generated figure using the rubric and give feedback to improve the figure. Be critical and honest — err toward lower scores when in doubt. Ensure that the output is not a 2D image rendered with Three.js. Do not give credit for things that are absent or barely present. Output ONLY a valid JSON object — no explanation, no markdown, no fences.`;

const VERIFICATION_3D = `AUTOMATED VERIFICATION ALREADY PASSED. A deterministic verifier has rendered this figure headless at multiple viewports and confirmed it runs without exceptions or console errors with the render loop alive, actually draws to the GPU (non-blank canvas, real geometry, no NaN coordinates), fits the viewport with no overflow and the control panel fully on-screen, and has labels that are on-screen, not enormous, and not heavily overlapping.
Spend NO scores, failure modes, discrepancies, or action items on any of that. Focus ENTIRELY on SEMANTIC FIDELITY to the source: correct geometry, correct primitives, correct camera/view, faithful composition and colors, correct and meaningful labels, meaningful and conceptually-correct interactions, and concept accuracy. Judge whether it is the *right* figure and a good teaching artifact — not whether it renders.`;

const SCAFFOLD_CONTEXT_3D = `SCAFFOLD CONTEXT (provided automatically — do not penalise for missing these):
- THREE, OrbitControls, renderer, scene, orthographic camera, controls, animate loop, ResizeObserver are all pre-wired
- addLabel(text, position3D, {color, fontSize, bold, offset, background}?) — floating HTML label system
- setStandardView({azimuth, polar, heightFraction}?) — frames the camera to scene content
- Reset View is scaffolded; generated code may add controls, panels, and UI affordances as needed to support the planned interactions`;

const DISCREPANCIES_3D = `DISCREPANCIES - list 0-6 visual discrepancies between the source figure and the generated figure, prioritized by impact on recognizability and concept accuracy
- Focus on: wrong geometric primitives, missing or incorrect elements, wrong colors, missing or mislabeled annotations, broken or absent interactions
- De-prioritize: minor camera angle differences, exact crop/zoom, whitespace variation — only flag these if they make the figure hard to recognize or misleading
- For multipanel source figures, if the generated figure implements a toggle/tab/step between parts (e.g. Part A vs Part B), check the HTML/JS before flagging a part as "missing" — a part hidden behind an unactivated toggle is not a discrepancy`;

const FRAMING_2D = `You are a strict critic of generated inline-interactive 2D figures (SVG.js / Chart.js / Mermaid) against the original 2D textbook figure image.
You will receive the original source figure image, the generated HTML/JavaScript code, and a rendered screenshot of the generated HTML (if screenshot capture succeeds). Start by using the screenshot to help evaluate the faithfulness of the generated figure to the source figure, listing discrepancies in the primitive elements between what you see in the source figure versus what you see in the generated figure. If the screenshot was not received, mention this in the notes.
Score the generated figure using the rubric and give feedback to improve the figure. Be critical and honest — err toward lower scores when in doubt. The default (step-0) state should read as a drop-in replacement for the static source image. Do not give credit for things that are absent or barely present. Output ONLY a valid JSON object — no explanation, no markdown, no fences.`;

const VERIFICATION_2D = `AUTOMATED VERIFICATION ALREADY PASSED. A deterministic verifier has rendered this figure headless at multiple viewports and confirmed it runs without exceptions or page errors, produces a visible visual root (SVG, canvas, or Mermaid diagram) containing real text or graphics rather than an empty frame, and fits the viewport with no horizontal overflow and the main visual unclipped at wide widths.
Spend NO scores, failure modes, discrepancies, or action items on any of that. Focus ENTIRELY on SEMANTIC FIDELITY to the source: correct 2D structure, correct mark types, faithful composition and colors, correct and meaningful labels, meaningful and conceptually-correct interactions, and concept accuracy. Judge whether it is the *right* figure and a good teaching artifact — not whether it renders.
IMPORTANT — the 2D verifier performs NO label checks at all: no on-screen check, no size check, no overlap check. Label placement is fully IN SCOPE for you. Do flag labels that collide with each other or the artwork, escape the plot area, are clipped at the edge, or are too small to read comfortably at inline size.`;

const SCAFFOLD_CONTEXT_2D = `SCAFFOLD CONTEXT (provided automatically — do not penalise for missing these):
- SVG.js v3, Chart.js v4, Mermaid v11 and expr-eval are preloaded; #container, window.__markRendered() and the 'fig-resize' event are pre-wired
- #ui is an auto-docking control panel; setUiLayout(...) positions it
- showPopup(...), showTooltip(...), hideTooltip() — built-in explainer and tooltip affordances
- Plotting helpers: setPlotFrame(...), plotX(...) / plotY(...) for data→pixel mapping, plotFunction(...), fillBetween(...), plotParametric(...), integrateSimpson(...), findRoot(...)
- compileExpr(...) and bindEquationInput(...) — live user-editable equation inputs
- Generated code may add controls, panels, and UI affordances as needed to support the planned interactions`;

const DISCREPANCIES_2D = `DISCREPANCIES - list 0-6 visual discrepancies between the source figure and the generated figure, prioritized by impact on recognizability and concept accuracy
- Focus on: wrong mark types, missing or incorrect elements, wrong colors, missing or mislabeled annotations, broken or absent interactions
- De-prioritize: exact crop/zoom, whitespace variation, small differences in font face or padding — only flag these if they make the figure hard to recognize or misleading
- For multipanel source figures, if the generated figure implements a toggle/tab/step between parts (e.g. Part A vs Part B), check the HTML/JS before flagging a part as "missing" — a part hidden behind an unactivated toggle is not a discrepancy`;

const GEOMETRY_NOTE_2D = 'Judge 2D structural fidelity against the source: axis ranges, tick marks and gridlines, the shape and trend of the data, node-and-edge topology and counts, relative proportions and layout, and line styling (dashed vs solid, stroke weight, arrowheads, fill vs outline). Flag "Wrong-Primitives" and cap the score when a major element uses the wrong mark type — e.g. a scatter drawn as a connected line, a bar chart drawn as an area, a directed edge drawn without its arrowhead, a smooth curve drawn as straight segments. This is a 2D figure: do NOT penalise the absence of depth, perspective, or a 3D vantage point.';

const INTERACTIVITY_NOTE_2D = 'CRITICAL: panning or zooming the figure does NOT count as an interaction, and a hover tooltip on its own is weak. Meaningful interactions = sliders, toggles, buttons, demo-step players, equation inputs, or code-editor workbenches built by the developer, whose handlers actually redraw the figure.';

const LABEL_NOTE_2D = 'Label placement is NOT screened by the verifier for 2D figures — judge it fully. Judge CONTENT (right labels present, correct text, on the correct element, matching the source), PLACEMENT (collisions with each other or the artwork, escaping the plot area, clipping at the edge), and LEGIBILITY (comfortably readable at inline size, with a deliberate hierarchy — primary labels standing out over axis labels — matching what the source implies).';

/**
 * Copy a metric's rubric from SCORE_METRICS, swapping one level's line. Lets a
 * mode override the single line that actually differs instead of duplicating all
 * five and letting the copies drift apart.
 */
function replaceRubricLevel(metricId, level, replacement) {
  const base = SCORE_METRICS.find(m => m.id === metricId);
  if (!base) throw new Error(`replaceRubricLevel: unknown metric "${metricId}"`);
  const prefix = `${level} –`;
  const out = base.rubric.map(r => (r.startsWith(prefix) ? replacement : r));
  if (!out.includes(replacement)) {
    throw new Error(`replaceRubricLevel: no "${prefix}" line in ${metricId} rubric`);
  }
  return out;
}

const CRITIC_MODES = {
  '3d': {
    versionSuffix: '',
    framing: FRAMING_3D,
    verification: VERIFICATION_3D,
    scaffoldContext: SCAFFOLD_CONTEXT_3D,
    discrepancies: DISCREPANCIES_3D,
    excludeFailureModes: [],
    failureModeDescOverrides: {},
    metricOverrides: {},
    fewShot: { payload: EXAMPLE_PAYLOAD, gold: GOLD_EVAL },
  },
  '2d': {
    versionSuffix: '_2d',
    framing: FRAMING_2D,
    verification: VERIFICATION_2D,
    scaffoldContext: SCAFFOLD_CONTEXT_2D,
    discrepancies: DISCREPANCIES_2D,
    // Kept a strict SUBSET of the 3D vocabulary — never add new ids here, or the
    // orchestrator, refinePlan2d, and cross-track tallies stop lining up.
    excludeFailureModes: ['Depth-Wrong', 'Camera-Wrong'],
    failureModeDescOverrides: {
      'Interaction-Missing': 'no meaningful interactions beyond pan/zoom or hover tooltips',
    },
    metricOverrides: {
      geometry_accuracy: { note: GEOMETRY_NOTE_2D },
      interactivity_usability: {
        note: INTERACTIVITY_NOTE_2D,
        // Identical to the 3D rubric except for what counts as "no interaction".
        rubric: replaceRubricLevel(
          'interactivity_usability', '1',
          '1 – Only pan/zoom or a bare hover tooltip present, or no interactions at all — score MUST be 1'
        ),
      },
      label_quality: {
        note: LABEL_NOTE_2D,
        rubric: [
          '5 – All the right labels present, correct text on the correct elements, matching the source, cleanly placed without collisions, AND sized/styled for easy legibility with a clear hierarchy matching the source',
          '4 – Content correct; only 1-2 minor issues (content, placement, OR sizing/hierarchy — e.g. a label slightly too small, or one mild collision)',
          '3 – Half of labels have issues, whether content (wrong text, wrong target, missing, unclear), placement (overlapping, escaping the plot area, clipped), or legibility (uncomfortably small, inconsistent hierarchy)',
          '2 – Most labels problematic — mislabeled/missing content, badly colliding, or generally too small/cluttered to read comfortably',
          '1 – No labels, or all wrong/mislabeled/illegible',
        ],
      },
    },
    fewShot: { payload: EXAMPLE_PAYLOAD_2D, gold: GOLD_EVAL_2D },
  },
};

function resolveCriticMode(mode) {
  const key = String(mode || '3d').toLowerCase();
  if (!CRITIC_MODES[key]) {
    console.warn(`[critic] unknown mode "${mode}" — falling back to '3d'.`);
    return CRITIC_MODES['3d'];
  }
  return CRITIC_MODES[key];
}

let warnedNoFewShot2d = false;

// ── Build the system prompt sent to the critic model ─────────────────────────
function buildEvalPrompt(useFewShot = true, mode = '3d') {
  const profile = resolveCriticMode(mode);

  if (useFewShot && !profile.fewShot) {
    if (!warnedNoFewShot2d) {
      console.warn(`[critic] useFewShot=true but mode "${mode}" has no calibration example — running without few-shot.`);
      warnedNoFewShot2d = true;
    }
  }
  const failureModeLines = FAILURE_MODES
    .filter(f => !profile.excludeFailureModes.includes(f.id))
    .map(f => `"${f.id}"${' '.repeat(Math.max(1, 24 - f.id.length))}— ${profile.failureModeDescOverrides[f.id] || f.desc}`)
    .join('\n');

  const metricLines = SCORE_METRICS.map(m => ({ ...m, ...(profile.metricOverrides[m.id] || {}) })).map(m => {
    const header = m.note ? `${m.id} — ${m.note}` : m.id + ':';
    return `${header}\n${m.rubric.map(r => `  ${r}`).join('\n')}`;
  }).join('\n\n');

  const exampleOutput = JSON.stringify(
    Object.fromEntries([
      ['discrepancies', []],
      ['failure_modes', []],
      ...SCORE_METRICS.map(m => [m.id, 3]),
      ['notes', 'one concise sentence summarizing the main strengths and weaknesses'],
      ['action_items', ['Specific generation-level fix 1', 'Specific generation-level fix 2']],
      ['plan_action_items', ['Specific plan-level fix 1 (or empty array if plan is sound)']],
    ]),
    null,
    2
  );

  return `${profile.framing}

${profile.verification}

${profile.scaffoldContext}

${profile.discrepancies}

FAILURE MODES — list any that apply (use empty array [] if none):
${failureModeLines}

SCORES — integer 1–5 for each field:
${metricLines}

ACTION ITEMS — separate feedback for the generation and the plan:
- action_items: list 2-4 generation-level fixes (broken controls, wrong primitives, missing labels, scale issues, camera/view correction — things fixable without changing the plan)
- plan_action_items: list 0-2 plan-level fixes (wrong projection_type, missing core elements, wrong interaction type for the concept, fundamental misunderstanding — things requiring a revised plan). Use [] if the plan is sound.

Output this exact JSON structure and nothing else:
${exampleOutput}

${useFewShot && profile.fewShot ? `Here is an example output - study this before scoring. Do not copy these scores; only use them as a reference example for judgement.
Generated code:
${profile.fewShot.payload}

Correct evaluation for the above code:
${JSON.stringify(profile.fewShot.gold, null, 2)}` : ''}`;
}

function getCriticContext(useFewShot = true, mode = '3d') {
  const profile = resolveCriticMode(mode);
  const systemPrompt = buildEvalPrompt(useFewShot, mode);
  return {
    systemPrompt,
    criticVersion: CRITIC_EXPERIMENT_BASE + profile.versionSuffix,
  };
}

// ── Finalise raw evaluator output: clamp, derive visual_aesthetics + overall ──
function finaliseEval(evaluation) {
  const scoreKeys = SCORE_METRICS.map(m => m.id);
  for (const key of scoreKeys) {
    evaluation[key] = Math.min(5, Math.max(1, Math.round(Number(evaluation[key]) || 3)));
  }
  // Derived: visual quality proxy
  evaluation.visual_aesthetics = Math.round(
    ((evaluation.geometry_accuracy + evaluation.faithfulness + evaluation.label_quality) / 3) * 10
  ) / 10;
  // Derived: overall average of the 5 primary metrics
  evaluation.overall_average = Math.round(
    (scoreKeys.reduce((s, k) => s + evaluation[k], 0) / scoreKeys.length) * 10
  ) / 10;
  return evaluation;
}

/**
 * Run evaluator model and return finalised rubric scores.
 *
 * @param {{
 *   html: string,
 *   evalImage?: string,
 *   evalMediaType?: string,
 *   model?: string,
 *   maxTokens?: number,
 * }} opts
 */
async function evaluateHtmlWithCritic(opts) {
  const {
    html,
    evalImage,
    evalMediaType = 'image/png',
    model = CRITIC_DEFAULT_MODEL,
    maxTokens = CRITIC_MAX_TOKENS,
    useFewShot = true,
    renderedScreenshot = null,
    renderedMediaType = 'image/jpeg',
    mode = '3d',
  } = opts || {};

  if (!html) throw new Error('No HTML found for evaluation.');

  // Prefer a screenshot already captured by the verifier (avoids a second headless
  // render). Only render here if the caller didn't hand us one.
  const rendered = renderedScreenshot
    ? { data: renderedScreenshot, mediaType: renderedMediaType }
    : await screenshotHtml(html);

  const userContent = [
    ...(evalImage
      ? [
        { type: 'text', text: 'Reference source figure image:' },
        { type: 'image_url', image_url: { url: `data:${evalMediaType};base64,${evalImage}` } },
      ]
      : []),
    ...(rendered?.data
      ? [
        { type: 'text', text: 'Rendered screenshot of the generated HTML output:' },
        { type: 'image_url', image_url: { url: `data:${rendered.mediaType || 'image/jpeg'};base64,${rendered.data}` } },
      ]
      : []),
    {
      type: 'text',
      text: `Here is the generated code to evaluate:\n\n${formatPayload(extractPayloadFromHtml(html) ?? { uiHtml: '', codeJs: html })}\n\nOutput ONLY the JSON evaluation object.`,
    },
  ];

  const { systemPrompt } = getCriticContext(useFewShot, mode);

  let content = await generateWithModel(model, {
    systemPrompt,
    userContent,
    maxTokens,
  });

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) content = fenced[1].trim();
  content = content.trim();

  let evaluation;
  try {
    evaluation = JSON.parse(content);
  } catch {
    throw new Error('Evaluator did not return valid JSON: ' + content.slice(0, 200));
  }

  return finaliseEval(evaluation);
}

module.exports = {
  CRITIC_EXPERIMENT_BASE,
  CRITIC_MODES,
  buildEvalPrompt,
  getCriticContext,
  evaluateHtmlWithCritic,
};
