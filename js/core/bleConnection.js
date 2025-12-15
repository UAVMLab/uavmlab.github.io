// Core BLE connection management
import { NUS_SERVICE_UUID, NUS_RX_CHARACTERISTIC_UUID, NUS_TX_CHARACTERISTIC_UUID, APP_DISCOVERY_SERVICE_UUID, APP_INFO_CHARACTERISTIC_UUID, decoder } from '../config/constants.js';
import { state, setBleDevice, setGattServer, setCommandCharacteristic, setTelemetryCharacteristic, getBleDevice } from '../state.js';
import { setStatus } from '../utils/statusUtil.js';
import { appendLog } from '../utils/logUtils.js';
import { vibrate, vibratePattern } from '../utils/haptics.js';
import { sendCommand, clearCommandQueue } from '../utils/bluetooth.js';
import { handleTelemetry } from './telemetryHandler.js';
import { startRSSIMonitoring, stopRSSIMonitoring } from './rssiMonitor.js';

/**
 * Connects to a BLE device via Web Bluetooth API
 * @param {Function} onConnectedCallback - Callback after successful connection
 * @param {Function} onDisconnectedCallback - Callback on disconnection
 */
export async function connectDevice(onConnectedCallback = null, onDisconnectedCallback = null) {
    vibrate(40);
    
    // Wait for components to load
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const scanAllDevicesCheckbox = document.getElementById('scanAllDevices');
    
    try {
        setStatus('Requesting Bluetooth device...');
        appendLog('Initiating device scan...');

        const bleOptions = (scanAllDevicesCheckbox && scanAllDevicesCheckbox.checked)
            ? { acceptAllDevices: true, optionalServices: [NUS_SERVICE_UUID, APP_DISCOVERY_SERVICE_UUID] }
            : { filters: [{ services: [NUS_SERVICE_UUID] }], optionalServices: [APP_DISCOVERY_SERVICE_UUID] };

        const device = await navigator.bluetooth.requestDevice(bleOptions);
        setBleDevice(device);

        setStatus(`Connecting to ${device.name}...`);
        appendLog(`Device selected: ${device.name || 'Unknown'}`);

        device.addEventListener('gattserverdisconnected', () => {
            if (onDisconnectedCallback) onDisconnectedCallback();
        });

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
        
        setStatus(`Connected to ${device.name}`, true);
        vibratePattern([50, 50, 100]);
        appendLog('Connection established successfully!');
        
        // Request firmware version
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
        
        if (onConnectedCallback) onConnectedCallback(device);
        
        return device;
    } catch (error) {
        setStatus(`Connection failed: ${error.message}`);
        vibratePattern([200]);
        appendLog(`Error: ${error.message}`);
        console.error(error);
        throw error;
    }
}

/**
 * Disconnects from the currently connected BLE device
 * @param {Function} onDisconnectedCallback - Callback after disconnection
 */
export async function disconnectDevice(onDisconnectedCallback = null) {
    vibrate(20);
    const device = getBleDevice();
    
    if (!device) {
        appendLog('No device to disconnect.');
        return;
    }
    
    if (device.gatt && device.gatt.connected) {
        try {
            device.gatt.disconnect();
            vibrate(80);
            appendLog('Disconnect requested by user.');
            
            setTimeout(() => {
                if (device && !device.gatt.connected) {
                    if (onDisconnectedCallback) onDisconnectedCallback();
                }
            }, 500);
        } catch (error) {
            appendLog(`Disconnect error: ${error.message}`);
            console.error('Disconnect error:', error);
            if (onDisconnectedCallback) onDisconnectedCallback();
        }
    } else {
        appendLog('Device is not connected.');
        if (onDisconnectedCallback) onDisconnectedCallback();
    }
}

/**
 * Handles cleanup when device disconnects
 */
export function handleDisconnection() {
    stopRSSIMonitoring();
    setStatus('Device disconnected.');
    
    state.connectedDeviceId = null;
    clearCommandQueue();
    appendLog('Device disconnected.');
    
    setBleDevice(null);
    setGattServer(null);
    setCommandCharacteristic(null);
    setTelemetryCharacteristic(null);
}

/**
 * Remembers a discovered device
 * @param {BluetoothDevice} device 
 */
export function rememberDevice(device) {
    if (!device) return;
    const exists = state.discoveredDevices.some((entry) => entry.id === device.id);
    if (!exists) {
        state.discoveredDevices.push({ id: device.id, name: device.name || 'Unknown Device' });
    }
}

/**
 * Sets the device ID on the connected device
 * @param {number} deviceId - Device ID (0-255)
 */
export async function setDeviceId(deviceId) {
    if (isNaN(deviceId) || deviceId < 0 || deviceId > 255) {
        setStatus('Invalid device ID. Must be between 0-255.', false);
        vibrate(50);
        throw new Error('Invalid device ID');
    }
    
    const idVal = { value: deviceId };
    
    await sendCommand('set_dev_id', idVal);
    setStatus(`Setting device ID to ${deviceId}... You will need to reconnect to see the updated device name.`, true);
    appendLog(`Sending set_dev_id command: ${deviceId}. Reconnect required for name update.`);
    vibrate(20);
}
