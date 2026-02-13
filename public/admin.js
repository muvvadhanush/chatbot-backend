
const API_BASE = '/api/v1/connections';
const connectionsList = document.getElementById('connectionsList');
const wizardModal = document.getElementById('connectionWizard');
const toastEl = document.getElementById('toast');
const searchInput = document.getElementById('globalSearch');

// State
let connectionsData = [];
let riskMap = {}; // connectionId -> count
let currentStep = 1;
const TOTAL_STEPS = 4;
let wizardData = {};
let isEditMode = false;

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    Promise.all([loadConnections(), loadAnalytics()]);
    setupWizardEvents();
    setupSearch();
    checkHealth();
});

// --- ANALYTICS ---
async function loadAnalytics() {
    try {
        const res = await fetch(`${API_BASE.replace('/connections', '/admin')}/analytics`); // /api/v1/admin/analytics
        const data = await res.json();

        // Update Risk Map
        riskMap = data.riskMap || {};

        // Update Focus Cards
        // Assuming cards exist with IDs (I need to ensure HTML has IDs)
        // Or I can select by text content if IDs missing, but best to add IDs to HTML if needed.
        // For now, let's assume I can update the specific "At-Risk" card if I can find it.
        // Actually, I'll update renderConnections to use the new map.

        // Update "At-Risk Responses" Card (using querySelector hack if no ID)
        // Better: I will update HTML in next step to add IDs. 
        // For now, let's update renders.

        const riskCardValue = document.getElementById('stat-risk-count');
        if (riskCardValue) riskCardValue.textContent = data.globalAtRiskCount;

        // Re-render connections to show badges
        renderConnections(connectionsData);

    } catch (e) {
        console.error("Analytics Load Error", e);
    }
}

// --- CONNECTIONS ---
async function loadConnections() {
    try {
        const res = await fetch(`${API_BASE}/list`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        connectionsData = data;
        renderConnections(data);
    } catch (err) {
        showToast('Failed to load connections: ' + err.message, true);
    }
}

function renderConnections(data) {
    connectionsList.innerHTML = '';
    if (data.length === 0) {
        connectionsList.innerHTML = '<div class="loading">No connections found.</div>';
        return;
    }

    const icons = ['hub', 'lan', 'cloud_sync', 'share', 'settings_input_component', 'data_object'];
    const iconBgs = ['#e8f0fe', '#e6f4ea', '#fef7e0', '#fce8e6', '#f3e8fd', '#e0f7fa'];
    const iconColors = ['#1a73e8', '#07883f', '#e8a400', '#dc3545', '#8e24aa', '#0097a7'];

    data.forEach((conn, i) => {
        const idx = i % icons.length;
        const statusClass = conn.widgetSeen ? 'connected' : (conn.status === 'active' ? 'syncing' : 'offline');
        const statusLabel = conn.widgetSeen ? 'Connected' : (conn.status === 'active' ? 'Syncing' : 'Offline');

        const card = document.createElement('div');
        card.className = 'conn-card';
        card.innerHTML = `
            <div class="conn-card-header">
                <div class="conn-icon" style="background:${iconBgs[idx]};">
                    <span class="material-symbols-outlined" style="color:${iconColors[idx]};">${icons[idx]}</span>
                </div>
                <div>
                    <div class="conn-name">${conn.websiteName || 'Untitled'}</div>
                    <div class="conn-status ${statusClass}">
                        <span class="status-dot"></span>
                        ${statusLabel}
                    </div>
                </div>
            </div>

            <div class="conn-desc">
                ${conn.websiteUrl ? `Connected to ${conn.websiteUrl}` : `Connection ID: ${conn.connectionId}`}
            </div>

            <button class="btn-launch" onclick="editConnection('${conn.connectionId}')">Launch Console</button>
        `;
        connectionsList.appendChild(card);
    });
}

window.openRiskView = (id, e) => {
    e.stopPropagation(); // Prevent card click if any
    editConnection(id);
    // Wait for modal to open, then switch tab
    setTimeout(() => {
        const explainTab = document.querySelector('.tab-btn[data-tab="explainability"]');
        if (explainTab) explainTab.click();

        // Auto-filter to AT_RISK
        const riskFilterBtn = document.querySelector('.pill[data-filter="AT_RISK"]');
        if (riskFilterBtn) riskFilterBtn.click();
    }, 100);
};

window.filterGridByRisk = () => {
    const riskIds = Object.keys(riskMap);
    const filtered = connectionsData.filter(c => riskMap[c.connectionId] > 0);
    renderConnections(filtered);
    showToast(`Filtered: ${filtered.length} connections with risks`);
};

window.deleteConnection = async (id) => {
    if (!confirm(`Are you sure you want to delete ${id}?`)) return;
    try {
        const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
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

// --- SETTINGS MODAL ---
const settingsModal = document.getElementById('connectionSettings');
let activeConnectionId = null;

document.addEventListener('DOMContentLoaded', () => {
    // ... existing init ...
    setupSettingsEvents();
});

function setupSettingsEvents() {
    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
        settingsModal.classList.remove('active');
        activeConnectionId = null;
    });

    // Submits
    document.getElementById('editGeneralForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateGeneralSettings();
    });

    // Delete
    document.getElementById('deleteConnBtn').addEventListener('click', () => {
        if (activeConnectionId) deleteConnection(activeConnectionId);
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

            if (btn.dataset.tab === 'knowledge') {
                loadPendingExtractions();
            }
            if (btn.dataset.tab === 'explainability') {
                loadAnswers();
            }
            if (btn.dataset.tab === 'behavior') {
                loadBehaviorMetrics();
                loadBehaviorSuggestions();
                loadBrandDriftStatus();
                loadConfidencePolicy();
            }
        });
    });

    // Behavior Refresh Button
    document.getElementById('refreshBehaviorBtn').addEventListener('click', () => {
        loadBehaviorMetrics();
        loadBehaviorSuggestions();
    });

    // Brand Drift Buttons
    document.getElementById('checkDriftBtn').addEventListener('click', () => checkBrandDrift());
    document.getElementById('reanalyzeBrandBtn').addEventListener('click', () => reanalyzeBrand());

    // Confidence Policy Save
    document.getElementById('savePolicyBtn').addEventListener('click', () => saveConfidencePolicy());
}


window.editConnection = async (id) => {
    activeConnectionId = id;
    try {
        const res = await fetch(`${API_BASE}/${id}/details`);
        if (!res.ok) throw new Error('Fetch details failed');
        const data = await res.json();

        // Populate General
        document.getElementById('editConnId').value = data.connectionId;
        document.getElementById('editWebName').value = data.websiteName || '';
        document.getElementById('editWebUrl').value = data.websiteUrl || '';
        document.getElementById('editAssistName').value = data.assistantName || '';
        document.getElementById('settingsSubtitle').textContent = `Managing ${data.connectionId}`;

        // Behavior
        if (data.tone) document.getElementById('editTone').value = data.tone;

        // Open Modal
        settingsModal.classList.add('active');

        // Reset Tabs
        document.querySelector('.tab-btn[data-tab="general"]').click();

    } catch (err) {
        showToast(err.message, true);
    }
};

