const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const DB_FILE = path.join(__dirname, '../../data/database.json');

const defaultSettings = () => ({
  appName: process.env.APP_NAME || 'Lucky Play',
  companyName: process.env.COMPANY_NAME || 'Koadly Associates',
  heroTitle: 'Play Exciting Games & Win Big',
  heroSubtitle: 'Enjoy Chicken Road and Aviator in one premium mobile WebView app with wallet, referrals, admin panel and APK upload.',
  apkUrl: '',
  apkFile: '',
  supportWhatsapp: '',
  maintenanceMode: false,
  chicken: {
    minBet: 10,
    maxBet: 50000,
    multipliers: [1.17, 1.23, 1.29, 1.36, 1.44, 1.53, 1.63, 1.75, 1.9, 2.1],
    houseEdge: 0.08
  },
  aviator: {
    minBet: 10,
    maxBet: 50000,
    minCrash: 1.02,
    maxCrash: 15,
    houseEdge: 0.06
  },
  referral: {
    enabled: true,
    codePrefix: 'CRP',
    signupBonusForFriend: 100,
    signupBonusForReferrer: 150,
    firstDepositPercent: 5,
    maxFirstDepositBonus: 500,
    minFirstDepositForReward: 200,
    rewardOnFirstDeposit: true
  },
  payments: {
    enabled: true,
    complianceMode: true,
    currency: 'PKR',
    minDeposit: 100,
    maxDeposit: 100000,
    minWithdraw: 500,
    maxWithdraw: 100000,
    sandboxAutoApprove: false,
    provider: 'manual_sandbox',
    nowpaymentsEnabled: false,
    nowpaymentsBaseUrl: process.env.NOWPAYMENTS_API_BASE_URL || 'https://api.nowpayments.io',
    nowpaymentsPayCurrency: 'usdttrc20',
    manualMethods: {
      jazzcash: { enabled: true, title: 'JazzCash', accountTitle: 'Your Company Name', accountNumber: '03XX-XXXXXXX' },
      easypaisa: { enabled: true, title: 'EasyPaisa', accountTitle: 'Your Company Name', accountNumber: '03XX-XXXXXXX' },
      bank: { enabled: true, title: 'Bank Transfer', accountTitle: 'Your Company Name', accountNumber: 'PK00 BANK 0000 0000 0000 0000' }
    }
  }
});

const defaultData = () => ({
  meta: {
    createdAt: new Date().toISOString(),
    version: '1.2.0'
  },
  settings: defaultSettings(),
  users: [],
  bets: [],
  transactions: [],
  payments: [],
  referrals: []
});

function generateReferralCode(seed = 'USER', prefix = 'CRP') {
  const cleanSeed = String(seed || 'USER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'USER';
  const random = Math.random().toString(36).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(2, 8);
  return `${String(prefix || 'CRP').toUpperCase()}${cleanSeed}${random}`.slice(0, 16);
}

function ensureUniqueReferralCode(db, seed) {
  let code = generateReferralCode(seed, db.settings?.referral?.codePrefix || 'CRP');
  while (db.users.some(u => String(u.referralCode || '').toUpperCase() === code)) {
    code = generateReferralCode(seed, db.settings?.referral?.codePrefix || 'CRP');
  }
  return code;
}

function normalizeData(db) {
  const defaults = defaultData();
  db.meta = { ...defaults.meta, ...(db.meta || {}), version: '1.2.0' };
  db.settings = db.settings || {};
  db.settings = {
    ...defaults.settings,
    ...db.settings,
    chicken: { ...defaults.settings.chicken, ...(db.settings.chicken || {}) },
    aviator: { ...defaults.settings.aviator, ...(db.settings.aviator || {}) },
    referral: { ...defaults.settings.referral, ...(db.settings.referral || {}) },
    payments: {
      ...defaults.settings.payments,
      ...(db.settings.payments || {}),
      manualMethods: {
        ...defaults.settings.payments.manualMethods,
        ...((db.settings.payments && db.settings.payments.manualMethods) || {})
      }
    }
  };
  db.users = Array.isArray(db.users) ? db.users : [];
  db.bets = Array.isArray(db.bets) ? db.bets : [];
  db.transactions = Array.isArray(db.transactions) ? db.transactions : [];
  db.payments = Array.isArray(db.payments) ? db.payments : [];
  db.referrals = Array.isArray(db.referrals) ? db.referrals : [];

  db.users.forEach(user => {
    if (!user.referralCode) user.referralCode = ensureUniqueReferralCode(db, user.name || user.email || user.id);
    if (typeof user.referralEarnings === 'undefined') user.referralEarnings = 0;
    if (typeof user.totalDeposit === 'undefined') user.totalDeposit = 0;
    if (typeof user.totalWithdraw === 'undefined') user.totalWithdraw = 0;
    if (typeof user.balance === 'undefined') user.balance = 0;
    if (!user.walletStatus) user.walletStatus = 'active';
  });

  return db;
}

function ensureDb() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const db = defaultData();
    const email = process.env.ADMIN_EMAIL || 'admin@koadly.local';
    const pass = process.env.ADMIN_PASSWORD || 'admin123';
    db.users.push({
      id: uuid(),
      name: 'Admin',
      email,
      passwordHash: bcrypt.hashSync(pass, 10),
      role: 'admin',
      balance: 0,
      referralCode: ensureUniqueReferralCode(db, 'admin'),
      referralEarnings: 0,
      totalDeposit: 0,
      totalWithdraw: 0,
      walletStatus: 'active',
      isBlocked: false,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    });
    writeDb(db);
  } else {
    const db = normalizeData(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
    writeDb(db);
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  return normalizeData(JSON.parse(raw));
}

function writeDb(data) {
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(normalizeData(data), null, 2));
  fs.renameSync(tmpFile, DB_FILE);
}

function mutate(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

module.exports = {
  DB_FILE,
  defaultData,
  ensureDb,
  readDb,
  writeDb,
  mutate,
  publicUser,
  ensureUniqueReferralCode
};
