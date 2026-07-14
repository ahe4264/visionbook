/**
 * verify.js — structured, rendered verification for generated 3D figures.
 *
 * The single most important reliability lesson: agents produce plausible-looking but
 * broken figures unless you RENDER them and check concrete properties. This module does
 * that. It renders the figure headless at one or more viewport sizes and runs a battery
 * of checks that fall into three buckets:
 *
 *   1. Runtime   — no uncaught exceptions, error overlay hidden, render loop alive.
 *   2. Technical — (non-tautological) the GPU actually drew something, the scene has
 *                  content, no NaN geometry. These can't be faked by emitting markup.
 *   3. Layout    — no horizontal overflow, controls on-screen & not clipped, labels not
 *                  pushed off-screen / not enormous, MathJax not overflowing.
 *
 * Each check has a severity: 'error' (must be fixed → blocks) or 'warn' (reported, not
 * blocking). verifyFigure() aggregates across viewports and returns a compact report the
 * agent can act on, plus a screenshot for visual comparison.
 *
 * Domain-specific checks (e.g. thin-lens geometry, Monte-Carlo orientation) can be added
 * per figure via the `domainChecks` option — see runDomainChecks().
 */

const { withRenderedPage } = require('./runtime-helpers');

const DEFAULT_VIEWPORTS = [
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'small-laptop', width: 1280, height: 800 },
];

/**
 * Collect raw facts from the rendered page. Runs entirely in the browser.
 * Kept as one function so it can be page.evaluate()'d in a single round-trip.
 */
/* eslint-disable */
function COLLECT_FACTS() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const de = document.documentElement;

    const isVisible = (el) => {
        if (!el) return false;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };

    const errOverlay = document.getElementById('err-overlay');
    const errOverlayVisible = errOverlay ? (getComputedStyle(errOverlay).display !== 'none') : false;
    const errMsg = errOverlayVisible ? (document.getElementById('err-msg')?.textContent || '') : '';

    const canvas = document.querySelector('canvas');
    const canvasRect = canvas ? canvas.getBoundingClientRect() : null;

    const ui = document.getElementById('ui');
    const uiRect = ui ? ui.getBoundingClientRect() : null;

    const labelEls = [...document.querySelectorAll('.lbl')].filter(isVisible);
    const labels = labelEls.map(d => {
        const r = d.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom, text: (d.textContent || '').trim().slice(0, 24) };
    });

    let three = null;
    if (window.__figverify) {
        try {
            const { renderer, scene } = window.__figverify;
            let objects = 0, drawn = 0, nan = false;
            scene.traverse(o => {
                objects++;
                if (o.isMesh || o.isLine || o.isLineSegments || o.isPoints || o.isSprite) {
                    drawn++;
                    const m = o.matrixWorld && o.matrixWorld.elements;
                    if (m && ![m[12], m[13], m[14]].every(Number.isFinite)) nan = true;
                }
            });
            const info = renderer.info && renderer.info.render;
            three = {
                objects,
                drawn,
                nan,
                children: scene.children.length,
                drawCalls: info ? info.calls : -1,
                triangles: info ? info.triangles : -1,
            };
        } catch (e) {
            three = { error: String(e && e.message || e) };
        }
    }

    const mjEls = [...document.querySelectorAll('mjx-container, .MathJax, .mjx-chtml, .katex')];
    const mathjax = {
        count: mjEls.length,
        overflow: mjEls.some(e => {
            const r = e.getBoundingClientRect();
            return r.right > vw + 2 || r.left < -2 || r.width > vw * 0.95 || r.height > vh * 0.4;
        }),
    };

    return {
        vw, vh,
        scrollWidth: de.scrollWidth,
        scrollHeight: de.scrollHeight,
        errOverlayVisible, errMsg,
        canvas: canvas ? { cw: canvas.clientWidth, ch: canvas.clientHeight, w: canvasRect.width, h: canvasRect.height, top: canvasRect.top, left: canvasRect.left } : null,
        ui: ui ? {
            top: uiRect.top, left: uiRect.left, right: uiRect.right, bottom: uiRect.bottom,
            w: uiRect.width, h: uiRect.height,
            scrollH: ui.scrollHeight, clientH: ui.clientHeight,
            controls: ui.querySelectorAll('input, button:not([style*="display:none"]), select').length,
        } : null,
        labels,
        three,
        mathjax,
        frames: window.__figFrames || 0,
        hasFigVerify: !!window.__figverify,
    };
}
/* eslint-enable */

