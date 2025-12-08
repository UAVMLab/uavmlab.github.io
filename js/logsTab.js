// Logs tab module
import { logFilters, updateLogDisplay } from './utils.js';

export function initLogsTab() {
    const infoCheckbox = document.getElementById('infoLogCheckbox');
    const warningCheckbox = document.getElementById('warningLogCheckbox');
    const errorCheckbox = document.getElementById('errorLogCheckbox');
    const rxCheckbox = document.getElementById('rxLogCheckbox');
    const txCheckbox = document.getElementById('txLogCheckbox');
    
    // Set up filter event listeners
    if (infoCheckbox) {
        infoCheckbox.addEventListener('change', (e) => {
            logFilters.info = e.target.checked;
            updateLogDisplay();
        });
    }
    
    if (warningCheckbox) {
        warningCheckbox.addEventListener('change', (e) => {
            logFilters.warning = e.target.checked;
            updateLogDisplay();
        });
    }
    
    if (errorCheckbox) {
        errorCheckbox.addEventListener('change', (e) => {
            logFilters.error = e.target.checked;
            updateLogDisplay();
        });
    }
    
    if (rxCheckbox) {
        rxCheckbox.addEventListener('change', (e) => {
            logFilters.rx = e.target.checked;
            updateLogDisplay();
        });
    }
    
    if (txCheckbox) {
        txCheckbox.addEventListener('change', (e) => {
            logFilters.tx = e.target.checked;
            updateLogDisplay();
        });
    }
}
