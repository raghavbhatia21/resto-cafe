const firebaseConfig = {
    apiKey: "AIzaSyDhW8-bNetGtwL4LZdPoF4iK5Lcz-1SdJA",
    authDomain: "caferesto-94e83.firebaseapp.com",
    databaseURL: "https://caferesto-94e83-default-rtdb.firebaseio.com",
    projectId: "caferesto-94e83",
    storageBucket: "caferesto-94e83.firebasestorage.app",
    messagingSenderId: "95176752035",
    appId: "1:95176752035:web:48e2cd3cf4997ee73c3816"
};

// --- 2. MASTER SAAS LICENSING ---
// License checking is handled server-side via /.netlify/functions/check-license
// No SaaS API keys are loaded in the browser (VULN-02 fix)

// Initialize Default App (Client Data)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const auth = firebase.auth();

// Initialize and Activate Firebase App Check (v3 Root Protection)
if (typeof firebase !== 'undefined' && firebase.appCheck) {
    const appCheck = firebase.appCheck();
    appCheck.activate(
        new firebase.appCheck.ReCaptchaV3Provider('6LcAEiotAAAAAG0PtgrmJAefIWhT9km2e2Byovcb'), // Replace with real reCAPTCHA v3 site key (VULN-03)
        true // isTokenAutoRefreshEnabled
    );
    console.log('[AppCheck] Activated successfully.');
}

// Global Helpers
window.ADMIN_WHATSAPP = ['91', '8949', '417812'].join(''); // Business contact number

window.sanitize = (str) => {
    if (str === null || str === undefined) return '';
    const el = document.createElement('div');
    el.textContent = String(str);
    return el.innerHTML;
};

// SHA-256 password hashing helper (C4 fix: used by owner dashboard and admin panel)
window.hashPassword = async (password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Shared WhatsApp Automation Helper
window.sendWhatsAppAutomation = async (phone, message) => {
    try {
        const response = await fetch('/.netlify/functions/send-whatsapp', {
            method: 'POST',
            body: JSON.stringify({ to: phone, message: message })
        });
        const data = await response.json();
        return data;
    } catch (err) {
        console.error("WhatsApp Automation Error:", err);
    }
};

// Automatically maintain secure HttpOnly logged_in cookie via serverless Set-Cookie endpoint (v4 Token fix)
if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const idToken = await user.getIdToken();
                fetch('/.netlify/functions/set-cookie', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'login', idToken })
                }).catch(err => console.error("[CookieSync] Failed to sync HttpOnly cookie:", err));
            } catch (tokenErr) {
                console.error("[CookieSync] Failed to retrieve ID token:", tokenErr);
            }
        } else {
            fetch('/.netlify/functions/set-cookie', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'logout' })
            }).catch(err => console.error("[CookieSync] Failed to sync HttpOnly cookie:", err));
        }
    });
}
