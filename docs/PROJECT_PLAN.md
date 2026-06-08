# Project Plan

## Phase 1 Included in This Codebase

- Mobile-first landing page with hero and APK download CTA
- Player auth, demo wallet and bet history
- Chicken Road game screen based on supplied reference image
- Aviator realtime game with Socket.IO
- Referral system: unique codes, share links, signup rewards, first-deposit rewards and admin reports
- Payment module: manual deposit verification, withdrawal requests, sandbox checkout and NOWPayments-ready invoice/IPN scaffold
- Admin dashboard, APK manager, landing settings, game settings, referral settings, payment settings, users and reports
- WebView-friendly bottom navigation

## Suggested Production Upgrade

For a commercial app, replace JSON storage with MySQL/PostgreSQL and add:

- Legal gambling license and jurisdiction checks
- Age verification, KYC and AML screening
- Responsible gaming limits, self-exclusion, cooldown and loss limits
- Certified RNG and immutable audit logs
- Payment gateway reconciliation and ledger accounting
- Signed webhook verification for every live payment provider
- Rate limiting, device fingerprinting and fraud detection
- Backups, monitoring, crash logs and admin activity logs

## MySQL Tables Suggested

- users
- referrals
- payments
- wallets
- wallet_transactions
- bets
- game_rounds
- platform_settings
- admin_activity_logs
