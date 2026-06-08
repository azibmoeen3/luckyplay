const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const { applyFirstDepositReferralReward } = require('./referral');

const APPROVED_STATUSES = new Set(['finished', 'confirmed', 'sending', 'approved', 'paid']);
const REJECTED_STATUSES = new Set(['failed', 'expired', 'refunded', 'rejected', 'cancelled']);

function getCurrency(db) {
  return (db.settings.payments && db.settings.payments.currency) || 'PKR';
}

function createPaymentRecord({ userId, type, provider, amount, currency, reference, note, gatewayPaymentId, gatewayInvoiceId, gatewayUrl, status = 'pending', meta = {} }) {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    userId,
    type,
    provider,
    amount: Number(amount),
    currency,
    reference: reference || '',
    note: note || '',
    status,
    gatewayPaymentId: gatewayPaymentId || '',
    gatewayInvoiceId: gatewayInvoiceId || '',
    gatewayUrl: gatewayUrl || '',
    adminNote: '',
    meta,
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    rejectedAt: null,
    approvedBy: null,
    rejectedBy: null
  };
}

function validateDeposit(db, amount) {
  const p = db.settings.payments || {};
  const n = Number(amount);
  if (!p.enabled) return 'Payments are disabled.';
  if (!Number.isFinite(n) || n <= 0) return 'Enter a valid deposit amount.';
  if (n < Number(p.minDeposit || 0)) return `Minimum deposit is ${p.minDeposit} ${getCurrency(db)}.`;
  if (Number(p.maxDeposit || 0) && n > Number(p.maxDeposit)) return `Maximum deposit is ${p.maxDeposit} ${getCurrency(db)}.`;
  return null;
}

function validateWithdraw(db, user, amount) {
  const p = db.settings.payments || {};
  const n = Number(amount);
  if (!p.enabled) return 'Payments are disabled.';
  if (!Number.isFinite(n) || n <= 0) return 'Enter a valid withdrawal amount.';
  if (n < Number(p.minWithdraw || 0)) return `Minimum withdrawal is ${p.minWithdraw} ${getCurrency(db)}.`;
  if (Number(p.maxWithdraw || 0) && n > Number(p.maxWithdraw)) return `Maximum withdrawal is ${p.maxWithdraw} ${getCurrency(db)}.`;
  if (n > Number(user.balance || 0)) return 'Insufficient wallet balance.';
  return null;
}

function creditDeposit(db, payment, adminUserId = null) {
  if (!payment || payment.type !== 'deposit') return false;
  if (payment.status === 'approved') return false;
  const user = db.users.find(u => u.id === payment.userId);
  if (!user) return false;
  const now = new Date().toISOString();
  payment.status = 'approved';
  payment.updatedAt = now;
  payment.approvedAt = now;
  payment.approvedBy = adminUserId;
  user.balance = Number((Number(user.balance || 0) + Number(payment.amount || 0)).toFixed(2));
  user.totalDeposit = Number((Number(user.totalDeposit || 0) + Number(payment.amount || 0)).toFixed(2));
  db.transactions.unshift({
    id: uuid(),
    userId: user.id,
    type: 'deposit_approved',
    amount: Number(payment.amount),
    game: null,
    meta: { paymentId: payment.id, provider: payment.provider },
    createdAt: now
  });
  applyFirstDepositReferralReward(db, user.id, payment.amount);
  return true;
}

function rejectPayment(db, payment, adminUserId = null, adminNote = '') {
  if (!payment || ['approved', 'rejected', 'cancelled'].includes(payment.status)) return false;
  const now = new Date().toISOString();
  payment.status = 'rejected';
  payment.updatedAt = now;
  payment.rejectedAt = now;
  payment.rejectedBy = adminUserId;
  payment.adminNote = adminNote || payment.adminNote || '';
  if (payment.type === 'withdrawal' && payment.meta && payment.meta.balanceHeld) {
    const user = db.users.find(u => u.id === payment.userId);
    if (user) {
      user.balance = Number((Number(user.balance || 0) + Number(payment.amount || 0)).toFixed(2));
      db.transactions.unshift({
        id: uuid(),
        userId: user.id,
        type: 'withdrawal_refunded',
        amount: Number(payment.amount),
        game: null,
        meta: { paymentId: payment.id },
        createdAt: now
      });
    }
  }
  return true;
}