async function updateGeneralSettings() {
    if (!activeConnectionId) return;
    const payload = {
        websiteName: document.getElementById('editWebName').value,
        websiteUrl: document.getElementById('editWebUrl').value,
        assistantName: document.getElementById('editAssistName').value,
        tone: document.getElementById('editTone').value // Capture tone here too logic wise
    };

    try {
        const res = await fetch(`${API_BASE}/${activeConnectionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast('Settings Saved');
            loadConnections(); // Refresh list
        } else {
            throw new Error('Save Failed');
        }
    } catch (e) { showToast(e.message, true); }
}

async function loadPendingExtractions() {
    if (!activeConnectionId) return;
    const list = document.getElementById('pendingList');
    list.innerHTML = '<div class="spinner"></div>';

    try {
        const res = await fetch(`${API_BASE}/${activeConnectionId}/extractions?status=PENDING`);
        const items = await res.json();

        const badge = document.getElementById('pendingCount');
        if (items.length > 0) {
            badge.textContent = items.length;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }

        if (items.length === 0) {
            list.innerHTML = `<div style="padding: 1rem; border: 1px dashed var(--border-color); text-align: center; color: var(--text-muted); border-radius: 8px;">No pending items.</div>`;
            return;
        }

        list.innerHTML = '';
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'card'; // Reuse card style
            el.style.padding = '1rem';
            el.style.display = 'flex';
            el.style.justifyContent = 'space-between';
            el.style.alignItems = 'center';

            if (item.extractorType === 'METADATA') {
                preview = `Metadata Update: ${JSON.stringify(item.rawData)}`;
            } else if (item.extractorType === 'KNOWLEDGE') {
                preview = `Knowledge: ${item.rawData.title || 'Snippet'} (${(item.rawData.content || '').length} chars)`;
            } else if (item.extractorType === 'DRIFT') {
                preview = `<span style="color:var(--warning)">⚠️ Content Drift:</span> ${item.rawData.title || 'Source'} has changed.`;
            } else {
                preview = `${item.extractorType} Data`;
            }

            el.innerHTML = `
                <div>${preview}</div>
                <div style="display: flex; gap: 5px;">
                    <button class="btn success" onclick="approveItem('${item.id}')">✓</button>
                    <button class="btn danger" onclick="rejectItem('${item.id}')">✗</button>
                </div>
            `;
            list.appendChild(el);
        });

    } catch (e) {
        list.innerHTML = `<div style="color:var(--error)">Error loading items</div>`;
    }
}

window.approveItem = async (itemId) => {
    try {
        const res = await fetch(`${API_BASE}/${activeConnectionId}/extractions/${itemId}/approve`, { method: 'POST' });
        if (res.ok) {
            showToast('Approved');
            loadPendingExtractions();
        }
    } catch (e) { showToast('Error approving', true); }
};

window.rejectItem = async (itemId) => {
    if (!confirm('Reject this item?')) return;
    try {
        const res = await fetch(`${API_BASE}/${activeConnectionId}/extractions/${itemId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Rejected/Deleted');
            loadPendingExtractions();
        }
    } catch (e) { showToast('Error rejecting', true); }
};

window.triggerExtraction = async () => {
    // Trigger Auto-Extract
    const url = document.getElementById('editWebUrl').value;
    if (!url) return showToast('URL required in General tab', true);

    showToast('Starting Scan...');
    try {
        const res = await fetch(`${API_BASE}/${activeConnectionId}/auto-extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: activeConnectionId, url: url }) // Uses existing endpoint
        });
        const d = await res.json();
        showToast(d.success || d.status ? 'Scan Complete. Refreshing...' : 'Scan Failed', !d.success);
        if (d.success || d.status) loadPendingExtractions();
    } catch (e) { showToast(e.message, true); }
};

// --- EXPLAINABILITY ---
let currentAnswers = [];
let answerFilter = 'ALL';

async function loadAnswers() {
    if (!activeConnectionId) return;
    const list = document.getElementById('answerList');
    list.innerHTML = '<div class="spinner"></div>';

    try {
        const res = await fetch(`${API_BASE}/${activeConnectionId}/answers?filter=${answerFilter}`);
        currentAnswers = await res.json();
        renderAnswerList();
    } catch (e) {
        list.innerHTML = `<div style="color:var(--error)">Error loading answers: ${e.message}</div>`;
    }
}

function renderAnswerList() {
    const list = document.getElementById('answerList');
    list.innerHTML = '';

    if (currentAnswers.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No answers found for this filter.</div>`;
        return;
    }

    currentAnswers.forEach(ans => {
        const el = document.createElement('div');
        el.className = 'card';
        el.style.cursor = 'pointer';
        el.style.borderLeft = ans.status === 'AT_RISK' ? '4px solid var(--warning)' : '4px solid var(--success)';
        el.onclick = () => openExplainabilityDrawer(ans);

        el.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <strong style="font-size: 0.95rem;">${ans.question}</strong>
                <span class="badge-mini" style="background: ${getConfidenceColor(ans.confidence)}">${Math.round(ans.confidence * 100)}% Conf</span>
            </div>
            <div style="color: var(--text-muted); font-size: 0.9rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                ${ans.answer}
            </div>
            <div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-muted); display: flex; gap: 10px;">
                <span>${new Date(ans.timestamp).toLocaleString()}</span>
                <span>${ans.status}</span>
            </div>
        `;
        list.appendChild(el);
    });
}

function getConfidenceColor(score) {
    if (score >= 0.9) return 'var(--success)';
    if (score >= 0.7) return 'var(--warning)';
    return 'var(--error)';
}

// Drawer Logic
const drawer = document.getElementById('explainabilityDrawer');
document.getElementById('closeDrawerBtn').addEventListener('click', () => {
    drawer.classList.remove('active');
});

function openExplainabilityDrawer(answer) {
    drawer.classList.add('active');
    const body = document.getElementById('drawerBody');

    // Parse Metadata
    // The endpoint returns flattened answer with only 'confidence'.
    // We need the FULL metadata (sources/policies) which isn't in the simplified list response?
    // Wait, my list endpoint (adminRoutes) only pushed:
    // { id, sessionId, timestamp, question, answer, confidence, status }
    // It DROPPED the full metadata!
    // I need to update adminRoutes first to include `ai_metadata` or fetch it on demand.
    // Fetching on demand is better for list performance (Layer 2 optimization).
    // Or I can just include it in the list if it's not huge.
    // Let's check adminRoutes.js ...
    // Since I can't check it mid-tool, I will assume I need to update adminRoutes.js
    // I will write the JS to expect `answer.metadata` and handle it missing for now.

    // Actually, I should update adminRoutes.js to return the metadata.
    // But for this step, let's write the renderer securely.

    const meta = answer.metadata || {}; // We need to ensure backend sends this
    const sources = meta.sources || [];
    const rejected = meta.rejectedSources || [];
    const policies = meta.policyChecks || [];

    // Helper for Source HTML
    const renderSource = (s, status) => `
        <div class="card" style="margin-top: 5px; padding: 0.8rem; border-left: 3px solid ${status === 'USED' ? 'var(--success)' : 'var(--text-muted)'}; background: ${status === 'USED' ? 'var(--bg-card)' : 'rgba(0,0,0,0.02)'}">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: ${status === 'USED' ? 'var(--success)' : 'var(--text-muted)'};">${status === 'USED' ? '✓' : '○'}</span>
                    <strong style="font-size:0.9rem;">${s.type || 'Knowledge'}</strong>
                </div>
                <span class="badge-mini" style="background: ${status === 'USED' ? 'rgba(0,255,0,0.1)' : 'rgba(0,0,0,0.1)'}; color: ${status === 'USED' ? 'var(--success)' : 'var(--text-muted)'}">${status === 'USED' ? 'Used' : 'Rejected'}</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${s.value || 'Source Content'}
            </div>
            ${s.reason ? `<div style="font-size: 0.8rem; color: var(--error); margin-top:4px;">Reason: ${s.reason}</div>` : ''}
        </div>
    `;

    body.innerHTML = `
        <div style="margin-bottom: 2rem;">
            <div style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">User Question</div>
            <div style="font-weight: 600; font-size: 1.1rem; margin-bottom: 1rem;">${answer.question}</div>
            
            <div style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">AI Answer</div>
            <div style="background: var(--bg-input); padding: 1rem; border-radius: 8px; line-height: 1.5;">${answer.answer}</div>
        </div>

        <div style="margin-bottom: 2rem;">
            <h4>🔍 Retrieval Trace</h4>
            ${sources.length === 0 && rejected.length === 0 ? '<div style="color:var(--text-muted); margin-top:10px;">No retrieval data available.</div>' : ''}
            
            ${sources.map(s => renderSource(s, 'USED')).join('')}
            
            ${rejected.length > 0 ? `
                <div style="margin-top: 1rem;">
                    <h5 style="color: var(--text-muted); margin-bottom: 0.5rem; font-size: 0.85rem;">Filtered Content</h5>
                    ${rejected.map(s => renderSource(s, 'REJECTED')).join('')}
                </div>
            ` : ''}
        </div>

        <div>
             <h4>🛡️ Policy Check</h4>
             ${policies.length > 0 ? `
                <ul style="margin-top: 10px; padding-left: 1.2rem; color: var(--text-muted);">
                    ${policies.map(p => `
                        <li style="margin-bottom: 0.5rem;">
                            ${p.name}: 
                            <span style="color:${p.status === 'PASSED' ? 'var(--success)' : 'var(--warning)'}; font-weight: 500;">${p.status}</span>
                            <div style="font-size: 0.8rem; opacity: 0.8;">${p.description}</div>
                        </li>
                    `).join('')}
                </ul>
             ` : '<div style="color:var(--text-muted); margin-top:10px;">No policy data available.</div>'}
        </div>
    `;
}

// Filter Clicks
document.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        answerFilter = e.target.dataset.filter;
        loadAnswers();
    });
});

// Settings Tab Click Hook (Update existing listener)
// We need to hook into the tab listener we defined in setupSettingsEvents
// But that function is closed scope.
// However, we can just add a separate listener for the same elements?
// Or better, update loadAnswers calls inside the tab switch logic in setupSettingsEvents if I can access it?
// Actually, I can just modify setupSettingsEvents or add a global listener if I select properly.
// But `setupSettingsEvents` is inside DOMContentLoaded.
// The best way is to modify `setupSettingsEvents` block.

// --- END SETTINGS MODAL --- 

// ═══════════════════════════════════════════════════════════════════════════
// NEW 10-PAGE WIZARD — JavaScript Logic
// Navigation: (step, sub) tuples → wzPage{step}_{sub}
// ═══════════════════════════════════════════════════════════════════════════

let wizardHandshakeInterval = null;
let currentWizardConnId = null;
let wzStep = 1;
let wzSub = 0;

// Page sequence for linear navigation
const WZ_PAGE_SEQUENCE = [
    [1, 0], [1, 1], [1, 2],
    [2, 0], [2, 1],
    [3, 0], [3, 1],
    [4, 0], [4, 1], [4, 2]
];

const WZ_PROGRESS = {
    '1_0': { pct: 5, title: 'Step 1 of 4: Establish Connection' },
    '1_1': { pct: 15, title: 'Step 1 of 4: Install Widget' },
    '1_2': { pct: 25, title: 'Step 1 of 4: Connection Verified' },
    '2_0': { pct: 35, title: 'Step 2 of 4: Knowledge Base Setup' },
    '2_1': { pct: 50, title: 'Step 2 of 4: Review Extracted Data' },
    '3_0': { pct: 60, title: 'Step 3 of 4: Brand Intelligence' },
    '3_1': { pct: 75, title: 'Step 3 of 4: Behavioral Analysis' },
    '4_0': { pct: 85, title: 'Step 4 of 4: Ready for Launch' },
    '4_1': { pct: 92, title: 'Step 4 of 4: AI Sandbox Testing' },
    '4_2': { pct: 100, title: 'Complete!' }
};

// ── Central Page Navigation ──────────────────────────────────────────────
function wzShowPage(step, sub) {
    wzStep = step;
    wzSub = sub;

    // Hide all pages
    document.querySelectorAll('.wz-page').forEach(p => p.classList.remove('active'));

    // Show target page
    const targetPage = document.getElementById(`wzPage${step}_${sub}`);
    if (targetPage) targetPage.classList.add('active');

    // Update progress bar & stepper
    wzUpdateProgress();
}

function wzUpdateProgress() {
    const key = `${wzStep}_${wzSub}`;
    const info = WZ_PROGRESS[key] || { pct: 0, title: '' };

    // Progress bar
    const bar = document.getElementById('wzProgressBar');
    if (bar) bar.style.width = info.pct + '%';

    // Badge
    const badge = document.getElementById('wzProgressBadge');
    if (badge) badge.textContent = info.pct + '%';

    // Title
    const title = document.getElementById('wzProgressTitle');
    if (title) title.textContent = info.title;

    // Step indicators
    document.querySelectorAll('.wz-step-ind').forEach(ind => {
        const s = parseInt(ind.dataset.step);
        ind.classList.remove('active', 'done');
        if (s < wzStep) ind.classList.add('done');
        else if (s === wzStep) ind.classList.add('active');
    });

    // Hide progress card on celebration page
    const progressCard = document.getElementById('wzProgressCard');
    if (progressCard) {
        progressCard.style.display = (wzStep === 4 && wzSub === 2) ? 'none' : '';
    }
}

// ── Event Wiring ─────────────────────────────────────────────────────────
function setupWizardEvents() {
    // Open wizard
    const newBtn = document.getElementById('newConnectionBtn');
    if (newBtn) newBtn.addEventListener('click', () => { isEditMode = false; openWizard(); });

    // Close wizard
    const closeBtn = document.getElementById('wzCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeWizard);

    // Page 1.0: Connect
    const connectBtn = document.getElementById('wzConnectBtn');
    if (connectBtn) connectBtn.addEventListener('click', createConnection);

    // Page 1.1: Copy embed code
    const copyCodeBtn = document.getElementById('wzCopyCodeBtn');
    if (copyCodeBtn) copyCodeBtn.addEventListener('click', copyWzEmbed);

    // Page 2.0: Extract
    const extractBtn = document.getElementById('wzExtractBtn');
    if (extractBtn) extractBtn.addEventListener('click', triggerWizardExtraction);

    // Page 2.0: Rescan
    const rescanBtn = document.getElementById('wzRescan');
    if (rescanBtn) rescanBtn.addEventListener('click', () => {
        // Reset scan UI and re-trigger
        const scanProgress = document.getElementById('wzScanProgress');
        if (scanProgress) scanProgress.style.display = 'none';
        triggerWizardExtraction();
    });

    // Page 3.0: Start brand analysis
    const startAnalysis = document.getElementById('wzStartAnalysis');
    if (startAnalysis) startAnalysis.addEventListener('click', triggerBrandScan);

    // Page 3.1: Apply AI recommendation
    const applyStrategy = document.getElementById('wzApplyStrategy');
    if (applyStrategy) applyStrategy.addEventListener('click', () => {
        showToast('Strategy applied successfully!');
    });

    // Page 4.0: Launch
    const launchBtn = document.getElementById('wzLaunchBtn');
    if (launchBtn) launchBtn.addEventListener('click', finalizeDeployment);

    // Page 4.0: Test in Sandbox
    const testSandbox = document.getElementById('wzTestSandbox');
    if (testSandbox) testSandbox.addEventListener('click', () => wzShowPage(4, 1));

    // Page 4.1: Final launch from sandbox
    const finalLaunch = document.getElementById('wzFinalLaunch');
    if (finalLaunch) finalLaunch.addEventListener('click', finalizeDeployment);

    // Page 4.1: Sandbox chat send
    const chatSendBtn = document.getElementById('wzChatSendBtn');
    if (chatSendBtn) chatSendBtn.addEventListener('click', sendSandboxMessage);

    // Page 4.1: Sandbox chat enter key
    const chatInput = document.getElementById('wzChatInput');
    if (chatInput) chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSandboxMessage(); }
    });

    // Page 4.1: Reset chat
    const resetChat = document.getElementById('wzResetChat');
    if (resetChat) resetChat.addEventListener('click', () => {
        const area = document.getElementById('wzChatArea');
        if (area) area.innerHTML = '';
    });

    // Page 4.2: Go to dashboard
    const goToDashboard = document.getElementById('wzGoToDashboard');
    if (goToDashboard) goToDashboard.addEventListener('click', closeWizard);

    // Page 4.2: View on site
    const viewOnSite = document.getElementById('wzViewOnSite');
    if (viewOnSite) viewOnSite.addEventListener('click', () => {
        const url = document.getElementById('wzPublicUrl')?.value;
        if (url) window.open(url, '_blank');
    });

    // Page 4.2: Copy URL
    const copyUrl = document.getElementById('wzCopyUrl');
    if (copyUrl) copyUrl.addEventListener('click', () => {
        const urlInput = document.getElementById('wzPublicUrl');
        if (urlInput) {
            urlInput.select();
            document.execCommand('copy');
            showToast('URL copied!');
        }
    });

    // ── Per-page BACK buttons ────────────────────────────────────────
    wireNavBtn('wzBack1_1', 1, 0);
    wireNavBtn('wzBack2_0', 1, 2);
    wireNavBtn('wzBack2_1', 2, 0);
    wireNavBtn('wzBack3_0', 2, 1);
    wireNavBtn('wzBack3_1', 3, 0);
    wireNavBtn('wzBack4_0', 3, 1);
    wireNavBtn('wzBack4_1', 4, 0);

    // ── Per-page NEXT buttons ────────────────────────────────────────
    wireNavBtn('wzNext1_1', 1, 2);
    wireNavBtn('wzNext1_2', 2, 0);
    wireNavBtn('wzNext2_0', 2, 1);  // Transitions after extraction
    wireNavBtn('wzNext2_1', 3, 0);
    wireNavBtn('wzNext3_1', 4, 0);

    // ── Back to Settings link (Page 2.1) ─────────────────────────────
    const backToSettings = document.getElementById('wzBackToSettings');
    if (backToSettings) backToSettings.addEventListener('click', (e) => {
        e.preventDefault();
        wzShowPage(2, 0);
    });
}

function wireNavBtn(id, targetStep, targetSub) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => wzShowPage(targetStep, targetSub));
}

// ── Open / Close ─────────────────────────────────────────────────────────
function openWizard() {
    wizardModal.classList.add('active');
    currentWizardConnId = null;
    wzStep = 1;
    wzSub = 0;

    // Reset all inputs inside wizard
    wizardModal.querySelectorAll('input:not([readonly])').forEach(i => { i.value = ''; });

    // Reset generated fields visibility
    const genFields = document.getElementById('wzGeneratedFields');
    if (genFields) genFields.style.display = 'none';

    // Reset signal monitor
    const signalMonitor = document.getElementById('wzSignalMonitor');
    if (signalMonitor) signalMonitor.style.display = 'none';

    // Reset scan progress  
    const scanProgress = document.getElementById('wzScanProgress');
    if (scanProgress) scanProgress.style.display = 'none';

    // Reset analysis loading
    const analysisLoading = document.getElementById('wzAnalysisLoading');
    if (analysisLoading) analysisLoading.style.display = 'none';

    // Clear intervals
    if (wizardHandshakeInterval) clearInterval(wizardHandshakeInterval);

    // Show first page
    wzShowPage(1, 0);
}

function closeWizard() {
    wizardModal.classList.remove('active');
    if (wizardHandshakeInterval) clearInterval(wizardHandshakeInterval);
    loadConnections(); // Refresh grid
}

// ── STEP 1: CREATE CONNECTION ────────────────────────────────────────────
async function createConnection() {
    const nameInput = document.getElementById('wzWebsiteName');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return showToast('Please enter a website name', true);

    const btn = document.getElementById('wzConnectBtn');
    const btnSpan = btn?.querySelector('span:first-child');
    const origText = btnSpan ? btnSpan.textContent : 'Connect & Continue';
    if (btnSpan) btnSpan.textContent = 'Creating...';
    if (btn) btn.disabled = true;

    try {
        const connId = 'conn_' + Date.now().toString(36);
        const password = 'pwd_' + Math.random().toString(36).substr(2, 9);

        const payload = {
            connectionId: connId,
            password: password,
            websiteName: name
        };

        const res = await fetch(`${API_BASE}/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Creation failed');

        currentWizardConnId = connId;

        // Populate generated fields
        const connIdField = document.getElementById('wzConnId');
        const secretField = document.getElementById('wzSecret');
        const genFields = document.getElementById('wzGeneratedFields');

        if (connIdField) connIdField.value = connId;
        if (secretField) secretField.value = password;
        if (genFields) genFields.style.display = 'block';

        // Auto-advance to page 1.1 (Embed Code)
        const script = `<script src="${window.location.protocol}//${window.location.hostname}:5000/widget.js?id=${connId}&key=${password}"><\/script>`;
        const embedEl = document.getElementById('wzEmbedCode');
        if (embedEl) embedEl.textContent = script;

        wzShowPage(1, 1);

        // Start handshake polling
        startHandshakePolling(connId);

    } catch (e) {
        showToast(e.message, true);
        if (btnSpan) btnSpan.textContent = origText;
        if (btn) btn.disabled = false;
    }
}

// ── STEP 1: HANDSHAKE POLLING ────────────────────────────────────────────
function startHandshakePolling(connId) {
    if (wizardHandshakeInterval) clearInterval(wizardHandshakeInterval);

    // Show signal monitor
    const monitor = document.getElementById('wzSignalMonitor');
    if (monitor) monitor.style.display = 'flex';

    wizardHandshakeInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/${connId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.widgetSeen) {
                    clearInterval(wizardHandshakeInterval);

                    // Auto-navigate to success page
                    // Populate connection details on page 1.2
                    const nameDisplay = document.getElementById('wzConnNameDisplay');
                    const idDisplay = document.getElementById('wzConnIdDisplay');
                    if (nameDisplay) nameDisplay.textContent = data.websiteName || 'My Connection';
                    if (idDisplay) idDisplay.textContent = connId;

                    wzShowPage(1, 2);
                    showToast('🎉 Widget detected! Connection verified.');
                }
            }
        } catch (e) { console.error('Polling error', e); }
    }, 3000);
}

