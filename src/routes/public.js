const express = require('express');
const { readDb } = require('../services/db');
const router = express.Router();

router.get('/', (req, res) => {
  if (req.query.ref) req.session.referralCode = String(req.query.ref).trim().toUpperCase();
  const db = readDb();
  res.render('landing', { title: db.settings.appName, bets: db.bets.slice(0, 8) });
});

router.get('/download', (req, res) => {
  const db = readDb();
  const url = db.settings.apkFile ? `/public/uploads/${db.settings.apkFile}` : db.settings.apkUrl;
  if (!url) {
    req.flash('error', 'APK download is not added by admin yet.');
    return res.redirect('/');
  }
  res.redirect(url);
});

module.exports = router;
