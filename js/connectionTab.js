// Connection tab module
import { NUS_SERVICE_UUID, NUS_RX_CHARACTERISTIC_UUID, NUS_TX_CHARACTERISTIC_UUID, APP_DISCOVERY_SERVICE_UUID, APP_INFO_CHARACTERISTIC_UUID, decoder } from './constants.js';
import { state, setBleDevice, setGattServer, setCommandCharacteristic, setTelemetryCharacteristic, getBleDevice, getGattServer } from './state.js';
import { setStatus, appendLog, vibrate, vibratePattern } from './utils.js';
import { sendCommand, clearCommandQueue } from './bluetooth.js';
import { getCurrentActiveProfileName, getCurrentActiveProfile } from './profilesTab.js';
import { resetActiveProfile } from './profilesTab.js';
import { checkMotorStatus } from './controlTab.js';

export function updateControlsAvailability() {
    const controlElements = document.querySelectorAll('[data-profile-required]');
    const controlStatus = document.getElementById('controlStatus');
    const telemetryCard = document.querySelector('#tab-control .card:first-child');
    
    const activeProfileName = getCurrentActiveProfileName();
    const hasActiveProfile = activeProfileName !== null && activeProfileName !== '';
    
    console.log('updateControlsAvailability called, connected:', state.connected, 'activeProfileName:', activeProfileName, 'hasActiveProfile:', hasActiveProfile);
    
    // Check connection status first
    if (!state.connected) {
        // Device not connected - disable all controls
        controlElements.forEach(el => {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                el.disabled = true;
            } else {
                el.classList.add('disabled');
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.5';
            }
        });
        if (controlStatus) {
            controlStatus.textContent = 'Connect to device to enable controls.';
            controlStatus.style.color = '#6c757d';
        }
        if (telemetryCard) {
            telemetryCard.style.opacity = '0.5';
        }
    } else if (!hasActiveProfile) {
        // Connected but no profile set
        controlElements.forEach(el => {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                el.disabled = true;
            } else {
                // For DIV elements like slide-to-arm, add disabled class and prevent interaction
                el.classList.add('disabled');
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.5';
            }
        });
        if (controlStatus) {
            controlStatus.textContent = '⚠️ No active profile set. Please select a profile from the Profiles tab.';
            controlStatus.style.color = '#f39c12';
        }
        // Dim telemetry card to indicate it's not active
        if (telemetryCard) {
            telemetryCard.style.opacity = '0.5';
        }
    } else {
        // Connected and profile is set - enable controls
        controlElements.forEach(el => {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                el.disabled = false;
            } else {
                // For DIV elements, remove disabled state
                el.classList.remove('disabled');
                el.style.pointerEvents = '';
                el.style.opacity = '';
            }
        });
        if (controlStatus) {
            controlStatus.textContent = 'Ready to control motor.';
            controlStatus.style.color = '';
        }
        // Restore telemetry card opacity
        if (telemetryCard) {
            telemetryCard.style.opacity = '1';
        }
    }
}

export function initConnectionTab() {
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    const setDeviceIdButton = document.getElementById('setDeviceIdButton');
    // const scanAllDevicesCheckbox = document.getElementById('scanAllDevices');

    if (connectButton) {
        connectButton.addEventListener('click', connectDevice);
    }
    if (disconnectButton) {
        disconnectButton.addEventListener('click', disconnectDevice);
    }
    if (setDeviceIdButton) {
        setDeviceIdButton.addEventListener('click', handleSetDeviceId);
    }
    
    // Initialize device list
    renderDeviceList();
}

function rememberDevice(device) {
    if (!device) return;
    const exists = state.discoveredDevices.some((entry) => entry.id === device.id);
    if (!exists) {
        state.discoveredDevices.push({ id: device.id, name: device.name || 'Unknown Device' });
    }
    renderDeviceList();
}

function renderDeviceList() {
    const deviceList = document.getElementById('deviceList');
    deviceList.innerHTML = '';
    if (!state.discoveredDevices.length) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No devices discovered yet.';
        deviceList.appendChild(empty);
        return;
    }

    state.discoveredDevices.forEach((device) => {
        const li = document.createElement('li');
        li.textContent = device.name;
        if (device.id === state.connectedDeviceId) {
            li.classList.add('active');
        }
        deviceList.appendChild(li);
    });
}

