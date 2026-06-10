// test_integration.mjs — run with: node tests/test_integration.mjs
// Loads the REAL analizeTabUI.js module in Node with a minimal DOM/Chart stub
// and drives a full simulated sweep run and IR run through startAnalyze.

// ---------------- Minimal DOM stub ----------------
class StubEl {
    constructor(tag = 'div', id = '') {
        this.tagName = tag.toUpperCase();
        this.id = id;
        this.children = [];
        // Real DOM allows `el.style = 'css string'` (sets cssText); emulate that.
        const styleObj = {};
        Object.defineProperty(this, 'style', {
            get: () => styleObj,
            set: v => { if (typeof v === 'string') styleObj.cssText = v; }
        });
        this.dataset = {};
        this.textContent = '';
        this._innerHTML = '';
        this.className = '';
        this.value = 'sweep';
        this.checked = false;
        this.disabled = false;
        this.parentElement = null;
        this._listeners = {};
    }
    set innerHTML(v) { this._innerHTML = v; }
    get innerHTML() { return this._innerHTML; }
    appendChild(c) { c.parentElement = this; this.children.push(c); if (c.id) registry.set(c.id, c); return c; }
    insertAdjacentElement(_pos, el) { el.parentElement = this.parentElement || this; if (el.id) registry.set(el.id, el); el.children.forEach(ch => { if (ch.id) registry.set(ch.id, ch); }); return el; }
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
    removeEventListener() {}
    querySelectorAll() { return []; }
    getContext() { return makeCtx(); }
    getBoundingClientRect() { return { left: 0, top: 0, right: 300, bottom: 150, width: 300, height: 150 }; }
    classList = { add: () => {}, remove: () => {} };
    toDataURL() { return 'data:image/png;base64,'; }
}
function makeCtx() {
    return new Proxy({}, { get: (t, p) => (p === 'measureText' ? () => ({ width: 10 }) : () => {}) });
}
const registry = new Map();
// Only ids that actually exist in components/tab-analize.html are auto-created;
// everything else behaves like a real DOM (null until attached).
const HTML_IDS = new Set(['analize-params-card','analizeCard','analizeCurrent','analizeEscTemp','analizeModeHint','analizeModeSelect','analizeMotorTemp','analizePower','analizeProgress','analizeRpm','analizeStartButton','analizeStatus','analizeStopButton','analizeThrust','analizeVoltage','analyzeChart','analyzeChartContainer','descriptionModeSelect','exportDataButton','fullscreenGraphButton','graphsCard','modeDescriptionCard','modeDescriptionContent','progressFill','progressText','tab-analize','telemetryCard','graphMetricSelect','profileList','profileForm','motorKV','propDiameter','propPitch','propBlades','batteryCellCount','motorPoles','motorReverse','armThrottle','maxRPM','maxESCTemp','maxMotorTemp','maxCurrent','maxThrust','profileName','currentProfileName']);
function getEl(id) {
    if (!registry.has(id)) {
        if (!HTML_IDS.has(id)) return null;
        const el = new StubEl('div', id);
        if (id === 'analyzeChart') { el.tagName = 'CANVAS'; el.width = 300; el.height = 150; }
        registry.set(id, el);
    }
    return registry.get(id);
}
const documentStub = {
    getElementById: id => getEl(id),
    createElement: tag => new StubEl(tag),
    addEventListener: () => {},
    removeEventListener: () => {},
    fullscreenElement: null
};
const chartCreations = [];
class ChartStub {
    constructor(ctx, config) {
        this.config = config;
        this.data = config.data;
        this.options = config.options;
        chartCreations.push(config);
    }
    destroy() {}
    update() {}
    draw() {}
    getDatasetMeta() { return { hidden: null }; }
    static register() {}
    static defaults = { plugins: { legend: { onClick: () => {} } } };
}
const storage = {};
globalThis.document = documentStub;
globalThis.window = globalThis;
globalThis.localStorage = {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { if (v.length > 4_500_000) { const e = new Error('QuotaExceeded'); e.name = 'QuotaExceededError'; throw e; } storage[k] = v; },
    removeItem: k => delete storage[k]
};
globalThis.Chart = ChartStub;
Object.defineProperty(globalThis, "navigator", { value: { vibrate: () => {} }, configurable: true });
globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };

// ---------------- Import real modules ----------------
const { state } = await import('../js/state.js');
state.analysis = state.analysis || {};
const ui = await import('../js/ui/tabs/analizeTab/analizeTabUI.js');

