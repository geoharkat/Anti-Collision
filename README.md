# Anti-Collision Analyst

> **Directional drilling separation-factor analysis & ISCWSA MWD uncertainty model — powered by [welltraj](https://www.npmjs.com/package/welltraj)**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![welltraj](https://img.shields.io/badge/welltraj-v1.0-teal.svg)


---

## Overview

Anti-Collision Analyst is a browser-based tool for oil & gas directional drilling engineers. It computes the **Separation Factor (SF)** between a design well and one or more offset wells, visualises all trajectories in 2D / 3D, and exports professional PDF and Excel reports — with no server required.



---

## Features

| Category | Details |
|---|---|
| **Well ingestion** | CSV or Excel (`.xlsx` / `.xls`) — drag-and-drop or file picker |
| **Column auto-detection** | Recognises `MD`, `INC`, `AZI` and common aliases automatically |
| **SF analysis** | Centre-to-centre Separation Factor for every design-station / offset-well pair |
| **ISCWSA uncertainty** | Optional MWD error-ellipse SF column (depth factor, inc error, azi error) |
| **Trajectory Designer** | Interactive J-profile builder (KOP, build rate, target inclination, azimuth, TD); auto-scans on change |
| **Original vs redesigned** | Lock the original scan, apply a redesigned trajectory, and compare both in one PDF |
| **Charts** | SF profile, distance profile, 3D trajectory view, plan (spider) view — all via Plotly |
| **Map** | Leaflet + OpenStreetMap with SF heat-dots along the design well path |
| **Export** | Excel (scan table + distance profile) and PDF (landscape, multi-page, colour-coded) |

---

## Project Structure

```
Anti-Collision/
├── index.html          # Single-page application (all CSS + JS inline)
├── welltraj.umd.js     # WellTraj library bundle (UMD)
├── sample-data/
│   ├── design-well.csv
│   ├── offset-1.csv
│   ├── offset-2.csv
│   └── ...
└── README.md
```

---

## Getting Started

### Run locally

No build step is needed. Just open the file in a browser:

```bash
git clone https://github.com/geoharkat/Anti-Collision.git
cd Anti-Collision
# open index.html in your browser, or serve it:
npx serve .
```

Then navigate to `http://localhost:3000`.

### Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages → Source** and select the `main` branch, root folder.
3. Your app will be live at `https://geoharkat.github.io/Anti-Collision/`.

---

## Survey File Format

Input files must contain at least three columns. Column names are case-insensitive.

| Column | Required aliases |
|---|---|
| Measured Depth | `MD`, `MEASURED_DEPTH`, `DEPTH`, `DEPT` |
| Inclination | `INC`, `INCL`, `INCLINATION` |
| Azimuth | `AZI`, `AZ`, `AZIM`, `AZIMUTH` |

Example `design-well.csv`:

```csv
MD,INC,AZI
0,0,45
500,0,45
550,1.5,45
600,3.0,45
...
2800,45,45
```

Extra columns (TVD, North, East, etc.) are ignored — the app recomputes everything using minimum curvature via WellTraj.

---

## Analysis Parameters

| Parameter | Default | Description |
|---|---|---|
| VS Azimuth | 0° | Vertical section reference azimuth |
| Design radius | 0.15 m | Borehole radius of the design well |
| Offset radius | 0.15 m | Borehole radius of each offset well |
| Warn SF ≥ | 1.5 | Separation Factor warning threshold |
| Critical SF < | 1.0 | Separation Factor critical threshold |
| ISCWSA depth factor | 0.0035 | MWD error model — depth-proportional term |
| ISCWSA inc error | 0.2° | MWD error model — inclination uncertainty |
| ISCWSA azi error | 0.5° | MWD error model — azimuth uncertainty |

---

## Separation Factor

The Separation Factor is defined as:

```
SF = (centre-to-centre distance) / (sum of borehole radii + uncertainty ellipse radius)
```

- **SF ≥ Warn threshold** → ✅ Safe
- **Warn > SF ≥ Critical** → ⚠️ Warning
- **SF < Critical** → 🚨 Critical

When ISCWSA is enabled, a second SF column is computed using the combined MWD error ellipse of both wells at each depth station.

---

## Trajectory Designer

The built-in J-profile designer lets you test trajectory redesigns without modifying your original survey:

1. Load the design well — parameters are auto-populated from the CSV.
2. Click **Lock Original** to save the baseline scan results.
3. Adjust KOP, azimuth, build rate, target inclination, and TD.
4. The trajectory rebuilds and rescans automatically (toggle off for manual control).
5. Click **Apply Designed Trajectory** to update all views.
6. Export PDF — it will include a side-by-side comparison of original vs redesigned.

---

## Surface Coordinates & Map

Each well has an editable surface latitude / longitude (set via the pencil icon on its card, or via the **Default Field Location** panel). The app converts North / East offsets (computed by WellTraj) into geographic coordinates for the Leaflet map using:

```
Δlat = north / 111320
Δlon = east  / (111320 × cos(lat₀))
```

All trajectories are plotted in a common coordinate frame relative to the design well's surface location.

---

## Dependencies

All loaded via CDN — no npm install required for the frontend.

| Library | Purpose |
|---|---|
| [welltraj](https://www.npmjs.com/package/welltraj) | Minimum curvature, SF scan, distance profile |
| [Plotly.js](https://plotly.com/javascript/) | Interactive 2D / 3D charts |
| [Leaflet](https://leafletjs.com/) | Geographic map |
| [PapaParse](https://www.papaparse.com/) | CSV parsing |
| [SheetJS (xlsx)](https://sheetjs.com/) | Excel parsing and export |
| [jsPDF + autotable](https://github.com/parallax/jsPDF) | PDF report generation |
| [Font Awesome 6](https://fontawesome.com/) | Icons |
| [DM Sans / JetBrains Mono](https://fonts.google.com/) | Typography |

---

## Export

### Excel
Two sheets are exported:
- **Anti-Collision** — full station-by-station scan table with SF and SF ISCWSA columns.
- **Distance Profile** — centre-to-centre distance per design MD for every offset well.

### PDF (landscape A4)
- **Cover + comparison summary** (when original trajectory is locked).
- **Current scan results** — colour-coded table (green / amber / red).
- **Original scan results** — included when a baseline has been locked.
- Page numbers and footer on every page.

---

## Browser Support

Any modern browser with ES6+ support. Tested on Chrome, Firefox, Edge, and Safari.
No internet connection is required after the page loads (all CDN assets are cached by the browser).

---

## Author

**Ismail Harkat** — Senior Geologist

---

## License

MIT License — see [LICENSE](LICENSE) for details.
