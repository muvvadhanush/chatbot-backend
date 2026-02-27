import React, { useEffect, useRef } from 'react';
import '../assets/admin.css';

export default function Login() {
    const isScriptLoaded = useRef(false);

    useEffect(() => {
        if (!isScriptLoaded.current) {
            const script = document.createElement("script");
            script.src = "/login.js";
            script.async = true;
            document.body.appendChild(script);
            isScriptLoaded.current = true;
        }
    }, []);

    const rawHtml = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; width: 100%; background: var(--bg-body);">
        <div class="glass login-card" style="padding: 50px; border-radius: 32px; width: 100%; max-width: 450px; background: var(--bg-body); box-shadow: var(--shadow-light); text-align: center;">
            <div class="brand-logo" style="font-size: 2rem; font-weight: 800; color: var(--text-primary); margin-bottom: 40px; display: inline-block;">
                <span style="color: var(--primary);">Neural</span>Bot
            </div>

            <div id="errorMsg" class="error-msg" style="color: var(--error); font-size: 0.9rem; min-height: 20px; margin-bottom: 10px;"></div>

            <form id="loginForm" class="login-form" style="display: flex; flex-direction: column; gap: 20px;">
                <div style="text-align: left;">
                    <label style="font-weight: 600; margin-bottom: 12px; display: block; color: var(--text-secondary);">Username</label>
                    <input type="text" id="username" class="input-neu" required style="border-radius: 12px; padding: 15px 20px;">
                </div>

                <div style="text-align: left;">
                    <label style="font-weight: 600; margin-bottom: 12px; display: block; color: var(--text-secondary);">Password</label>
                    <input type="password" id="password" class="input-neu" required style="border-radius: 12px; padding: 15px 20px;">
                </div>

                <button type="submit" id="btnLogin" class="primary" style="margin-top: 20px; width: 100%; border-radius: 12px;">
                    Secure Sign In
                </button>
            </form>
        </div>

        <button id="btnThemeToggle" class="btn-icon" style="position: fixed; top: 20px; right: 20px;">
            <span class="material-symbols-outlined" id="themeIcon"></span>
        </button>
    </div>
    `;

    return <div id="login-wrapper" dangerouslySetInnerHTML={{ __html: rawHtml }} />;
}
