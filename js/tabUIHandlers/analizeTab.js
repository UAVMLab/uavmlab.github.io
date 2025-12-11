// Analize tab initialization and basic handlers
import { state } from '../state.js';
import { appendLog } from '../utils/logUtils.js';
import { sendCommand } from '../utils/bluetooth.js';
import { getCurrentActiveProfile } from './profilesTab.js';

function isArmedFromStatus(statusBits) {
    // Mirror controlTab STATUS_BITS for armed/spinning
    const MOTOR_ARMED = 1 << 8;
    return (statusBits & MOTOR_ARMED) !== 0;
}

function setAnalizeStatusMessage(text, kind = 'info') {
    const statusEl = document.getElementById('analizeStatus');
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color =
        kind === 'error' ? '#dc3545' : kind === 'warn' ? '#f39c12' : '#2ecc71';
}

function getCurrentParams() {
    const params = {};
    const inputs = document.querySelectorAll('#analize-params-card input, #analize-params-card select');
    inputs.forEach(input => {
        const key = input.name;
        if (key) {
            params[key] = input.type === 'number' ? parseFloat(input.value) : input.value;
        }
    });
    return params;
}

// Global analyze state
let currentThrottle = 0;
let dataInterval;
let chartInstance;

function showProgress() {
    const progressEl = document.getElementById('analizeProgress');
    if (progressEl) progressEl.style.display = 'block';
}

function hideProgress() {
    const progressEl = document.getElementById('analizeProgress');
    if (progressEl) progressEl.style.display = 'none';
}

function updateProgress(percent, text = '') {
    const fillEl = document.getElementById('progressFill');
    const textEl = document.getElementById('progressText');
    if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (textEl) textEl.textContent = text;
}

async function sendThrottle(throttle) {
    // Ensure throttle doesn't go below arm throttle
    const profile = getCurrentActiveProfile();
    const armThrottle = profile ? profile.armThrottle : 48;
    const minThrottlePercent = ((armThrottle - 48) / (2047 - 48)) * 100;
    throttle = Math.max(throttle, minThrottlePercent);
    
    // Throttle is 0-100%, convert to 48-2047 range
    const throttleValue = Math.round(48 + (throttle / 100) * (2047 - 48));
    await sendCommand('set_throttle', { value: throttleValue });
    currentThrottle = throttle; // Track current throttle
}

async function startAnalyze(mode, params) {
    if (state.analysis.running) return;

    currentThrottle = 0; // Initialize current throttle
    state.analysis.data = { timestamps: [], throttle: [], voltage: [], current: [], power: [], rpm: [], thrust: [], escTemp: [], motorTemp: [] };
    const startTime = Date.now();
    dataInterval = setInterval(() => {
        if (!state.analysis.running) return;
        const now = Date.now() - startTime;
        const tel = state.lastRxData;
        state.analysis.data.timestamps.push(now);
        state.analysis.data.throttle.push(currentThrottle);
        state.analysis.data.voltage.push(tel?.voltage || 0);
        state.analysis.data.current.push(tel?.current || 0);
        state.analysis.data.power.push(tel?.power || 0);
        state.analysis.data.rpm.push(tel?.rpm || 0);
        state.analysis.data.thrust.push(tel?.thrust || 0);
        state.analysis.data.escTemp.push(tel?.escTemp || 0);
        state.analysis.data.motorTemp.push(tel?.motorTemp || 0);
    }, 200);
    state.analysis.running = true;
    state.analysis.mode = mode;
    state.analysis.lastError = null;
    appendLog(`Analyze start: ${mode}`);
    setAnalizeStatusMessage(`${mode} analyze is running`, 'info');
    updateAnalizeControlsEnabled();
    
    showProgress();
    updateProgress(0);

    try {
        switch (mode) {
            case 'sweep':
                await runThrottleSweep(params);
                break;
            case 'step':
                await runStepResponse(params);
                break;
            case 'endurance':
                await runEnduranceTest(params);
                break;
            case 'ir':
                await runIRTest(params);
                break;
            case 'kv':
                await runKVEstimation(params);
                break;
            case 'thermal':
                await runThermalStress(params);
                break;
            case 'mapping':
                await runMappingTest(params);
                break;
            default:
                throw new Error(`Unknown analyze mode: ${mode}`);
        }
        setAnalizeStatusMessage(`${mode} analyze completed`, 'info');
    } catch (error) {
        state.analysis.lastError = error.message;
        setAnalizeStatusMessage(`Error: ${error.message}`, 'error');
        appendLog(`Analyze error: ${error.message}`);
    } finally {
        state.analysis.running = false;
        state.analysis.stopping = false;
        clearInterval(dataInterval);
        if (state.analysis.data) {
            renderGraphs(state.analysis.mode, state.analysis.data);
            state.analysis.history.push({ mode: state.analysis.mode, data: state.analysis.data, timestamp: Date.now() });
            if (state.analysis.history.length > 10) state.analysis.history.shift();
            localStorage.setItem('analyzeHistory', JSON.stringify(state.analysis.history));
        }
        state.analysis.data = null;
        updateAnalizeControlsEnabled();
        hideProgress();
    }
}

