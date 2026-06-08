const crypto = require('crypto');
const { v4: uuid } = require('uuid');

function hmacNumber(serverSeed, clientSeed, nonce) {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex');
  const slice = hash.slice(0, 13);
  const num = parseInt(slice, 16);
  return num / 0x1fffffffffffff;
}

function makeFairSeed(userId = 'system') {
  return {
    id: uuid(),
    serverSeed: crypto.randomBytes(32).toString('hex'),
    clientSeed: `${userId}-${Date.now()}`,
    nonce: Date.now()
  };
}

function makeChickenRound(settings, userId) {
  const seed = makeFairSeed(userId);
  const r = hmacNumber(seed.serverSeed, seed.clientSeed, seed.nonce);
  const multipliers = settings.multipliers || [];
  const safeCount = Math.max(1, Math.min(multipliers.length, Math.floor(r * multipliers.length) + 1));
  const adjustedSafeCount = Math.max(1, Math.floor(safeCount * (1 - Number(settings.houseEdge || 0))));
  return {
    ...seed,
    safeSteps: adjustedSafeCount,
    crashStep: Math.min(multipliers.length, adjustedSafeCount + 1),
    multipliers
  };
}

function makeAviatorCrash(settings) {
  const seed = makeFairSeed('aviator');
  const r = Math.max(0.000001, hmacNumber(seed.serverSeed, seed.clientSeed, seed.nonce));
  const min = Number(settings.minCrash || 1.02);
  const max = Number(settings.maxCrash || 15);
  const edge = Number(settings.houseEdge || 0.06);
  const raw = Math.max(min, (1 / (1 - r)) * (1 - edge));
  const crash = Math.min(max, Number(raw.toFixed(2)));
  return {
    ...seed,
    crashMultiplier: Math.max(min, crash)
  };
}

function validateBet(amount, min, max, balance) {
  const bet = Number(amount);
  if (!Number.isFinite(bet) || bet <= 0) return 'Invalid bet amount.';
  if (bet < min) return `Minimum bet is ${min}.`;
  if (bet > max) return `Maximum bet is ${max}.`;
  if (bet > balance) return 'Insufficient demo balance.';
  return null;
}

module.exports = {
  hmacNumber,
  makeChickenRound,
  makeAviatorCrash,
  validateBet
};
