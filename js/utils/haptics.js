// haptics.js
// Haptic feedback utilities for the UAVMLab web app

/**
 * Triggers a simple vibration.
 * @param {number} duration - Duration in milliseconds (default: 10)
 */
export function vibrate(duration = 10) {
    if ('vibrate' in navigator) {
        navigator.vibrate(duration);
    }
}

/**
 * Triggers a vibration pattern.
 * @param {number[]} pattern - Array of vibration and pause durations
 */
export function vibratePattern(pattern) {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
}
