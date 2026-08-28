'use strict';

const fs = require('fs');
const path = require('path');

const PLATFORM_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '..', '..');
const CONTEXT_EXPORT_PATH = path.join(PLATFORM_ROOT, 'contexts_export.json');
const CHAPTER_FIGURES_DIR = path.join(PLATFORM_ROOT, 'chapter-figures');
const FIGURES_DIR = path.join(REPO_ROOT, 'figures');
const DEFAULT_IMAGE_ROOTS = [String.raw`C:\Users\ahe42\Documents\figure-benchmark\public`];

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
const TYPE_FOLDERS = {
  '3d': ['candidates_3d', '3d', 'diagrams_3d'],
  '2d': ['diagrams_2d', '2d', 'candidates_2d'],
};

function mediaTypeFor(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/png';
}

function chapterFromSource(source) {
  if (!source) return null;
  return path.basename(String(source)).replace(/\.qmd$/i, '').replace(/^visionbook[\\/]/i, '');
}

function safeStem(value) {
  return String(value || '')
    .replace(/\.(png|jpg|jpeg|webp|gif|svg)$/i, '')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '');
}

function findRecursive(root, stem) {
  if (!root || !stem || !fs.existsSync(root)) return null;
  const stack = [root];
  const wanted = new Set(IMAGE_EXTS.map(ext => `${stem}${ext}`.toLowerCase()));
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (wanted.has(entry.name.toLowerCase())) {
        return fullPath;
      }
    }
  }
  return null;
}

function parseImageRoots(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || '').split(path.delimiter);
  return values
    .map(root => String(root || '').trim())
    .filter(Boolean)
    .map(root => path.resolve(root));
}

function getExtraImageRoots(options = {}) {
  const roots = [
    ...DEFAULT_IMAGE_ROOTS,
    ...parseImageRoots(process.env.CONTEXT_EXPORT_IMAGE_ROOTS || ''),
    ...parseImageRoots(options.imageRoots || []),
  ];
  return Array.from(new Set(roots)).filter(root => fs.existsSync(root));
}

function existingFile(candidate) {
  if (!candidate) return null;
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function resolveLogicalImagePath(logicalPath, roots) {
  if (!logicalPath) return null;
  const normalizedLogical = String(logicalPath).replace(/^[\\/]+/, '');
  if (path.isAbsolute(normalizedLogical)) return existingFile(normalizedLogical);

  const withoutImagesPrefix = normalizedLogical.replace(/^images[\\/]/i, '');
  const basename = path.basename(normalizedLogical);
  const withAnyKnownExtension = (candidate) => {
    const ext = path.extname(candidate);
    const base = ext ? candidate.slice(0, -ext.length) : candidate;
    return [candidate, ...IMAGE_EXTS.map(nextExt => `${base}${nextExt}`)];
  };
  for (const root of roots) {
    const rootVariants = [
      root,
      path.join(root, 'public'),
      path.join(root, 'dist'),
      path.join(root, 'public', 'images'),
      path.join(root, 'dist', 'images'),
    ];
    for (const rootVariant of rootVariants) {
      const candidates = [
        path.resolve(rootVariant, normalizedLogical),
        path.resolve(rootVariant, withoutImagesPrefix),
        path.resolve(rootVariant, basename),
      ];
      for (const candidate of candidates.flatMap(withAnyKnownExtension)) {
        const hit = existingFile(candidate);
        if (hit) return hit;
      }
    }
  }
  return null;
}

function resolveImagePath(row, options = {}) {
  const stem = safeStem(row.figure_id || path.basename(row.figure || '', path.extname(row.figure || '')));
  const chapter = chapterFromSource(row.source);
  const type = String(row.type || '').toLowerCase();
  const folders = TYPE_FOLDERS[type] || [];
  const externalRoots = getExtraImageRoots(options);
  const logicalHit = resolveLogicalImagePath(row.figure, [PLATFORM_ROOT, REPO_ROOT, ...externalRoots]);
  if (logicalHit) return logicalHit;

  if (chapter) {
    for (const folder of folders) {
      for (const ext of IMAGE_EXTS) {
        const candidate = path.join(CHAPTER_FIGURES_DIR, chapter, folder, `${stem}${ext}`);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    const chapterHit = findRecursive(path.join(CHAPTER_FIGURES_DIR, chapter), stem);
    if (chapterHit) return chapterHit;
  }

  const logicalFigureName = row.figure ? path.basename(row.figure) : null;
  if (logicalFigureName) {
    const logicalStem = safeStem(logicalFigureName);
    for (const root of externalRoots) {
      const externalHit = findRecursive(root, logicalStem);
      if (externalHit) return externalHit;
    }
    const platformHit = findRecursive(CHAPTER_FIGURES_DIR, logicalStem);
    if (platformHit) return platformHit;
    const figuresHit = findRecursive(FIGURES_DIR, logicalStem);
    if (figuresHit) return figuresHit;
  }

  return findRecursive(FIGURES_DIR, stem) || null;
}

function normalizeRow(row, index, options = {}) {
  const { includeImage = false } = options;
  const figureStem = safeStem(row.figure_id || `context_export_${index + 1}`);
  const chapterName = chapterFromSource(row.source);
  const imagePath = resolveImagePath(row, options);
  const filename = imagePath ? path.basename(imagePath) : `${figureStem}.png`;
  const item = {
    id: figureStem,
    index,
    figureStem,
    figureId: row.figure_id || figureStem,
    filename,
    chapterName,
    figureType: String(row.type || '').toLowerCase() === '2d' ? '2d' : '3d',
    subject: row.domain || null,
    sourcePath: row.source || null,
    logicalFigurePath: row.figure || null,
    imagePath,
    mediaType: imagePath ? mediaTypeFor(imagePath) : 'image/png',
    context: row.context || '',
    caption: row.caption || null,
    authoredPrompt: row['input prompt'] || '',
    authoredInteractions: row.interactions || '',
    imageMissing: !imagePath,
  };
  if (includeImage && imagePath && fs.existsSync(imagePath)) {
    item.base64 = fs.readFileSync(imagePath).toString('base64');
  }
  return item;
}

function readContextExportRows() {
  if (!fs.existsSync(CONTEXT_EXPORT_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(CONTEXT_EXPORT_PATH, 'utf-8'));
  return Array.isArray(parsed) ? parsed : [];
}

// ── Restrict the tab to the latest figure batch ──────────────────────────────
// The 150 figures added in the most recent contexts_export.json update are all
// tagged with a `new_*` domain (new_math / new_physics / new_chemistry / new_cs);
// none of the original 100 benchmark rows use that prefix. Keeping only those
// rows pins the Context Exports tab to the new batch.
// To show everything again: delete INCLUDED_DOMAIN_PREFIX, isIncludedRow, and the
// .filter() call in listContextExports below.
const INCLUDED_DOMAIN_PREFIX = 'new_';

function isIncludedRow(row) {
  return String(row?.domain || '').toLowerCase().startsWith(INCLUDED_DOMAIN_PREFIX);
}

function listContextExports(options = {}) {
  // Filter before normalizeRow so excluded rows skip image resolution / base64 reads.
  return readContextExportRows()
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => isIncludedRow(row))
    .map(({ row, index }) => normalizeRow(row, index, options));
}

function getContextExport(id, options = {}) {
  const rows = listContextExports(options);
  return rows.find(row => row.id === id || row.figureId === id) || null;
}

module.exports = {
  listContextExports,
  getContextExport,
  mediaTypeFor,
  getExtraImageRoots,
  safeStem,
};