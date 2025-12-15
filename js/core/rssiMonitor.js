// Core RSSI (signal strength) monitoring
let rssiInterval = null;

/**
 * Starts monitoring RSSI for a connected device
 * @param {BluetoothDevice} device - Connected BLE device
 */
export function startRSSIMonitoring(device) {
    if (rssiInterval) {
        clearInterval(rssiInterval);
    }
    
    // Update RSSI every 2 seconds
    rssiInterval = setInterval(async () => {
        try {
            if (device && device.gatt && device.gatt.connected) {
                // Note: RSSI reading may not be available in all browsers/devices
                // This is a simulated approach - actual RSSI requires experimental APIs
                updateRSSIDisplay(-60); // Placeholder
            } else {
                stopRSSIMonitoring();
            }
        } catch (error) {
            console.error('RSSI monitoring error:', error);
        }
    }, 2000);
}

/**
 * Stops RSSI monitoring
 */
export function stopRSSIMonitoring() {
    if (rssiInterval) {
        clearInterval(rssiInterval);
        rssiInterval = null;
    }
    updateRSSIDisplay(null);
}

/**
 * Updates the RSSI display in the UI
 * @param {number|null} rssi - RSSI value in dBm
 */
export function updateRSSIDisplay(rssi) {
    const rssiValue = document.getElementById('rssiValue');
    const signalBars = document.querySelectorAll('#rssiIndicator .signal-bar');
    
    if (!rssiValue || !signalBars || signalBars.length === 0) {
        return;
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
        color = '#2ecc71';
    } else if (rssi >= -70) {
        strength = 2; // Fair
        color = '#f39c12'; // Orange
    } else if (rssi >= -80) {
        strength = 1; // Poor
        color = '#dc3545';
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
