// Core status management and indicator updates

// Status bit definitions
export const STATUS_BITS = {
    // Initialization Status
    USR_CFG_PROF_OK: 1 << 0,
    DSHOT_OK: 1 << 1,
    KISS_TELEM_OK: 1 << 2,
    HX711_OK: 1 << 3,
    NTC_SENSOR_OK: 1 << 4,
    
    // Task Status
    DSHOT_TASK_RUNNING: 1 << 5,
    KISS_TELEM_TASK_RUNNING: 1 << 6,
    SENSOR_TASK_RUNNING: 1 << 7,
    
    // Runtime Status
    MOTOR_ARMED: 1 << 8,
    MOTOR_SPINNING: 1 << 9,
    DSHOT_SEND_OK: 1 << 10,
    KISS_TELEM_READ_OK: 1 << 11,
    HX711_TARE_OK: 1 << 12,
    HX711_READ_OK: 1 << 13,
    NTC_SENSOR_READ_OK: 1 << 14,
    
    // Warning Flags
    WARN_BATTERY_LOW: 1 << 15,
    WARN_ESC_OVERHEAT: 1 << 16,
    WARN_MOTOR_OVERHEAT: 1 << 17,
    WARN_OVER_CURRENT: 1 << 18,
    WARN_OVER_RPM: 1 << 19,
    WARN_MOTOR_STALL: 1 << 20,
    WARN_FULL_USR_CFG_PRFLS: 1 << 21
};

/**
 * Updates all status indicator dots based on status bitmask
 * @param {number} status - Status bitmask
 */
export function updateStatusIndicators(status) {
    // Initialization Status
    updateDot('status-cfg', status & STATUS_BITS.USR_CFG_PROF_OK);
    updateDot('status-dshot', status & STATUS_BITS.DSHOT_OK);
    updateDot('status-kiss', status & STATUS_BITS.KISS_TELEM_OK);
    updateDot('status-hx711', status & STATUS_BITS.HX711_OK);
    updateDot('status-ntc', status & STATUS_BITS.NTC_SENSOR_OK);
    
    // Task Status
    updateDot('status-dshot-task', status & STATUS_BITS.DSHOT_TASK_RUNNING);
    updateDot('status-kiss-task', status & STATUS_BITS.KISS_TELEM_TASK_RUNNING);
    updateDot('status-sensor-task', status & STATUS_BITS.SENSOR_TASK_RUNNING);
    
    // Runtime Status
    updateDot('status-armed', status & STATUS_BITS.MOTOR_ARMED);
    updateDot('status-spinning', status & STATUS_BITS.MOTOR_SPINNING);
    updateDot('status-dshot-send', status & STATUS_BITS.DSHOT_SEND_OK);
    updateDot('status-kiss-read', status & STATUS_BITS.KISS_TELEM_READ_OK);
    updateDot('status-hx711-tare', status & STATUS_BITS.HX711_TARE_OK);
    updateDot('status-hx711-read', status & STATUS_BITS.HX711_READ_OK);
    updateDot('status-ntc-read', status & STATUS_BITS.NTC_SENSOR_READ_OK);
    
    // Warning Flags (inverted logic)
    updateDot('status-warn-battery', status & STATUS_BITS.WARN_BATTERY_LOW, true);
    updateDot('status-warn-esc', status & STATUS_BITS.WARN_ESC_OVERHEAT, true);
    updateDot('status-warn-motor', status & STATUS_BITS.WARN_MOTOR_OVERHEAT, true);
    updateDot('status-warn-current', status & STATUS_BITS.WARN_OVER_CURRENT, true);
    updateDot('status-warn-rpm', status & STATUS_BITS.WARN_OVER_RPM, true);
    updateDot('status-warn-stall', status & STATUS_BITS.WARN_MOTOR_STALL, true);
    updateDot('status-warn-cfg', status & STATUS_BITS.WARN_FULL_USR_CFG_PRFLS, true);
    
    // Check motor status for auto-disarm
    if (typeof window.checkMotorStatus === 'function') {
        window.checkMotorStatus(status);
    }

    // Notify Analize tab
    if (typeof window.updateAnalizeStatusUI === 'function') {
        window.updateAnalizeStatusUI();
    }
}

/**
 * Updates a single status dot element
 * @param {string} id - Element ID
 * @param {boolean} isActive - Whether status is active
 * @param {boolean} isWarning - Whether this is a warning indicator
 */
function updateDot(id, isActive, isWarning = false) {
    const dot = document.getElementById(id);
    if (!dot) return;
    
    dot.classList.remove('active', 'inactive', 'warning', 'ok');
    
    if (isWarning) {
        // For warnings: 0 = ok (green), 1 = warning (orange)
        dot.classList.add(isActive ? 'warning' : 'ok');
    } else {
        // For normal status: 0 = inactive (red), 1 = active (green)
        dot.classList.add(isActive ? 'active' : 'inactive');
    }
}
