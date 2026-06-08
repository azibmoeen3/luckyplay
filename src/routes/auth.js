const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { readDb, mutate } = require('../services/db');
const { createReferralUserFields, applySignupReferralRewards } = require('../services/referral');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.currentUser) return res.redirect('/app');
  res.render('auth/login', { title: 'Login' });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/login');
  }
  if (user.isBlocked) {
    req.flash('error', 'Your account is blocked. Contact support.');
    return res.redirect('/login');
  }
  req.session.userId = user.id;
  mutate(nextDb => {
    const u = nextDb.users.find(x => x.id === user.id);
    u.lastLoginAt = new Date().toISOString();
  });
  res.redirect(user.role === 'admin' ? '/admin' : '/app');
});

router.get('/register', (req, res) => {
  if (req.currentUser) return res.redirect('/app');
  if (req.query.ref) req.session.referralCode = String(req.query.ref).trim().toUpperCase();
  res.render('auth/register', { title: 'Register', referralCode: req.session.referralCode || '' });
});

router.post('/register', (req, res) => {
  const { name, email, password, referralCode } = req.body;
  if (!name || !email || !password || password.length < 6) {
    req.flash('error', 'Name, valid email and 6+ character password required.');
    return res.redirect('/register');
  }
  const db = readDb();
  if (db.users.some(u => u.email.toLowerCase() === String(email).toLowerCase())) {
    req.flash('error', 'Email already registered.');
    return res.redirect('/register');
  }
  const id = uuid();
  const inputReferralCode = String(referralCode || req.session.referralCode || '').trim().toUpperCase();
  mutate(nextDb => {
    const referralFields = createReferralUserFields(nextDb, name || email, inputReferralCode);
    const newUser = {
      id,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash: bcrypt.hashSync(password, 10),
      role: 'user',
      balance: 1000,
      ...referralFields,
      totalDeposit: 0,
      totalWithdraw: 0,
      walletStatus: 'active',
      isBlocked: false,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };
    nextDb.users.push(newUser);
    nextDb.transactions.unshift({ id: uuid(), userId: id, type: 'signup_bonus', amount: 1000, game: null, createdAt: new Date().toISOString() });
    applySignupReferralRewards(nextDb, newUser, inputReferralCode);
  });
  delete req.session.referralCode;
  req.session.userId = id;
  res.redirect('/app');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

router.get('/admin/login', (req, res) => {
  if (req.currentUser && req.currentUser.role === 'admin') return res.redirect('/admin');
  res.render('auth/admin-login', { title: 'Admin Login' });
});

module.exports = router;
