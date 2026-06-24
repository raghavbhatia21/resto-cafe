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
    // CORS & Content-Type Headers
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

    // Only allow POST requests
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        // 1. Origin & Referer Verification (CSRF Prevention)
        if (!matchedOrigin) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden - Unauthorized Request Origin" }) };
        }

        // 2. Persistent Database IP-Based Rate Limiting
        const clientIp = event.headers["client-ip"] || event.headers["x-nf-client-connection-ip"] || "unknown";
        const ipKey = clientIp.replace(/[\D]/g, '_');
        const now = Date.now();
        const dbSecret = process.env.FIREBASE_DB_SECRET;
        const authParam = dbSecret ? `?auth=${dbSecret}` : "";

        // Dynamically resolve database URL base
        const dbUrlBase = (process.env.FIREBASE_DATABASE_URL || config.databaseURL || "https://caferesto-94e83-default-rtdb.firebaseio.com").replace(/\/$/, "");
        const dbUrl = `${dbUrlBase}/rate_limits/${ipKey}.json${authParam}`;

        let ipData = { count: 0, lastReset: now };
        try {
            const getRes = await fetch(dbUrl);
            if (getRes.ok) {
                const existing = await getRes.json();
                if (existing && existing.lastReset) {
                    ipData = existing;
                }
            }
        } catch (err) {
            console.error("Firebase rate limit fetch failed, falling back to permissive mode:", err);
        }

        // Reset counter every 1 minute (60,000 ms)
        if (now - ipData.lastReset > 60000) {
            ipData.count = 0;
            ipData.lastReset = now;
        }

        ipData.count++;

        try {
            await fetch(dbUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ipData)
            });
        } catch (err) {
            console.error("Firebase rate limit save failed:", err);
        }

        // Limit to 5 WhatsApp notifications per IP per minute
        if (ipData.count > 5) {
            return { statusCode: 429, headers, body: JSON.stringify({ error: "Too many requests. Please try again later." }) };
        }

        const { to, message } = JSON.parse(event.body);

        if (!to || !message) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Missing 'to' or 'message' field" }),
            };
        }

        // 3. Robust Input Validation & Sanitization
        const formattedTo = to.replace(/\D/g, '');
        if (formattedTo.length < 10 || formattedTo.length > 12) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Invalid recipient phone number. Must be 10-12 numeric digits." }),
            };
        }

        if (typeof message !== "string" || message.length === 0 || message.length > 500) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Message must be a non-empty string under 500 characters." }),
            };
        }

        // Meta WhatsApp Cloud API Credentials
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

        // If credentials are missing, run in MOCK mode
        if (!accessToken || !phoneNumberId) {
            console.log("MOCK MODE (Cloud API): Message would have been sent to", formattedTo);
            console.log("Message Content:", message);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: "Function running in MOCK mode (Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID)",
                    mock: true
                }),
            };
        }

        // Meta Graph API URL for WhatsApp
        const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: formattedTo,
            type: "text",
            text: {
                body: message,
            },
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Meta API Error:", data);
            throw new Error(data.error?.message || "WhatsApp Cloud API error");
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message_id: data.messages[0].id }),
        };
    } catch (error) {
        console.error("Error sending WhatsApp via Cloud API:", error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: "Failed to send message",
                details: error.message
            }),
        };
    }
};
