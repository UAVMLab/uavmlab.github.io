// Connection tab module
import { NUS_SERVICE_UUID, NUS_RX_CHARACTERISTIC_UUID, NUS_TX_CHARACTERISTIC_UUID, APP_DISCOVERY_SERVICE_UUID, APP_INFO_CHARACTERISTIC_UUID, decoder } from './constants.js';
import { state, setBleDevice, setGattServer, setCommandCharacteristic, setTelemetryCharacteristic, getBleDevice, getGattServer } from './state.js';
import { setStatus, appendLog } from './utils.js';

export function initConnectionTab() {
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    const scanAllDevicesCheckbox = document.getElementById('scanAllDevices');

    connectButton.addEventListener('click', connectDevice);
    disconnectButton.addEventListener('click', disconnectDevice);
    
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
    const scanAllDevicesCheckbox = document.getElementById('scanAllDevices');
    const deviceNameDisplay = document.getElementById('deviceName');
    
    try {
        setStatus('Requesting Bluetooth device...');
        appendLog('Initiating device scan...');

        const options = scanAllDevicesCheckbox.checked
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
        deviceNameDisplay.textContent = `Device: ${device.name || 'Unknown'}`;
        setStatus(`Connected to ${device.name}`, true);
        appendLog('Connection established successfully!');
        renderDeviceList();
    } catch (error) {
        setStatus(`Connection failed: ${error.message}`);
        appendLog(`Error: ${error.message}`);
        console.error(error);
    }
}

async function disconnectDevice() {
    const device = getBleDevice();
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
        appendLog('Disconnect requested by user.');
    }
}

function onDisconnected() {
    const deviceNameDisplay = document.getElementById('deviceName');
    
    setStatus('Device disconnected.');
    deviceNameDisplay.textContent = 'Device: N/A';
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
        if (msg.type === 'TELEMETRY' && msg.payload) {
            const p = msg.payload;
            if (p.voltage !== undefined) voltageMetric.textContent = `${p.voltage} V`;
            if (p.current !== undefined) currentMetric.textContent = `${p.current} A`;
            if (p.rpm !== undefined) rpmMetric.textContent = p.rpm;
            if (p.escTemp !== undefined) escTempMetric.textContent = `${p.escTemp} °C`;
            if (p.motorTemp !== undefined) motorTempMetric.textContent = `${p.motorTemp} °C`;
        } else if (msg.type === 'ACK' || msg.type === 'ack') {
            appendLog(`ACK received for command: ${msg.command || 'unknown'}`);
        } else if (msg.type === 'DEVICE_INFO' && msg.payload) {
            firmwareVersion.textContent = msg.payload.firmware || '0.0.1v';
            batteryLevel.textContent = msg.payload.battery || '--';
            temperature.textContent = msg.payload.temperature || '--';
        }
    } catch (err) {
        // Not JSON, just log raw data
    }
}