let failures = 0;
const check = (name, cond, info = '') => {
    if (cond) console.log(`PASS  ${name} ${info}`);
    else { console.error(`FAIL  ${name} ${info}`); failures++; }
};

check('Module loads and exports initAnalizeTab', typeof ui.initAnalizeTab === 'function');

// Stub a connected, armed device with a profile
state.connected = true;
state.lastRxStatus = { status: 1 << 8 }; // armed bit
state.profiles = [];

// initAnalizeTab wires the UI
ui.initAnalizeTab();
check('initAnalizeTab runs without throwing', true);

// ---------------- Simulated device: telemetry follows commanded throttle ----------------
// sendCommand is imported by the module from bluetooth.js; instead of mocking the
// module graph we emulate the device by updating state.lastRxData on a timer,
// reading the throttle that the analyze engine pushes into its own data store.
let simThrottle = 0;
const origSet = Object.getOwnPropertyDescriptor; // not needed; we poll analysis data
// We intercept at the BLE layer: bluetooth.sendCommand will fail (no GATT). Patch state's command char path:
const bt = await import('../js/utils/bluetooth.js');
// bluetooth.sendCommand uses getCommandCharacteristic from state.js
const stateMod = await import('../js/state.js');
if (typeof stateMod.setCommandCharacteristic === 'function') {
    stateMod.setCommandCharacteristic({
        writeValue: async (bytes) => {
            // decode {cmd:'set_throttle', value: N} JSON
            try {
                const txt = Buffer.from(bytes).toString('utf8');
                const msg = JSON.parse(txt);
                const v = msg.value !== undefined ? msg.value : (msg.payload && msg.payload.value);
                if (v !== undefined) simThrottle = ((v - 48) / (2047 - 48)) * 100;
            } catch (e) { /* ignore */ }
        }
    });
}

// Telemetry simulator at 50 Hz: KV-ish RPM, thrust curve, battery with 50 mOhm IR
const simTimer = setInterval(() => {
    const amps = simThrottle * 0.30;
    state.lastRxData = {
        voltage: +(16.8 - amps * 0.050).toFixed(3),
        current: +amps.toFixed(2),
        power: +(16.8 * amps).toFixed(1),
        rpm: Math.round(simThrottle * 150),
        thrust: Math.round(simThrottle * 25 * (1 - 0.003 * Math.abs(simThrottle - 45))), // grams
        escTemp: 35, motorTemp: 40
    };
    state.lastRxTime = Date.now();
}, 20);

// ---------------- Run a short sweep through the REAL startAnalyze path ----------------
// startAnalyze isn't exported; drive it via the wired start button listener.
const startBtn = getEl('analizeStartButton');
const modeSelect = getEl('analizeModeSelect');
modeSelect.value = 'sweep';
// Params come from getCurrentParamsFromUI -> container.querySelectorAll('input') = [] -> {} -> defaults.
// Defaults: 0-100% step 5 dwell 3 = ~70 s. Too slow for a test; instead call the click
// handler then immediately... better: temporarily monkey-patch via params UI is hard.
// Use short run: history-driven check via the internal default sweep would take minutes,
// so we validate the engine with the 'ir' mode (10 pulses x 2 s = ~20 s) — still long.
// Pragmatic approach: run sweep with custom params by emulating filled inputs.
const paramsCard = getEl('analize-params-card');
const mkInput = (name, value, type = 'number') => {
    const i = new StubEl('input'); i.name = name; i.type = type; i.value = String(value); return i;
};
paramsCard.querySelectorAll = () => [
    mkInput('startThrottle', 10), mkInput('endThrottle', 30), mkInput('stepSize', 10),
    mkInput('dwell', 1.2), mkInput('rampRate', 100), mkInput('repeats', 1)
];

console.log('Running simulated sweep (about 9 s)...');
const clickHandlers = startBtn._listeners['click'] || [];
check('Start button handler attached', clickHandlers.length === 1);
await clickHandlers[0]();

