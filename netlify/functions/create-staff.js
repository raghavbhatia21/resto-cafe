const admin = require('firebase-admin');

// Parse the service account credentials from environment variables
let serviceAccount = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    }
} catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:", e.message);
}

// Read database config as fallback (if any)
const fs = require('fs');
const path = require('path');
let config = {};
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (e) {
    // Dynamic config warning ignored
}

const dbUrl = process.env.FIREBASE_DATABASE_URL || config.databaseURL || "https://caferesto-94e83-default-rtdb.firebaseio.com";

// Initialize Firebase Admin SDK
if (serviceAccount) {
    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: dbUrl
        });
    }
}

exports.handler = async (event, context) => {
    // CORS headers
    const origin = event.headers.origin || "";
    const allowedOrigins = [
        "https://caferesto-94e83.netlify.app",
        "https://rajesh-cafe.netlify.app",
        "https://menudome.netlify.app",
        "http://localhost",
        "http://127.0.0.1",
        ...(process.env.URL ? [process.env.URL] : []),
        ...(process.env.DEPLOY_PRIME_URL ? [process.env.DEPLOY_PRIME_URL] : [])
    ];
    const matchedOrigin = allowedOrigins.find(o => origin === o || origin.startsWith(o + "/") || origin.startsWith(o + ":"));

    const headers = {
        "Access-Control-Allow-Origin": matchedOrigin ? origin : allowedOrigins[0],
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    if (!matchedOrigin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden - Unauthorized Request Origin" }) };
    }

    if (!serviceAccount) {
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "Server Misconfigured - FIREBASE_SERVICE_ACCOUNT is not configured on Netlify." }) 
        };
    }

    try {
        const { email, password, requesterToken } = JSON.parse(event.body || "{}");
        if (!email || !password || !requesterToken) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields: email, password, and requesterToken." }) };
        }

        // 1. Verify that the requester is authenticated and is an owner/admin
        // Use Admin SDK to verify the requester's ID token
        const decodedToken = await admin.auth().verifyIdToken(requesterToken);
        const requesterEmail = decodedToken.email ? decodedToken.email.toLowerCase() : "";

        // Fetch superAdminEmail dynamically from RTDB to verify owner role
        const db = admin.database();
        const superAdminSnap = await db.ref('settings_private/superAdminEmail').once('value');
        const superAdminEmail = superAdminSnap.val() ? superAdminSnap.val().toLowerCase() : "";

        const isSuperAdmin = requesterEmail === "raghavbhatia332@gmail.com" || (superAdminEmail && requesterEmail === superAdminEmail);

        if (!isSuperAdmin) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden - Only the store owner can create staff accounts." }) };
        }

        // 2. Create the user using Firebase Admin Auth API
        let userRecord;
        try {
            userRecord = await admin.auth().createUser({
                email: email.toLowerCase(),
                password: password
            });
        } catch (authErr) {
            // If user already exists in Firebase Auth, we proceed so we can still authorize them in RTDB
            if (authErr.code === 'auth/email-already-exists' || authErr.code === 'auth/email-already-in-use') {
                userRecord = await admin.auth().getUserByEmail(email.toLowerCase());
            } else {
                throw authErr;
            }
        }

        // 3. Whitelist the user in Realtime Database under settings_private/staff
        const emailKey = email.toLowerCase().replace(/\./g, '_');
        await db.ref(`settings_private/staff/${emailKey}`).set({
            email: email.toLowerCase(),
            uid: userRecord.uid,
            addedAt: Date.now()
        });
        await db.ref(`settings_private/staff_uids/${userRecord.uid}`).set(true);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, uid: userRecord.uid })
        };

    } catch (err) {
        console.error("Create staff error:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Internal Server Error", details: err.message })
        };
    }
};