function approveWithdrawal(db, payment, adminUserId = null) {
  if (!payment || payment.type !== 'withdrawal' || payment.status === 'approved') return false;
  const now = new Date().toISOString();
  payment.status = 'approved';
  payment.updatedAt = now;
  payment.approvedAt = now;
  payment.approvedBy = adminUserId;
  const user = db.users.find(u => u.id === payment.userId);
  if (user) user.totalWithdraw = Number((Number(user.totalWithdraw || 0) + Number(payment.amount || 0)).toFixed(2));
  db.transactions.unshift({ id: uuid(), userId: payment.userId, type: 'withdrawal_approved', amount: 0, game: null, meta: { paymentId: payment.id }, createdAt: now });
  return true;
}

function buildNowPaymentsHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.NOWPAYMENTS_API_KEY || ''
  };
}

async function createNowPaymentsInvoice({ db, payment, user, baseUrl }) {
  const p = db.settings.payments || {};
  const enabled = p.nowpaymentsEnabled && process.env.NOWPAYMENTS_ENABLED === 'true' && process.env.NOWPAYMENTS_API_KEY;
  if (!enabled) {
    return {
      sandbox: true,
      invoiceUrl: `/app/payment/${payment.id}/checkout`,
      invoiceId: `SANDBOX-${payment.id}`,
      gatewayPaymentId: `SANDBOX-${payment.id}`
    };
  }

  const apiBase = String(process.env.NOWPAYMENTS_API_BASE_URL || p.nowpaymentsBaseUrl || 'https://api.nowpayments.io').replace(/\/$/, '');
  const appBaseUrl = String(baseUrl || process.env.APP_BASE_URL || '').replace(/\/$/, '');
  const payload = {
    price_amount: Number(payment.amount),
    price_currency: String(payment.currency || getCurrency(db)).toLowerCase(),
    pay_currency: String(p.nowpaymentsPayCurrency || 'usdttrc20').toLowerCase(),
    order_id: payment.id,
    order_description: `${db.settings.appName} wallet deposit`,
    ipn_callback_url: appBaseUrl ? `${appBaseUrl}/api/payments/nowpayments/ipn` : undefined,
    success_url: appBaseUrl ? `${appBaseUrl}/app/wallet?payment=success` : undefined,
    cancel_url: appBaseUrl ? `${appBaseUrl}/app/wallet?payment=cancelled` : undefined,
    customer_email: user.email
  };
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  const response = await fetch(`${apiBase}/v1/invoice`, {
    method: 'POST',
    headers: buildNowPaymentsHeaders(),
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = body.message || body.error || `NOWPayments invoice error ${response.status}`;
    throw new Error(msg);
  }
  return {
    sandbox: false,
    invoiceUrl: body.invoice_url || body.invoiceUrl || body.url || '',
    invoiceId: body.id || body.invoice_id || '',
    gatewayPaymentId: body.payment_id || body.id || '',
    raw: body
  };
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function verifyNowPaymentsSignature(body, signature) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return true;
  const expected = crypto.createHmac('sha512', secret).update(stableStringify(body)).digest('hex');
  const supplied = String(signature || '');
  if (expected.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function updatePaymentFromGatewayStatus(db, payment, gatewayStatus, payload = {}) {
  if (!payment) return null;
  const status = String(gatewayStatus || '').toLowerCase();
  payment.meta = { ...(payment.meta || {}), lastGatewayPayload: payload };
  payment.updatedAt = new Date().toISOString();
  if (APPROVED_STATUSES.has(status)) {
    creditDeposit(db, payment, 'gateway');
  } else if (REJECTED_STATUSES.has(status)) {
    rejectPayment(db, payment, 'gateway', `Gateway status: ${status}`);
  } else {
    payment.status = 'processing';
  }
  return payment;
}

module.exports = {
  createPaymentRecord,
  validateDeposit,
  validateWithdraw,
  creditDeposit,
  rejectPayment,
  approveWithdrawal,
  createNowPaymentsInvoice,
  verifyNowPaymentsSignature,
  updatePaymentFromGatewayStatus
};