function handleSetDeviceId() {
    const deviceIdInput = document.getElementById('deviceIdInput');
    const deviceId = parseInt(deviceIdInput.value, 10);
    
    if (isNaN(deviceId) || deviceId < 0 || deviceId > 255) {
        setStatus('Invalid device ID. Must be between 0-255.', false);
        vibrate(50);
        return;
    }
    
    const idVal = {
        value: deviceId
    };
    
    sendCommand('set_dev_id', idVal);
    setStatus(`Setting device ID to ${deviceId}... You will need to reconnect to see the updated device name.`, true);
    appendLog(`Sending set_dev_id command: ${deviceId}. Reconnect required for name update.`);
    vibrate(20);
}

async function connectDevice() {
    vibrate(20); // Light vibration on button press
    
    // Wait a bit to ensure all components are loaded
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const scanAllDevicesCheckbox = document.getElementById('scanAllDevices');
    const deviceNameDisplay = document.getElementById('deviceName');
    
    try {
        setStatus('Requesting Bluetooth device...');
        appendLog('Initiating device scan...');

        const options = (scanAllDevicesCheckbox && scanAllDevicesCheckbox.checked)
            ? { acceptAllDevices: true, optionalServices: [NUS_SERVICE_UUID, APP_DISCOVERY_SERVICE_UUID] }
            : { filters: [{ services: [NUS_SERVICE_UUID] }], optionalServices: [APP_DISCOVERY_SERVICE_UUID] };

        const device = await navigator.bluetooth.requestDevice(options);
        setBleDevice(device);
        rememberDevice(device);

        setStatus(`Connecting to ${device.name}...`);
        appendLog(`Device selected: ${device.name || 'Unknown'}`);

        device.addEventListener('gattserverdisconnected', onDisconnected);

        const server = await device.gatt.connect();
        setGattServer(server);
        setStatus(`Connected to ${device.name}. Discovering services...`, true);
        appendLog('GATT Server connected. Discovering services...');

        const nusService = await server.getPrimaryService(NUS_SERVICE_UUID);
        appendLog('NUS service found.');

        const rxChar = await nusService.getCharacteristic(NUS_RX_CHARACTERISTIC_UUID);
        setCommandCharacteristic(rxChar);
        appendLog('RX characteristic ready (write to device).');

        const txChar = await nusService.getCharacteristic(NUS_TX_CHARACTERISTIC_UUID);
        setTelemetryCharacteristic(txChar);
        await txChar.startNotifications();
        txChar.addEventListener('characteristicvaluechanged', handleTelemetry);
        appendLog('TX characteristic notifications started (receive from device).');

        try {
            const appService = await server.getPrimaryService(APP_DISCOVERY_SERVICE_UUID);
            const infoChar = await appService.getCharacteristic(APP_INFO_CHARACTERISTIC_UUID);
            const infoValue = await infoChar.readValue();
            const appInfo = decoder.decode(infoValue);
            appendLog(`App Info: ${appInfo}`);
        } catch (err) {
            appendLog('App Discovery Service not available or failed to read.');
        }

        state.connectedDeviceId = device.id;
        const deviceNameDisplay = document.getElementById('deviceName');
        if (deviceNameDisplay) {
            deviceNameDisplay.textContent = `Device: ${device.name || 'Unknown'}`;
        }
        
        // Update button states
        const connectButton = document.getElementById('connectButton');
        const disconnectButton = document.getElementById('disconnectButton');
        if (connectButton) connectButton.disabled = true;
        if (disconnectButton) disconnectButton.disabled = false;
        
        setStatus(`Connected to ${device.name}`, true);
        vibratePattern([50, 50, 100]); // Success pattern
        appendLog('Connection established successfully!');
        renderDeviceList();
        updateControlsAvailability(); // Disable controls until profile is set
        
        // Request firmware version after a delay to allow device to be ready
        setTimeout(async () => {
            try {
                await sendCommand('get_version');
                appendLog('Requested firmware version from device.');
            } catch (err) {
                appendLog(`Failed to request version: ${err.message}`);
            }
        }, 1000);
        
        // Start RSSI monitoring
        startRSSIMonitoring(device);
    } catch (error) {
        setStatus(`Connection failed: ${error.message}`);
        vibratePattern([200]); // Error vibration
        appendLog(`Error: ${error.message}`);
        console.error(error);
    }
}

