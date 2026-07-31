# Stokes-Pulse Android app

A thin native wrapper (Kotlin, single Activity + WebView) around the
mobile-optimized dashboard at `/mobile`, pointed at
`https://pulse.stokescloud.net/mobile`. It is **not** a bare WebView of the
desktop site — `/mobile` is a separate, simplified server-side view (single
column, larger touch targets, just Status + Events) built specifically for
this app.

## Why no local build instructions

This machine has no Android SDK/JDK/Gradle installed, so the APK is built by
**GitHub Actions** (`.github/workflows/build-android.yml`) on every push that
touches `android/**`, and the resulting file is committed back to
[`android/dist/stokes-pulse.apk`](dist/stokes-pulse.apk). Check the repo's
**Actions** tab if you want to watch a build or see why one failed.

If you do want to build locally later (e.g. in Android Studio), just open
this `android/` folder as a project — it's a standard Gradle Android project,
no wrapper files are checked in (CI invokes `gradle` directly), so Android
Studio will offer to generate them for you on first open.

## Sideloading

1. Download `android/dist/stokes-pulse.apk` from the repo (or a browser
   pointed at the raw file URL) onto your phone.
2. Open it. Android will prompt to allow installation from this source
   (Settings → apps → "install unknown apps" for whatever app you downloaded
   it with, e.g. your browser or file manager) — allow it, then install.
3. Open "Stokes-Pulse". First launch shows the normal login page; after that,
   the session cookie persists (up to 30 days, same as the web app) so you
   only re-authenticate if it expires or you explicitly log out.

## Notes

- `minSdk 26` (Android 8.0+) — covers effectively all real devices in use
  today and lets the launcher icon use the modern adaptive-icon format
  without needing separate raster fallback images.
- Cleartext HTTP is disabled (`usesCleartextTraffic="false"`) — it only ever
  talks to the real HTTPS `pulse.stokescloud.net` endpoint.
- Pull-to-refresh (`SwipeRefreshLayout`) reloads the page; the mobile view
  itself also auto-refreshes every 15s like the desktop dashboard.
- The Android back button navigates WebView history first, then exits the
  app once there's nothing left to go back to.
