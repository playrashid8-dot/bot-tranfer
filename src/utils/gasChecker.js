const { ethers } = require('ethers');
const { config } = require('./config');
const { logWarn } = require('./logger');

async function checkGasAndBalance(provider, walletAddress, tokenContract) {
  const bnbBalance = await provider.getBalance(walletAddress);
  const bnbFormatted = Number(ethers.formatEther(bnbBalance));

  if (bnbFormatted < config.minBnbBalance) {
    return {
      ok: false,
      reason: `Insufficient BNB for gas (${bnbFormatted.toFixed(6)} BNB, need ${config.minBnbBalance})`,
      bnbBalance: bnbFormatted,
    };
  }

  const tokenBalance = await tokenContract.balanceOf(walletAddress);
  if (tokenBalance <= 0n) {
    return {
      ok: false,
      reason: 'Sender wallet has zero MGPT balance',
      bnbBalance: bnbFormatted,
      tokenBalance: '0',
    };
  }

  return {
    ok: true,
    bnbBalance: bnbFormatted,
    tokenBalance: tokenBalance.toString(),
  };
}

async function estimateTransferGas(provider, tokenContract, toAddress, amount, fromAddress) {
  try {
    const gasEstimate = await tokenContract.transfer.estimateGas(toAddress, amount, {
      from: fromAddress,
    });

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits('3', 'gwei');

    return {
      ok: true,
      gasEstimate,
      gasPrice,
      estimatedCostWei: gasEstimate * gasPrice,
    };
  } catch (error) {
    logWarn('Gas estimation failed', { toAddress, error: error.message });
    return {
      ok: false,
      reason: error.message,
    };
  }
}

async function verifySendReadiness(provider, wallet, tokenContract, toAddress, amount) {
  const balanceCheck = await checkGasAndBalance(provider, wallet.address, tokenContract);
  if (!balanceCheck.ok) {
    return balanceCheck;
  }

  const senderTokenBalance = await tokenContract.balanceOf(wallet.address);
  if (senderTokenBalance < amount) {
    return {
      ok: false,
      reason: `Insufficient MGPT balance for transfer (have ${senderTokenBalance}, need ${amount})`,
    };
  }

  const gasEstimate = await estimateTransferGas(provider, tokenContract, toAddress, amount, wallet.address);
  if (!gasEstimate.ok) {
    return gasEstimate;
  }

  const bnbBalance = await provider.getBalance(wallet.address);
  if (bnbBalance < gasEstimate.estimatedCostWei) {
    return {
      ok: false,
      reason: 'Insufficient BNB to cover estimated gas',
      estimatedCostBnb: ethers.formatEther(gasEstimate.estimatedCostWei),
    };
  }

  return {
    ok: true,
    gasEstimate: gasEstimate.gasEstimate,
    gasPrice: gasEstimate.gasPrice,
  };
}

module.exports = {
  checkGasAndBalance,
  estimateTransferGas,
  verifySendReadiness,
};