// Monitor connection strength (RSSI)
let rssiInterval = null;

function startRSSIMonitoring(device) {
    // Clear any existing interval
    if (rssiInterval) {
        clearInterval(rssiInterval);
    }
    
    // Update RSSI every 2 seconds
    rssiInterval = setInterval(async () => {
        try {
            if (device && device.gatt && device.gatt.connected) {
                // Note: RSSI reading may not be available in all browsers/devices
                // This is a simulated approach - actual RSSI requires experimental APIs
                updateRSSIDisplay(-60); // Placeholder - replace with actual RSSI when available
            } else {
                stopRSSIMonitoring();
            }
        } catch (error) {
            console.error('RSSI monitoring error:', error);
        }
    }, 2000);
}

function stopRSSIMonitoring() {
    if (rssiInterval) {
        clearInterval(rssiInterval);
        rssiInterval = null;
    }
    updateRSSIDisplay(null);
}

function updateRSSIDisplay(rssi) {
    const rssiValue = document.getElementById('rssiValue');
    const signalBars = document.querySelectorAll('#rssiIndicator .signal-bar');
    
    // Add null checks for elements
    if (!rssiValue || !signalBars || signalBars.length === 0) {
        return; // Elements not yet loaded, skip update
    }
    
    if (rssi === null || rssi === undefined) {
        rssiValue.textContent = '--';
        signalBars.forEach(bar => bar.style.background = '#30363d');
        return;
    }
    
    rssiValue.textContent = `${rssi} dBm`;
    
    // Determine signal strength and color
    let strength = 0;
    let color = '#dc3545'; // Red (poor)
    
    if (rssi >= -50) {
        strength = 4; // Excellent
        color = '#2ecc71'; // Green
    } else if (rssi >= -60) {
        strength = 3; // Good
        color = '#2ecc71'; // Green
    } else if (rssi >= -70) {
        strength = 2; // Fair
        color = '#f39c12'; // Orange
    } else if (rssi >= -80) {
        strength = 1; // Poor
        color = '#dc3545'; // Red
    }
    
    // Update signal bars
    signalBars.forEach((bar, index) => {
        if (index < strength) {
            bar.style.background = color;
        } else {
            bar.style.background = '#30363d';
        }
    });
}

async function disconnectDevice() {
    vibrate(20); // Light vibration on button press
    const device = getBleDevice();
    
    if (!device) {
        appendLog('No device to disconnect.');
        return;
    }
    
    if (device.gatt && device.gatt.connected) {
        try {
            device.gatt.disconnect();
            vibrate(50); // Confirm disconnect
            appendLog('Disconnect requested by user.');
            
            // Manually trigger cleanup in case event doesn't fire
            setTimeout(() => {
                if (device && !device.gatt.connected) {
                    onDisconnected();
                }
            }, 500);
        } catch (error) {
            appendLog(`Disconnect error: ${error.message}`);
            console.error('Disconnect error:', error);
            // Force cleanup on error
            onDisconnected();
        }
    } else {
        appendLog('Device is not connected.');
        onDisconnected(); // Clean up anyway
    }
}

function onDisconnected() {
    const deviceNameDisplay = document.getElementById('deviceName');
    
    stopRSSIMonitoring(); // Stop RSSI monitoring
    setStatus('Device disconnected.');
    if (deviceNameDisplay) {
        deviceNameDisplay.textContent = 'Device: N/A';
    }
    
    // Update button states
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    if (connectButton) connectButton.disabled = false;
    if (disconnectButton) disconnectButton.disabled = true;
    
    state.connectedDeviceId = null;
    resetActiveProfile(); // Clear active profile on disconnect
    clearCommandQueue(); // Clear pending Bluetooth commands
    appendLog('Device disconnected.');
    renderDeviceList();
    setBleDevice(null);
    setGattServer(null);
    setCommandCharacteristic(null);
    setTelemetryCharacteristic(null);
    updateControlsAvailability();
}

