# Pakistan Fuel Price Monitor

> Automated monitoring, historical archiving, and live web dashboard for official Oil & Gas Regulatory Authority (OGRA) petroleum price revisions in Pakistan.

**Author**: Najeeb Ullah Khan

---

## Overview

In Pakistan, retail prices for key petroleum commodities are regulated and revised fortnightly (effective on the 1st and 16th of each month) by the **Oil & Gas Regulatory Authority (OGRA)** and the **Ministry of Energy (Petroleum Division)**.

This repository tracks the complete official basket:
- **Motor Gasoline (Petrol MS 92)**
- **High-Speed Diesel (HSD)**
- **Superior Kerosene Oil (SKO)**
- **Light Diesel Oil (LDO)**
- **High Octane (HOBC 97)**
- **Compressed Natural Gas (CNG)**

The platform provides a dual-interface architecture:
1. **Web Dashboard (`server.js`)**: An editorial web application built with Node.js, Express, and EJS featuring responsive full-width cards, a sticky-bottom layout, graceful offline fallbacks, and security hardening.
2. **CLI Engine (`tracker.js`)**: A terminal utility with ASCII sparklines, delta revisions, watch daemon mode, and historical audit logs.

---

## Key Features

- **Fortnightly Revision Tracking**: Accurately tracks price revisions and calculates variance (+/- PKR) against both the previous government gazette and recent checks.
- **Resilient Pipeline with Multi-Tier Fallback**: Built with retry timeouts and local JSON persistence (`price_history.json`). If upstream API endpoints encounter network or DNS outages, the dashboard automatically falls back to verified rates without crashing.
- **Full-Width Responsive Interface**:
  - Fluid mobile-first grid adapting from single-column on phones up to 6-column panoramic views on ultrawide monitors.
  - Pinned first-column sticky scrolling on mobile data tables.
  - Fluid typography scaling cleanly across small phone screens.
  - Branded vector SVG favicon.
- **Production Security & Hardening**:
  - **IP Rate Limiting**: In-memory sliding window limiter (120 req/min per IP) with automatic memory cleanup.
  - **Upstream Protection**: 15-second cooldown on `/refresh` to prevent denial-of-service abuse against data providers.
  - **Security Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Powered-By` disabled.
  - **Health Monitoring**: Dedicated `/health` and `/healthz` endpoints returning JSON uptime metrics for uptime monitors and orchestrators.
  - **Search Crawler Control**: Built-in `/robots.txt` route managing indexing and bot traffic.
  - **Graceful Shutdown**: Native `SIGTERM` and `SIGINT` lifecycle handling.
- **Accessible & Clean Design**:
  - High-readability data typography (`Inter` + `IBM Plex Mono`).
  - Semantic HTML5 elements (`<header>`, `<main>`, `<footer>`, `<time>`, `<article>`), ARIA labels, and screen-reader utilities.
  - Dedicated **404 Not Found** and **Terms & Regulatory Disclaimer** pages.

---

## Project Structure

```text
scraper/
├── tracker.js            # CLI tracking engine, fetcher, and history utilities
├── server.js             # Express application server with security & rate limiting
├── package.json          # Node.js dependencies and script shortcuts
├── price_history.json    # Local JSON storage for historical revision logs
├── public/
│   ├── favicon.svg       # Vector SVG brand mark favicon
│   └── style.css         # Full-width responsive stylesheet (mobile breakpoints)
└── views/
    ├── index.ejs         # Main dashboard template
    ├── terms.ejs         # Regulatory terms and liability disclaimer
    └── 404.ejs           # Accessible 404 error page
```

---

## Quickstart

### Prerequisites

- **Node.js**: v18.x or higher (Node v20+ recommended)
- **npm**: v8.x or higher

### 1. Installation

Clone or open the project folder in your terminal and install dependencies:

```bash
npm install
```

### 2. Starting the Application

Launch the live application server:

```bash
npm start
```
*(or `npm run dev` with auto-reloading)*

Open your browser and navigate to:
```text
http://localhost:3000
```

To stop the server at any time, press `Ctrl + C` in your terminal.

### 3. Optional CLI Mode

To run a standalone CLI terminal check instead of the web dashboard:

```bash
npm run cli
```

---

## CLI Options

The CLI engine (`tracker.js`) can be executed with specific flags:

```bash
node tracker.js [flags]
```

- `--watch` : Keeps the process active and re-checks every 30 minutes.
- `--history`: Prints an ASCII-formatted table of the last 10 recorded price snapshots.
- `--all`    : Displays all fuels reported by the upstream API, including specialized variants.

---

## Health Check & Monitoring

The application exposes standard health probes for container orchestrators (Docker, Kubernetes, AWS, Render):

### `GET /health` or `GET /healthz`

**Response (`200 OK`):**
```json
{
  "status": "ok",
  "uptime": 142,
  "timestamp": "2026-10-17T15:09:02.929Z"
}
```

---

## Regulatory Framework in Pakistan

- **OGRA (Oil & Gas Regulatory Authority)**: Operates under the Oil and Gas Regulatory Authority Ordinance 2002 to determine ceiling prices for regulated petroleum products.
- **Price Setting Frequency**: Determined bi-monthly on the 1st and 16th days of each month based on import parity pricing (IPP), international benchmark movements (Platts Arab Gulf), currency fluctuations (PKR/USD parity), and the Government Petroleum Levy.
- **IFEM (Inland Freight Equalization Margin)**: Applied to ensure uniform baseline prices at all 29 primary depots across Pakistan.

---

## License & Credits

- **Author**: Najeeb Ullah Khan
- **License**: [ISC License](LICENSE)