/** Rectangle intersection-over-min-area, for overlap detection. */
function overlapRatio(a, b) {
    const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    const inter = ix * iy;
    if (inter <= 0) return 0;
    const minArea = Math.max(1, Math.min(a.w * a.h, b.w * b.h));
    return inter / minArea;
}

/** Build the check list for a single viewport from collected facts + runtime signals. */
function checksForViewport(facts, ctx, viewportName) {
    const checks = [];
    const add = (id, level, pass, message) => checks.push({ id, level, pass, message, viewport: viewportName });

    // ── Runtime ──────────────────────────────────────────────────────────────
    add('no_runtime_exceptions', 'error', ctx.pageErrors.length === 0,
        ctx.pageErrors.length ? `uncaught exception(s): ${ctx.pageErrors.slice(0, 3).join(' | ')}` : 'no uncaught exceptions');

    add('error_overlay_hidden', 'error', !facts.errOverlayVisible,
        facts.errOverlayVisible ? `the scaffold error overlay is showing ("${facts.errMsg}") — the figure failed to load` : 'error overlay hidden');

    if (facts.hasFigVerify) {
        add('render_loop_alive', 'error', (ctx.framesAfter ?? facts.frames) > (ctx.framesBefore ?? 0) && facts.frames > 1,
            facts.frames <= 1 ? 'render loop never advanced past the first frame (likely an exception inside animate())'
                : (ctx.framesAfter <= ctx.framesBefore ? 'render loop is frozen (frame count not increasing)' : `render loop alive (${facts.frames}+ frames)`));
    }

    // Non-benign console errors are a warning (many are noisy but some reveal bugs).
    const consoleErrs = ctx.consoleErrors.filter(e => !/did not finish loading/.test(e));
    add('no_console_errors', 'warn', consoleErrs.length === 0,
        consoleErrs.length ? `console error(s): ${consoleErrs.slice(0, 3).join(' | ')}` : 'no console errors');

    // ── Technical (non-tautological) ──────────────────────────────────────────
    if (facts.three && !facts.three.error) {
        add('gpu_drew_something', 'error', facts.three.drawCalls > 0,
            facts.three.drawCalls > 0 ? `renderer issued ${facts.three.drawCalls} draw call(s)` : 'renderer issued 0 draw calls — nothing was actually drawn this frame');
        add('scene_has_content', 'error', facts.three.drawn > 0,
            facts.three.drawn > 0 ? `${facts.three.drawn} drawable object(s) in scene` : 'scene has no meshes/lines/points — nothing was added');
        add('no_nan_geometry', 'error', !facts.three.nan,
            facts.three.nan ? 'an object has NaN/undefined world coordinates (bad math → invisible or corrupt geometry)' : 'no NaN geometry');
    } else if (facts.three && facts.three.error) {
        add('scene_introspection', 'warn', false, `could not introspect scene: ${facts.three.error}`);
    }

    add('canvas_not_blank', 'error', !ctx.blank,
        ctx.blank ? 'canvas rendered blank (uniform color) — nothing visible' : 'canvas has visible content');

    add('canvas_present_sized', 'error', !!(facts.canvas && facts.canvas.cw > 0 && facts.canvas.ch > 0),
        facts.canvas ? (facts.canvas.cw > 0 ? 'canvas sized' : 'canvas has zero size') : 'no <canvas> found');

    // ── Layout ────────────────────────────────────────────────────────────────
    add('no_horizontal_overflow', 'error', facts.scrollWidth <= facts.vw + 2,
        facts.scrollWidth > facts.vw + 2 ? `page is wider than the viewport (${facts.scrollWidth}px > ${facts.vw}px) — horizontal scroll` : 'no horizontal overflow');

    add('no_vertical_overflow', 'warn', facts.scrollHeight <= facts.vh + 2,
        facts.scrollHeight > facts.vh + 2 ? `page is taller than the viewport (${facts.scrollHeight}px > ${facts.vh}px)` : 'no vertical overflow');

    if (facts.ui) {
        const onScreen = facts.ui.left >= -2 && facts.ui.top >= -2 && facts.ui.right <= facts.vw + 2 && facts.ui.bottom <= facts.vh + 2;
        add('controls_on_screen', 'error', onScreen,
            onScreen ? 'control panel fully on-screen' : `control panel is partly off-screen (rect ${Math.round(facts.ui.left)},${Math.round(facts.ui.top)} → ${Math.round(facts.ui.right)},${Math.round(facts.ui.bottom)} vs ${facts.vw}x${facts.vh})`);
        const clipped = facts.ui.scrollH > facts.ui.clientH + 4;
        add('controls_not_clipped', 'warn', !clipped,
            clipped ? `control panel content is taller than its max-height — some controls are hidden (scrollH ${facts.ui.scrollH} > clientH ${facts.ui.clientH})` : 'controls not clipped');
    }

    // Labels off-screen / enormous / overlapping
    const offscreen = facts.labels.filter(l => l.right < 0 || l.bottom < 0 || l.x > facts.vw || l.y > facts.vh);
    add('labels_on_screen', 'warn', offscreen.length === 0,
        offscreen.length ? `${offscreen.length} visible label(s) are off-screen (e.g. "${offscreen[0].text}")` : 'labels on-screen');

    const enormous = facts.labels.filter(l => l.h > facts.vh * 0.25 || l.w > facts.vw * 0.6);
    add('labels_not_enormous', 'warn', enormous.length === 0,
        enormous.length ? `${enormous.length} label(s) are enormous (e.g. "${enormous[0].text}" ${Math.round(enormous[0].w)}x${Math.round(enormous[0].h)}px)` : 'label sizes reasonable');

    let heavyOverlaps = 0;
    for (let i = 0; i < facts.labels.length; i++) {
        for (let j = i + 1; j < facts.labels.length; j++) {
            if (overlapRatio(facts.labels[i], facts.labels[j]) > 0.6) heavyOverlaps++;
        }
    }
    add('labels_no_heavy_overlap', 'warn', heavyOverlaps === 0,
        heavyOverlaps ? `${heavyOverlaps} pair(s) of labels heavily overlap (unreadable)` : 'labels not heavily overlapping');

    // MathJax
    if (facts.mathjax.count > 0) {
        add('mathjax_no_overflow', 'error', !facts.mathjax.overflow,
            facts.mathjax.overflow ? 'MathJax/KaTeX equation overflows the viewport' : 'equations fit the viewport');
    }

    return checks;
}

