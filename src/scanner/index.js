const { validateConfig, logStartupValidation } = require('../utils/config');
const { initDataDirs } = require('../utils/helpers');
const { logInfo, logWarn } = require('../utils/logger');
const { readWallets, upsertWallet, ensureWalletsCsv } = require('../utils/csvStorage');
const { cacheWallet } = require('../utils/cache');
const { filterWallets } = require('../utils/walletFilter');
const { getWorkingProvider } = require('../utils/provider');
const { scanRecentBscActivity } = require('./bscScanner');
const { scanPancakeSwapActivity } = require('./pancakeScanner');
const { detectActiveTraders } = require('./memeTraderDetector');

async function runScanner(options = {}) {
  initDataDirs();
  ensureWalletsCsv();
  validateConfig(false);
  logStartupValidation(false);

  const existingRows = await readWallets();

  logInfo('Starting wallet scanner', {
    existingCsvRows: existingRows.length,
    blockRange: options.blockRange,
  });

  const provider = await getWorkingProvider();
  const bscResult = await scanRecentBscActivity(provider, options);
  const pancakeResult = await scanPancakeSwapActivity(provider, options);

  const combined = new Set([...bscResult.wallets, ...pancakeResult.wallets]);
  const candidateList = [...combined];

  logInfo('Raw wallet candidates collected', { rawCandidates: candidateList.length });

  let traders = [];
  if (candidateList.length > 0) {
    traders = await detectActiveTraders(provider, candidateList, {
      ...options,
      walletActivity: bscResult.walletActivity,
      minScore: 1,
    });
  } else {
    logInfo('No candidates found — skipping trader qualification');
  }

  let walletsToStore = traders.map((entry) => entry.wallet);
  let usedFallback = false;

  if (walletsToStore.length === 0 && candidateList.length > 0) {
    usedFallback = true;
    walletsToStore = candidateList;
    logWarn('No qualified traders — falling back to raw candidates after basic filtering', {
      rawCandidates: candidateList.length,
    });
  }

  const filtered = await filterWallets(provider, walletsToStore, {
    existingRows,
    skipProcessed: true,
  });

  let stored = 0;
  for (const wallet of filtered.accepted) {
    await upsertWallet(wallet, 'pending');
    cacheWallet(wallet, { source: usedFallback ? 'scanner-fallback' : 'scanner' });
    stored += 1;
  }

  const report = {
    scannedBlocks: {
      from: bscResult.fromBlock,
      to: bscResult.toBlock,
    },
    rawCandidates: candidateList.length,
    qualifiedTraders: traders.length,
    fallbackUsed: usedFallback,
    accepted: filtered.accepted.length,
    rejected: filtered.rejected.length,
    stored,
    pancakePair: pancakeResult.pair,
  };

  logInfo('Scanner finished', {
    rawCandidates: report.rawCandidates,
    qualifiedTraders: report.qualifiedTraders,
    accepted: report.accepted,
    rejected: report.rejected,
    stored: report.stored,
    fallbackUsed: report.fallbackUsed,
    pancakePair: report.pancakePair,
  });

  return report;
}

module.exports = {
  runScanner,
  getWorkingProvider,
};