async function stopAnalyze() {
    if (!state.analysis.running) return;

    const mode = state.analysis.mode;
    state.analysis.running = false;
    state.analysis.stopping = true;
    updateAnalizeControlsEnabled(); // Update UI to show stopping state
    appendLog(`Analyze stop: ${mode}`);
    
    hideProgress();
    
    // Gradually slow down from current throttle to arm throttle over 5 seconds
    const profile = getCurrentActiveProfile();
    const armThrottle = profile ? profile.armThrottle : 48; // Default to 48 if no profile
    const armThrottlePercent = ((armThrottle - 48) / (2047 - 48)) * 100;
    
    await rampThrottle(currentThrottle, armThrottlePercent, 2500);
    
    state.analysis.stopping = false;
    setAnalizeStatusMessage(`${mode} analyze stopped`, 'info');
    updateAnalizeControlsEnabled(false);
}

async function rampThrottle(fromPercent, toPercent, durationMs) {
    const steps = 20;
    const stepDuration = durationMs / steps;
    const stepSize = (toPercent - fromPercent) / steps;
    
    for (let i = 0; i <= steps; i++) {
        const throttle = fromPercent + stepSize * i;
        await sendThrottle(throttle);
        await new Promise(resolve => setTimeout(resolve, stepDuration));
    }
}

async function runThrottleSweep(params) {
    const { startThrottle, endThrottle, stepSize, dwell, rampRate, repeats } = params;
    
    const stepsInRepeat = Math.floor((endThrottle - startThrottle) / stepSize) + 1;
    
    for (let repeat = 0; repeat < repeats && state.analysis.running; repeat++) {
        // Ramp to start
        await rampThrottle(0, startThrottle, (startThrottle / rampRate) * 1000);
        if (!state.analysis.running) break;
        
        // Sweep up
        for (let step = 0; step < stepsInRepeat && state.analysis.running; step++) {
            const throttle = startThrottle + step * stepSize;
            updateProgress((step / (stepsInRepeat - 1)) * 100, `${step + 1}/${stepsInRepeat} (${repeat + 1}/${repeats})`);
            await sendThrottle(throttle);
            await new Promise(resolve => setTimeout(resolve, dwell * 1000));
            if (!state.analysis.running) break;
        }
        if (!state.analysis.running) break;
        
        // Ramp down
        await rampThrottle(endThrottle, 0, (endThrottle / rampRate) * 1000);
        if (!state.analysis.running) break;
    }
    
    updateProgress(100, `Completed ${repeats} repeats`);
}

