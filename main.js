const DRONE_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const COMMAND_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789abcdef1';
const TELEMETRY_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789abcdef2';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let bleDevice = null;
let gattServer = null;
let commandCharacteristic = null;
let telemetryCharacteristic = null;

const connectButton = document.getElementById('connectButton');
const disconnectButton = document.getElementById('disconnectButton');
const statusText = document.getElementById('statusText');
const deviceNameDisplay = document.getElementById('deviceName');
const firmwareVersion = document.getElementById('firmwareVersion');
const batteryLevel = document.getElementById('batteryLevel');
const temperature = document.getElementById('temperature');
const configForm = document.getElementById('configForm');
const motorCountInput = document.getElementById('motorCount');
const samplingRateInput = document.getElementById('samplingRate');
const maxThrottleInput = document.getElementById('maxThrottle');
const testDurationInput = document.getElementById('testDuration');
const fetchConfigButton = document.getElementById('fetchConfig');
const armButton = document.getElementById('armButton');
const disarmButton = document.getElementById('disarmButton');
const throttleSlider = document.getElementById('throttleSlider');
const throttleValue = document.getElementById('throttleValue');
const runTestButton = document.getElementById('runTestButton');
const stopTestButton = document.getElementById('stopTestButton');
const logOutput = document.getElementById('logOutput');
const connectionOnlyElements = document.querySelectorAll('[data-connected-only]');

const logBuffer = ['Ready.'];
const MAX_LOG_LINES = 200;

function setStatus(message, isConnected = false) {
    statusText.textContent = message;
    statusText.style.color = isConnected ? '#28a745' : '#dc3545';
}

function appendLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    logBuffer.push(`[${timestamp}] ${message}`);
    while (logBuffer.length > MAX_LOG_LINES) {
        logBuffer.shift();
    }
    logOutput.textContent = logBuffer.join('\n');
    logOutput.scrollTop = logOutput.scrollHeight;
}

function setConnectedState(isConnected) {
    connectButton.disabled = isConnected;
    connectionOnlyElements.forEach((element) => {
        if (element) {
            element.disabled = !isConnected;
        }
    });
}

function resetConnectionState() {
    if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
    }
    bleDevice = null;
    gattServer = null;
    commandCharacteristic = null;
    telemetryCharacteristic = null;
    deviceNameDisplay.textContent = 'Device: N/A';
    setConnectedState(false);
}

async function connectDevice() {
    if (!navigator.bluetooth) {
        setStatus('Web Bluetooth is NOT supported in this browser/platform.', false);
        return;
    }

    try {
        setStatus('Scanning for devices...');
        connectButton.disabled = true;

        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ services: [DRONE_SERVICE_UUID] }],
            optionalServices: [DRONE_SERVICE_UUID]
        });

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        deviceNameDisplay.textContent = `Device: ${bleDevice.name || 'Unknown'}`;
        setStatus('Connecting to GATT server...');

        gattServer = await bleDevice.gatt.connect();
        const service = await gattServer.getPrimaryService(DRONE_SERVICE_UUID);
        commandCharacteristic = await service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);

        try {
            telemetryCharacteristic = await service.getCharacteristic(TELEMETRY_CHARACTERISTIC_UUID);
            await telemetryCharacteristic.startNotifications();
            telemetryCharacteristic.addEventListener('characteristicvaluechanged', handleTelemetry);
        } catch (telemetryError) {
            appendLog(`Telemetry unavailable: ${telemetryError.message}`);
        }

        setStatus(`Connected to ${bleDevice.name || 'device'}.`, true);
        appendLog(`Connected to ${bleDevice.name || 'device'}.`);
        setConnectedState(true);
    } catch (error) {
        appendLog(`Connection failed: ${error.message}`);
        setStatus('Connection failed. See log for details.');
        resetConnectionState();
    }
}

function onDisconnected(event) {
    appendLog(`Disconnected from ${event.target.name || 'device'}.`);
    setStatus('Disconnected.');
    resetConnectionState();
}

async function disconnectDevice() {
    if (bleDevice && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
        setStatus('Disconnecting...');
    } else {
        setStatus('Already disconnected.');
    }
}

function ensureCommandChannel() {
    if (!commandCharacteristic) {
        throw new Error('Command channel not ready. Connect to the device first.');
    }
}

