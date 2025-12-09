// Utility functions
import { MAX_LOG_LINES } from './constants.js';
import { state } from './state.js';

const logBuffer = [{ timestamp: new Date(), type: 'info', message: 'Ready.' }];

// Log filter state
export const logFilters = {
    info: true,
    warning: true,
    error: true,
    rx: false,
    tx: false
};

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
    
    // Call tab-specific handlers
    if (tabName === 'profiles' && typeof window.onProfilesTabOpen === 'function') {
        window.onProfilesTabOpen();
    }
    if (tabName === 'control' && typeof window.onControlTabOpen === 'function') {
        window.onControlTabOpen();
    }
}

export function toggleInterface(isConnected) {
    // Tabbed interface is always visible, just show bottom nav
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = 'flex';
}

export function setStatus(message, isConnected = false) {
    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = message;
        statusText.style.color = isConnected ? '#28a745' : '#dc3545';
    }
    state.connected = isConnected;

    document.querySelectorAll('[data-connected-only]').forEach((el) => {
        // For form elements (buttons, inputs, selects)
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
            el.disabled = !isConnected;
        } else {
            // For div elements and other non-form elements
            if (isConnected) {
                el.classList.remove('disabled');
                el.removeAttribute('disabled');
            } else {
                el.classList.add('disabled');
                el.setAttribute('disabled', 'true');
            }
        }
    });
    
    // Update status dots to gray when disconnected
    const statusDots = document.querySelectorAll('.status-dot');
    statusDots.forEach(dot => {
        if (isConnected) {
            dot.classList.remove('disconnected');
        } else {
            dot.classList.add('disconnected');
        }
    });

    // Toggle between connection view and tabbed interface
    toggleInterface(isConnected);
}

// Determine log type from message content
function detectLogType(message) {
    const lowerMsg = message.toLowerCase();
    
    if (message.startsWith('RX:') || message.startsWith('←')) {
        return 'rx';
    }
    if (message.startsWith('TX:') || message.startsWith('→')) {
        return 'tx';
    }
    if (lowerMsg.includes('error') || lowerMsg.includes('failed') || lowerMsg.includes('disconnect')) {
        return 'error';
    }
    if (lowerMsg.includes('warning') || lowerMsg.includes('warn')) {
        return 'warning';
    }
    return 'info';
}

export function appendLog(message, type = null) {
    const timestamp = new Date();
    const logType = type || detectLogType(message);
    
    logBuffer.push({ timestamp, type: logType, message });
    
    while (logBuffer.length > MAX_LOG_LINES) {
        logBuffer.shift();
    }
    
    updateLogDisplay();
}

export function updateLogDisplay() {
    const logOutput = document.getElementById('logOutput');
    if (!logOutput) return;
    
    const filteredLogs = logBuffer.filter(log => logFilters[log.type]);
    
    const logHTML = filteredLogs.map(log => {
        const timeStr = log.timestamp.toLocaleTimeString();
        const colorClass = `log-${log.type}`;
        return `<span class="${colorClass}">[${timeStr}] ${log.message}</span>`;
    }).join('\n');
    
    logOutput.innerHTML = logHTML || 'No logs to display.';
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