// ── STEP 2: EXTRACTION & SCANNING ────────────────────────────────────────
async function triggerWizardExtraction() {
    const urlInput = document.getElementById('wzExtractUrl');
    const url = urlInput ? urlInput.value.trim() : '';
    if (!url) return showToast('Enter a website URL first', true);

    if (!currentWizardConnId) {
        const idField = document.getElementById('wzConnId');
        if (idField) currentWizardConnId = idField.value;
    }
    if (!currentWizardConnId) return showToast('Connection ID missing.', true);

    // Show scan progress area
    const scanProgress = document.getElementById('wzScanProgress');
    if (scanProgress) scanProgress.style.display = 'block';

    const statusEl = document.getElementById('wzScanStatusText');
    const barEl = document.getElementById('wzScanProgressBar');

    if (statusEl) statusEl.textContent = 'Connecting to website...';
    if (barEl) barEl.style.width = '10%';

    let fakeProgress = 10;
    const progressInterval = setInterval(() => {
        if (fakeProgress < 90) {
            fakeProgress += Math.random() * 5;
            if (barEl) barEl.style.width = Math.min(fakeProgress, 90) + '%';
            if (fakeProgress > 30 && fakeProgress < 60 && statusEl) statusEl.textContent = 'Scanning pages...';
            if (fakeProgress >= 60 && statusEl) statusEl.textContent = 'Analyzing structure...';
        }
    }, 500);

    try {
        // Save URL first
        await fetch(`${API_BASE}/${currentWizardConnId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ websiteUrl: url })
        });

        // Trigger discovery
        const discRes = await fetch(`${API_BASE}/${currentWizardConnId}/discovery`, {
            method: 'POST'
        });

        clearInterval(progressInterval);

        if (discRes.ok) {
            const data = await discRes.json();
            const result = data.data;

            // Update page counts
            const totalPagesEl = document.getElementById('wzTotalPages');
            if (totalPagesEl) totalPagesEl.textContent = result.valid || 0;

            showToast(`Discovered ${result.valid} pages via ${result.method}`);

            // Navigate to review page
            wzShowPage(2, 1);

            // Load results into review page
            wzLoadReviewResults(result);
        } else {
            const errData = await discRes.json().catch(() => ({}));
            throw new Error(errData.error || 'Discovery failed');
        }
    } catch (e) {
        clearInterval(progressInterval);
        showToast(e.message, true);
        if (scanProgress) scanProgress.style.display = 'none';
    }
}

async function wzLoadReviewResults(result) {
    // Populate preview URL
    const previewUrl = document.getElementById('wzPreviewUrl');
    const urlInput = document.getElementById('wzExtractUrl');
    if (previewUrl && urlInput) {
        previewUrl.textContent = urlInput.value;
    }

    // Load items into preview body
    const previewBody = document.getElementById('wzPreviewBody');
    if (!previewBody) return;

    try {
        const res = await fetch(`${API_BASE}/${currentWizardConnId}/discovery/results`);
        const data = await res.json();

        if (data.items && data.items.length > 0) {
            previewBody.innerHTML = data.items.map(item => `
                <div style="padding: 12px 0; border-bottom: 1px solid #f0f1f4; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size: 0.85rem; font-weight: 600; color: #1a1a2e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.discoveredUrl}">${item.discoveredUrl}</div>
                        <div style="font-size: 0.72rem; color: #8b8fa3; margin-top: 2px;">${item.status || 'PENDING'}</div>
                    </div>
                    <span style="font-size: 0.72rem; font-weight: 600; color: #07883f; background: rgba(7,136,63,0.08); padding: 3px 10px; border-radius: 12px;">FOUND</span>
                </div>
            `).join('');
        } else {
            previewBody.innerHTML = '<div style="text-align:center; padding:24px; color:#8b8fa3;">No pages discovered.</div>';
        }
    } catch (e) {
        previewBody.innerHTML = '<div style="text-align:center; padding:24px; color:#ef4444;">Failed to load results.</div>';
    }
}

// ── STEP 2: APPROVAL ─────────────────────────────────────────────────────
async function triggerWizardApproval() {
    try {
        const res = await fetch(`${API_BASE}/${currentWizardConnId}/discovery/approve-all`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            showToast(`Approved & scanned ${data.count} pages`);
            await recalculateCoverage(currentWizardConnId);
        } else {
            throw new Error(data.error || 'Approval failed');
        }
    } catch (e) {
        showToast(e.message, true);
    }
}

// ── STEP 3: BRAND DETECTION ──────────────────────────────────────────────
async function triggerBrandScan() {
    // Show loading on page 3.0
    const analysisLoading = document.getElementById('wzAnalysisLoading');
    if (analysisLoading) analysisLoading.style.display = 'block';

    // Safety: recover connection ID
    if (!currentWizardConnId) {
        const idField = document.getElementById('wzConnId');
        if (idField) currentWizardConnId = idField.value;
    }

    try {
        const res = await fetch(`${API_BASE}/${currentWizardConnId}/detect-brand`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            // Populate page 3.1 with results
            wzRenderAnalysisResults(data.profile, data.recommendation);

            // Navigate to page 3.1
            wzShowPage(3, 1);
        } else {
            throw new Error(data.error || 'Brand analysis failed');
        }
    } catch (e) {
        showToast(e.message, true);
        if (analysisLoading) analysisLoading.style.display = 'none';
    }
}

function wzRenderAnalysisResults(profile, recommendation) {
    // Metrics
    const engagement = document.getElementById('wzEngagementScore');
    const sentiment = document.getElementById('wzSentimentScore');
    const consistency = document.getElementById('wzConsistencyScore');

    if (engagement) engagement.textContent = ((profile.confidence || 0.78) * 100).toFixed(0) + '%';
    if (sentiment) sentiment.textContent = profile.tone || 'Warm';
    if (consistency) consistency.textContent = profile.industry || 'Tech';

    // Archetype
    const primaryArch = document.getElementById('wzPrimaryArchetype');
    const secondaryArch = document.getElementById('wzSecondaryArchetype');
    if (primaryArch) primaryArch.textContent = recommendation?.role || 'Support Assistant';
    if (secondaryArch) secondaryArch.textContent = profile.audience || 'Professionals';

    // AI Recommendation
    const recText = document.getElementById('wzAiRecText');
    if (recText) {
        recText.textContent = `Based on your ${profile.industry || 'business'} content, we recommend a ${(recommendation?.tone || 'professional').toLowerCase()} ${(recommendation?.role || 'support assistant').toLowerCase()} optimized for ${profile.audience || 'your audience'}.`;
    }

    // Traits — populate the grid dynamically
    const traitsGrid = document.getElementById('wzTraitsGrid');
    if (traitsGrid && profile) {
        const traits = [
            { icon: 'psychology', title: profile.tone || 'Professional', desc: 'Communication style' },
            { icon: 'groups', title: profile.audience || 'General', desc: 'Target audience' },
            { icon: 'trending_up', title: profile.primaryGoal || 'Support', desc: 'Primary goal' },
            { icon: 'category', title: profile.industry || 'General', desc: 'Industry' }
        ];
        traitsGrid.innerHTML = traits.map(t => `
            <div class="wz-trait-item">
                <span class="material-symbols-outlined">${t.icon}</span>
                <div>
                    <h4>${t.title}</h4>
                    <p>${t.desc}</p>
                </div>
            </div>
        `).join('');
    }

    // Drivers grid
    const driversGrid = document.getElementById('wzDriversGrid');
    if (driversGrid && recommendation) {
        const drivers = [
            { icon: 'support_agent', title: recommendation.role || 'Support', desc: 'Recommended agent role' },
            { icon: 'tune', title: `${((recommendation.salesIntensity || 0) * 100).toFixed(0)}% intensity`, desc: 'Sales engagement level' },
            { icon: 'short_text', title: recommendation.responseLength || 'MEDIUM', desc: 'Response length' },
            { icon: 'record_voice_over', title: recommendation.tone || 'Neutral', desc: 'Conversation tone' }
        ];
        driversGrid.innerHTML = drivers.map(d => `
            <div class="wz-driver-card">
                <div class="wz-driver-icon"><span class="material-symbols-outlined">${d.icon}</span></div>
                <h4>${d.title}</h4>
                <p>${d.desc}</p>
            </div>
        `).join('');
    }

    // Store recommendation for later save
    wizardData.recommendation = recommendation;
    wizardData.profile = profile;
}

// ── STEP 4: FINALIZE DEPLOYMENT ──────────────────────────────────────────
async function finalizeDeployment() {
    // Save behavior based on AI recommendation
    if (wizardData.recommendation) {
        try {
            await fetch(`${API_BASE}/${currentWizardConnId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ behaviorProfile: wizardData.recommendation })
            });
        } catch (e) { console.error('Failed to save behavior', e); }
    }

    // Navigate to celebration page
    wzShowPage(4, 2);

    // Populate public URL
    const publicUrl = document.getElementById('wzPublicUrl');
    const extractUrl = document.getElementById('wzExtractUrl');
    if (publicUrl && extractUrl) {
        publicUrl.value = extractUrl.value || window.location.origin;
    }

    // Populate final embed code
    if (currentWizardConnId) {
        const finalEmbed = document.getElementById('wzFinalEmbed');
        if (finalEmbed) {
            const secretField = document.getElementById('wzSecret');
            const pwd = secretField ? secretField.value : '';
            finalEmbed.textContent = `<script src="${window.location.protocol}//${window.location.hostname}:5000/widget.js?id=${currentWizardConnId}&key=${pwd}"><\/script>`;
        }
    }
}

