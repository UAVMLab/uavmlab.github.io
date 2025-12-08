// Connection tab module
import { NUS_SERVICE_UUID, NUS_RX_CHARACTERISTIC_UUID, NUS_TX_CHARACTERISTIC_UUID, APP_DISCOVERY_SERVICE_UUID, APP_INFO_CHARACTERISTIC_UUID, decoder } from './constants.js';
import { state, setBleDevice, setGattServer, setCommandCharacteristic, setTelemetryCharacteristic, getBleDevice, getGattServer } from './state.js';
import { setStatus, appendLog, vibrate, vibratePattern } from './utils.js';
import { sendCommand } from './bluetooth.js';

export function initConnectionTab() {
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    // const scanAllDevicesCheckbox = document.getElementById('scanAllDevices');

    if (connectButton) {
        connectButton.addEventListener('click', connectDevice);
    }
    if (disconnectButton) {
        disconnectButton.addEventListener('click', disconnectDevice);
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
        
        // Request firmware version
        try {
            await sendCommand('get_version');
            appendLog('Requested firmware version from device.');
        } catch (err) {
            appendLog(`Failed to request version: ${err.message}`);
        }
        
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
    appendLog('Device disconnected.');
    renderDeviceList();
    setBleDevice(null);
    setGattServer(null);
    setCommandCharacteristic(null);
    setTelemetryCharacteristic(null);
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
            
            if (msg.voltage !== undefined) voltageMetric.textContent = `${msg.voltage.toFixed(2)} V`;
            if (msg.current !== undefined) currentMetric.textContent = `${msg.current.toFixed(2)} A`;
            if (msg.power !== undefined) powerMetric.textContent = `${msg.power.toFixed(2)} W`;
            if (msg.rpm !== undefined) rpmMetric.textContent = msg.rpm;
            if (msg.thrust !== undefined) thrustMetric.textContent = `${msg.thrust.toFixed(2)} g`;
            if (msg.escTemp !== undefined) escTempMetric.textContent = `${msg.escTemp.toFixed(1)} °C`;
            if (msg.motorTemp !== undefined) motorTempMetric.textContent = `${msg.motorTemp.toFixed(1)} °C`;
            
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
            }
        }
        // Handle version messages
        else if (msg.type === 'version') {
            if (msg.firmware !== undefined) {
                firmwareVersion.textContent = msg.firmware;
                appendLog(`Firmware version: ${msg.firmware}`);
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
        }
        // Handle device info
        else if (msg.type === 'DEVICE_INFO' && msg.payload) {
            firmwareVersion.textContent = msg.payload.firmware || '0.0.1v';
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
}
