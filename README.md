# TOPS Metro Tracker

**Proof-of-concept web application** for the TOPS (Textile Operations & Processing System) **Metro Scanning & Tracking** system. Demonstrates end-to-end tracking of textile containers (Metros) through the **Clean** and **Soiled** textile lifecycle using barcode, QR code, and RFID scanning.

> **MVP / POC** — This application runs entirely client-side using IndexedDB for local persistence. Authentication (MyID), backend APIs (Spring Boot / Node.js), and Aurora RDS integration are out of scope for this prototype.

---

## Tracking System Overview

### What is a Metro?

A **Metro** is a physical textile container (cart, bin, or pallet) that holds linens, towels, bed sheets, robes, and other textiles. Each Metro has a unique barcode/RFID tag and is tracked as it moves through the clean → use → soiled → clean cycle across multiple locations.

### End-to-End Tracking Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CLEAN TEXTILE TRACKING FLOW                              │
│                                                                                 │
│   ┌──────────┐    ┌──────────┐    ┌────────┐    ┌──────────┐    ┌──────────┐   │
│   │  Product  │───▶│  Clean   │───▶│Allocate│───▶│  Order   │───▶│  Order   │   │
│   │ Injection │    │  Buffer  │    │to Order│    │  Pickup  │    │In Transit│   │
│   └──────────┘    │Inventory │    └────────┘    │(Scan at  │    │(Driver   │   │
│                   └──────────┘                  │ Loading) │    │ Mobile)  │   │
│                        ▲                        └──────────┘    └────┬─────┘   │
│                        │                                             │         │
│                        │         ┌──────────┐    ┌──────────┐        │         │
│                        │         │  Order   │◀───│   At     │◀───────┘         │
│                        │         │  Draft   │    │ Storage  │                  │
│                        │         │(Delivered│    │(Scan at  │                  │
│                        │         │  to loc) │    │ Storage) │                  │
│                        │         └──────────┘    └────┬─────┘                  │
│                        │                              │                         │
└────────────────────────┼──────────────────────────────┼─────────────────────────┘
                         │                              │
                         │    TEXTILES ARE USED          │
                         │                              ▼
┌────────────────────────┼──────────────────────────────────────────────────────────┐
│                        │   SOILED TEXTILE TRACKING FLOW                          │
│                        │                                                          │
│   ┌──────────┐         │    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│   │  Clean   │─────────┘    │  Soiled  │◀───│  Mark    │◀───│ Textiles │         │
│   │  Metro   │              │  Textile │    │  Soiled  │    │ at Guest │         │
│   │ Staging  │              │(At Loc.) │    │          │    │ Location │         │
│   └──────────┘              └────┬─────┘    └──────────┘    └──────────┘         │
│        ▲                         │                                                │
│        │                         ▼                                                │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐                   │
│   │  At      │◀───│  Soiled  │◀───│  Soiled  │◀───│  Soiled  │                   │
│   │  Plant   │    │ Textile  │    │ Textile  │    │  Pickup  │                   │
│   │(Cleaning)│    │  Dock    │    │ Transit  │    │(Pick-up  │                   │
│   └──────────┘    └──────────┘    └──────────┘    │  Area)   │                   │
│                                                   └──────────┘                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Metro Lifecycle States

| Status | Type | Description |
|--------|------|-------------|
| `Available` | Clean | In clean buffer inventory, ready to be allocated to an order |
| `Allocated` | Clean | Assigned to a delivery order, waiting for pickup |
| `Pickup` | Clean | Being loaded onto transport at the loading dock |
| `InTransit` | Clean | On the way to the destination storage location |
| `AtStorage` | Clean | Delivered and scanned at the destination storage location |
| `Soiled` | Soiled | Textiles have been used; metro marked for soiled return |
| `SoiledTransit` | Soiled | Soiled metro in transit to the textile dock / plant |
| `AtPlant` | Soiled | Arrived at the laundry plant for processing |
| `Cleaning` | Soiled | Currently being cleaned at the plant |
| → `Available` | Clean | Cleaned and returned to clean buffer — **cycle restarts** |

