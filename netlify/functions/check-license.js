/**
 * check-license.js — Secure SaaS License Checker
 * 
 * Reads license status from the DesignE (dzinee) database via
 * Firebase REST API using a database secret stored as an env var.
 * Replaces all client-side saasDb / saasConfig exposure.
 * 
 * Required Netlify env vars:
 *   DZINEE_DATABASE_URL  — e.g. https://dzinee-default-rtdb.firebaseio.com
 *   DZINEE_DB_SECRET     — Firebase database secret for dzinee project
 */

exports.handler = async (event) => {
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
        return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden - Unauthorized Origin" }) };
    }

    try {
        const { licenseId, action } = JSON.parse(event.body || "{}");

        if (!licenseId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing licenseId" }) };
        }

        const dbUrl = (process.env.DZINEE_DATABASE_URL || "https://dzinee-default-rtdb.firebaseio.com").replace(/\/$/, "");
        const dbSecret = process.env.DZINEE_DB_SECRET;
        const authParam = dbSecret ? `?auth=${dbSecret}` : "";

        // Action: "check" (default) — read license status
        // Action: "heartbeat" — update lastActive timestamp
        // Action: "configUpdate" — update lastConfigUpdate timestamp

        if (action === "heartbeat") {
            const updateUrl = `${dbUrl}/licenses/${encodeURIComponent(licenseId)}/lastActive.json${authParam}`;
            const updateRes = await fetch(updateUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(new Date().toISOString())
            });
            if (!updateRes.ok) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to update heartbeat" }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        if (action === "configUpdate") {
            const updateUrl = `${dbUrl}/licenses/${encodeURIComponent(licenseId)}/lastConfigUpdate.json${authParam}`;
            const updateRes = await fetch(updateUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Date.now())
            });
            if (!updateRes.ok) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to update config timestamp" }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        // Default action: check license
        const licenseUrl = `${dbUrl}/licenses/${encodeURIComponent(licenseId)}.json${authParam}`;
        const licenseRes = await fetch(licenseUrl);

        if (!licenseRes.ok) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to fetch license" }) };
        }

        const license = await licenseRes.json();

        if (!license) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ valid: false, reason: "License not found" })
            };
        }

        const expiryDate = license.expiryDate ? new Date(license.expiryDate) : null;
        const isExpired = expiryDate && expiryDate < new Date() && license.expiryDate !== '';
        const isSuspended = license.isActive === false;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                valid: !isExpired && !isSuspended,
                isExpired: !!isExpired,
                isSuspended: !!isSuspended,
                expiryDate: license.expiryDate || null,
                onboardingAmount: license.onboardingAmount || license.amount || null
            })
        };
    } catch (err) {
        console.error("check-license error:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Internal Server Error", details: err.message })
        };
    }
};