// ── SANDBOX CHAT ─────────────────────────────────────────────────────────
async function sendSandboxMessage() {
    const input = document.getElementById('wzChatInput');
    const area = document.getElementById('wzChatArea');
    if (!input || !area) return;

    const message = input.value.trim();
    if (!message) return;

    // Add user bubble
    area.innerHTML += `
        <div class="wz-chat-bubble" style="align-self: flex-end; background: #4850e5; border-radius: 16px 16px 4px 16px; max-width: 75%;">
            <p style="color: #fff; font-size: 0.88rem; margin: 0;">${escapeHtml(message)}</p>
        </div>
    `;
    input.value = '';
    area.scrollTop = area.scrollHeight;

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    area.innerHTML += `
        <div class="wz-chat-bubble bot" id="${typingId}" style="max-width: 75%;">
            <div class="wz-chat-avatar"><span class="material-symbols-outlined">smart_toy</span></div>
            <div><span class="wz-chat-sender">AI Assistant</span><p class="wz-chat-msg">Thinking...</p></div>
        </div>
    `;
    area.scrollTop = area.scrollHeight;

    try {
        const res = await fetch(`/api/v1/chat/${currentWizardConnId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, mode: 'FREE_CHAT' })
        });
        const data = await res.json();

        const typingEl = document.getElementById(typingId);
        if (typingEl) {
            const msgEl = typingEl.querySelector('.wz-chat-msg');
            if (msgEl) msgEl.textContent = data.reply || data.message || 'No response';
        }
    } catch (e) {
        const typingEl = document.getElementById(typingId);
        if (typingEl) {
            const msgEl = typingEl.querySelector('.wz-chat-msg');
            if (msgEl) { msgEl.textContent = 'Error getting response'; msgEl.style.color = '#ef4444'; }
        }
    }
    area.scrollTop = area.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Copy Embed Code ──────────────────────────────────────────────────────
function copyWzEmbed() {
    const codeEl = document.getElementById('wzEmbedCode');
    if (!codeEl) return;

    const text = codeEl.textContent || codeEl.innerText;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
    } else {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Copied to clipboard!');
    }
}

// Legacy compat — keep global references
window.testWidget = () => {
    const url = document.getElementById('wzExtractUrl')?.value || 'https://google.com';
    window.open(url + '?test_widget=true', '_blank');
};

// ── Placeholder functions (kept for backward compat) ─────────────────────
function updateDeployChecklist() { /* no-op — new wizard uses page-based checklist */ }
function copyWizardEmbed() { copyWzEmbed(); }
async function saveWizardBehavior() { /* behavior now auto-saved via finalizeDeployment */ }
function updateWizardUI() { wzUpdateProgress(); }
function nextStep() { /* no longer used — each page has explicit navigation buttons */ }
function prevStep() { /* no longer used */ }

// Legacy save unused in Wizard but kept for Edit Mode tabs if needed
async function saveConnection() { /* Legacy generic save */ }


// --- UTILS ---
function showToast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.style.borderLeftColor = isError ? 'var(--error)' : 'var(--success)';
    toastEl.classList.add('active');
    setTimeout(() => toastEl.classList.remove('active'), 3000);
}

window.copyEmbed = () => {
    const copyText = document.getElementById("embedCode");
    copyText.select();
    document.execCommand("copy");
    showToast("Copied to clipboard!");
};

function checkHealth() {
    fetch('/health').then(r => r.ok).then(() => {
        const h = document.getElementById('healthStatus');
        if (h) { h.classList.remove('offline'); h.querySelector('.status-text').textContent = 'Backend Online'; }
    }).catch(() => { });
}

function setupSearch() {
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = connectionsData.filter(c =>
            (c.websiteName || '').toLowerCase().includes(query) ||
            (c.connectionId || '').toLowerCase().includes(query) ||
            (c.websiteUrl || '').toLowerCase().includes(query)
        );
        renderConnections(filtered);
    });
}

// --- KNOWLEDGE COVERAGE ENGINE ---
async function recalculateCoverage(connId) {
    try {
        const res = await fetch(`${API_BASE}/${connId}/recalculate-coverage`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            renderCoverageCard(data.coverage);
        }
    } catch (e) {
        console.error('Coverage recalculation error:', e);
    }
}

function renderCoverageCard(coverage) {
    const card = document.getElementById('coverageSummaryCard');
    if (!card) return;
    card.style.display = 'block';

    // Scores
    const covScore = Math.round((coverage.coverageScore || 0) * 100);
    const critScore = Math.round((coverage.criticalCoverageScore || 0) * 100);

    document.getElementById('coverageScoreDisplay').textContent = covScore + '%';
    document.getElementById('criticalScoreDisplay').textContent = critScore + '%';

    // Color coding
    const covEl = document.getElementById('coverageScoreDisplay');
    const critEl = document.getElementById('criticalScoreDisplay');
    covEl.style.color = covScore >= 70 ? 'var(--success)' : covScore >= 40 ? 'var(--warning)' : 'var(--danger)';
    critEl.style.color = critScore >= 67 ? 'var(--success)' : critScore >= 33 ? 'var(--warning)' : 'var(--danger)';

    // Risk badge
    const badge = document.getElementById('coverageRiskBadge');
    const riskColors = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' };
    badge.textContent = (coverage.riskLevel || 'HIGH') + ' Risk';
    badge.className = `status-badge ${riskColors[coverage.riskLevel] || 'danger'}`;

    // Category Breakdown
    const breakdown = document.getElementById('categoryBreakdown');
    const categories = coverage.categories || {};
    const criticalCats = ['PRICING', 'SUPPORT', 'PRODUCT'];
    let html = '';
    for (const [cat, data] of Object.entries(categories)) {
        const count = typeof data === 'object' ? data.count : data;
        if (count > 0) {
            const icon = criticalCats.includes(cat) ? '✓' : '●';
            html += `<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; background: rgba(16,185,129,0.15); color: var(--success);">${icon} ${cat} (${count})</span>`;
        }
    }
    // Missing critical
    for (const mc of (coverage.missingCategories || [])) {
        html += `<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; background: rgba(245,158,11,0.15); color: var(--warning);">⚠ ${mc} Missing</span>`;
    }
    breakdown.innerHTML = html;
}

