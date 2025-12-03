// Navigation bar module
import { switchTab } from './utils.js';

export function initNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    
    // Handle top tab buttons
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab);
        });
    });
    
    // Handle bottom nav items
    bottomNavItems.forEach((item) => {
        item.addEventListener('click', () => {
            switchTab(item.dataset.tab);
        });
    });
}
