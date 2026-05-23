const { sleep } = require('./helpers');
const { logWarn } = require('./logger');

async function getLogsInChunks(provider, filter, options = {}) {
  const chunkSize = options.chunkSize || 500;
  const retryLimit = options.retryLimit || 5;
  const retryDelayMs = options.retryDelayMs || 2500;
  const pauseMs = options.pauseMs || 500;

  const fromBlock = Number(filter.fromBlock);
  const toBlock = Number(filter.toBlock);
  const logs = [];

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);

    let attempt = 0;
    while (attempt < retryLimit) {
      try {
        const chunkLogs = await provider.getLogs({
          ...filter,
          fromBlock: start,
          toBlock: end,
        });
        logs.push(...chunkLogs);
        break;
      } catch (error) {
        attempt += 1;
        if (attempt >= retryLimit) {
          throw error;
        }

        logWarn('getLogs chunk failed, retrying', {
          fromBlock: start,
          toBlock: end,
          attempt,
          error: error.message,
        });
        await sleep(retryDelayMs * attempt);
      }
    }

    if (pauseMs > 0 && end < toBlock) {
      await sleep(pauseMs);
    }
  }

  return logs;
}

module.exports = {
  getLogsInChunks,
};
