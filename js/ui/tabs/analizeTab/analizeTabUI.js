// analizeTab.js
// Refactored and reorganized version B — keeps all original UI features
// but replaces the graphing system with mode-specific renderers and fixes
// throttle/data collection logic and smoothing.
//
// Usage: replace original analizeTab.js with this file. Depends on Chart.js and your existing UI elements.

import { state } from '../../../state.js';
import { appendLog } from '../../../utils/logUtils.js';
import { sendCommand } from '../../../utils/bluetooth.js';
import { getCurrentActiveProfile } from '../profileTab/profilesTab.js';
import {
    linearRegression, smoothCentered, decimateForDisplay,
    aggregateSweepSteps, findPeakEfficiency,
    computeIRFromPulses, computeKV, computeStepMetrics, computeEnduranceMetrics,
    decimateRunForStorage
} from './analysisMath.js';



// -----------------------------------------------------------------------------
// Constants & Small Utilities
// -----------------------------------------------------------------------------
state.analysis.lastKV = null;
state.analysis.lastKV_R2 = null;
state.analysis.lastIR = null;
state.analysis.lastIR_R2 = null;



const MOTOR_ARMED_BIT = 1 << 8;
const MAX_HISTORY = 10;
const DEFAULT_ARM_THROTTLE = 48; // raw unit baseline used in old code

function isArmedFromStatus(statusBits) {
    return (statusBits & MOTOR_ARMED_BIT) !== 0;
}

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function setAnalizeStatusMessage(text, kind = 'info') {
    const statusEl = document.getElementById('analizeStatus');
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color =
        kind === 'error' ? '#dc3545' : kind === 'warn' ? '#f39c12' : '#2ecc71';
}

function getUnit(metric) {
    const units = {
        voltage: 'V',
        current: 'A',
        power: 'W',
        rpm: '',
        thrust: 'g',
        escTemp: '°C',
        motorTemp: '°C'
    };
    return units[metric] || '';
}



// Decimates all numeric channels in a raw data snapshot to at most maxPts display points.
// Returns a new shallow-copy object — the original state.analysis.data is never mutated.
const DISPLAY_MAX_PTS = 500;
function prepareDataForRender(raw, maxPts = DISPLAY_MAX_PTS) {
    if (!raw || !raw.timestamps) return raw;
    // Trim ramp-down tail: only use samples up to the marked measurement end
    const endIdx = (raw._endIndex != null) ? raw._endIndex : raw.timestamps.length;
    const keys = ['timestamps', 'throttle', 'voltage', 'current', 'power', 'rpm', 'thrust', 'escTemp', 'motorTemp'];
    // Slice first, then decide whether to decimate
    const sliced = {};
    for (const k of keys) {
        if (raw[k] && Array.isArray(raw[k])) sliced[k] = raw[k].slice(0, endIdx);
    }
    if (raw.meanVoltage) sliced.meanVoltage = raw.meanVoltage;
    if (raw.meanRPM)     sliced.meanRPM     = raw.meanRPM;
    if ((sliced.timestamps || []).length <= maxPts) return sliced;
    const out = {};
    for (const k of keys) {
        if (sliced[k] && Array.isArray(sliced[k])) {
            out[k] = decimateForDisplay(sliced[k], maxPts);
        }
    }
    if (sliced.meanVoltage) out.meanVoltage = sliced.meanVoltage;
    if (sliced.meanRPM)     out.meanRPM     = sliced.meanRPM;
    return out;
}

// -----------------------------------------------------------------------------
// Throttle mapping & safety
// -----------------------------------------------------------------------------
// convert percent [0..100] (but enforced >= armPercent) -> ESC value [48..2047] and send via sendCommand
let currentThrottle = 0; // percent

async function sendThrottle(percent) {
    const profile = getCurrentActiveProfile();
    const armThrottleRaw = profile ? profile.armThrottle : DEFAULT_ARM_THROTTLE;
    const armPercent = ((armThrottleRaw - 48) / (2047 - 48)) * 100;
    // Ensure percent not below arm threshold
    percent = Math.max(percent, armPercent);
    percent = clamp(percent, 0, 100);
    const escValue = Math.round(48 + (percent / 100) * (2047 - 48));
    try {
        await sendCommand('set_throttle', { value: escValue });
        currentThrottle = percent;
        // Start data collection on first throttle command
        if (typeof window._startDataCollection === 'function') {
            window._startDataCollection();
        }
    } catch (err) {
        appendLog(`sendThrottle error: ${err.message}`);
    }
}

async function rampThrottle(fromPercent, toPercent, durationMs = 1000) {
    const steps = 25;
    const dt = Math.max(10, Math.floor(durationMs / steps));
    const delta = (toPercent - fromPercent) / steps;
    for (let i = 0; i <= steps; i++) {
        const p = fromPercent + delta * i;
        await sendThrottle(p);
        // Note: small await to yield; you may want to refine for real-time constraints
        await new Promise(r => setTimeout(r, dt));
    }
}

// -----------------------------------------------------------------------------
// Data collection & runtime control
// -----------------------------------------------------------------------------

let dataInterval = null;
let chartInstance = null;

function resetDataStore() {
    return {
        timestamps: [],    // seconds
        throttle: [],      // percent
        voltage: [],
        current: [],
        power: [],
        rpm: [],
        thrust: [],
        escTemp: [],
        motorTemp: []
    };
}

async function startAnalyze(mode, params) {
    if (state.analysis.running) return;
    // initialize
    currentThrottle = 0;
    state.analysis.data = resetDataStore();
    state.analysis.running = true;
    state.analysis.stopping = false;
    state.analysis.mode = mode;
    state.analysis.lastError = null;
    appendLog(`Analyze start: ${mode}`);
    setAnalizeStatusMessage(`${mode} analyze is running`, 'info');
    updateAnalizeControlsEnabled();

    // progress UI
    showProgress();
    updateProgress(0);

    // Start data collection timer - will be triggered after first throttle command
    let dataCollectionStarted = false;
    let startTime = null;
    let limitStrikes = 0; // consecutive violations needed before abort (noise immunity)
    const SAFETY_STRIKES = 4;            // 4 x 50 ms = 200 ms of sustained violation
    const TELEMETRY_STALE_MS = 1500;     // abort if no fresh telemetry for this long
    const safetyProfile = getCurrentActiveProfile();

    dataInterval = setInterval(() => {
        if (!state.analysis.running || !dataCollectionStarted) return;
        const now = (Date.now() - startTime) / 1000.0;
        const tel = state.lastRxData || {};
        const d = state.analysis.data;
        d.timestamps.push(now);
        d.throttle.push(parseFloat(currentThrottle.toFixed(2)));
        // 3 / 2 decimals: 0.1 V / 0.1 A quantization is too coarse for the
        // IR measurement (pulse dV is typically 0.2-0.5 V).
        d.voltage.push(parseFloat((tel.voltage || 0).toFixed(3)));
        d.current.push(parseFloat((tel.current || 0).toFixed(2)));
        d.power.push(parseFloat((tel.power || 0).toFixed(1)));
        d.rpm.push(Math.round(tel.rpm || 0));
        d.thrust.push(parseFloat(((tel.thrust || 0) / 1000).toFixed(2)));
        d.escTemp.push(parseFloat((tel.escTemp || 0).toFixed(1)));
        d.motorTemp.push(parseFloat((tel.motorTemp || 0).toFixed(1)));

        // ---- Safety watchdog ----
        // 1. Telemetry staleness: spinning a prop blind is not acceptable.
        if (state.lastRxTime && (Date.now() - state.lastRxTime) > TELEMETRY_STALE_MS) {
            triggerSafetyAbort('Telemetry lost (stale > 1.5 s)');
            return;
        }
        // 2. Profile hard limits (0 = limit disabled).
        let violation = null;
        if (safetyProfile) {
            if (safetyProfile.maxCurrent > 0 && tel.current > safetyProfile.maxCurrent) {
                violation = `Current ${tel.current.toFixed(1)} A > limit ${safetyProfile.maxCurrent} A`;
            } else if (safetyProfile.maxESCTemp > 0 && tel.escTemp > safetyProfile.maxESCTemp) {
                violation = `ESC temp ${tel.escTemp.toFixed(0)} °C > limit ${safetyProfile.maxESCTemp} °C`;
            } else if (safetyProfile.maxMotorTemp > 0 && tel.motorTemp > safetyProfile.maxMotorTemp) {
                violation = `Motor temp ${tel.motorTemp.toFixed(0)} °C > limit ${safetyProfile.maxMotorTemp} °C`;
            }
        }
        if (violation) {
            limitStrikes++;
            if (limitStrikes >= SAFETY_STRIKES) triggerSafetyAbort(violation);
        } else {
            limitStrikes = 0;
        }
    }, 50); // 20 Hz — 4× resolution for smooth graphs

    // Safety abort: stop the test loop and ramp the throttle down immediately.
    let safetyAborting = false;
    function triggerSafetyAbort(reason) {
        if (safetyAborting) return;
        safetyAborting = true;
        state.analysis.lastError = `SAFETY ABORT: ${reason}`;
        state.analysis.running = false; // breaks all mode loops
        appendLog(`SAFETY ABORT: ${reason}`);
        setAnalizeStatusMessage(`SAFETY ABORT: ${reason}`, 'error');
        // mark measurement end and ramp down without waiting for the mode loop
        window._markDataEnd && window._markDataEnd();
        const prof = getCurrentActiveProfile();
        const armRaw = prof ? prof.armThrottle : DEFAULT_ARM_THROTTLE;
        const armPercent = ((armRaw - 48) / (2047 - 48)) * 100;
        rampThrottle(currentThrottle, armPercent, 1500).catch(() => {});
    }

    // Function to mark measurement end (call before ramp-down so ramp-down data is excluded from charts)
    window._markDataEnd = () => {
        if (state.analysis.data) state.analysis.data._endIndex = state.analysis.data.timestamps.length;
    };

    // Function to start data collection (called after first throttle command)
    window._startDataCollection = () => {
        if (!dataCollectionStarted) {
            dataCollectionStarted = true;
            startTime = Date.now();
        }
    };

    try {
        // dispatch mode function
        switch (mode) {
            case 'sweep': await runThrottleSweep(params); break;
            case 'step': await runStepResponse(params); break;
            case 'endurance': await runEnduranceTest(params); break;
            case 'ir': await runIRTest(params); break;
            case 'kv': await runKVEstimation(params); break;
            case 'thermal': await runThermalStress(params); break;
            case 'mapping': await runMappingTest(params); break;
            case 'efficiency': await runEfficiencyAnalysis(params); break;
            default: throw new Error(`Unknown analyze mode: ${mode}`);
        }
        setAnalizeStatusMessage(`${mode} analyze completed`, 'info');
    } catch (err) {
        state.analysis.lastError = err.message || String(err);
        setAnalizeStatusMessage(`Error: ${err.message || err}`, 'error');
        appendLog(`Analyze error: ${err.message || err}`);
    } finally {
        // tidy up
        state.analysis.running = false;
        state.analysis.stopping = false;
        clearInterval(dataInterval);
        hideProgress();

        // render and save history if data exists
        if (state.analysis.data && state.analysis.data.timestamps.length) {
            // ---- post-run computed metrics (pure functions, mode-specific) ----
            let results = null;
            try { results = computeRunResults(state.analysis.mode, state.analysis.data, params); } catch (e) { appendLog(`Result computation error: ${e.message}`); }
            state.analysis.lastResults = results;

            renderGraphs(state.analysis.mode, state.analysis.data);
            renderResultsSummary(state.analysis.mode, results);

            state.analysis.history = state.analysis.history || [];
            // Save params and profile used for this run.
            // Data is decimated before persisting: a 10-min endurance run at 20 Hz
            // (~12k samples x 9 channels x 10 entries) would blow the localStorage quota.
            const profile = getCurrentActiveProfile();
            state.analysis.history.push({
                mode: state.analysis.mode,
                data: decimateRunForStorage(state.analysis.data, 600),
                params: params,
                profile: profile,
                results: results,
                timestamp: Date.now()
            });
            if (state.analysis.history.length > MAX_HISTORY) state.analysis.history.shift();
            saveHistory();
            refreshCompareSelect();
        }

        // free data reference (to avoid accidental reuse)
        state.analysis.data = null;
        updateAnalizeControlsEnabled();
    }
}

