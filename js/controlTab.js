// Control tab module
import { sendCommand } from './bluetooth.js';
import { appendLog, vibrate, vibratePattern } from './utils.js';
import { updateControlsAvailability } from './connectionTab.js';

// Throttle state for slider
let throttleSendTimeout = null;
let lastThrottleValue = null;
let isThrottleSending = false;
let lastHapticValue = null;

// Auto-disarm timeout - triggers if armed but not spinning
let autoDisarmTimeout = null;
let autoDisarmInProgress = false;

function onControlTabOpen() {
    // Update control availability when tab is opened
    updateControlsAvailability();
}

// Slide to arm state
let isDragging = false;
let startX = 0;
let currentX = 0;
let isArmed = false;

export function initControlTab() {
    const slideToArm = document.getElementById('slideToArm');
    const slideButton = document.getElementById('slideButton');
    const disarmButton = document.getElementById('disarmButton');
    const forceArmCheckbox = document.getElementById('forceArmCheckbox');
    const throttleSlider = document.getElementById('throttleSlider');
    const throttleValue = document.getElementById('throttleValue');
    const testDurationInput = document.getElementById('testDuration');
    const testModeSelect = document.getElementById('testMode');
    const runTestButton = document.getElementById('runTestButton');
    const stopTestButton = document.getElementById('stopTestButton');

    // Set up callback for when control tab is opened
    window.onControlTabOpen = onControlTabOpen;

    // Slide to arm event listeners
    if (slideButton) {
        slideButton.addEventListener('mousedown', handleSlideStart);
        slideButton.addEventListener('touchstart', handleSlideStart, { passive: false });
        document.addEventListener('mousemove', handleSlideMove);
        document.addEventListener('touchmove', handleSlideMove, { passive: false });
        document.addEventListener('mouseup', handleSlideEnd);
        document.addEventListener('touchend', handleSlideEnd);
    }

    if (disarmButton) disarmButton.addEventListener('click', handleDisarm);
    if (forceArmCheckbox) forceArmCheckbox.addEventListener('change', handleForceArmChange);
    if (throttleSlider) {
        throttleSlider.addEventListener('input', handleThrottleInput);
        throttleSlider.addEventListener('change', handleThrottleChange);
    }
    if (testModeSelect) testModeSelect.addEventListener('change', handleTestModeChange);
    if (testDurationInput) testDurationInput.addEventListener('change', handleTestDurationChange);
    if (runTestButton) runTestButton.addEventListener('click', handleRunTest);
    if (stopTestButton) stopTestButton.addEventListener('click', handleStopTest);
    
    // Status dot touch/click handlers
    initStatusDotHandlers();
}

function initStatusDotHandlers() {
    const statusDots = document.querySelectorAll('.status-dot');
    let activeLabel = null;
    
    statusDots.forEach(dot => {
        // Touch events for mobile
        dot.addEventListener('touchstart', (e) => {
            e.preventDefault();
            
            // Remove previous active label
            if (activeLabel && activeLabel !== dot) {
                activeLabel.classList.remove('show-label');
            }
            
            // Toggle current label
            if (dot.classList.contains('show-label')) {
                dot.classList.remove('show-label');
                activeLabel = null;
            } else {
                dot.classList.add('show-label');
                activeLabel = dot;
                vibrate(10);
                
                // Auto-hide after 2 seconds
                setTimeout(() => {
                    if (activeLabel === dot) {
                        dot.classList.remove('show-label');
                        activeLabel = null;
                    }
                }, 2000);
            }
        });
        
        // Click events for desktop
        dot.addEventListener('click', (e) => {
            e.preventDefault();
            vibrate(10);
        });
    });
    
    // Close label when clicking elsewhere
    document.addEventListener('touchstart', (e) => {
        if (activeLabel && !e.target.classList.contains('status-dot')) {
            activeLabel.classList.remove('show-label');
            activeLabel = null;
        }
    });
}

