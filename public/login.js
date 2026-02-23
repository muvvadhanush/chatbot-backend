const API_AUTH = '/api/v1/auth';

document.addEventListener('DOMContentLoaded', () => {
    // Theme Initialization
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    // Theme Toggle Handler
    const btnTheme = document.getElementById('btnThemeToggle');
    if (btnTheme) {
        btnTheme.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }
});

function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const btn = document.getElementById('btnLogin');
    const errEl = document.getElementById('errorMsg');

    if (!username || !password) return;

    // UI Loading State
    const origText = btn.textContent;
    btn.textContent = 'Verifying...';
    btn.disabled = true;
    errEl.textContent = '';

    try {
        const res = await fetch(`${API_AUTH}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            const msg = data.details || data.error || 'Login failed';
            throw new Error(msg);
        }

        // Success
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminUser', JSON.stringify(data.user));

        btn.textContent = 'Success!';
        setTimeout(() => {
            window.location.href = '/admin';
        }, 500);

    } catch (err) {
        errEl.textContent = `❌ ${err.message}`;
        console.error('Login Error:', err);
        btn.textContent = origText;
        btn.disabled = false;

        // Shake animation
        const card = document.querySelector('.login-card');
        if (card) {
            card.style.animation = 'shake 0.4s ease-in-out';
            setTimeout(() => card.style.animation = '', 400);
        }
    }
});

// Simple shake keyframes injection
const style = document.createElement('style');
style.innerHTML = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}
`;
document.head.appendChild(style);
