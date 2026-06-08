const express = require('express');
const { readDb, mutate, publicUser } = require('../services/db');
const { requireAuth } = require('../services/middleware');
const { verifyNowPaymentsSignature, updatePaymentFromGatewayStatus } = require('../services/payments');
const router = express.Router();

router.get('/me', requireAuth, (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.currentUser.id);
  res.json({ ok: true, user: publicUser(user) });
});

router.get('/settings', (req, res) => {
  const db = readDb();
  res.json({ ok: true, settings: db.settings });
});

router.post('/payments/nowpayments/ipn', (req, res) => {
  const signature = req.headers['x-nowpayments-sig'];
  if (!verifyNowPaymentsSignature(req.body, signature)) {
    return res.status(401).json({ ok: false, message: 'Invalid IPN signature.' });
  }

  const payload = req.body || {};
  const orderId = payload.order_id || payload.purchase_id || payload.payment_id;
  const gatewayPaymentId = payload.payment_id || payload.id || '';
  const paymentStatus = payload.payment_status || payload.status || '';

  let updated = null;
  mutate(db => {
    const payment = db.payments.find(p => p.id === orderId || p.gatewayPaymentId === String(gatewayPaymentId) || p.gatewayInvoiceId === String(payload.invoice_id || ''));
    if (!payment) return;
    updated = updatePaymentFromGatewayStatus(db, payment, paymentStatus, payload);
  });

  res.json({ ok: true, updated: !!updated });
});

module.exports = router;
