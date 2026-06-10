// analysisMath.js
// Pure, DOM-free analysis functions for the UAV Motor Lab.
// All functions operate on the run data object:
//   { timestamps[], throttle[], voltage[], current[], power[], rpm[], thrust[], escTemp[], motorTemp[] }
// thrust is stored in kg, timestamps in seconds.
// This module has no imports so it can be unit-tested in Node.

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

export function linearRegression(points) {
    const n = points.length;
    if (n < 2) return null;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of points) {
        sumX += p.x; sumY += p.y;
        sumXY += p.x * p.y; sumXX += p.x * p.x;
    }
    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    let ssTot = 0, ssRes = 0;
    const meanY = sumY / n;
    for (const p of points) {
        const yFit = slope * p.x + intercept;
        ssRes += (p.y - yFit) ** 2;
        ssTot += (p.y - meanY) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
    return { slope, intercept, r2 };
}

export function mean(arr) {
    if (!arr || !arr.length) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function std(arr) {
    if (!arr || arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

// Centered smoothing (non-causal, minimal lag)
export function smoothCentered(arr, windowSize = 11) {
    if (!arr || arr.length === 0) return [];
    const half = Math.floor(windowSize / 2);
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - half);
        const end = Math.min(arr.length - 1, i + half);
        let sum = 0;
        for (let j = start; j <= end; j++) sum += arr[j];
        out[i] = sum / (end - start + 1);
    }
    return out;
}

// Bin-averaging decimation (acts as anti-aliasing low-pass)
export function decimateForDisplay(arr, maxPts) {
    if (!arr || arr.length <= maxPts) return arr ? arr.slice() : arr;
    const n = arr.length;
    const out = new Array(maxPts);
    for (let i = 0; i < maxPts; i++) {
        const start = Math.floor(i * n / maxPts);
        const end = Math.floor((i + 1) * n / maxPts);
        let sum = 0;
        for (let j = start; j < end; j++) sum += arr[j];
        out[i] = sum / (end - start);
    }
    return out;
}

const RUN_CHANNELS = ['timestamps', 'throttle', 'voltage', 'current', 'power', 'rpm', 'thrust', 'escTemp', 'motorTemp'];

// Decimate a full run object for persistent storage (localStorage quota safety).
export function decimateRunForStorage(data, maxPts = 600) {
    if (!data || !data.timestamps) return data;
    const n = data.timestamps.length;
    const out = {};
    for (const k of RUN_CHANNELS) {
        if (Array.isArray(data[k])) out[k] = n > maxPts ? decimateForDisplay(data[k], maxPts) : data[k].slice();
    }
    // Preserve KV-mode aggregates and end marker (rescaled)
    if (data.meanVoltage) out.meanVoltage = data.meanVoltage.slice();
    if (data.meanRPM) out.meanRPM = data.meanRPM.slice();
    if (data.meanCurrent) out.meanCurrent = data.meanCurrent.slice();
    if (data.kvThrottle !== undefined) out.kvThrottle = data.kvThrottle;
    if (data._endIndex != null) {
        out._endIndex = n > maxPts ? Math.round(data._endIndex * maxPts / n) : data._endIndex;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Plateau segmentation
// ---------------------------------------------------------------------------
// Splits a run into constant-throttle segments using the recorded throttle
// channel. Returns [{throttle, startIdx, endIdx}] (endIdx exclusive).
export function segmentByThrottle(data, throttleTolerance = 0.6, minSamples = 4) {
    const segs = [];
    const thr = data.throttle || [];
    const endIdx = (data._endIndex != null) ? data._endIndex : thr.length;
    let segStart = 0;
    for (let i = 1; i <= endIdx; i++) {
        if (i === endIdx || Math.abs(thr[i] - thr[segStart]) > throttleTolerance) {
            if (i - segStart >= minSamples) {
                segs.push({ throttle: thr[segStart], startIdx: segStart, endIdx: i });
            }
            segStart = i;
        }
    }
    return segs;
}

// ---------------------------------------------------------------------------
// Sweep aggregation: steady-state mean +/- std per throttle step
// ---------------------------------------------------------------------------
// settleFraction: fraction of each plateau discarded as transient (default 40%).
// Returns arrays aligned per step, with efficiency in g/W (industry convention).
export function aggregateSweepSteps(data, { settleFraction = 0.4, minSamples = 4, minDurationS = 1.0 } = {}) {
    let segs = segmentByThrottle(data, 0.6, minSamples);
    // Reject short pseudo-plateaus produced by the throttle ramp between steps:
    // a real measurement step lasts ~dwell seconds, ramp fragments last ~0.1-0.3 s.
    const t = data.timestamps || [];
    segs = segs.filter(s => (t[s.endIdx - 1] - t[s.startIdx]) >= minDurationS);
    const out = {
        throttle: [], rpm: [], thrust: [], current: [], voltage: [], power: [],
        rpmStd: [], thrustStd: [], currentStd: [], efficiencyGW: [], gPer1000RPM: []
    };
    for (const seg of segs) {
        const from = seg.startIdx + Math.floor((seg.endIdx - seg.startIdx) * settleFraction);
        const to = seg.endIdx;
        if (to - from < 2) continue;
        const slice = ch => (data[ch] || []).slice(from, to);
        const v = mean(slice('voltage'));
        const i = mean(slice('current'));
        const r = mean(slice('rpm'));
        const tKg = mean(slice('thrust'));
        const p = v * i;
        out.throttle.push(seg.throttle);
        out.voltage.push(v);
        out.current.push(i);
        out.rpm.push(r);
        out.thrust.push(tKg);
        out.power.push(p);
        out.rpmStd.push(std(slice('rpm')));
        out.thrustStd.push(std(slice('thrust')));
        out.currentStd.push(std(slice('current')));
        out.efficiencyGW.push(p > 0 ? (tKg * 1000) / p : 0); // g/W
        out.gPer1000RPM.push(r > 0 ? (tKg * 1000) / (r / 1000) : 0);
    }
    return out;
}

export function findPeakEfficiency(agg) {
    if (!agg || !agg.efficiencyGW || !agg.efficiencyGW.length) return null;
    let best = 0;
    for (let i = 1; i < agg.efficiencyGW.length; i++) {
        if (agg.efficiencyGW[i] > agg.efficiencyGW[best]) best = i;
    }
    return {
        throttle: agg.throttle[best],
        gPerW: agg.efficiencyGW[best],
        thrustKg: agg.thrust[best],
        powerW: agg.power[best]
    };
}

// ---------------------------------------------------------------------------
// Battery internal resistance from current pulses (plateau-pair method)
// ---------------------------------------------------------------------------
// Instead of differentiating consecutive 20 Hz samples (noise!), this:
// 1. Segments the run into constant-throttle plateaus (baseline / pulse).
// 2. Averages V and I over the settled part of each plateau.
// 3. Forms one (dI, dV) point per adjacent low->high plateau pair.
// 4. Linear regression slope = pack resistance (Ohms).
export function computeIRFromPulses(data, { settleFraction = 0.3, cells = 0 } = {}) {
    const segs = segmentByThrottle(data, 0.6, 3);
    const plateaus = segs.map(seg => {
        const from = seg.startIdx + Math.floor((seg.endIdx - seg.startIdx) * settleFraction);
        const to = seg.endIdx;
        return {
            throttle: seg.throttle,
            v: mean((data.voltage || []).slice(from, to)),
            i: mean((data.current || []).slice(from, to))
        };
    });
    const points = [];
    for (let k = 1; k < plateaus.length; k++) {
        const a = plateaus[k - 1], b = plateaus[k];
        const dI = b.i - a.i;
        const dV = a.v - b.v; // voltage drop is positive when current rises
        // dV = R * dI holds for both rising and falling steps; keep signed values
        if (Math.abs(dI) > 0.2) points.push({ x: dI, y: dV });
    }
    if (points.length < 2) return { ohms: null, r2: null, points, fitLine: null, perCell: null };
    const fit = linearRegression(points);
    if (!fit) return { ohms: null, r2: null, points, fitLine: null, perCell: null };
    const xs = points.map(p => p.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    return {
        ohms: fit.slope,
        intercept: fit.intercept,
        r2: fit.r2,
        points,
        fitLine: [
            { x: minX, y: fit.slope * minX + fit.intercept },
            { x: maxX, y: fit.slope * maxX + fit.intercept }
        ],
        perCell: cells > 0 ? fit.slope / cells : null
    };
}

// ---------------------------------------------------------------------------
// KV estimation with duty and IR correction
// ---------------------------------------------------------------------------
// At fixed throttle the motor sees roughly  V_eff = duty * (V_bat - I * R_pack),
// not the supply voltage. Fitting RPM against V_eff removes the systematic
// underestimate of the old RPM-vs-supply-voltage method.
// Inputs: arrays of per-step means; throttlePercent (duty*100); resistance (Ohms, 0 = no correction).
export function computeKV({ meanVoltage, meanRPM, meanCurrent = [], throttlePercent = 100, resistance = 0 }) {
    if (!meanVoltage || !meanRPM || meanVoltage.length < 2) return { kv: null, r2: null, points: [], fitLine: null };
    const duty = Math.max(0.01, Math.min(1, throttlePercent / 100));
    const points = meanVoltage.map((v, idx) => {
        const i = meanCurrent[idx] || 0;
        const vEff = duty * (v - i * resistance);
        return { x: vEff, y: meanRPM[idx] };
    });
    const fit = linearRegression(points);
    if (!fit) return { kv: null, r2: null, points, fitLine: null };
    const xs = points.map(p => p.x);
    const minV = Math.min(...xs), maxV = Math.max(...xs);
    return {
        kv: fit.slope, // RPM per effective volt
        intercept: fit.intercept,
        r2: fit.r2,
        points,
        fitLine: [
            { x: minV, y: fit.slope * minV + fit.intercept },
            { x: maxV, y: fit.slope * maxV + fit.intercept }
        ]
    };
}

// ---------------------------------------------------------------------------
// Step response metrics
// ---------------------------------------------------------------------------
// Detects rising throttle edges and computes per-cycle:
//   rise time (10-90% of RPM span), settling time (within +/-5% band),
//   overshoot (% of span), command-to-motion latency.
export function computeStepMetrics(data, { settleBand = 0.05 } = {}) {
    const t = data.timestamps || [];
    const thr = data.throttle || [];
    const rpm = data.rpm || [];
    const n = Math.min(t.length, thr.length, rpm.length);
    if (n < 10) return { cycles: [], avg: null };

    // detect rising edges (throttle jump > 25% of channel span)
    const thrMin = Math.min(...thr.slice(0, n));
    const thrMax = Math.max(...thr.slice(0, n));
    const jump = Math.max(2, (thrMax - thrMin) * 0.5);
    const edges = [];
    for (let i = 1; i < n; i++) {
        if (thr[i] - thr[i - 1] >= jump * 0.5 && (edges.length === 0 || i - edges[edges.length - 1] > 5)) {
            // confirm it reaches near the high level shortly after
            edges.push(i);
        }
    }

    const cycles = [];
    for (let e = 0; e < edges.length; e++) {
        const edge = edges[e];
        // analysis window ends where throttle falls back down (or at next edge / data end)
        const hardEnd = (e + 1 < edges.length) ? edges[e + 1] : n;
        let windowEnd = hardEnd;
        const highThr = thr[Math.min(edge + 1, n - 1)];
        for (let i = edge + 1; i < hardEnd; i++) {
            if (highThr - thr[i] >= jump * 0.5) { windowEnd = i; break; }
        }
        // baseline: up to 0.5 s before edge
        let baseFrom = edge - 1;
        while (baseFrom > 0 && t[edge] - t[baseFrom] < 0.5) baseFrom--;
        const baseRPM = mean(rpm.slice(Math.max(0, baseFrom), edge));
        // target: last 30% of the high window
        const tgtFrom = edge + Math.floor((windowEnd - edge) * 0.7);
        const targetRPM = mean(rpm.slice(tgtFrom, windowEnd));
        const span = targetRPM - baseRPM;
        if (span < 50) continue; // not a meaningful step

        const th10 = baseRPM + 0.1 * span;
        const th90 = baseRPM + 0.9 * span;
        let t10 = null, t90 = null, latency = null, peak = -Infinity, settled = null;
        for (let i = edge; i < windowEnd; i++) {
            if (latency === null && rpm[i] > baseRPM + 0.05 * span) latency = t[i] - t[edge];
            if (t10 === null && rpm[i] >= th10) t10 = t[i];
            if (t90 === null && rpm[i] >= th90) t90 = t[i];
            if (rpm[i] > peak) peak = rpm[i];
        }
        // settling: last index outside +/- settleBand of target
        let lastOutside = edge;
        for (let i = edge; i < windowEnd; i++) {
            if (Math.abs(rpm[i] - targetRPM) > settleBand * Math.abs(span)) lastOutside = i;
        }
        settled = t[Math.min(lastOutside + 1, windowEnd - 1)] - t[edge];

        cycles.push({
            riseTime: (t10 !== null && t90 !== null) ? (t90 - t10) : null,
            settlingTime: settled,
            overshootPct: span > 0 ? Math.max(0, (peak - targetRPM) / span * 100) : 0,
            latency,
            baseRPM, targetRPM
        });
    }

    const valid = cycles.filter(c => c.riseTime !== null);
    const avg = valid.length ? {
        riseTime: mean(valid.map(c => c.riseTime)),
        settlingTime: mean(valid.map(c => c.settlingTime)),
        overshootPct: mean(valid.map(c => c.overshootPct)),
        latency: mean(valid.filter(c => c.latency !== null).map(c => c.latency)),
        count: valid.length
    } : null;
    return { cycles, avg };
}

// ---------------------------------------------------------------------------
// Endurance metrics
// ---------------------------------------------------------------------------
// Consumed capacity (mAh) and energy (Wh) by trapezoidal integration,
// voltage sag, thrust decay, and a first-order thermal fit
// T(t) = Tinf - (Tinf - T0) * exp(-t/tau) via coarse search over Tinf.
export function computeEnduranceMetrics(data) {
    const t = data.timestamps || [];
    const endIdx = (data._endIndex != null) ? data._endIndex : t.length;
    const n = endIdx;
    if (n < 10) return null;
    const I = data.current, V = data.voltage, Th = data.thrust;

    let mAh = 0, Wh = 0;
    for (let i = 1; i < n; i++) {
        const dt = t[i] - t[i - 1];
        if (dt <= 0) continue;
        mAh += (I[i] + I[i - 1]) / 2 * dt / 3600 * 1000;
        Wh += (V[i] * I[i] + V[i - 1] * I[i - 1]) / 2 * dt / 3600;
    }

    // first/last 10% windows for sag and decay
    const w = Math.max(3, Math.floor(n * 0.1));
    const vStart = mean(V.slice(0, w)), vEnd = mean(V.slice(n - w, n));
    const thStart = mean(Th.slice(0, w)), thEnd = mean(Th.slice(n - w, n));

    const thermal = fitThermal(t.slice(0, n), (data.motorTemp || []).slice(0, n))
        || fitThermal(t.slice(0, n), (data.escTemp || []).slice(0, n));

    return {
        consumedmAh: mAh,
        consumedWh: Wh,
        voltageSag: vStart - vEnd,
        thrustDecayPct: thStart > 0 ? (thStart - thEnd) / thStart * 100 : 0,
        avgCurrent: mean(I.slice(0, n)),
        avgPowerW: mean(V.slice(0, n).map((v, i) => v * I[i])),
        thermal // {tau, tInf, r2} or null
    };
}

export function fitThermal(t, temp) {
    if (!t || !temp || t.length < 20) return null;
    const tMax = Math.max(...temp);
    const t0 = temp[0];
    if (tMax - t0 < 2) return null; // no meaningful rise
    let best = null;
    for (let tInf = tMax + 0.5; tInf <= tMax + 40; tInf += 0.5) {
        const pts = [];
        for (let i = 0; i < t.length; i++) {
            const arg = tInf - temp[i];
            if (arg > 0.1) pts.push({ x: t[i], y: Math.log(arg) });
        }
        if (pts.length < 10) continue;
        const fit = linearRegression(pts);
        if (!fit || fit.slope >= 0) continue;
        if (!best || fit.r2 > best.r2) {
            best = { tau: -1 / fit.slope, tInf, r2: fit.r2 };
        }
    }
    return best;
}
