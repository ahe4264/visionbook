const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

let _browser = null;
let _browserProfileDir = null;
let _screenshotQueue = Promise.resolve();

async function getBrowser() {
    if (!_browser || !_browser.connected) {
        _browserProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-puppeteer-'));
        _browser = await puppeteer.launch({
            headless: 'new',
            userDataDir: _browserProfileDir,
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                // Software-rendered WebGL for headless. The ANGLE→SwiftShader backend is the
                // combo that actually yields a WebGL2 context on modern Chrome; the older
                // '--disable-gpu --use-gl=swiftshader' pairing fails to create a context
                // ("BindToCurrentSequence failed"), which silently blanks every 3D figure.
                '--use-gl=angle',
                '--use-angle=swiftshader',
                '--enable-unsafe-swiftshader',
                '--ignore-gpu-blocklist',
                '--disable-crash-reporter',
                '--disable-breakpad',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-component-update',
                '--disable-sync',
                '--no-first-run',
                '--no-default-browser-check',
                '--hide-crash-restore-bubble',
                '--disable-restore-session-state',
            ],
        });
        _browser.on('disconnected', () => {
            _browser = null;
            cleanupBrowserProfile();
        });
    }
    return _browser;
}

async function screenshotHtml(html, waitMs = 3500) {
    const run = () => screenshotHtmlOnce(html, waitMs);
    const queued = _screenshotQueue.then(run, run);
    _screenshotQueue = queued.catch(() => { });
    return queued;
}

async function screenshotHtmlOnce(html, waitMs = 3500) {
    // Detect if the figure uses ES module imports (Three.js CDN) — needs longer wait
    const isModule = html.includes('type="module"') || html.includes("type='module'");
    const effectiveWait = isModule ? Math.max(waitMs, 4000) : waitMs;

    let page;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 900, height: 600 });
        // Bounded, module-friendly load (see renderAndDiagnoseOnce): the 'load' event is a
        // reliable module-ready signal, and a nav timeout still lets us capture the frame
        // instead of returning null — a slow CDN shouldn't lose the critic its screenshot.
        try {
            await page.setContent(html, { waitUntil: isModule ? 'load' : 'domcontentloaded', timeout: 20000 });
        } catch (e) {
            if (!/timeout/i.test(String(e?.message || e))) throw e;
        }
        await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 6000 }).catch(() => { });
        await new Promise(r => setTimeout(r, effectiveWait));
        const shot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 82 });
        return { data: shot, mediaType: 'image/jpeg' };
    } catch (err) {
        console.warn('Screenshot failed:', err.message);
        if (/Target closed|Session closed|Protocol error|browser has disconnected/i.test(err.message || '')) {
            await closeScreenshotBrowser();
        }
        return null;
    } finally {
        if (page) await page.close().catch(() => { });
    }
}

/**
 * Render HTML headless and return a full runtime diagnosis, not just a screenshot.
 *
 * Unlike screenshotHtml (which swallows errors and returns null), this captures the
 * information a coding agent needs to self-correct:
 *   - pageErrors   : uncaught exceptions thrown during load/animation (page.on('pageerror'))
 *   - consoleErrors: console.error / console.warn output (page.on('console'))
 *   - blank        : heuristic detecting a canvas that rendered nothing (uniform color)
 *   - screenshot   : base64 JPEG (may be null if capture itself failed)
 *
 * Shares the same serialized browser queue as screenshotHtml so we never fan out
 * multiple Chromium tabs concurrently.
 *
 * @param {string} html
 * @param {{ waitMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, blank: boolean, pageErrors: string[], consoleErrors: string[], screenshot: string|null, mediaType: string, error?: string }>}
 */
async function renderAndDiagnose(html, { waitMs = 3500, navTimeoutMs = 15000 } = {}) {
    const run = () => renderAndDiagnoseOnce(html, waitMs, navTimeoutMs);
    const queued = _screenshotQueue.then(run, run);
    _screenshotQueue = queued.catch(() => ({
        ok: false, blank: true, pageErrors: ['render queue error'], consoleErrors: [], screenshot: null, mediaType: 'image/jpeg',
    }));
    return queued;
}

