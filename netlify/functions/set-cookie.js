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
    const origin = event.headers.origin || "";
    const allowedOrigins = [
        "https://caferesto-94e83.netlify.app",
        "https://rajesh-cafe.netlify.app",
        "https://menudome.netlify.app",
        ...(process.env.URL ? [process.env.URL] : []),
        ...(process.env.DEPLOY_PRIME_URL ? [process.env.DEPLOY_PRIME_URL] : []),
        ...(process.env.NODE_ENV === 'development' ? ['http://localhost', 'http://127.0.0.1'] : [])
    ];
    const matchedOrigin = allowedOrigins.find(o => origin === o || origin.startsWith(o + "/"));

    const headers = {
        "Access-Control-Allow-Origin": matchedOrigin || allowedOrigins[0],
        "Access-Control-Allow-Headers": "Content-Type",
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

    try {
        const { action, idToken } = JSON.parse(event.body || "{}");
        let cookieHeader = "";

        if (action === "login") {
            if (!idToken) {
                return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized - Missing ID Token" }) };
            }

            // Verify the Firebase ID Token using Google Identity Toolkit REST API
            // VULN-09 fix: No hardcoded fallback — fail fast if env var missing
            const apiKey = process.env.FIREBASE_API_KEY || config.apiKey;
            if (!apiKey) {
                console.error("FIREBASE_API_KEY env var or config key not set");
                return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfigured" }) };
            }
            const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;

            const verifyRes = await fetch(verifyUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Referer': matchedOrigin || allowedOrigins[0]
                },
                body: JSON.stringify({ idToken })
            });

            if (!verifyRes.ok) {
                const errData = await verifyRes.json().catch(() => ({}));
                console.error("Token verification failed:", errData);
                return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized - Invalid ID Token" }) };
            }

            const verifyData = await verifyRes.json();
            const userObj = verifyData.users && verifyData.users[0];
            if (!userObj || !userObj.email) {
                return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized - User details not found" }) };
            }

            const email = userObj.email.toLowerCase();

            // Fetch superAdminEmail dynamically from Realtime Database to authorize custom logins
            const dbSecret = process.env.FIREBASE_DB_SECRET;
            const authParam = dbSecret ? `?auth=${dbSecret}` : "";
            
            // Dynamically resolve database URL base
            const dbUrlBase = (process.env.FIREBASE_DATABASE_URL || config.databaseURL || "https://caferesto-94e83-default-rtdb.firebaseio.com").replace(/\/$/, "");
            const superAdminUrl = `${dbUrlBase}/settings_private/superAdminEmail.json${authParam}`;
            
            let superAdminEmail = "";
            try {
                const dbRes = await fetch(superAdminUrl);
                if (dbRes.ok) {
                    superAdminEmail = await dbRes.json();
                }
            } catch (dbErr) {
                console.error("Failed to fetch superAdminEmail from DB:", dbErr);
            }

            const isSuperAdmin = email === "raghavbhatia332@gmail.com" || (superAdminEmail && email === superAdminEmail.toLowerCase());
            let isAuthorized = isSuperAdmin;

            if (!isAuthorized) {
                // If not owner/dev, check if email is in the staff whitelist
                const emailKey = email.replace(/\./g, '_');
                const staffCheckUrl = `${dbUrlBase}/settings_private/staff/${emailKey}.json${authParam}`;
                
                try {
                    const staffRes = await fetch(staffCheckUrl);
                    if (staffRes.ok) {
                        const staffData = await staffRes.json();
                        if (staffData && staffData.email && staffData.email.toLowerCase() === email) {
                            isAuthorized = true;
                        }
                    }
                } catch (staffErr) {
                    console.error("Failed to check staff whitelist in DB:", staffErr);
                }
            }

            if (!isAuthorized) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden - Email not authorized for dashboard access" }) };
            }

            // Set HttpOnly, Secure, SameSite=Lax cookie for 1 year
            cookieHeader = "logged_in=true; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax";
        } else if (action === "logout") {
            // Expire the HttpOnly cookie
            cookieHeader = "logged_in=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax";
        } else {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid action. Must be 'login' or 'logout'." }) };
        }

        return {
            statusCode: 200,
            headers: {
                ...headers,
                "Set-Cookie": cookieHeader
            },
            body: JSON.stringify({ success: true })
        };
    } catch (err) {
        console.error("Set-Cookie function error:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Internal Server Error", details: err.message })
        };
    }
};