async function runStepResponse(params) {
    const { lowThrottle, highThrottle, onDuration, offDuration, cycles, rampRate } = params;
    
    for (let cycle = 0; cycle < cycles && state.analysis.running; cycle++) {
        updateProgress(((cycle + 1) / cycles) * 100, `${cycle + 1}/${cycles}`);
        
        // Ramp to high
        await rampThrottle(lowThrottle, highThrottle, (Math.abs(highThrottle - lowThrottle) / rampRate) * 1000);
        if (!state.analysis.running) break;
        await new Promise(resolve => setTimeout(resolve, onDuration * 1000));
        if (!state.analysis.running) break;
        
        // Ramp to low
        await rampThrottle(highThrottle, lowThrottle, (Math.abs(highThrottle - lowThrottle) / rampRate) * 1000);
        if (!state.analysis.running) break;
        await new Promise(resolve => setTimeout(resolve, offDuration * 1000));
        if (!state.analysis.running) break;
    }
    
    if (state.analysis.running) {
        updateProgress(100, `Completed ${cycles} cycles`);
    }
}

async function runEnduranceTest(params) {
    const { throttle, duration, cooldown } = params;
    
    updateProgress(0, 'Running endurance test');
    
    // Ramp to throttle
    await rampThrottle(0, throttle, 2000);
    if (!state.analysis.running) return;
    
    // Wait for duration, checking every second
    const durationMs = duration * 60 * 1000;
    const checkInterval = 1000;
    for (let elapsed = 0; elapsed < durationMs && state.analysis.running; elapsed += checkInterval) {
        updateProgress((elapsed / durationMs) * 100, `Endurance: ${Math.round(elapsed / 1000)}s / ${duration * 60}s`);
        await new Promise(resolve => setTimeout(resolve, Math.min(checkInterval, durationMs - elapsed)));
    }
    if (!state.analysis.running) return;
    
    updateProgress(100, 'Endurance test completed');
    
    // Ramp to cooldown throttle (assume 0 for simplicity)
    await rampThrottle(throttle, 0, 2000);
    if (!state.analysis.running) return;
    
    if (cooldown > 0) {
        const cooldownMs = cooldown * 60 * 1000;
        for (let elapsed = 0; elapsed < cooldownMs && state.analysis.running; elapsed += checkInterval) {
            updateProgress(100, `Cooldown: ${Math.round(elapsed / 1000)}s / ${cooldown * 60}s`);
            await new Promise(resolve => setTimeout(resolve, Math.min(checkInterval, cooldownMs - elapsed)));
        }
    }
}

async function runIRTest(params) {
    const { baseline, pulseAmplitude, onDuration, offDuration, pulses } = params;
    
    for (let pulse = 0; pulse < pulses && state.analysis.running; pulse++) {
        updateProgress(((pulse + 1) / pulses) * 100, `${pulse + 1}/${pulses}`);
        
        // Baseline
        await sendThrottle(baseline);
        await new Promise(resolve => setTimeout(resolve, offDuration * 1000));
        if (!state.analysis.running) break;
        
        // Pulse
        await sendThrottle(baseline + pulseAmplitude);
        await new Promise(resolve => setTimeout(resolve, onDuration * 1000));
        if (!state.analysis.running) break;
    }
    
    // Back to baseline
    if (state.analysis.running) {
        await sendThrottle(baseline);
        updateProgress(100, 'IR test completed');
    }
}

async function runKVEstimation(params) {
    const { low, high, stepSize, dwell, currentCeiling } = params;
    
    const steps = Math.floor((high - low) / stepSize) + 1;
    
    for (let step = 0; step < steps && state.analysis.running; step++) {
        const throttle = low + step * stepSize;
        updateProgress((step / (steps - 1)) * 100, `Step ${step + 1}/${steps}`);
        await sendThrottle(throttle);
        await new Promise(resolve => setTimeout(resolve, dwell * 1000));
        if (!state.analysis.running) break;
        // Check current, but for now just dwell
    }
    
    if (state.analysis.running) {
        await sendThrottle(0);
        updateProgress(100, 'KV estimation completed');
    }
}

