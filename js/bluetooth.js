// Bluetooth communication module
import { encoder } from './constants.js';
import { getCommandCharacteristic } from './state.js';
import { appendLog } from './utils.js';

export async function sendCommand(cmd, additionalData = {}) {
    const commandCharacteristic = getCommandCharacteristic();
    if (!commandCharacteristic) {
        throw new Error('Not connected or command characteristic not available.');
    }

    const command = {
        cmd,
        ...additionalData,
        timestamp: Date.now()
    };

    const jsonString = JSON.stringify(command);
    appendLog(`TX: ${jsonString}`);
    const encoded = encoder.encode(jsonString);
    await commandCharacteristic.writeValue(encoded);
}
