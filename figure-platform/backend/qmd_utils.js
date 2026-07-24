/**
 * qmd_utils.js — shared utilities for QMD file loading and line numbering.
 * Used by evaluator.js and pairwise_evaluator.js.
 */

const fs   = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');

// Maps chapter folder names (as used in experiments/pairwise) → QMD filename stem.
// Add entries here when the folder name doesn't match the .qmd filename.
const CHAPTER_ALIASES = {
  'single_view_3d':                                    '3d_scene_understanding_single_view',
  '3d_scene_understanding':                            '3d_scene_understanding_single_view',
  'stereo':                                            '3d_scene_understanding_stereo',
  'blur_filters':                                      'blurring_2',
  'generative_modeling_and_representation_learning':   'generative_modeling_and_rep_learning',
  'learning_3d':                                       '3d_learning',
  'neural_nets_as_data_transformations':               'neural_nets_as_distribution_transformers',
  'spatial_filters':                                   'spatial_filter_sets',
  'vision_and_language':                               'VLMs',
  'homographies':                                      'homography',
};

/**
 * Returns the absolute path to the .qmd file for a chapter name, or null if not found.
 * Tries: alias map → exact match → normalized match (ignore hyphens/underscores) → substring match.
 */
function findQmdFile(chapterName) {
  if (!chapterName) return null;
  const aliased = CHAPTER_ALIASES[chapterName.toLowerCase().replace(/[-_ ]/g, '_')] || CHAPTER_ALIASES[chapterName];
  if (aliased) {
    const p = path.join(ROOT_DIR, `${aliased}.qmd`);
    if (fs.existsSync(p)) return p;
  }
  const direct = path.join(ROOT_DIR, `${chapterName}.qmd`);
  if (fs.existsSync(direct)) return direct;
  const candidates = fs.readdirSync(ROOT_DIR).filter(f => f.endsWith('.qmd'));
  const norm = chapterName.toLowerCase().replace(/[-_ ]/g, '');
  for (const c of candidates) {
    if (c.replace(/\.qmd$/, '').toLowerCase().replace(/[-_ ]/g, '') === norm)
      return path.join(ROOT_DIR, c);
  }
  for (const c of candidates) {
    const stem = c.replace(/\.qmd$/, '').toLowerCase();
    if (stem.includes(chapterName.toLowerCase()) || chapterName.toLowerCase().includes(stem))
      return path.join(ROOT_DIR, c);
  }
  return null;
}

/**
 * Loads the full text of a chapter's .qmd file.
 * Throws if the chapter cannot be resolved to a file.
 */
function loadQmdForChapter(chapterName) {
  const p = findQmdFile(chapterName);
  if (!p) throw new Error(`QMD file not found for chapter: "${chapterName}"`);
  return fs.readFileSync(p, 'utf-8');
}

/**
 * Prefixes every line with a 1-indexed Lxxxxx: tag (matches chunker.py / number_lines.py format).
 * Example: "L00001: # Introduction"
 */
function numberLines(text) {
  return text.split('\n')
    .map((line, i) => `L${String(i + 1).padStart(5, '0')}: ${line}`)
    .join('\n');
}

/**
 * Extract focused context around all references to a figure stem in a chapter.
 * Uses multi-match chunk joining (collects every occurrence, merges nearby lines).
 * Falls back to the first 40 lines if the stem is not mentioned.
 * Returns null if the chapter file cannot be found or read.
 */
function extractFigureContext(figureStem, chapterName) {
  const qmdPath = findQmdFile(chapterName);
  if (!qmdPath) return null;

  let content;
  try {
    content = fs.readFileSync(qmdPath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  const stemLower = figureStem.toLowerCase().replace(/\.[^.]+$/, '');
  const RADIUS = 15;
  const collected = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (
      line.includes(stemLower) ||
      line.includes('/' + stemLower + '.') ||
      line.includes('/' + stemLower + ')')
    ) {
      const start = Math.max(0, i - RADIUS);
      const end = Math.min(lines.length - 1, i + RADIUS);
      for (let j = start; j <= end; j++) collected.add(j);
    }
  }

  if (collected.size === 0) {
    return lines.slice(0, 40).join('\n');
  }

  const sorted = [...collected].sort((a, b) => a - b);
  const chunks = [];
  let chunkStart = sorted[0];
  let chunkEnd = sorted[0];
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k] <= chunkEnd + 3) {
      chunkEnd = sorted[k];
    } else {
      chunks.push(lines.slice(chunkStart, chunkEnd + 1).join('\n'));
      chunkStart = sorted[k];
      chunkEnd = sorted[k];
    }
  }
  chunks.push(lines.slice(chunkStart, chunkEnd + 1).join('\n'));
  return chunks.join('\n\n[...]\n\n');
}

module.exports = { findQmdFile, loadQmdForChapter, numberLines, extractFigureContext };