async function runThermalStress(params) {
    const { segment1Throttle, segment1Duration, segment2Throttle, segment2Duration } = params;
    
    updateProgress(0, 'Segment 1');
    
    // Segment 1
    await rampThrottle(0, segment1Throttle, 2000);
    if (!state.analysis.running) return;
    await new Promise(resolve => setTimeout(resolve, segment1Duration * 1000));
    if (!state.analysis.running) return;
    
    updateProgress(50, 'Segment 2');
    
    // Segment 2
    await rampThrottle(segment1Throttle, segment2Throttle, 2000);
    if (!state.analysis.running) return;
    await new Promise(resolve => setTimeout(resolve, segment2Duration * 1000));
    if (!state.analysis.running) return;
    
    updateProgress(100, 'Thermal stress test completed');
    
    // Cool down
    await rampThrottle(segment2Throttle, 0, 2000);
}

async function runMappingTest(params) {
    const { repeats, ambientTemp, notes } = params;
    
    // For mapping, perhaps run a standard test multiple times
    for (let i = 0; i < repeats && state.analysis.running; i++) {
        updateProgress(((i + 1) / repeats) * 100, `${i + 1}/${repeats}`);
        await runThrottleSweep({ startThrottle: 10, endThrottle: 80, stepSize: 10, dwell: 2, rampRate: 20, repeats: 1 });
        if (!state.analysis.running) break;
    }
    
    if (state.analysis.running) {
        updateProgress(100, 'Mapping test completed');
    }
}

function updateAnalizeControlsEnabled(updateMessage = true) {
    const modeSelect = document.getElementById('analizeModeSelect');
    const startBtn = document.getElementById('analizeStartButton');
    const stopBtn = document.getElementById('analizeStopButton');
    const paramsContainer = document.getElementById('analize-params-card');
    const analizeCard = document.getElementById('analizeCard');
    const telemetryCard = document.getElementById('telemetryCard');

    const connected = !!state.connected;
    const statusMsg = state.lastRxStatus;
    const statusBits = statusMsg && statusMsg.status !== undefined ? statusMsg.status : 0;
    const armed = isArmedFromStatus(statusBits);

    // Debug: print statusBits and armed state
    console.log('[AnalizeTab] statusBits:', statusBits, 'armed:', armed, 'connected:', connected);

    // Disable the whole Analize card only when not connected
    if (analizeCard) {
        if (!connected) {
            analizeCard.classList.add('disabled-card');
        } else {
            analizeCard.classList.remove('disabled-card');
        }
    }
    // Disable parameters and controls when not armed or when running or stopping
    const enable = connected && armed;
    const canModify = enable && !state.analysis.running && !state.analysis.stopping;
    if (modeSelect) modeSelect.disabled = !canModify;
    if (startBtn) startBtn.disabled = !canModify;
    if (stopBtn) stopBtn.disabled = !state.analysis.running || state.analysis.stopping;
    if (paramsContainer) {
        const paramInputs = paramsContainer.querySelectorAll('input, select');
        paramInputs.forEach(input => {
            input.disabled = !canModify;
        });
    }
    // Disable the whole Telemetry card when not connected
    if (telemetryCard) {
        if (!connected) {
            telemetryCard.classList.add('disabled-card');
        } else {
            telemetryCard.classList.remove('disabled-card');
        }
    }
    // Optionally, keep controls enabled for accessibility, but visually block interaction

    if (updateMessage) {
        // Status message precedence
        if (!connected) {
            const statusEl = document.getElementById('analizeStatus');
            if (statusEl) {
                statusEl.textContent = 'Connect to device and arm the motor to enable analize';
                statusEl.style.color = '#6c757d';
            }
        } else if (state.analysis.stopping) {
            setAnalizeStatusMessage('Stopping analyze...', 'warn');
        } else if (!armed) {
            setAnalizeStatusMessage('⚠️ Motor is not armed. Please arm in Control tab.', 'warn');
        } else if (state.analysis.running && state.analysis.mode) {
            setAnalizeStatusMessage(`${state.analysis.mode} analize is running`, 'info');
        } else {
            setAnalizeStatusMessage('State: ready', 'info');
        }
    }
}

