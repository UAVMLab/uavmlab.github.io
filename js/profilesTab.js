// Profiles tab module
import { state } from './state.js';
import { sendCommand } from './bluetooth.js';
import { appendLog } from './utils.js';

let currentProfile = null;
let receivedProfiles = [];

export function initProfilesTab() {
    const loadProfilesButton = document.getElementById('loadProfilesButton');
    const addProfileButton = document.getElementById('addProfileButton');
    const modifyCheckbox = document.getElementById('modifyProfileCheckbox');
    const profileForm = document.getElementById('profileForm');
    const setProfileButton = document.getElementById('setProfileButton');
    const removeProfileButton = document.getElementById('removeProfileButton');
    const downloadProfileButton = document.getElementById('downloadProfileButton');
    const saveProfileButton = document.getElementById('saveProfileButton');
    const cancelModifyButton = document.getElementById('cancelModifyButton');

    loadProfilesButton.addEventListener('click', loadProfilesFromDevice);
    addProfileButton.addEventListener('click', addNewProfile);
    modifyCheckbox.addEventListener('change', toggleModifyMode);
    profileForm.addEventListener('submit', saveProfile);
    setProfileButton.addEventListener('click', setActiveProfile);
    removeProfileButton.addEventListener('click', removeProfile);
    downloadProfileButton.addEventListener('click', downloadProfile);
    cancelModifyButton.addEventListener('click', cancelModify);
    
    // Initialize profile display
    renderProfileList();
}

async function loadProfilesFromDevice() {
    try {
        // Clear previous profiles
        receivedProfiles = [];
        renderProfileList();
        
        await sendCommand('get_profile_list');
        appendLog('Requesting profile list from device...');
    } catch (error) {
        appendLog(`Failed to load profiles: ${error.message}`);
    }
}

export function handleProfileMessage(profile) {
    // Convert device profile format to internal format
    const normalizedProfile = {
        profileName: profile.name,
        motorKV: profile.m_kv,
        propellerDetails: profile.prop,
        batteryType: profile.bat,
        motorPoles: profile.mPole,
        motorReverse: profile.mRev,
        armThrottle: profile.armThrt,
        maxRPM: profile.mRpmLim,
        maxESCTemp: profile.escTempLim,
        maxMotorTemp: profile.mTempLim,
        maxCurrent: profile.curLim
    };
    
    receivedProfiles.push(normalizedProfile);
    
    // Update the profiles in state
    if (!state.lastRxProfiles) {
        state.lastRxProfiles = { profiles: [] };
    }
    state.lastRxProfiles.profiles = receivedProfiles;
    
    // Re-render the list
    renderProfileList();
    appendLog(`Profile "${profile.name}" received.`);
}

function renderProfileList() {
    const profileList = document.getElementById('profileList');
    profileList.innerHTML = '';
    
    if (!state.lastRxProfiles || !state.lastRxProfiles.profiles || state.lastRxProfiles.profiles.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'No profiles available.';
        profileList.appendChild(empty);
        return;
    }

    state.lastRxProfiles.profiles.forEach((profile) => {
        const item = document.createElement('div');
        item.className = 'profile-list-item';
        if (currentProfile && currentProfile.profileName === profile.profileName) {
            item.classList.add('active');
        }
        item.innerHTML = `
            <div class="profile-list-name">${profile.profileName}</div>
            <div class="profile-list-details">${profile.motorKV} • ${profile.propellerDetails}</div>
        `;
        item.addEventListener('click', () => showProfileDetails(profile));
        profileList.appendChild(item);
    });
}

function showProfileDetails(profile) {
    currentProfile = profile;
    
    // Show the details card
    const detailsCard = document.getElementById('profileDetailsCard');
    detailsCard.style.display = 'block';
    
    // Populate form fields
    document.getElementById('profileName').value = profile.profileName || '';
    document.getElementById('motorKV').value = profile.motorKV || '';
    document.getElementById('propellerDetails').value = profile.propellerDetails || '';
    document.getElementById('batteryType').value = profile.batteryType || 0;
    document.getElementById('motorPoles').value = profile.motorPoles || 14;
    document.getElementById('motorReverse').checked = profile.motorReverse || false;
    document.getElementById('armThrottle').value = profile.armThrottle || 48;
    document.getElementById('maxRPM').value = profile.maxRPM || 0;
    document.getElementById('maxESCTemp').value = profile.maxESCTemp || 0;
    document.getElementById('maxMotorTemp').value = profile.maxMotorTemp || 0;
    document.getElementById('maxCurrent').value = profile.maxCurrent || 0;
    
    // Reset modify mode
    document.getElementById('modifyProfileCheckbox').checked = false;
    toggleModifyMode();
    
    // Update active state in list
    renderProfileList();
}

