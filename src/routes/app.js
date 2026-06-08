const express = require('express');
const { v4: uuid } = require('uuid');
const { readDb, mutate } = require('../services/db');
const { requireAuth } = require('../services/middleware');
const { makeChickenRound, validateBet } = require('../services/gameEngine');
const { getReferralStats } = require('../services/referral');
const {
  createPaymentRecord,
  validateDeposit,
  validateWithdraw,
  creditDeposit,
  createNowPaymentsInvoice
} = require('../services/payments');

const router = express.Router();

router.use(requireAuth);

function requestBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

router.get('/', (req, res) => {
  const db = readDb();
  const userBets = db.bets.filter(b => b.userId === req.currentUser.id).slice(0, 10);
  const referralStats = getReferralStats(db, req.currentUser.id);
  const pendingPayments = db.payments.filter(p => p.userId === req.currentUser.id && ['pending', 'processing'].includes(p.status)).slice(0, 3);
  res.render('app/dashboard', { title: 'App Dashboard', userBets, referralStats, pendingPayments });
});

router.get('/games', (req, res) => {
  res.render('app/games', { title: 'Games' });
});

router.get('/wallet', (req, res) => {
  const db = readDb();
  const tx = db.transactions.filter(t => t.userId === req.currentUser.id).slice(0, 50);
  const payments = db.payments.filter(p => p.userId === req.currentUser.id).slice(0, 50);
  res.render('app/wallet', { title: 'Wallet', tx, payments, paymentSettings: db.settings.payments });
});

router.post('/wallet/topup-demo', (req, res) => {
  mutate(db => {
    const user = db.users.find(u => u.id === req.currentUser.id);
    user.balance = Number((user.balance + 1000).toFixed(2));
    db.transactions.unshift({ id: uuid(), userId: user.id, type: 'demo_topup', amount: 1000, game: null, createdAt: new Date().toISOString() });
  });
  req.flash('success', 'Demo balance added.');
  res.redirect('/app/wallet');
});

router.post('/wallet/deposit', async (req, res) => {
  try {
    const db = readDb();
    const user = db.users.find(u => u.id === req.currentUser.id);
    const amount = Number(req.body.amount || 0);
    const provider = String(req.body.provider || '').trim();
    const error = validateDeposit(db, amount);
    if (error) {
      req.flash('error', error);
      return res.redirect('/app/wallet');
    }

    const manualMethods = db.settings.payments.manualMethods || {};
    const manualKey = provider.replace('manual_', '');
    const isManual = provider.startsWith('manual_') && manualMethods[manualKey] && manualMethods[manualKey].enabled;
    const isSandbox = provider === 'sandbox_gateway';
    const isNowPayments = provider === 'nowpayments';
    if (!isManual && !isSandbox && !isNowPayments) {
      req.flash('error', 'Select a valid payment method.');
      return res.redirect('/app/wallet');
    }

    const payment = createPaymentRecord({
      userId: user.id,
      type: 'deposit',
      provider,
      amount,
      currency: db.settings.payments.currency,
      reference: req.body.reference,
      note: req.body.note,
      status: isManual ? 'pending' : 'processing',
      meta: { clientIp: req.ip }
    });

    if (isNowPayments || isSandbox) {
      const gateway = isSandbox
        ? { invoiceUrl: `/app/payment/${payment.id}/checkout`, invoiceId: `SANDBOX-${payment.id}`, gatewayPaymentId: `SANDBOX-${payment.id}`, sandbox: true }
        : await createNowPaymentsInvoice({ db, payment, user, baseUrl: requestBaseUrl(req) });
      payment.gatewayUrl = gateway.invoiceUrl || `/app/payment/${payment.id}/checkout`;
      payment.gatewayInvoiceId = gateway.invoiceId || '';
      payment.gatewayPaymentId = gateway.gatewayPaymentId || '';
      payment.meta = { ...(payment.meta || {}), gateway: gateway.raw || {}, sandbox: !!gateway.sandbox };
    }

    let autoApproved = false;
    mutate(nextDb => {
      nextDb.payments.unshift(payment);
      if (isSandbox && nextDb.settings.payments.sandboxAutoApprove) {
        const savedPayment = nextDb.payments.find(p => p.id === payment.id);
        autoApproved = creditDeposit(nextDb, savedPayment, 'sandbox_gateway');
      }
    });

    if (autoApproved) {
      req.flash('success', 'Sandbox payment auto-approved and balance added.');
      return res.redirect('/app/wallet');
    }

    if (payment.gatewayUrl) return res.redirect(payment.gatewayUrl);

    req.flash('success', 'Deposit request submitted. Admin will verify and approve it.');
    res.redirect('/app/wallet');
  } catch (err) {
    req.flash('error', err.message || 'Deposit request failed.');
    res.redirect('/app/wallet');
  }
});

