(function () {
  // 1. Config Resolution (Global or Script Params)
  let config = window.ChatbotConfig;
  if (!config) {
    const script = document.currentScript || document.querySelector('script[src*="widget.js"]');
    if (script) {
      try {
        const src = script.src;
        // Parse query params manually or via URL
        const questionMark = src.indexOf('?');
        if (questionMark !== -1) {
          const params = new URLSearchParams(src.slice(questionMark));
          const id = params.get('id');
          const key = params.get('key');
          if (id) {
            config = { connectionId: id, password: key, apiUrl: null };
          }
        }
      } catch (e) { console.error("Config parse error", e); }
    }
  }
  window.ChatbotConfig = config; // Expose for debugging

  if (!config || !config.connectionId) {
    console.error("❌ ChatbotConfig missing");
    return;
  }

  // Determine Base URL (Config > Script Origin > Default)
  let baseUrl = config.apiUrl || config.backendUrl;
  if (!baseUrl) {
    // Auto-detect from script src if possible, else fallback
    const script = document.currentScript || document.querySelector('script[src*="widget.js"]');
    if (script && script.src.startsWith('http')) {
      baseUrl = new URL(script.src).origin;
    } else {
      baseUrl = 'http://13.48.43.200'; // Fallback
    }
  }
  baseUrl = baseUrl.replace(/\/$/, "");

  // --- HANDSHAKE ---
  (async function handshake() {
    if (config.password) {
      try {
        // Adjust path if needed. Assuming /api/v1/widget/hello
        fetch(`${baseUrl}/api/v1/widget/hello`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionId: config.connectionId,
            password: config.password,
            origin: window.location.origin,
            pageTitle: document.title
          })
        }).then(r => r.json()).then(d => {
          if (d.ok) console.log("🤝 Handshake Verified");
          else console.warn("Handshake Failed:", d.error);
        }).catch(e => console.error("Handshake Network Error", e));
      } catch (e) { }
    }
  })();

  // Session Persistence (DISABLED per user request to start fresh on load)
  const sessionKey = `chat_session_${config.connectionId}`;
  // Always generate a new session ID when the script loads
  let sessionId = "widget-" + Math.random().toString(36).slice(2);
  sessionStorage.setItem(sessionKey, sessionId);

  // Create container
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.bottom = "20px";
  container.style.right = "20px";
  container.style.zIndex = "2147483647"; // Max Safe Integer for CSS
  document.body.appendChild(container);

  // Expose Feedback Function to Shadow DOM
  container.submitFeedback = async (index, rating, btn) => {
    // Visual Feedback
    const parent = btn.parentElement;
    Array.from(parent.children).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Call API
    try {
      await fetch(`${baseUrl}/api/v1/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          messageIndex: index,
          rating
        })
      });
      console.log("Feedback sent:", rating);
    } catch (e) { console.error("Feedback failed", e); }
  };

  // Anti-Removal Protection (Host frameworks like React might wipe the body)
  const observer = new MutationObserver((mutations) => {
    if (!document.body.contains(container)) {
      // console.warn("Widget removed by host. Re-attaching...");
      document.body.appendChild(container);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Shadow DOM
  const shadow = container.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host {
        --if-bg: #ffffff;
        --if-text: #1f2937;
        --if-primary: #22819A;
        --if-secondary: #90C2E7;
        --if-accent: #AC58E9;
        --if-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08);
      }
      @media (prefers-color-scheme: dark) {
        :host {
          --if-bg: #111827;
          --if-text: #f9fafb;
        }
      }
      * {
        box-sizing: border-box;
      }
      #btn {
        width: 68px;
        height: 68px;
        border-radius: 22px;
        background: #6d5dfc;
        color: #fff;
        font-size: 28px;
        border: none;
        cursor: pointer;
        box-shadow: 0 12px 32px rgba(109, 93, 252, 0.3);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        padding: 0;
      }
      #btn-logo {
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.9;
      }
      #btn:hover {
        transform: translateY(-5px) rotate(5deg);
        box-shadow: 0 16px 40px rgba(109, 93, 252, 0.4);
      }

      /* ===============================
         Welcome Bubble — Image-1 Style
         =============================== */

            /* ===============================
         Welcome Bubble — User Request Style
         =============================== */
      #welcome-bubble {
        position: absolute; /* Changed to absolute to be relative to container */
        right: 0;
        bottom: 85px; /* Adjust to sit above button */
        
        background: rgba(255, 255, 255, 0.82);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #1f2937;
        padding: 14px 20px;
        border-radius: 18px;
        box-shadow: 0 12px 32px rgba(0,0,0,0.12);
        max-width: 260px;
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.5);
        z-index: 10000;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.5s ease-out, transform 0.5s ease-out;
        pointer-events: none;
      }

      #welcome-bubble.is-visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      /* Text */
      #welcome-bubble span {
        line-height: 1.4;
      }

      /* Close button - User didn't request one in this snippet, but good to keep or hide? 
         The snippet implies it auto-hides, so maybe no close button needed. 
         I will hide it CSS-wise just in case logic removes it. */
      #welcome-bubble .bubble-close {
        display: none;
      }

      /* Text */
      #welcome-bubble span {
        line-height: 1;
      }

      /* Close button */
      #welcome-bubble .bubble-close {
        width: 22px;
        height: 22px;

        display: flex;
        align-items: center;
        justify-content: center;

        border-radius: 50%;
        border: none;
        background: #e5e7eb;
        color: #374151;

        font-size: 14px;
        cursor: pointer;
      }

      #welcome-bubble .bubble-close:hover {
        background: #d1d5db;
      }

      #panel {
        position: fixed;
        bottom: 100px;
        right: 20px;
        width: 360px;
        height: 540px;
        background: rgba(255, 255, 255, 0.72);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 24px;
        display: none;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.4);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      #header {
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: #1a1a1a;
        padding: 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      }
      .avatar-circle {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #6d5dfc;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 1.2rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        flex-shrink: 0;
      }
      #header-info {
        flex: 1;
      }
      #header-name {
        font-weight: 700;
        font-size: 16px;
        letter-spacing: -0.3px;
        margin-bottom: 2px;
        color: #1f2937;
      }
      #header-status {
        font-size: 11px;
        opacity: 0.7;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 5px;
        color: #4b5563;
      }
      #status-dot {
        width: 7px;
        height: 7px;
        background: #10b981;
        border-radius: 50%;
        animation: pulse 2s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.8); }
      }
      #close-btn {
        background: rgba(0, 0, 0, 0.05);
        border: none;
        color: #4b5563;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: all 0.2s;
      }
      #close-btn:hover {
        background: rgba(0, 0, 0, 0.1);
        transform: rotate(90deg);
      }
      #messages {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        font-size: 14px;
        background: transparent;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .msg {
        max-width: 85%;
        animation: fadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(12px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .msg.user {
        margin-left: auto;
        text-align: right;
      }
      .msg-bubble {
        display: inline-block;
        padding: 12px 16px;
        border-radius: 18px;
        line-height: 1.5;
        font-weight: 500;
      }
      .msg.user .msg-bubble {
        background: #6d5dfc;
        color: white;
        border-bottom-right-radius: 4px;
        box-shadow: 0 8px 16px rgba(109, 93, 252, 0.2);
      }
      .msg.bot .msg-bubble {
        background: rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(4px);
        color: #374151;
        border-bottom-left-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        border: 1px solid rgba(255, 255, 255, 0.5);
      }
      
      /* Suggestions */
      #suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px;
        background: transparent;
        overflow-x: auto;
      }
      .suggestion-btn {
        background: rgba(255, 255, 255, 0.4);
        border: 1px solid rgba(109, 93, 252, 0.3);
        color: #6d5dfc;
        padding: 8px 16px;
        border-radius: 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .suggestion-btn:hover {
        background: #6d5dfc;
        color: white;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(109, 93, 252, 0.2);
      }
      
      #input-area {
        display: flex;
        padding: 16px;
        border-top: 1px solid rgba(0, 0, 0, 0.05);
        background: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(10px);
      }
      #text {
        flex: 1;
        background: rgba(255, 255, 255, 0.5);
        border: 1px solid rgba(0, 0, 0, 0.05);
        padding: 12px 18px;
        border-radius: 14px;
        outline: none;
        font-size: 14px;
        transition: all 0.2s;
        color: #1f2937;
      }
      #text:focus {
        background: white;
        border-color: #6d5dfc;
        box-shadow: 0 0 0 4px rgba(109, 93, 252, 0.1);
      }
      .send {
        border: none;
        padding: 10px 20px;
        cursor: pointer;
        background: #6d5dfc;
        color: white;
        border-radius: 12px;
        margin-left: 10px;
        font-weight: 700;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(109, 93, 252, 0.3);
      }
      .send:hover {
        background: #5b4cfc;
        transform: scale(1.05);
        box-shadow: 0 6px 16px rgba(109, 93, 252, 0.4);
      }
      
      .typing {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 10px 14px;
        background: white;
        border-radius: 16px;
        width: fit-content;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }
      .typing span {
        width: 8px;
        height: 8px;
        background: #667eea;
        border-radius: 50%;
        animation: bounce 1.4s infinite ease-in-out;
      }
      .typing span:nth-child(1) { animation-delay: -0.32s; }
      .typing span:nth-child(2) { animation-delay: -0.16s; }
      @keyframes bounce {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
      }
      .system-error {
        animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
      }
      @keyframes shake {
        10%, 90% { transform: translate3d(-1px, 0, 0); }
        20%, 80% { transform: translate3d(2px, 0, 0); }
        30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
        40%, 60% { transform: translate3d(4px, 0, 0); }
      }
      .feedback-actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .msg.bot:hover .feedback-actions {
        opacity: 1;
      }
      .feedback-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 14px;
        opacity: 0.5;
        padding: 2px;
        transition: transform 0.2s, opacity 0.2s;
      }
      .feedback-btn:hover {
        opacity: 1;
        transform: scale(1.2);
      }
      .feedback-btn.active {
        opacity: 1;
        transform: scale(1.1);
      }
    </style>

    <div id="welcome-bubble">
      <span id="bubble-text">Hii! I Can give you Assistance...</span>
    </div>
    
    <button id="btn">
      <img id="btn-logo" src="" alt="🤖" style="display:none" />
      <span id="btn-icon">🤖</span>
    </button>

    <div id="panel">
      <div id="header">
        <div id="header-avatar" class="avatar-circle">A</div>
        <img id="header-logo" src="" alt="Logo" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; display: none;" />
        <div id="header-info">
          <div id="header-name">AI Assistant</div>
          <div id="header-status"><span id="status-dot"></span> Online • Ready to help</div>
        </div>
        <button id="close-btn">✕</button>
      </div>
      <div id="messages" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div id="suggestions" role="group" aria-label="Suggested responses"></div>
      <div id="input-area">
        <input id="text" name="chatbot-message" autocomplete="off" placeholder="Type a message…" aria-label="Ask the AI assistant" />
        <button class="send" aria-label="Send message">Send</button>
      </div>
    </div>
  `;

  const btn = shadow.querySelector("#btn");
  const btnLogo = shadow.querySelector("#btn-logo");
  const btnIcon = shadow.querySelector("#btn-icon");
  const panel = shadow.querySelector("#panel");
  const closeBtn = shadow.querySelector("#close-btn");
  const messages = shadow.querySelector("#messages");
  const suggestionsContainer = shadow.querySelector("#suggestions");
  const input = shadow.querySelector("#text");
  const sendBtn = shadow.querySelector(".send");
  /* ===============================
     Welcome Bubble Logic
     =============================== */
  const bubble = shadow.querySelector("#welcome-bubble");
  const bubbleCloseBtn = bubble.querySelector(".bubble-close");
  const bubbleText = shadow.querySelector("#bubble-text"); // Required for auto-extract to update text
  /* ===============================
     Welcome Bubble Logic (Timer Based)
     =============================== */


  // Initial Logic: Show after 1s, Hide after 5s
  setTimeout(() => {
    bubble.classList.add("is-visible");

    // Hide after 5 seconds of showing
    setTimeout(() => {
      bubble.classList.remove("is-visible");
    }, 5000);
  }, 1000);


  // Dismiss logic (if they click it manually to open chat)
  bubble.onclick = () => {
    bubble.classList.remove("is-visible");
    panel.style.display = "flex";
  };

  // Click bubble to open (optional, keeps existing behavior)
  // Removed duplicate click handler

  btn.onclick = () => {
    bubble.classList.remove("is-visible");
    panel.style.display = panel.style.display === "flex" ? "none" : "flex";
    // Also dismiss bubble if they manually open chat
    // localStorage.setItem(KEY_DISMISSED, "true");
  };

  closeBtn.onclick = () => {
    panel.style.display = "none";
  };

  // Auto-extract knowledge base from host website
  async function autoExtractKnowledgeBase() {
    const storageKey = `chatbot_kb_extracted_${config.connectionId}`;

    // Check if already extracted
    if (localStorage.getItem(storageKey)) {
      console.log("✅ Knowledge base already extracted for this connection");
      return;
    }

    try {
      const hostUrl = window.location.origin;
      console.log(`🔍 Auto-extracting knowledge base from: ${hostUrl}`);

      const response = await fetch(`${baseUrl}/api/v1/connections/${config.connectionId}/auto-extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: hostUrl
        })
      });

      const data = await response.json();

      if (data.status === "initialized" && data.bot_identity) {
        const iden = data.bot_identity;
        console.log("✅ Bot identity initialized:", iden.name);

        // Mark as extracted
        localStorage.setItem(storageKey, "true");

        // Update welcome message and bot name if provided
        if (iden.welcomeMessage) {
          bubbleText.textContent = iden.welcomeMessage;
        }
        // Update Avatar if name provided
        if (iden.name) {
          headerName.textContent = iden.name;
          const initial = iden.name[0].toUpperCase();
          const avatar = shadow.querySelector("#header-avatar");
          if (avatar) avatar.textContent = initial;
        }
      } else {
        console.warn("⚠️ Auto-extract failed or returned unexpected data:", data);
      }
    } catch (error) {
      console.error("❌ Auto-extract error:", error);
      // Don't block widget functionality if extraction fails
    }
  }

  // --- SESSION PERSISTENCE ---
  const storageKey = `chat_history_${config.connectionId}`;

  // Trigger auto-extract and session load
  // loadSession(); // Disabled to start fresh
  setTimeout(() => autoExtractKnowledgeBase(), 1000);

  function loadSession() {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      try {
        const history = JSON.parse(saved);
        history.forEach(m => addMessage(m.text, m.who, false, m.index || -1));
      } catch (e) {
        sessionStorage.removeItem(storageKey);
      }
    }
  }

  function saveMessage(text, who, index = -1) {
    const history = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
    history.push({ text, who, index });
    sessionStorage.setItem(storageKey, JSON.stringify(history));
  }

  function addMessage(text, who = "bot", save = true, index = -1) {
    if (save) saveMessage(text, who, index);

    const div = document.createElement("div");
    div.className = `msg ${who}`;
    div.setAttribute("role", "listitem");

    const formattedText = text.replace(/\n/g, '<br>');

    let feedbackHtml = '';
    if (who === 'bot' && index !== -1) {
      feedbackHtml = `
            <div class="feedback-actions">
                <button class="feedback-btn" title="Helpful" onclick="this.getRootNode().host.submitFeedback(${index}, 'CORRECT', this)">👍</button>
                <button class="feedback-btn" title="Not Helpful" onclick="this.getRootNode().host.submitFeedback(${index}, 'INCORRECT', this)">👎</button>
            </div>
        `;
    }

    div.innerHTML = `<div class="msg-bubble">${formattedText}</div>${feedbackHtml}`;
    messages.appendChild(div);
    scrollToBottom();
  }

  function scrollToBottom() {
    messages.scrollTo({
      top: messages.scrollHeight,
      behavior: 'smooth'
    });
  }

  function showTyping() {
    const div = document.createElement("div");
    div.className = "msg bot";
    div.id = "typing-indicator";
    div.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    const typing = shadow.querySelector("#typing-indicator");
    if (typing) typing.remove();
  }

  function showSuggestions(suggestions) {
    suggestionsContainer.innerHTML = "";
    if (!suggestions || suggestions.length === 0) {
      suggestionsContainer.style.display = "none";
      return;
    }
    suggestionsContainer.style.display = "flex";
    suggestions.forEach(text => {
      const btn = document.createElement("button");
      btn.className = "suggestion-btn";
      btn.textContent = text;
      btn.onclick = () => {
        input.value = text;
        sendMessage();
      };
      suggestionsContainer.appendChild(btn);
    });
  }

  async function sendMessage(textOverride) {
    const text = textOverride || input.value.trim();
    if (!text) return;

    addMessage(text, "user");
    input.value = "";
    showSuggestions([]); // Hide suggestions while loading
    showTyping();

    try {
      const res = await fetch(`${baseUrl}/api/v1/chat/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          connectionId: config.connectionId,
          sessionId,
          url: window.location.href
        })
      });

      hideTyping();

      if (!res.ok) {
        showError("Server busy. Please try again in a moment.");
        return;
      }

      const data = await res.json();

      if (data.messages && data.messages.length) {
        addMessage(data.messages[data.messages.length - 1].text, "bot", true, data.messageIndex);
      }

      if (data.suggestions && data.suggestions.length) {
        showSuggestions(data.suggestions);
      }

      // --- HANDLE CLIENT ACTIONS ---
      if (data.action) {
        console.log("⚡ Executing Client Action:", data.action);
        handleClientAction(data.action);
      }

    } catch (e) {
      hideTyping();
      showError("Connection lost. Retrying in 3s...");
      setTimeout(() => {
        const lastErr = shadow.querySelector(".system-error-msg");
        if (lastErr) lastErr.remove();
        sendMessage(text);
      }, 3000);
    }
  }

  function handleClientAction(action) {
    if (!action) return;

    try {
      if (action.type === "CLICK" || action.type === "NAVIGATE") {
        let el = null;
        if (action.selector) {
          // Try precise selector
          el = document.querySelector(action.selector);
        }

        // Fallback: Text search (jQuery style contains)
        if (!el && action.text) {
          const all = document.querySelectorAll("button, a");
          for (let node of all) {
            if (node.textContent.toLowerCase().includes(action.text.toLowerCase())) {
              el = node;
              break;
            }
          }
        }

        if (el) {
          highlightElement(el);
          setTimeout(() => {
            el.click();
            if (action.href && el.tagName === "A") {
              window.location.href = action.href; // Force nav if click doesn't work
            }
          }, 1000); // Wait for user to see highlight
        } else {
          console.warn("❌ Could not find element for action:", action);
        }

      } else if (action.type === "FILL_FORM") {
        // Find form
        const forms = document.querySelectorAll("form");
        let targetForm = Array.from(forms).find(f => f.id === action.formName || f.name === action.formName);

        // Fallback: finding inputs globally if form name is fuzzy
        if (!targetForm) targetForm = document;

        if (action.data) {
          for (const [key, value] of Object.entries(action.data)) {
            const input = targetForm.querySelector(`[name="${key}"]`);
            if (input) {
              highlightElement(input);
              input.value = value;
              // Dispatch event so React/Vue notices
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }

        // Submitting?
        if (targetForm && targetForm.tagName === "FORM") {
          setTimeout(() => {
            // targetForm.submit(); // Aggressive! Maybe just let user click submit?
            const submitBtn = targetForm.querySelector('[type="submit"], button:not([type])');
            if (submitBtn) {
              highlightElement(submitBtn);
              // submitBtn.click(); // Auto-click or just show? Let's simply highlight for now.
            }
          }, 1500);
        }
      }

    } catch (err) {
      console.error("Action handler failed:", err);
    }
  }

  function highlightElement(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const originalBorder = el.style.border;
    const originalBoxShadow = el.style.boxShadow;
    const originalTransition = el.style.transition;

    el.style.transition = "all 0.5s ease";
    el.style.border = "2px solid #667eea";
    el.style.boxShadow = "0 0 15px rgba(102, 126, 234, 0.6)";

    setTimeout(() => {
      el.style.border = originalBorder;
      el.style.boxShadow = originalBoxShadow;
      el.style.transition = originalTransition;
    }, 2000);
  }

  function showError(msg) {
    const div = document.createElement("div");
    div.className = "msg system-error-msg";
    div.style.cssText = "color: #ef4444; font-size: 12px; text-align: center; margin-bottom: 12px; font-weight: 500;";
    div.innerHTML = `⚠️ ${msg}`;
    messages.appendChild(div);
    scrollToBottom();
  }

  sendBtn.onclick = () => sendMessage();
  input.addEventListener("keydown", e => e.key === "Enter" && sendMessage());

  // Get host website favicon
  function getFavicon() {
    // Try to find favicon from link tags
    const links = document.querySelectorAll('link[rel*="icon"]');
    for (const link of links) {
      if (link.href) return link.href;
    }

    // Fallback logic
    if (window.location.protocol === 'file:') {
      return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }

    // Instead of origin, let's use the baseUrl (the backend) for a generic fallback if possible
    // or just return null and let the icon-span take over.
    return null;
  }

  // Set up header with favicon and name
  const headerLogo = shadow.querySelector("#header-logo");
  const headerName = shadow.querySelector("#header-name");

  // Load favicon for header and button
  const faviconUrl = getFavicon();

  // Set header logo
  headerLogo.src = faviconUrl;
  headerLogo.onload = () => { headerLogo.style.display = 'block'; };
  headerLogo.onerror = () => { headerLogo.style.display = 'none'; };

  // Set button logo
  btnLogo.src = faviconUrl;
  btnLogo.onload = () => {
    btnLogo.style.display = 'block';
    btnIcon.style.display = 'none';
  };
  btnLogo.onerror = () => {
    btnLogo.style.display = 'none';
    btnIcon.style.display = 'block';
  };

  // Fetch welcome info from server
  fetch(`${baseUrl}/api/v1/chat/welcome/${config.connectionId}`)
    .then(r => r.json())
    .then(data => {
      if (data.assistantName) {
        headerName.textContent = data.assistantName;
        const initial = data.assistantName[0].toUpperCase();
        const avatar = shadow.querySelector("#header-avatar");
        if (avatar) avatar.textContent = initial;
      }
      if (data.welcomeMessage) {
        bubbleText.textContent = data.welcomeMessage;
      }
    })
    .catch(() => { });
  // --- DEBUGGING TOOL ---
  window.ChatbotDebug = () => {
    console.group("🤖 Chatbot Debugger");
    console.log("Status: Initialized");
    console.log("Config:", config);
    console.log("Container in Body:", document.body.contains(container));
    console.log("Z-Index:", container.style.zIndex);

    const elements = {
      "Button (#btn)": btn,
      "Panel (#panel)": panel,
      "Messages (#messages)": messages,
      "Input (#text)": input,
      "Welcome Bubble": bubble
    };

    let allGood = true;
    for (const [name, el] of Object.entries(elements)) {
      if (el) {
        console.log(`✅ ${name}: Found`, el);
      } else {
        console.error(`❌ ${name}: MISSING`);
        allGood = false;
      }
    }

    if (allGood) {
      console.log("🎉 All systems go! Widget elements are present.");
    } else {
      console.warn("⚠️ Some elements are missing. Check console errors.");
    }
    console.groupEnd();
  };

  console.log("🤖 Chatbot Widget Loaded. Run window.ChatbotDebug() to verify.");
})();
