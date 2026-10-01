# WorkTrack: Desktop Time Tracker

A cross-platform desktop app for **tracking hourly work**. Freelancers or employees log in, pick an assigned job, and start the timer. WorkTrack records active minutes, detects idle time and takes periodic screenshots, then syncs everything to your backend over a REST API, so clients get verifiable work logs for hourly contracts.

Built with **Electron** and **Node.js**. Packaged for **Windows, macOS and Linux**.

## Features

- **Login and job list:** token-based login, then the list of jobs assigned to the user with their details
- **Start / stop tracking** per job, with a memo on stop
- **Activity logging:** keyboard and mouse activity counted every minute (global input listener)
- **Idle detection:** pauses after 10 minutes without input, and handles sleep, resume and screen lock
- **Screenshots** captured on 10-minute intervals, compressed with `sharp` and uploaded to the API
- **System tray mode:** keeps running in the background with a tray icon
- **Deep links:** `worktrack://` protocol to open the app from a web dashboard
- **Single-instance lock** so the timer can't run twice
- **Settings window** with notification toggle

## Tech stack

| Area | Tools |
|---|---|
| Desktop shell | Electron (main, preload and renderer processes, IPC) |
| Input tracking | `node-global-key-listener`, Electron `powerMonitor` |
| Screenshots | Electron `desktopCapturer`, `sharp` |
| Networking | `node-fetch`, REST API with bearer tokens |
| UI | HTML, CSS, Bootstrap, vanilla JavaScript |
| Packaging | `electron-builder` (MSI and portable for Windows, DMG for macOS, AppImage/deb/rpm for Linux) |
| CI/CD | GitHub Actions: automatic macOS build on every push to `main` |

## Backend API

WorkTrack talks to any backend that exposes these endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/login` | Returns an auth token |
| GET | `/user/jobs` | Jobs assigned to the user |
| GET | `/user/jobs/{id}` | Job details |
| POST | `/user/start-tracking` | Start a work session |
| POST | `/user/stop-tracking` | Stop a session and save elapsed time and memo |
| POST | `/user/store-screenshot` | Upload a screenshot with activity data |

Point the app at your server with an environment variable:

```bash
WORKTRACK_API_URL=https://your-server.com/api
```

## Run locally

```bash
npm install
npm start            # development mode
```

## Build installers

```bash
npm run build:win    # Windows (MSI + portable)
npm run build:mac    # macOS (DMG)
npm run build:linux  # Linux (AppImage, deb, rpm)
npm run build:all    # all platforms
```

The macOS build also runs in GitHub Actions (`.github/workflows`), and the DMG is uploaded as a build artifact.

## Author

Built by **Amber Ghulam**, Senior Backend Engineer (Laravel, Node.js, AWS).
[Upwork](https://www.upwork.com/freelancers/~01ea185ef66a0884de) · [LinkedIn](https://www.linkedin.com/in/amber-ghulam)
