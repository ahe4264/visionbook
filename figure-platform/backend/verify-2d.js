/**
 * verify-2d.js - rendered verification for inline 2D interactive demos.
 *
 * This is intentionally deterministic and mechanical. It does not try to judge
 * semantic faithfulness; it catches broken pages before a user opens them:
 * runtime errors, blank output, overflow/clipping, missing SVG/canvas/content,
 * and missing lightweight explainer affordances.
 */

const { withRenderedPage } = require('./runtime-helpers');

const DEFAULT_2D_VIEWPORTS = [
  { name: 'inline', width: 900, height: 560 },
  { name: 'narrow-inline', width: 640, height: 520 },
];

function push(checks, viewport, id, pass, message, level = 'error') {
  checks.push({ viewport, id, pass: Boolean(pass), message, level });
}

function dedupe(checks) {
  const out = [];
  const seen = new Set();
  for (const c of checks) {
    const key = `${c.level}:${c.id}:${c.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

async function verify2dHtml(html, opts = {}) {
  const viewports = opts.viewports || DEFAULT_2D_VIEWPORTS;
  const checks = [];
  let screenshot = null;
  let mediaType = 'image/jpeg';

  for (const vp of viewports) {
    const facts = await withRenderedPage(html, {
      viewport: { width: vp.width, height: vp.height },
      waitMs: opts.waitMs || 1200,
      navTimeoutMs: opts.navTimeoutMs || 12000,
      screenshot: true,
    }, async (page, ctx) => {
      const pageFacts = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const all = [...document.querySelectorAll('body *')];
        const visible = all.filter(el => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.01;
        });
        const svg = document.querySelector('svg');
        const canvas = document.querySelector('canvas');
        const main = document.querySelector('main,.demo,.figure,.stage,.canvas-wrap,svg,canvas');
        const mainRect = main ? main.getBoundingClientRect() : null;
        const interactive = all.filter(el => {
          const role = el.getAttribute('role') || '';
          const tab = el.getAttribute('tabindex');
          const cls = el.className && String(el.className);
          const ds = Object.keys(el.dataset || {});
          return el.onclick || role === 'button' || tab === '0' || ds.some(k => /tip|popup|explain|interactive/i.test(k)) || /hotspot|interactive|clickable|node|edge/i.test(cls || '');
        });
        const source = document.documentElement.outerHTML;
        return {
          title: document.title || '',
          bodyText: (body?.innerText || '').trim().slice(0, 2000),
          vw: innerWidth,
          vh: innerHeight,
          scrollW: Math.max(doc.scrollWidth, body?.scrollWidth || 0),
          scrollH: Math.max(doc.scrollHeight, body?.scrollHeight || 0),
          visibleCount: visible.length,
          hasSvg: Boolean(svg),
          hasCanvas: Boolean(canvas),
          mainRect: mainRect ? { x: mainRect.x, y: mainRect.y, width: mainRect.width, height: mainRect.height, bottom: mainRect.bottom, right: mainRect.right } : null,
          interactiveCount: interactive.length,
          hasPostMessagePopup: /alex-popup|postMessage\s*\(/.test(source),
          hasTooltip: /tooltip|title=|data-tooltip|mousemove|mouseenter/.test(source),
        };
      });
      return {
        ...pageFacts,
        pageErrors: ctx.pageErrors,
        consoleErrors: ctx.consoleErrors,
        screenshot: ctx.screenshot,
        mediaType: ctx.mediaType,
        renderError: ctx.__renderError || null,
      };
    });

    if (facts?.screenshot && !screenshot) {
      screenshot = facts.screenshot;
      mediaType = facts.mediaType || mediaType;
    }

    const name = vp.name;
    if (facts?.__renderError || facts?.renderError) {
      push(checks, name, 'render-error', false, facts.__renderError || facts.renderError);
      continue;
    }
    push(checks, name, 'no-page-errors', !facts.pageErrors?.length, `uncaught errors: ${(facts.pageErrors || []).join('; ')}`);
    push(checks, name, 'no-console-errors', !facts.consoleErrors?.length, `console errors/warnings: ${(facts.consoleErrors || []).join('; ')}`, 'warn');
    push(checks, name, 'has-visual-root', facts.hasSvg || facts.hasCanvas || facts.visibleCount >= 8, 'page has no substantial visual SVG/canvas/DOM content');
    push(checks, name, 'not-empty-text-or-graphics', facts.visibleCount >= 5 || facts.bodyText.length > 40, 'page appears blank or nearly blank');
    push(checks, name, 'no-horizontal-overflow', facts.scrollW <= facts.vw + 8, `page width ${facts.scrollW}px exceeds viewport ${facts.vw}px`);
    push(checks, name, 'reasonable-height', facts.scrollH <= facts.vh * 1.35, `page height ${facts.scrollH}px is too tall for inline use`, 'warn');
    if (facts.mainRect) {
      push(checks, name, 'main-visible', facts.mainRect.width > 80 && facts.mainRect.height > 80 && facts.mainRect.y < facts.vh * 0.8, 'main visualization is missing or pushed below fold');
      push(checks, name, 'main-not-clipped-wide', facts.mainRect.right <= facts.vw + 8, 'main visualization is clipped horizontally');
    }
    push(checks, name, 'has-explainer-affordance', facts.interactiveCount > 0 || facts.hasPostMessagePopup || facts.hasTooltip, 'no hover/click explainer affordance detected', 'warn');
  }

  const errors = dedupe(checks.filter(c => !c.pass && c.level === 'error'));
  const warnings = dedupe(checks.filter(c => !c.pass && c.level !== 'error'));
  return { ok: errors.length === 0, errors, warnings, checks, screenshot, mediaType };
}

function format2dVerificationForAgent(report) {
  const lines = [];
  lines.push(report.ok ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED');
  if (report.errors.length) {
    lines.push('Blocking errors:');
    for (const e of report.errors) lines.push(`- [${e.id}] ${e.message}`);
  }
  if (report.warnings.length) {
    lines.push('Warnings:');
    for (const w of report.warnings) lines.push(`- [${w.id}] ${w.message}`);
  }
  if (!report.errors.length && !report.warnings.length) lines.push('All mechanical inline-demo checks passed.');
  return lines.join('\n');
}

module.exports = { verify2dHtml, format2dVerificationForAgent, DEFAULT_2D_VIEWPORTS };
