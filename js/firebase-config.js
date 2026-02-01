// Firebase Configuration
// To be filled by the user or during setup
const firebaseConfig = {
    // 1. Go to console.firebase.google.com
    // 2. Create a new project (or select existing)
    // 3. Go to Project Settings > General > Your Apps > Add App > Web
    // 4. Copy the config object below:
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
} else {
    console.warn("Firebase not initialized. Please add your config to js/firebase-config.js");
}

const db = firebase.database();
const auth = firebase.auth();
