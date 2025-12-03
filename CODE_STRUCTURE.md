# Drone Motor Test Platform - Code Structure

## Overview
The application has been refactored into a fully modular architecture with separate files for JavaScript modules and HTML components.

## File Structure

```
/
├── index.html              # Main HTML shell (container divs only)
├── style.css              # All styles and responsive design
├── app.js                 # Application entry point
├── main.js                # Legacy file (can be removed)
├── components/            # HTML Components
│   ├── header.html           # Header section
│   ├── connection-view.html  # Initial connection screen
│   ├── tab-navigation.html   # Top tab navigation bar
│   ├── tab-connection.html   # Connection tab content
│   ├── tab-profiles.html     # Profiles tab content
│   ├── tab-control.html      # Control tab content
│   ├── tab-results.html      # Results tab content
│   ├── tab-logs.html         # Logs tab content
│   ├── bottom-nav.html       # Mobile bottom navigation
│   └── footer.html           # Footer section
└── js/                    # JavaScript Modules
    ├── componentLoader.js # HTML component loader utility
    ├── constants.js       # BLE UUIDs and constants
    ├── state.js          # Global application state
    ├── utils.js          # Utility functions (logging, interface toggling)
    ├── bluetooth.js      # BLE communication layer
    ├── navigation.js     # Tab and bottom nav management
    ├── connectionTab.js  # Connection tab functionality
    ├── profilesTab.js    # Profile management tab
    ├── controlTab.js     # Motor control tab
    ├── resultsTab.js     # Test results and charts
    └── logsTab.js        # Logs functionality
```

## Module Description

### HTML Components (`components/`)

#### `header.html`
- Application header with title and badge
- Responsive layout for mobile and desktop

#### `connection-view.html`
- Initial connection screen shown when not connected
- Connection button and status display
- Scan options checkbox

#### `tab-navigation.html`
- Top navigation bar with 5 tab buttons
- Hidden on mobile (replaced by bottom nav)

#### Tab Content Components
- `tab-connection.html` - Connection status, device history, device snapshot
- `tab-profiles.html` - Profile table and edit form
- `tab-control.html` - Control actions, telemetry metrics, status
- `tab-results.html` - Performance charts (power, thrust, thermal)
- `tab-logs.html` - Log output display

#### `bottom-nav.html`
- Mobile bottom navigation bar with icons
- 5 navigation buttons matching tabs
- Auto-hidden on desktop

#### `footer.html`
- Browser compatibility information
- Footer content

### JavaScript Modules (`js/`)

#### `componentLoader.js`
- `loadComponent()` - Loads individual HTML component
- `loadComponents()` - Loads all components in parallel
- Uses fetch API for component loading

#### `app.js`
- Main entry point
- Loads HTML components first
- Initializes all JavaScript modules
- Checks Web Bluetooth support

#### `constants.js`
- Nordic UART Service UUIDs
- App Discovery Service UUIDs
- Text encoder/decoder instances
- Application constants

#### `state.js`
- Global application state object
- BLE connection state (device, server, characteristics)
- Getter/setter functions for BLE objects

#### `utils.js`
- `switchTab()` - Tab switching logic
- `toggleInterface()` - Show/hide connection view vs tabbed interface
- `setStatus()` - Update connection status
- `appendLog()` - Add entries to log output

#### `bluetooth.js`
- `sendCommand()` - Send commands to BLE device via NUS

#### `navigation.js`
- `initNavigation()` - Initialize top tabs and bottom nav bar
- Event listeners for tab switching

#### `connectionTab.js`
- `initConnectionTab()` - Initialize connection tab
- `connectDevice()` - BLE device connection flow
- `disconnectDevice()` - Disconnect from device
- `handleTelemetry()` - Process incoming telemetry data
- Device list management

#### `profilesTab.js`
- `initProfilesTab()` - Initialize profiles tab
- Profile CRUD operations (Create, Read, Update, Delete)
- Profile rendering and selection
- Sync profiles with device

#### `controlTab.js`
- `initControlTab()` - Initialize control tab
- Arm/Disarm functionality with force arm option
- Throttle control
- Test mode and duration settings
- Run/Stop test operations

#### `resultsTab.js`
- `initResultsTab()` - Initialize results tab
- `drawCharts()` - Render performance charts
- Canvas-based chart drawing for power, thrust, thermal data

#### `logsTab.js`
- `initLogsTab()` - Initialize logs tab
- Placeholder for future log features (filtering, export, etc.)

## Application Flow

1. **Page Load**: Browser loads `index.html` (minimal shell)
2. **Component Loading**: `componentLoader.js` fetches and injects all HTML components
3. **Module Initialization**: Each JavaScript module initializes its functionality
4. **Connection Flow**: User connects → interface switches from connection view to tabs
5. **Tab Navigation**: Users can switch between tabs using top nav (desktop) or bottom nav (mobile)

## Usage

### Modifying HTML Content

To edit any UI section, simply modify the corresponding component file in `components/`:
- No need to search through large HTML files
- Changes are isolated to specific features
- Easy to understand and maintain

### Adding New Components

1. Create HTML file in `components/` folder
2. Add container div in `index.html`
3. Update `componentLoader.js` to load the new component
4. Create corresponding JS module if needed

### Adding New Features

1. **New Tab**: 
   - Create `components/tab-newfeature.html`
   - Create `js/newfeatureTab.js`
   - Add container in `index.html`
   - Update `componentLoader.js`
   - Import and call init function in `app.js`

2. **New Component**:
   - Create component HTML file
   - Add load call in `componentLoader.js`
   - Add container div in `index.html`

### State Management

Access global state through `state.js`:
```javascript
import { state } from './state.js';
state.profiles.push(newProfile);
```

### BLE Communication

Use bluetooth.js for all BLE operations:
```javascript
import { sendCommand } from './bluetooth.js';
await sendCommand('arm');
```

## Benefits of Modular Structure

### HTML Component Separation
1. **Single Responsibility**: Each component file contains only one feature
2. **Easy Updates**: Modify specific sections without affecting others
3. **Reusability**: Components can be reused across different pages
4. **Parallel Development**: Multiple developers can work on different components
5. **Version Control**: Easier to track changes to specific features

### JavaScript Module Separation
1. **Separation of Concerns**: Each module has a single responsibility
2. **Maintainability**: Easy to locate and update specific functionality
3. **Testability**: Modules can be tested independently
4. **Scalability**: Easy to add new features without modifying existing code
5. **Readability**: Smaller files are easier to understand

### Overall Architecture Benefits
1. **Clean index.html**: Main file is just a shell with container divs
2. **Lazy Loading Ready**: Easy to implement lazy loading for performance
3. **SEO Friendly**: Can pre-render components for SEO if needed
4. **Hot Reload Compatible**: Changes to components can be hot-reloaded
5. **Build Tool Ready**: Easy to integrate with build tools (webpack, vite, etc.)

## Browser Compatibility

- **ES6 Modules**: All modern browsers support this natively
- **Fetch API**: Used for loading HTML components
- **Web Bluetooth**: Chrome/Edge on Android, ChromeOS, macOS, Windows

## Development Workflow

1. Edit component HTML files for UI changes
2. Edit JavaScript modules for functionality changes
3. Components load automatically on page refresh
4. No build step required for development
5. Production: Can add minification and bundling if desired
