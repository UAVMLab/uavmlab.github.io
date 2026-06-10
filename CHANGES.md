# UAV Motor Lab — Analysis Engine Corrections

All changes are vanilla ES modules, no build step required. Verified by
`tests/test_analysisMath.mjs` (17 checks) and `tests/test_integration.mjs`
(18 checks, full simulated runs through the real `startAnalyze` path).

## New file
- `js/ui/tabs/analizeTab/analysisMath.js` — pure, DOM-free analysis functions
  (unit-testable in Node): plateau segmentation, sweep aggregation, IR, KV,
  step-response metrics, endurance metrics, thermal fit, storage decimation.

## Bug fixes
1. **Efficiency mode had no parameter schema** — it silently ran with hidden
   defaults. Schema added (start/end throttle, step, dwell, ramp rate).
2. **CSV thrust unit mismatch** — header said `Thrust (g)` while values were kg
   (1000x trap for post-processing). Header corrected to kg; CSV now also
   carries metadata lines (mode, date, profile, params, computed results).
3. **Mapping mode ignored its parameters** — `ambientTemp`/`notes` were dropped
   and the sweep was hardcoded to 10–80 %/10 % with no cooldown despite the
   description. Sweep params are now configurable, a real cooldown pause runs
   between repeats, and metadata is persisted with the run.
4. **Telemetry recorded at 0.1 V / 0.1 A resolution** — too coarse for IR
   measurement (pulse dV ≈ 0.2–0.5 V). Now 1 mV / 10 mA.
5. **localStorage overflow** — runs are decimated to ≤600 points before
   persisting, with oldest-entry eviction on quota errors. Full-resolution data
   is still used for the session's charts and exports.

## Measurement-physics corrections
6. **Battery IR**: was ΔV/ΔI between consecutive 20 Hz samples (differentiating
   noise). Now plateau-pair method: per pulse, V and I are averaged over the
   settled part of each plateau, one (ΔI, ΔV) point per transition, regression
   slope = pack resistance; per-cell value reported using the profile cell count.
7. **KV**: slope of RPM vs *supply* voltage at partial throttle underestimates
   KV by ~1/duty (a synthetic KV-900 motor measured ~175 with the old method).
   Now fits RPM vs effective voltage duty·(V − I·R), using the measured IR when
   available. KV mode also records mean current per step.
8. **Step response**: the 25-sub-step ramp low-pass-filtered the command,
   destroying the transient. Default is now a single instant throttle command
   (checkbox to revert), and rise time (10–90 %), settling time (±5 %),
   overshoot and latency are computed and displayed.
9. **Sweep/efficiency charts**: previously plotted every raw sample (including
   ramp transients) on a *category* axis of throttle values. Now steady-state
   per-step means on a linear throttle axis, with ramp pseudo-plateaus rejected
   by a minimum-duration filter.
10. **Efficiency units**: g/W (industry convention) instead of kg/W.

## New features
- **Safety watchdog** in the 20 Hz collection loop: hard abort + automatic
  throttle ramp-down on profile limit breach (current, ESC temp, motor temp;
  200 ms sustained violation) and on telemetry staleness (>1.5 s), so the test
  never continues blind with a spinning prop. (`state.lastRxTime` is set in
  `telemetryHandler.js`.)
- **Computed results summary panel** below the chart: IR (mΩ, per cell, R²),
  KV (R²), step metrics, endurance totals (mAh, Wh, sag, thrust decay, thermal
  time constant and projected steady-state temperature), sweep max thrust /
  max power / peak efficiency point.
- **Run comparison**: a "Compare with" selector overlays thrust, current and
  efficiency vs throttle for any two sweep-family runs (e.g. propeller A vs B),
  with a side-by-side numeric summary.
- **CSV and JSON export buttons** alongside the existing PDF export; JSON is a
  self-describing record (profile, params, results, units, data).
- Endurance/thermal runs now produce consumed capacity and a first-order
  thermal fit instead of raw curves only.

## Tests
- `node tests/test_analysisMath.mjs` — synthetic-data validation of every
  analysis function (known IR, KV, time constants recovered within tolerance).
- `node tests/test_integration.mjs` — loads the real UI module with a DOM/Chart
  stub, registers a simulated BLE device and profile, and drives full sweep,
  IR, over-current-abort and stale-telemetry-abort scenarios end to end.
