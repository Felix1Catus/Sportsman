# Sportsman

Gym plan + meal plan + groceries that stay on your back. Offline-first web app (`www/`) wrapped for Android with Capacitor.

## Get the APK (no Android Studio needed)
1. Create an empty GitHub repo, push this folder to it.
2. Open the repo → **Actions → Build Sportsman APK → Run workflow** (it also runs on every push).
3. When it finishes, download the **Sportsman-apk** artifact, unzip, and install `app-debug.apk` on your phone (allow "install unknown apps").

## Build locally (Android Studio / JDK 21 + Android SDK)
```
npm install
npx cap add android
npx capacitor-assets generate --android
npx cap sync android
cd android && ./gradlew assembleDebug
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk`
Add to `android/app/src/main/AndroidManifest.xml` before `<application>`:
`POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED` (the workflow does this for you).

## Try it in a browser first
`cd www && python3 -m http.server 8080` and open it on your phone (Chrome → ⋮ → Install app).
