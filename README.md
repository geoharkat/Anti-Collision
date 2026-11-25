# Anti-Collision Analyst

> **Separation-factor screening between a design well and offset wells, in your browser.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)

**Live app:** <https://geoharkat.github.io/Anti-Collision/>

> ⚠️ **Screening tool.** The positional uncertainty is a simplified 3-term MWD estimate, **not an ISCWSA error model**. Results have not been verified against certified anti-collision software and must not be the basis of drilling decisions.

---

## Features

| Category | Details |
|---|---|
| **Import** | CSV, TSV, TXT, LAS and Excel, with header, column and depth-unit detection, decimal commas and LAS `NULL` values |
| **Units** | Metric (m, hole radius in m, deg/30m) or field (ft, hole radius in inches, deg/100ft) |
| **Surface positions** | Per well: north / east of the design wellhead or latitude / longitude, and elevation |
| **Separation** | Closest approach searched continuously along each offset, with local minima refined along the design well |
| **Status** | Critical and warning thresholds, alert intervals, per-offset summary |
| **Plots (D3.js)** | SF and distance against MD, travelling cylinder, plan view, vertical section, rotatable 3D view |
| **Designer** | J-profile redesign of the design well, compared automatically with the loaded survey |
| **Map** | OpenStreetMap, loaded only on request |
| **Outputs** | PDF report with vector plots, Excel workbook, CSV, PNG and SVG |

Results are recalculated after every change, so tables, plots and reports always match the inputs. Files are read in your browser and are not uploaded.

---

## Quick Start

```bash
git clone https://github.com/geoharkat/Anti-Collision.git
cd Anti-Collision
# open index.html in a browser, or serve the folder:
python3 -m http.server 8000
```

There is no build step. Libraries load from public CDNs.

**Try it:** click **Load sample wells**. Or load `sample-data/design-well.csv` as the design well and `offset-1.csv`, `offset-2.csv` as offsets, then set their surface positions with **Edit**:

| Well | North of design | East of design |
|---|---|---|
| offset-1 | 520 m | 482 m |
| offset-2 | -60 m | 140 m |

The sample wells are synthetic.

Plot controls: drag to pan (rotate in 3D), `Ctrl` + scroll to zoom, `Shift` + drag to zoom to a box, double-click to reset.

---

## Survey File Format

| Column | Required | Notes |
|---|---|---|
| MD | Yes | Metres or feet |
| Inc | Yes | Degrees, 0 to 180 |
| Azi | Yes | Degrees from north. May be blank where inclination is 0 |
| TVD, North, East | No | Used to prefill the tie-in |

Rows that cannot be used are skipped and reported. Blank cells are never read as zero. Data starting below surface can be tied in by TVD, North and East; otherwise a vertical well from surface is assumed.

Azimuths are used as given: **no magnetic declination or grid convergence is applied.** Make sure all wells use the same north reference.

> **Set every offset's surface position.** Until you do, an offset is assumed to share the design wellhead and the app warns you.

---

## Method

### Trajectories

Minimum curvature. Positions between stations follow the same circular arc. Nothing is extrapolated beyond a well's surveyed interval; a warning is shown when the closest point is at the limit of an offset survey.

### Closest approach

For points every 5 m along the design well (and at refined minima), each offset trajectory is searched continuously for its closest point. This is independent of how far apart the survey stations are.

### Separation factor

```
SF = D / (rD + rO + k · (uD + uO))
```

| Symbol | Meaning |
|---|---|
| D | Centre-to-centre distance from the design point to the closest offset point |
| rD, rO | Hole radii of the design and offset wells |
| uD, uO | Uncertainty radius at each point |
| k | Multiplier on the uncertainty radius (default 1) |

```
u = √[ (f · MD)² + (εI · MD)² + (εA · MD · sin I)² ]
```

with depth factor `f` (default 0.0035), inclination error `εI` (0.2°) and azimuth error `εA` (0.5°), angles in radians.

- **SF < critical** (default 1.0) → Critical
- **SF < warning** (default 1.5) → Warning
- otherwise → Safe

With uncertainty switched off, `SF = D / (rD + rO)`. That only compares distance with hole size and is **not a collision-risk measure**.

### What this model does not do

No ISCWSA tool codes or covariance propagation, no directional (ellipsoidal) uncertainty, no confidence level calibration, no project-ahead or surface margin, no magnetic or grid corrections, no casing programme.

### Surface coordinates

Latitude / longitude differences are converted to metres with the WGS-84 length of a degree. This suits wells on a pad or within a field; use surveyed grid offsets where accuracy matters.

---

## Outputs

| File | Contents |
|---|---|
| **PDF report** | Warnings and key figures, offset summary, designed-profile comparison, wells and parameters, six plots, alert intervals, SF listing, disclaimer |
| **Excel** | Summary, Wells, Offset Summary, Alert Intervals, SF Scan, Distance Profile, Design Comparison, Surveys |
| **CSV** | The table currently shown |
| **PNG / SVG** | Any plot |

---

## Project Structure

```
Anti-Collision/
├── index.html
├── styles.css
├── js/
│   ├── state.js         # application state
│   ├── utils.js         # DOM helpers and formatting
│   ├── mincurve.js      # units, minimum curvature, interpolation, tie-in
│   ├── parsers.js       # CSV / LAS / Excel reading, sample wells
│   ├── collision.js     # surface positions, uncertainty, closest approach, SF
│   ├── process.js       # wells, parameters, designer, map
│   ├── tables.js        # summary figures and tables
│   ├── plots.js         # D3 charts
│   ├── export.js        # CSV, Excel, PNG / SVG
│   ├── pdf.js           # PDF report
│   └── interactions.js  # start-up and events
├── sample-data/
└── tests/core.test.js   # node --test tests/core.test.js
```

Libraries: D3.js, SheetJS, jsPDF, jsPDF-AutoTable, svg2pdf.js, and Leaflet for the optional map.

---

## Author

**Ismail Harkat** — Senior Geologist

## License

MIT License — see [LICENSE](LICENSE) for details.
