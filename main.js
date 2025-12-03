const DRONE_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const COMMAND_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789abcdef1';
const TELEMETRY_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789abcdef2';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let bleDevice = null;
let gattServer = null;
let commandCharacteristic = null;
let telemetryCharacteristic = null;

const state = {
    discoveredDevices: [],
    connectedDeviceId: null,
    profiles: [],
    selectedProfileId: null,
    lastTestResults: {
        power: [],
        thrust: [],
        thermal: []
    },
    isConnected: false
};

const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');
const connectButton = document.getElementById('connectButton');
const disconnectButton = document.getElementById('disconnectButton');
const statusText = document.getElementById('statusText');
const deviceNameDisplay = document.getElementById('deviceName');
const deviceList = document.getElementById('deviceList');
const firmwareVersion = document.getElementById('firmwareVersion');
const batteryLevel = document.getElementById('batteryLevel');
const temperature = document.getElementById('temperature');
const loadProfilesButton = document.getElementById('loadProfilesButton');
const syncProfileButton = document.getElementById('syncProfileButton');
const addProfileButton = document.getElementById('addProfileButton');
const profileRows = document.getElementById('profileRows');
const profileForm = document.getElementById('profileForm');
const profileNameInput = document.getElementById('profileName');
const motorDetailsInput = document.getElementById('motorDetails');
const propDetailsInput = document.getElementById('propDetails');
const otherParamsInput = document.getElementById('otherParams');
const deleteProfileButton = document.getElementById('deleteProfileButton');
const armButton = document.getElementById('armButton');
const disarmButton = document.getElementById('disarmButton');
const throttleSlider = document.getElementById('throttleSlider');
const throttleValue = document.getElementById('throttleValue');
const testDurationInput = document.getElementById('testDuration');
const testModeSelect = document.getElementById('testMode');
const runTestButton = document.getElementById('runTestButton');
const stopTestButton = document.getElementById('stopTestButton');
const controlStatus = document.getElementById('controlStatus');
const voltageMetric = document.getElementById('voltageMetric');
const currentMetric = document.getElementById('currentMetric');
const rpmMetric = document.getElementById('rpmMetric');
const escTempMetric = document.getElementById('escTempMetric');
const motorTempMetric = document.getElementById('motorTempMetric');
const logOutput = document.getElementById('logOutput');
const connectionOnlyElements = document.querySelectorAll('[data-connected-only]');

const logBuffer = ['Ready.'];
const MAX_LOG_LINES = 200;

function initTabs() {
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const target = button.dataset.tab;
            tabButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
            tabPanels.forEach((panel) => {
                panel.classList.toggle('active', panel.id === `tab-${target}`);
            });
        });
    });
}

function setStatus(message, isConnected = false) {
    statusText.textContent = message;
    statusText.style.color = isConnected ? '#28a745' : '#dc3545';
}

function setControlStatus(message, isPositive = true) {
    controlStatus.textContent = message;
    controlStatus.style.color = isPositive ? '#2ecc71' : '#dc3545';
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

function rememberDevice(device) {
    if (!device) return;
    const exists = state.discoveredDevices.some((entry) => entry.id === device.id);
    if (!exists) {
        state.discoveredDevices.push({ id: device.id, name: device.name || 'Unknown Device' });
    }
    renderDeviceList();
}

function renderDeviceList() {
    deviceList.innerHTML = '';
    if (!state.discoveredDevices.length) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No devices discovered yet.';
        deviceList.appendChild(empty);
        return;
    }

    state.discoveredDevices.forEach((device) => {
        const item = document.createElement('li');
        item.textContent = device.name;
        if (device.id === state.connectedDeviceId) {
            item.classList.add('active');
            const badge = document.createElement('span');
            badge.textContent = 'Connected';
            badge.className = 'subtext';
            item.appendChild(badge);
        }
        deviceList.appendChild(item);
    });
}

function setConnectedState(isConnected) {
    state.isConnected = isConnected;
    connectButton.disabled = isConnected;
    connectionOnlyElements.forEach((element) => {
        if (element) {
            element.disabled = !isConnected;
        }
    });
    if (!isConnected) {
        syncProfileButton.disabled = true;
    } else {
        syncProfileButton.disabled = !state.selectedProfileId;
    }
}