function handleSlideStart(event) {
    const slideToArm = document.getElementById('slideToArm');
    if (!slideToArm || slideToArm.hasAttribute('disabled') || isArmed) return;
    
    event.preventDefault();
    isDragging = true;
    startX = event.type.includes('mouse') ? event.clientX : event.touches[0].clientX;
    vibrate(10);
}

function handleSlideMove(event) {
    if (!isDragging) return;
    
    event.preventDefault();
    const slideButton = document.getElementById('slideButton');
    const slideToArm = document.getElementById('slideToArm');
    if (!slideButton || !slideToArm) return;
    
    const clientX = event.type.includes('mouse') ? event.clientX : event.touches[0].clientX;
    const deltaX = clientX - startX;
    const maxSlide = slideToArm.offsetWidth - slideButton.offsetWidth - 8;
    
    currentX = Math.max(0, Math.min(deltaX, maxSlide));
    slideButton.style.transform = `translateX(${currentX}px) translateY(-50%)`;
    
    // Haptic feedback at milestones
    const progress = currentX / maxSlide;
    if (progress > 0.5 && progress < 0.52) {
        vibrate(5);
    } else if (progress > 0.75 && progress < 0.77) {
        vibrate(8);
    }
}

function handleSlideEnd(event) {
    if (!isDragging) return;
    
    isDragging = false;
    const slideButton = document.getElementById('slideButton');
    const slideToArm = document.getElementById('slideToArm');
    if (!slideButton || !slideToArm) return;
    
    const maxSlide = slideToArm.offsetWidth - slideButton.offsetWidth - 8;
    const progress = currentX / maxSlide;
    
    // If slid more than 85%, trigger arm
    if (progress > 0.85) {
        slideButton.style.transform = `translateX(${maxSlide}px) translateY(-50%)`;
        vibratePattern([50, 30, 50]);
        handleArm();
    } else {
        // Reset position with animation
        slideButton.style.transition = 'transform 0.3s ease-out';
        slideButton.style.transform = 'translateX(0) translateY(-50%)';
        vibrate(15);
        setTimeout(() => {
            slideButton.style.transition = '';
        }, 300);
    }
    
    currentX = 0;
}

async function handleArm() {
    const forceArmCheckbox = document.getElementById('forceArmCheckbox');
    const slideToArm = document.getElementById('slideToArm');
    const slideButton = document.getElementById('slideButton');
    const slideText = document.querySelector('.slide-text');
    const isForceArm = forceArmCheckbox?.checked || false;
    const cmd = isForceArm ? 'force_arm' : 'arm';
    
    try {
        await sendCommand(cmd);
        isArmed = true;
        vibratePattern([50, 50, 100]); // Success pattern
        setControlStatus(`Motor ${isForceArm ? 'force ' : ''}armed.`);
        
        // Update UI
        if (slideButton) slideButton.classList.add('armed');
        if (slideToArm) slideToArm.classList.add('armed');
        if (slideText) slideText.textContent = 'ARMED ✓';
    } catch (error) {
        vibratePattern([200]); // Long vibration for error
        setControlStatus(`Arm failed: ${error.message}`, false);
        resetSlideToArm();
    }
}

