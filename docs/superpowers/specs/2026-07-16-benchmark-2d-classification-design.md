# Design: 2D Benchmark Figures + Subject Classification

**Date:** 2026-07-16  
**Status:** Approved  

## Context

The benchmark currently contains 30 hardcoded 3D figures in `benchmarkFigures.js`. Two gaps:

1. **No 2D figures** — the 2D generation pipeline exists but no 2D figures are in the benchmark, so there's no systematic way to evaluate or compare 2D figure generation quality.
2. **No subject metadata** — figures have no math/CS/physics tag, so you can't filter benchmark results by discipline.

The goal is: (a) a lightweight manual curation tool to select figures from both `candidates_3d/` and `diagrams_2d/` and tag them with a subject, and (b) the infrastructure to store that metadata and route benchmark generation correctly.

## Data Schema

### `benchmark_config.json` (new, lives at `figure-platform/frontend/src/benchmark_config.json`)

The single source of truth for the benchmark figure list:

```json
{
  "figures": [
    { "chapter": "Homography", "stem": "ransac_algo_d", "figureType": "3d", "subject": "cs" },
    { "chapter": "Imaging_Geometry", "stem": "warping_sketch", "figureType": "2d", "subject": "math" }
  ]
}
```

Fields:
- `chapter` — matches the chapter folder name under `chapter-figures/`
- `stem` — filename without extension
- `figureType` — `"3d"` (from `candidates_3d/`) or `"2d"` (from `diagrams_2d/`)
- `subject` — `"math"`, `"cs"`, or `"physics"` (empty string if untagged)

The existing 30 benchmark figures are seeded into this file with `figureType: "3d"` and `subject: ""`.

### `benchmarkFigures.js` (updated)

Stored inside CRA's `src/` tree so it can be statically imported. `benchmarkFigures.js` becomes a thin re-export:

```js
import config from './benchmark_config.json';
export const BENCHMARK_FIGURES = config.figures;
```

The exported `BENCHMARK_FIGURES` constant keeps the same shape for all consumers; `subject` and `figureType` are added as optional fields.

## Curator UI

A fully standalone HTML file at `figure-platform/benchmark-curator.html` — **no server, no build step, no changes to `server.js`**. Open it directly in the browser via the filesystem or any static server.

### How it gets figure data

The page uses `<input type="file" webkitdirectory>` to let you pick the `chapter-figures/` folder. The browser provides every file under it with a `webkitRelativePath` like `chapter-figures/Homography/candidates_3d/ransac_algo_d.png`. The page parses these paths to extract chapter, figureType (`candidates_3d` → `"3d"`, `diagrams_2d` → `"2d"`), and stem. Only `.png`/`.jpg` files inside `candidates_3d/` or `diagrams_2d/` subfolders are shown; `photographs/` and `sketches/` are ignored.

### Pre-loaded existing benchmark

The existing 30 benchmark figures are embedded as a JS constant inside the HTML. When the folder is loaded, those figures are pre-marked "In Benchmark" so you don't have to re-select them from scratch.

### Layout

```
[ Open chapter-figures/ folder ]   [ Export JSON ]

[ Filter: All | 2D | 3D ] [ Subject: All | Math | CS | Physics | Untagged ] [ Chapter: dropdown ]

[ Grid of figure cards ]                          [ Summary sidebar ]
  ┌─────────────────────────────────────┐          Benchmark: 32 figures
  │  [thumbnail]                        │          • Math: 10
  │  Chapter: Imaging_Geometry  [2D]    │          • CS: 15
  │  ransac_algo_d                      │          • Physics: 7
  │  ☑ In Benchmark                     │          • Untagged: 0
  │  Subject: [Math] [CS] [Physics]     │
  └─────────────────────────────────────┘
```

### Interaction model

- **Folder picker** — `<input webkitdirectory>` button at the top. Click, select `chapter-figures/`. Page reads all matching files and renders the grid.
- **Figure cards** — thumbnail rendered via `URL.createObjectURL` from the `File` object (no server needed), chapter name, stem, `2D`/`3D` badge.
  - "In Benchmark" checkbox — pre-checked for the embedded 30 existing figures
  - Subject picker (Math / CS / Physics buttons) — always visible
- **Filter bar** — client-side only; filters by figureType, subject, chapter, and in-benchmark status
- **Export JSON button** — builds the `benchmark_config.json` object from current in-memory state, triggers a browser download. No server call.

### Workflow

1. Open `benchmark-curator.html` directly in browser
2. Click folder picker → select the `chapter-figures/` directory
3. Browse, toggle figures in/out of benchmark, assign subjects
4. Click "Export JSON" → browser downloads `benchmark_config.json`
5. Move the downloaded file to `figure-platform/frontend/src/benchmark_config.json`

### State management

All in-memory JS, no framework. State is a single array of `{ chapter, stem, figureType, inBenchmark, subject, fileObj }`. `fileObj` is the browser `File` reference used for thumbnail rendering.

## Benchmark Runner Update (App.js)

In the existing benchmark batch loop, check `fig.figureType` before calling the generation endpoint:

- `figureType === '3d'` or undefined → call `generate-loop-async` (existing behavior, unchanged)
- `figureType === '2d'` → call `generate-2d-async` instead

Subject field is passed through in the request body for labeling purposes; it does not affect generation logic.

## Files Changed

| File | Change |
|------|--------|
| `figure-platform/frontend/src/benchmark_config.json` | New file; seeded with existing 30 figures |
| `figure-platform/frontend/src/benchmarkFigures.js` | Re-export from `benchmark_config.json`; no API change for consumers |
| `figure-platform/frontend/src/App.js` | Route 2D figures to `generate-2d-async` in the benchmark batch loop |
| `figure-platform/benchmark-curator.html` | New standalone curator page (no server dependency) |

`server.js` is not modified.

## Verification

1. Open `benchmark-curator.html` directly in the browser
2. Click folder picker, select `chapter-figures/`; confirm thumbnails load for chapters with `candidates_3d/` and `diagrams_2d/` subfolders
3. Verify the existing 30 benchmark figures are pre-checked
4. Toggle a 2D figure "In Benchmark", assign a subject, click "Export JSON"; inspect the downloaded file to confirm it contains both the original 3D figures and the newly added 2D figure with the correct subject
5. Move the JSON to `figure-platform/frontend/src/benchmark_config.json`; confirm the React app hot-reloads and the benchmark grid reflects the updated list
6. Trigger a benchmark run; confirm 3D figures call `generate-loop-async` and 2D figures call `generate-2d-async`
7. Filter the curator by subject and figureType; confirm client-side filtering works without reloading the folder
