const { config } = require('./config');
const { readJson, writeJson, normalizeAddress } = require('./helpers');

function loadProcessed() {
  const data = readJson(config.paths.processed, { wallets: {} });
  if (!data.wallets) {
    data.wallets = {};
  }
  return data;
}

function saveProcessed(data) {
  writeJson(config.paths.processed, data);
}

function isProcessed(address) {
  const data = loadProcessed();
  return Boolean(data.wallets[normalizeAddress(address)]);
}

function markProcessed(address, meta = {}) {
  const data = loadProcessed();
  data.wallets[normalizeAddress(address)] = {
    processedAt: new Date().toISOString(),
    ...meta,
  };
  saveProcessed(data);
}

function getProcessedCount() {
  const data = loadProcessed();
  return Object.keys(data.wallets).length;
}

function loadWalletCache() {
  return readJson(config.paths.walletCache, { entries: {} });
}

function saveWalletCache(cache) {
  writeJson(config.paths.walletCache, cache);
}

function cacheWallet(address, meta = {}) {
  const cache = loadWalletCache();
  cache.entries[normalizeAddress(address)] = {
    lastSeen: new Date().toISOString(),
    ...meta,
  };
  saveWalletCache(cache);
}

function isCachedRecently(address, maxAgeMs = 24 * 60 * 60 * 1000) {
  const cache = loadWalletCache();
  const entry = cache.entries[normalizeAddress(address)];
  if (!entry) {
    return false;
  }

  const age = Date.now() - new Date(entry.lastSeen).getTime();
  return age <= maxAgeMs;
}

function loadBlacklist() {
  const data = readJson(config.paths.blacklist, { addresses: [] });
  return new Set((data.addresses || []).map(normalizeAddress));
}

module.exports = {
  loadProcessed,
  saveProcessed,
  isProcessed,
  markProcessed,
  getProcessedCount,
  loadWalletCache,
  saveWalletCache,
  cacheWallet,
  isCachedRecently,
  loadBlacklist,
};
