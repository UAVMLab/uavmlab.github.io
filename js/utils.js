// Utility functions
import { MAX_LOG_LINES } from './constants.js';
import { state } from './state.js';

const logBuffer = ['Ready.'];

export function switchTab(tabName) {
    const tabButtons = document.querySelectorAll('.tab-button');
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    // Update top tab buttons (hidden but kept for consistency)
    tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
    
    // Update bottom nav items
    bottomNavItems.forEach((item) => item.classList.toggle('active', item.dataset.tab === tabName));
    
    // Update panels
    tabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
    
    // Scroll to top when switching tabs
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function toggleInterface(isConnected) {
    // Tabbed interface is always visible, just show bottom nav
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = 'flex';
}

export function setStatus(message, isConnected = false) {
    const statusText = document.getElementById('statusText');
    statusText.textContent = message;
    statusText.style.color = isConnected ? '#28a745' : '#dc3545';
    state.connected = isConnected;

    document.querySelectorAll('[data-connected-only]').forEach((el) => {
        el.disabled = !isConnected;
    });

    // Toggle between connection view and tabbed interface
    toggleInterface(isConnected);
}

export function appendLog(message) {
    const logOutput = document.getElementById('logOutput');
    const timestamp = new Date().toLocaleTimeString();
    logBuffer.push(`[${timestamp}] ${message}`);
    while (logBuffer.length > MAX_LOG_LINES) {
        logBuffer.shift();
    }
    logOutput.textContent = logBuffer.join('\n');
    logOutput.scrollTop = logOutput.scrollHeight;
}

// Haptic feedback utility functions
export function vibrate(duration = 10) {
    if ('vibrate' in navigator) {
        navigator.vibrate(duration);
    }
}

export function vibratePattern(pattern) {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
}
