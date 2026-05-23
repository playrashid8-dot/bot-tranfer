const { validateConfig } = require('../utils/config');
const { initDataDirs } = require('../utils/helpers');
const { logInfo } = require('../utils/logger');
const { readWallets, upsertWallet } = require('../utils/csvStorage');
const { cacheWallet } = require('../utils/cache');
const { filterWallets } = require('../utils/walletFilter');
const { getWorkingProvider } = require('../utils/provider');
const { scanRecentBscActivity } = require('./bscScanner');
const { scanPancakeSwapActivity } = require('./pancakeScanner');
const { detectActiveTraders } = require('./memeTraderDetector');

async function runScanner(options = {}) {
  initDataDirs();
  validateConfig(false);
  const existingRows = await readWallets();

  logInfo('Starting wallet scanner');

  const provider = await getWorkingProvider();
  const bscResult = await scanRecentBscActivity(provider, options);
  const pancakeResult = await scanPancakeSwapActivity(provider, options);

  const combined = new Set([...bscResult.wallets, ...pancakeResult.wallets]);
  const candidateList = [...combined];

  logInfo('Raw wallet candidates collected', { count: candidateList.length });

  let traders = [];
  if (candidateList.length > 0) {
    traders = await detectActiveTraders(provider, candidateList, {
      ...options,
      walletActivity: bscResult.walletActivity,
    });
  } else {
    logInfo('No candidates found — skipping trader qualification');
  }
  const traderWallets = traders.map((entry) => entry.wallet);

  const filtered = await filterWallets(provider, traderWallets, {
    existingRows,
    skipProcessed: true,
  });

  let stored = 0;
  for (const wallet of filtered.accepted) {
    await upsertWallet(wallet, 'pending');
    cacheWallet(wallet, { source: 'scanner' });
    stored += 1;
  }

  const report = {
    scannedBlocks: {
      from: bscResult.fromBlock,
      to: bscResult.toBlock,
    },
    rawCandidates: candidateList.length,
    qualifiedTraders: traders.length,
    accepted: filtered.accepted.length,
    rejected: filtered.rejected.length,
    stored,
    pancakePair: pancakeResult.pair,
  };

  logInfo('Scanner finished', report);
  return report;
}

module.exports = {
  runScanner,
  getWorkingProvider,
};
