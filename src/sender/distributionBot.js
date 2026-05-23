const { ethers } = require('ethers');
const { config, validateConfig, logStartupValidation } = require('../utils/config');
const {
  pickRandom,
  randomDelay,
  sleep,
  initDataDirs,
} = require('../utils/helpers');
const { logInfo, logWarn, logError, logTransaction, logDebug } = require('../utils/logger');
const { getPendingWallets, updateWalletStatus, ensureWalletsCsv, getWalletStats } = require('../utils/csvStorage');
const { markProcessed, isProcessed } = require('../utils/cache');
const { canSendMore, recordSend, getRateLimitReport } = require('../utils/rateLimiter');
const { verifySendReadiness } = require('../utils/gasChecker');
const { getWorkingProvider } = require('../utils/provider');

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getRandomAmount(decimals) {
  const amount = pickRandom(config.distributionAmounts);
  return ethers.parseUnits(String(amount), decimals);
}

function getRandomizedExecutionWindowDelayMs() {
  const hour = new Date().getHours();
  if (hour >= 1 && hour <= 6) {
    return randomDelay(10_000, 20_000);
  }
  return randomDelay(config.minDelayMs, config.maxDelayMs);
}

function createSigner(provider) {
  try {
    return new ethers.Wallet(config.privateKey, provider);
  } catch (error) {
    throw new Error(`Failed to create wallet signer: ${error.message}. Check PRIVATE_KEY format (64 hex chars, no spaces).`);
  }
}

async function sendToWallet({
  provider,
  wallet,
  tokenContract,
  recipient,
  amount,
  decimals,
  dryRun,
}) {
  const amountLabel = ethers.formatUnits(amount, decimals);

  if (dryRun) {
    logTransaction({
      wallet: recipient,
      amount: amountLabel,
      txHash: 'DRY_RUN',
      success: true,
      dryRun: true,
    });
    return { success: true, txHash: 'DRY_RUN', amount: amountLabel };
  }

  const readiness = await verifySendReadiness(provider, wallet, tokenContract, recipient, amount);
  if (!readiness.ok) {
    logWarn('Send readiness check failed', {
      wallet: recipient,
      reason: readiness.reason,
    });
    logTransaction({
      wallet: recipient,
      amount: amountLabel,
      success: false,
      error: readiness.reason,
    });
    return { success: false, error: readiness.reason, amount: amountLabel };
  }

  logDebug('Gas estimate ready', {
    wallet: recipient,
    gasEstimate: readiness.gasEstimate?.toString(),
    gasPrice: readiness.gasPrice?.toString(),
  });

  let lastError = null;

  for (let attempt = 1; attempt <= config.retryLimit; attempt += 1) {
    try {
      const tx = await tokenContract.transfer(recipient, amount, {
        gasLimit: (readiness.gasEstimate * 120n) / 100n,
      });

      logInfo('Transaction submitted', {
        wallet: recipient,
        amount: amountLabel,
        txHash: tx.hash,
        attempt,
      });

      const receipt = await tx.wait();
      const success = receipt.status === 1;

      logTransaction({
        wallet: recipient,
        amount: amountLabel,
        txHash: tx.hash,
        success,
        error: success ? null : 'Transaction reverted',
      });

      return { success, txHash: tx.hash, amount: amountLabel };
    } catch (error) {
      lastError = error.message;
      logWarn('Transfer attempt failed', {
        wallet: recipient,
        attempt,
        retryLimit: config.retryLimit,
        error: lastError,
      });

      if (attempt < config.retryLimit) {
        const retryDelay = randomDelay(3000, 8000);
        logInfo('Retrying after delay', { wallet: recipient, attempt: attempt + 1, delayMs: retryDelay });
        await sleep(retryDelay);
      }
    }
  }

  logError('Transfer failed after all retries', {
    wallet: recipient,
    attempts: config.retryLimit,
    error: lastError,
  });

  logTransaction({
    wallet: recipient,
    amount: amountLabel,
    success: false,
    error: lastError,
  });

  return { success: false, error: lastError, amount: amountLabel };
}

