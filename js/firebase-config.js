// Firebase Configuration
// To be filled by the user or during setup
const firebaseConfig = {
    // 1. Go to console.firebase.google.com
    // 2. Create a new project (or select existing)
    // 3. Go to Project Settings > General > Your Apps > Add App > Web
    // 4. Copy the config object below:
    apiKey: "AIzaSyBG33egBBScJqr9a0nReDMCUdPw7lsde_U",
    authDomain: "caferesto-94e83.firebaseapp.com",
    databaseURL: "https://caferesto-94e83-default-rtdb.firebaseio.com", // Added automatically
    projectId: "caferesto-94e83",
    storageBucket: "caferesto-94e83.firebasestorage.app",
    messagingSenderId: "95176752035",
    appId: "1:95176752035:web:1b8856dbb1c15f4d3c3816"
};

// Initialize Firebase
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
} else {
    console.warn("Firebase not initialized. Please add your config to js/firebase-config.js");
}

const db = firebase.database();
const auth = firebase.auth();