// Export function to check motor status and trigger auto-disarm if needed
export function checkMotorStatus(status) {
    const STATUS_BITS = {
        MOTOR_ARMED: 1 << 8,
        MOTOR_SPINNING: 1 << 9
    };
    
    const isMotorArmed = (status & STATUS_BITS.MOTOR_ARMED) !== 0;
    const isMotorSpinning = (status & STATUS_BITS.MOTOR_SPINNING) !== 0;
    
    console.log('checkMotorStatus - Armed:', isMotorArmed, 'Spinning:', isMotorSpinning, 'Status:', status);
    
    // If motor is armed but not spinning, start auto-disarm countdown
    if (isMotorArmed && !isMotorSpinning) {
        if (!autoDisarmTimeout && !autoDisarmInProgress) {
            console.log('Auto-disarm: Motor armed but not spinning, starting 2s countdown...');
            autoDisarmTimeout = setTimeout(() => {
                // Double-check status still shows armed but not spinning
                const motorArmedDot = document.getElementById('status-armed');
                const motorSpinningDot = document.getElementById('status-spinning');
                
                const stillArmed = motorArmedDot?.classList.contains('active');
                const stillNotSpinning = !motorSpinningDot?.classList.contains('active');
                
                console.log('Auto-disarm check after 2s - stillArmed:', stillArmed, 'stillNotSpinning:', stillNotSpinning);
                
                if (stillArmed && stillNotSpinning) {
                    appendLog('Auto-disarm: Motor armed but not spinning for 2 seconds.');
                    vibratePattern([100, 50, 100]); // Warning pattern
                    autoDisarmInProgress = true;
                    handleDisarm().finally(() => {
                        autoDisarmInProgress = false;
                    });
                }
                
                autoDisarmTimeout = null;
            }, 2000);
        }
    } else {
        // Motor is either not armed or is spinning - cancel auto-disarm
        if (autoDisarmTimeout) {
            console.log('Auto-disarm cancelled - Armed:', isMotorArmed, 'Spinning:', isMotorSpinning);
            clearTimeout(autoDisarmTimeout);
            autoDisarmTimeout = null;
        }
    }
}

async function handleDisarm() {
    vibrate(20); // Light vibration on button press
    try {
        await sendCommand('disarm');
        vibrate(50); // Medium vibration for disarm
        setControlStatus('Motor disarmed.');
        resetSlideToArm();
    } catch (error) {
        vibratePattern([200]); // Long vibration for error
        setControlStatus(`Disarm failed: ${error.message}`, false);
    }
}

function resetSlideToArm() {
    isArmed = false;
    const slideButton = document.getElementById('slideButton');
    const slideToArm = document.getElementById('slideToArm');
    const slideText = document.querySelector('.slide-text');
    
    if (slideButton) {
        slideButton.classList.remove('armed');
        slideButton.style.transition = 'transform 0.3s ease-out';
        slideButton.style.transform = 'translateX(0) translateY(-50%)';
        setTimeout(() => {
            slideButton.style.transition = '';
        }, 300);
    }
    if (slideToArm) slideToArm.classList.remove('armed');
    if (slideText) slideText.textContent = 'Slide to ARM >> ';
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
    
    // Haptic feedback at 5% intervals (approximately every 100 raw value units)
    const currentStep = Math.floor(value / 100);
    if (lastHapticValue !== currentStep) {
        vibrate(3); // Very light haptic tick
        lastHapticValue = currentStep;
    }
    
    // Update displayed throttle percentage immediately
    throttleValue.textContent = percentage;
    
    // Store value for debounced send
    lastThrottleValue = value;
    
    // Clear existing timeout
    if (throttleSendTimeout) {
        clearTimeout(throttleSendTimeout);
    }
    
    // Debounce: wait 100ms after last input before sending
    throttleSendTimeout = setTimeout(() => {
        sendThrottleCommand(value, percentage);
    }, 100);
}

async function handleThrottleChange() {
    // Called when slider is released - ensure final value is sent
    if (throttleSendTimeout) {
        clearTimeout(throttleSendTimeout);
    }
    
    const throttleSlider = document.getElementById('throttleSlider');
    const value = Number(throttleSlider.value);
    const percentage = ((value - 48) / (2047 - 48) * 100).toFixed(2);
    
    await sendThrottleCommand(value, percentage);
}

async function sendThrottleCommand(value, percentage) {
    // Prevent concurrent sends
    if (isThrottleSending) {
        return;
    }
    
    isThrottleSending = true;
    
    try {
        await sendCommand('set_throttle', { value: value });
        setControlStatus(`Throttle set to ${percentage}% (${value}).`);
    } catch (error) {
        vibratePattern([200]); // Long vibration for error
        setControlStatus(`Throttle update failed: ${error.message}`, false);
        appendLog(`Throttle error: ${error.message}`, 'error');
    } finally {
        isThrottleSending = false;
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
    if (controlStatus) {
        controlStatus.textContent = message;
        controlStatus.style.color = isPositive ? '#2ecc71' : '#dc3545';
    }
}