const hist = state.analysis.history || [];
check('Sweep run saved to history', hist.length === 1, `entries=${hist.length}`);
const run = hist[hist.length - 1];
check('Run has computed results', run && run.results && run.results.type === 'sweep', `type=${run?.results?.type}`);
check('Sweep aggregated >= 3 steps', run?.results?.agg?.throttle?.length >= 3, `steps=${run?.results?.agg?.throttle?.length} [${run?.results?.agg?.throttle?.map(t=>t.toFixed(0))}]`);
check('Peak efficiency computed (g/W)', run?.results?.peak && run.results.peak.gPerW > 0.5 && run.results.peak.gPerW < 50, `${run?.results?.peak?.gPerW?.toFixed(2)} g/W @ ${run?.results?.peak?.throttle}%`);
check('History persisted to localStorage', !!storage['analyzeHistory']);
check('Stored run is decimated (<= 600 pts)', JSON.parse(storage['analyzeHistory'])[0].data.timestamps.length <= 600);
check('Chart was created with linear x-axis', chartCreations.length > 0 && chartCreations[chartCreations.length - 1].options.scales.x.type === 'linear');
const summary = registry.get('analysisSummary');
check('Summary panel rendered', summary && /peak efficiency/i.test(summary.innerHTML), (summary ? summary.innerHTML.replace(/<[^>]+>/g, '').slice(0, 90) : 'no element'));

// ---------------- IR run through the same path ----------------
modeSelect.value = 'ir';
paramsCard.querySelectorAll = () => [
    mkInput('baseline', 10), mkInput('pulseAmplitude', 15),
    mkInput('onDuration', 0.5), mkInput('offDuration', 0.5), mkInput('pulses', 4)
];
console.log('Running simulated IR test (about 4 s)...');
await clickHandlers[0]();
const irRun = state.analysis.history[state.analysis.history.length - 1];
check('IR run produced resistance', irRun?.results?.ohms !== null && irRun?.results?.ohms !== undefined, `R=${(irRun?.results?.ohms * 1000)?.toFixed(1)} mOhm (true 50.0)`);
check('IR within 25% of true 50 mOhm', Math.abs(irRun.results.ohms - 0.050) < 0.0125, `got ${(irRun.results.ohms * 1000).toFixed(1)} mOhm R2=${irRun.results.r2?.toFixed(3)}`);
check('lastIR cached for KV correction', Math.abs((state.analysis.lastIR || 0) - irRun.results.ohms) < 1e-9);

// ---------------- Safety watchdog ----------------
// Register an active profile through the real profile pipeline, with a 5 A
// current limit. The simulator draws ~12 A above 40% throttle, so the
// watchdog must abort the sweep.
const prof = await import('../js/ui/tabs/profileTab/profilesTab.js');
prof.handleProfileMessage({
    name: 'WatchdogTest', mKV: 900, propDiam: 10, propPitch: 5, propBlades: 2,
    bat: 4, mPoles: 14, mRev: false, armThrot: 48,
    mRpmLim: 0, escTempLim: 0, mTempLim: 0, curLim: 5, thrustLim: 10
});
prof.handleCurrentProfileMessage('WatchdogTest');
const active = prof.getCurrentActiveProfile();
check('Active profile registered', !!active && active.maxCurrent === 5, `maxCurrent=${active?.maxCurrent}`);

modeSelect.value = 'sweep';
paramsCard.querySelectorAll = () => [
    mkInput('startThrottle', 40), mkInput('endThrottle', 60), mkInput('stepSize', 10),
    mkInput('dwell', 1), mkInput('rampRate', 100), mkInput('repeats', 1)
];
console.log('Running watchdog test (current limit 5 A, sim draws 12+ A)...');
await clickHandlers[0]();
check('Safety watchdog aborts on over-current', /SAFETY ABORT/i.test(state.analysis.lastError || ''), `lastError="${state.analysis.lastError}"`);

// ---------------- Telemetry staleness watchdog ----------------
prof.resetActiveProfile();
modeSelect.value = 'sweep';
paramsCard.querySelectorAll = () => [
    mkInput('startThrottle', 10), mkInput('endThrottle', 20), mkInput('stepSize', 10),
    mkInput('dwell', 3), mkInput('rampRate', 100), mkInput('repeats', 1)
];
console.log('Running staleness test (telemetry frozen 2 s into the run)...');
setTimeout(() => clearInterval(simTimer), 2000); // freeze telemetry mid-run
await clickHandlers[0]();
check('Watchdog aborts on stale telemetry', /SAFETY ABORT: Telemetry lost/i.test(state.analysis.lastError || ''), `lastError="${state.analysis.lastError}"`);

console.log(failures === 0 ? '\nALL INTEGRATION TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