async function stopAnalyze() {
    if (!state.analysis.running) return;
    const mode = state.analysis.mode;
    state.analysis.running = false;
    state.analysis.stopping = true;
    updateAnalizeControlsEnabled();
    appendLog(`Analyze stop requested: ${mode}`);
    setAnalizeStatusMessage('Stopping analyze...', 'warn');

    // ramp down from currentThrottle to arm throttle percent
    const profile = getCurrentActiveProfile();
    const armThrottleRaw = profile ? profile.armThrottle : DEFAULT_ARM_THROTTLE;
    const armPercent = ((armThrottleRaw - 48) / (2047 - 48)) * 100;
    // ramp down in 2.5s for safety
    await rampThrottle(currentThrottle, armPercent, 2500);

    state.analysis.stopping = false;
    setAnalizeStatusMessage(`${mode} analyze stopped`, 'info');
    updateAnalizeControlsEnabled(false);
}

// -----------------------------------------------------------------------------
// Post-run computed results, summary panel, history persistence, comparison
// -----------------------------------------------------------------------------

function saveHistory() {
    try {
        localStorage.setItem('analyzeHistory', JSON.stringify(state.analysis.history));
    } catch (e) {
        // Quota exceeded: evict oldest entries until it fits.
        while (state.analysis.history.length > 1) {
            state.analysis.history.shift();
            try {
                localStorage.setItem('analyzeHistory', JSON.stringify(state.analysis.history));
                return;
            } catch (e2) { /* keep evicting */ }
        }
        appendLog('Warning: could not persist run history (storage quota)');
    }
}

// Mode-specific computed metrics, all from pure analysisMath functions.
function computeRunResults(mode, data, params = {}) {
    const profile = getCurrentActiveProfile() || {};
    const cells = profile.batteryCellCount || 0;
    switch (mode) {
        case 'ir': {
            const r = computeIRFromPulses(data, { cells });
            if (r.ohms !== null) {
                state.analysis.lastIR = r.ohms;
                state.analysis.lastIR_R2 = r.r2;
            }
            return { type: 'ir', ...r };
        }
        case 'kv': {
            const r = computeKV({
                meanVoltage: data.meanVoltage || [],
                meanRPM: data.meanRPM || [],
                meanCurrent: data.meanCurrent || [],
                throttlePercent: data.kvThrottle !== undefined ? data.kvThrottle : (params.throttle || 100),
                resistance: state.analysis.lastIR || 0
            });
            if (r.kv !== null) {
                state.analysis.lastKV = r.kv;
                state.analysis.lastKV_R2 = r.r2;
            }
            return { type: 'kv', ...r, irUsed: state.analysis.lastIR || 0 };
        }
        case 'step':
            return { type: 'step', ...computeStepMetrics(data) };
        case 'endurance':
        case 'thermal':
            return { type: 'endurance', ...computeEnduranceMetrics(data) };
        case 'sweep':
        case 'mapping':
        case 'efficiency': {
            const minDurationS = Math.max(0.5, 0.6 * (params.dwell || 1));
            const agg = aggregateSweepSteps(data, { minDurationS });
            const peak = findPeakEfficiency(agg);
            const maxThrust = agg.thrust.length ? Math.max(...agg.thrust) : 0;
            const maxPower = agg.power.length ? Math.max(...agg.power) : 0;
            return { type: 'sweep', agg, peak, maxThrustKg: maxThrust, maxPowerW: maxPower };
        }
        default:
            return null;
    }
}

// Small summary panel below the chart with the numbers users actually need.
function ensureSummaryEl() {
    let el = document.getElementById('analysisSummary');
    if (!el) {
        const container = document.getElementById('analyzeChartContainer')
            || (document.getElementById('analyzeChart') && document.getElementById('analyzeChart').parentElement);
        if (!container) return null;
        el = document.createElement('div');
        el.id = 'analysisSummary';
        el.style = 'margin-top:8px;padding:8px 10px;border-radius:6px;background:rgba(20,158,202,0.08);font-size:0.85em;line-height:1.5;';
        container.insertAdjacentElement('afterend', el);
    }
    return el;
}

function renderResultsSummary(mode, results) {
    const el = ensureSummaryEl();
    if (!el) return;
    if (!results) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const f = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v)) ? 'n/a' : Number(v).toFixed(d);
    let html = '';
    if (results.type === 'ir') {
        html = `<strong>Battery internal resistance:</strong> ${results.ohms !== null ? (results.ohms * 1000).toFixed(1) + ' mΩ' : 'n/a'}`
            + (results.perCell !== null ? ` (${(results.perCell * 1000).toFixed(1)} mΩ/cell)` : '')
            + ` · R² = ${f(results.r2, 3)} · ${results.points.length} pulse pairs`;
    } else if (results.type === 'kv') {
        html = `<strong>KV (duty- and IR-corrected):</strong> ${f(results.kv, 0)} RPM/V · R² = ${f(results.r2, 4)}`
            + (results.irUsed ? ` · using R = ${(results.irUsed * 1000).toFixed(1)} mΩ` : ' · <em>no IR measured — run the IR test first for best accuracy</em>');
    } else if (results.type === 'step' && results.avg) {
        html = `<strong>Step response (${results.avg.count} cycles):</strong> rise time ${f(results.avg.riseTime * 1000, 0)} ms (10–90%)`
            + ` · settling ${f(results.avg.settlingTime * 1000, 0)} ms (±5%)`
            + ` · overshoot ${f(results.avg.overshootPct, 1)}%`
            + (results.avg.latency ? ` · latency ${f(results.avg.latency * 1000, 0)} ms` : '');
    } else if (results.type === 'endurance' && results.consumedmAh !== undefined) {
        html = `<strong>Run totals:</strong> ${f(results.consumedmAh, 0)} mAh · ${f(results.consumedWh, 2)} Wh`
            + ` · voltage sag ${f(results.voltageSag, 2)} V · thrust decay ${f(results.thrustDecayPct, 1)}%`
            + (results.thermal ? ` · thermal: τ = ${f(results.thermal.tau, 0)} s, projected steady-state ${f(results.thermal.tInf, 0)} °C (R²=${f(results.thermal.r2, 2)})` : '');
    } else if (results.type === 'sweep') {
        html = `<strong>Max thrust:</strong> ${f(results.maxThrustKg, 2)} kg · <strong>max power:</strong> ${f(results.maxPowerW, 0)} W`
            + (results.peak ? ` · <strong>peak efficiency:</strong> ${f(results.peak.gPerW, 2)} g/W at ${f(results.peak.throttle, 0)}% throttle (${f(results.peak.thrustKg, 2)} kg @ ${f(results.peak.powerW, 0)} W)` : '');
    } else {
        el.style.display = 'none';
        return;
    }
    el.innerHTML = html;
}

// ---- Run comparison (e.g. propeller A vs propeller B) ----
function ensureCompareSelect() {
    let sel = document.getElementById('compareRunSelect');
    if (sel) return sel;
    const anchor = document.getElementById('graphMetricSelect') || document.getElementById('exportDataButton');
    if (!anchor) return null;
    const wrap = document.createElement('div');
    wrap.style = 'margin:6px 0;display:flex;align-items:center;gap:6px;font-size:0.85em;';
    const label = document.createElement('label');
    label.textContent = 'Compare with:';
    label.htmlFor = 'compareRunSelect';
    sel = document.createElement('select');
    sel.id = 'compareRunSelect';
    sel.style = 'flex:1;min-width:0;';
    wrap.appendChild(label);
    wrap.appendChild(sel);
    anchor.insertAdjacentElement('afterend', wrap);
    sel.addEventListener('change', () => {
        const hist = state.analysis.history || [];
        if (!hist.length) return;
        const current = hist[hist.length - 1];
        const idx = parseInt(sel.value, 10);
        if (Number.isNaN(idx) || idx < 0) {
            renderGraphs(current.mode, current.data);
            renderResultsSummary(current.mode, current.results);
            return;
        }
        const other = hist[idx];
        if (other) renderComparison(current, other);
    });
    return sel;
}

const SWEEP_FAMILY = ['sweep', 'mapping', 'efficiency'];

function refreshCompareSelect() {
    const sel = ensureCompareSelect();
    if (!sel) return;
    const hist = state.analysis.history || [];
    const opts = ['<option value="-1">— none (current run only) —</option>'];
    hist.forEach((h, i) => {
        if (i === hist.length - 1) return; // skip current run
        if (!SWEEP_FAMILY.includes(h.mode)) return;
        const when = new Date(h.timestamp).toLocaleString();
        const prof = h.profile ? `${h.profile.profileName || ''} ${h.profile.propDiameter || ''}x${h.profile.propPitch || ''}` : '';
        opts.push(`<option value="${i}">#${i + 1} ${h.mode} · ${prof} · ${when}</option>`);
    });
    sel.innerHTML = opts.join('');
    sel.value = '-1';
    if (sel.parentElement) sel.parentElement.style.display = (opts.length > 1 && SWEEP_FAMILY.includes((hist[hist.length - 1] || {}).mode)) ? 'flex' : 'none';
}

