[← Back to main page](../)

# Development: running, testing and benchmarking

## Running the app

The app needs no build step and no install. Serve the repository root over HTTP; ES modules and `d3.json` don't work from `file://`:

```sh
python3 -m http.server 8000      # then open http://localhost:8000
```

## Tooling

Tests, lint and benchmarks need Node 18+ and a one-time `npm install`, which installs Playwright and ESLint. Playwright drives your installed Google Chrome, so no browser download is needed.

| Command | What it does | Time |
|---|---|---|
| `npm test` | Unit and differential tests of `core/` on the real dataset | ~10 s |
| `npm run test:e2e` | End-to-end tests of the real app in Chrome | ~1–2 min |
| `npm run lint` | ESLint, mainly undefined names (`no-undef`); run it after every refactor | ~2 s |
| `npm run bench` | Data-pipeline benchmark, pre-refactor vs current code | ~1 min |
| `npm run bench:browser -- <label> [runs]` | Interaction timings in Chrome, written to `bench/results/` | ~1 min per run |
| `node bench/visual-diff.mjs <other-checkout>` | Screenshots every view in another checkout and in this one, and counts differing pixels | ~1 min |

Run `npm test`, `npm run test:e2e` and `npm run lint` before committing.

## Test layout

```
tests/
  helpers/env.mjs          # import first: pins TZ=UTC for differential tests
  helpers/data.mjs         # dataset loader, filters() builder, shared filter SCENARIOS
  legacy/legacy.js         # FROZEN copy of the pre-refactor data logic (test oracle) — do not edit
  cards.test.mjs           # derived fields, identity keys, timezone-safe years
  filtering.test.mjs       # filter engine vs legacy: 14 scenarios × 3 currencies + 200 random combos
  views-data.test.mjs      # Scatterplot prep and chart aggregates vs legacy
  linking.test.mjs         # selection model vs brute force
  e2e/harness.mjs          # static server + Chrome launcher, shared with bench/
  e2e/app.e2e.mjs          # loading, filtering, resize, zoom, URL filters, bug regressions
  e2e/linking.e2e.mjs      # every cross-view interaction vs core/ computed in Node
```

**Differential tests.** `tests/legacy/legacy.js` holds the original implementations, with their known bugs. The new code must produce **identical** results: the same cards in the same order, the same counts and the same aggregates.
- If you change behaviour on purpose, don't edit the oracle. Add a dedicated test for the new behaviour and narrow the differential test.
- The old code read years in local time, so the differential tests run with `TZ=UTC`.

**End-to-end tests** read what the app draws:
- the DOM for SVG views;
- `document.querySelector(".Scatterplot").__scatter.points()` for the canvas Scatterplot;
- `window.__linking` for the current selection.

They then compare it with what `core/` computes in Node for the same interaction.

## Benchmarks

`bench/browser.mjs` measures each interaction from the input event to the second painted frame, inside the page, as a median over several runs. At 60 Hz this has a floor of about 17–33 ms. It also records the main-thread blocking time during a simulated window-resize drag.

Results are machine-specific and gitignored (`bench/results/`). Always compare runs from the same machine.

## Conventions

- Data logic goes in `core/` (pure, tested); views only lay out and draw.
- Views communicate only through [Linking](linking.md). Global filters change only through `updateState({ selectedFilters })` or `toggleGlobalFilter`.
- Use the derived card fields (`_ci`, `_nc`, `_year`, `_orig`, `_rar`) instead of re-parsing dates or sorting colors.
- Prices always go through `getEffectivePriceAttribute(state)`.
- Shared UI pieces (tooltip, "?" icon, palettes) live in `idioms/ui.js`.
- Hover handlers run on every mouse move. Keep them proportional to the number of highlighted cards, not to all ~100k cards, and avoid per-card DOM work.
