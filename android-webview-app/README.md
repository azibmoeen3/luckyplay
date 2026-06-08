# Lucky Play Android WebView APK Project

Ye folder Android Studio project hai jo Node.js web app ko real Android APK ke andar WebView shell mein run karega.

## Structure

- `app/src/main/java/com/koadly/luckyplay/MainActivity.java` - main WebView app
- `gradle.properties` - yahan live website URL set karna hai
- `app/src/main/AndroidManifest.xml` - permissions and app launcher settings
- `app/src/main/res/` - icon, colors, layout, offline screen

## APK banane ka process

1. Pehle Node.js app ko live domain par deploy karo.
2. `android-webview-app/gradle.properties` open karo.
3. Ye line update karo:

```properties
WEB_APP_URL=https://yourdomain.com
```

Example:

```properties
WEB_APP_URL=https://play.mydomain.com
```

4. Android Studio open karo.
5. `android-webview-app` folder open karo.
6. Gradle sync complete hone do.
7. Debug APK ke liye:

```bash
./gradlew assembleDebug
```

Output:

```text
app/build/outputs/apk/debug/app-debug.apk
```

8. Release APK ke liye Android Studio se:

```text
Build > Generate Signed Bundle / APK > APK
```

## Included mobile features

- Fullscreen mobile WebView app
- JavaScript + DOM Storage enabled
- Cookies/session support
- Camera/audio/file permissions support
- Offline screen with retry button
- External links: tel/mail/WhatsApp handled
- App icon and dark gaming theme
- Portrait mode locked

## Important

Localhost APK mein direct kaam nahi karega. Android phone ka `localhost` phone ka apna localhost hota hai. Testing ke liye live domain, ngrok URL, ya same Wi-Fi server IP use karo.