function renderGraphs(mode, data) {
    if (!data || !data.timestamps.length) return;
    const ctx = document.getElementById('analyzeChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    // Apply smoothing to noisy metrics
    const smoothedData = { ...data };
    smoothedData.voltage = smoothArray(data.voltage, 3);
    smoothedData.current = smoothArray(data.current, 3);
    smoothedData.escTemp = smoothArray(data.escTemp, 3);
    smoothedData.motorTemp = smoothArray(data.motorTemp, 10);

    // Prepare line data for selected metric
    const metric = document.getElementById('graphMetricSelect').value;
    const maxPoints = 5000;
    const pointCount = Math.min(smoothedData[metric].length, maxPoints);
    const lineData = {
        labels: data.throttle.slice(0, pointCount),
        datasets: [
            {
                label: `${metric} vs Throttle`,
                data: smoothedData[metric].slice(0, pointCount),
                borderColor: 'red',
                backgroundColor: 'rgba(255,0,0,0.1)',
                fill: false,
                tension: 0.2,
                pointRadius: 0,
                yAxisID: 'y1'
            }
        ]
    };
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: lineData,
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: { display: true, text: 'Throttle (%)' }
                },
                y1: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: `${metric} (${getUnit(metric)})` },
                    grid: { drawOnChartArea: true }
                }
            },
            plugins: {
                zoom: {
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        drag: { enabled: true },
                        mode: 'xy',
                        overScaleMode: 'xy',
                        onZoomComplete: function({chart}) { chart.update('none'); }
                    },
                    pan: {
                        enabled: true,
                        mode: 'xy',
                        overScaleMode: 'xy',
                        onPanComplete: function({chart}) { chart.update('none'); }
                    }
                }
            }
        }
    });
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

function smoothArray(arr, windowSize = 3) {
    const smoothed = [];
    for (let i = 0; i < arr.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
            sum += arr[j];
            count++;
        }
        smoothed.push(sum / count);
    }
    return smoothed;
}

