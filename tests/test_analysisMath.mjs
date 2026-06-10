// test_analysisMath.mjs — run with: node tests/test_analysisMath.mjs
import {
    linearRegression, aggregateSweepSteps, computeIRFromPulses, computeKV,
    computeStepMetrics, computeEnduranceMetrics, decimateRunForStorage,
    findPeakEfficiency, segmentByThrottle
} from '../js/ui/tabs/analizeTab/analysisMath.js';

let failures = 0;
function check(name, cond, info = '') {
    if (cond) console.log(`PASS  ${name} ${info}`);
    else { console.error(`FAIL  ${name} ${info}`); failures++; }
}
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }
const HZ = 20, DT = 1 / HZ;
function noise(s) { return (Math.random() - 0.5) * 2 * s; }

// ---------- 1. IR test: pulse train, true pack R = 0.050 Ohm ----------
{
    const R = 0.050, V0 = 16.8;
    const d = { timestamps: [], throttle: [], voltage: [], current: [], rpm: [], thrust: [], escTemp: [], motorTemp: [], power: [] };
    let t = 0;
    const pushSeg = (thr, amps, dur) => {
        for (let k = 0; k < dur * HZ; k++) {
            d.timestamps.push(t); t += DT;
            d.throttle.push(thr);
            d.current.push(amps + noise(0.15));
            d.voltage.push(V0 - amps * R + noise(0.02));
            d.rpm.push(thr * 100); d.thrust.push(0); d.escTemp.push(30); d.motorTemp.push(30); d.power.push(0);
        }
    };
    for (let p = 0; p < 10; p++) { pushSeg(10, 3, 1); pushSeg(20, 12, 1); }
    const res = computeIRFromPulses(d, { cells: 4 });
    check('IR ohms ~0.050', res.ohms !== null && approx(res.ohms, 0.050, 0.008), `got ${res.ohms?.toFixed(4)} R2=${res.r2?.toFixed(3)}`);
    check('IR per-cell', res.perCell !== null && approx(res.perCell, 0.0125, 0.003), `got ${res.perCell?.toFixed(5)}`);
    check('IR R2 high', res.r2 > 0.8, `R2=${res.r2?.toFixed(3)}`);
}

// ---------- 2. KV: true KV=900 RPM/V, duty=0.20, R=0.05 ----------
{
    const KV = 900, duty = 0.20, R = 0.05;
    const volts = [12, 13, 14, 15, 16, 16.8];
    const amps = volts.map(v => 2 + 0.3 * v);
    const rpm = volts.map((v, i) => KV * duty * (v - amps[i] * R) + noise(20));
    const res = computeKV({ meanVoltage: volts, meanRPM: rpm, meanCurrent: amps, throttlePercent: 20, resistance: R });
    check('KV ~900', res.kv !== null && approx(res.kv, 900, 30), `got ${res.kv?.toFixed(1)} R2=${res.r2?.toFixed(4)}`);
    // old method (slope vs supply voltage, no duty) for contrast:
    const old = linearRegression(volts.map((v, i) => ({ x: v, y: rpm[i] })));
    console.log(`      (old uncorrected method would report KV=${old.slope.toFixed(1)})`);
}

// ---------- 3. Step response: first-order RPM, tau=0.15 s ----------
{
    const tau = 0.15, lowRPM = 3000, highRPM = 9000;
    const d = { timestamps: [], throttle: [], voltage: [], current: [], rpm: [], thrust: [], escTemp: [], motorTemp: [], power: [] };
    let t = 0, r = lowRPM;
    const seg = (thr, target, dur) => {
        for (let k = 0; k < dur * HZ; k++) {
            r += (target - r) * (1 - Math.exp(-DT / tau));
            d.timestamps.push(t); t += DT;
            d.throttle.push(thr); d.rpm.push(r + noise(15));
            d.voltage.push(16); d.current.push(thr / 4); d.thrust.push(0); d.escTemp.push(30); d.motorTemp.push(30); d.power.push(0);
        }
    };
    for (let c = 0; c < 5; c++) { seg(10, lowRPM, 3); seg(60, highRPM, 3); }
    const res = computeStepMetrics(d);
    const expectedRise = tau * Math.log(9); // 10->90% of first-order = 2.197*tau ~= 0.330 s
    check('Step cycles detected', res.cycles.length >= 4, `got ${res.cycles.length}`);
    check('Step rise time ~0.33 s', res.avg && approx(res.avg.riseTime, expectedRise, 0.12), `got ${res.avg?.riseTime?.toFixed(3)} s`);
    check('Step overshoot ~0%', res.avg && res.avg.overshootPct < 8, `got ${res.avg?.overshootPct?.toFixed(1)}%`);
}

