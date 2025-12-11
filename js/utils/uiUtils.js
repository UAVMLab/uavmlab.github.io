// uiUtils.js
// UI and tab navigation utilities for the UAVMLab web app

/**
 * Switches the active tab and updates navigation UI.
 * @param {string} tabName - The name of the tab to activate.
 */
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
    if (tabName === 'analize' && typeof window.onAnalizeTabOpen === 'function') {
        window.onAnalizeTabOpen();
    }
}

/**
 * Shows or hides the bottom navigation bar based on connection state.
 * @param {boolean} isConnected - Whether the device is connected.
 */
export function toggleInterface(isConnected) {
    // Tabbed interface is always visible, just show bottom nav
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = 'flex';
}
