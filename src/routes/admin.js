const path = require('path');
const express = require('express');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const { readDb, mutate } = require('../services/db');
const { requireAdmin } = require('../services/middleware');
const { creditDeposit, rejectPayment, approveWithdrawal } = require('../services/payments');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../public/uploads')),
  filename: (req, file, cb) => {
    const clean = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
    cb(null, `${Date.now()}-${clean}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 120 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.apk')) return cb(new Error('Only APK files are allowed.'));
    cb(null, true);
  }
});

router.use(requireAdmin);

router.get('/', (req, res) => {
  const db = readDb();
  const users = db.users.filter(u => u.role === 'user');
  const today = new Date().toISOString().slice(0, 10);
  const todayBets = db.bets.filter(b => b.createdAt.startsWith(today));
  const totalStake = db.bets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const totalPayout = db.bets.reduce((sum, b) => sum + Number(b.payout || 0), 0);
  const pendingPayments = db.payments.filter(p => ['pending', 'processing'].includes(p.status));
  const approvedDeposits = db.payments.filter(p => p.type === 'deposit' && p.status === 'approved').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    stats: {
      users: users.length,
      bets: db.bets.length,
      todayBets: todayBets.length,
      totalStake,
      totalPayout,
      margin: totalStake - totalPayout,
      pendingPayments: pendingPayments.length,
      approvedDeposits,
      referrals: db.referrals.length
    },
    latestBets: db.bets.slice(0, 10),
    latestPayments: db.payments.slice(0, 8)
  });
});

router.get('/settings', (req, res) => {
  const db = readDb();
  res.render('admin/settings', { title: 'Platform Settings', settings: db.settings });
});

router.post('/settings/general', (req, res) => {
  const body = req.body;
  mutate(db => {
    db.settings.appName = body.appName || db.settings.appName;
    db.settings.companyName = body.companyName || db.settings.companyName;
    db.settings.heroTitle = body.heroTitle || db.settings.heroTitle;
    db.settings.heroSubtitle = body.heroSubtitle || db.settings.heroSubtitle;
    db.settings.apkUrl = body.apkUrl || '';
    db.settings.supportWhatsapp = body.supportWhatsapp || '';
    db.settings.maintenanceMode = body.maintenanceMode === 'on';
  });
  req.flash('success', 'General settings updated.');
  res.redirect('/admin/settings');
});

router.post('/settings/apk', upload.single('apk'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'Please select an APK file.');
    return res.redirect('/admin/settings');
  }
  mutate(db => {
    db.settings.apkFile = req.file.filename;
  });
  req.flash('success', 'APK uploaded successfully.');
  res.redirect('/admin/settings');
});

router.post('/settings/games', (req, res) => {
  const body = req.body;
  mutate(db => {
    db.settings.chicken.minBet = Number(body.chickenMinBet || db.settings.chicken.minBet);
    db.settings.chicken.maxBet = Number(body.chickenMaxBet || db.settings.chicken.maxBet);
    db.settings.chicken.houseEdge = Number(body.chickenHouseEdge || db.settings.chicken.houseEdge);
    db.settings.chicken.multipliers = String(body.chickenMultipliers || '')
      .split(',')
      .map(v => Number(v.trim()))
      .filter(v => Number.isFinite(v) && v > 1)
      .slice(0, 20);
    db.settings.aviator.minBet = Number(body.aviatorMinBet || db.settings.aviator.minBet);
    db.settings.aviator.maxBet = Number(body.aviatorMaxBet || db.settings.aviator.maxBet);
    db.settings.aviator.minCrash = Number(body.aviatorMinCrash || db.settings.aviator.minCrash);
    db.settings.aviator.maxCrash = Number(body.aviatorMaxCrash || db.settings.aviator.maxCrash);
    db.settings.aviator.houseEdge = Number(body.aviatorHouseEdge || db.settings.aviator.houseEdge);
  });
  req.flash('success', 'Game settings updated.');
  res.redirect('/admin/settings');
});

router.post('/settings/referral', (req, res) => {
  const body = req.body;
  mutate(db => {
    db.settings.referral.enabled = body.enabled === 'on';
    db.settings.referral.codePrefix = String(body.codePrefix || 'CRP').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'CRP';
    db.settings.referral.signupBonusForFriend = Number(body.signupBonusForFriend || 0);
    db.settings.referral.signupBonusForReferrer = Number(body.signupBonusForReferrer || 0);
    db.settings.referral.rewardOnFirstDeposit = body.rewardOnFirstDeposit === 'on';
    db.settings.referral.firstDepositPercent = Number(body.firstDepositPercent || 0);
    db.settings.referral.maxFirstDepositBonus = Number(body.maxFirstDepositBonus || 0);
    db.settings.referral.minFirstDepositForReward = Number(body.minFirstDepositForReward || 0);
  });
  req.flash('success', 'Referral settings updated.');
  res.redirect('/admin/settings');
});

router.post('/settings/payments', (req, res) => {
  const body = req.body;
  mutate(db => {
    const p = db.settings.payments;
    p.enabled = body.enabled === 'on';
    p.complianceMode = body.complianceMode === 'on';
    p.currency = String(body.currency || p.currency || 'PKR').toUpperCase();
    p.minDeposit = Number(body.minDeposit || 0);
    p.maxDeposit = Number(body.maxDeposit || 0);
    p.minWithdraw = Number(body.minWithdraw || 0);
    p.maxWithdraw = Number(body.maxWithdraw || 0);
    p.sandboxAutoApprove = body.sandboxAutoApprove === 'on';
    p.nowpaymentsEnabled = body.nowpaymentsEnabled === 'on';
    p.nowpaymentsBaseUrl = body.nowpaymentsBaseUrl || p.nowpaymentsBaseUrl;
    p.nowpaymentsPayCurrency = String(body.nowpaymentsPayCurrency || p.nowpaymentsPayCurrency || 'usdttrc20').toLowerCase();
    ['jazzcash', 'easypaisa', 'bank'].forEach(key => {
      p.manualMethods[key] = p.manualMethods[key] || {};
      p.manualMethods[key].enabled = body[`${key}Enabled`] === 'on';
      p.manualMethods[key].title = body[`${key}Title`] || p.manualMethods[key].title || key;
      p.manualMethods[key].accountTitle = body[`${key}AccountTitle`] || '';
      p.manualMethods[key].accountNumber = body[`${key}AccountNumber`] || '';
    });
  });
  req.flash('success', 'Payment settings updated.');
  res.redirect('/admin/settings');
});

router.get('/users', (req, res) => {
  const db = readDb();
  res.render('admin/users', { title: 'Users', users: db.users });
});

router.post('/users/:id/toggle-block', (req, res) => {
  mutate(db => {
    const user = db.users.find(u => u.id === req.params.id && u.role !== 'admin');
    if (user) user.isBlocked = !user.isBlocked;
  });
  res.redirect('/admin/users');
});

router.post('/users/:id/credit', (req, res) => {
  const amount = Number(req.body.amount || 0);
  if (!Number.isFinite(amount) || amount === 0) {
    req.flash('error', 'Invalid credit amount.');
    return res.redirect('/admin/users');
  }
  mutate(db => {
    const user = db.users.find(u => u.id === req.params.id && u.role !== 'admin');
    if (user) {
      user.balance = Number((Number(user.balance || 0) + amount).toFixed(2));
      db.transactions.unshift({ id: uuid(), userId: user.id, type: 'admin_adjustment', amount, game: null, createdAt: new Date().toISOString() });
    }
  });
  res.redirect('/admin/users');
});

router.get('/payments', (req, res) => {
  const db = readDb();
  const type = req.query.type || '';
  const status = req.query.status || '';
  let payments = db.payments;
  if (type) payments = payments.filter(p => p.type === type);
  if (status) payments = payments.filter(p => p.status === status);
  const usersById = Object.fromEntries(db.users.map(u => [u.id, u]));
  res.render('admin/payments', { title: 'Payments', payments: payments.slice(0, 500), usersById, filters: { type, status } });
});

router.post('/payments/:id/approve', (req, res) => {
  let ok = false;
  mutate(db => {
    const payment = db.payments.find(p => p.id === req.params.id);
    if (!payment) return;
    ok = payment.type === 'deposit' ? creditDeposit(db, payment, req.currentUser.id) : approveWithdrawal(db, payment, req.currentUser.id);
  });
  req.flash(ok ? 'success' : 'error', ok ? 'Payment approved.' : 'Payment could not be approved.');
  res.redirect('/admin/payments');
});

router.post('/payments/:id/reject', (req, res) => {
  let ok = false;
  mutate(db => {
    const payment = db.payments.find(p => p.id === req.params.id);
    ok = rejectPayment(db, payment, req.currentUser.id, req.body.adminNote || 'Rejected by admin');
  });
  req.flash(ok ? 'success' : 'error', ok ? 'Payment rejected.' : 'Payment could not be rejected.');
  res.redirect('/admin/payments');
});

router.get('/referrals', (req, res) => {
  const db = readDb();
  const usersById = Object.fromEntries(db.users.map(u => [u.id, u]));
  res.render('admin/referrals', { title: 'Referral Reports', referrals: db.referrals.slice(0, 500), usersById });
});

router.get('/bets', (req, res) => {
  const db = readDb();
  const game = req.query.game || '';
  const status = req.query.status || '';
  let bets = db.bets;
  if (game) bets = bets.filter(b => b.game === game);
  if (status) bets = bets.filter(b => b.status === status);
  const usersById = Object.fromEntries(db.users.map(u => [u.id, u]));
  res.render('admin/bets', { title: 'Bet Reports', bets: bets.slice(0, 500), usersById, filters: { game, status } });
});

module.exports = router;