async function sendCommand(type, payload = {}) {
    ensureCommandChannel();
    const packet = {
        type,
        payload,
        timestamp: Date.now()
    };
    const encoded = encoder.encode(JSON.stringify(packet));
    try {
        await commandCharacteristic.writeValue(encoded);
        appendLog(`→ ${type} ${JSON.stringify(payload)}`);
    } catch (error) {
        appendLog(`Command failed (${type}): ${error.message}`);
        throw error;
    }
}

function handleTelemetry(event) {
    const text = decoder.decode(event.target.value);
    appendLog(`← ${text}`);
    try {
        const message = JSON.parse(text);
        if (!message.type) {
            return;
        }
        switch (message.type) {
            case 'SNAPSHOT':
                updateSnapshot(message.payload || {});
                break;
            case 'CONFIG':
                hydrateConfig(message.payload || {});
                break;
            case 'ACK':
                setStatus(message.payload?.status || 'Command acknowledged.', true);
                break;
            case 'ERROR':
                setStatus(message.payload?.message || 'Device reported an error.', false);
                break;
            default:
                break;
        }
    } catch (parseError) {
        appendLog(`Telemetry parse error: ${parseError.message}`);
    }
}

function updateSnapshot(snapshot) {
    if (snapshot.firmware) {
        firmwareVersion.textContent = snapshot.firmware;
    }
    if (typeof snapshot.battery !== 'undefined') {
        batteryLevel.textContent = `${snapshot.battery}%`;
    }
    if (typeof snapshot.temperature !== 'undefined') {
        temperature.textContent = `${snapshot.temperature}°C`;
    }
}

function hydrateConfig(config) {
    if (typeof config.motorCount === 'number') {
        motorCountInput.value = config.motorCount;
    }
    if (typeof config.samplingRate === 'number') {
        samplingRateInput.value = config.samplingRate;
    }
    if (typeof config.maxThrottle === 'number') {
        maxThrottleInput.value = config.maxThrottle;
    }
    if (typeof config.testDuration === 'number') {
        testDurationInput.value = config.testDuration;
    }
}

function collectConfig() {
    return {
        motorCount: Number(motorCountInput.value),
        samplingRate: Number(samplingRateInput.value),
        maxThrottle: Number(maxThrottleInput.value),
        testDuration: Number(testDurationInput.value)
    };
}

configForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        await sendCommand('SET_CONFIG', collectConfig());
        setStatus('Configuration sent.', true);
    } catch (error) {
        setStatus(`Failed to send config: ${error.message}`);
    }
});

fetchConfigButton.addEventListener('click', async () => {
    try {
        await sendCommand('GET_CONFIG');
        setStatus('Config requested...', true);
    } catch (error) {
        setStatus(`Failed to request config: ${error.message}`);
    }
});

armButton.addEventListener('click', async () => {
    try {
        await sendCommand('ARM');
        setStatus('Arming motors...', true);
    } catch (error) {
        setStatus(`Arm failed: ${error.message}`);
    }
});

disarmButton.addEventListener('click', async () => {
    try {
        await sendCommand('DISARM');
        setStatus('Disarming motors...', true);
    } catch (error) {
        setStatus(`Disarm failed: ${error.message}`);
    }
});

throttleSlider.addEventListener('input', () => {
    throttleValue.textContent = throttleSlider.value;
});

throttleSlider.addEventListener('change', async () => {
    try {
        await sendCommand('SET_THROTTLE', { value: Number(throttleSlider.value) });
        setStatus('Throttle updated.', true);
    } catch (error) {
        setStatus(`Throttle update failed: ${error.message}`);
    }
});

runTestButton.addEventListener('click', async () => {
    try {
        await sendCommand('RUN_TEST', { duration: Number(testDurationInput.value) });
        setStatus('Test started.', true);
    } catch (error) {
        setStatus(`Test start failed: ${error.message}`);
    }
});

stopTestButton.addEventListener('click', async () => {
    try {
        await sendCommand('STOP_TEST');
        setStatus('Test stop signal sent.', true);
    } catch (error) {
        setStatus(`Test stop failed: ${error.message}`);
    }
});

connectButton.addEventListener('click', connectDevice);
disconnectButton.addEventListener('click', disconnectDevice);

if (navigator.bluetooth) {
    setStatus('Web Bluetooth ready. Click Connect to begin.');
} else {
    setStatus('Web Bluetooth is NOT supported in this browser/platform. Try Chrome on Android, ChromeOS, or macOS/Windows.');
    connectButton.disabled = true;
}
