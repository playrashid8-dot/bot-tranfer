const fs = require('fs');
const path = require('path');
const { config } = require('./config');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function appendLog(filePath, line) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${line}\n`, 'utf8');
}

function formatTimestamp(date = new Date()) {
  return date.toISOString();
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minMs, maxMs) {
  return randomInt(minMs, maxMs);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function isValidAddress(address) {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
}

function normalizeAddress(address) {
  return address.toLowerCase();
}

function initDataDirs() {
  ensureDir(config.paths.data);
  ensureDir(config.paths.logs);
}

module.exports = {
  ensureDir,
  readJson,
  writeJson,
  appendLog,
  formatTimestamp,
  randomInt,
  randomDelay,
  sleep,
  pickRandom,
  isValidAddress,
  normalizeAddress,
  initDataDirs,
};