async function validateWalletQueue() {
  ensureWalletsCsv();
  const stats = await getWalletStats();
  const pending = await getPendingWallets();
  const eligible = pending.filter((row) => !isProcessed(row.wallet_address));

  logInfo('Wallet queue validated', {
    csvTotal: stats.total,
    csvPending: stats.pending,
    csvSent: stats.sent,
    csvFailed: stats.failed,
    eligibleForSend: eligible.length,
  });

  return { stats, pending, eligible };
}

async function runDistributionBot(options = {}) {
  initDataDirs();
  ensureWalletsCsv();
  validateConfig(true);
  logStartupValidation(true);

  const dryRun = options.dryRun ?? config.dryRun;
  const provider = await getWorkingProvider();
  const signer = createSigner(provider);
  const tokenContract = new ethers.Contract(config.tokenAddress, config.erc20Abi, signer);
  const decimals = await tokenContract.decimals();
  const symbol = await tokenContract.symbol();

  logInfo('Starting MGPT distribution bot', {
    dryRun,
    token: config.tokenAddress,
    symbol,
    sender: signer.address,
  });

  const limitCheck = canSendMore();
  if (!limitCheck.allowed) {
    logWarn('Rate limit reached — stopping send cycle', limitCheck);
    return { sent: 0, failed: 0, skipped: 0, reason: limitCheck.reason };
  }

  const { eligible } = await validateWalletQueue();
  const shuffled = shuffle(eligible);

  if (shuffled.length === 0) {
    logWarn('No pending wallets available for distribution', {
      skipReason: 'Queue empty or all pending wallets already processed',
      hint: 'Run `npm run scan` to populate data/wallets.csv',
    });
    return { sent: 0, failed: 0, skipped: 0, reason: 'no_pending_wallets' };
  }

  const batchSize = Math.min(
    shuffled.length,
    limitCheck.remainingHour,
    limitCheck.remainingDay
  );

  logInfo('Processing batch', {
    batchSize,
    queueSize: shuffled.length,
    remainingHour: limitCheck.remainingHour,
    remainingDay: limitCheck.remainingDay,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < batchSize; i += 1) {
    const currentLimit = canSendMore();
    if (!currentLimit.allowed) {
      logWarn('Rate limit reached during batch', currentLimit);
      break;
    }

    const target = shuffled[i];
    const recipient = ethers.getAddress(target.wallet_address);
    const amount = getRandomAmount(decimals);

    logInfo('Send attempt', {
      wallet: recipient,
      amount: ethers.formatUnits(amount, decimals),
      dryRun,
      progress: `${i + 1}/${batchSize}`,
    });

    const result = await sendToWallet({
      provider,
      wallet: signer,
      tokenContract,
      recipient,
      amount,
      decimals,
      dryRun,
    });

    if (result.success) {
      sent += 1;
      if (!dryRun) {
        recordSend();
      }
      await updateWalletStatus(recipient, 'sent');
      markProcessed(recipient, {
        amount: result.amount,
        txHash: result.txHash,
        dryRun,
      });
    } else {
      failed += 1;
      await updateWalletStatus(recipient, 'failed');
      markProcessed(recipient, {
        amount: result.amount,
        error: result.error,
        dryRun,
      });
    }

    if (i < batchSize - 1) {
      const delay = getRandomizedExecutionWindowDelayMs();
      logInfo('Waiting before next transfer', { delayMs: delay });
      await sleep(delay);
    }
  }

  const summary = { sent, failed, skipped, dryRun, batchSize };
  logInfo('Distribution cycle complete', summary);
  return summary;
}

module.exports = {
  runDistributionBot,
  getRateLimitReport,
  validateWalletQueue,
};
