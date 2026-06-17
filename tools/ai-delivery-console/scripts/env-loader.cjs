const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_PROFILES = new Set(['local', 'dev', 'prd']);

function resolveEnvProfile(value) {
  const requested = String(value || process.env.AI_DELIVERY_ENV || process.env.VITE_AI_DELIVERY_ENV || 'local').trim();
  return SUPPORTED_PROFILES.has(requested) ? requested : 'local';
}

function parseEnvText(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = normalized.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    values[key] = parseEnvValue(normalized.slice(eqIndex + 1).trim());
  }
  return values;
}

function parseEnvValue(raw) {
  if (!raw) {
    return '';
  }
  const quote = raw[0];
  if ((quote === '"' || quote === "'") && raw.endsWith(quote)) {
    const unquoted = raw.slice(1, -1);
    return quote === '"' ? unquoted.replace(/\\n/g, '\n').replace(/\\"/g, '"') : unquoted;
  }
  const hashIndex = raw.indexOf(' #');
  return (hashIndex >= 0 ? raw.slice(0, hashIndex) : raw).trim();
}

function envFilePaths(rootDir, profile) {
  return [
    path.join(rootDir, '.env'),
    path.join(rootDir, `.env.${profile}`),
    path.join(rootDir, `.env.${profile}.local`)
  ];
}

function loadProfileEnv(rootDir, options = {}) {
  const profile = resolveEnvProfile(typeof options === 'string' ? options : options.profile);
  const override = Boolean(typeof options === 'object' && options.override);
  const loadedFiles = [];
  const loadedValues = {};
  for (const filePath of envFilePaths(rootDir, profile)) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const parsed = parseEnvText(fs.readFileSync(filePath, 'utf8'));
    loadedFiles.push(filePath);
    for (const [key, value] of Object.entries(parsed)) {
      if (override || process.env[key] === undefined) {
        process.env[key] = value;
      }
      loadedValues[key] = value;
    }
  }
  return {
    profile,
    loadedFiles,
    values: loadedValues
  };
}

module.exports = {
  envFilePaths,
  loadProfileEnv,
  parseEnvText,
  resolveEnvProfile
};
