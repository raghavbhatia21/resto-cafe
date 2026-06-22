const LICENSE_ID = 'caferesto-demo';

function checkLicense() {
    const overlay = document.getElementById('license-overlay');
    const msg = document.getElementById('license-msg');

    if (!overlay || !msg) {
        console.error("License overlay elements not found on this page.");
        return;
    }

    // Update WhatsApp link in overlay if element exists
    const contactLink = overlay.querySelector('a');
    if (contactLink && typeof ADMIN_WHATSAPP !== 'undefined') {
        contactLink.href = `https://wa.me/${ADMIN_WHATSAPP}`;
    }

    // Fetch license status from secure serverless function (VULN-02 fix)
    fetch('/.netlify/functions/check-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId: LICENSE_ID, action: 'check' })
    })
    .then(res => res.json())
    .then(data => {
        if (!data || data.error) {
            overlay.style.display = 'flex';
            msg.innerText = "Invalid license key or license not found. Please contact the administrator.";
            return;
        }

        const expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;

        // Display expiry info if element exists (e.g., in Cashier dashboard)
        const expiryDisplay = document.getElementById('license-expiry-display');
        if (expiryDisplay && expiryDate) {
            expiryDisplay.innerHTML = `<i class="fas fa-key"></i> License Expiry: <b>${expiryDate.toLocaleDateString()}</b>`;
            if (data.isExpired) {
                expiryDisplay.style.color = '#ef4444';
                expiryDisplay.innerHTML += ' (EXPIRED)';
            } else {
                expiryDisplay.style.color = '';
            }
        }

        if (data.isSuspended) {
            overlay.style.display = 'flex';
            msg.innerText = "Your service has been temporarily suspended by the administrator.";
        } else if (data.isExpired) {
            overlay.style.display = 'flex';
            msg.innerText = `Your subscription expired on ${expiryDate ? expiryDate.toLocaleDateString() : 'N/A'}. Please renew to continue.`;
        } else {
            overlay.style.display = 'none';
            // Update Heartbeat/Last Active via serverless function ONLY ONCE
            if (!window.licenseLastActiveUpdated) {
                window.licenseLastActiveUpdated = true;
                fetch('/.netlify/functions/check-license', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ licenseId: LICENSE_ID, action: 'heartbeat' })
                }).catch(err => console.warn('[License] Heartbeat failed:', err));
            }
        }
    })
    .catch(err => {
        console.error("[License] Check failed:", err);
        // On network error, don't block — allow the app to function
        overlay.style.display = 'none';
    });
}

// Auto-run license check & monitor status dynamically
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        checkLicense();
        // Re-check every 30 seconds to automatically restore access if reactivated
        setInterval(checkLicense, 30000);
    });
} else {
    checkLicense();
    setInterval(checkLicense, 30000);
}
