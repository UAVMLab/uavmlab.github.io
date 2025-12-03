// Control tab module
import { sendCommand } from './bluetooth.js';
import { appendLog } from './utils.js';

export function initControlTab() {
    const armButton = document.getElementById('armButton');
    const disarmButton = document.getElementById('disarmButton');
    const forceArmCheckbox = document.getElementById('forceArmCheckbox');
    const throttleSlider = document.getElementById('throttleSlider');
    const throttleValue = document.getElementById('throttleValue');
    const testDurationInput = document.getElementById('testDuration');
    const testModeSelect = document.getElementById('testMode');
    const runTestButton = document.getElementById('runTestButton');
    const stopTestButton = document.getElementById('stopTestButton');

    armButton.addEventListener('click', handleArm);
    disarmButton.addEventListener('click', handleDisarm);
    forceArmCheckbox.addEventListener('change', handleForceArmChange);
    throttleSlider.addEventListener('input', handleThrottleInput);
    throttleSlider.addEventListener('change', handleThrottleChange);
    testModeSelect.addEventListener('change', handleTestModeChange);
    testDurationInput.addEventListener('change', handleTestDurationChange);
    runTestButton.addEventListener('click', handleRunTest);
    stopTestButton.addEventListener('click', handleStopTest);
}

async function handleArm() {
    const forceArmCheckbox = document.getElementById('forceArmCheckbox');
    const isForceArm = forceArmCheckbox?.checked || false;
    const cmd = isForceArm ? 'force_arm' : 'arm';
    
    try {
        await sendCommand(cmd);
        setControlStatus(`Motor ${isForceArm ? 'force ' : ''}armed.`);
    } catch (error) {
        setControlStatus(`Arm failed: ${error.message}`, false);
    }
}

async function handleDisarm() {
    try {
        await sendCommand('disarm');
        setControlStatus('Motor disarmed.');
    } catch (error) {
        setControlStatus(`Disarm failed: ${error.message}`, false);
    }
}

function handleForceArmChange(event) {
    if (event.target.checked) {
        const confirmed = confirm(
            '⚠️ WARNING: Force Arm Override\n\n' +
            'You are about to enable FORCE ARM mode. This bypasses safety checks and can be dangerous.\n\n' +
            'Are you sure you want to proceed?'
        );
        if (!confirmed) {
            event.target.checked = false;
        }
    }
}

function handleThrottleInput() {
    const throttleSlider = document.getElementById('throttleSlider');
    const throttleValue = document.getElementById('throttleValue');
    throttleValue.textContent = throttleSlider.value;
}

async function handleThrottleChange() {
    const throttleSlider = document.getElementById('throttleSlider');
    try {
        await sendCommand('SET_THROTTLE', { value: Number(throttleSlider.value) });
        setControlStatus(`Throttle set to ${throttleSlider.value}%.`);
    } catch (error) {
        setControlStatus(`Throttle update failed: ${error.message}`, false);
    }
}

async function handleTestModeChange() {
    const testModeSelect = document.getElementById('testMode');
    try {
        await sendCommand('SET_TEST_MODE', { mode: testModeSelect.value });
        setControlStatus(`Test mode set to ${testModeSelect.value}.`);
    } catch (error) {
        setControlStatus(`Failed to set test mode: ${error.message}`, false);
    }
}

async function handleTestDurationChange() {
    const testDurationInput = document.getElementById('testDuration');
    try {
        await sendCommand('SET_TEST_DURATION', { duration: Number(testDurationInput.value) });
    } catch (error) {
        appendLog(`Failed to update test duration: ${error.message}`);
    }
}

async function handleRunTest() {
    const testDurationInput = document.getElementById('testDuration');
    const testModeSelect = document.getElementById('testMode');
    try {
        await sendCommand('RUN_TEST', { duration: Number(testDurationInput.value), mode: testModeSelect.value });
        setControlStatus('Test running...');
    } catch (error) {
        setControlStatus(`Test start failed: ${error.message}`, false);
    }
}

async function handleStopTest() {
    try {
        await sendCommand('STOP_TEST');
        setControlStatus('Stop signal sent.');
    } catch (error) {
        setControlStatus(`Test stop failed: ${error.message}`, false);
    }
}

function setControlStatus(message, isPositive = true) {
    const controlStatus = document.getElementById('controlStatus');
    controlStatus.textContent = message;
    controlStatus.style.color = isPositive ? '#2ecc71' : '#dc3545';
}
