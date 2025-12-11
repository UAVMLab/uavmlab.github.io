// statusUtil.js
// Status and connection utilities for the UAVMLab web app
import { state } from '../state.js';
import { toggleInterface } from './uiUtils.js';

/**
 * Sets the connection status message and updates UI elements.
 * @param {string} message - The status message to display.
 * @param {boolean} isConnected - Whether the device is connected.
 */
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