### State Transition Diagram

```
                    CLEAN FLOW                           SOILED FLOW
                ┌──────────────────┐              ┌──────────────────────┐
                │                  │              │                      │
   ┌────────────▼──┐          ┌────┴─────┐   ┌───┴────────┐        ┌───┴──────┐
   │   Available   │─────────▶│Allocated │──▶│  Pickup    │───────▶│ InTransit│
   │  (Clean Buf.) │ Allocate │(to Order)│   │(Loading)   │ Depart │(To Dest.)│
   └───────▲───────┘ to Order └──────────┘   └────────────┘        └────┬─────┘
           │                                                             │
           │ Cleaned                                              Receive│
           │                                                             │
   ┌───────┴───────┐                                            ┌───────▼──────┐
   │   Cleaning    │◀──────────────────────────────────────────│  AtStorage   │
   │  (At Plant)   │                                            │ (Delivered)  │
   └───────▲───────┘                                            └───────┬──────┘
           │                                                             │
           │ Start                                               Mark    │
           │ Cleaning                                            Soiled  │
           │                                                             │
   ┌───────┴───────┐       ┌──────────────┐       ┌────────────┐┌──────▼───────┐
   │   AtPlant     │◀──────│ SoiledTransit│◀──────│  Soiled    ││              │
   │ (Laundry)     │Arrive │ (To Dock)    │Pickup │(At Location)│              │
   └───────────────┘       └──────────────┘       └────────────┘└──────────────┘
```

---

## Application Modules

The POC mirrors the four core modules from the TOPS architecture:

### 1. Metro Scan (Primary)

The main scanning interface for field operators.

- **Barcode scanning** via device camera (html5-qrcode)
- **QR Code scanning** via device camera
- **RFID sled** input (keyboard wedge pattern)
- **Manual entry** with search
- **Metro detail card** — shows ID, status, type (Clean/Soiled), location, contents, assigned order
- **Workflow actions** — context-sensitive buttons based on current metro status (e.g. "Allocate to Order", "Pickup", "Receive at Storage", "Mark Soiled")
- **Scan history timeline** — audit trail of all actions on a metro

### 2. Inventory

Real-time inventory dashboard across all locations.

- **Inventory table** — per-location breakdown of Clean, Soiled, Allocated, and In-Transit metro counts
- **Clean Textile Flow summary** — buffer and storage inventory levels
- **Soiled Textile Flow summary** — soiled counts at locations, dock, and plant

### 3. Orders

Delivery order management.

- **Create orders** with destination location selection
- **Auto-suggest** next order ID
- **Order lifecycle** — Draft → Allocated → Pickup → InTransit → Delivered
- **Expandable order detail** — see allocated metros and their individual statuses
- **Order actions** — Pickup, Dispatch, Deliver buttons

### 4. Locations

Location registry and current metro distribution.

- **9 configured locations** — Buffer Storage, Guest Room Storage, Soiled Dock, Loading Dock, Laundry Plant, Staging Area
- **Expandable location cards** — click to see all metros currently at that location
- **Metro count badges** — quick glance at distribution

---

## Technology Stack

