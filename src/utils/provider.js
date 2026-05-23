const { ethers } = require('ethers');
const { config } = require('./config');
const { sleep } = require('./helpers');
const { logWarn } = require('./logger');

function getRpcUrls() {
  const urls = [config.bscRpcUrl, ...config.bscRpcFallbacks];
  return [...new Set(urls.filter(Boolean))];
}

function createProvider(rpcUrl = config.bscRpcUrl) {
  return new ethers.JsonRpcProvider(rpcUrl);
}

async function withProviderRetry(operation, options = {}) {
  const urls = options.urls || getRpcUrls();
  const retryLimit = options.retryLimit || 3;
  const retryDelayMs = options.retryDelayMs || 2000;
  let lastError = null;

  for (const rpcUrl of urls) {
    const provider = createProvider(rpcUrl);

    for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
      try {
        return await operation(provider, rpcUrl);
      } catch (error) {
        lastError = error;
        logWarn('RPC operation failed', {
          rpcUrl,
          attempt,
          error: error.message,
        });

        if (attempt < retryLimit) {
          await sleep(retryDelayMs * attempt);
        }
      }
    }
  }

  throw lastError;
}

async function getWorkingProvider() {
  return withProviderRetry(async (provider) => provider);
}

module.exports = {
  getRpcUrls,
  createProvider,
  withProviderRetry,
  getWorkingProvider,
};
