# Android Web-to-APK Integration Guide

Is project mein ab 2 parts hain:

1. `Node.js web app` - backend, frontend, games, wallet, referral, admin panel
2. `android-webview-app` - Android Studio project jo web app ko APK mein wrap karta hai

## Quick setup

### Step 1: Web app run/deploy

```bash
npm install
cp .env.example .env
npm run seed
npm start
```

Local URL:

```text
http://localhost:3000
```

Live APK ke liye is app ko Hostinger/VPS/Render/Railway par deploy karna hoga.

### Step 2: Android URL set karo

File:

```text
android-webview-app/gradle.properties
```

Update:

```properties
WEB_APP_URL=https://your-live-domain.com
```

### Step 3: APK build karo

Android Studio mein `android-webview-app` folder open karo.

Debug APK:

```bash
./gradlew assembleDebug
```

Release APK:

```text
Build > Generate Signed Bundle / APK > APK
```

## Admin APK Upload

Admin panel mein APK upload module already included hai. Jab APK generate ho jaye to admin panel se upload kar sakte ho.

```text
/admin/login
```

## Notes

- WebView app mobile application ki tarah chalegi.
- Game UI web se load hogi, lekin Android APK ke andar package hogi.
- Updates ke liye website update karni hogi, APK reinstall zaroori nahi hoga jab tak app URL/package/version change na ho.
