# TXB Gaming Panel

A responsive browser-based gaming practice assistant. It runs in modern desktop and mobile browsers, saves profiles locally, and can be installed as a PWA where supported.

## Features

- Aim tracking and reaction-time drills with session stats.
- Manual sensitivity profiles for General, Red Dot, 2x, 4x, Sniper, and Free Look.
- A draggable, resizable HUD preview with saved layouts.
- Page-only browser/device information and a network latency check.
- In-page quick controls, crosshair practice, and optional sound cues.
- Local profile import/export and browser storage.

TXB is a practice companion. It does not connect to Free Fire, read enemy locations, inject into a game, modify game memory, or promise anti-cheat bypasses or automatic headshots. HUD and sensitivity values are suggestions for manual use in the game's own settings. The quick panel stays inside this webpage; ordinary browsers do not provide it as a system-wide overlay.

## Run locally

Requirements: Node.js 20 or newer and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local address printed by Vite. To make a production build:

```sh
pnpm build
pnpm preview
```

## GitHub Pages

The `main` branch includes a GitHub Actions workflow that builds and deploys the site to:

<https://aatawhid1235-creator.github.io/tawhid/>

In the repository's **Settings → Pages**, choose **GitHub Actions** as the publishing source if it is not already selected. The workflow uses the `/tawhid/` project-site base path and deploys on pushes to `main`.

## Install as a PWA

Open the hosted site in a supported browser and use its **Install app** or **Add to Home screen** option. PWA installation and offline behavior depend on browser support and require HTTPS or localhost.

## Android APK

The Android app wraps the same practice assistant in a Capacitor WebView. It supports Android 6.0 and newer and does not need root. It is not connected to Free Fire and cannot control the game.

To build an APK on GitHub, open **Actions → Build TXB Gaming Panel Android APK → Run workflow**. When the run succeeds, open it and download the `txb-gaming-panel-debug-apk` artifact. Extract `app-debug.apk` from the ZIP, copy it to the phone, then tap it to install. Android may ask you to allow installs from that file app. This is a debug APK for personal use, not a Play Store release.

To build locally, install Android Studio and its Android SDK, then run:

```sh
pnpm install --frozen-lockfile
pnpm android:add
pnpm android:sync
pnpm android:open
```

Build or run the Android wrapper from Android Studio. It remains a WebView app and does not add game-control or system-wide overlay features.

## Verification checklist

- [ ] Open on a narrow mobile screen and a desktop browser.
- [ ] Start, stop, and reset each practice session.
- [ ] Save, switch, import, and export sensitivity profiles.
- [ ] Move and resize HUD controls, then save and restore a layout.
- [ ] Open the quick panel and confirm its switches match the dashboard.
- [ ] Run the browser latency check and try the PWA install option where available.
- [ ] Reload the page and confirm settings persist in that browser.