function toggleModifyMode() {
    const isModifying = document.getElementById('modifyProfileCheckbox').checked;
    const formFields = document.querySelectorAll('#profileForm input, #profileForm select');
    const profileActions = document.getElementById('profileActions');
    const modifyActions = document.getElementById('profileModifyActions');
    const profileNameField = document.getElementById('profileName');
    
    // Check if this is a new profile (name is "New Profile" or not in existing profiles)
    const existingProfiles = state.lastRxProfiles?.profiles || receivedProfiles;
    const isNewProfile = !currentProfile || 
                         currentProfile.profileName === 'New Profile' ||
                         !existingProfiles.some(p => p.profileName === currentProfile.profileName);
    
    // Enable/disable form fields
    formFields.forEach(field => {
        if (field.id === 'profileName') {
            // Allow editing name for new profiles, disable for existing profiles
            field.disabled = !isModifying || !isNewProfile;
        } else if (field.id !== 'modifyProfileCheckbox') {
            field.disabled = !isModifying;
        }
    });
    
    // Toggle action button visibility
    if (isModifying) {
        profileActions.style.display = 'none';
        modifyActions.style.display = 'flex';
    } else {
        profileActions.style.display = 'flex';
        modifyActions.style.display = 'none';
    }
}

async function saveProfile(e) {
    e.preventDefault();
    
    if (!currentProfile) return;
    
    const enteredName = document.getElementById('profileName').value.trim();
    
    // Convert to device format
    const profileData = {
        name: enteredName,
        m_kv: document.getElementById('motorKV').value,
        prop: document.getElementById('propellerDetails').value,
        bat: parseInt(document.getElementById('batteryType').value),
        mPole: parseInt(document.getElementById('motorPoles').value),
        mRev: document.getElementById('motorReverse').checked,
        armThrt: parseInt(document.getElementById('armThrottle').value),
        mRpmLim: parseInt(document.getElementById('maxRPM').value),
        escTempLim: parseFloat(document.getElementById('maxESCTemp').value),
        mTempLim: parseFloat(document.getElementById('maxMotorTemp').value),
        curLim: parseFloat(document.getElementById('maxCurrent').value)
    };
    
    // Validate motor poles (must be even)
    if (profileData.mPole % 2 !== 0) {
        appendLog('ERROR: Motor poles must be an even number');
        return;
    }
    
    // Check if this is a new profile or name changed
    const existingProfiles = state.lastRxProfiles?.profiles || receivedProfiles;
    const profileExists = existingProfiles.some(p => p.profileName === enteredName);
    const isNewOrRenamed = !profileExists || (currentProfile.profileName !== enteredName);
    
    const command = isNewOrRenamed ? 'create_profile' : 'save_profile';
    
    try {
        await sendCommand(command, profileData);
        appendLog(`Profile "${profileData.name}" ${isNewOrRenamed ? 'create' : 'save'} requested.`);
        
        // Update current profile name
        currentProfile.profileName = enteredName;
        
        // Exit modify mode
        document.getElementById('modifyProfileCheckbox').checked = false;
        toggleModifyMode();
    } catch (error) {
        appendLog(`Failed to ${isNewOrRenamed ? 'create' : 'save'} profile: ${error.message}`);
    }
}

function cancelModify() {
    // Reset form to current profile values
    if (currentProfile) {
        showProfileDetails(currentProfile);
    }
    
    document.getElementById('modifyProfileCheckbox').checked = false;
    toggleModifyMode();
}

async function setActiveProfile() {
    if (!currentProfile) return;
    
    try {
        await sendCommand('load_profile', { value: currentProfile.profileName });
        appendLog(`Set profile "${currentProfile.profileName}" as active.`);
    } catch (error) {
        appendLog(`Failed to set profile: ${error.message}`);
    }
}

async function removeProfile() {
    if (!currentProfile) return;
    
    if (!confirm(`Are you sure you want to remove profile "${currentProfile.profileName}"?`)) {
        return;
    }
    
    try {
        await sendCommand('delete_profile', { value: currentProfile.profileName });
        appendLog(`Profile "${currentProfile.profileName}" removal requested.`);
        
        // Hide details card and clear current profile
        document.getElementById('profileDetailsCard').style.display = 'none';
        currentProfile = null;
    } catch (error) {
        appendLog(`Failed to remove profile: ${error.message}`);
    }
}

function downloadProfile() {
    if (!currentProfile) return;
    
    const dataStr = JSON.stringify(currentProfile, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentProfile.profileName}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    appendLog(`Profile "${currentProfile.profileName}" downloaded.`);
}

function addNewProfile() {
    // Create a new empty profile
    const newProfile = {
        profileName: 'New Profile',
        motorKV: '',
        propellerDetails: '',
        batteryType: 0,
        motorPoles: 14,
        motorReverse: false,
        armThrottle: 48,
        maxRPM: 0,
        maxESCTemp: 0,
        maxMotorTemp: 0,
        maxCurrent: 0
    };
    
    showProfileDetails(newProfile);
    
    // Automatically enable modify mode for new profile
    document.getElementById('modifyProfileCheckbox').checked = true;
    toggleModifyMode();
}

// Export function to update profile list when new data arrives
export function updateProfileList() {
    renderProfileList();
}
