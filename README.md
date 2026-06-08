# Lucky Play — Chicken Road + Aviator Platform

Node.js / Express / Socket.IO mobile-first gaming web application designed for WebView APK packaging.

## Included

- Premium landing page inspired by the provided dark Lucky Play style
- Mobile app dashboard with bottom menu
- Chicken Road game screen with multiplier road, bet controls and cashout
- Aviator realtime Socket.IO multiplier game
- Wallet with demo credits, deposits, withdrawals and transaction ledger
- Referral system with referral codes, referral links, signup rewards and first-deposit reward tracking
- Admin panel with dashboard, users, payments, referral reports, game reports and APK upload
- Manual payment methods: JazzCash, EasyPaisa, Bank Transfer
- Sandbox payment checkout and NOWPayments integration scaffold

## Run Locally

```bash
npm install
cp .env.example .env
npm run seed
npm start
```

Open:

```text
http://localhost:3000
```

Admin login:

```text
Email: admin@koadly.local
Password: admin123
```

## Main Routes

```text
/                      Landing page
/app                   Mobile app dashboard
/app/games             Games list
/app/game/chicken      Chicken Road game
/app/game/aviator      Aviator game
/app/wallet            Wallet + deposits/withdrawals
/app/referrals         Referral dashboard
/admin                 Admin dashboard
/admin/settings        APK upload + platform settings
/admin/payments        Deposit/withdrawal approvals
/admin/referrals       Referral report
/admin/bets            Game reports
/download              APK download route
```

## Important Compliance Note

This codebase is configured as a demo-credit / sandbox build. Do not enable real-money deposits, withdrawals, or public gambling operation until you have the required jurisdictional license, KYC/AML, age verification, responsible gaming limits, audited RNG/fairness, payment provider approval, and legal review.

## Android WebView APK App

Is updated codebase mein Android app wrapper bhi include hai:

```text
android-webview-app/
```

Ye folder Android Studio mein open karke APK generate hoti hai. Pehle web app ko live domain par deploy karo, phir:

```text
android-webview-app/gradle.properties
```

mein URL set karo:

```properties
WEB_APP_URL=https://yourdomain.com
```

Phir Android Studio se APK build karo. Full guide:

```text
docs/ANDROID_WEBVIEW_APK_GUIDE.md
```
