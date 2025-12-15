// Core metric indicator updates (battery, RPM, thrust, current, temperature)

/**
 * Gets the current active profile
 */
function getCurrentActiveProfile() {
    if (typeof window.getCurrentActiveProfile === 'function') {
        return window.getCurrentActiveProfile();
    }
    return null;
}

/**
 * Calculates gradient background based on percentage and thresholds
 * @param {number} percentage - Percentage (0-100)
 * @param {boolean} inverse - If true, higher percentage = red (danger)
 */
function getGradientColor(percentage, inverse = false) {
    let color;
    if (inverse) {
        // Higher = more dangerous (RPM, current, temp)
        if (percentage > 90) color = 'rgba(250, 60, 79, 0.6)'; // Red
        else if (percentage > 70) color = 'rgba(252, 114, 64, 0.6)'; // Orange
        else if (percentage > 50) color = 'rgba(246, 188, 15, 0.6)'; // Yellow
        else color = 'rgba(57, 238, 99, 0.6)'; // Green
    } else {
        // Lower = more dangerous (battery)
        if (percentage > 60) color = 'rgba(57, 238, 99, 0.6)'; // Green
        else if (percentage > 30) color = 'rgba(246, 188, 15, 0.6)'; // Yellow
        else if (percentage > 15) color = 'rgba(252, 114, 64, 0.6)'; // Orange
        else color = 'rgba(250, 60, 79, 0.6)'; // Red
    }
    return color;
}

/**
 * Applies gradient to a parent element
 * @param {string} selector - Parent element selector
 * @param {number} percentage - Percentage for gradient
 * @param {string} color - Color for gradient
 */
function applyGradient(selector, percentage, color) {
    const parent = document.querySelector(selector);
    if (parent) {
        parent.style.background = `linear-gradient(to right, ${color} ${percentage}%, transparent ${percentage}%)`;
    }
}

/**
 * Clears gradient from a parent element
 * @param {string} selector - Parent element selector
 */
function clearGradient(selector) {
    const parent = document.querySelector(selector);
    if (parent) {
        parent.style.background = '';
    }
}

// ===== BATTERY INDICATORS =====

export function updateBatteryIndicator(voltage) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.batteryCellCount || activeProfile.batteryCellCount === 0) {
        clearGradient('.metric:has(#voltageMetric)');
        return;
    }
    
    const cellCount = activeProfile.batteryCellCount;
    const minVoltagePerCell = 3.0;
    const maxVoltagePerCell = 4.2;
    
    const minVoltage = cellCount * minVoltagePerCell;
    const maxVoltage = cellCount * maxVoltagePerCell;
    
    let percentage = ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, false);
    applyGradient('.metric:has(#voltageMetric)', percentage, color);
}

export function updateBatteryIndicatorAnalize(voltage) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.batteryCellCount || activeProfile.batteryCellCount === 0) {
        clearGradient('.metric:has(#analizeVoltage)');
        return;
    }
    
    const cellCount = activeProfile.batteryCellCount;
    const minVoltagePerCell = 3.0;
    const maxVoltagePerCell = 4.2;
    const minVoltage = cellCount * minVoltagePerCell;
    const maxVoltage = cellCount * maxVoltagePerCell;
    
    let percentage = ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, false);
    applyGradient('.metric:has(#analizeVoltage)', percentage, color);
}

// ===== RPM INDICATORS =====

export function updateRPMIndicator(rpm) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxRPM || activeProfile.maxRPM === 0) {
        clearGradient('.metric:has(#rpmMetric)');
        return;
    }
    
    const maxRPM = activeProfile.maxRPM;
    let percentage = (rpm / maxRPM) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, true);
    applyGradient('.metric:has(#rpmMetric)', percentage, color);
}

export function updateRPMIndicatorAnalize(rpm) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxRPM || activeProfile.maxRPM === 0) {
        clearGradient('.metric:has(#analizeRpm)');
        return;
    }
    
    const maxRPM = activeProfile.maxRPM;
    let percentage = (rpm / maxRPM) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, true);
    applyGradient('.metric:has(#analizeRpm)', percentage, color);
}

// ===== THRUST INDICATORS =====

export function updateThrustIndicator(thrust) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxThrust || activeProfile.maxThrust === 0) {
        clearGradient('.metric:has(#thrustMetric)');
        return;
    }
    
    const thrustKg = thrust / 1000;
    const maxThrust = activeProfile.maxThrust;
    let percentage = (thrustKg / maxThrust) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, true);
    applyGradient('.metric:has(#thrustMetric)', percentage, color);
}

export function updateThrustIndicatorAnalize(thrust) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxThrust || activeProfile.maxThrust === 0) {
        clearGradient('.metric:has(#analizeThrust)');
        return;
    }
    
    const thrustKg = thrust / 1000;
    const maxThrust = activeProfile.maxThrust;
    let percentage = (thrustKg / maxThrust) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, true);
    applyGradient('.metric:has(#analizeThrust)', percentage, color);
}

// ===== CURRENT INDICATORS =====

export function updateCurrentIndicator(current) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxCurrent || activeProfile.maxCurrent === 0) {
        clearGradient('.metric:has(#currentMetric)');
        return;
    }
    
    const maxCurrent = activeProfile.maxCurrent;
    let percentage = (current / maxCurrent) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, true);
    applyGradient('.metric:has(#currentMetric)', percentage, color);
}

export function updateCurrentIndicatorAnalize(current) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxCurrent || activeProfile.maxCurrent === 0) {
        clearGradient('.metric:has(#analizeCurrent)');
        return;
    }
    
    const maxCurrent = activeProfile.maxCurrent;
    let percentage = (current / maxCurrent) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, true);
    applyGradient('.metric:has(#analizeCurrent)', percentage, color);
}

// ===== ESC TEMPERATURE INDICATORS =====

export function updateESCTempIndicator(temp) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxESCTemp || activeProfile.maxESCTemp === 0) {
        clearGradient('.metric:has(#escTempMetric)');
        return;
    }
    
    const maxTemp = activeProfile.maxESCTemp;
    let percentage = (temp / maxTemp) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, true);
    applyGradient('.metric:has(#escTempMetric)', percentage, color);
}

export function updateESCTempIndicatorAnalize(temp) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxESCTemp || activeProfile.maxESCTemp === 0) {
        clearGradient('.metric:has(#analizeEscTemp)');
        return;
    }
    
    const maxTemp = activeProfile.maxESCTemp;
    let percentage = (temp / maxTemp) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, true);
    applyGradient('.metric:has(#analizeEscTemp)', percentage, color);
}

// ===== MOTOR TEMPERATURE INDICATORS =====

export function updateMotorTempIndicator(temp) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxMotorTemp || activeProfile.maxMotorTemp === 0) {
        clearGradient('.metric:has(#motorTempMetric)');
        return;
    }
    
    const maxTemp = activeProfile.maxMotorTemp;
    let percentage = (temp / maxTemp) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, true);
    applyGradient('.metric:has(#motorTempMetric)', percentage, color);
}

export function updateMotorTempIndicatorAnalize(temp) {
    const activeProfile = getCurrentActiveProfile();
    if (!activeProfile || !activeProfile.maxMotorTemp || activeProfile.maxMotorTemp === 0) {
        clearGradient('.metric:has(#analizeMotorTemp)');
        return;
    }
    
    const maxTemp = activeProfile.maxMotorTemp;
    let percentage = (temp / maxTemp) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    const color = getGradientColor(percentage, true);
    applyGradient('.metric:has(#analizeMotorTemp)', percentage, color);
}