function updateBatteryIndicator(voltage) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.batteryCellCount || activeProfile.batteryCellCount === 0) {
        // No battery info, clear indicator
        const voltageMetricParent = document.querySelector('.metric:has(#voltageMetric)');
        if (voltageMetricParent) {
            voltageMetricParent.style.background = '';
        }
        return;
    }
    
    const cellCount = activeProfile.batteryCellCount;
    const minVoltagePerCell = 3.0;  // Empty voltage per cell
    const maxVoltagePerCell = 4.2;  // Full voltage per cell
    
    const minVoltage = cellCount * minVoltagePerCell;
    const maxVoltage = cellCount * maxVoltagePerCell;
    
    // Calculate percentage (0-100)
    let percentage = ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;
    percentage = Math.max(0, Math.min(100, percentage)); // Clamp between 0-100
    
    // Choose color based on percentage
    let color;
    if (percentage > 60) {
        color = 'rgba(57, 238, 99, 0.6)'; // Green with transparency
    } else if (percentage > 30) {
        color = 'rgba(246, 188, 15, 0.6)'; // Yellow with transparency
    } else if (percentage > 15) {
        color = 'rgba(252, 114, 64, 0.6)'; // Orange with transparency
    } else {
        color = 'rgba(250, 60, 79, 0.6)'; // Red with transparency
    }
    
    // Apply gradient background to voltage metric
    const voltageMetricParent = document.querySelector('.metric:has(#voltageMetric)');
    if (voltageMetricParent) {
        voltageMetricParent.style.background = `linear-gradient(to right, ${color} ${percentage}%, transparent ${percentage}%)`;
    }
}

function updateRPMIndicator(rpm) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxRPM || activeProfile.maxRPM === 0) {
        const rpmMetricParent = document.querySelector('.metric:has(#rpmMetric)');
        if (rpmMetricParent) {
            rpmMetricParent.style.background = '';
        }
        return;
    }
    
    const maxRPM = activeProfile.maxRPM;
    let percentage = (rpm / maxRPM) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    let color;
    if (percentage > 90) {
        color = 'rgba(250, 60, 79, 0.6)'; // Red with transparency
    } else if (percentage > 70) {
        color = 'rgba(252, 114, 64, 0.6)'; // Orange with transparency
    } else if (percentage > 50) {
        color = 'rgba(246, 188, 15, 0.6)'; // Yellow with transparency
    } else {
        color = 'rgba(57, 238, 99, 0.6)'; // Green with transparency
    }
    
    const rpmMetricParent = document.querySelector('.metric:has(#rpmMetric)');
    if (rpmMetricParent) {
        rpmMetricParent.style.background = `linear-gradient(to right, ${color} ${percentage}%, transparent ${percentage}%)`;
    }
}

function updateThrustIndicator(thrust) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxThrust || activeProfile.maxThrust === 0) {
        const thrustMetricParent = document.querySelector('.metric:has(#thrustMetric)');
        if (thrustMetricParent) {
            thrustMetricParent.style.background = '';
        }
        return;
    }
    
    // Convert thrust from grams to kg for comparison
    const thrustKg = thrust / 1000;
    const maxThrust = activeProfile.maxThrust;
    let percentage = (thrustKg / maxThrust) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    let color;
    if (percentage > 90) {
        color = 'rgba(250, 60, 79, 0.6)'; // Red with transparency
    } else if (percentage > 70) {
        color = 'rgba(252, 114, 64, 0.6)'; // Orange with transparency
    } else if (percentage > 50) {
        color = 'rgba(246, 188, 15, 0.6)'; // Yellow with transparency
    } else {
        color = 'rgba(57, 238, 99, 0.6)'; // Green with transparency
    }
    
    const thrustMetricParent = document.querySelector('.metric:has(#thrustMetric)');
    if (thrustMetricParent) {
        thrustMetricParent.style.background = `linear-gradient(to right, ${color} ${percentage}%, transparent ${percentage}%)`;
    }
}

function updateCurrentIndicator(current) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxCurrent || activeProfile.maxCurrent === 0) {
        const currentMetricParent = document.querySelector('.metric:has(#currentMetric)');
        if (currentMetricParent) {
            currentMetricParent.style.background = '';
        }
        return;
    }
    
    const maxCurrent = activeProfile.maxCurrent;
    let percentage = (current / maxCurrent) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    let color;
    if (percentage > 90) {
        color = 'rgba(250, 60, 79, 0.6)'; // Red with transparency
    } else if (percentage > 70) {
        color = 'rgba(252, 114, 64, 0.6)'; // Orange with transparency
    } else if (percentage > 50) {
        color = 'rgba(246, 188, 15, 0.6)'; // Yellow with transparency
    } else {
        color = 'rgba(57, 238, 99, 0.6)'; // Green with transparency
    }
    
    const currentMetricParent = document.querySelector('.metric:has(#currentMetric)');
    if (currentMetricParent) {
        currentMetricParent.style.background = `linear-gradient(to right, ${color} ${percentage}%, transparent ${percentage}%)`;
    }
}

