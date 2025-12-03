// HTML Component Loader
export async function loadComponent(componentPath, targetSelector) {
    try {
        const response = await fetch(componentPath);
        if (!response.ok) {
            throw new Error(`Failed to load component: ${componentPath}`);
        }
        const html = await response.text();
        const target = document.querySelector(targetSelector);
        if (target) {
            target.innerHTML = html;
        } else {
            console.error(`Target selector not found: ${targetSelector}`);
        }
    } catch (error) {
        console.error('Error loading component:', error);
    }
}

export async function loadComponents() {
    // Load all components in parallel
    await Promise.all([
        loadComponent('components/header.html', '#header-container'),
        loadComponent('components/connection-view.html', '#connection-view-container'),
        loadComponent('components/tab-navigation.html', '#tab-navigation-container'),
        loadComponent('components/tab-connection.html', '#tab-connection-container'),
        loadComponent('components/tab-profiles.html', '#tab-profiles-container'),
        loadComponent('components/tab-control.html', '#tab-control-container'),
        loadComponent('components/tab-results.html', '#tab-results-container'),
        loadComponent('components/tab-logs.html', '#tab-logs-container'),
        loadComponent('components/bottom-nav.html', '#bottom-nav-container'),
        loadComponent('components/footer.html', '#footer-container')
    ]);
}
