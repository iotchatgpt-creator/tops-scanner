# TOPS Scanner

Proof-of-concept web app for **enterprise-style asset and container tracking** with multiple capture methods: device camera, manual entry, and RFID sled input (keyboard wedge).

## Technologies

### Scanning (camera)

- **[html5-qrcode](https://github.com/mebjas/html5-qrcode)** — Uses the browser **MediaDevices** API to read **barcodes and QR codes** from the live camera feed. The app prefers the **environment** (rear) camera when available, then falls back to the first available camera.

### RFID

- **No RFID hardware SDK** is integrated. The **RFID Sled** tab models a common field pattern: an **RFID handheld or sled that acts as a keyboard wedge** (it types the tag ID into a focused text field as if it were a USB keyboard). The app records the submitted value with method `RFID` for traceability.

### App stack

| Area | Technology |
|------|------------|
| UI | **React 18**, **TypeScript** |
| Build / dev server | **Vite 5** |
| Local persistence | **IndexedDB** via **[idb](https://github.com/jakearchibald/idb)** |
| Icons | **lucide-react** |
| Motion | **framer-motion** |
| Offline / installable | **vite-plugin-pwa** (service worker, web app manifest) |

## Project structure (high level)

```
tops-scanner/
├── index.html          # Entry HTML, fonts, meta
├── package.json        # Dependencies and npm scripts
├── vite.config.ts      # Vite + React + PWA plugin configuration
├── public/             # Static assets (icons, etc.)
└── src/
    ├── main.tsx        # React root, PWA service worker registration
    ├── App.tsx         # Tabs (Camera / Manual / RFID), scanner lifecycle, UI flow
    ├── db.ts           # IndexedDB schema, seed mock assets, scan + duplicate checks
    └── index.css       # Global styles
```

Data flow: **`App.tsx`** calls **`db.ts`** to check duplicates, resolve assets, and record scans. **`db.ts`** owns the IndexedDB stores `assets` and `scans`.

## What the POC covers

- **Camera scanning** of codes that **html5-qrcode** can decode (e.g. QR and common 1D/2D formats supported by the library).
- **Manual barcode / asset code** entry.
- **RFID path** as **keyboard-wedge capture** (same input pattern as manual, labeled and stored as `RFID`).
- **Client-side registry** of mock assets and **duplicate scan** prevention (one successful scan per asset code in `scans`).
- **Success / error** feedback and basic **PWA** packaging (installable / offline-capable when built and served appropriately).

## What the POC does not cover

- **Real RFID reader APIs** (UHF sled SDKs, Bluetooth readers, proprietary middleware).
- **Backend services**, authentication, multi-user sync, or **production asset master data**.
- **Barcode symbology tuning**, enterprise **label printing**, or **hardware certification** workflows.
- **Analytics, audit exports**, role-based access, or **integration** with ERP / WMS / TOPS backends.
- **iOS/Android native** apps (browser-only; camera behavior depends on OS and browser permissions).

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (or compatible client)

## Setup

1. **Clone or copy** this repository and open a terminal in the project root (`tops-scanner`).

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open the URL Vite prints (typically `http://localhost:5173`).

4. **Camera access**

   - Use **HTTPS** or **localhost** so the browser allows the camera.
   - Grant **camera permission** when prompted; use a device with a working camera for the **Camera** tab.

5. **Production build** (optional)

   ```bash
   npm run build
   npm run preview
   ```

   Serve the `dist` output over HTTPS in real deployments so PWA and camera policies behave as expected.

## Trying the mock data

After first load, IndexedDB is seeded with sample assets, including:

- `ASSET-123`
- `987654321`
- `RFID-ABC`

Use any tab to submit one of these codes. A **second** successful submission for the same code is treated as a **duplicate** (by design for this POC).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Typecheck (`tsc`) and production bundle |
| `npm run preview` | Serve the production build locally |

---

Package name in `package.json` is `scanning-poc`; the product title in the UI is **TOPS Scanner**.
