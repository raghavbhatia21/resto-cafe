// --- 1. CLIENT FIREBASE CONFIGURATION ---
// (This is where the client's own Firebase details go)
const firebaseConfig = {
    apiKey: "AIzaSyBG33egBBScJqr9a0nReDMCUdPw7lsde_U",
    authDomain: "caferesto-94e83.firebaseapp.com",
    databaseURL: "https://caferesto-94e83-default-rtdb.firebaseio.com",
    projectId: "caferesto-94e83",
    storageBucket: "caferesto-94e83.firebasestorage.app",
    messagingSenderId: "95176752035",
    appId: "1:95176752035:web:1b8856dbb1c15f4d3c3816"
};

// --- 2. MASTER SAAS LICENSING CONFIGuration ---
// (Always points to YOUR DesignE database)
const saasConfig = {
    apiKey: "AIzaSyBG33egBBScJqr9a0nReDMCUdPw7lsde_U",
    authDomain: "caferesto-94e83.firebaseapp.com",
    databaseURL: "https://caferesto-94e83-default-rtdb.firebaseio.com",
    projectId: "caferesto-94e83",
    storageBucket: "caferesto-94e83.firebasestorage.app",
    messagingSenderId: "95176752035",
    appId: "1:95176752035:web:1b8856dbb1c15f4d3c3816"
};

// Initialize Default App (Client Data)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const auth = firebase.auth();

// Initialize Secondary App (SaaS Licensing)
const saasApp = firebase.initializeApp(saasConfig, "saasAdmin");
const saasDb = saasApp.database();

console.log("Multi-Firebase initialized: Default (Client) & saasAdmin (Master)");

// Shared WhatsApp Automation Helper
window.sendWhatsAppAutomation = async (phone, message) => {
    try {
        const response = await fetch('/.netlify/functions/send-whatsapp', {
            method: 'POST',
            body: JSON.stringify({ to: phone, message: message })
        });
        const data = await response.json();
        console.log("WhatsApp Automation Response:", data);
        return data;
    } catch (err) {
        console.error("WhatsApp Automation Error:", err);
    }
};