function getModeDescription(mode) {
    const descriptions = {
        sweep: {
            title: 'Static Throttle Sweep',
            purpose: 'Gradually increases throttle from minimum to maximum while measuring motor performance at each step. Useful for characterizing motor efficiency, power consumption, and thermal behavior across the full operating range.',
            parameters: '<ul><li><strong>Start Throttle:</strong> Initial throttle percentage (typically 10-20%)</li><li><strong>End Throttle:</strong> Final throttle percentage (typically 80-100%)</li><li><strong>Step Size:</strong> Throttle increment between measurements</li><li><strong>Dwell:</strong> Time in seconds to hold each throttle step</li><li><strong>Ramp Rate:</strong> Speed of throttle changes between steps</li><li><strong>Repeats:</strong> Number of times to repeat the sweep</li></ul>',
            howItWorks: 'The motor ramps to each throttle level, holds steady while collecting telemetry data, then moves to the next level. This creates a comprehensive performance profile.',
            graphAnalysis: 'Look for linear relationships between throttle and RPM/power. Voltage drops indicate battery/IR issues. Current spikes may show ESC limitations. Temperature curves help identify cooling requirements. Smooth curves indicate healthy components.'
        },
        step: {
            title: 'Step Response Test',
            purpose: 'Tests motor acceleration and response time by making sudden throttle changes. Critical for understanding system dynamics, ESC response, and motor/propeller inertia.',
            parameters: '<ul><li><strong>Low Throttle:</strong> Starting throttle level</li><li><strong>High Throttle:</strong> Target throttle level</li><li><strong>On Duration:</strong> How long to hold the high throttle</li><li><strong>Off Duration:</strong> How long to hold the low throttle</li><li><strong>Cycles:</strong> Number of step cycles to perform</li><li><strong>Ramp Rate:</strong> Speed of throttle transitions</li></ul>',
            howItWorks: 'Motor starts at low throttle, then instantly jumps to high throttle and holds for the specified duration before returning to low. This cycle repeats for the specified number of times.',
            graphAnalysis: 'RPM should rise quickly to match throttle changes. Delays indicate ESC lag or motor inertia. Oscillations suggest propeller imbalance. Current spikes during steps reveal ESC capabilities. Smooth transitions indicate well-matched components.'
        },
        endurance: {
            title: 'Fixed Throttle Endurance',
            purpose: 'Runs motor at constant throttle for extended periods to test thermal performance, battery capacity, and long-term stability. Essential for validating cooling solutions and flight time estimates.',
            parameters: '<ul><li><strong>Throttle Level:</strong> Constant throttle percentage to maintain</li><li><strong>Duration:</strong> Test duration in minutes</li><li><strong>Cooldown:</strong> Cooldown period in minutes after test</li></ul>',
            howItWorks: 'Motor runs continuously at the specified throttle level while monitoring temperatures, voltage sag, and current draw over time.',
            graphAnalysis: 'Voltage should decline gradually due to battery discharge. Temperatures should stabilize after initial rise. Current should remain relatively constant. Sudden changes indicate component issues. Compare voltage sag to battery specifications.'
        },
        ir: {
            title: 'Battery IR (Internal Resistance)',
            purpose: 'Measures battery internal resistance by applying current steps and measuring voltage drops. Critical for understanding battery health, capacity, and power delivery capabilities.',
            parameters: '<ul><li><strong>Baseline:</strong> Starting throttle level</li><li><strong>Pulse Amplitude:</strong> Additional throttle for current pulse</li><li><strong>On Duration:</strong> Duration of current pulse</li><li><strong>Off Duration:</strong> Rest period between pulses</li><li><strong>Pulses:</strong> Number of current pulses to apply</li></ul>',
            howItWorks: 'Applies increasing current loads to the battery while measuring the resulting voltage drops. IR is calculated as voltage drop divided by current change.',
            graphAnalysis: 'Voltage should drop linearly with increasing current. Steeper slopes indicate higher IR (worse battery). Compare to manufacturer specs. Look for voltage recovery after current steps. Non-linear curves may indicate damaged cells.'
        },
        kv: {
            title: 'KV Estimation',
            purpose: 'Estimates motor KV (RPM per volt) by measuring no-load RPM at different voltages. Helps verify motor specifications and detect performance variations.',
            parameters: '<ul><li><strong>Low:</strong> Minimum throttle level</li><li><strong>High:</strong> Maximum throttle level</li><li><strong>Step Size:</strong> Throttle increment between measurements</li><li><strong>Dwell:</strong> Stabilization time at each throttle level</li><li><strong>Current Ceiling:</strong> Maximum allowed current draw</li></ul>',
            howItWorks: 'Motor spins at very low throttle while voltage is varied. RPM measurements at each voltage level are used to calculate KV as RPM ÷ Voltage.',
            graphAnalysis: 'RPM should increase linearly with voltage. KV is the slope of this line. Deviations from linearity indicate motor issues. Compare calculated KV to manufacturer rating. Use for motor identification and performance validation.'
        },
        thermal: {
            title: 'ESC Thermal Stress Test',
            purpose: 'Tests ESC thermal management by alternating between high and low throttle periods. Validates cooling systems and identifies thermal throttling points.',
            parameters: '<ul><li><strong>Segment 1 Throttle:</strong> First throttle level</li><li><strong>Segment 1 Duration:</strong> Time at first throttle</li><li><strong>Segment 2 Throttle:</strong> Second throttle level</li><li><strong>Segment 2 Duration:</strong> Time at second throttle</li></ul>',
            howItWorks: 'Alternates between two throttle levels with specified durations, creating thermal cycling that stresses the ESC cooling system.',
            graphAnalysis: 'ESC temperature should cycle predictably between segments. Look for temperature stabilization or continued rise. Current should be consistent at each throttle level. Voltage drops during high-load segments indicate ESC stress. Compare to ESC temperature limits.'
        },
        mapping: {
            title: 'Prop/Motor Mapping',
            purpose: 'Creates performance maps for different propeller/motor combinations. Essential for optimizing propulsion system efficiency and selecting appropriate components.',
            parameters: '<ul><li><strong>Repeats:</strong> Number of complete test cycles</li><li><strong>Ambient Temp:</strong> Starting temperature</li><li><strong>Notes:</strong> Test conditions and component details</li></ul>',
            howItWorks: 'Performs multiple throttle sweeps with the same propeller/motor combination to create averaged performance data.',
            graphAnalysis: 'Multiple traces should overlay closely. Look for consistent RPM/power curves. Temperature variations indicate cooling differences. Use to compare different propeller sizes or motor configurations. Identify optimal operating points.'
        }
    };
    return descriptions[mode] || {
        title: 'Unknown Mode',
        purpose: 'Mode description not available.',
        parameters: 'No parameters defined.',
        howItWorks: 'Unknown operation.',
        graphAnalysis: 'No analysis guidance available.'
    };
}

