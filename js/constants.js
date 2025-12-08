// Nordic UART Service (NUS) UUIDs
export const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_RX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write to device
export const NUS_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notify from device

// App Discovery Service UUIDs
export const APP_DISCOVERY_SERVICE_UUID = 'f0e00001-7a2c-4e9b-a5cf-2b1a9d5ed001';
export const APP_INFO_CHARACTERISTIC_UUID = 'f0e00002-7a2c-4e9b-a5cf-2b1a9d5ed001'; // Read-only

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export const MAX_LOG_LINES = 5000;