router.get('/payment/:id/checkout', (req, res) => {
  const db = readDb();
  const payment = db.payments.find(p => p.id === req.params.id && p.userId === req.currentUser.id);
  if (!payment) {
    req.flash('error', 'Payment not found.');
    return res.redirect('/app/wallet');
  }
  res.render('app/payment-checkout', { title: 'Payment Checkout', payment, paymentSettings: db.settings.payments });
});

router.post('/payment/:id/checkout', (req, res) => {
  let paid = false;
  mutate(db => {
    const payment = db.payments.find(p => p.id === req.params.id && p.userId === req.currentUser.id);
    if (!payment || payment.status === 'approved') return;
    if (!payment.meta || !payment.meta.sandbox) return;
    paid = creditDeposit(db, payment, 'sandbox_gateway');
  });
  req.flash(paid ? 'success' : 'error', paid ? 'Sandbox payment approved and balance added.' : 'Payment could not be approved.');
  res.redirect('/app/wallet');
});

router.post('/wallet/withdraw', (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.currentUser.id);
  const amount = Number(req.body.amount || 0);
  const error = validateWithdraw(db, user, amount);
  if (error) {
    req.flash('error', error);
    return res.redirect('/app/wallet');
  }

  mutate(nextDb => {
    const freshUser = nextDb.users.find(u => u.id === user.id);
    freshUser.balance = Number((Number(freshUser.balance || 0) - amount).toFixed(2));
    const payment = createPaymentRecord({
      userId: freshUser.id,
      type: 'withdrawal',
      provider: String(req.body.provider || 'manual_withdrawal'),
      amount,
      currency: nextDb.settings.payments.currency,
      reference: req.body.accountNumber,
      note: req.body.note,
      status: 'pending',
      meta: {
        balanceHeld: true,
        accountTitle: req.body.accountTitle || '',
        accountNumber: req.body.accountNumber || '',
        method: req.body.provider || ''
      }
    });
    nextDb.payments.unshift(payment);
    nextDb.transactions.unshift({ id: uuid(), userId: freshUser.id, type: 'withdrawal_hold', amount: -amount, game: null, meta: { paymentId: payment.id }, createdAt: new Date().toISOString() });
  });

  req.flash('success', 'Withdrawal request submitted. Amount is held until admin approval.');
  res.redirect('/app/wallet');
});

router.get('/referrals', (req, res) => {
  const db = readDb();
  const stats = getReferralStats(db, req.currentUser.id);
  const baseUrl = requestBaseUrl(req);
  res.render('app/referrals', { title: 'Referral Program', stats, baseUrl, referralSettings: db.settings.referral });
});

router.get('/history', (req, res) => {
  const db = readDb();
  const bets = db.bets.filter(b => b.userId === req.currentUser.id).slice(0, 100);
  res.render('app/history', { title: 'History', bets });
});

router.get('/profile', (req, res) => {
  const db = readDb();
  const referralStats = getReferralStats(db, req.currentUser.id);
  res.render('app/profile', { title: 'Profile', referralStats });
});

