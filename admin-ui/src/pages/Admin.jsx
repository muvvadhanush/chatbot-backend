import React, { useEffect, useRef } from 'react';
import '../assets/admin.css';

export default function AdminDashboard() {
    const isScriptLoaded = useRef(false);

    useEffect(() => {
        if (!isScriptLoaded.current) {
            // Because React rendering takes a moment, we load the heavy admin logic dynamically
            // after the DOM structure is present to simulate traditional bottom-of-body scripts.
            const script = document.createElement("script");
            script.src = "/admin.js"; // This will be served statically from the backend
            script.async = true;
            document.body.appendChild(script);
            isScriptLoaded.current = true;
        }

        // Cleanup isn't strictly necessary for a global singleton script like admin.js,
        // but it's good practice. However admin.js leaves global listeners behind, 
        // so unloading it is tricky. We'll let it persist during the session.
    }, []);

    // The HTML content is extracted straight from the views/admin.html file.
    // It's wrapped in dangerouslySetInnerHTML to guarantee 100% exact DOM replication
    // so `admin.js` can attach to its expected `getElementById` targets flawlessly.
    const rawHtml = `
      <!-- SIDEBAR -->
    <nav class="sidebar">
        <div class="brand">
            <span class="material-symbols-outlined" style="color: var(--primary);">neurology</span>
            Neural Bot
        </div>

        <div class="nav-menu">
            <a href="#" id="navDashboard" class="nav-item active">
                <span class="material-symbols-outlined">dashboard</span>
                Dashboard
            </a>
            <a href="#" id="navConnections" class="nav-item">
                <span class="material-symbols-outlined">hub</span>
                Connections
                <span class="status-badge success" style="margin-left: auto; font-size: 0.7rem;">12</span>
            </a>
            <a href="#" id="navAnalytics" class="nav-item">
                <span class="material-symbols-outlined">analytics</span>
                Analytics
            </a>
            <a href="#" id="navSettings" class="nav-item">
                <span class="material-symbols-outlined">settings</span>
                Settings
            </a>
            <a href="#" id="btnLogout" class="nav-item" style="margin-top: auto; color: var(--error);">
                <span class="material-symbols-outlined">logout</span>
                Logout
            </a>
        </div>
    </nav>

    <!-- MAIN CONTENT -->
    <main class="main-content">

        <!-- DASHBOARD VIEW -->
        <div id="dashboardView">
            <!-- HEADER -->
            <header class="header">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <button id="btnMobileMenu" class="btn-icon mobile-only">
                        <span class="material-symbols-outlined">menu</span>
                    </button>
                    <div class="page-title">
                        <h1>Dashboard Overview</h1>
                        <p>Manage your AI connections and performance.</p>
                    </div>
                </div>

                <div class="user-profile">
                    <button id="btnThemeToggle" class="btn-icon">
                        <span class="material-symbols-outlined" id="themeIcon">light_mode</span>
                    </button>
                    <button class="btn-icon">
                        <span class="material-symbols-outlined">notifications</span>
                    </button>
                    <div class="avatar">T</div>
                </div>
            </header>

            <!-- METRICS -->
            <div class="metrics-grid">
                <div class="neu-card">
                    <div class="metric-label">Total Connections</div>
                    <div id="metricConnections" class="metric-value">-</div>
                    <div class="text-success" style="font-size: 0.9rem;">Live</div>
                </div>
                <div class="neu-card">
                    <div class="metric-label">Active Conversations</div>
                    <div id="metricConversations" class="metric-value">-</div>
                    <div class="text-success" style="font-size: 0.9rem;">Live</div>
                </div>
                <div class="neu-card">
                    <div class="metric-label">Knowledge Sources</div>
                    <div id="metricKnowledge" class="metric-value">-</div>
                    <div class="text-secondary" style="font-size: 0.9rem;">Across all bots</div>
                </div>
                <div class="neu-card">
                    <div class="metric-label">Platform Health</div>
                    <div id="metricHealth" class="metric-value">-</div>
                    <div id="metricHealthLabel" class="text-success" style="font-size: 0.9rem;">Stable</div>
                </div>
                <div class="neu-card">
                    <div class="metric-label">Estimated API Cost</div>
                    <div id="metricCost" class="metric-value">-</div>
                    <div class="text-secondary" style="font-size: 0.9rem;">Current Month (est)</div>
                </div>
                <div class="neu-card">
                    <div class="metric-label">Knowledge Gaps</div>
                    <div id="metricGaps" class="metric-value">-</div>
                    <div id="metricGapsLabel" class="text-success" style="font-size: 0.9rem;">0 Pending</div>
                </div>
            </div>

            <!-- CONNECTIONS -->
            <section>
                <div class="header" style="margin-bottom: 24px;">
                    <h2 style="font-size: 1.4rem;">All Connections</h2>
                    <button id="btnNewConnection" class="btn-neu">
                        <span class="material-symbols-outlined">add</span>
                        New Connection
                    </button>
                </div>

                <div id="connectionsList" class="connections-grid">
                    <div class="loading">Loading connections...</div>
                </div>
            </section>
        </div>

        <!-- DETAILS VIEW (Tabbed Interface) -->
        <div id="detailsView" class="hidden">
            <header class="header">
                <div class="page-title">
                    <button id="btnBackToDash" class="btn-icon" style="margin-right: 10px;">
                        <span class="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div id="detailAvatar" class="avatar-circle"
                        style="width:40px; height:40px; font-size:1.2rem; margin-right: 15px;">A</div>
                    <div>
                        <h1 id="detailTitle">Connection Details</h1>
                        <p id="detailSubtitle">Manage knowledge and settings.</p>
                    </div>
                </div>
            </header>

            <!-- TABS -->
            <div class="tabs-container">
                <div class="tab-header">
                    <div class="tab-item active" data-tab="tabTune">
                        <span class="material-symbols-outlined">tune</span> Tune
                    </div>
                    <div class="tab-item" data-tab="tabTest">
                        <span class="material-symbols-outlined">chat</span> Test
                    </div>
                    <div class="tab-item" data-tab="tabWidget">
                        <span class="material-symbols-outlined">widgets</span> Widget
                    </div>
                    <div class="tab-item" data-tab="tabCustomize">
                        <span class="material-symbols-outlined">palette</span> Customize
                    </div>
                    <div class="tab-item" data-tab="tabIntegrations">
                        <span class="material-symbols-outlined">hub</span> Integrations
                    </div>
                    <div class="tab-item" data-tab="tabButtons">
                        <span class="material-symbols-outlined">smart_button</span> Buttons
                    </div>
                </div>

                <!-- TAB CONTENT: TUNE -->
                <div id="tabTune" class="tab-content active">
                    <div class="two-col-grid">
                        <section>
                            <h2 class="section-title">Business Details</h2>
                            <div class="neu-card">
                                <div class="input-group">
                                    <label>Assistant Name</label>
                                    <input type="text" id="tuneName" class="input-neu">
                                </div>
                                <div class="input-group">
                                    <label>System Prompt (Instructions)</label>
                                    <textarea id="tunePrompt" class="input-neu" rows="6"
                                        placeholder="You are a helpful assistant..."></textarea>
                                </div>
                                <button id="btnSaveTune" class="btn-neu" style="width: 100%; color: var(--success);">
                                    <span class="material-symbols-outlined">save</span> Save Tunings
                                </button>
                            </div>

                            <h2 class="section-title" style="margin-top: 20px;">AI Behavior</h2>
                            <div class="neu-card">
                                <div class="input-group">
                                    <label>Assistant Tone</label>
                                    <select id="tuneTone" class="input-neu">
                                        <option value="Professional">Professional</option>
                                        <option value="Friendly">Friendly</option>
                                        <option value="Sales-Oriented">Sales-Oriented</option>
                                        <option value="Technical">Technical</option>
                                    </select>
                                </div>
                                <div class="input-group">
                                    <label>Response Length (Max Tokens)</label>
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <input type="range" id="tuneLength" min="50" max="800" step="50" value="400"
                                            class="range-neu">
                                        <span id="valTuneLength" style="font-weight: 600; min-width: 40px;">400</span>
                                    </div>
                                </div>
                                <div class="input-group">
                                    <label>Confidence Threshold</label>
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <input type="range" id="tuneThreshold" min="0" max="1" step="0.1" value="0.7"
                                            class="range-neu">
                                        <span id="valTuneThreshold"
                                            style="font-weight: 600; min-width: 40px;">0.7</span>
                                    </div>
                                </div>
                                <p style="font-size: 0.8rem; color: var(--text-tertiary); margin-top: 10px;">
                                    Adjust how much knowledge similarity is required for the AI to attempt an answer.
                                </p>
                            </div>

                            <h2 class="section-title" style="margin-top: 20px;">Knowledge Base</h2>
                            <div class="neu-card">
                                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 10px;">
                                    Manage your indexed content.
                                </p>
                                <button id="btnRefreshExtract" class="btn-neu" style="width: 100%;">
                                    <span class="material-symbols-outlined">refresh</span> re-Scan Website
                                </button>
                                <div id="knowledgeList" class="review-list" style="margin-top: 15px;">
                                    <!-- Dynamic Content -->
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 class="section-title">Missed Questions</h2>
                            <div id="missedList" class="review-list">
                                <div class="empty-state">No missed questions yet.</div>
                            </div>
                        </section>
                    </div>
                </div>

                <!-- TAB CONTENT: TEST -->
                <div id="tabTest" class="tab-content">
                    <div class="chat-preview" style="height: 600px;">
                        <div class="chat-messages" id="testTabMessages">
                            <div class="msg-bot">Hello! I'm ready to help.</div>
                        </div>
                        <div class="chat-input-area">
                            <input type="text" id="inpTestTabChat" placeholder="Type a message..." class="input-neu">
                            <button id="btnSendTestTabChat" class="btn-icon">
                                <span class="material-symbols-outlined">send</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- TAB CONTENT: WIDGET -->
                <div id="tabWidget" class="tab-content">
                    <div class="two-col-grid">
                        <section>
                            <h2 class="section-title">Installation</h2>
                            <div class="neu-card">
                                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 10px;">
                                    Add this code to your website's <code>&lt;head&gt;</code> tag.
                                </p>
                                <div class="code-block" id="snippetView"></div>
                                <button id="btnCopySnippetView" class="btn-neu" style="width: 100%; margin-top: 10px;">
                                    <span class="material-symbols-outlined">content_copy</span> Copy Code
                                </button>
                            </div>
                        </section>
                        <section>
                            <h2 class="section-title">Preview</h2>
                            <div class="neu-card"
                                style="height: 300px; display: flex; align-items: center; justify-content: center; background: var(--bg-body);">
                                <p style="color: var(--text-tertiary);">Widget Preview Placeholder</p>
                            </div>
                        </section>
                    </div>
                </div>

                <!-- TAB CONTENT: CUSTOMIZE -->
                <div id="tabCustomize" class="tab-content">
                    <section style="max-width: 600px;">
                        <h2 class="section-title">Appearance</h2>
                        <div class="neu-card">
                            <div class="input-group">
                                <label>Widget Title</label>
                                <input type="text" id="cfgTitle" class="input-neu" placeholder="AI Assistant">
                            </div>
                            <div class="input-group">
                                <label>Welcome Message</label>
                                <input type="text" id="cfgWelcome" class="input-neu" placeholder="Hi! How can I help?">
                            </div>

                            <div class="two-col-grid" style="grid-template-columns: 1fr 1fr; gap: 10px;">
                                <div class="input-group">
                                    <label>Brand Color</label>
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <input type="color" id="cfgColor" value="#4f46e5"
                                            style="height: 40px; width: 60px; border: none; background: none; cursor: pointer;">
                                        <span id="cfgColorVal">#4f46e5</span>
                                    </div>
                                </div>
                                <div class="input-group">
                                    <label>Auto-Open (sec)</label>
                                    <input type="number" id="cfgTimer" class="input-neu" min="0"
                                        placeholder="0 (Disabled)">
                                </div>
                                <div class="input-group">
                                    <label>Bot Avatar URL (Optional)</label>
                                    <input type="text" id="cfgAvatar" class="input-neu" placeholder="https://...">
                                </div>
                            </div>

                            <button id="btnSaveConfig" class="btn-neu"
                                style="width: 100%; margin-top: 15px; color: var(--success);">
                                <span class="material-symbols-outlined">save</span> Save Appearance
                            </button>
                        </div>
                    </section>
                </div>

                <!-- TAB CONTENT: INTEGRATIONS -->
                <div id="tabIntegrations" class="tab-content">
                    <div class="two-col-grid">
                        <section>
                            <h2 class="section-title">Enterprise Connectors</h2>
                            <div class="neu-card">
                                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                                    <img src="https://cdn-icons-png.flaticon.com/512/2111/2111615.png" width="32"
                                        alt="Slack">
                                    <div>
                                        <h3 style="margin-bottom: 2px;">Slack Notifications</h3>
                                        <p style="font-size: 0.8rem; color: var(--text-tertiary);">Send knowledge gaps
                                            and escalations to a Slack channel.</p>
                                    </div>
                                </div>
                                <div class="input-group">
                                    <label>Incoming Webhook URL</label>
                                    <input type="password" id="slackWebhook" class="input-neu"
                                        placeholder="https://hooks.slack.com/services/...">
                                </div>
                                <button id="btnSaveSlack" class="btn-neu" style="width: 100%; color: var(--success);">
                                    <span class="material-symbols-outlined">save</span> Save Slack Config
                                </button>
                            </div>

                            <div class="neu-card" style="margin-top: 20px; opacity: 0.6; filter: grayscale(1);">
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    <img src="https://cdn-icons-png.flaticon.com/512/5968/5968852.png" width="32"
                                        alt="Salesforce">
                                    <div>
                                        <h3 style="margin-bottom: 2px;">Salesforce CRM (Coming Soon)</h3>
                                        <p style="font-size: 0.8rem;">Sync leads and feedback directly to your CRM.</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                        <section>
                            <h2 class="section-title">Workflow Actions</h2>
                            <div class="neu-card">
                                <div class="input-group">
                                    <label>Action Type</label>
                                    <select id="actionType" class="input-neu">
                                        <option value="NONE">No Action</option>
                                        <option value="WEBHOOK">Generic Webhook</option>
                                        <option value="EMAIL">Email Alert</option>
                                        <option value="SLACK">Slack Message</option>
                                    </select>
                                </div>
                                <p style="font-size: 0.8rem; color: var(--text-tertiary);">This action triggers when a
                                    user completes a guided flow.</p>
                                <button id="btnSaveAction" class="btn-neu"
                                    style="width: 100%; margin-top: 20px; color: var(--success);">
                                    <span class="material-symbols-outlined">save</span> Save Action Policy
                                </button>
                            </div>
                        </section>
                    </div>
                </div>

                <!-- TAB CONTENT: BUTTONS -->
                <div id="tabButtons" class="tab-content">
                    <div class="two-col-grid">
                        <section>
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <h2 class="section-title">Button Sets</h2>
                                <button class="btn-neu" onclick="showButtonEditor()" style="color:var(--accent);">
                                    <span class="material-symbols-outlined">add</span> New
                                </button>
                            </div>
                            <div id="buttonSetsList" class="btn-sets-list">
                                <div class="empty-state"
                                    style="text-align:center;padding:40px;color:var(--text-tertiary);">
                                    <span class="material-symbols-outlined"
                                        style="font-size:48px;opacity:0.3;">smart_button</span>
                                    <p style="margin-top:12px;">No button sets yet. Create one to add interactive
                                        buttons to your chatbot.</p>
                                </div>
                            </div>
                        </section>
                        <section>
                            <h2 class="section-title">Live Preview</h2>
                            <div class="neu-card" id="buttonPreviewPanel">
                                <div
                                    style="background:linear-gradient(135deg,#f0f0ff,#fff);border-radius:16px;padding:16px;min-height:120px;position:relative;">
                                    <div
                                        style="background:#fff;padding:10px 14px;border-radius:14px;font-size:13px;color:#374151;box-shadow:0 2px 8px rgba(0,0,0,0.06);display:inline-block;max-width:80%;">
                                        How can I help you today?
                                    </div>
                                    <div id="previewBtnsContainer"
                                        style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;"></div>
                                </div>
                                <p
                                    style="font-size:0.75rem;color:var(--text-tertiary);margin-top:10px;text-align:center;">
                                    This preview shows how buttons appear in the widget.
                                </p>
                            </div>
                        </section>
                    </div>

                    <!-- BUTTON EDITOR DIALOG -->
                    <div id="buttonEditorDialog" class="btn-editor-dialog hidden">
                        <div class="btn-editor-overlay"></div>
                        <div class="btn-editor-content">
                            <div class="btn-editor-header">
                                <h3 id="btnEditorTitle">Create Button Set</h3>
                                <button class="btn-icon" onclick="hideButtonEditor()">
                                    <span class="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div class="btn-editor-body">
                                <div class="input-group">
                                    <label>Set Name</label>
                                    <input type="text" id="btnSetName" class="input-neu"
                                        placeholder="e.g. Welcome Buttons" maxlength="100">
                                </div>
                                <div style="display:flex;gap:16px;">
                                    <div class="input-group" style="flex:1;">
                                        <label>Trigger Type</label>
                                        <select id="btnTriggerType" class="input-neu" onchange="toggleTriggerValue()">
                                            <option value="MANUAL">Manual</option>
                                            <option value="WELCOME">Welcome (1st message)</option>
                                            <option value="KEYWORD">Keyword Match</option>
                                            <option value="FALLBACK">Low Confidence Fallback</option>
                                        </select>
                                    </div>
                                    <div class="input-group" style="flex:1;">
                                        <label>Quick Reply</label>
                                        <label class="toggle-label">
                                            <input type="checkbox" id="btnQuickReply">
                                            <span style="font-size:0.8rem;color:var(--text-secondary);">Disappear after
                                                click</span>
                                        </label>
                                    </div>
                                </div>
                                <div id="triggerValueGroup" class="input-group hidden">
                                    <label>Keywords (comma-separated)</label>
                                    <input type="text" id="btnTriggerValue" class="input-neu"
                                        placeholder="pricing, plans, cost">
                                </div>

                                <h4 style="margin-top:16px;margin-bottom:8px;">Buttons <span id="btnCountBadge"
                                        style="font-size:0.75rem;color:var(--text-tertiary);">(0/5)</span></h4>
                                <div id="buttonRowsContainer"></div>
                                <button class="btn-neu" id="btnAddRow" onclick="addButtonRow()"
                                    style="width:100%;margin-top:8px;color:var(--accent);">
                                    <span class="material-symbols-outlined">add</span> Add Button
                                </button>
                            </div>
                            <div class="btn-editor-footer">
                                <button class="btn-neu" onclick="hideButtonEditor()">Cancel</button>
                                <button class="btn-neu" id="btnSaveSet" onclick="saveButtonSet()"
                                    style="color:var(--success);">
                                    <span class="material-symbols-outlined">save</span> Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <!-- ANALYTICS VIEW -->
        <div id="analyticsView" class="hidden">
            <header class="header">
                <div class="page-title">
                    <h1>Performance Analytics</h1>
                    <p>Insights into your chatbot's conversations and engagement.</p>
                </div>
                <div class="user-profile">
                    <button class="btn-neu" onclick="loadAnalyticsData()">
                        <span class="material-symbols-outlined">refresh</span>
                    </button>
                </div>
            </header>

            <div class="metrics-grid">
                <div class="neu-card">
                    <div class="metric-label">Total Conversations</div>
                    <div id="anaTotalConvs" class="metric-value">-</div>
                </div>
                <div class="neu-card">
                    <div class="metric-label">Avg. Messages/Chat</div>
                    <div id="anaAvgMsg" class="metric-value">-</div>
                </div>
                <div class="neu-card">
                    <div class="metric-label">Avg. Confidence</div>
                    <div id="anaAvgConf" class="metric-value">-</div>
                </div>
            </div>

            <div class="two-col-grid" style="margin-top: 24px;">
                <div class="neu-card">
                    <h3>Conversation Volume</h3>
                    <div
                        style="height: 300px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.02); border-radius: 8px;">
                        <p style="color: var(--text-tertiary);">Chart Placeholder (Volume)</p>
                    </div>
                </div>
                <div class="neu-card">
                    <h3>Topic Distribution</h3>
                    <div
                        style="height: 300px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.02); border-radius: 8px;">
                        <p style="color: var(--text-tertiary);">Chart Placeholder (Topics)</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- SETTINGS VIEW -->
        <div id="settingsView" class="hidden">
            <header class="header">
                <div class="page-title">
                    <h1>Global Settings</h1>
                    <p>Manage account and platform configurations.</p>
                </div>
            </header>

            <div class="neu-card" style="max-width: 800px;">
                <h2 class="section-title">Account</h2>
                <div class="input-group">
                    <label>Email Address</label>
                    <input type="email" value="admin@example.com" class="input-neu" disabled>
                </div>
                <div class="input-group">
                    <label>API Key (Master)</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="password" value="sk_live_master_key_hidden" class="input-neu" disabled>
                        <button class="btn-neu">Reveal</button>
                    </div>
                </div>

                <h2 class="section-title" style="margin-top: 30px;">Platform Defaults</h2>
                <div class="input-group">
                    <label>Default Model</label>
                    <select class="input-neu">
                        <option>GPT-4o (Recommended)</option>
                        <option>GPT-3.5 Turbo</option>
                        <option>Claude 3.5 Sonnet</option>
                    </select>
                </div>

                <h2 class="section-title" style="margin-top: 30px;">Team</h2>
                <p style="color: var(--text-secondary); margin-bottom: 10px;">User management is disabled in this
                    version.</p>

                <div style="text-align: right; margin-top: 20px;">
                    <button class="btn-neu primary">Save Changes</button>
                </div>
            </div>
        </div>

    </main>

    <!-- NEW CONNECTION WORKFLOW (Modal) -->
    <div id="workflowContainer" class="workflow-container">
        <div class="workflow-modal modal-content" style="width: 800px; max-width: 95%;">

            <!-- Header & Progress Sticky Section -->
            <div style="padding: 24px 24px 0; background: var(--bg-body); z-index: 10;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div>
                        <h2 style="font-size: 1.5rem;">New AI Connection</h2>
                        <p style="color:var(--text-secondary); font-size:0.9rem;">Follow the steps to launch your
                            enterprise chatbot.</p>
                    </div>
                    <button id="btnCloseWorkflow" class="btn-icon">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div class="step-indicator" style="margin-bottom: 20px;">
                    <div class="step-dot active" id="dotStep1">1</div>
                    <div class="step-dot" id="dotStep2">2</div>
                    <div class="step-dot" id="dotStep3">3</div>
                    <div class="step-dot" id="dotStep4">4</div>
                    <div class="step-dot" id="dotStep5">5</div>
                    <div class="step-dot" id="dotStep6">6</div>
                </div>
            </div>

            <div class="modal-body">


                <!-- STEP 1: CONNECT WEBSITE -->
                <div id="step1" class="workflow-step active">
                    <div class="two-col-grid" style="grid-template-columns: 1fr 1fr; gap: 30px;">
                        <!-- Left Column: Create Identity -->
                        <div>
                            <h3 style="margin-bottom: 5px;">Connect Your Website</h3>
                            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 20px;">
                                Name your AI assistant and we'll generate the integration code.
                            </p>

                            <div class="input-group">
                                <label style="font-weight: 600;">Connection Name <span
                                        style="color: var(--error);">*</span></label>
                                <input type="text" id="inpSiteName" class="input-neu"
                                    placeholder="e.g. Acme Corp Support Bot" maxlength="64">
                                <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;">
                                    This is how your bot appears in the admin panel.
                                </p>
                            </div>

                            <button id="btnCreateIdentity" class="btn-neu"
                                style="width: 100%; color: var(--accent); margin-top: 15px; padding: 14px;">
                                <span class="material-symbols-outlined">bolt</span>
                                Generate Connection
                            </button>
                        </div>

                        <!-- Right Column: Install & Verify -->
                        <div id="colConnect" style="opacity: 0.4; pointer-events: none; transition: all 0.3s;">
                            <h3 style="margin-bottom: 5px;">Install Widget</h3>
                            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 20px;">
                                Add this snippet to your website's <code>&lt;head&gt;</code> tag.
                            </p>

                            <!-- Snippet Display -->
                            <div class="code-block" id="codeSnippet"
                                style="min-height: 80px; font-size: 0.75rem; background: var(--bg-elevated); padding: 12px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; white-space: pre-wrap; word-break: break-all; border: 1px solid var(--border-subtle);">
                                &lt;!-- Snippet appears after creation --&gt;
                            </div>
                            <button id="btnCopyCode" class="btn-neu"
                                style="width: 100%; margin-top: 8px; margin-bottom: 16px;">
                                <span class="material-symbols-outlined">content_copy</span> Copy Snippet
                            </button>

                            <!-- Handshake Status -->
                            <div class="neu-card" id="handshakeCard" style="text-align: center; padding: 20px;">
                                <div id="handshakeIcon" style="margin-bottom: 8px;">
                                    <span class="material-symbols-outlined"
                                        style="font-size: 32px; color: var(--text-tertiary);">
                                        pending
                                    </span>
                                </div>
                                <div id="verifyStatus" style="font-size: 0.9rem; font-weight: 600; margin-bottom: 4px;">
                                    Waiting for creation…
                                </div>
                                <div id="handshakeHint" style="font-size: 0.8rem; color: var(--text-tertiary);">
                                    Your widget will check in automatically once installed.
                                </div>
                                <div id="handshakeTimer"
                                    style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 8px;">
                                </div>

                                <!-- Retry Button (hidden initially) -->
                                <button id="btnRetryHandshake" class="btn-neu hidden"
                                    style="width: 100%; margin-top: 12px; color: var(--warning);">
                                    <span class="material-symbols-outlined">refresh</span> Regenerate Key & Retry
                                </button>
                            </div>

                            <!-- Next Button (blocked until handshake) -->
                            <button id="btnStep1Next" class="btn-neu"
                                style="width: 100%; margin-top: 16px; padding: 14px; color: var(--primary);" disabled>
                                <span class="material-symbols-outlined">arrow_forward</span>
                                Next: Train Knowledge Base
                            </button>
                        </div>
                    </div>
                </div>

                <!-- STEP 2: LET AI LEARN -->
                <div id="step2" class="workflow-step">
                    <h3 style="margin-bottom: 6px;">
                        <span class="material-symbols-outlined"
                            style="vertical-align: middle; color: var(--primary);">school</span>
                        Let AI Learn
                    </h3>
                    <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 0.9rem;">
                        Provide your website URL so the AI can discover and learn from your content.
                    </p>

                    <div class="two-col-grid" style="gap: 24px; align-items: start;">
                        <!-- LEFT: Input + Controls -->
                        <div>
                            <div class="neu-card" style="padding: 24px;">
                                <label style="font-weight: 600; margin-bottom: 8px; display: block;">Website URL</label>
                                <input type="url" id="inpLearnUrl" class="input-neu"
                                    placeholder="https://yourwebsite.com" style="margin-bottom: 16px; width: 100%;">

                                <button id="btnStartLearn" class="primary"
                                    style="width: 100%; padding: 14px; font-weight: 600;">
                                    <span class="material-symbols-outlined"
                                        style="vertical-align: middle; margin-right: 6px;">rocket_launch</span>
                                    Start Learning
                                </button>

                                <!-- Phase Indicator -->
                                <div id="learnPhaseCard" class="hidden"
                                    style="margin-top: 20px; padding: 16px; border-radius: 12px; background: var(--bg-secondary); text-align: center;">
                                    <div id="learnPhaseIcon" style="margin-bottom: 8px;">
                                        <span class="material-symbols-outlined fa-spin"
                                            style="font-size: 32px; color: var(--primary);">progress_activity</span>
                                    </div>
                                    <p id="learnPhaseText" style="font-weight: 600; margin-bottom: 4px;">Discovering
                                        pages...</p>
                                    <p id="learnPhaseHint" style="font-size: 0.8rem; color: var(--text-tertiary);">This
                                        may
                                        take 30–60 seconds depending on site size.</p>
                                </div>

                                <!-- Retry Button (hidden by default) -->
                                <button id="btnRetryLearn" class="btn-neu hidden"
                                    style="width: 100%; margin-top: 12px; color: var(--warning);">
                                    <span class="material-symbols-outlined"
                                        style="vertical-align: middle;">refresh</span>
                                    Retry Learning
                                </button>
                            </div>

                            <!-- Manual methods toggle -->
                            <details style="margin-top: 16px;" class="neu-card" id="manualLearnMethods">
                                <summary
                                    style="cursor: pointer; font-weight: 600; padding: 12px; color: var(--text-secondary);">
                                    <span class="material-symbols-outlined"
                                        style="vertical-align: middle; font-size: 18px;">tune</span>
                                    Manual Methods (File / Paste)
                                </summary>
                                <div style="padding: 0 16px 16px;">
                                    <!-- File Upload -->
                                    <div style="margin-bottom: 16px;">
                                        <label style="font-weight: 600; font-size: 0.85rem;">Upload File (PDF, TXT,
                                            DOCX)</label>
                                        <input type="file" id="inpFile" class="hidden" accept=".pdf,.txt,.docx">
                                        <button onclick="document.getElementById('inpFile').click()" class="btn-neu"
                                            style="margin-top: 6px; width: 100%;">
                                            <span class="material-symbols-outlined"
                                                style="vertical-align: middle;">upload_file</span> Select File
                                        </button>
                                        <div id="fileNameDisplay"
                                            style="font-size: 0.8rem; color: var(--text-tertiary); margin-top: 4px;">No
                                            file
                                            selected</div>
                                        <button id="btnUploadFile" class="primary" disabled
                                            style="width: 100%; margin-top: 8px; padding: 10px;">Upload &
                                            Extract</button>
                                    </div>
                                    <!-- Manual Paste -->
                                    <div>
                                        <label style="font-weight: 600; font-size: 0.85rem;">Paste Knowledge</label>
                                        <input type="text" id="inpPasteTitle" class="input-neu"
                                            placeholder="Title (e.g. Return Policy)" style="margin-top: 6px;">
                                        <textarea id="inpPasteContent" class="input-neu" rows="4"
                                            placeholder="Paste content..." style="margin-top: 8px;"></textarea>
                                        <button id="btnSavePaste" class="primary"
                                            style="width: 100%; margin-top: 8px; padding: 10px;">Save & Extract</button>
                                    </div>
                                </div>
                            </details>
                        </div>

                        <!-- RIGHT: Learning Dashboard -->
                        <div id="learnDashboard" style="opacity: 0.4; pointer-events: none;">
                            <div class="neu-card" style="padding: 24px;">
                                <h4 style="margin-bottom: 16px; color: var(--text-primary);">
                                    <span class="material-symbols-outlined"
                                        style="vertical-align: middle; color: var(--primary);">monitoring</span>
                                    Learning Progress
                                </h4>

                                <!-- Stats Grid -->
                                <div
                                    style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                                    <div
                                        style="background: var(--bg-secondary); border-radius: 10px; padding: 14px; text-align: center;">
                                        <span id="statDiscovered"
                                            style="font-size: 1.8rem; font-weight: 700; color: var(--primary);">0</span>
                                        <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 2px;">
                                            Pages
                                            Found</p>
                                    </div>
                                    <div
                                        style="background: var(--bg-secondary); border-radius: 10px; padding: 14px; text-align: center;">
                                        <span id="statExtracted"
                                            style="font-size: 1.8rem; font-weight: 700; color: var(--success);">0</span>
                                        <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 2px;">
                                            Pages
                                            Learned</p>
                                    </div>
                                </div>

                                <!-- Extracted Items List -->
                                <div style="margin-bottom: 20px;">
                                    <h5 style="margin-bottom: 8px; color: var(--text-secondary); font-size: 0.85rem;">
                                        Recent Knowledge</h5>
                                    <ul id="learnItemList"
                                        style="list-style: none; padding: 0; margin: 0; max-height: 150px; overflow-y: auto; font-size: 0.8rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 8px;">
                                        <li
                                            style="padding: 10px; color: var(--text-tertiary); text-align: center; font-style: italic;">
                                            Waiting for content...</li>
                                    </ul>
                                </div>

                                <button id="btnStep2Next" class="btn-neu"
                                    style="width: 100%; padding: 14px; color: var(--primary);" disabled>
                                    <span class="material-symbols-outlined">arrow_forward</span>
                                    Next: Brand Identity
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- STEP 3: BRAND IDENTITY (AI Inference) -->
                <div id="step3" class="workflow-step">
                    <h3 style="margin-bottom: 6px;">
                        <span class="material-symbols-outlined"
                            style="vertical-align: middle; color: var(--primary);">psychology</span>
                        Brand Identity
                    </h3>
                    <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 0.9rem;">
                        Let AI analyze the extracted knowledge to determine how the assistant should behave.
                    </p>

                    <!-- Auto-Detection View -->
                    <div id="brandProfileDetection" style="text-align: center; padding: 40px;">
                        <span class="material-symbols-outlined fa-spin"
                            style="font-size: 48px; color: var(--primary);">neurology</span>
                        <h4 style="margin-top: 16px; margin-bottom: 8px;">Analyzing Brand Profile...</h4>
                        <p style="color: var(--text-tertiary); font-size: 0.9rem; max-width: 400px; margin: 0 auto;">
                            We're scanning your website's content to determine your industry, primary goals, and how
                            your AI should speak to your customers.
                        </p>
                    </div>

                    <!-- Detected Profile View -->
                    <div id="brandProfileCard" class="neu-card" style="display: none;">
                        <div style="display: flex; gap: 20px; align-items: start;">
                            <!-- Dynamic Avatar -->
                            <div id="bpAvatar"
                                style="width: 60px; height: 60px; border-radius: 16px; background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 700;">
                                ?
                            </div>

                            <div style="flex: 1;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div id="bpIndustry"
                                            style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--primary); font-weight: 600; margin-bottom: 4px;">
                                            INDUSTRY
                                        </div>
                                        <h2 id="bpName" style="margin-bottom: 4px;">Assistant Name</h2>
                                        <p id="bpRole" style="color: var(--text-secondary); font-size: 0.9rem;">
                                            Assistant Role Placeholder
                                        </p>
                                    </div>
                                    <!-- Edit Toggle -->
                                    <button class="btn-neu" id="btnEditBrandProfile" style="padding: 8px 12px;">
                                        <span class="material-symbols-outlined"
                                            style="font-size:18px;">edit_note</span> Customize
                                    </button>
                                </div>

                                <div style="margin-top: 16px; padding: 12px; background: var(--bg-elevated); border-radius: 8px; border-left: 3px solid var(--accent);"
                                    id="bpReasoning">
                                    Reasoning text will go here...
                                </div>

                                <!-- Read-Only Badges Layout -->
                                <div id="bpViewMode" style="margin-top: 20px;">
                                    <h4 style="margin-bottom: 12px; font-size: 0.85rem; color: var(--text-tertiary);">
                                        RECOMMENDED SETTINGS</h4>
                                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
                                        <div class="bp-badge"><span
                                                class="material-symbols-outlined">record_voice_over</span> <b
                                                id="badgeTone">Tone</b></div>
                                        <div class="bp-badge"><span class="material-symbols-outlined">flag</span> <b
                                                id="badgeGoal">Goal</b></div>
                                        <div class="bp-badge"><span class="material-symbols-outlined">sell</span> Sales
                                            Intensity: <b id="badgeSales">Medium</b></div>
                                    </div>
                                    <div>
                                        <p style="font-size: 0.85rem; color: var(--text-tertiary); font-weight: 600;">
                                            First Message</p>
                                        <p id="bpWelcome"
                                            style="font-style: italic; background: var(--bg-body); padding: 10px; border-radius: 6px; margin-top: 4px; font-size: 0.9rem;">
                                            Welcome message...
                                        </p>
                                    </div>
                                </div>

                                <!-- Editable Form Layout -->
                                <div id="bpEditMode" class="hidden" style="margin-top: 20px;">
                                    <div class="two-col-grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                                        <div class="input-group">
                                            <label>Assistant Name</label>
                                            <input type="text" id="editName" class="input-neu">
                                        </div>
                                        <div class="input-group">
                                            <label>Tone</label>
                                            <select id="editTone" class="input-neu">
                                                <option>Professional</option>
                                                <option>Friendly</option>
                                                <option>Casual</option>
                                                <option>Technical</option>
                                                <option>Sales-Oriented</option>
                                            </select>
                                        </div>
                                        <div class="input-group" style="grid-column: span 2;">
                                            <label>First Message</label>
                                            <input type="text" id="editWelcome" class="input-neu">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Behavior Summary -->
                        <div id="behaviorSummaryCard"
                            style="margin-top: 20px; padding: 16px; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; display: none;">
                            <h4 style="color: var(--success); margin-bottom: 8px; font-size: 0.9rem;">
                                <span class="material-symbols-outlined"
                                    style="vertical-align: middle; font-size: 18px;">check_circle</span>
                                Behavior Fine-Tuning Applied
                            </h4>
                            <p id="behaviorSummaryText" style="font-size: 0.85rem; color: var(--text-secondary);">
                                Based on your content, we've adjusted the AI behaviour.
                            </p>
                        </div>


                        <div style="margin-top: 24px; text-align: right;">
                            <button id="btnAcceptBrandProfile" class="btn-neu primary" style="padding: 12px 24px;">
                                Accept & Continue
                            </button>
                        </div>
                    </div>
                </div>

                <!-- STEP 4: VERIFY (Test Chat & Confidence Gate) -->
                <div id="step4" class="workflow-step">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
                        <div>
                            <h3 style="margin-bottom: 6px;">
                                <span class="material-symbols-outlined"
                                    style="vertical-align: middle; color: var(--primary);">verified</span>
                                Verify & Test
                            </h3>
                            <p style="color: var(--text-secondary); font-size: 0.9rem;">
                                Talk to your bot. If it isn't confident in an answer, it will use the Fallback Guard.
                            </p>
                        </div>
                        <button id="btnStep4Next" class="btn-neu"
                            style="padding: 10px 20px; color: var(--primary); font-weight: 600;" disabled>
                            Next: Review Final &rarr;
                        </button>
                    </div>


                    <div class="two-col-grid" style="gap: 30px; grid-template-columns: 350px 1fr;">
                        <!-- Right Column: Verification Status (Moved to left for UX flow) -->
                        <div class="neu-card" style="padding: 24px;">
                            <h4 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                                <span class="material-symbols-outlined">checklist</span>
                                Pre-Flight Checks
                            </h4>

                            <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.9rem;">
                                <li style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                                    <span class="material-symbols-outlined" style="color: var(--success);">check_circle</span>
                                    <span>Identity Built</span>
                                </li>
                                <li style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                                    <span class="material-symbols-outlined" style="color: var(--success);">check_circle</span>
                                    <span>Knowledge Indexed</span>
                                </li>
                                <li style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                                    <span class="material-symbols-outlined" style="color: var(--success);">check_circle</span>
                                    <span>Brand Profile Set</span>
                                </li>
                                <li id="checkTestChat" style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; opacity: 0.5;">
                                    <span class="material-symbols-outlined" id="iconTestChat">pending</span>
                                    <span>Sent Test Message</span>
                                </li>
                            </ul>

                            <hr style="border: 0; border-top: 1px solid var(--border-subtle); margin: 24px 0;">

                            <h4 style="margin-bottom: 12px; font-size: 0.9rem;">Confidence Guardrail</h4>
                            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 16px;">
                                If the bot's confidence drops below <b>70%</b>, what should it do?
                            </p>

                            <select id="selConfidenceGate" class="input-neu" style="margin-bottom: 12px;">
                                <option value="ESCALATE">Ask for Email/Escalade</option>
                                <option value="APOLOGIZE">Politely Apologize</option>
                                <option value="GUESS">Try Best Guess (Not Recommended)</option>
                            </select>
                            
                            <button id="btnSaveGate" class="btn-neu" style="width: 100%; font-size: 0.8rem;">
                                Update Guardrail
                            </button>
                        </div>


                        <!-- Left Column: Chat Preview -->
                        <div class="chat-preview" style="height: 500px;">
                            <!-- Top bar representing widget header -->
                            <div style="background: var(--bg-elevated); padding: 16px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; gap: 12px; border-radius: 12px 12px 0 0;">
                                <div id="previewAvatar" class="avatar-circle" style="width:36px; height:36px;">B</div>
                                <div>
                                    <div id="previewTitle" style="font-weight: 600; font-size: 0.9rem;">Bot Title</div>
                                    <div style="font-size: 0.75rem; color: var(--success);">● Active</div>
                                </div>
                            </div>
                            
                            <div class="chat-messages" id="testChatMessages" style="flex: 1; border-radius: 0;">
                                <div class="msg-bot">Hello! I'm ready to help.</div>
                            </div>
                            
                            <div class="chat-input-area" style="border-radius: 0 0 12px 12px;">
                                <input type="text" id="inpTestChat" placeholder="Type a message..." class="input-neu">
                                <button id="btnSendTestChat" class="btn-icon">
                                    <span class="material-symbols-outlined">send</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- STEP 5: CUSTOMIZE APPEARANCE -->
                <div id="step5" class="workflow-step">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
                        <div>
                            <h3 style="margin-bottom: 6px;">
                                <span class="material-symbols-outlined" style="vertical-align: middle; color: var(--primary);">palette</span>
                                Widget Appearance
                            </h3>
                            <p style="color: var(--text-secondary); font-size: 0.9rem;">
                                Make the widget match your brand before going live.
                            </p>
                        </div>
                        <button id="btnStep5Next" class="btn-neu"
                            style="padding: 10px 20px; color: var(--primary); font-weight: 600;">
                            Next: Launch &rarr;
                        </button>
                    </div>

                    <div class="two-col-grid">
                        <div class="neu-card" style="padding: 24px;">
                            <div class="input-group">
                                <label>Widget Window Title</label>
                                <input type="text" id="wizTitle" class="input-neu" placeholder="e.g. Chat with Us">
                            </div>
                            <div class="input-group">
                                <label>Welcome Message</label>
                                <input type="text" id="wizWelcome" class="input-neu" placeholder="Hi! How can I help you today?">
                            </div>
                            <div class="input-group">
                                <label>Primary Color</label>
                                <div style="display: flex; gap: 10px; align-items: center;">
                                    <input type="color" id="wizColor" value="#4f46e5" class="input-neu" style="padding: 0; width: 60px; height: 40px;">
                                    <span id="wizColorHex" style="font-family: monospace;">#4f46e5</span>
                                </div>
                            </div>
                            <button id="btnSaveWizAppearance" class="btn-neu" style="width: 100%; margin-top: 10px;">
                                Apply Changes
                            </button>
                        </div>

                        <!-- Mini Preview -->
                        <div class="neu-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--bg-body);">
                             <h4 style="margin-bottom: 20px; color: var(--text-tertiary);">Live Preview</h4>
                             <!-- Mock Widget Bubble -->
                             <div id="wizBubblePreview" style="width: 60px; height: 60px; border-radius: 50%; background: #4f46e5; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: background 0.3s;">
                                 <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                 </svg>
                             </div>
                             <p style="margin-top: 16px; font-size: 0.8rem; color: var(--text-tertiary);">This is how it appears on your site.</p>
                        </div>
                    </div>
                </div>

                <!-- STEP 6: LAUNCH -->
                <div id="step6" class="workflow-step">
                    <div style="text-align: center; max-width: 500px; margin: 40px auto;">
                        <span class="material-symbols-outlined" style="font-size: 64px; color: var(--primary); margin-bottom: 20px;">rocket</span>
                        
                        <h2 style="font-size: 2rem; margin-bottom: 12px;">Ready to Launch?</h2>
                        
                        <p style="color: var(--text-secondary); margin-bottom: 30px;">
                            Your bot <b id="finalBotName">Untitled</b> is trained, verified, and ready to go live on your website.
                        </p>

                        <div class="neu-card" style="text-align: left; margin-bottom: 30px; background: var(--bg-elevated);">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px;">
                                <span>Installation</span>
                                <span class="material-symbols-outlined" style="color: var(--success); font-size: 20px;">check_circle</span>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px;">
                                <span>Knowledge Base</span>
                                <span id="finalKnowledgeStatus" style="color: var(--success); font-weight: 500;">Ready</span>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <span>Confidence Gate</span>
                                <span id="finalGateStatus" style="color: var(--text-secondary);">Active</span>
                            </div>
                        </div>

                        <button id="btnLaunchBot" class="primary" style="font-size: 1.1rem; padding: 16px 40px; border-radius: 30px; width: 100%;">
                            GO LIVE
                        </button>
                    </div>
                </div>

            </div>
        </div>
    </div>

    <!-- TOAST -->
    <div id="toast" class="toast">Action Successful</div>
    `;

    return (
        <div id="admin-wrapper" dangerouslySetInnerHTML={{ __html: rawHtml }} />
    );
}
