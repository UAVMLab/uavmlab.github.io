// Profiles tab module
import { state } from './state.js';
import { sendCommand } from './bluetooth.js';
import { appendLog } from './utils.js';

export function initProfilesTab() {
    const loadProfilesButton = document.getElementById('loadProfilesButton');
    const syncProfileButton = document.getElementById('syncProfileButton');
    const addProfileButton = document.getElementById('addProfileButton');
    const profileForm = document.getElementById('profileForm');
    const deleteProfileButton = document.getElementById('deleteProfileButton');

    loadProfilesButton.addEventListener('click', loadProfiles);
    syncProfileButton.addEventListener('click', syncProfile);
    addProfileButton.addEventListener('click', addProfile);
    profileForm.addEventListener('submit', saveProfile);
    deleteProfileButton.addEventListener('click', deleteProfile);
    
    // Initialize profile display
    renderProfiles();
    updateProfileActionState();
}

function renderProfiles() {
    const profileRows = document.getElementById('profileRows');
    profileRows.innerHTML = '';
    if (!state.profiles.length) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'No profiles defined.';
        profileRows.appendChild(empty);
        return;
    }

    state.profiles.forEach((profile) => {
        const row = document.createElement('div');
        row.className = 'profile-table-row';
        if (profile.id === state.selectedProfileId) {
            row.classList.add('active');
        }
        row.innerHTML = `
            <div data-label="Name">${profile.name}</div>
            <div data-label="Motors">${profile.motorDetails || '—'}</div>
            <div data-label="Prop">${profile.propDetails || '—'}</div>
            <div><button type="button" data-profile-id="${profile.id}">Select</button></div>
        `;

        row.querySelector('button').addEventListener('click', () => selectProfile(profile.id));
        profileRows.appendChild(row);
    });
}

function selectProfile(profileId) {
    const profileNameInput = document.getElementById('profileName');
    const motorDetailsInput = document.getElementById('motorDetails');
    const propDetailsInput = document.getElementById('propDetails');
    const otherParamsInput = document.getElementById('otherParams');
    
    state.selectedProfileId = profileId;
    const profile = state.profiles.find((item) => item.id === profileId);
    if (!profile) {
        return;
    }
    profileNameInput.value = profile.name;
    motorDetailsInput.value = profile.motorDetails || '';
    propDetailsInput.value = profile.propDetails || '';
    otherParamsInput.value = profile.otherParams || '';
    renderProfiles();
    updateProfileActionState();
}

function updateProfileActionState() {
    const deleteProfileButton = document.getElementById('deleteProfileButton');
    const syncProfileButton = document.getElementById('syncProfileButton');
    
    deleteProfileButton.disabled = !state.selectedProfileId;
    syncProfileButton.disabled = !state.selectedProfileId || !state.connected;
}

async function loadProfiles() {
    try {
        await sendCommand('GET_PROFILES');
        appendLog('Request sent to load profiles from device.');
    } catch (error) {
        appendLog(`Failed to load profiles: ${error.message}`);
    }
}

async function syncProfile() {
    const profile = state.profiles.find((p) => p.id === state.selectedProfileId);
    if (profile) {
        try {
            await sendCommand('SAVE_PROFILE', profile);
            appendLog(`Profile "${profile.name}" synced to device.`);
        } catch (error) {
            appendLog(`Failed to sync profile: ${error.message}`);
        }
    }
}

function addProfile() {
    const profileNameInput = document.getElementById('profileName');
    const motorDetailsInput = document.getElementById('motorDetails');
    const propDetailsInput = document.getElementById('propDetails');
    const otherParamsInput = document.getElementById('otherParams');
    
    state.selectedProfileId = null;
    profileNameInput.value = '';
    motorDetailsInput.value = '';
    propDetailsInput.value = '';
    otherParamsInput.value = '';
    renderProfiles();
    updateProfileActionState();
}

function saveProfile(event) {
    event.preventDefault();
    const profileNameInput = document.getElementById('profileName');
    const motorDetailsInput = document.getElementById('motorDetails');
    const propDetailsInput = document.getElementById('propDetails');
    const otherParamsInput = document.getElementById('otherParams');
    
    const name = profileNameInput.value.trim();
    const motorDetails = motorDetailsInput.value.trim();
    const propDetails = propDetailsInput.value.trim();
    const otherParams = otherParamsInput.value.trim();

    if (!name || !motorDetails || !propDetails) {
        alert('Please fill in all required fields (Name, Motor Details, Propeller Details).');
        return;
    }

    if (state.selectedProfileId) {
        const profile = state.profiles.find((item) => item.id === state.selectedProfileId);
        if (profile) {
            profile.name = name;
            profile.motorDetails = motorDetails;
            profile.propDetails = propDetails;
            profile.otherParams = otherParams;
            appendLog(`Profile "${name}" updated.`);
        }
    } else {
        const newProfile = {
            id: Date.now(),
            name,
            motorDetails,
            propDetails,
            otherParams
        };
        state.profiles.push(newProfile);
        state.selectedProfileId = newProfile.id;
        appendLog(`Profile "${name}" created.`);
    }
    renderProfiles();
    updateProfileActionState();
}

function deleteProfile() {
    if (!state.selectedProfileId) return;
    const profileNameInput = document.getElementById('profileName');
    const motorDetailsInput = document.getElementById('motorDetails');
    const propDetailsInput = document.getElementById('propDetails');
    const otherParamsInput = document.getElementById('otherParams');
    
    const profileIndex = state.profiles.findIndex((item) => item.id === state.selectedProfileId);
    if (profileIndex !== -1) {
        const profileName = state.profiles[profileIndex].name;
        state.profiles.splice(profileIndex, 1);
        appendLog(`Profile "${profileName}" deleted.`);
    }
    state.selectedProfileId = null;
    profileNameInput.value = '';
    motorDetailsInput.value = '';
    propDetailsInput.value = '';
    otherParamsInput.value = '';
    renderProfiles();
    updateProfileActionState();
}