function resetConnectionState() {
    if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
    }
    state.connectedDeviceId = null;
    state.isConnected = false;
    gattServer = null;
    commandCharacteristic = null;
    telemetryCharacteristic = null;
    bleDevice = null;
    deviceNameDisplay.textContent = 'Device: N/A';
    setConnectedState(false);
    renderDeviceList();
    setControlStatus('Awaiting connection.', false);
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

        rememberDevice(bleDevice);
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

        state.connectedDeviceId = bleDevice.id;
        renderDeviceList();
        setStatus(`Connected to ${bleDevice.name || 'device'}.`, true);
        setControlStatus('Connected. Ready for commands.');
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
    if (bleDevice && bleDevice.gatt?.connected) {
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
            case 'METRICS':
                updateTelemetryMetrics(message.payload || {});
                break;
            case 'CONFIG':
                hydrateProfileFromDevice(message.payload || {});
                break;
            case 'PROFILES':
                syncProfilesFromDevice(message.payload || {});
                break;
            case 'TEST_RESULTS':
                updateTestResults(message.payload || {});
                break;
            case 'STATUS':
                setControlStatus(message.payload?.message || 'Status update.', !!message.payload?.ok);
                break;
            case 'ACK':
                setStatus(message.payload?.status || 'Command acknowledged.', true);
                break;
            case 'ERROR':
                setStatus(message.payload?.message || 'Device reported an error.', false);
                setControlStatus(message.payload?.message || 'Error.', false);
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

function updateTelemetryMetrics(metrics) {
    if (typeof metrics.voltage !== 'undefined') {
        voltageMetric.textContent = `${metrics.voltage.toFixed(1)} V`;
    }
    if (typeof metrics.current !== 'undefined') {
        currentMetric.textContent = `${metrics.current.toFixed(1)} A`;
    }
    if (typeof metrics.rpm !== 'undefined') {
        rpmMetric.textContent = `${Math.round(metrics.rpm)} RPM`;
    }
    if (typeof metrics.escTemp !== 'undefined') {
        escTempMetric.textContent = `${metrics.escTemp.toFixed(1)}°C`;
    }
    if (typeof metrics.motorTemp !== 'undefined') {
        motorTempMetric.textContent = `${metrics.motorTemp.toFixed(1)}°C`;
    }
}

function updateTestResults(results) {
    state.lastTestResults.power = results.power || [];
    state.lastTestResults.thrust = results.thrust || [];
    state.lastTestResults.thermal = results.thermal || [];
    drawCharts();
}

function drawCharts() {
    drawChart('powerChart', state.lastTestResults.power, '#0b5cff');
    drawChart('thrustChart', state.lastTestResults.thrust, '#2ecc71');
    drawChart('thermalChart', state.lastTestResults.thermal, '#f39c12');
}

function drawChart(canvasId, data, strokeStyle) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 20);
    ctx.lineTo(canvas.width, canvas.height - 20);
    ctx.moveTo(40, 0);
    ctx.lineTo(40, canvas.height);
    ctx.stroke();

    if (!data.length) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '12px Segoe UI';
        ctx.fillText('No data yet', canvas.width / 2 - 30, canvas.height / 2);
        return;
    }

    const maxY = Math.max(...data.map((point) => point.y || 0), 1);
    const maxX = Math.max(...data.map((point) => point.x || 0), data.length);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((point, index) => {
        const x = 40 + ((point.x ?? index) / maxX) * (canvas.width - 50);
        const y = canvas.height - 20 - ((point.y ?? 0) / maxY) * (canvas.height - 40);
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
}

function generateProfileId() {
    return `profile-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function startNewProfile() {
    state.selectedProfileId = null;
    profileForm.reset();
    updateProfileActionState();
}

function collectProfileFormData() {
    return {
        id: state.selectedProfileId ?? generateProfileId(),
        name: profileNameInput.value.trim(),
        motorDetails: motorDetailsInput.value.trim(),
        propDetails: propDetailsInput.value.trim(),
        otherParams: otherParamsInput.value.trim()
    };
}

function renderProfiles() {
    profileRows.innerHTML = '';
    if (!state.profiles.length) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'No profiles defined.';
        profileRows.appendChild(empty);
        return;
    }

    state.profiles.forEach((profile) => {
        const row = document.createElement('div');
        row.className = 'profile-table-row';
        if (profile.id === state.selectedProfileId) {
            row.classList.add('active');
        }
        row.innerHTML = `
            <span>${profile.name}</span>
            <span>${profile.motorDetails || '—'}</span>
            <span>${profile.propDetails || '—'}</span>
            <span><button type="button" data-profile-id="${profile.id}">Select</button></span>
        `;

        row.querySelector('button').addEventListener('click', () => selectProfile(profile.id));
        profileRows.appendChild(row);
    });
}

function selectProfile(profileId) {
    state.selectedProfileId = profileId;
    const profile = state.profiles.find((item) => item.id === profileId);
    if (!profile) {
        return;
    }
    profileNameInput.value = profile.name;
    motorDetailsInput.value = profile.motorDetails;
    propDetailsInput.value = profile.propDetails;
    otherParamsInput.value = profile.otherParams;
    renderProfiles();
    updateProfileActionState();
}

function updateProfileActionState() {
    const hasSelection = Boolean(state.selectedProfileId);
    deleteProfileButton.disabled = !hasSelection;
    if (state.isConnected) {
        syncProfileButton.disabled = !hasSelection;
    } else {
        syncProfileButton.disabled = true;
    }
}

function upsertProfile(profile) {
    const index = state.profiles.findIndex((item) => item.id === profile.id);
    if (index === -1) {
        state.profiles.push(profile);
    } else {
        state.profiles[index] = profile;
    }
    state.selectedProfileId = profile.id;
    renderProfiles();
    updateProfileActionState();
}

function removeSelectedProfile() {
    if (!state.selectedProfileId) return;
    state.profiles = state.profiles.filter((profile) => profile.id !== state.selectedProfileId);
    state.selectedProfileId = null;
    renderProfiles();
    startNewProfile();
    updateProfileActionState();
}

function hydrateProfileFromDevice(config) {
    if (!config.id) {
        return;
    }
    upsertProfile({
        id: config.id,
        name: config.name || 'Device Profile',
        motorDetails: config.motorDetails || '',
        propDetails: config.propDetails || '',
        otherParams: config.otherParams || ''
    });
}

function syncProfilesFromDevice(payload) {
    const profiles = payload.profiles || [];
    state.profiles = profiles.map((profile) => ({
        id: profile.id || generateProfileId(),
        name: profile.name || 'Profile',
        motorDetails: profile.motorDetails || '',
        propDetails: profile.propDetails || '',
        otherParams: profile.otherParams || ''
    }));
    state.selectedProfileId = payload.selectedProfileId || state.profiles[0]?.id || null;
    if (state.selectedProfileId) {
        selectProfile(state.selectedProfileId);
    } else {
        renderProfiles();
        startNewProfile();
    }
    updateProfileActionState();
}

profileForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const profile = collectProfileFormData();
    upsertProfile(profile);
});

addProfileButton.addEventListener('click', startNewProfile);
deleteProfileButton.addEventListener('click', () => {
    removeSelectedProfile();
    if (state.isConnected) {
        sendCommand('DELETE_PROFILE');
    }
});

loadProfilesButton.addEventListener('click', () => {
    sendCommand('GET_PROFILES');
});

syncProfileButton.addEventListener('click', () => {
    if (!state.selectedProfileId) {
        appendLog('Select a profile before pushing.');
        return;
    }
    const profile = state.profiles.find((item) => item.id === state.selectedProfileId);
    if (profile) {
        sendCommand('SAVE_PROFILE', profile);
    }
});

armButton.addEventListener('click', async () => {
    try {
        await sendCommand('ARM');
        setStatus('Arming motors...', true);
        setControlStatus('Motors arming...');
    } catch (error) {
        setStatus(`Arm failed: ${error.message}`);
        setControlStatus(`Arm failed: ${error.message}`, false);
    }
});

disarmButton.addEventListener('click', async () => {
    try {
        await sendCommand('DISARM');
        setStatus('Disarming motors...', true);
        setControlStatus('Motors disarming...');
    } catch (error) {
        setStatus(`Disarm failed: ${error.message}`);
        setControlStatus(`Disarm failed: ${error.message}`, false);
    }
});

throttleSlider.addEventListener('input', () => {
    throttleValue.textContent = throttleSlider.value;
});

throttleSlider.addEventListener('change', async () => {
    try {
        await sendCommand('SET_THROTTLE', { value: Number(throttleSlider.value) });
        setControlStatus('Throttle updated.');
    } catch (error) {
        setControlStatus(`Throttle update failed: ${error.message}`, false);
    }
});

testModeSelect.addEventListener('change', async () => {
    try {
        await sendCommand('SET_TEST_MODE', { mode: testModeSelect.value });
        setControlStatus(`Test mode set to ${testModeSelect.value}.`);
    } catch (error) {
        setControlStatus(`Failed to set test mode: ${error.message}`, false);
    }
});

testDurationInput.addEventListener('change', async () => {
    try {
        await sendCommand('SET_TEST_DURATION', { duration: Number(testDurationInput.value) });
    } catch (error) {
        appendLog(`Failed to update test duration: ${error.message}`);
    }
});

runTestButton.addEventListener('click', async () => {
    try {
        await sendCommand('RUN_TEST', { duration: Number(testDurationInput.value), mode: testModeSelect.value });
        setStatus('Test started.', true);
        setControlStatus('Test running...');
    } catch (error) {
        setStatus(`Test start failed: ${error.message}`);
        setControlStatus(`Test start failed: ${error.message}`, false);
    }
});

stopTestButton.addEventListener('click', async () => {
    try {
        await sendCommand('STOP_TEST');
        setStatus('Test stop signal sent.', true);
        setControlStatus('Stop signal sent.');
    } catch (error) {
        setStatus(`Test stop failed: ${error.message}`);
        setControlStatus(`Test stop failed: ${error.message}`, false);
    }
});

connectButton.addEventListener('click', connectDevice);
disconnectButton.addEventListener('click', disconnectDevice);

initTabs();
renderDeviceList();
renderProfiles();
updateProfileActionState();

if (navigator.bluetooth) {
    setStatus('Web Bluetooth ready. Click Connect to begin.');
} else {
    setStatus('Web Bluetooth is NOT supported in this browser/platform. Try Chrome on Android, ChromeOS, or macOS/Windows.');
    connectButton.disabled = true;
}