/**
 * Verify a figure by rendering it at each viewport and running the check battery.
 *
 * @param {string} html
 * @param {{ viewports?: Array, waitMs?: number, navTimeoutMs?: number, domainChecks?: Array }} [opts]
 * @returns {Promise<{ ok: boolean, errors: object[], warnings: object[], checks: object[],
 *   screenshot: string|null, mediaType: string, byViewport: object }>}
 */
async function verifyFigure(html, opts = {}) {
    const {
        viewports = DEFAULT_VIEWPORTS,
        waitMs = 3500,
        navTimeoutMs = 15000,
        domainChecks = [],
    } = opts;

    const allChecks = [];
    const byViewport = {};
    let primaryScreenshot = null;

    for (const vp of viewports) {
        const res = await withRenderedPage(html, { viewport: vp, waitMs, navTimeoutMs }, async (page, ctx) => {
            // frame liveness: sample the counter twice
            const framesBefore = await page.evaluate(() => window.__figFrames || 0).catch(() => 0);
            await new Promise(r => setTimeout(r, 300));
            const framesAfter = await page.evaluate(() => window.__figFrames || 0).catch(() => 0);

            const facts = await page.evaluate(COLLECT_FACTS).catch(e => ({ __evalError: String(e && e.message || e) }));

            // blank check from the screenshot (compositor truth), reusing the same idea as renderAndDiagnose
            let blank = false;
            if (ctx.screenshot) {
                blank = await page.evaluate(async (b64) => {
                    try {
                        const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
                        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
                        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
                        const d = g.getImageData(0, 0, c.width, c.height).data;
                        const r0 = d[0], g0 = d[1], b0 = d[2]; let diff = 0;
                        for (let i = 0; i < d.length; i += 4 * 331) {
                            if (Math.abs(d[i] - r0) > 10 || Math.abs(d[i + 1] - g0) > 10 || Math.abs(d[i + 2] - b0) > 10) { if (++diff >= 12) return false; }
                        }
                        return true;
                    } catch { return false; }
                }, ctx.screenshot).catch(() => false);
            }

            const domain = await runDomainChecks(page, domainChecks, vp.name);
            return { facts, ctx: { ...ctx, framesBefore, framesAfter, blank }, domain };
        });

        if (res && res.__renderError) {
            allChecks.push({ id: 'render_failed', level: 'error', pass: false, message: `render failed: ${res.__renderError}`, viewport: vp.name });
            byViewport[vp.name] = { error: res.__renderError };
            continue;
        }

        const { facts, ctx, domain } = res;
        if (facts && facts.__evalError) {
            allChecks.push({ id: 'facts_eval', level: 'error', pass: false, message: `could not read page: ${facts.__evalError}`, viewport: vp.name });
            continue;
        }

        const checks = checksForViewport(facts, ctx, vp.name).concat(domain || []);
        allChecks.push(...checks);
        byViewport[vp.name] = { facts, screenshot: ctx.screenshot };
        if (!primaryScreenshot && ctx.screenshot) primaryScreenshot = ctx.screenshot;
    }

    const errors = allChecks.filter(c => c.level === 'error' && !c.pass);
    const warnings = allChecks.filter(c => c.level === 'warn' && !c.pass);

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        checks: allChecks,
        screenshot: primaryScreenshot,
        mediaType: 'image/jpeg',
        byViewport,
    };
}

