// Navigation bar module
import { vibrate } from '../../utils/haptics.js';
import { switchTab } from '../../utils/uiUtils.js';

export function initNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    
    // Handle top tab buttons
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            vibrate(15); // Light haptic feedback for tab switch
            switchTab(button.dataset.tab);
        });
    });
    
    // Handle bottom nav items
    bottomNavItems.forEach((item) => {
        item.addEventListener('click', () => {
            vibrate(15); // Light haptic feedback for tab switch
            switchTab(item.dataset.tab);
        });
    });
}
