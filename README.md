# Hustle YMPlayer

**English** · [Русский](README.ru.md)

A practice player for hustle dancers. It picks tracks by tempo (BPM) and plays them through the **Yandex Music** widget. It is a static web app: no backend, no accounts, nothing to host except files.

**Live demo:** https://webring.github.io/hustle-music/

> Hustle YMPlayer is an independent project and is not affiliated with Yandex. Audio and playback rights stay on the Yandex Music side; the app only selects tracks and controls the official widget.

## Features

- **Player** — one or several BPM ranges (double sliders), shuffle, "Pick tracks", a 90-second pass mode and single-track repeat. Ranges are stored in the URL, e.g. `#bpm=92-118,91-119`, so a setup can be shared as a link.
- **"Bring the action" signal** — plays when the track changes automatically (the track ended or the 90 seconds ran out). Manual skips are instant and silent. A default sound is bundled; you can pick your own file (kept in IndexedDB).
- **Tracks** — the whole database with search, sorting, an "All / Likes / Dislikes" filter, click-to-play and a link to the track in Yandex Music.
- **Likes and dislikes** — a like just marks a track. A disliked track never enters the player but stays in the list. Stored in the browser.
- **Repeater** — loop an A–B section of **your own audio file**. Yandex tracks are not available there because the widget cannot seek.
- **Widget display** — the Yandex widget can be a floating window, embedded in the player card, a small "Yandex Music" button, or fully hidden (palette menu → "Yandex widget").
- **Clear error messages** — the app detects an insecure (http) page, an unreachable Yandex Music, a track that will not start, 30-second previews (no login or Plus subscription) and unavailable tracks, and tells you what to do.
- **Themes** — light, dark or system, plus five muted accents. The UI is responsive and works on phones.

## Quick start

Requires Node.js 22+.

```bash
cd app
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | static build into `app/dist` — host it anywhere |
| `npm run build:html` | the whole app as a single `index.html` in the project root (~0.9 MB) |
| `npm run lint` | lint |

Things to know:

- The page must be opened over **http(s)**, from a host or a local server. Opening `index.html` as a file (`file://`) loads the UI, but the Yandex widget will not accept commands.
- The widget only plays on a **secure context**: `localhost` or `https`. Over plain `http://<ip>` it answers `STOPPED`. For testing on other devices, serve the dev server over https (see below).
- Full tracks need a browser logged in to Yandex Music with a **Plus** subscription. Without it you get 30-second previews. If the browser blocks third-party cookies, the widget may not recognise your account.

### Dev server settings

Optional, in `app/.env.local` (not committed):

```
DEV_HOSTS=myhost.local   # extra host names the dev server answers to
DEV_POLL=1               # poll files for changes (network drives, WSL)
```

If `app/.cert/key.pem` and `app/.cert/cert.pem` exist, the dev server starts over https and listens on `0.0.0.0`, so a phone on the same network can open it. Create the certificates yourself (for example with [mkcert](https://github.com/FiloSottile/mkcert)); they are git-ignored.

## Deployment

`.github/workflows/deploy.yml` runs on every push and pull request: install, lint, build. A push to `main` additionally publishes `app/dist` to **GitHub Pages**.

To enable it in your own fork: *Settings → Pages → Build and deployment → Source: GitHub Actions*. The build uses relative asset paths (`base: "./"`), so it works under any sub-path.

## Track database

`app/src/data/tracks.json` contains tracks with their Yandex Music IDs and BPM. It is rebuilt by a script from a list of tracks with known tempo:

```bash
# tracks-bpm.json: [{ "name": "Artist - Title.mp3", "bpm": 118 }, ...]
node scripts/build-ym-db.mjs --source=tracks-bpm.json            # build
node scripts/build-ym-db.mjs --source=https://example.com/x.json # list by URL
node scripts/build-ym-db.mjs --source=... --limit=40             # trial run
node scripts/build-ym-db.mjs --source=... --refresh              # ignore the search cache
```

The script searches each track in Yandex Music and compares artist and title. Remixes, live versions and covers only match the same kind of version (their tempo differs). Tracks that are missing or cannot be matched confidently go to `scripts/ym-unmatched.json` with the best guess, for manual review. Search responses are cached in `scripts/.cache`.

## Limitations of the Yandex widget

Control goes through `postMessage` in the `display=bandlink-wiki` mode. This is an **undocumented partner integration**; Yandex may change or close it. For production use, agree on access with Yandex Music.

The protocol offers a track queue, pause, resume, next, previous and status events (`PLAYING`, `PAUSED`, `ENDED`, …). There is **no seek, no volume and no playback position**, so the on-screen time is counted by the app, there are no fade-outs, and volume is set in the widget itself or by the system.

## Project layout

| Path | Purpose |
|---|---|
| `app/src/lib/ym-widget.ts` | Yandex Music widget protocol (postMessage) |
| `app/src/lib/ym-status.ts` | detection of Yandex Music problems |
| `app/src/lib/player.ts` | player engine: queue, 90-second mode, signal, widget commands |
| `app/src/lib/tracks.ts` | track database access |
| `app/src/lib/signal.ts` | "Bring the action": default or custom sound |
| `app/src/lib/repeater.ts` | repeater for your own files |
| `app/src/lib/marks.ts` | likes and dislikes |
| `app/src/lib/settings.ts` | settings in localStorage and the URL |
| `app/src/components/ym-widget-frame.tsx` | the widget iframe (one for the whole app) and its display modes |
| `app/src/components/ym-notice.tsx` | error and hint messages |
| `app/src/pages/` | "Player", "Tracks" and "Repeater" pages |
| `scripts/build-ym-db.mjs` | track database builder |

Stack: Vite, React, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI).
