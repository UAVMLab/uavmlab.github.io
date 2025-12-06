// Control tab module
import { sendCommand } from './bluetooth.js';
import { appendLog, vibrate, vibratePattern } from './utils.js';

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
    // throttleSlider.addEventListener('change', handleThrottleChange);
    testModeSelect.addEventListener('change', handleTestModeChange);
    testDurationInput.addEventListener('change', handleTestDurationChange);
    runTestButton.addEventListener('click', handleRunTest);
    stopTestButton.addEventListener('click', handleStopTest);
}

async function handleArm() {
    vibrate(20); // Light vibration on button press
    const forceArmCheckbox = document.getElementById('forceArmCheckbox');
    const isForceArm = forceArmCheckbox?.checked || false;
    const cmd = isForceArm ? 'force_arm' : 'arm';
    
    try {
        await sendCommand(cmd);
        vibratePattern([50, 50, 50]); // Success pattern
        setControlStatus(`Motor ${isForceArm ? 'force ' : ''}armed.`);
    } catch (error) {
        vibratePattern([200]); // Long vibration for error
        setControlStatus(`Arm failed: ${error.message}`, false);
    }
}

async function handleDisarm() {
    vibrate(20); // Light vibration on button press
    try {
        await sendCommand('disarm');
        vibrate(50); // Medium vibration for disarm
        setControlStatus('Motor disarmed.');
    } catch (error) {
        vibratePattern([200]); // Long vibration for error
        setControlStatus(`Disarm failed: ${error.message}`, false);
    }
}

function handleForceArmChange(event) {
    if (event.target.checked) {
        vibratePattern([100, 50, 100]); // Warning pattern
        const confirmed = confirm(
            '⚠️ WARNING: Force Arm Override\n\n' +
            'You are about to enable FORCE ARM mode. This bypasses safety checks and can be dangerous.\n\n' +
            'Are you sure you want to proceed?'
        );
        if (!confirmed) {
            event.target.checked = false;
            vibrate(30); // Cancelled
        } else {
            vibratePattern([50, 30, 50, 30, 50]); // Confirmed pattern
        }
    } else {
        vibrate(15); // Light vibration for unchecking
    }
}

async function handleThrottleInput() {
    const throttleSlider = document.getElementById('throttleSlider');
    const throttleValue = document.getElementById('throttleValue');
    const value = Number(throttleSlider.value);
    
    // Convert raw value (48-2047) to percentage (0-100) with 2 decimals
    const percentage = ((value - 48) / (2047 - 48) * 100).toFixed(2);
    
    // Vibrate at intervals for feedback while sliding
    if (value % 50 === 0) {
        vibrate(5); // Very light haptic tick
    }
    
    // Update displayed throttle percentage
    throttleValue.textContent = percentage;

    // Vibrate at each value change
    vibrate(10); // Light feedback on value change

    // Sent command immediately on value change
    try {
        await sendCommand('set_throttle', { value: value });
        setControlStatus(`Throttle set to ${percentage}% (${value}).`);
    } catch (error) {
        vibratePattern([200]); // Long vibration for error
        setControlStatus(`Throttle update failed: ${error.message}`, false);
    }
}

// async function handleThrottleChange() {
//     vibrate(15); // Feedback when releasing slider
//     const throttleSlider = document.getElementById('throttleSlider');
//     const value = Number(throttleSlider.value);
//     const percentage = ((value - 48) / (2047 - 48) * 100).toFixed(2);
    
//     try {
//         // Send raw value (28-2047) to device
//         await sendCommand('set_throttle', { value: value });
//         vibrate(30); // Confirm command sent
//         setControlStatus(`Throttle set to ${percentage}% (${value}).`);
//     } catch (error) {
//         vibratePattern([200]); // Long vibration for error
//         setControlStatus(`Throttle update failed: ${error.message}`, false);
//     }
// }

async function handleTestModeChange() {
    vibrate(15); // Light vibration on select change
    const testModeSelect = document.getElementById('testMode');
    try {
        await sendCommand('SET_TEST_MODE', { mode: testModeSelect.value });
        vibrate(30); // Confirm command sent
        setControlStatus(`Test mode set to ${testModeSelect.value}.`);
    } catch (error) {
        vibratePattern([200]); // Long vibration for error
        setControlStatus(`Failed to set test mode: ${error.message}`, false);
    }
}

async function handleTestDurationChange() {
    vibrate(15); // Light vibration on input change
    const testDurationInput = document.getElementById('testDuration');
    try {
        await sendCommand('SET_TEST_DURATION', { duration: Number(testDurationInput.value) });
        vibrate(30); // Confirm command sent
    } catch (error) {
        appendLog(`Failed to update test duration: ${error.message}`);
    }
}

async function handleRunTest() {
    vibratePattern([50, 30, 50]); // Start test pattern
    const testDurationInput = document.getElementById('testDuration');
    const testModeSelect = document.getElementById('testMode');
    try {
        await sendCommand('RUN_TEST', { duration: Number(testDurationInput.value), mode: testModeSelect.value });
        vibratePattern([100, 50, 100]); // Test running confirmation
        setControlStatus('Test running...');
    } catch (error) {
        vibratePattern([200, 100, 200]); // Error pattern
        setControlStatus(`Test start failed: ${error.message}`, false);
    }
}

async function handleStopTest() {
    vibratePattern([30, 20, 30]); // Stop pattern
    try {
        await sendCommand('STOP_TEST');
        vibrate(50); // Stop confirmed
        setControlStatus('Stop signal sent.');
    } catch (error) {
        vibratePattern([200]); // Long vibration for error
        setControlStatus(`Test stop failed: ${error.message}`, false);
    }
}

function setControlStatus(message, isPositive = true) {
    const controlStatus = document.getElementById('controlStatus');
    controlStatus.textContent = message;
    controlStatus.style.color = isPositive ? '#2ecc71' : '#dc3545';
}
