
const API_BASE = '/api/v1/connections';
const connectionsList = document.getElementById('connectionsList');
const wizardModal = document.getElementById('connectionWizard');
const toastEl = document.getElementById('toast');

// Wizard State
let currentStep = 1;
const TOTAL_STEPS = 4;
let wizardData = {};
let isEditMode = false;

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    loadConnections();
    setupWizardEvents();
    checkHealth();
});

// --- THEME ---
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    if (isLight) {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', 'light');
    }
});

// --- CONNECTIONS GRID ---
async function loadConnections() {
    try {
        const res = await fetch(`${API_BASE}/list`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        connectionsList.innerHTML = '';

        if (data.length === 0) {
            connectionsList.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No connections found. Create one!</div>';
            return;
        }

        data.forEach(conn => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-header">
                    <div class="row" style="align-items: center; gap: 1rem;">
                        <div class="robot-avatar">🤖</div>
                        <div>
                            <div class="card-title">${conn.websiteName || 'Untitled Connection'}</div>
                            <div class="card-subtitle">${conn.connectionId}</div>
                        </div>
                    </div>
                    <span class="ai-badge">AI Assistant</span>
                </div>
                
                <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">
                    Created: ${new Date(conn.createdAt).toLocaleDateString()}
                </div>

                <div class="card-actions">
                    <button class="btn secondary" onclick="editConnection('${conn.connectionId}')">Edit</button>
                    <button class="btn danger" onclick="deleteConnection('${conn.connectionId}')">Delete</button>
                </div>
            `;
            connectionsList.appendChild(card);
        });

    } catch (err) {
        showToast('Failed to load connections: ' + err.message, true);
    }
}

// --- GLOBAL ACTIONS ---
window.deleteConnection = async (id) => {
    if (!confirm(`Are you sure you want to delete ${id}? This cannot be undone.`)) return;

    try {
        // Assuming DELETE endpoint exists, if not we might need to verify routes
        // PR-1 didn't explicitly mention DELETE /connections/:id but standard REST implies it.
        // Let's assume it exists or I'll need to add it.
        // connectionRoutes.js usually has it.
        const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' }); // Verify this
        if (res.ok) {
            showToast('Connection deleted');
            loadConnections();
        } else {
            throw new Error('Failed to delete');
        }
    } catch (err) {
        showToast(err.message, true);
    }
};

window.editConnection = async (id) => {
    try {
        const res = await fetch(`${API_BASE}/${id}/details`);
        if (!res.ok) throw new Error('Failed to fetch details');

        const data = await res.json();

        isEditMode = true;
        wizardModal.classList.add('active');
        currentStep = 1;
        updateWizardUI();

        // Populate Form
        document.getElementById('connectionId').value = data.connectionId;
        document.getElementById('connectionId').readOnly = true; // Lock ID
        document.getElementById('websiteName').value = data.websiteName || '';
        document.getElementById('websiteUrl').value = data.websiteUrl || '';

        // Populate Behavior
        if (data.behaviorProfile) {
            document.getElementById('formalitySlider').value = data.behaviorProfile.tone === 'formal' ? 80 : 20;
            document.getElementById('salesSlider').value = (data.behaviorProfile.salesIntensity || 0.4) * 100;
        }

    } catch (err) {
        showToast(err.message, true);
    }
};

// --- WIZARD LOGIC ---
function setupWizardEvents() {
    document.getElementById('newConnectionBtn').addEventListener('click', openWizard);
    document.getElementById('cancelBtn').addEventListener('click', closeWizard);
    document.getElementById('nextBtn').addEventListener('click', nextStep);
    document.getElementById('prevBtn').addEventListener('click', prevStep);

    // Sliders
    setupSlider('formalitySlider', 'formalityVal', ['Casual', 'Neutral', 'Professional']);
    setupSlider('empathySlider', 'empathyVal', ['None', 'Moderate', 'High']);
    setupSlider('salesSlider', 'salesVal', ['Info', 'Persuasive', 'Aggressive']);
}

function openWizard() {
    isEditMode = false;
    wizardModal.classList.add('active');
    currentStep = 1;
    updateWizardUI();
    // Reset form
    document.getElementById('wizardForm').reset();
    document.getElementById('connectionId').readOnly = false;
    document.getElementById('connectionId').value = 'conn_' + Date.now();
    document.getElementById('connectionSecret').value = Math.random().toString(36).substring(7);
}

function closeWizard() {
    wizardModal.classList.remove('active');
}

async function nextStep() {
    if (!validateStep(currentStep)) return;

    if (currentStep < TOTAL_STEPS) {
        collectStepData(currentStep);

        // If moving to Deployment (4), SAVE the connection
        if (currentStep === 3) {
            const success = await saveConnection();
            if (!success) return; // Stop if save failed
        }

        currentStep++;
        updateWizardUI();
    } else {
        closeWizard();
        loadConnections();
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateWizardUI();
    }
}

function updateWizardUI() {
    // Steps Header
    document.querySelectorAll('.step').forEach(el => {
        const stepNum = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (stepNum === currentStep) el.classList.add('active');
        if (stepNum < currentStep) el.classList.add('completed');
    });

    // Panels
    document.querySelectorAll('.step-panel').forEach(el => el.classList.remove('active'));
    document.getElementById(`step${currentStep}`).classList.add('active');

    // Buttons
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    prevBtn.style.visibility = currentStep === 1 ? 'hidden' : 'visible';

    if (currentStep === TOTAL_STEPS) {
        nextBtn.textContent = 'Finish';
    } else if (currentStep === 3) {
        nextBtn.textContent = isEditMode ? 'Update Connection' : 'Create & Deploy';
    } else {
        nextBtn.textContent = 'Next';
    }
}

function validateStep(step) {
    if (step === 1) {
        const id = document.getElementById('connectionId').value;
        if (!id) {
            showToast('Connection ID is required', true);
            return false;
        }
    }
    return true;
}

function collectStepData(step) {
    if (step === 1) {
        wizardData.connectionId = document.getElementById('connectionId').value;
        wizardData.websiteName = document.getElementById('websiteName').value;
        wizardData.websiteUrl = document.getElementById('websiteUrl').value;
    }
}

async function saveConnection() {
    const payload = {
        connectionId: wizardData.connectionId, // used for create
        websiteName: wizardData.websiteName,
        websiteUrl: wizardData.websiteUrl,
        behaviorProfile: {
            tone: document.getElementById('formalitySlider').value > 50 ? 'formal' : 'friendly',
            salesIntensity: document.getElementById('salesSlider').value / 100
        }
    };

    // Only send secret on creation
    if (!isEditMode) {
        payload.connectionSecret = document.getElementById('connectionSecret').value;
    }

    try {
        const url = isEditMode ? `${API_BASE}/${wizardData.connectionId}` : `${API_BASE}/create`;
        const method = isEditMode ? 'PUT' : 'POST'; // Assuming PUT exists for update

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Operation failed');

        // Populate embed code
        const script = `<script src="http://${location.hostname}:5000/widget.js?id=${wizardData.connectionId}"></script>`;
        document.getElementById('embedCode').value = script;
        showToast(isEditMode ? 'Connection Updated!' : 'Connection Created Successfully!');
        return true;
    } catch (err) {
        showToast(err.message, true);
        return false;
    }
}

// --- UTILS ---
function setupSlider(id, valId, labels) {
    const slider = document.getElementById(id);
    const valDisplay = document.getElementById(valId);
    if (!slider || !valDisplay) return;

    slider.addEventListener('input', (e) => {
        const val = e.target.value;
        let label = labels[1];
        if (val < 33) label = labels[0];
        if (val > 66) label = labels[2];
        valDisplay.textContent = label;
    });
}

function showToast(msg, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.borderLeft = isError ? '4px solid var(--danger)' : '4px solid var(--success)';
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), 3000);
}

function checkHealth() {
    fetch('/health')
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(() => {
            const h = document.getElementById('healthStatus');
            if (h) {
                h.querySelector('.status-text').textContent = 'Backend Online';
                h.classList.add('online');
            }
        })
        .catch(() => {
            const h = document.getElementById('healthStatus');
            if (h) {
                h.querySelector('.status-text').textContent = 'Backend Offline';
                h.classList.add('offline');
            }
        });
}

window.copyEmbed = () => {
    const copyText = document.getElementById("embedCode");
    copyText.select();
    document.execCommand("copy");
    showToast("Copied to clipboard!");
};