function updateESCTempIndicator(temp) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxESCTemp || activeProfile.maxESCTemp === 0) {
        const escTempMetricParent = document.querySelector('.metric:has(#escTempMetric)');
        if (escTempMetricParent) {
            escTempMetricParent.style.background = '';
        }
        return;
    }
    
    const maxTemp = activeProfile.maxESCTemp;
    let percentage = (temp / maxTemp) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    let color;
    if (percentage > 90) {
        color = 'rgba(250, 60, 79, 0.6)'; // Red with transparency
    } else if (percentage > 70) {
        color = 'rgba(252, 114, 64, 0.6)'; // Orange with transparency
    } else if (percentage > 50) {
        color = 'rgba(246, 188, 15, 0.6)'; // Yellow with transparency
    } else {
        color = 'rgba(57, 238, 99, 0.6)'; // Green with transparency
    }
    
    const escTempMetricParent = document.querySelector('.metric:has(#escTempMetric)');
    if (escTempMetricParent) {
        escTempMetricParent.style.background = `linear-gradient(to right, ${color} ${percentage}%, transparent ${percentage}%)`;
    }
}

function updateMotorTempIndicator(temp) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxMotorTemp || activeProfile.maxMotorTemp === 0) {
        const motorTempMetricParent = document.querySelector('.metric:has(#motorTempMetric)');
        if (motorTempMetricParent) {
            motorTempMetricParent.style.background = '';
        }
        return;
    }
    
    const maxTemp = activeProfile.maxMotorTemp;
    let percentage = (temp / maxTemp) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    let color;
    if (percentage > 90) {
        color = 'rgba(250, 60, 79, 0.6)'; // Red with transparency
    } else if (percentage > 70) {
        color = 'rgba(252, 114, 64, 0.6)'; // Orange with transparency
    } else if (percentage > 50) {
        color = 'rgba(246, 188, 15, 0.6)'; // Yellow with transparency
    } else {
        color = 'rgba(57, 238, 99, 0.6)'; // Green with transparency
    }
    
    const motorTempMetricParent = document.querySelector('.metric:has(#motorTempMetric)');
    if (motorTempMetricParent) {
        motorTempMetricParent.style.background = `linear-gradient(to right, ${color} ${percentage}%, transparent ${percentage}%)`;
    }
}

