'use strict';

const { generateWithModel } = require('./models');

function stripCodeFence(text) {
    let out = String(text || '').trim();
    if (out.startsWith('```')) {
        out = out.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }
    return out;
}

function extractCompleteHtml(text) {
    const stripped = stripCodeFence(text);
    const start = stripped.search(/<!doctype html/i);
    const end = stripped.toLowerCase().lastIndexOf('</html>');
    if (start < 0 || end < 0) {
        throw new Error('Stitcher model did not return a complete HTML document.');
    }
    return stripped.slice(start, end + '</html>'.length).trim();
}

function countOccurrences(text, needle) {
    return text.split(needle).length - 1;
}

function dataUrlForHtml(html) {
    return 'data:text/html;charset=utf-8;base64,' + Buffer.from(html, 'utf8').toString('base64');
}

function replacePanelPlaceholders(wrapperHtml, panels) {
    let html = wrapperHtml;
    for (let i = 0; i < panels.length; i++) {
        const placeholder = `__PANEL_${i + 1}_SRC__`;
        const count = countOccurrences(html, placeholder);
        if (count !== 1) {
            throw new Error(`Stitcher model must use ${placeholder} exactly once; found ${count}.`);
        }
        html = html.replace(placeholder, dataUrlForHtml(panels[i].html));
    }
    return html;
}

function buildStitchPrompt({ parentStem, parentFilename, panels, grid, sourceAspectRatio }) {
    const placeholderList = panels
        .map((panel, i) => `${i + 1}. ${panel.stem} (${panel.filename}) -> __PANEL_${i + 1}_SRC__`)
        .join('\n');

    const layoutHint = grid
        ? `${grid.numCols || 'unknown'} columns x ${grid.numRows || 'unknown'} rows`
        : 'unknown grid';
    const aspectHint = Number.isFinite(sourceAspectRatio)
        ? `aspect ratio ${sourceAspectRatio.toFixed(4)}`
        : 'unknown aspect ratio';

    return `Make one complete HTML page that lays out the provided panel HTML documents as a single multi-panel figure.

Return only HTML: start with <!DOCTYPE html> and end with </html>.

Use iframes. Use each src placeholder exactly once:
${placeholderList}

Match the original source image layout. Hints: ${parentStem} / ${parentFilename}, ${layoutHint}, ${aspectHint}.

No visible title, caption, controls, borders, or debug text. White background. html/body margin:0; padding:0; width:100%; height:100%; overflow:hidden. The wrapper should fill its iframe.`;
}

async function generateStitchedPanelHtml({
    modelId,
    parentStem,
    parentFilename,
    parentImageBase64,
    parentMediaType,
    sourceAspectRatio,
    panels,
    grid,
    maxTokens = 5000,
}) {
    if (!modelId) throw new Error('modelId is required.');
    if (!parentStem) throw new Error('parentStem is required.');
    if (!Array.isArray(panels) || panels.length < 2) {
        throw new Error('At least two panels are required for stitching.');
    }
    for (const panel of panels) {
        if (!panel.html) throw new Error(`Panel ${panel.stem || panel.filename || '?'} is missing html.`);
    }

    const systemPrompt = 'Create compact HTML wrappers for multi-panel textbook figures.';
    const prompt = buildStitchPrompt({ parentStem, parentFilename, panels, grid, sourceAspectRatio });
    const userContent = [{ type: 'text', text: prompt }];

    if (parentImageBase64 && parentMediaType) {
        userContent.push({
            type: 'image_url',
            image_url: { url: `data:${parentMediaType};base64,${parentImageBase64}` },
        });
    }

    for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        if (!panel.sourceBase64 || !panel.sourceMediaType) continue;
        userContent.push({ type: 'text', text: `Panel ${i + 1}: ${panel.stem || panel.filename}` });
        userContent.push({
            type: 'image_url',
            image_url: { url: `data:${panel.sourceMediaType};base64,${panel.sourceBase64}` },
        });
    }

    const raw = await generateWithModel(modelId, { systemPrompt, userContent, maxTokens });
    const wrapperHtml = extractCompleteHtml(raw);
    return replacePanelPlaceholders(wrapperHtml, panels);
}

module.exports = {
    generateStitchedPanelHtml,
};