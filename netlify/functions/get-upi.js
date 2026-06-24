const fs = require('fs');
const path = require('path');
let config = {};
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (e) {
    console.warn("Could not load config.json:", e.message);
}

exports.handler = async (event, context) => {
    const headers = {
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Content-Type": "application/json"
    };

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

    const matchedOrigin = origin ? allowedOrigins.find(o => origin === o || origin.startsWith(o + "/") || origin.startsWith(o + ":")) : null;

    if (event.httpMethod === "OPTIONS") {
        return { 
            statusCode: 200, 
            headers: {
                ...headers,
                "Access-Control-Allow-Origin": matchedOrigin || allowedOrigins[0]
            } 
        };
    }

    if (event.httpMethod !== "GET") {
        return { 
            statusCode: 405, 
            headers: {
                ...headers,
                "Access-Control-Allow-Origin": matchedOrigin || allowedOrigins[0]
            }, 
            body: JSON.stringify({ error: "Method Not Allowed" }) 
        };
    }

    if (origin && !matchedOrigin) {
        return { 
            statusCode: 403, 
            headers: {
                ...headers,
                "Access-Control-Allow-Origin": allowedOrigins[0]
            }, 
            body: JSON.stringify({ error: "Forbidden - Unauthorized Request Origin" }) 
        };
    }

    const responseHeaders = {
        ...headers,
        "Access-Control-Allow-Origin": matchedOrigin || allowedOrigins[0]
    };

    try {
        const sid = event.queryStringParameters.sid;
        if (!sid) {
            return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: "Missing 'sid' query parameter" }) };
        }

        // Database secret authentication if available
        const dbSecret = process.env.FIREBASE_DB_SECRET;
        const authParam = dbSecret ? `?auth=${dbSecret}` : "";

        // Dynamically resolve database URL base
        const dbUrlBase = (process.env.FIREBASE_DATABASE_URL || config.databaseURL || "https://caferesto-94e83-default-rtdb.firebaseio.com").replace(/\/$/, "");

        // 1. Verify session validity against Realtime Database
        const sessionUrl = `${dbUrlBase}/sessions/${sid}.json${authParam}`;
        const sessionRes = await fetch(sessionUrl);
        if (!sessionRes.ok) {
            return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: "Failed to verify session" }) };
        }

        const session = await sessionRes.json();
        if (!session) {
            return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ error: "Session not found" }) };
        }

        if (session.status === 'completed') {
            return { statusCode: 403, headers: responseHeaders, body: JSON.stringify({ error: "Access Denied: Session is already settled." }) };
        }

        // 2. Session is active and verified, retrieve upiId securely
        const upiUrl = `${dbUrlBase}/settings_private/upiId.json${authParam}`;
        const upiRes = await fetch(upiUrl);
        let upiId = "";

        if (upiRes.ok) {
            upiId = await upiRes.json();
        }

        // Secure Fallback: if database secret is not configured or settings_private is empty,
        // fall back to public settings or mock UPI ID so local/demo environments remain fully operational
        if (!upiId) {
            const fallbackUrl = `${dbUrlBase}/settings/upiId.json`;
            const fallbackRes = await fetch(fallbackUrl);
            if (fallbackRes.ok) {
                upiId = await fallbackRes.json();
            }
        }

        // If no UPI found server-side, return empty — let the client-side
        // Firebase SDK read (from public settings node) be the source of truth.
        if (!upiId) {
            upiId = "";
        }

        return {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ upiId })
        };
    } catch (err) {
        console.error("Get-UPI serverless error:", err);
        return {
            statusCode: 500,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Internal Server Error", details: err.message })
        };
    }
};