// ---------- 4. Endurance: 60 s at 10 A -> 166.7 mAh; thermal tau=40 s ----------
{
    const d = { timestamps: [], throttle: [], voltage: [], current: [], rpm: [], thrust: [], escTemp: [], motorTemp: [], power: [] };
    const tauT = 40, T0 = 25, Tinf = 75;
    let t = 0;
    for (let k = 0; k < 60 * HZ; k++) {
        d.timestamps.push(t);
        d.throttle.push(50);
        d.current.push(10 + noise(0.1));
        d.voltage.push(16.8 - 0.01 * t); // slow sag
        d.rpm.push(8000); d.thrust.push(1.2 - 0.001 * t);
        d.motorTemp.push(Tinf - (Tinf - T0) * Math.exp(-t / tauT) + noise(0.2));
        d.escTemp.push(40); d.power.push(0);
        t += DT;
    }
    const res = computeEnduranceMetrics(d);
    check('Endurance mAh ~166.7', approx(res.consumedmAh, 166.7, 4), `got ${res.consumedmAh.toFixed(1)} mAh`);
    check('Endurance sag ~0.54 V', approx(res.voltageSag, 0.54, 0.08), `got ${res.voltageSag.toFixed(3)} V`);
    check('Thermal tau ~40 s', res.thermal && approx(res.thermal.tau, 40, 8), `got tau=${res.thermal?.tau?.toFixed(1)} Tinf=${res.thermal?.tInf?.toFixed(1)}`);
}

// ---------- 5. Sweep aggregation + peak efficiency ----------
{
    const d = { timestamps: [], throttle: [], voltage: [], current: [], rpm: [], thrust: [], escTemp: [], motorTemp: [], power: [] };
    let t = 0;
    const steps = [10, 20, 30, 40, 50, 60, 70, 80];
    for (const thr of steps) {
        for (let k = 0; k < 3 * HZ; k++) {
            d.timestamps.push(t); t += DT;
            d.throttle.push(thr);
            const settled = k > HZ; // first second is "transient"
            const amps = thr * 0.3;
            d.current.push((settled ? amps : amps * 1.5) + noise(0.1));
            d.voltage.push(16.8 - amps * 0.05);
            d.rpm.push(thr * 150 + noise(20));
            // thrust in kg; efficiency peaks mid-range
            const tKg = thr * 0.025 * (1 - 0.003 * Math.abs(thr - 45));
            d.thrust.push((settled ? tKg : tKg * 0.7) + noise(0.005));
            d.escTemp.push(35); d.motorTemp.push(40); d.power.push(0);
        }
    }
    d._endIndex = d.timestamps.length;
    const agg = aggregateSweepSteps(d, { settleFraction: 0.4 });
    check('Sweep steps recovered', agg.throttle.length === steps.length, `got ${agg.throttle.length}/${steps.length}`);
    check('Sweep efficiency in g/W (sane range)', agg.efficiencyGW.every(e => e > 0 && e < 50), `range ${Math.min(...agg.efficiencyGW).toFixed(1)}-${Math.max(...agg.efficiencyGW).toFixed(1)} g/W`);
    const segs = segmentByThrottle(d);
    check('Segmentation count', segs.length === steps.length, `got ${segs.length}`);
    const peak = findPeakEfficiency(agg);
    check('Peak efficiency found', peak !== null && peak.throttle >= 10 && peak.throttle <= 80, `at ${peak?.throttle}% -> ${peak?.gPerW?.toFixed(2)} g/W`);
}

// ---------- 6. Storage decimation ----------
{
    const big = { timestamps: [], throttle: [], voltage: [], current: [], rpm: [], thrust: [], escTemp: [], motorTemp: [], power: [], _endIndex: 11000 };
    for (let i = 0; i < 12000; i++) {
        for (const k of ['timestamps', 'throttle', 'voltage', 'current', 'rpm', 'thrust', 'escTemp', 'motorTemp', 'power']) big[k].push(i);
    }
    const small = decimateRunForStorage(big, 600);
    check('Decimation caps length', small.timestamps.length === 600, `got ${small.timestamps.length}`);
    check('Decimation rescales endIndex', approx(small._endIndex, 550, 2), `got ${small._endIndex}`);
    const bytes = JSON.stringify(small).length;
    check('Decimated run < 100 KB', bytes < 100000, `${(bytes / 1024).toFixed(0)} KB`);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