| Area | Technology |
|------|------------|
| UI Framework | **React 18** + **TypeScript** |
| Build / Dev Server | **Vite 5** |
| Local Persistence | **IndexedDB** via **[idb](https://github.com/jakearchibald/idb)** |
| Barcode / QR Scanning | **[html5-qrcode](https://github.com/mebjas/html5-qrcode)** (MediaDevices API) |
| Icons | **lucide-react** |
| Offline / Installable | **vite-plugin-pwa** (service worker + web app manifest) |

### Scanning Approach (Option 1 — In Web App Scanning)

This POC implements **Option 1** from the tracking options analysis: a custom-developed system enabling barcode scanning in the web app using an iPhone/iPad camera.

| Pros | Considerations |
|------|----------------|
| No dedicated handheld scanners needed | Semi-automatic scanning |
| All features live in the web app | Camera-based — depends on device quality |
| No vendor lock-in | RFID via keyboard wedge (not native SDK) |
| Reduced hardware requirements | Requires HTTPS or localhost for camera |
| Less training overhead | |

### NFC / RFID Support

The app supports **three RFID/NFC methods**:

| Method | Platform | How It Works |
|--------|----------|-------------|
| **NFC via URL (NTAG213)** | ✅ iPhone & Android | Write app URL with metro ID to NFC tag → tap → auto-lookup |
| **Web NFC API** | ✅ Android Chrome | App listens for NFC tags directly in the browser |
| **Keyboard Wedge** | ✅ All platforms | Bluetooth RFID sled types tag ID into focused input field |

#### iPhone NFC Setup (NTAG213 Cards)

1. Download **[NFC Tools](https://apps.apple.com/app/nfc-tools/id1252962749)** (free) on your iPhone
2. Open NFC Tools → tap **Write** → **Add a record** → **URL / URI**
3. Enter your app URL with the metro ID:
   ```
   https://your-deployed-url.com/?metro=MTR-001
   ```
4. Tap **Write** → hold NTAG213 card against the top-back of iPhone
5. Repeat for each metro card (MTR-002, MTR-003, etc.)

**To scan:** Lock your iPhone → tap the NTAG213 card → iPhone notification appears → tap to open → app auto-detects the metro and shows its detail card with a teal NFC banner.

#### Android NFC

On Android Chrome, the app uses the **Web NFC API** to automatically listen for NFC tags. No URL writing needed — just tap any NFC tag and the app reads it directly.

---

## Project Structure

```
tops-scanner/
├── index.html                    # Entry HTML, Google Fonts (Inter), meta tags
├── package.json                  # Dependencies and npm scripts
├── vite.config.ts                # Vite + React + PWA plugin config
├── tsconfig.json                 # TypeScript strict config
├── public/
│   └── icon.svg                  # App icon for PWA manifest
└── src/
    ├── main.tsx                  # React root, PWA service worker registration
    ├── App.tsx                   # Main shell — header, module tabs, dashboard stats
    ├── db.ts                     # IndexedDB schema, all data operations, seed data
    ├── index.css                 # Complete design system (no framework)
    └── components/
        ├── MetroScanTab.tsx      # Scanner UI, metro lookup, workflow actions, history
        ├── InventoryTab.tsx      # Inventory table by location, clean/soiled summaries
        ├── OrdersTab.tsx         # Order CRUD, lifecycle actions, metro allocation
        └── LocationsTab.tsx      # Location list with expandable metro details
```

### Data Model (IndexedDB)

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    Metro     │       │    Order     │       │   Location   │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │       │ id (PK)      │       │ id (PK)      │
│ type         │──────▶│ metroIds[]   │       │ name         │
│ status       │       │ description  │       │ type         │
│ locationId   │──────▶│ status       │       │ area         │
│ orderId      │       │ destLocId    │──────▶└──────────────┘
│ contents     │       │ createdAt    │
│ lastScannedAt│       │ updatedAt    │
│ lastScanMeth │       └──────────────┘
│ createdAt    │
└──────┬───────┘       ┌──────────────┐
       │               │  ScanEvent   │
       │               ├──────────────┤
       └──────────────▶│ id (PK)      │
                       │ metroId (IDX)│
                       │ action       │
                       │ locationId   │
                       │ method       │
                       │ timestamp    │
                       │ userId       │
                       │ notes        │
                       └──────────────┘
```

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (or compatible package manager)

## Setup

1. **Clone or copy** this repository and open a terminal in the project root.

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
   - Grant **camera permission** when prompted.
   - Use a device with a working camera for the Barcode / QR Code tabs.

5. **Production build** (optional)

   ```bash
   npm run build
   npm run preview
   ```

## Demo Data

On first load, IndexedDB is seeded with realistic demo data:

### Metros (10)

| Metro ID | Contents | Status | Location |
|----------|----------|--------|----------|
| MTR-001 | 100 Towels | Available | Clean Buffer Storage |
| MTR-002 | 50 Bed Sheets | Available | Clean Buffer Storage |
| MTR-003 | 80 Pillowcases | Allocated (ORD-001) | Clean Buffer Storage |
| MTR-004 | 60 Bath Mats | InTransit (ORD-001) | Loading Dock |
| MTR-005 | 120 Hand Towels | AtStorage (ORD-002) | Guest Room Storage A |
| MTR-006 | 90 Towels (used) | Soiled | Guest Room Storage B |
| MTR-007 | 70 Bed Sheets (used) | SoiledTransit | Soiled Textile Dock |
| MTR-008 | 110 Mixed Linens | AtPlant | Central Laundry Plant |
| MTR-009 | 40 Robes | Available | Clean Buffer Storage B |
| MTR-010 | 200 Washcloths | Available | Clean Metro Staging |

### Orders (2)

| Order ID | Description | Status | Destination |
|----------|-------------|--------|-------------|
| ORD-001 | Building 1 Weekly Linen Restock | InTransit | Guest Room Storage A |
| ORD-002 | Recreation Center Towel Supply | Delivered | Pool & Spa Storage |

### Locations (9)

| Location | Type | Area |
|----------|------|------|
| Clean Buffer Storage | Buffer | Warehouse A |
| Clean Buffer Storage B | Buffer | Warehouse B |
| Guest Room Storage A | Storage | Resort Building 1 |
| Guest Room Storage B | Storage | Resort Building 2 |
| Pool & Spa Storage | Storage | Recreation Center |
| Soiled Textile Dock | Dock | Warehouse A |
| Loading Dock | Dock | Warehouse A |
| Central Laundry Plant | Plant | Off-site Facility |
| Clean Metro Staging | StagingArea | Warehouse A |

### Demo Walkthrough

1. Open the app → **Metro Scan** tab is active
2. Type `MTR-001` in the search field → see metro detail card (Available, Clean)
3. Click **Allocate to Order** → select an order → metro becomes Allocated
4. Search `MTR-004` → see it is InTransit → click **Receive at Storage Location**
5. Search `MTR-006` → see it is Soiled → click **Pickup Soiled – Send to Dock**
6. Check **Inventory** tab → see real-time counts update across locations
7. Check **Orders** tab → expand ORD-001 to see allocated metros
8. Click **Reset Demo** in the header to restore all seed data

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | TypeScript check + production Vite bundle |
| `npm run preview` | Serve the production build locally |

## What This POC Covers

- ✅ End-to-end **Metro lifecycle tracking** (Clean → Soiled → Clean)
- ✅ **Multi-method scanning** — Camera (barcode/QR), RFID (keyboard wedge), Manual entry
- ✅ **4 TOPS modules** — Metro Scan, Inventory, Orders, Locations
- ✅ **Real-time dashboard** — stats update as metros move through the workflow
- ✅ **Inventory visibility** — per-location Clean/Soiled/Allocated/InTransit counts
- ✅ **Order management** — create, allocate metros, track lifecycle
- ✅ **Location tracking** — 9 locations with expandable metro lists
- ✅ **Scan event audit trail** — timestamped history per metro
- ✅ **PWA** — installable, offline-capable when built

## What This POC Does Not Cover

- ❌ **Authentication** (MyID / Okta / Keystone) — skipped for MVP
- ❌ **Backend APIs** (Spring Boot TOPS Application, Node.js Handheld API)
- ❌ **Database** (Aurora RDS) — uses client-side IndexedDB
- ❌ **Real RFID hardware SDKs** — uses keyboard wedge pattern
- ❌ **Multi-user sync** — single-user local data
- ❌ **Barcode symbology tuning** or label printing
- ❌ **Business Objects (BO)** reporting
- ❌ **CI/CD, Docker, Kubernetes** deployment pipeline

---

Package name: `scanning-poc` · Product title: **TOPS Metro Tracker**