function handleTelemetry(event) {
    const voltageMetric = document.getElementById('voltageMetric');
    const currentMetric = document.getElementById('currentMetric');
    const rpmMetric = document.getElementById('rpmMetric');
    const escTempMetric = document.getElementById('escTempMetric');
    const motorTempMetric = document.getElementById('motorTempMetric');
    const firmwareVersion = document.getElementById('firmwareVersion');
    const batteryLevel = document.getElementById('batteryLevel');
    const temperature = document.getElementById('temperature');
    
    const value = event.target.value;
    const data = decoder.decode(value);
    appendLog(`RX: ${data}`);

    try {
        const msg = JSON.parse(data);
        
        // Handle telemetry data with flat structure (type='data')
        if (msg.type === 'data') {
            // Store in global state
            state.lastRxData = msg;
            
            // Only update telemetry if profile is active
            const activeProfileName = getCurrentActiveProfileName();
            const hasActiveProfile = activeProfileName !== null && activeProfileName !== '';
            
            if (hasActiveProfile) {
                if (msg.voltage !== undefined) {
                    voltageMetric.textContent = `${msg.voltage.toFixed(2)} V`;
                    updateBatteryIndicator(msg.voltage);
                }
                if (msg.current !== undefined) {
                    currentMetric.textContent = `${msg.current.toFixed(2)} A`;
                    updateCurrentIndicator(msg.current);
                }
                if (msg.power !== undefined) powerMetric.textContent = `${msg.power.toFixed(2)} W`;
                if (msg.rpm !== undefined) {
                    rpmMetric.textContent = msg.rpm;
                    updateRPMIndicator(msg.rpm);
                }
                if (msg.thrust !== undefined) {
                    thrustMetric.textContent = `${msg.thrust.toFixed(2)} g`;
                    updateThrustIndicator(msg.thrust);
                }
                if (msg.escTemp !== undefined) {
                    escTempMetric.textContent = `${msg.escTemp.toFixed(1)} °C`;
                    updateESCTempIndicator(msg.escTemp);
                }
                if (msg.motorTemp !== undefined) {
                    motorTempMetric.textContent = `${msg.motorTemp.toFixed(1)} °C`;
                    updateMotorTempIndicator(msg.motorTemp);
                }
            } else {
                console.log('Telemetry update blocked - no active profile. Current profile name:', activeProfileName);
            }
            
            // Update status indicators
            if (msg.status !== undefined) updateStatusIndicators(msg.status);
        }
        // Handle status messages
        else if (msg.type === 'status') {
            // Store in global state
            state.lastRxStatus = msg;
            
            if (msg.status !== undefined) updateStatusIndicators(msg.status);
        }
        // Handle profiles messages
        else if (msg.type === 'profiles') {
            // Store in global state
            state.lastRxProfiles = msg;
            
            // Update profiles if payload exists
            if (msg.profiles && Array.isArray(msg.profiles)) {
                state.profiles = msg.profiles;
                
                // Update profile list UI if available
                if (typeof window.updateProfileList === 'function') {
                    window.updateProfileList();
                }
            }
        }
        // Handle version messages
        else if (msg.type === 'version') {
            if (msg.firmware !== undefined) {
                firmwareVersion.textContent = `${msg.firmware}v`;
                appendLog(`Firmware version: ${msg.firmware}`);
            }
        }
        // Handle individual profile messages
        else if (msg.type === 'profile') {
            // Pass to profile handler
            if (typeof window.handleProfileMessage === 'function') {
                window.handleProfileMessage(msg);
            }
        }
        // Handle current profile response
        else if (msg.type === 'cur_profile') {
            console.log('Received cur_profile message:', msg);
            if (msg.name !== undefined && typeof window.handleCurrentProfileMessage === 'function') {
                window.handleCurrentProfileMessage(msg.name);
                // Update controls based on profile status
                console.log('Profile set to:', msg.name);
                updateControlsAvailability();
            }
        }
        // Handle legacy format with payload
        else if (msg.type === 'data' && msg.payload) {
            const p = msg.payload;
            if (p.voltage !== undefined) voltageMetric.textContent = `${p.voltage.toFixed(2)} V`;
            if (p.current !== undefined) currentMetric.textContent = `${p.current.toFixed(2)} A`;
            if (p.rpm !== undefined) rpmMetric.textContent = p.rpm;
            if (p.escTemp !== undefined) escTempMetric.textContent = `${p.escTemp.toFixed(1)} °C`;
            if (p.motorTemp !== undefined) motorTempMetric.textContent = `${p.motorTemp.toFixed(1)} °C`;
        }
        // Handle acknowledgments
        else if (msg.type === 'ACK' || msg.type === 'ack') {
            appendLog(`ACK received for command: ${msg.command || 'unknown'}`);
            
            // Handle set_dev_id acknowledgment
            if (msg.command === 'set_dev_id') {
                setStatus('Device ID updated successfully. Please disconnect and reconnect to see the new device name.', true);
                appendLog('Device ID changed - reconnection recommended to update display.');
            }
        }
        // Handle device info
        else if (msg.type === 'DEVICE_INFO' && msg.payload) {
            firmwareVersion.textContent = msg.payload.firmware ? `v${msg.payload.firmware}` : 'v0.0.1';
            batteryLevel.textContent = msg.payload.battery || '--';
            temperature.textContent = msg.payload.temperature || '--';
            
            if (msg.payload.rssi !== undefined) updateRSSIDisplay(msg.payload.rssi);
        }
    } catch (err) {
        // Not JSON, just log raw data
        console.warn('Received non-JSON telemetry:', data, err);
    }
}

