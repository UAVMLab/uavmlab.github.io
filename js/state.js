// Global application state
export const state = {
    discoveredDevices: [],
    connectedDeviceId: null,
    profiles: [],
    selectedProfileId: null,
    lastTestResults: {
        power: [],
        thrust: [],
        thermal: []
    },
    connected: false,
    hasActiveProfile: false, // Whether device has an active profile set
    // Last received data from device
    lastRxData: null,      // Last 'data' type message
    lastRxStatus: null,    // Last 'status' type message
    lastRxProfiles: null   // Last 'profiles' type message
    ,
    analysis: {
        running: false,
        stopping: false,
        mode: null,
        lastError: null,
        data: null, // Current run data
        history: [] // Array of past runs
    }
};

// BLE connection state
export let bleDevice = null;
export let gattServer = null;
export let commandCharacteristic = null;
export let telemetryCharacteristic = null;

export function setBleDevice(device) {
    bleDevice = device;
}

export function setGattServer(server) {
    gattServer = server;
}

export function setCommandCharacteristic(characteristic) {
    commandCharacteristic = characteristic;
}

export function setTelemetryCharacteristic(characteristic) {
    telemetryCharacteristic = characteristic;
}

export function getBleDevice() {
    return bleDevice;
}

export function getGattServer() {
    return gattServer;
}

export function getCommandCharacteristic() {
    return commandCharacteristic;
}

export function getTelemetryCharacteristic() {
    return telemetryCharacteristic;
}