/**
 * Run optional per-figure domain checks. Each entry is
 *   { id, level?, evaluate: (facts?) => boolean|string, message? }
 * but to keep them sandbox-safe we accept a browser-evaluable function `pageFn`
 * that returns { pass, message }.
 */
async function runDomainChecks(page, domainChecks, viewportName) {
    if (!Array.isArray(domainChecks) || !domainChecks.length) return [];
    const out = [];
    for (const dc of domainChecks) {
        try {
            const r = await page.evaluate(dc.pageFn);
            out.push({ id: dc.id || 'domain_check', level: dc.level || 'error', pass: !!(r && r.pass), message: (r && r.message) || dc.id, viewport: viewportName });
        } catch (e) {
            out.push({ id: dc.id || 'domain_check', level: 'warn', pass: false, message: `domain check threw: ${String(e && e.message || e)}`, viewport: viewportName });
        }
    }
    return out;
}

/** Render a verification report into compact, agent-actionable feedback text. */
function formatVerificationForAgent(report) {
    const lines = [];
    if (report.ok && !report.warnings.length) {
        lines.push('VERIFICATION PASSED: no errors, no warnings. If the screenshot resembles the source figure, you are done.');
        return lines.join('\n');
    }
    if (report.errors.length) {
        lines.push(`VERIFICATION FAILED — ${report.errors.length} blocking error(s) you MUST fix:`);
        for (const e of dedupeChecks(report.errors)) lines.push(`  ✗ [${e.id}] ${e.message}`);
    } else {
        lines.push('VERIFICATION PASSED (no blocking errors).');
    }
    if (report.warnings.length) {
        lines.push(`Warnings (fix if easy, not blocking):`);
        for (const w of dedupeChecks(report.warnings)) lines.push(`  · [${w.id}] ${w.message}`);
    }
    return lines.join('\n');
}

/** Collapse the same check firing across multiple viewports into one line. */
function dedupeChecks(checks) {
    const seen = new Map();
    for (const c of checks) {
        const key = c.id + '|' + c.message;
        if (!seen.has(key)) seen.set(key, { ...c, viewports: [c.viewport] });
        else seen.get(key).viewports.push(c.viewport);
    }
    return [...seen.values()].map(c => ({ ...c, message: c.viewports.length > 1 ? `${c.message} (at ${c.viewports.join(', ')})` : c.message }));
}

module.exports = {
    verifyFigure,
    formatVerificationForAgent,
    DEFAULT_VIEWPORTS,
};