async function renderAndDiagnoseOnce(html, waitMs = 3500, navTimeoutMs = 15000) {
    const isModule = html.includes('type="module"') || html.includes("type='module'");
    const effectiveWait = isModule ? Math.max(waitMs, 3500) : waitMs;

    const pageErrors = [];
    const consoleErrors = [];
    let page;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 900, height: 600 });

        page.on('pageerror', err => {
            pageErrors.push(String(err?.message || err).slice(0, 500));
        });
        page.on('console', msg => {
            const type = msg.type();
            if (type === 'error' || type === 'warning') {
                const text = msg.text();
                // Ignore benign CDN/network warnings that don't reflect figure bugs.
                if (/favicon|Failed to load resource.*(png|jpg|ico)/i.test(text)) return;
                consoleErrors.push(`[${type}] ${text}`.slice(0, 500));
            }
        });

        // Bounded, module-friendly load. For ES modules the 'load' event fires after the
        // module graph is fetched+evaluated (unlike 'networkidle2' which can hang the full
        // timeout when a CDN keeps a socket open). A nav timeout is NOT fatal — we still
        // wait a beat and diagnose whatever rendered, so slow CDNs degrade instead of dying.
        let navTimedOut = false;
        try {
            await page.setContent(html, { waitUntil: isModule ? 'load' : 'domcontentloaded', timeout: navTimeoutMs });
        } catch (e) {
            navTimedOut = /timeout/i.test(String(e?.message || e));
            if (!navTimedOut) throw e;
        }
        // Give the module a bounded chance to create the canvas, then a short settle.
        await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 6000 }).catch(() => { });
        await new Promise(r => setTimeout(r, effectiveWait));
        if (navTimedOut) consoleErrors.push(`[warning] page did not finish loading within ${navTimeoutMs}ms (slow/blocked CDN or a hang) — diagnosing partial render`);

        // Screenshot first — the compositor output is the ground truth for "did anything
        // render". We deliberately DO NOT use gl.readPixels: with preserveDrawingBuffer
        // (the default) false, the WebGL drawing buffer reads back as cleared even when the
        // canvas visibly shows content, producing false "blank" positives that make an
        // agent chase phantom bugs. Instead we decode the screenshot in-page and measure
        // pixel variance against the corner (background) color.
        let screenshot = null;
        try {
            screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 82 });
        } catch { /* keep diagnosis even if screenshot fails */ }

        let blank = false;
        const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas')).catch(() => true);
        if (!hasCanvas) {
            blank = true;
        } else if (screenshot) {
            blank = await page.evaluate(async (b64) => {
                try {
                    const img = new Image();
                    img.src = 'data:image/jpeg;base64,' + b64;
                    await img.decode();
                    const c = document.createElement('canvas');
                    c.width = img.width; c.height = img.height;
                    const ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const { data } = ctx.getImageData(0, 0, c.width, c.height);
                    const r0 = data[0], g0 = data[1], b0 = data[2];
                    let differing = 0;
                    for (let i = 0; i < data.length; i += 4 * 331) { // sparse stride
                        if (Math.abs(data[i] - r0) > 10 || Math.abs(data[i + 1] - g0) > 10 || Math.abs(data[i + 2] - b0) > 10) {
                            if (++differing >= 12) return false; // enough non-background pixels → not blank
                        }
                    }
                    return true;
                } catch (e) {
                    return false; // if analysis fails, don't over-claim blank
                }
            }, screenshot).catch(() => false);
        }

        return {
            ok: pageErrors.length === 0 && consoleErrors.length === 0 && !blank,
            blank,
            pageErrors,
            consoleErrors,
            screenshot,
            mediaType: 'image/jpeg',
        };
    } catch (err) {
        if (/Target closed|Session closed|Protocol error|browser has disconnected/i.test(err.message || '')) {
            await closeScreenshotBrowser();
        }
        return {
            ok: false,
            blank: true,
            pageErrors: [...pageErrors, `render failed: ${String(err?.message || err).slice(0, 300)}`],
            consoleErrors,
            screenshot: null,
            mediaType: 'image/jpeg',
            error: String(err?.message || err),
        };
    } finally {
        if (page) await page.close().catch(() => { });
    }
}

