const { config } = require('./config');
const { appendLog, formatTimestamp } = require('./helpers');

function logTransaction({ wallet, amount, txHash, success, error, dryRun = false }) {
  const entry = {
    timestamp: formatTimestamp(),
    wallet,
    amount,
    txHash: txHash || 'N/A',
    status: success ? 'success' : 'failure',
    dryRun,
    error: error || null,
  };

  const line = JSON.stringify(entry);
  appendLog(config.paths.txLog, line);
  return entry;
}

function logInfo(message, meta = {}) {
  const line = JSON.stringify({
    timestamp: formatTimestamp(),
    level: 'info',
    message,
    ...meta,
  });
  appendLog(config.paths.txLog, line);
  console.log(`[INFO] ${message}`, Object.keys(meta).length ? meta : '');
}

function logError(message, meta = {}) {
  const line = JSON.stringify({
    timestamp: formatTimestamp(),
    level: 'error',
    message,
    ...meta,
  });
  appendLog(config.paths.txLog, line);
  console.error(`[ERROR] ${message}`, Object.keys(meta).length ? meta : '');
}

function logWarn(message, meta = {}) {
  const line = JSON.stringify({
    timestamp: formatTimestamp(),
    level: 'warn',
    message,
    ...meta,
  });
  appendLog(config.paths.txLog, line);
  console.warn(`[WARN] ${message}`, Object.keys(meta).length ? meta : '');
}

module.exports = {
  logTransaction,
  logInfo,
  logError,
  logWarn,
};
