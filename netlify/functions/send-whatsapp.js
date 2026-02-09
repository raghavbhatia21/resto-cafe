exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { to, message } = JSON.parse(event.body);

        if (!to || !message) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing 'to' or 'message' field" }),
            };
        }

        // Meta WhatsApp Cloud API Credentials
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

        // If credentials are missing, run in MOCK mode
        if (!accessToken || !phoneNumberId) {
            console.log("MOCK MODE (Cloud API): Message would have been sent to", to);
            console.log("Message Content:", message);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    message: "Function running in MOCK mode (Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID)",
                    mock: true
                }),
            };
        }

        // Meta Graph API URL for WhatsApp
        const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

        // Format "to" number (Cloud API expects digits only, usually with country code)
        const formattedTo = to.replace(/\D/g, '');

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
            body: JSON.stringify({ success: true, message_id: data.messages[0].id }),
        };
    } catch (error) {
        console.error("Error sending WhatsApp via Cloud API:", error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Failed to send message",
                details: error.message
            }),
        };
    }
};
