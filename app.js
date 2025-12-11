// Main application entry point
import { loadComponents } from './js/componentLoader.js';
import { setStatus } from './js/utils/statusUtil.js';
import { initNavigation } from './js/navigation.js';

import { initConnectionTab } from './js/tabUIHandlers/connectionTab.js';
import { initProfilesTab, updateProfileList, handleProfileMessage, handleCurrentProfileMessage } from './js/tabUIHandlers/profilesTab.js';
import { initControlTab, initStatusDotHandlers } from './js/tabUIHandlers/controlTab.js';
import { initResultsTab } from './js/tabUIHandlers/resultsTab.js';
import { initLogsTab } from './js/tabUIHandlers/logsTab.js';
import { initAnalizeTab } from './js/tabUIHandlers/analizeTab.js';

// Expose functions globally so connectionTab can call them
window.updateProfileList = updateProfileList;
window.handleProfileMessage = handleProfileMessage;
window.handleCurrentProfileMessage = handleCurrentProfileMessage;

// Initialize all modules
async function initApp() {
    // Load HTML components first
    await loadComponents();
    
    // Initialize navigation
    initNavigation();
    
    // Initialize each tab
    initConnectionTab();
    initProfilesTab();
    initControlTab();
    initAnalizeTab();
    initResultsTab();
    initLogsTab();
    
    console.log('About to initialize status dot handlers...');
    // Initialize status dot handlers (after components are loaded)
    initStatusDotHandlers();
    console.log('Status dot handlers initialized');
    
    // Check Web Bluetooth support
    if (navigator.bluetooth) {
        setStatus('Web Bluetooth ready. Click Connect to begin.');
    } else {
        setStatus('Web Bluetooth is NOT supported in this browser/platform. Try Chrome on Android, ChromeOS, or macOS/Windows.');
        const connectButton = document.getElementById('connectButton');
        if (connectButton) {
            connectButton.disabled = true;
        }
    }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