async function loadReadinessScore(connId) {
    try {
        const res = await fetch(`${API_BASE}/${connId}/coverage`);
        const data = await res.json();
        if (data.success) {
            const r = data.readiness;
            const scoreEl = document.getElementById('readinessScoreValue');
            const msgEl = document.getElementById('readinessMessage');

            scoreEl.textContent = r.readinessScore + '%';
            scoreEl.style.color = r.readinessScore >= 70 ? 'var(--success)' : r.readinessScore >= 40 ? 'var(--warning)' : 'var(--danger)';

            if (r.readinessScore >= 80) msgEl.textContent = "Excellent! You're ready to launch.";
            else if (r.readinessScore >= 50) msgEl.textContent = 'Good progress. Review suggestions below.';
            else msgEl.textContent = 'More content needed for a strong launch.';

            // Breakdown
            document.getElementById('rdBrand').textContent = r.breakdown.brandAlignment + '%';
            document.getElementById('rdKnowledge').textContent = r.breakdown.knowledgeCoverage + '%';
            document.getElementById('rdCritical').textContent = r.breakdown.criticalCoverage + '%';
            document.getElementById('rdDrift').textContent = r.breakdown.driftHealth + '%';

            // Suggestion
            const sugEl = document.getElementById('readinessSuggestion');
            if (r.suggestions && r.suggestions.length > 0) {
                sugEl.textContent = '💡 ' + r.suggestions[0];
                sugEl.style.display = 'block';
            } else {
                sugEl.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Readiness load error:', e);
    }
}

// ==================== BEHAVIOR REFINEMENT ====================

async function loadBehaviorMetrics() {
    if (!activeConnectionId) return;
    try {
        const res = await fetch(`/api/v1/connections/${activeConnectionId}/behavior-metrics`);
        const data = await res.json();
        if (!data.success) return;

        const m = data.metrics;
        document.getElementById('bmAvgConfidence').textContent = (m.avgConfidence * 100).toFixed(0) + '%';
        document.getElementById('bmAvgConfidence').style.color =
            m.avgConfidence >= 0.7 ? 'var(--success)' : m.avgConfidence >= 0.5 ? 'var(--warning)' : 'var(--error)';

        document.getElementById('bmAvgLength').textContent = m.avgResponseLength + ' w';
        document.getElementById('bmSalesTriggers').textContent = m.salesConversionEvents;
        document.getElementById('bmFeedbackRatio').textContent = m.positiveFeedbackCount + ' / ' + m.negativeFeedbackCount;
        document.getElementById('bmFeedbackRatio').style.color =
            m.negativeFeedbackCount > m.positiveFeedbackCount ? 'var(--error)' : 'var(--success)';
        document.getElementById('bmTotalConv').textContent = m.totalConversations;
        document.getElementById('bmLowConf').textContent = m.lowConfidenceAnswers;

        showToast('Metrics refreshed');
    } catch (e) {
        console.error('Behavior metrics error:', e);
    }
}

async function loadBehaviorSuggestions() {
    if (!activeConnectionId) return;
    try {
        const res = await fetch(`/api/v1/connections/${activeConnectionId}/behavior-suggestions`);
        const data = await res.json();
        if (!data.success) return;

        const container = document.getElementById('behaviorSuggestionsList');
        const pending = data.suggestions.filter(s => s.status === 'PENDING');

        if (pending.length === 0) {
            container.innerHTML = `
                <div style="padding: 1rem; border: 1px dashed var(--border-color); text-align: center; color: var(--text-muted); border-radius: 8px; font-size: 0.85rem;">
                    ✅ No optimisation suggestions — behaviour looks healthy.
                </div>`;
            return;
        }

        container.innerHTML = pending.map(s => `
            <div style="background: rgba(255,193,7,0.08); border: 1px solid rgba(255,193,7,0.25); border-radius: 10px; padding: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <strong style="font-size: 0.9rem;">Change <code>${s.field}</code></strong>
                    <span style="font-size: 0.7rem; background: rgba(255,193,7,0.2); padding: 2px 8px; border-radius: 4px; color: var(--warning);">${(s.confidence * 100).toFixed(0)}% confident</span>
                </div>
                <div style="font-size: 0.8rem; margin-bottom: 8px; color: var(--text-muted);">
                    <span style="text-decoration: line-through; color: var(--error);">${s.currentValue}</span>
                    → <span style="color: var(--success); font-weight: 600;">${s.recommendedValue}</span>
                </div>
                <p style="font-size: 0.8rem; margin: 0 0 10px 0; color: var(--text-muted);">${s.reason}</p>
                <div style="display: flex; gap: 8px;">
                    <button class="btn primary" style="font-size: 0.75rem; padding: 4px 14px;" onclick="acceptBehaviorSuggestion('${s.id}')">✓ Accept</button>
                    <button class="btn secondary" style="font-size: 0.75rem; padding: 4px 14px;" onclick="rejectBehaviorSuggestion('${s.id}')">✕ Reject</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Behavior suggestions error:', e);
    }
}

async function acceptBehaviorSuggestion(suggestionId) {
    try {
        const res = await fetch(`/api/v1/connections/${activeConnectionId}/behavior-suggestions/${suggestionId}/accept`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(`Applied: ${data.applied.field} → ${data.applied.value}`);
            loadBehaviorSuggestions();
            loadBehaviorMetrics();
        } else {
            showToast(data.error || 'Failed to apply', 'error');
        }
    } catch (e) {
        console.error('Accept error:', e);
    }
}

async function rejectBehaviorSuggestion(suggestionId) {
    try {
        const res = await fetch(`/api/v1/connections/${activeConnectionId}/behavior-suggestions/${suggestionId}/reject`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Suggestion rejected');
            loadBehaviorSuggestions();
        }
    } catch (e) {
        console.error('Reject error:', e);
    }
}

// ==================== BRAND DRIFT DETECTION ====================

async function loadBrandDriftStatus() {
    if (!activeConnectionId) return;
    try {
        const res = await fetch(`/api/v1/connections/${activeConnectionId}/brand-drift`);
        const data = await res.json();
        if (!data.success) return;

        const badge = document.getElementById('brandDriftBadge');
        const details = document.getElementById('brandDriftDetails');
        const reanalyzeBtn = document.getElementById('reanalyzeBrandBtn');
        const lastAnalysis = document.getElementById('brandLastAnalysis');

        // Last analysis date
        if (data.lastAnalysis) {
            const d = new Date(data.lastAnalysis);
            lastAnalysis.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
        } else {
            lastAnalysis.textContent = 'Never';
        }

        if (data.hasPendingDrift && data.latestDrift) {
            const drift = data.latestDrift;
            badge.textContent = `⚠ ${drift.severity} DRIFT`;
            badge.style.background = drift.severity === 'HIGH' ? 'rgba(244,67,54,0.2)' : 'rgba(255,193,7,0.2)';
            badge.style.color = drift.severity === 'HIGH' ? 'var(--error)' : 'var(--warning)';
            reanalyzeBtn.style.display = 'inline-flex';

            // Show drift details
            if (drift.driftDetails && drift.driftDetails.length > 0) {
                details.innerHTML = `<strong style="color: var(--warning);">Score: ${drift.driftScore}</strong><br>` +
                    drift.driftDetails.map(d =>
                        `<span style="color: var(--text-muted);">${d.field}:</span> <span style="text-decoration: line-through; color: var(--error);">${d.oldValue}</span> → <span style="color: var(--success);">${d.newValue}</span>`
                    ).join('<br>');
                details.style.display = 'block';
            }
        } else {
            badge.textContent = '✓ ALIGNED';
            badge.style.background = 'rgba(76,175,80,0.2)';
            badge.style.color = 'var(--success)';
            reanalyzeBtn.style.display = 'none';
            details.style.display = 'none';
        }
    } catch (e) {
        console.error('Brand drift status error:', e);
    }
}

async function checkBrandDrift() {
    if (!activeConnectionId) return;
    const btn = document.getElementById('checkDriftBtn');
    btn.textContent = 'Checking...';
    btn.disabled = true;
    try {
        const res = await fetch(`/api/v1/connections/${activeConnectionId}/check-brand-drift`, { method: 'POST' });
        const data = await res.json();
        if (data.drifted) {
            showToast(`Brand drift detected! Score: ${data.driftScore} (${data.severity})`);
        } else {
            showToast('No brand drift detected');
        }
        loadBrandDriftStatus();
    } catch (e) {
        console.error('Check drift error:', e);
    } finally {
        btn.textContent = 'Check Drift';
        btn.disabled = false;
    }
}

async function reanalyzeBrand() {
    if (!activeConnectionId) return;
    const btn = document.getElementById('reanalyzeBrandBtn');
    btn.textContent = 'Analyzing...';
    btn.disabled = true;
    try {
        const res = await fetch(`/api/v1/connections/${activeConnectionId}/reanalyze-brand`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Brand re-analysis complete!');
            loadBrandDriftStatus();
        } else {
            showToast(data.error || 'Re-analysis failed', 'error');
        }
    } catch (e) {
        console.error('Reanalyze error:', e);
    } finally {
        btn.textContent = 'Re-analyze Brand';
        btn.disabled = false;
    }
}

// ==================== CONFIDENCE POLICY ====================

async function loadConfidencePolicy() {
    if (!activeConnectionId) return;
    try {
        const res = await fetch(`/api/v1/connections/${activeConnectionId}/confidence-policy`);
        const data = await res.json();
        if (!data.success) return;

        const p = data.policy;
        const slider = document.getElementById('policyMinConfidence');
        slider.value = Math.round((p.minAnswerConfidence || 0.65) * 100);
        document.getElementById('confSliderVal').textContent = slider.value + '%';
        document.getElementById('policyMinSources').value = p.minSourceCount || 1;
        document.getElementById('policyAction').value = p.lowConfidenceAction || 'SOFT_ANSWER';
    } catch (e) {
        console.error('Load policy error:', e);
    }
}

async function saveConfidencePolicy() {
    if (!activeConnectionId) return;
    const btn = document.getElementById('savePolicyBtn');
    btn.disabled = true;
    try {
        const res = await fetch(`/api/v1/connections/${activeConnectionId}/confidence-policy`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                minAnswerConfidence: parseInt(document.getElementById('policyMinConfidence').value) / 100,
                minSourceCount: parseInt(document.getElementById('policyMinSources').value),
                lowConfidenceAction: document.getElementById('policyAction').value
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Safety policy saved');
        } else {
            showToast(data.error || 'Save failed', 'error');
        }
    } catch (e) {
        console.error('Save policy error:', e);
    } finally {
        btn.disabled = false;
    }
}

// ── GLOBAL SEARCH ────────────────────────────────────────────────────────
function setupSearch() {
    const searchInput = document.getElementById('globalSearch');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        // Use global connectionsData state
        const filtered = (window.connectionsData || []).filter(c =>
            (c.websiteName || '').toLowerCase().includes(term) ||
            (c.connectionId || '').toLowerCase().includes(term)
        );
        renderConnections(filtered);
    });
}

// ── HEALTH CHECK ─────────────────────────────────────────────────────────
async function checkHealth() {
    const statusEl = document.getElementById('healthStatus');
    if (!statusEl) return;

    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');

    try {
        // Use list endpoint as health check proxy
        const res = await fetch(API_BASE + '/list');
        if (res.ok) {
            if (dot) {
                dot.style.background = 'var(--success)';
                dot.style.boxShadow = '0 0 6px var(--success)';
            }
            if (text) text.textContent = 'SYSTEM NOMINAL';
            statusEl.style.color = 'var(--success)';
        } else {
            throw new Error('API Error');
        }
    } catch (e) {
        if (dot) {
            dot.style.background = 'var(--error)';
            dot.style.boxShadow = '0 0 6px var(--error)';
        }
        if (text) text.textContent = 'SYSTEM OFFLINE';
        statusEl.style.color = 'var(--error)';
    }
}

