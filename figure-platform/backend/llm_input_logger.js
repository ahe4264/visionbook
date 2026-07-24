'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();
const DEFAULT_LOG_DIR = path.join(__dirname, 'context_export_llm_logs');
const INCLUDE_IMAGE_DATA = process.env.LLM_INPUT_LOG_INCLUDE_IMAGES === '1';

function safeName(value) {
  return String(value || 'default')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'default';
}

function createContextExportLLMLogContext({ jobId, contextExportId, experiment, figureStem }) {
  const root = process.env.CONTEXT_EXPORT_LLM_LOG_DIR
    ? path.resolve(process.env.CONTEXT_EXPORT_LLM_LOG_DIR)
    : DEFAULT_LOG_DIR;
  const dir = path.join(root, safeName(experiment || 'default'));
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${stamp}__${safeName(contextExportId || figureStem || jobId)}__${safeName(jobId)}.jsonl`;
  return {
    enabled: true,
    collection: 'context_export',
    jobId,
    contextExportId: contextExportId || null,
    figureStem: figureStem || null,
    experiment: experiment || null,
    logPath: path.join(dir, fileName),
  };
}

function runWithLLMInputLogging(context, fn) {
  return storage.run(context, fn);
}

function currentLLMInputLogContext() {
  return storage.getStore() || null;
}

function summarizeImageUrl(url) {
  const raw = String(url || '');
  const match = raw.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return { kind: 'image_url', url: raw };
  const [, mediaType, data] = match;
  return {
    kind: 'image_url',
    mediaType,
    base64Chars: data.length,
    approxBytes: Math.floor(data.length * 3 / 4),
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    ...(INCLUDE_IMAGE_DATA ? { url: raw } : { dataOmitted: true }),
  };
}

function summarizeUserContent(userContent) {
  return (Array.isArray(userContent) ? userContent : []).map(block => {
    if (block?.type === 'image_url') return summarizeImageUrl(block.image_url?.url);
    if (block?.type === 'text') return { kind: 'text', text: block.text || '' };
    return { kind: block?.type || 'unknown', value: block };
  });
}

function appendLLMInputLog(entry) {
  const context = currentLLMInputLogContext();
  if (!context?.enabled || !context.logPath) return;
  const payload = {
    ...context,
    event: 'llm_input',
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(context.logPath, `${JSON.stringify(payload)}\n`, 'utf-8');
}

module.exports = {
  createContextExportLLMLogContext,
  runWithLLMInputLogging,
  currentLLMInputLogContext,
  appendLLMInputLog,
  summarizeUserContent,
};