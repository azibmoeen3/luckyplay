CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  referral_code VARCHAR(32) NOT NULL UNIQUE,
  referred_by VARCHAR(64) NULL,
  referred_by_code VARCHAR(32) NULL,
  referral_earnings DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_deposit DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_withdraw DECIMAL(14,2) NOT NULL DEFAULT 0,
  wallet_status ENUM('active','locked') NOT NULL DEFAULT 'active',
  is_blocked TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NULL,
  INDEX idx_users_referrer (referred_by),
  CONSTRAINT fk_users_referrer FOREIGN KEY (referred_by) REFERENCES users(id)
);

CREATE TABLE referrals (
  id VARCHAR(64) PRIMARY KEY,
  referrer_id VARCHAR(64) NOT NULL,
  referred_user_id VARCHAR(64) NOT NULL,
  code VARCHAR(32) NOT NULL,
  status VARCHAR(60) NOT NULL DEFAULT 'registered',
  signup_bonus_for_friend DECIMAL(14,2) NOT NULL DEFAULT 0,
  signup_bonus_for_referrer DECIMAL(14,2) NOT NULL DEFAULT 0,
  first_deposit_bonus DECIMAL(14,2) NOT NULL DEFAULT 0,
  first_deposit_rewarded TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_referrals_referrer (referrer_id),
  INDEX idx_referrals_referred (referred_user_id),
  CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_id) REFERENCES users(id),
  CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_user_id) REFERENCES users(id)
);

CREATE TABLE payments (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type ENUM('deposit','withdrawal') NOT NULL,
  provider VARCHAR(80) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency VARCHAR(12) NOT NULL DEFAULT 'PKR',
  reference VARCHAR(190) NULL,
  note TEXT NULL,
  status ENUM('pending','processing','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  gateway_payment_id VARCHAR(120) NULL,
  gateway_invoice_id VARCHAR(120) NULL,
  gateway_url TEXT NULL,
  admin_note TEXT NULL,
  meta_json JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  approved_at DATETIME NULL,
  rejected_at DATETIME NULL,
  approved_by VARCHAR(64) NULL,
  rejected_by VARCHAR(64) NULL,
  INDEX idx_payments_user_date (user_id, created_at),
  INDEX idx_payments_status (status),
  INDEX idx_payments_gateway (gateway_payment_id, gateway_invoice_id),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE bets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  game ENUM('chicken','aviator') NOT NULL,
  round_id VARCHAR(64) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  multiplier DECIMAL(10,2) NOT NULL DEFAULT 0,
  payout DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('won','lost','cancelled') NOT NULL,
  fair_json JSON NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_bets_user_date (user_id, created_at),
  INDEX idx_bets_game_date (game, created_at),
  CONSTRAINT fk_bets_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE wallet_transactions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(80) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  game VARCHAR(30) NULL,
  meta_json JSON NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_wallet_user_date (user_id, created_at),
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE platform_settings (
  id INT PRIMARY KEY DEFAULT 1,
  settings_json JSON NOT NULL,
  updated_at DATETIME NOT NULL
);