router.get('/vip', (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.currentUser.id);
  const userBets = db.bets.filter(b => b.userId === user.id);
  const totalStake = userBets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const score = Number(user.totalDeposit || 0) + totalStake + Number(user.referralEarnings || 0);
  const levels = [
    { level: 1, name: 'Starter', requiredScore: 0 },
    { level: 2, name: 'Rising Player', requiredScore: 10000 },
    { level: 3, name: 'Pro Player', requiredScore: 50000 },
    { level: 4, name: 'Elite', requiredScore: 150000 },
    { level: 5, name: 'Legend', requiredScore: 500000 }
  ];
  let current = levels[0];
  for (const level of levels) if (score >= level.requiredScore) current = level;
  const next = levels.find(l => l.requiredScore > score) || levels[levels.length - 1];
  const base = current.requiredScore;
  const range = Math.max(1, next.requiredScore - base);
  const progress = current.level === next.level ? 100 : Math.min(99, Math.max(0, Math.round(((score - base) / range) * 100)));
  res.render('app/vip', { title: 'VIP Club', vip: { level: current.level, nextLevel: next.level, progress, score, levels } });
});

router.get('/game/chicken', (req, res) => {
  const db = readDb();
  res.render('app/chicken', { title: 'Chicken Road', chicken: db.settings.chicken });
});

router.post('/game/chicken/start', (req, res) => {
  const db = readDb();
  const settings = db.settings.chicken;
  const user = db.users.find(u => u.id === req.currentUser.id);
  const amount = Number(req.body.amount);
  const error = validateBet(amount, settings.minBet, settings.maxBet, user.balance);
  if (error) return res.status(400).json({ ok: false, message: error });

  const round = makeChickenRound(settings, user.id);
  req.session.chickenRound = {
    roundId: round.id,
    amount,
    safeSteps: round.safeSteps,
    crashStep: round.crashStep,
    multipliers: round.multipliers,
    currentStep: 0,
    status: 'active',
    fair: { serverSeedHash: round.serverSeed.slice(0, 12), clientSeed: round.clientSeed, nonce: round.nonce }
  };

  mutate(nextDb => {
    const freshUser = nextDb.users.find(u => u.id === user.id);
    freshUser.balance = Number((freshUser.balance - amount).toFixed(2));
    nextDb.transactions.unshift({ id: uuid(), userId: user.id, type: 'bet', amount: -amount, game: 'chicken', createdAt: new Date().toISOString() });
  });

  res.json({ ok: true, roundId: round.id, balance: Number((user.balance - amount).toFixed(2)), multipliers: round.multipliers });
});

router.post('/game/chicken/step', (req, res) => {
  const round = req.session.chickenRound;
  if (!round || round.status !== 'active') return res.status(400).json({ ok: false, message: 'Start a new round first.' });
  round.currentStep += 1;
  if (round.currentStep >= round.crashStep) {
    round.status = 'lost';
    mutate(db => {
      db.bets.unshift({
        id: uuid(), userId: req.currentUser.id, game: 'chicken', roundId: round.roundId,
        amount: round.amount, multiplier: 0, payout: 0, status: 'lost', createdAt: new Date().toISOString(), fair: round.fair
      });
    });
    return res.json({ ok: true, status: 'lost', step: round.currentStep, crashStep: round.crashStep, message: 'Chicken got caught!' });
  }
  const multiplier = round.multipliers[round.currentStep - 1] || 1;
  res.json({ ok: true, status: 'active', step: round.currentStep, multiplier });
});

router.post('/game/chicken/cashout', (req, res) => {
  const round = req.session.chickenRound;
  if (!round || round.status !== 'active' || round.currentStep < 1) return res.status(400).json({ ok: false, message: 'Move at least one step before cashout.' });
  const multiplier = round.multipliers[round.currentStep - 1] || 1;
  const payout = Number((round.amount * multiplier).toFixed(2));
  round.status = 'cashed';
  mutate(db => {
    const user = db.users.find(u => u.id === req.currentUser.id);
    user.balance = Number((user.balance + payout).toFixed(2));
    db.bets.unshift({
      id: uuid(), userId: req.currentUser.id, game: 'chicken', roundId: round.roundId,
      amount: round.amount, multiplier, payout, status: 'won', createdAt: new Date().toISOString(), fair: round.fair
    });
    db.transactions.unshift({ id: uuid(), userId: req.currentUser.id, type: 'payout', amount: payout, game: 'chicken', createdAt: new Date().toISOString() });
  });
  res.json({ ok: true, status: 'won', multiplier, payout });
});

router.get('/game/aviator', (req, res) => {
  const db = readDb();
  res.render('app/aviator', { title: 'Aviator', aviator: db.settings.aviator });
});

module.exports = router;