/**
 * Render HTML at a given viewport and hand the live page to a callback so a caller
 * (e.g. the structured verifier) can run its own in-page DOM/WebGL assertions. Shares
 * the same serialized browser queue and robust module-load logic as renderAndDiagnose,
 * and always collects pageErrors/consoleErrors + a screenshot.
 *
 * The callback receives (page, ctx) where ctx = { pageErrors, consoleErrors, navTimedOut, screenshot }.
 * Whatever the callback returns is passed through. On a hard setup failure it returns
 * { __renderError: message } instead of throwing, so verification can degrade gracefully.
 *
 * @param {string} html
 * @param {{ viewport?: {width:number,height:number}, waitMs?: number, navTimeoutMs?: number, screenshot?: boolean }} opts
 * @param {(page: any, ctx: object) => Promise<any>} fn
 */
async function withRenderedPage(html, opts, fn) {
    const run = () => withRenderedPageOnce(html, opts, fn);
    const queued = _screenshotQueue.then(run, run);
    _screenshotQueue = queued.catch(() => ({ __renderError: 'render queue error' }));
    return queued;
}

async function withRenderedPageOnce(html, opts = {}, fn) {
    const {
        viewport = { width: 1366, height: 768 },
        waitMs = 3500,
        navTimeoutMs = 15000,
        screenshot = true,
    } = opts;
    const isModule = html.includes('type="module"') || html.includes("type='module'");
    const effectiveWait = isModule ? Math.max(waitMs, 3500) : waitMs;

    const pageErrors = [];
    const consoleErrors = [];
    let page;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: viewport.width, height: viewport.height });

        page.on('pageerror', err => { pageErrors.push(String(err?.message || err).slice(0, 500)); });
        page.on('console', msg => {
            const type = msg.type();
            if (type === 'error' || type === 'warning') {
                const text = msg.text();
                if (/favicon|Failed to load resource.*(png|jpg|ico)/i.test(text)) return;
                consoleErrors.push(`[${type}] ${text}`.slice(0, 500));
            }
        });

        let navTimedOut = false;
        try {
            await page.setContent(html, { waitUntil: isModule ? 'load' : 'domcontentloaded', timeout: navTimeoutMs });
        } catch (e) {
            navTimedOut = /timeout/i.test(String(e?.message || e));
            if (!navTimedOut) throw e;
        }
        await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 6000 }).catch(() => { });
        await new Promise(r => setTimeout(r, effectiveWait));
        if (navTimedOut) consoleErrors.push(`[warning] page did not finish loading within ${navTimeoutMs}ms (slow/blocked CDN or a hang)`);

        let shot = null;
        if (screenshot) {
            try { shot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 82 }); }
            catch { /* keep going without a screenshot */ }
        }

        const ctx = { pageErrors, consoleErrors, navTimedOut, screenshot: shot, mediaType: 'image/jpeg' };
        const result = await fn(page, ctx);
        return result;
    } catch (err) {
        if (/Target closed|Session closed|Protocol error|browser has disconnected/i.test(err.message || '')) {
            await closeScreenshotBrowser();
        }
        return { __renderError: String(err?.message || err).slice(0, 300), pageErrors, consoleErrors };
    } finally {
        if (page) await page.close().catch(() => { });
    }
}

async function closeScreenshotBrowser() {
    if (_browser) {
        await _browser.close().catch(() => { });
        _browser = null;
    }
    cleanupBrowserProfile();
}

function cleanupBrowserProfile() {
    if (!_browserProfileDir) return;
    const dir = _browserProfileDir;
    _browserProfileDir = null;
    fs.rm(dir, { recursive: true, force: true }, () => { });
}

function loadBaseScaffold(backendDir) {
    const scaffoldPath = path.join(backendDir, 'base_scene_new.html');
    if (!fs.existsSync(scaffoldPath)) {
        throw new Error('ERROR: base_scene_new.html not found in backend/.');
    }
    const scaffold = fs.readFileSync(scaffoldPath, 'utf-8');
    return { scaffoldPath, scaffold };
}

module.exports = {
    screenshotHtml,
    renderAndDiagnose,
    withRenderedPage,
    closeScreenshotBrowser,
    loadBaseScaffold,
};
