const { v4: uuid } = require('uuid');
const { ensureUniqueReferralCode } = require('./db');

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function findReferrer(db, code) {
  const clean = normalizeCode(code);
  if (!clean) return null;
  return db.users.find(u => normalizeCode(u.referralCode) === clean && u.role !== 'admin' && !u.isBlocked) || null;
}

function createReferralUserFields(db, seed, referralCodeInput) {
  const referrer = findReferrer(db, referralCodeInput);
  return {
    referralCode: ensureUniqueReferralCode(db, seed),
    referredBy: referrer ? referrer.id : null,
    referredByCode: referrer ? referrer.referralCode : null,
    referralEarnings: 0,
    referralCreatedAt: new Date().toISOString()
  };
}

function applySignupReferralRewards(db, newUser, referralCodeInput) {
  const settings = db.settings.referral || {};
  if (!settings.enabled || !newUser.referredBy) return null;

  const referrer = db.users.find(u => u.id === newUser.referredBy && u.role !== 'admin' && !u.isBlocked);
  if (!referrer) return null;

  const now = new Date().toISOString();
  const friendBonus = Number(settings.signupBonusForFriend || 0);
  const referrerBonus = Number(settings.signupBonusForReferrer || 0);
  const referralRecord = {
    id: uuid(),
    referrerId: referrer.id,
    referredUserId: newUser.id,
    code: normalizeCode(referralCodeInput || referrer.referralCode),
    status: 'registered',
    signupBonusForFriend: friendBonus,
    signupBonusForReferrer: referrerBonus,
    firstDepositBonus: 0,
    firstDepositRewarded: false,
    createdAt: now,
    updatedAt: now
  };

  if (friendBonus > 0) {
    newUser.balance = Number((Number(newUser.balance || 0) + friendBonus).toFixed(2));
    db.transactions.unshift({ id: uuid(), userId: newUser.id, type: 'referral_friend_signup_bonus', amount: friendBonus, game: null, meta: { referrerId: referrer.id }, createdAt: now });
  }

  if (referrerBonus > 0) {
    referrer.balance = Number((Number(referrer.balance || 0) + referrerBonus).toFixed(2));
    referrer.referralEarnings = Number((Number(referrer.referralEarnings || 0) + referrerBonus).toFixed(2));
    db.transactions.unshift({ id: uuid(), userId: referrer.id, type: 'referral_signup_bonus', amount: referrerBonus, game: null, meta: { referredUserId: newUser.id }, createdAt: now });
  }

  db.referrals.unshift(referralRecord);
  return referralRecord;
}

function applyFirstDepositReferralReward(db, userId, depositAmount) {
  const settings = db.settings.referral || {};
  if (!settings.enabled || !settings.rewardOnFirstDeposit) return null;

  const user = db.users.find(u => u.id === userId);
  if (!user || !user.referredBy) return null;

  const amount = Number(depositAmount || 0);
  if (amount < Number(settings.minFirstDepositForReward || 0)) return null;

  const referral = db.referrals.find(r => r.referredUserId === userId && r.referrerId === user.referredBy);
  if (!referral || referral.firstDepositRewarded) return null;

  const referrer = db.users.find(u => u.id === referral.referrerId && u.role !== 'admin' && !u.isBlocked);
  if (!referrer) return null;

  const calculated = amount * (Number(settings.firstDepositPercent || 0) / 100);
  const bonus = Number(Math.min(calculated, Number(settings.maxFirstDepositBonus || calculated)).toFixed(2));
  if (bonus <= 0) return null;

  const now = new Date().toISOString();
  referrer.balance = Number((Number(referrer.balance || 0) + bonus).toFixed(2));
  referrer.referralEarnings = Number((Number(referrer.referralEarnings || 0) + bonus).toFixed(2));
  referral.firstDepositBonus = bonus;
  referral.firstDepositRewarded = true;
  referral.status = 'first_deposit_rewarded';
  referral.updatedAt = now;

  db.transactions.unshift({ id: uuid(), userId: referrer.id, type: 'referral_first_deposit_bonus', amount: bonus, game: null, meta: { referredUserId: userId, depositAmount: amount }, createdAt: now });
  return { referrerId: referrer.id, bonus };
}

function getReferralStats(db, userId) {
  const directUsers = db.users.filter(u => u.referredBy === userId && u.role !== 'admin');
  const records = db.referrals.filter(r => r.referrerId === userId);
  const earnings = db.transactions
    .filter(t => t.userId === userId && String(t.type || '').startsWith('referral_'))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const firstDepositRewards = records.filter(r => r.firstDepositRewarded).length;
  return {
    totalReferrals: directUsers.length,
    registered: records.length,
    firstDepositRewards,
    earnings: Number(earnings.toFixed(2)),
    directUsers,
    records
  };
}

module.exports = {
  normalizeCode,
  findReferrer,
  createReferralUserFields,
  applySignupReferralRewards,
  applyFirstDepositReferralReward,
  getReferralStats
};