// Overlay thrust, current and efficiency vs throttle for two sweep-family runs.
function renderComparison(runA, runB) {
    if (!SWEEP_FAMILY.includes(runA.mode) || !SWEEP_FAMILY.includes(runB.mode)) {
        appendLog('Comparison is only available between sweep / mapping / efficiency runs');
        return;
    }
    const ctx = resetChartCtx();
    const fontSizes = getChartFontSizes();
    const aggA = aggregateSweepSteps(runA.data);
    const aggB = aggregateSweepSteps(runB.data);
    const nameOf = run => {
        const p = run.profile || {};
        return `${p.profileName || run.mode}${p.propDiameter ? ` ${p.propDiameter}x${p.propPitch}` : ''}`;
    };
    const toXY = (agg, ch) => agg.throttle.map((thr, i) => ({ x: thr, y: agg[ch][i] }));
    const mk = (label, agg, ch, color, dash, axis) => ({
        label, data: toXY(agg, ch), borderColor: color, backgroundColor: color,
        borderDash: dash, showLine: true, pointRadius: 2, borderWidth: 1.5, yAxisID: axis, fill: false
    });
    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                mk(`A: ${nameOf(runA)} — Thrust (kg)`, aggA, 'thrust', '#27ae60', [], 'yThrust'),
                mk(`B: ${nameOf(runB)} — Thrust (kg)`, aggB, 'thrust', '#27ae60', [6, 4], 'yThrust'),
                mk(`A — Efficiency (g/W)`, aggA, 'efficiencyGW', '#e67e22', [], 'yEff'),
                mk(`B — Efficiency (g/W)`, aggB, 'efficiencyGW', '#e67e22', [6, 4], 'yEff'),
                mk(`A — Current (A)`, aggA, 'current', '#3498db', [], 'yCur'),
                mk(`B — Current (A)`, aggB, 'current', '#3498db', [6, 4], 'yCur')
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: fontSizes.legend }, boxWidth: fontSizes.boxWidth, padding: fontSizes.padding } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)} @ ${c.parsed.x.toFixed(0)}%` } }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Throttle (%)', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks } } },
                yThrust: { position: 'left', title: { display: true, text: 'Thrust (kg)', font: { size: fontSizes.axisTitle }, color: '#27ae60' }, ticks: { color: '#27ae60', font: { size: fontSizes.ticks } } },
                yEff: { position: 'right', title: { display: true, text: 'Efficiency (g/W)', font: { size: fontSizes.axisTitle }, color: '#e67e22' }, ticks: { color: '#e67e22', font: { size: fontSizes.ticks } }, grid: { drawOnChartArea: false } },
                yCur: { position: 'right', title: { display: true, text: 'Current (A)', font: { size: fontSizes.axisTitle }, color: '#3498db' }, ticks: { color: '#3498db', font: { size: fontSizes.ticks } }, grid: { drawOnChartArea: false } }
            }
        }
    });
    // side-by-side numeric comparison
    const el = ensureSummaryEl();
    if (el) {
        const pA = findPeakEfficiency(aggA), pB = findPeakEfficiency(aggB);
        const maxT = agg => agg.thrust.length ? Math.max(...agg.thrust) : 0;
        el.style.display = 'block';
        el.innerHTML = `<strong>A (${nameOf(runA)}):</strong> max thrust ${maxT(aggA).toFixed(2)} kg`
            + (pA ? `, peak ${pA.gPerW.toFixed(2)} g/W @ ${pA.throttle.toFixed(0)}%` : '')
            + `<br><strong>B (${nameOf(runB)}):</strong> max thrust ${maxT(aggB).toFixed(2)} kg`
            + (pB ? `, peak ${pB.gPerW.toFixed(2)} g/W @ ${pB.throttle.toFixed(0)}%` : '');
    }
}

// -----------------------------------------------------------------------------
// Mode implementations (unchanged semantics, organized & safe)
// -----------------------------------------------------------------------------

async function runThrottleSweep(params) {
    const { startThrottle = 0, endThrottle = 100, stepSize = 5, dwell = 3, rampRate = 20, repeats = 1 } = params;
    const stepsInRepeat = Math.floor((endThrottle - startThrottle) / stepSize) + 1;

    for (let repeat = 0; repeat < repeats && state.analysis.running; repeat++) {
        // Ramp to start from 0 (safety)
        await rampThrottle(0, startThrottle, Math.max(200, (startThrottle / rampRate) * 1000));
        if (!state.analysis.running) break;

        // Sweep up
        for (let step = 0; step < stepsInRepeat && state.analysis.running; step++) {
            const throttle = startThrottle + step * stepSize;
            updateProgress((step / Math.max(1, stepsInRepeat - 1)) * 100, `${step + 1}/${stepsInRepeat} (${repeat + 1}/${repeats})`);
            await sendThrottle(throttle);
            // dwell time while collecting data
            await new Promise(r => setTimeout(r, dwell * 1000));
        }
        if (!state.analysis.running) break;

        // Ramp down to zero (mark end of measurement data before ramp-down on last repeat)
        if (repeat === repeats - 1) window._markDataEnd && window._markDataEnd();
        await rampThrottle(endThrottle, 0, Math.max(200, (endThrottle / rampRate) * 1000));
        if (!state.analysis.running) break;
    }
    updateProgress(100, `Completed ${repeats} repeats`);
}

async function runStepResponse(params) {
    const { lowThrottle = 10, highThrottle = 60, onDuration = 3, offDuration = 3, cycles = 5, rampRate = 100, instantStep = 1 } = params;
    // instantStep=1 (default): a single throttle command per transition.
    // The old behavior ramped through 25 sub-steps, which low-pass filters the
    // command and makes rise-time / latency measurements meaningless.
    const transition = async (from, to) => {
        if (instantStep) await sendThrottle(to);
        else await rampThrottle(from, to, Math.abs(to - from) / rampRate * 1000);
    };
    for (let cycle = 0; cycle < cycles && state.analysis.running; cycle++) {
        updateProgress(((cycle + 1) / cycles) * 100, `${cycle + 1}/${cycles}`);
        await transition(lowThrottle, highThrottle);
        if (!state.analysis.running) break;
        await new Promise(r => setTimeout(r, onDuration * 1000));
        if (!state.analysis.running) break;
        await transition(highThrottle, lowThrottle);
        if (!state.analysis.running) break;
        await new Promise(r => setTimeout(r, offDuration * 1000));
    }
    window._markDataEnd && window._markDataEnd();
    if (state.analysis.running) updateProgress(100, `Completed ${cycles} cycles`);
}

async function runEnduranceTest(params) {
    const { throttle = 50, duration = 10, cooldown = 2 } = params;
    updateProgress(0, 'Running endurance test');

    // ramp to throttle
    await rampThrottle(0, throttle, 2000);
    if (!state.analysis.running) return;

    // wait for duration (minutes)
    const durationMs = duration * 60 * 1000;
    const checkInterval = 1000;
    for (let elapsed = 0; elapsed < durationMs && state.analysis.running; elapsed += checkInterval) {
        updateProgress((elapsed / durationMs) * 100, `Endurance: ${Math.round(elapsed / 1000)}s / ${duration * 60}s`);
        await new Promise(r => setTimeout(r, Math.min(checkInterval, durationMs - elapsed)));
    }
    if (!state.analysis.running) return;
    updateProgress(100, 'Endurance test completed');

    // ramp down (mark end of measurement data before ramping down)
    window._markDataEnd && window._markDataEnd();
    await rampThrottle(throttle, 0, 2000);

    // cooldown time
    if (cooldown > 0) {
        const cooldownMs = cooldown * 60 * 1000;
        for (let elapsed = 0; elapsed < cooldownMs && state.analysis.running; elapsed += checkInterval) {
            updateProgress(100, `Cooldown: ${Math.round(elapsed / 1000)}s / ${cooldown * 60}s`);
            await new Promise(r => setTimeout(r, Math.min(checkInterval, cooldownMs - elapsed)));
        }
    }
}

async function runIRTest(params) {
    const { baseline = 10, pulseAmplitude = 10, onDuration = 1, offDuration = 1, pulses = 10 } = params;
    for (let p = 0; p < pulses && state.analysis.running; p++) {
        updateProgress(((p + 1) / pulses) * 100, `${p + 1}/${pulses}`);
        await sendThrottle(baseline);
        await new Promise(r => setTimeout(r, offDuration * 1000));
        if (!state.analysis.running) break;
        await sendThrottle(baseline + pulseAmplitude);
        await new Promise(r => setTimeout(r, onDuration * 1000));
        if (!state.analysis.running) break;
    }
    if (state.analysis.running) {
        await sendThrottle(baseline);
        updateProgress(100, 'IR test completed');
    }
}

async function runKVEstimation(params) {
    const { throttle = 20, dwell = 2, currentCeiling = 10, voltageSteps = 5 } = params;
    // voltageSteps: number of voltage points to measure (user sets voltage externally)
    state.analysis.data.meanVoltage = [];
    state.analysis.data.meanRPM = [];
    state.analysis.data.meanCurrent = [];
    state.analysis.data.kvThrottle = throttle; // duty for KV correction
    await sendThrottle(throttle);
    for (let s = 0; s < voltageSteps && state.analysis.running; s++) {
        updateProgress((s / Math.max(1, voltageSteps - 1)) * 100, `Step ${s + 1}/${voltageSteps}`);
        // Prompt user to set voltage and confirm
        await new Promise(resolve => {
            setAnalizeStatusMessage(`Step ${s + 1}: Set supply voltage to desired value, then click CONFIRM to continue.`, 'warn');
            let confirmBtn = document.getElementById('kvConfirmBtn');
            if (!confirmBtn) {
                confirmBtn = document.createElement('button');
                confirmBtn.id = 'kvConfirmBtn';
                confirmBtn.textContent = 'CONFIRM VOLTAGE';
                confirmBtn.style = 'margin: 1rem 0; padding: 0.5rem 1.2rem; font-size: 1.1em; background: #149eca; color: #fff; border: none; border-radius: 4px; cursor: pointer;';
                const card = document.getElementById('analizeCard');
                if (card) card.appendChild(confirmBtn);
            }
            confirmBtn.disabled = false;
            confirmBtn.style.display = '';
            confirmBtn.onclick = () => {
                confirmBtn.disabled = true;
                confirmBtn.style.display = 'none';
                setAnalizeStatusMessage(`Voltage confirmed for step ${s + 1}. Running dwell...`, 'info');
                resolve();
            };
        });
        // Collect samples during dwell
        const dwellSamples = [];
        const dwellStart = Date.now();
        while ((Date.now() - dwellStart) < dwell * 1000 && state.analysis.running) {
            const last = state.lastRxData || {};
            dwellSamples.push({ voltage: last.voltage || 0, rpm: last.rpm || 0, current: last.current || 0 });
            await new Promise(r => setTimeout(r, 100)); // sample every 100ms
        }
        // Compute mean voltage and rpm for this dwell
        const n = dwellSamples.length;
        const meanVoltage = n ? dwellSamples.reduce((sum, s) => sum + s.voltage, 0) / n : 0;
        const meanRPM = n ? dwellSamples.reduce((sum, s) => sum + s.rpm, 0) / n : 0;
        const meanCurrent = n ? dwellSamples.reduce((sum, s) => sum + s.current, 0) / n : 0;
        state.analysis.data.meanVoltage.push(meanVoltage);
        state.analysis.data.meanRPM.push(meanRPM);
        state.analysis.data.meanCurrent.push(meanCurrent);
        // optional: check current ceiling and abort if exceeded
        const last = state.lastRxData || {};
        if (last.current && last.current > currentCeiling) {
            throw new Error(`Current ceiling exceeded: ${last.current}A`);
        }
    }
    if (state.analysis.running) {
        window._markDataEnd && window._markDataEnd();
        await sendThrottle(0);
        updateProgress(100, 'KV estimation completed');
    }
}

async function runThermalStress(params) {
    const { segment1Throttle = 70, segment1Duration = 120, segment2Throttle = 90, segment2Duration = 30 } = params;
    updateProgress(0, 'Segment 1');
    await rampThrottle(0, segment1Throttle, 2000);
    if (!state.analysis.running) return;
    await new Promise(r => setTimeout(r, segment1Duration * 1000));
    if (!state.analysis.running) return;

    updateProgress(50, 'Segment 2');
    await rampThrottle(segment1Throttle, segment2Throttle, 2000);
    if (!state.analysis.running) return;
    await new Promise(r => setTimeout(r, segment2Duration * 1000));
    if (!state.analysis.running) return;

    updateProgress(100, 'Thermal stress test completed');
    window._markDataEnd && window._markDataEnd();
    await rampThrottle(segment2Throttle, 0, 2000);
}

async function runMappingTest(params) {
    // Sweep parameters are now user-configurable (previously hardcoded 10-80%/10%)
    // and a real cooldown pause is inserted between repeats, as the mode
    // description always claimed. ambientTemp and notes are persisted with the
    // run (history + CSV/JSON metadata).
    const {
        repeats = 3, ambientTemp = 25, notes = '',
        startThrottle = 10, endThrottle = 80, stepSize = 10, dwell = 2,
        cooldownBetween = 30
    } = params;
    for (let i = 0; i < repeats && state.analysis.running; i++) {
        updateProgress((i / repeats) * 100, `Run ${i + 1}/${repeats}`);
        await runThrottleSweep({ startThrottle, endThrottle, stepSize, dwell, rampRate: 20, repeats: 1 });
        if (!state.analysis.running) break;
        // cooldown between runs (skip after the last one)
        if (i < repeats - 1 && cooldownBetween > 0) {
            for (let s = 0; s < cooldownBetween && state.analysis.running; s++) {
                updateProgress(((i + 1) / repeats) * 100, `Cooldown ${s + 1}/${cooldownBetween} s before run ${i + 2}`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }
    if (state.analysis.running) updateProgress(100, 'Mapping test completed');
}

async function runEfficiencyAnalysis(params) {
    const { startThrottle = 10, endThrottle = 100, stepSize = 5, dwell = 3, rampRate = 20 } = params;
    const stepsInRepeat = Math.floor((endThrottle - startThrottle) / stepSize) + 1;

    // Ramp to start from 0 (safety)
    await rampThrottle(0, startThrottle, Math.max(200, (startThrottle / rampRate) * 1000));
    if (!state.analysis.running) return;

    // Sweep up
    for (let step = 0; step < stepsInRepeat && state.analysis.running; step++) {
        const throttle = startThrottle + step * stepSize;
        updateProgress((step / Math.max(1, stepsInRepeat - 1)) * 100, `${step + 1}/${stepsInRepeat}`);
        await sendThrottle(throttle);
        // dwell time while collecting data
        await new Promise(r => setTimeout(r, dwell * 1000));
    }
    if (!state.analysis.running) return;

    // Ramp down to zero (mark end of measurement data before ramping down)
    window._markDataEnd && window._markDataEnd();
    await rampThrottle(endThrottle, 0, Math.max(200, (endThrottle / rampRate) * 1000));
    updateProgress(100, 'Efficiency analysis completed');
}

// -----------------------------------------------------------------------------
// Progress UI helpers (assumes #analizeProgress, #progressFill, #progressText exist)
// -----------------------------------------------------------------------------

function showProgress() {
    const el = document.getElementById('analizeProgress');
    if (el) el.style.display = 'block';
}

function hideProgress() {
    const el = document.getElementById('analizeProgress');
    if (el) el.style.display = 'none';
}

function updateProgress(percent, text = '') {
    const fillEl = document.getElementById('progressFill');
    const textEl = document.getElementById('progressText');
    if (fillEl) fillEl.style.width = `${clamp(percent, 0, 100)}%`;
    if (textEl) textEl.textContent = text || `${Math.round(clamp(percent, 0, 100))}%`;
}

// -----------------------------------------------------------------------------
// Graphing system: dispatcher + mode-specific renderers (Chart.js assumed available)
// -----------------------------------------------------------------------------



function destroyChart() {
    if (chartInstance) {
        try { chartInstance.destroy(); } catch (e) {}
        chartInstance = null;
    }
}

function resetChartCtx() {
    const el = document.getElementById('analyzeChart');
    if (!el) throw new Error('analyzeChart canvas not found');
    const ctx = el.getContext('2d');
    destroyChart();
    return ctx;
}

// ================= CROSSHAIR + VALUE INTERCEPT PLUGIN ===================
const CrosshairPlugin = {
    id: 'crosshairPlugin',
    afterInit(chart) {
        chart.$crosshair = {
            x: null,
            active: false
        };

        const canvas = chart.canvas;

        function handleMove(evt) {
            const rect = canvas.getBoundingClientRect();
            const x = evt.clientX - rect.left;
            const y = evt.clientY - rect.top;
            
            // Only activate crosshair if within chart area
            const chartArea = chart.chartArea;
            if (!chartArea || x < chartArea.left || x > chartArea.right || 
                y < chartArea.top || y > chartArea.bottom) {
                return;
            }
            
            chart.$crosshair.x = x;
            chart.$crosshair.active = true;
            chart.draw();
        }

        function handleTouch(evt) {
            const touch = evt.touches[0];
            const rect = canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            // Check if touch is on legend area - if so, trigger legend click and skip crosshair
            const legend = chart.legend;
            if (legend && legend.legendHitBoxes) {
                const tapPadding = 12;
                const hitBoxes = legend.legendHitBoxes;
                const legendItems = legend.legendItems || [];
                for (let i = 0; i < hitBoxes.length; i++) {
                    const hitBox = hitBoxes[i];
                    if (x >= hitBox.left - tapPadding && x <= hitBox.left + hitBox.width + tapPadding &&
                        y >= hitBox.top - tapPadding && y <= hitBox.top + hitBox.height + tapPadding) {
                        // Fire the legend click handler manually so touch toggles the dataset
                        evt.preventDefault();
                        const legendItem = legendItems[i];
                        const onClick = (legend.options && legend.options.onClick) || Chart.defaults.plugins.legend.onClick;
                        if (onClick && legendItem) {
                            onClick.call(legend, evt, legendItem, legend);
                        }
                        return;
                    }
                }
            }
            
            // Only activate crosshair if within chart area
            const chartArea = chart.chartArea;
            if (!chartArea || x < chartArea.left || x > chartArea.right || 
                y < chartArea.top || y > chartArea.bottom) {
                return;
            }
            
            chart.$crosshair.x = x;
            chart.$crosshair.active = true;
            chart.draw();
        }

        function hideCrosshair(evt) {
            // Check if click/tap is outside canvas
            const rect = canvas.getBoundingClientRect();
            const x = evt.clientX || (evt.touches && evt.touches[0] && evt.touches[0].clientX);
            const y = evt.clientY || (evt.touches && evt.touches[0] && evt.touches[0].clientY);
            
            if (!x || !y) return;
            
            const isOutside = x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
            
            if (isOutside) {
                chart.$crosshair.active = false;
                chart.$crosshair.x = null;
                chart.draw();
            }
        }

        canvas.addEventListener('mousemove', handleMove);
        canvas.addEventListener('touchmove', handleTouch, { passive: false });
        canvas.addEventListener('touchstart', handleTouch, { passive: false });
        
        // Hide crosshair when clicking/tapping outside
        document.addEventListener('click', hideCrosshair);
        document.addEventListener('touchstart', hideCrosshair);
        
        // Store cleanup function
        chart.$crosshair.cleanup = () => {
            document.removeEventListener('click', hideCrosshair);
            document.removeEventListener('touchstart', hideCrosshair);
        };
    },
    
    destroy(chart) {
        // Cleanup event listeners
        if (chart.$crosshair && chart.$crosshair.cleanup) {
            chart.$crosshair.cleanup();
        }
    },

    afterDraw(chart, args, options) {
        const ctx = chart.ctx;
        const cross = chart.$crosshair;
        if (!cross || !cross.active || cross.x === null) return;
        // Clamp crosshair to chart area
        const chartLeft = chart.chartArea.left;
        const chartRight = chart.chartArea.right;
        const xPixel = Math.max(chartLeft, Math.min(cross.x, chartRight));
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xPixel, chart.chartArea.top);
        ctx.lineTo(xPixel, chart.chartArea.bottom);
        ctx.strokeStyle = options.color || '#888';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        // Get X-value from pixel → scale
        const xScale = chart.scales.x;
        let xValue = xScale.getValueForPixel(xPixel);
        const scaleType = xScale.type;
        const lines = [];
        let fitLineInfo = null;
        // Find regression/fit line if present
        chart.data.datasets.forEach((ds, idx) => {
            if (ds.label && ds.label.toLowerCase().includes('linear fit')) {
                fitLineInfo = ds;
            }
        });
        chart.data.datasets.forEach((ds, idx) => {
            // Only show scatter/primary data, skip linear fit for value box
            if (ds.label && ds.label.toLowerCase().includes('linear fit')) return;
            const data = ds.data;
            // SCATTER MODE (object points)
            if (typeof data[0] === 'object') {
                let closest = null;
                let minDist = Infinity;
                data.forEach(p => {
                    const dist = Math.abs(p.x - xValue);
                    if (dist < minDist) {
                        closest = p;
                        minDist = dist;
                    }
                });
                if (closest) {
                    let displayValue;
                    if (ds.label === 'RPM') {
                        displayValue = Math.round(closest.y);
                    } else if (ds.label && ds.label.includes('Throttle')) {
                        displayValue = closest.y.toFixed(2);
                    } else if (ds.label && ds.label.includes('Thrust')) {
                        displayValue = closest.y.toFixed(2);
                    } else if (ds.label && ds.label.includes('Efficiency')) {
                        displayValue = closest.y.toFixed(3);
                    } else {
                        displayValue = closest.y.toFixed(1);
                    }
                    lines.push(`${ds.label}: ${displayValue}`);
                }
            } else {
                // LINE MODE (array)
                const labels = chart.data.labels;
                if (!labels || !labels.length) return;
                if (scaleType === 'category') {
                    // Use nearest index for category scale
                    let idx = Math.round(xValue);
                    idx = Math.max(0, Math.min(idx, data.length - 1));
                    let displayValue;
                    if (ds.label === 'RPM') {
                        displayValue = Math.round(data[idx]);
                    } else if (ds.label && ds.label.includes('Throttle')) {
                        displayValue = data[idx].toFixed(2);
                    } else if (ds.label && ds.label.includes('Thrust')) {
                        displayValue = data[idx].toFixed(2);
                    } else if (ds.label && ds.label.includes('Efficiency')) {
                        displayValue = data[idx].toFixed(3);
                    } else {
                        displayValue = data[idx].toFixed(1);
                    }
                    lines.push(`${ds.label}: ${displayValue}`);
                } else {
                    // Use actual X values for linear/time scale
                    const points = labels.map((x, i) => ({ x: Number(x), y: Number(data[i]) }));
                    const minX = Math.min(...points.map(p => p.x));
                    const maxX = Math.max(...points.map(p => p.x));
                    xValue = Math.max(minX, Math.min(xValue, maxX));
                    let left = null, right = null;
                    for (let i = 0; i < points.length; i++) {
                        if (points[i].x >= xValue) {
                            right = points[i];
                            left = i > 0 ? points[i - 1] : points[i];
                            break;
                        }
                    }
                    if (!left) left = points[0];
                    if (!right) right = points[points.length - 1];
                    let yInterp;
                    if (left.x === right.x) {
                        yInterp = left.y;
                    } else {
                        const t = (xValue - left.x) / (right.x - left.x);
                        yInterp = left.y + (right.y - left.y) * t;
                    }
                    let displayValue;
                    if (ds.label === 'RPM') {
                        displayValue = Math.round(yInterp);
                    } else if (ds.label && ds.label.includes('Throttle')) {
                        displayValue = yInterp.toFixed(2);
                    } else if (ds.label && ds.label.includes('Thrust')) {
                        displayValue = yInterp.toFixed(2);
                    } else if (ds.label && ds.label.includes('Efficiency')) {
                        displayValue = yInterp.toFixed(3);
                    } else {
                        displayValue = yInterp.toFixed(1);
                    }
                    lines.push(`${ds.label}: ${displayValue}`);
                }
            }
        });
        // If regression/fit line exists, show its interpolated value at xValue
        if (fitLineInfo && fitLineInfo.data && fitLineInfo.data.length === 2) {
            // y = m*x + b, get m and b from the two points
            const p0 = fitLineInfo.data[0];
            const p1 = fitLineInfo.data[1];
            if (p0.x !== p1.x) {
                const m = (p1.y - p0.y) / (p1.x - p0.x);
                const b = p0.y - m * p0.x;
                const yFit = m * xValue + b;
                lines.push(`Linear Fit: ${yFit.toFixed(2)}`);
            }
        }
        // Draw value box
        const boxX = xPixel + 10;
        const boxY = chart.chartArea.top + 10;
        const padding = 6;
        ctx.save();
        // Use smaller font on mobile
        const isMobile = window.innerWidth <= 600;
        const fontSize = isMobile ? 8 : 12;
        const textHeight = isMobile ? 10 : 14;
        ctx.font = `${fontSize}px sans-serif`;
        const boxW = Math.max(...lines.map(t => ctx.measureText(t).width)) + padding * 2;
        const boxH = lines.length * textHeight + padding * 2;
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = "white";
        lines.forEach((text, i) => {
            ctx.fillText(text, boxX + padding, boxY + padding + textHeight * (i + 1) - 4);
        });
        ctx.restore();
    }
};

// 👉 REGISTER IT RIGHT HERE
Chart.register(CrosshairPlugin);

// Legend Touch Fix Plugin - Properly handles touch events on mobile
const LegendTouchFixPlugin = {
    id: 'legendTouchFix',
    afterInit(chart) {
        const canvas = chart.canvas;
        let touchHandled = false;
        
        // Handle touch events properly with correct coordinate scaling
        const handleTouch = (e) => {
            if (touchHandled) return;
            touchHandled = true;
            
            const touch = e.touches?.[0] || e.changedTouches?.[0];
            if (!touch) return;
            
            // Get the actual rendered size vs canvas size to calculate scale
            const rect = canvas.getBoundingClientRect();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            
            // Calculate scale factors (Chart.js uses canvas internal coordinates)
            const scaleX = canvasWidth / rect.width;
            const scaleY = canvasHeight / rect.height;
            
            // Get touch position relative to canvas and scale to internal coordinates
            const touchX = (touch.clientX - rect.left) * scaleX;
            const touchY = (touch.clientY - rect.top) * scaleY;
            
            // Get legend element
            const legend = chart.legend;
            if (!legend || !legend.legendItems || !legend.legendHitBoxes) return;
            
            // Check if touch is in legend area (using internal coordinates)
            const legendBox = {
                left: legend.left,
                right: legend.right,
                top: legend.top,
                bottom: legend.bottom
            };
            
            if (touchX >= legendBox.left && touchX <= legendBox.right && 
                touchY >= legendBox.top && touchY <= legendBox.bottom) {
                
                // Find which legend item was touched
                for (let i = 0; i < legend.legendItems.length; i++) {
                    const hitBox = legend.legendHitBoxes[i];
                    
                    if (touchX >= hitBox.left && touchX <= hitBox.left + hitBox.width &&
                        touchY >= hitBox.top && touchY <= hitBox.top + hitBox.height) {
                        
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Toggle dataset
                        const meta = chart.getDatasetMeta(i);
                        meta.hidden = meta.hidden === null ? !chart.data.datasets[i].hidden : null;
                        
                        // Toggle y-axis
                        const dataset = chart.data.datasets[i];
                        const yAxisID = dataset.yAxisID;
                        if (yAxisID && chart.options.scales[yAxisID]) {
                            chart.options.scales[yAxisID].display = !meta.hidden;
                        }
                        
                        chart.update();
                        break;
                    }
                }
            }
            
            setTimeout(() => { touchHandled = false; }, 300);
        };
        
        canvas.addEventListener('touchend', handleTouch, { passive: false });
        
        // Store cleanup function
        chart._legendTouchCleanup = () => {
            canvas.removeEventListener('touchend', handleTouch);
        };
    },
    
    destroy(chart) {
        if (chart._legendTouchCleanup) {
            chart._legendTouchCleanup();
        }
    }
};

Chart.register(LegendTouchFixPlugin);

// Helper function to get chart font sizes based on screen width
function getChartFontSizes() {
    const isMobile = window.innerWidth <= 600;
    return {
        legend: isMobile ? 4 : 10,
        title: isMobile ? 4 : 10,
        ticks: isMobile ? 4 : 10,
        tooltip: isMobile ? 6 : 11,
        axisTitle: 3,
        boxWidth: isMobile ? 20 : 16,
        boxHeight: isMobile ? 8 : 8,
        padding: isMobile ? 6 : 8
    };
}

// Sweep: steady-state mean per throttle step on a LINEAR axis.
// Previously this plotted every 20 Hz sample (including ramp transients)
// against a category axis of raw throttle values - transients polluted the
// curve and point spacing was wrong. Efficiency is now reported in g/W.
function renderSweepGraphs(data) {
    const ctx = resetChartCtx();
    const fontSizes = getChartFontSizes();
    const agg = aggregateSweepSteps(data);
    if (!agg.throttle.length) {
        // fallback for degenerate runs: render raw time series
        renderStepGraphs(data);
        return;
    }
    const toXY = ch => agg.throttle.map((thr, i) => ({ x: thr, y: agg[ch][i] }));
    const mk = (label, ch, color, axis) => ({
        label, data: toXY(ch), borderColor: color, backgroundColor: color,
        showLine: true, pointRadius: 2.5, borderWidth: 1.5, yAxisID: axis, fill: false
    });
    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                mk('RPM', 'rpm', '#e74c3c', 'yRPM'),
                mk('Thrust (kg)', 'thrust', '#27ae60', 'yThrust'),
                mk('Current (A)', 'current', '#3498db', 'yCurrent'),
                mk('Voltage (V)', 'voltage', '#9b59b6', 'yVoltage'),
                mk('Efficiency (g/W)', 'efficiencyGW', '#e67e22', 'yEfficiency')
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { size: fontSizes.legend }, boxWidth: fontSizes.boxWidth, boxHeight: fontSizes.boxHeight, padding: fontSizes.padding, textAlign: 'center', usePointStyle: false },
                    onClick: (e, legendItem, legend) => {
                        const index = legendItem.datasetIndex;
                        const chart = legend.chart;
                        Chart.defaults.plugins.legend.onClick.call(legend, e, legendItem, legend);
                        const meta = chart.getDatasetMeta(index);
                        const yAxisID = chart.data.datasets[index].yAxisID;
                        if (yAxisID && chart.options.scales[yAxisID]) chart.options.scales[yAxisID].display = !meta.hidden;
                        chart.update();
                    }
                },
                tooltip: {
                    bodyFont: { size: fontSizes.tooltip },
                    titleFont: { size: fontSizes.tooltip },
                    callbacks: {
                        label: c => `${c.dataset.label}: ${formatChartValue(c.dataset.label, c.parsed.y)} @ ${c.parsed.x.toFixed(1)}%`
                    }
                }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Throttle (%)', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks }, callback: v => Math.round(v) } },
                yRPM: {
                    type: 'linear', position: 'left',
                    title: { display: true, text: 'RPM (x10\u00b3)', font: { size: fontSizes.axisTitle }, color: '#e74c3c' },
                    ticks: { font: { size: fontSizes.ticks }, color: '#e74c3c', callback: v => (v / 1000).toFixed(1) }
                },
                yThrust: { type: 'linear', position: 'right', title: { display: true, text: 'Thrust (kg)', font: { size: fontSizes.axisTitle }, color: '#27ae60' }, ticks: { font: { size: fontSizes.ticks }, color: '#27ae60' }, grid: { drawOnChartArea: false } },
                yCurrent: { type: 'linear', position: 'right', title: { display: true, text: 'Current (A)', font: { size: fontSizes.axisTitle }, color: '#3498db' }, ticks: { font: { size: fontSizes.ticks }, color: '#3498db' }, grid: { drawOnChartArea: false } },
                yVoltage: { type: 'linear', position: 'right', title: { display: true, text: 'Voltage (V)', font: { size: fontSizes.axisTitle }, color: '#9b59b6' }, ticks: { font: { size: fontSizes.ticks }, color: '#9b59b6' }, grid: { drawOnChartArea: false } },
                yEfficiency: { type: 'linear', position: 'right', title: { display: true, text: 'Efficiency (g/W)', font: { size: fontSizes.axisTitle }, color: '#e67e22' }, ticks: { font: { size: fontSizes.ticks }, color: '#e67e22' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

// Step: time vs throttle,RPM,current — time-series with dual axis
function renderStepGraphs(data) {
    const ctx = resetChartCtx();
    const fontSizes = getChartFontSizes();
    const d = prepareDataForRender(data);

    const rpm     = smoothCentered(d.rpm,     11);
    const current = smoothCentered(d.current, 11);
    const voltage = smoothCentered(d.voltage, 11);
    const thrust  = smoothCentered(d.thrust,  11);

    // Calculate efficiency metrics
    const thrustPerWatt = thrust.map((t, i) => {
        const power = voltage[i] * current[i];
        return power > 0 ? t / power : 0; // kg/W
    });
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: d.timestamps,
            datasets: [
                { label: 'Throttle (%)', data: d.throttle, borderColor: '#f39c12', pointRadius: 0, borderWidth: 1, yAxisID: 'yThrottle' },
                { label: 'RPM', data: rpm, borderColor: '#e74c3c', pointRadius: 0, borderWidth: 1, yAxisID: 'yRPM' },
                { label: 'Current (A)', data: current, borderColor: '#3498db', pointRadius: 0, borderWidth: 1, yAxisID: 'yCurrent' },
                { label: 'Voltage (V)', data: voltage, borderColor: '#9b59b6', pointRadius: 0, borderWidth: 1, yAxisID: 'yVoltage' },
                { label: 'Efficiency (g/W)', data: thrustPerWatt, borderColor: '#e67e22', pointRadius: 0, borderWidth: 1, yAxisID: 'yEfficiency' }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { size: fontSizes.legend },
                        boxWidth: fontSizes.boxWidth,
                        boxHeight: fontSizes.boxHeight,
                        padding: fontSizes.padding,
                        textAlign: 'center',
                        usePointStyle: false
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.dataset.label === 'RPM') {
                                label += Math.round(context.parsed.y);
                            } else if (context.dataset.label && context.dataset.label.includes('Throttle')) {
                                label += context.parsed.y.toFixed(2);
                            } else if (context.dataset.label && context.dataset.label.includes('Efficiency')) {
                                label += context.parsed.y.toFixed(3);
                            } else {
                                label += context.parsed.y.toFixed(1);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Time (s)', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks } } },
                yThrottle: { position: 'left', title: { display: true, text: 'Throttle (%)', font: { size: fontSizes.axisTitle }, color: '#f39c12' }, ticks: { color: '#f39c12', font: { size: fontSizes.ticks } } },
                yRPM: { 
                    position: 'right', 
                    title: { display: true, text: 'RPM (×10³)', font: { size: fontSizes.axisTitle }, color: '#e74c3c' }, 
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: '#e74c3c',
                        font: { size: fontSizes.ticks },
                        callback: function(value) {
                            return (value / 1000).toFixed(1);
                        }
                    }
                },
                yCurrent: { position: 'right', title: { display: true, text: 'Current (A)', font: { size: fontSizes.axisTitle }, color: '#3498db' }, ticks: { color: '#3498db', font: { size: fontSizes.ticks } }, grid: { drawOnChartArea: false } },
                yVoltage: { position: 'right', title: { display: true, text: 'Voltage (V)', font: { size: fontSizes.axisTitle }, color: '#9b59b6' }, ticks: { color: '#9b59b6', font: { size: fontSizes.ticks } }, grid: { drawOnChartArea: false } },
                yEfficiency: { position: 'right', title: { display: true, text: 'Efficiency (g/W)', font: { size: fontSizes.axisTitle }, color: '#e67e22' }, ticks: { color: '#e67e22', font: { size: fontSizes.ticks } }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

// Endurance: time-series for temp/voltage/current
function renderEnduranceGraphs(data) {
    const ctx = resetChartCtx();
    const fontSizes = getChartFontSizes();
    const d = prepareDataForRender(data);
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: d.timestamps,
            datasets: [
                { label: 'ESC Temp (°C)',   data: smoothCentered(d.escTemp,   11), borderColor: '#e74c3c', pointRadius: 0, borderWidth: 1 },
                { label: 'Motor Temp (°C)', data: smoothCentered(d.motorTemp, 11), borderColor: '#f39c12', pointRadius: 0, borderWidth: 1 },
                { label: 'Voltage (V)',     data: smoothCentered(d.voltage,   11), borderColor: '#3498db', pointRadius: 0, borderWidth: 1 },
                { label: 'Current (A)',     data: smoothCentered(d.current,   11), borderColor: '#27ae60', pointRadius: 0, borderWidth: 1 }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { size: fontSizes.legend },
                        boxWidth: fontSizes.boxWidth,
                        boxHeight: fontSizes.boxHeight,
                        padding: fontSizes.padding,
                        textAlign: 'center',
                        usePointStyle: false
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += context.parsed.y.toFixed(1);
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Time (s)', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks } } },
                y: { title: { display: true, text: 'Temperature/Voltage/Current', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks } } }
            }
        }
    });
}

// IR: ΔV vs ΔI scatter with linear fit (simple)
// IR: plateau-pair dV vs dI scatter + regression line.
// The old version differentiated consecutive 20 Hz samples (pure noise);
// computation now lives in analysisMath.computeIRFromPulses and runs once
// per test, independent of chart rendering.
function renderIRGraphs(data) {
    const ctx = resetChartCtx();
    const fontSizes = getChartFontSizes();
    const profile = getCurrentActiveProfile() || {};
    const res = (state.analysis.lastResults && state.analysis.lastResults.type === 'ir')
        ? state.analysis.lastResults
        : computeIRFromPulses(data, { cells: profile.batteryCellCount || 0 });

    if (!res.points.length) {
        appendLog('IR: no usable pulse pairs found (increase pulse amplitude)');
        return;
    }
    const datasets = [{
        label: '\u0394V vs \u0394I (per pulse)',
        data: res.points,
        borderColor: 'blue',
        backgroundColor: 'rgba(0,0,255,0.4)',
        pointRadius: 4
    }];
    if (res.fitLine) {
        datasets.push({
            label: 'Linear fit',
            data: res.fitLine,
            type: 'line',
            borderColor: 'red',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
        });
    }
    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: fontSizes.legend }, boxWidth: fontSizes.boxWidth, padding: fontSizes.padding } },
                tooltip: { callbacks: { label: c => `\u0394I=${c.parsed.x.toFixed(2)} A, \u0394V=${c.parsed.y.toFixed(3)} V` } },
                title: res.ohms !== null ? {
                    display: true,
                    text: `R = ${(res.ohms * 1000).toFixed(1)} m\u03a9` + (res.perCell ? ` (${(res.perCell * 1000).toFixed(1)} m\u03a9/cell)` : '') + `  R\u00b2=${res.r2.toFixed(3)}`,
                    font: { size: fontSizes.title + 2 }
                } : undefined
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: '\u0394 Current (A)', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks } } },
                y: { title: { display: true, text: '\u0394 Voltage (V)', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks } } }
            }
        }
    });
}


// KV: RPM vs Voltage scatter (slope = KV)
// KV: RPM vs EFFECTIVE voltage (duty * (V - I*R)) scatter; slope = KV.
// Fitting RPM against raw supply voltage at partial throttle systematically
// underestimates KV by ~1/duty; see analysisMath.computeKV.
function renderKVGraphs(data) {
    const ctx = resetChartCtx();
    const fontSizes = getChartFontSizes();
    const res = (state.analysis.lastResults && state.analysis.lastResults.type === 'kv')
        ? state.analysis.lastResults
        : computeKV({
            meanVoltage: data.meanVoltage || data.voltage || [],
            meanRPM: data.meanRPM || data.rpm || [],
            meanCurrent: data.meanCurrent || [],
            throttlePercent: data.kvThrottle !== undefined ? data.kvThrottle : 100,
            resistance: state.analysis.lastIR || 0
        });
    if (!res.points.length) {
        appendLog('KV: not enough voltage steps collected');
        return;
    }
    const datasets = [{
        label: 'RPM vs effective voltage',
        data: res.points,
        borderColor: 'blue',
        backgroundColor: 'rgba(0,0,255,0.4)',
        pointRadius: 4
    }];
    if (res.fitLine) {
        datasets.push({ label: 'Linear fit', data: res.fitLine, type: 'line', borderColor: 'red', borderWidth: 1.5, pointRadius: 0, fill: false });
    }
    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: fontSizes.legend }, boxWidth: fontSizes.boxWidth, padding: fontSizes.padding } },
                tooltip: { callbacks: { label: c => `V_eff=${c.parsed.x.toFixed(2)} V, ${Math.round(c.parsed.y)} RPM` } },
                title: res.kv !== null ? {
                    display: true,
                    text: `KV = ${res.kv.toFixed(0)} RPM/V  R\u00b2=${res.r2.toFixed(4)}`,
                    font: { size: fontSizes.title + 2 }
                } : undefined
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Effective voltage duty\u00b7(V\u2212I\u00b7R) (V)', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks } } },
                y: { title: { display: true, text: 'RPM', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks } } }
            }
        }
    });
}


// Thermal stress: temps vs time + throttle as overlay axis
function renderThermalGraphs(data) {
    const ctx = resetChartCtx();
    const fontSizes = getChartFontSizes();
    const d = prepareDataForRender(data);
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: d.timestamps,
            datasets: [
                { label: 'ESC Temp (°C)',   data: smoothCentered(d.escTemp,   11), borderColor: '#e74c3c', pointRadius: 0, borderWidth: 1 },
                { label: 'Motor Temp (°C)', data: smoothCentered(d.motorTemp, 11), borderColor: '#f39c12', pointRadius: 0, borderWidth: 1 },
                { label: 'Throttle (%)',    data: d.throttle, borderColor: '#3498db', pointRadius: 0, borderWidth: 1, yAxisID: 'yThrottle' }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { size: fontSizes.legend },
                        boxWidth: fontSizes.boxWidth,
                        boxHeight: fontSizes.boxHeight,
                        padding: fontSizes.padding,
                        textAlign: 'center',
                        usePointStyle: false
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.dataset.label && context.dataset.label.includes('Throttle')) {
                                label += context.parsed.y.toFixed(2);
                            } else {
                                label += context.parsed.y.toFixed(1);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Throttle (%)', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks } } },
                y: { title: { display: true, text: 'Temperature (°C)', font: { size: fontSizes.axisTitle }, color: '#e74c3c' }, ticks: { color: '#e74c3c', font: { size: fontSizes.ticks } } },
                yThrottle: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Throttle (%)', font: { size: fontSizes.axisTitle }, color: '#3498db' }, ticks: { color: '#3498db', font: { size: fontSizes.ticks } } }
            }
        }
    });
}

// Mapping: overlayed multiple sweep traces are part of history; for a single run, use sweep renderer
function renderMappingGraphs(data) {
    const d = prepareDataForRender(data);
    d.rpm     = smoothCentered(d.rpm,     11);
    d.thrust  = smoothCentered(d.thrust,  11);
    d.current = smoothCentered(d.current, 11);
    renderSweepGraphs(d);
}

// Efficiency: dedicated efficiency analysis with power efficiency (kg/W) and grams-per-watt
// Efficiency: aggregated per-step efficiency (g/W, industry convention),
// power, thrust and prop loading vs throttle on a linear axis.
function renderEfficiencyGraphs(data) {
    const ctx = resetChartCtx();
    const fontSizes = getChartFontSizes();
    const agg = aggregateSweepSteps(data);
    if (!agg.throttle.length) { renderStepGraphs(data); return; }
    const toXY = ch => agg.throttle.map((thr, i) => ({ x: thr, y: agg[ch][i] }));
    const mk = (label, ch, color, axis) => ({
        label, data: toXY(ch), borderColor: color, backgroundColor: color,
        showLine: true, pointRadius: 2.5, borderWidth: 1.5, yAxisID: axis, fill: false
    });
    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                mk('Efficiency (g/W)', 'efficiencyGW', '#e67e22', 'yEfficiency'),
                mk('Power (W)', 'power', '#e74c3c', 'yPower'),
                mk('Thrust (kg)', 'thrust', '#27ae60', 'yThrust'),
                mk('g/1000RPM', 'gPer1000RPM', '#9b59b6', 'yThrustPerRPM')
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: fontSizes.legend }, boxWidth: fontSizes.boxWidth, boxHeight: fontSizes.boxHeight, padding: fontSizes.padding } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)} @ ${c.parsed.x.toFixed(1)}%` } }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Throttle (%)', font: { size: fontSizes.axisTitle } }, ticks: { font: { size: fontSizes.ticks } } },
                yEfficiency: { type: 'linear', position: 'left', title: { display: true, text: 'Efficiency (g/W)', font: { size: fontSizes.axisTitle }, color: '#e67e22' }, ticks: { color: '#e67e22', font: { size: fontSizes.ticks } } },
                yPower: { type: 'linear', position: 'right', title: { display: true, text: 'Power (W)', font: { size: fontSizes.axisTitle }, color: '#e74c3c' }, ticks: { color: '#e74c3c', font: { size: fontSizes.ticks } }, grid: { drawOnChartArea: false } },
                yThrust: { type: 'linear', position: 'right', title: { display: true, text: 'Thrust (kg)', font: { size: fontSizes.axisTitle }, color: '#27ae60' }, ticks: { color: '#27ae60', font: { size: fontSizes.ticks } }, grid: { drawOnChartArea: false } },
                yThrustPerRPM: { type: 'linear', position: 'right', title: { display: true, text: 'g/1000RPM', font: { size: fontSizes.axisTitle }, color: '#9b59b6' }, ticks: { color: '#9b59b6', font: { size: fontSizes.ticks } }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

// Dispatcher
function renderGraphs(mode, data) {
    if (!data || !data.timestamps || !data.timestamps.length) {
        appendLog('No data to render');
        return;
    }
    try {
        switch (mode) {
            case 'sweep': renderSweepGraphs(data); break;
            case 'step': renderStepGraphs(data); break;
            case 'endurance': renderEnduranceGraphs(data); break;
            case 'ir': renderIRGraphs(data); break;
            case 'kv': renderKVGraphs(data); break;
            case 'thermal': renderThermalGraphs(data); break;
            case 'mapping': renderMappingGraphs(data); break;
            case 'efficiency': renderEfficiencyGraphs(data); break;
            default: renderStepGraphs(data); break;
        }
    } catch (err) {
        appendLog(`renderGraphs error: ${err.message}`);
    }
}

// -----------------------------------------------------------------------------
// CSV Export utility (same semantics as original)
// -----------------------------------------------------------------------------

function generateCSV(data, meta = null) {
    // NOTE: thrust is stored in kg (telemetry grams / 1000). The previous
    // header said "Thrust (g)" while writing kg values - a 1000x trap for
    // anyone post-processing the export.
    const headers = ['Time (s)', 'Throttle (%)', 'Voltage (V)', 'Current (A)', 'Power (W)', 'RPM', 'Thrust (kg)', 'ESC Temp (°C)', 'Motor Temp (°C)'];
    const rows = [];
    if (meta) {
        rows.push([`# mode: ${meta.mode || ''}`]);
        rows.push([`# date: ${meta.timestamp ? new Date(meta.timestamp).toISOString() : ''}`]);
        if (meta.profile) {
            const pr = meta.profile;
            rows.push([`# profile: ${pr.profileName || ''} | motor ${pr.motorKV || '?'}KV ${pr.motorPoles || '?'}P | prop ${pr.propDiameter || '?'}x${pr.propPitch || '?'} ${pr.propBlades || '?'}B | battery ${pr.batteryCellCount || '?'}S`]);
        }
        if (meta.params) rows.push([`# params: ${Object.entries(meta.params).map(([k, v]) => `${k}=${v}`).join(' ')}`.replace(/,/g, ';')]);
        if (meta.results && meta.results.type === 'ir' && meta.results.ohms !== null) rows.push([`# result: IR=${(meta.results.ohms * 1000).toFixed(2)} mOhm R2=${meta.results.r2.toFixed(4)}`]);
        if (meta.results && meta.results.type === 'kv' && meta.results.kv !== null) rows.push([`# result: KV=${meta.results.kv.toFixed(1)} RPM/V R2=${meta.results.r2.toFixed(4)}`]);
    }
    rows.push(headers);
    for (let i = 0; i < data.timestamps.length; i++) {
        rows.push([
            (data.timestamps[i]).toFixed(2),
            data.throttle[i],
            data.voltage[i],
            data.current[i],
            data.power[i],
            data.rpm[i],
            data.thrust[i],
            data.escTemp[i],
            data.motorTemp[i]
        ]);
    }
    return rows.map(r => r.join(',')).join('\n');
}

function generateJSON(run) {
    // Self-describing export: data + profile + params + computed results.
    return JSON.stringify({
        format: 'uavmlab-run-v1',
        mode: run.mode,
        timestamp: run.timestamp,
        date: new Date(run.timestamp).toISOString(),
        profile: run.profile || null,
        params: run.params || null,
        results: run.results || null,
        units: { thrust: 'kg', voltage: 'V', current: 'A', power: 'W', temp: 'degC', time: 's' },
        data: run.data
    }, null, 1);
}

function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// Mode descriptions & parameter schemas (keeps original detailed descriptions)
// -----------------------------------------------------------------------------

function getModeDescription(mode) {
    const descriptions = {
        sweep: {
            title: 'Static Throttle Sweep',
            purpose: 'Gradually increases throttle from minimum to maximum while measuring motor performance at each step. Useful for characterizing motor efficiency, power consumption, and thermal behavior across the full operating range.',
            parameters: '<ul><li><strong>Start Throttle:</strong> Initial throttle percentage (typically 10-20%)</li><li><strong>End Throttle:</strong> Final throttle percentage (typically 80-100%)</li><li><strong>Step Size:</strong> Throttle increment between measurements</li><li><strong>Dwell:</strong> Time in seconds to hold each throttle step</li><li><strong>Ramp Rate:</strong> Speed of throttle changes between steps</li><li><strong>Repeats:</strong> Number of times to repeat the sweep</li></ul>',
            howItWorks: 'The motor ramps to each throttle level, holds steady while collecting telemetry data, then moves to the next level. This creates a comprehensive performance profile.',
            graphAnalysis: 'Use throttle vs RPM/thrust/current scatter/line and RPM vs Voltage curves. Look for linear relations and anomalies.'
        },
        step: {
            title: 'Step Response Test',
            purpose: 'Tests motor acceleration and response time by making sudden throttle changes. Critical for understanding system dynamics, ESC response, and motor/propeller inertia.',
            parameters: '<ul><li><strong>Low Throttle:</strong> Starting throttle level</li><li><strong>High Throttle:</strong> Target throttle level</li><li><strong>On Duration:</strong> How long to hold the high throttle</li><li><strong>Off Duration:</strong> How long to hold the low throttle</li><li><strong>Cycles:</strong> Number of step cycles to perform</li><li><strong>Ramp Rate:</strong> Speed of throttle transitions</li></ul>',
            howItWorks: 'Motor starts at low throttle, then jumps to high throttle and holds for the specified duration before returning to low. This cycle repeats.',
            graphAnalysis: 'Plot RPM and current vs time with throttle overlay. Compute dRPM/dt to assess responsiveness.'
        },
        endurance: {
            title: 'Fixed Throttle Endurance',
            purpose: 'Runs motor at constant throttle for extended periods to test thermal performance, battery capacity, and long-term stability.',
            parameters: '<ul><li><strong>Throttle Level:</strong> Constant throttle percentage to maintain</li><li><strong>Duration:</strong> Test duration in minutes</li><li><strong>Cooldown:</strong> Cooldown period in minutes after test</li></ul>',
            howItWorks: 'Motor runs continuously at the specified throttle level while monitoring temperatures, voltage sag, and current draw over time.',
            graphAnalysis: 'Use time-series for temperature and voltage; fit thermal stabilization if required.'
        },
        ir: {
            title: 'Battery IR (Internal Resistance)',
            purpose: 'Measures battery internal resistance by applying current steps and measuring voltage drops.',
            parameters: '<ul><li><strong>Baseline:</strong> Starting throttle level</li><li><strong>Pulse Amplitude:</strong> Additional throttle for current pulse</li><li><strong>On Duration:</strong> Duration of current pulse</li><li><strong>Off Duration:</strong> Rest period between pulses</li><li><strong>Pulses:</strong> Number of current pulses to apply</li></ul>',
            howItWorks: 'Applies current pulses and measures ΔV/ΔI. Slope gives internal resistance.',
            graphAnalysis: 'Plot ΔV vs ΔI and compute linear regression slope.'
        },
        kv: {
            title: 'KV Estimation',
            purpose: 'Estimates motor KV (RPM per volt) by measuring RPM at different supply voltages or throttle points (if voltage is varied).',
            parameters: '<ul><li><strong>Low:</strong> Minimum throttle level</li><li><strong>High:</strong> Maximum throttle level</li><li><strong>Step Size:</strong> Throttle increment between measurements</li><li><strong>Dwell:</strong> Stabilization time at each throttle level</li><li><strong>Current Ceiling:</strong> Maximum allowed current draw</li></ul>',
            howItWorks: 'Collect RPM and voltage at stable points; slope of RPM vs Voltage is KV.',
            graphAnalysis: 'Scatter RPM vs Voltage; compute slope.'
        },
        thermal: {
            title: 'ESC Thermal Stress Test',
            purpose: 'Tests ESC thermal management by alternating between high and low throttle periods.',
            parameters: '<ul><li><strong>Segment 1 Throttle:</strong> First throttle level</li><li><strong>Segment 1 Duration:</strong> Time at first throttle</li><li><strong>Segment 2 Throttle:</strong> Second throttle level</li><li><strong>Segment 2 Duration:</strong> Time at second throttle</li></ul>',
            howItWorks: 'Alternates between two throttle levels creating thermal cycles to stress ESC thermal management.',
            graphAnalysis: 'Plot ESC & motor temps vs time and monitor rise/decay behaviour and thermal throttling.'
        },
        mapping: {
            title: 'Prop/Motor Mapping',
            purpose: 'Creates comprehensive performance characterization maps for motor and propeller combinations. Essential for comparing different propellers, validating motor specifications, and building performance databases for drone/aircraft design.',
            parameters: '<ul><li><strong>Repeats:</strong> Number of complete sweep cycles (typically 3-5 for statistical averaging)</li><li><strong>Ambient Temp:</strong> Initial temperature in °C (important for thermal correction and repeatability)</li><li><strong>Notes:</strong> Record test conditions, propeller specs (diameter, pitch, material), motor model, voltage, and any other relevant setup details</li></ul>',
            howItWorks: 'Executes multiple identical throttle sweeps from low to high throttle, allowing the system to cool between runs. Each sweep collects comprehensive telemetry including RPM, thrust, current, voltage, and temperatures. Multiple runs enable statistical analysis and reveal performance consistency. Data can be averaged to remove noise and identify reliable operating characteristics.',
            graphAnalysis: 'Graph overlays multiple sweep traces showing RPM, thrust, and current vs throttle. Analyze trace repeatability to assess measurement quality - tight clustering indicates good data. Compare peak values across runs to check for thermal throttling or battery sag. Use this data to create performance lookup tables (thrust vs throttle, power vs RPM) for flight controller tuning. Export CSV data for further analysis in spreadsheet tools or Python/MATLAB for curve fitting and generating motor constants (Kv, Kt, Io, Rm). Ideal for propeller selection by comparing efficiency curves of different props on the same motor.'
        },
        efficiency: {
            title: 'Efficiency Analysis',
            purpose: 'Analyzes motor and propeller efficiency by measuring thrust output per watt of electrical power consumed. Identifies the most efficient operating points for your motor/propeller combination.',
            parameters: '<ul><li><strong>Start Throttle:</strong> Initial throttle percentage (typically 10-20%)</li><li><strong>End Throttle:</strong> Final throttle percentage (typically 80-100%)</li><li><strong>Step Size:</strong> Throttle increment between measurements</li><li><strong>Dwell:</strong> Time in seconds to stabilize at each throttle step</li><li><strong>Ramp Rate:</strong> Speed of throttle changes between steps</li></ul>',
            howItWorks: 'Performs a throttle sweep while calculating real-time efficiency metrics: thrust-to-power ratio (g/W), power consumption (W), and propeller loading (g/1000RPM). Each metric helps identify optimal operating ranges.',
            graphAnalysis: 'Primary graph shows Efficiency (g/W) on left axis vs throttle. Higher values indicate more efficient operation. Additional metrics include Power (W) for total consumption, Thrust (kg) for reference, and g/1000RPM for propeller efficiency. Look for peak efficiency points - typically found at mid-throttle ranges. Compare different propellers to find the most efficient setup for your application.'
        }
    };
    return descriptions[mode] || {
        title: 'Unknown Mode',
        purpose: 'Mode not documented',
        parameters: 'N/A',
        howItWorks: 'N/A',
        graphAnalysis: 'N/A'
    };
}

function updateModeDescription(mode) {
    const desc = getModeDescription(mode);
    const contentEl = document.getElementById('modeDescriptionContent');
    if (!contentEl) return;
    if (!mode) {
        contentEl.innerHTML = `<h3>Select a Mode</h3><p>Choose a mode to view details.</p>`;
        return;
    }
    contentEl.innerHTML = `
        <h3>${desc.title}</h3>
        <p>${desc.purpose}</p>
        <div>
            <h4>Parameters:</h4>
            ${desc.parameters}
            <h4>How it works:</h4>
            <p>${desc.howItWorks}</p>
            <h4>Graph Analysis:</h4>
            <p>${desc.graphAnalysis}</p>
        </div>
    `;
}

// -----------------------------------------------------------------------------
// Params schema & UI generation (keeps original fields)
// -----------------------------------------------------------------------------

const modeParamsSchema = {
    sweep: [
        { key: 'startThrottle', label: 'Start Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 0 },
        { key: 'endThrottle', label: 'End Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 100 },
        { key: 'stepSize', label: 'Step Size (%)', type: 'number', min: 0.5, max: 20, step: 0.5, value: 5 },
        { key: 'dwell', label: 'Dwell per Step (s)', type: 'number', min: 0.5, max: 60, step: 0.5, value: 3 },
        { key: 'rampRate', label: 'Ramp Rate (%/s)', type: 'number', min: 1, max: 100, step: 1, value: 20 },
        { key: 'repeats', label: 'Repeats', type: 'number', min: 1, max: 10, step: 1, value: 1 }
    ],
    step: [
        { key: 'lowThrottle', label: 'Low Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 10 },
        { key: 'highThrottle', label: 'High Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 60 },
        { key: 'onDuration', label: 'On Duration (s)', type: 'number', min: 0.2, max: 30, step: 0.2, value: 3 },
        { key: 'offDuration', label: 'Off Duration (s)', type: 'number', min: 0.2, max: 30, step: 0.2, value: 3 },
        { key: 'cycles', label: 'Cycles', type: 'number', min: 1, max: 50, step: 1, value: 5 },
        { key: 'instantStep', label: 'Instant step (recommended for response measurement)', type: 'checkbox', value: 1 },
        { key: 'rampRate', label: 'Ramp Rate if not instant (%/s)', type: 'number', min: 1, max: 100, step: 1, value: 100 }
    ],
    endurance: [
        { key: 'throttle', label: 'Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 50 },
        { key: 'duration', label: 'Duration (min)', type: 'number', min: 1, max: 180, step: 1, value: 10 },
        { key: 'cooldown', label: 'Cooldown (min)', type: 'number', min: 0, max: 60, step: 1, value: 2 }
    ],
    ir: [
        { key: 'baseline', label: 'Baseline Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 10 },
        { key: 'pulseAmplitude', label: 'Pulse Amplitude (%)', type: 'number', min: 1, max: 50, step: 0.5, value: 10 },
        { key: 'onDuration', label: 'Pulse On (s)', type: 'number', min: 0.2, max: 10, step: 0.2, value: 1 },
        { key: 'offDuration', label: 'Pulse Off (s)', type: 'number', min: 0.2, max: 10, step: 0.2, value: 1 },
        { key: 'pulses', label: 'Pulses', type: 'number', min: 1, max: 50, step: 1, value: 10 }
    ],
    kv: [
        { key: 'throttle', label: 'Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 20 },
        { key: 'voltageSteps', label: 'Voltage Steps', type: 'number', min: 2, max: 10, step: 1, value: 5 },
        { key: 'dwell', label: 'Dwell per Step (s)', type: 'number', min: 0.5, max: 30, step: 0.5, value: 2 },
        { key: 'currentCeiling', label: 'Current Ceiling (A)', type: 'number', min: 0.5, max: 100, step: 0.5, value: 10 }
    ],
    thermal: [
        { key: 'segment1Throttle', label: 'Segment 1 Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 70 },
        { key: 'segment1Duration', label: 'Segment 1 Duration (s)', type: 'number', min: 5, max: 600, step: 1, value: 120 },
        { key: 'segment2Throttle', label: 'Segment 2 Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 90 },
        { key: 'segment2Duration', label: 'Segment 2 Duration (s)', type: 'number', min: 5, max: 600, step: 1, value: 30 }
    ],
    mapping: [
        { key: 'repeats', label: 'Repeats', type: 'number', min: 1, max: 10, step: 1, value: 3 },
        { key: 'startThrottle', label: 'Start Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 10 },
        { key: 'endThrottle', label: 'End Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 80 },
        { key: 'stepSize', label: 'Step Size (%)', type: 'number', min: 0.5, max: 20, step: 0.5, value: 10 },
        { key: 'dwell', label: 'Dwell per Step (s)', type: 'number', min: 0.5, max: 60, step: 0.5, value: 2 },
        { key: 'cooldownBetween', label: 'Cooldown Between Runs (s)', type: 'number', min: 0, max: 600, step: 5, value: 30 },
        { key: 'ambientTemp', label: 'Ambient Temp (°C)', type: 'number', min: -20, max: 50, step: 1, value: 25 },
        { key: 'notes', label: 'Notes', type: 'text', value: '' }
    ],
    // Previously missing: the Efficiency mode silently ran with hardcoded
    // defaults because renderParamsUI found no schema for it.
    efficiency: [
        { key: 'startThrottle', label: 'Start Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 10 },
        { key: 'endThrottle', label: 'End Throttle (%)', type: 'number', min: 0, max: 100, step: 0.5, value: 100 },
        { key: 'stepSize', label: 'Step Size (%)', type: 'number', min: 0.5, max: 20, step: 0.5, value: 5 },
        { key: 'dwell', label: 'Dwell per Step (s)', type: 'number', min: 0.5, max: 60, step: 0.5, value: 3 },
        { key: 'rampRate', label: 'Ramp Rate (%/s)', type: 'number', min: 1, max: 100, step: 1, value: 20 }
    ]
};

function renderParamsUI(mode) {
    const paramsContainer = document.getElementById('analize-params-card');
    if (!paramsContainer) return;

    const schema = modeParamsSchema[mode] || [];
    const profile = getCurrentActiveProfile();
    const armRaw = profile ? profile.armThrottle : DEFAULT_ARM_THROTTLE;
    const minThrottlePercent = Math.round(((armRaw - 48) / (2047 - 48)) * 100 * 10) / 10;

    paramsContainer.innerHTML = schema.map(field => {
        let min = field.min;
        let value = field.value;
        // enforce throttle min based on arm threshold
        if (field.key.toLowerCase().includes('throttle') || field.label.includes('Throttle (%)') || field.key === 'baseline') {
            min = Math.max(min || 0, minThrottlePercent);
            value = Math.max(value, minThrottlePercent);
        }
        if (field.type === 'checkbox') {
            const checked = value ? 'checked' : '';
            return `<div class="param-field"><label for="param-${field.key}">${field.label}</label><input id="param-${field.key}" name="${field.key}" type="checkbox" ${checked}></div>`;
        }
        const attrs = [
            `id="param-${field.key}"`,
            `name="${field.key}"`,
            field.type === 'number' ? `type="number" step="${field.step || 1}"` : `type="${field.type === 'text' ? 'text' : 'number'}"`,
            min !== undefined ? `min="${min}"` : '',
            field.max !== undefined ? `max="${field.max}"` : '',
            `value="${value}"`
        ].join(' ');
        return `<div class="param-field"><label for="param-${field.key}">${field.label}</label><input ${attrs}></div>`;
    }).join('');
}

// Read params from UI
function getCurrentParamsFromUI() {
    const container = document.getElementById('analize-params-card');
    if (!container) return {};
    const inputs = container.querySelectorAll('input');
    const params = {};
    inputs.forEach(i => {
        const key = i.name;
        if (!key) return;
        if (i.type === 'checkbox') params[key] = i.checked ? 1 : 0;
        else if (i.type === 'number') params[key] = parseFloat(i.value);
        else params[key] = i.value;
    });
    return params;
}

// -----------------------------------------------------------------------------
// UI Enable/Disable logic (keeps original behavior but slightly cleaned)
// -----------------------------------------------------------------------------

function updateAnalizeControlsEnabled(updateMessage = true) {
    const modeSelect = document.getElementById('analizeModeSelect');
    const startBtn = document.getElementById('analizeStartButton');
    const stopBtn = document.getElementById('analizeStopButton');
    const paramsContainer = document.getElementById('analize-params-card');
    const analizeCard = document.getElementById('analizeCard');
    const telemetryCard = document.getElementById('telemetryCard');

    const connected = !!state.connected;
    const statusMsg = state.lastRxStatus || {};
    const statusBits = statusMsg.status !== undefined ? statusMsg.status : 0;
    const armed = isArmedFromStatus(statusBits);

    console.log('[AnalizeTab] statusBits:', statusBits, 'armed:', armed, 'connected:', connected);

    if (analizeCard) {
        if (!connected) analizeCard.classList.add('disabled-card');
        else analizeCard.classList.remove('disabled-card');
    }

    const enable = connected && armed;
    const canModify = enable && !state.analysis.running && !state.analysis.stopping;

    if (modeSelect) modeSelect.disabled = !canModify;
    if (startBtn) startBtn.disabled = !canModify;
    if (stopBtn) stopBtn.disabled = !state.analysis.running || state.analysis.stopping;

    if (paramsContainer) {
        const paramInputs = paramsContainer.querySelectorAll('input, select, textarea');
        paramInputs.forEach(input => input.disabled = !canModify);
    }

    if (telemetryCard) {
        if (!connected) telemetryCard.classList.add('disabled-card');
        else telemetryCard.classList.remove('disabled-card');
    }

    if (updateMessage) {
        if (!connected) {
            const statusEl = document.getElementById('analizeStatus');
            if (statusEl) {
                statusEl.textContent = 'Connect to device and arm the motor to enable analyze';
                statusEl.style.color = '#6c757d';
            }
        } else if (state.analysis.stopping) {
            setAnalizeStatusMessage('Stopping analyze...', 'warn');
        } else if (!armed) {
            setAnalizeStatusMessage('⚠️ Motor is not armed. Please arm in Control tab.', 'warn');
        } else if (state.analysis.running && state.analysis.mode) {
            setAnalizeStatusMessage(`${state.analysis.mode} analyze is running`, 'info');
        } else {
            setAnalizeStatusMessage('State: ready', 'info');
        }
    }
}

// -----------------------------------------------------------------------------
// Initialization: attach handlers and wire UI (preserves original features)
// -----------------------------------------------------------------------------

export function initAnalizeTab() {
    console.log('[AnalizeTab] initAnalizeTab called (refactored B)');

    // Load history if exists
    try {
        const savedHistory = localStorage.getItem('analyzeHistory');
        if (savedHistory) state.analysis.history = JSON.parse(savedHistory);
    } catch (e) { state.analysis.history = []; }

    // Elements
    const modeSelect = document.getElementById('analizeModeSelect');
    const startBtn = document.getElementById('analizeStartButton');
    const stopBtn = document.getElementById('analizeStopButton');
    const paramsContainer = document.getElementById('analize-params-card');
    const modeHint = document.getElementById('analizeModeHint');
    const exportBtn = document.getElementById('exportDataButton');
    const fullscreenBtn = document.getElementById('fullscreenGraphButton');
    const graphMetricSelect = document.getElementById('graphMetricSelect');
    const descriptionModeSelect = document.getElementById('descriptionModeSelect');

    // Initial UI population
    const initialMode = modeSelect ? modeSelect.value : 'sweep';
    renderParamsUI(initialMode);
    updateModeDescription(initialMode);
    updateAnalizeControlsEnabled();

    // Global hook
    window.updateAnalizeStatusUI = updateAnalizeControlsEnabled;

    // Mode change -> render params & description
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            const m = modeSelect.value;
            renderParamsUI(m);
            updateModeDescription(m);
            if (modeHint) modeHint.textContent = `Configuring: ${m}`;
        });
    }

    // Start button
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            const mode = modeSelect ? modeSelect.value : 'sweep';
            const params = getCurrentParamsFromUI();
            await startAnalyze(mode, params);
        });
    }

    // Stop button
    if (stopBtn) {
        stopBtn.addEventListener('click', async () => {
            await stopAnalyze();
        });
    }

    // Export CSV -- last run in history
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            // Export chart as PDF with title and footer
            const hist = state.analysis.history || [];
            if (!hist.length) return;
            const lastRun = hist[hist.length - 1];
            const chartCanvas = document.getElementById('analyzeChart');
            if (!chartCanvas) return;
            // Get chart image
            const imgData = chartCanvas.toDataURL('image/png');
            // Gather motor/profile details from lastRun.profile
            const profile = lastRun.profile || {};
            const motorKV = profile.motorKV ? profile.motorKV : '--';
            const propDiam = profile.propDiameter ? profile.propDiameter : '--';
            const propPitch = profile.propPitch ? profile.propPitch : '--';
            const propBlade = profile.propBlades ? profile.propBlades : '--';
            const motorTitle = `Motor KV: ${motorKV} | Prop: ${propDiam}x${propPitch}x${propBlade}`;
            // Gather mode and params
            const mode = lastRun.mode;
            const params = lastRun.params || {};
            let paramText = Object.entries(params).map(([k,v]) => `${k}: ${v}`).join(', ');
            if (!paramText) paramText = '(no parameters)';
            // Profile details
            let profileText = '';
            if (profile && profile.profileName) {
                profileText = `Profile: ${profile.profileName}`;
            }

            // Battery voltage and analysis metrics
            const data = lastRun.data || {};
            const voltageArr = Array.isArray(data.voltage) ? data.voltage : [];
            const currentArr = Array.isArray(data.current) ? data.current : [];
            const timestampsArr = Array.isArray(data.timestamps) ? data.timestamps : [];
            const batteryVoltage = voltageArr.length ? voltageArr[0].toFixed(2) : '--';
            const voltageDrop = (voltageArr.length > 1) ? (voltageArr[0] - voltageArr[voltageArr.length-1]).toFixed(2) : '--';

            // Consumed power (Wh): sum(current * voltage * dt) / 3600
            let consumedPower = 0;
            if (voltageArr.length > 1 && currentArr.length === voltageArr.length && timestampsArr.length === voltageArr.length) {
                for (let i = 1; i < voltageArr.length; i++) {
                    const dt = timestampsArr[i] - timestampsArr[i-1];
                    consumedPower += voltageArr[i] * currentArr[i] * dt;
                }
                consumedPower = (consumedPower / 3600).toFixed(3); // Wh
            } else {
                consumedPower = '--';
            }

            // Footer text
            const footerText = `Battery Voltage: ${batteryVoltage} V | Voltage Drop: ${voltageDrop} V | Consumed Power: ${consumedPower} Wh`;

            // Create PDF
            const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'px', format: [chartCanvas.width+40, chartCanvas.height+140] });
            pdf.setFontSize(18);
            pdf.text(motorTitle, 20, 32);
            pdf.addImage(imgData, 'PNG', 20, 50, chartCanvas.width, chartCanvas.height);
            pdf.setFontSize(12);
            pdf.text(profileText, 20, chartCanvas.height + 70);
            pdf.text(`Mode: ${mode}`, 20, chartCanvas.height + 90);
            pdf.text(`Parameters: ${paramText}`, 20, chartCanvas.height + 110);
            pdf.text(footerText, 20, chartCanvas.height + 130);
            const filename = `analyze_${mode}_${new Date(lastRun.timestamp).toISOString().slice(0,19).replace(/:/g,'-')}.pdf`;
            pdf.save(filename);
        });
    }

    // CSV / JSON export buttons (created next to the PDF export button).
    // CSV now carries metadata header lines and the corrected Thrust (kg) unit;
    // JSON is a self-describing export with profile, params and computed results.
    if (exportBtn && !document.getElementById('exportCsvButton')) {
        const mkBtn = (id, text) => {
            const b = document.createElement('button');
            b.id = id;
            b.textContent = text;
            b.className = exportBtn.className;
            b.style.marginLeft = '6px';
            exportBtn.insertAdjacentElement('afterend', b);
            return b;
        };
        const jsonBtn = mkBtn('exportJsonButton', 'JSON');
        const csvBtn = mkBtn('exportCsvButton', 'CSV');
        const lastRunOrNull = () => {
            const hist = state.analysis.history || [];
            return hist.length ? hist[hist.length - 1] : null;
        };
        csvBtn.addEventListener('click', () => {
            const run = lastRunOrNull();
            if (!run) return;
            const csv = generateCSV(run.data, run);
            downloadBlob(csv, `analyze_${run.mode}_${new Date(run.timestamp).toISOString().slice(0, 19).replace(/:/g, '-')}.csv`, 'text/csv');
        });
        jsonBtn.addEventListener('click', () => {
            const run = lastRunOrNull();
            if (!run) return;
            downloadBlob(generateJSON(run), `analyze_${run.mode}_${new Date(run.timestamp).toISOString().slice(0, 19).replace(/:/g, '-')}.json`, 'application/json');
        });
    }

    // Run comparison selector (propeller A vs B etc.)
    refreshCompareSelect();

    // Fullscreen toggle for chart container
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            const chartContainer = document.getElementById('analyzeChartContainer');
            if (!chartContainer) return;
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                chartContainer.requestFullscreen();
            }
        });
    }

    // Metric select re-render using last history
    if (graphMetricSelect) {
        graphMetricSelect.addEventListener('change', () => {
            const hist = state.analysis.history || [];
            if (!hist.length) return;
            const last = hist[hist.length - 1];
            renderGraphs(last.mode, last.data);
            renderResultsSummary(last.mode, last.results);
        });
    }

    // Mode description switcher (independent select)
    if (descriptionModeSelect) {
        descriptionModeSelect.addEventListener('change', () => {
            const selected = descriptionModeSelect.value;
            updateModeDescription(selected);
        });
    }

    // Expose on-open hook for tab refresh
    window.onAnalizeTabOpen = function() {
        updateAnalizeControlsEnabled();
        // refresh params in case profile changed
        const m = (modeSelect && modeSelect.value) || 'sweep';
        renderParamsUI(m);
        updateModeDescription('');
    };

    // UI refresh hook for telemetry updates
    window.updateAnalizeStatusUI = function(options = {}) {
        const { error, warn } = options;
        if (error) {
            state.analysis.lastError = error;
            setAnalizeStatusMessage(`Error: ${error}`, 'error');
        } else if (warn) {
            setAnalizeStatusMessage(`Warn: ${warn}`, 'warn');
        } else {
            updateAnalizeControlsEnabled();
        }
    };
}






