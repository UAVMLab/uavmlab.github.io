// Logs tab module
import { logFilters, updateLogDisplay, vibrate } from './utils.js';

export function initLogsTab() {
    const infoCheckbox = document.getElementById('infoLogCheckbox');
    const warningCheckbox = document.getElementById('warningLogCheckbox');
    const errorCheckbox = document.getElementById('errorLogCheckbox');
    const rxCheckbox = document.getElementById('rxLogCheckbox');
    const txCheckbox = document.getElementById('txLogCheckbox');
    
    // Set up filter event listeners
    if (infoCheckbox) {
        infoCheckbox.addEventListener('change', (e) => {
            vibrate(50);
            logFilters.info = e.target.checked;
            updateLogDisplay();
        });
    }
    
    if (warningCheckbox) {
        warningCheckbox.addEventListener('change', (e) => {
            vibrate(50);
            logFilters.warning = e.target.checked;
            updateLogDisplay();
        });
    }
    
    if (errorCheckbox) {
        errorCheckbox.addEventListener('change', (e) => {
            vibrate(50);
            logFilters.error = e.target.checked;
            updateLogDisplay();
        });
    }
    
    if (rxCheckbox) {
        rxCheckbox.addEventListener('change', (e) => {
            vibrate(50);
            logFilters.rx = e.target.checked;
            updateLogDisplay();
        });
    }
    
    if (txCheckbox) {
        txCheckbox.addEventListener('change', (e) => {
            vibrate(50);
            logFilters.tx = e.target.checked;
            updateLogDisplay();
        });
    }
}