function updateModeDescription(mode) {
    const desc = getModeDescription(mode);
    const contentEl = document.getElementById('modeDescriptionContent');
    
    if (!mode) {
        contentEl.innerHTML = `
            <h3>Select a Mode</h3>
            <p>Choose an analysis mode from the dropdown above to see detailed information about what it does and how to interpret the results.</p>
        `;
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

function generateCSV(data) {
    const headers = ['Time (s)', 'Throttle (%)', 'Voltage (V)', 'Current (A)', 'Power (W)', 'RPM', 'Thrust (g)', 'ESC Temp (°C)', 'Motor Temp (°C)'];
    const rows = [headers];
    for (let i = 0; i < data.timestamps.length; i++) {
        rows.push([
            (data.timestamps[i] / 1000).toFixed(1),
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
    return rows.map(row => row.join(',')).join('\n');
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

export function initAnalizeTab() {
        console.log('[AnalizeTab] initAnalizeTab called');
    // Load history from localStorage
    const savedHistory = localStorage.getItem('analyzeHistory');
    if (savedHistory) {
        state.analysis.history = JSON.parse(savedHistory);
    }
    const modeSelect = document.getElementById('analizeModeSelect');
    const startBtn = document.getElementById('analizeStartButton');
    const stopBtn = document.getElementById('analizeStopButton');
    const paramsContainer = document.getElementById('analize-params-card');
    const modeHint = document.getElementById('analizeModeHint');
    
    // Expose update function globally for status updates
    window.updateAnalizeStatusUI = updateAnalizeControlsEnabled;
    
    // Initial enablement/status
    updateAnalizeControlsEnabled();

    // Parameter schemas per mode
    const modeParams = {
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
            { key: 'rampRate', label: 'Ramp Rate (%/s)', type: 'number', min: 1, max: 100, step: 1, value: 100 }
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
            { key: 'low', label: 'Low Throttle (%)', type: 'number', min: 0, max: 50, step: 0.5, value: 5 },
            { key: 'high', label: 'High Throttle (%)', type: 'number', min: 5, max: 60, step: 0.5, value: 30 },
            { key: 'stepSize', label: 'Step Size (%)', type: 'number', min: 0.5, max: 10, step: 0.5, value: 5 },
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
            { key: 'ambientTemp', label: 'Ambient Temp (°C)', type: 'number', min: -20, max: 50, step: 1, value: 25 },
            { key: 'notes', label: 'Notes', type: 'text', value: '' }
        ]
    };

    function renderParams(mode) {
        if (!paramsContainer) return;
        const schema = modeParams[mode] || [];
        
        // Get minimum throttle from profile
        const profile = getCurrentActiveProfile();
        const armThrottle = profile ? profile.armThrottle : 48;
        const minThrottlePercent = Math.round(((armThrottle - 48) / (2047 - 48)) * 100 * 10) / 10; // Round to 1 decimal
        
        paramsContainer.innerHTML = schema.map(field => {
            let min = field.min;
            let value = field.value;
            
            // Adjust any throttle field to not go below arm throttle
            if (field.key.toLowerCase().includes('throttle') || field.label.includes('Throttle (%)')) {
                min = Math.max(min || 0, minThrottlePercent);
                value = Math.max(value, minThrottlePercent);
            }
            
            const commonAttrs = `id="param-${field.key}" name="${field.key}" ${min!==undefined?`min="${min}"`:''} ${field.max!==undefined?`max="${field.max}"`:''} ${field.step!==undefined?`step="${field.step}"`:''} value="${value}" ${field.type==='number'?'type="number"':''}`;
            const inputEl = field.type === 'text'
                ? `<input type="text" ${commonAttrs}>`
                : `<input ${commonAttrs}>`;
            return `<div class="param-field"><label for="param-${field.key}">${field.label}</label>${inputEl}</div>`;
        }).join('');
        if (modeHint) modeHint.textContent = `Configuring: ${mode}`;
    }

    // Initial params
    renderParams(modeSelect ? modeSelect.value : 'sweep');

    // Initial mode description
    updateModeDescription(modeSelect ? modeSelect.value : 'sweep');

    // Basic handlers
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            const mode = modeSelect ? modeSelect.value : 'sweep';
            const params = getCurrentParams();
            await startAnalyze(mode, params);
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', async () => {
            await stopAnalyze();
        });
    }

    if (document.getElementById('exportDataButton')) {
        document.getElementById('exportDataButton').addEventListener('click', () => {
            if (!state.analysis.history.length) return;
            const lastRun = state.analysis.history[state.analysis.history.length - 1];
            const csv = generateCSV(lastRun.data);
            downloadCSV(csv, `analyze_${lastRun.mode}_${new Date(lastRun.timestamp).toISOString().slice(0,19).replace(/:/g, '-')}.csv`);
        });
    }

    // Fullscreen graph button handler
    if (document.getElementById('fullscreenGraphButton')) {
        document.getElementById('fullscreenGraphButton').addEventListener('click', () => {
            const chartContainer = document.getElementById('analyzeChartContainer');
            if (!chartContainer) return;
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                chartContainer.requestFullscreen();
            }
        });
    }

    if (document.getElementById('graphMetricSelect')) {
        document.getElementById('graphMetricSelect').addEventListener('change', () => {
            if (state.analysis.history.length) {
                const lastRun = state.analysis.history[state.analysis.history.length - 1];
                renderGraphs(lastRun.mode, lastRun.data);
            }
        });
    }

    if (document.getElementById('descriptionModeSelect')) {
        document.getElementById('descriptionModeSelect').addEventListener('change', () => {
            const selectedMode = document.getElementById('descriptionModeSelect').value;
            updateModeDescription(selectedMode);
        });
    }

    // Optional: expose on open hook
    window.onAnalizeTabOpen = function() {
        // When tab opens, ensure UI reflects current connection state
        updateAnalizeControlsEnabled();
        // Re-render params in case profile changed
        const mode = modeSelect ? modeSelect.value : 'sweep';
        renderParams(mode);
        updateModeDescription(''); // Initialize description to "Select a Mode"
    };

    // Re-render params on mode change
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            const mode = modeSelect.value;
            renderParams(mode);
            updateModeDescription(mode);
        });
    }

    // Expose a UI refresh hook for status/telemetry updates
    window.updateAnalizeStatusUI = function(options = {}) {
        console.log('[AnalizeTab] updateAnalizeStatusUI called', options);
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