function updateStatusIndicators(status) {
    // Status bit definitions
    const STATUS_BITS = {
        // Initialization Status
        USR_CFG_PROF_OK: 1 << 0,
        DSHOT_OK: 1 << 1,
        KISS_TELEM_OK: 1 << 2,
        HX711_OK: 1 << 3,
        NTC_SENSOR_OK: 1 << 4,
        
        // Task Status
        DSHOT_TASK_RUNNING: 1 << 5,
        KISS_TELEM_TASK_RUNNING: 1 << 6,
        SENSOR_TASK_RUNNING: 1 << 7,
        
        // Runtime Status
        MOTOR_ARMED: 1 << 8,
        MOTOR_SPINNING: 1 << 9,
        DSHOT_SEND_OK: 1 << 10,
        KISS_TELEM_READ_OK: 1 << 11,
        HX711_TARE_OK: 1 << 12,
        HX711_READ_OK: 1 << 13,
        NTC_SENSOR_READ_OK: 1 << 14,
        
        // Warning Flags
        WARN_BATTERY_LOW: 1 << 15,
        WARN_ESC_OVERHEAT: 1 << 16,
        WARN_MOTOR_OVERHEAT: 1 << 17,
        WARN_OVER_CURRENT: 1 << 18,
        WARN_OVER_RPM: 1 << 19,
        WARN_MOTOR_STALL: 1 << 20,
        WARN_FULL_USR_CFG_PRFLS: 1 << 21
    };
    
    // Helper function to update a status dot
    const updateDot = (id, isActive, isWarning = false) => {
        const dot = document.getElementById(id);
        if (!dot) return;
        
        dot.classList.remove('active', 'inactive', 'warning', 'ok');
        
        if (isWarning) {
            // For warnings: 0 = ok (green), 1 = warning (orange)
            dot.classList.add(isActive ? 'warning' : 'ok');
        } else {
            // For normal status: 0 = inactive (red), 1 = active (green)
            dot.classList.add(isActive ? 'active' : 'inactive');
        }
    };
    
    // Initialization Status
    updateDot('status-cfg', status & STATUS_BITS.USR_CFG_PROF_OK);
    updateDot('status-dshot', status & STATUS_BITS.DSHOT_OK);
    updateDot('status-kiss', status & STATUS_BITS.KISS_TELEM_OK);
    updateDot('status-hx711', status & STATUS_BITS.HX711_OK);
    updateDot('status-ntc', status & STATUS_BITS.NTC_SENSOR_OK);
    
    // Task Status
    updateDot('status-dshot-task', status & STATUS_BITS.DSHOT_TASK_RUNNING);
    updateDot('status-kiss-task', status & STATUS_BITS.KISS_TELEM_TASK_RUNNING);
    updateDot('status-sensor-task', status & STATUS_BITS.SENSOR_TASK_RUNNING);
    
    // Runtime Status
    updateDot('status-armed', status & STATUS_BITS.MOTOR_ARMED);
    updateDot('status-spinning', status & STATUS_BITS.MOTOR_SPINNING);
    updateDot('status-dshot-send', status & STATUS_BITS.DSHOT_SEND_OK);
    updateDot('status-kiss-read', status & STATUS_BITS.KISS_TELEM_READ_OK);
    updateDot('status-hx711-tare', status & STATUS_BITS.HX711_TARE_OK);
    updateDot('status-hx711-read', status & STATUS_BITS.HX711_READ_OK);
    updateDot('status-ntc-read', status & STATUS_BITS.NTC_SENSOR_READ_OK);
    
    // Warning Flags (inverted logic)
    updateDot('status-warn-battery', status & STATUS_BITS.WARN_BATTERY_LOW, true);
    updateDot('status-warn-esc', status & STATUS_BITS.WARN_ESC_OVERHEAT, true);
    updateDot('status-warn-motor', status & STATUS_BITS.WARN_MOTOR_OVERHEAT, true);
    updateDot('status-warn-current', status & STATUS_BITS.WARN_OVER_CURRENT, true);
    updateDot('status-warn-rpm', status & STATUS_BITS.WARN_OVER_RPM, true);
    updateDot('status-warn-stall', status & STATUS_BITS.WARN_MOTOR_STALL, true);
    updateDot('status-warn-cfg', status & STATUS_BITS.WARN_FULL_USR_CFG_PRFLS, true);
    
    // Check motor status for auto-disarm
    checkMotorStatus(status);
}
