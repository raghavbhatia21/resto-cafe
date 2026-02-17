const LICENSE_ID = 'caferesto-demo';

function checkLicense() {
    const overlay = document.getElementById('license-overlay');
    const msg = document.getElementById('license-msg');

    if (!overlay || !msg) {
        console.error("License overlay elements not found on this page.");
        return;
    }

    saasDb.ref('licenses/' + LICENSE_ID).on('value', snapshot => {
        const data = snapshot.val();

        if (!data) {
            // Only create trial if on index.html to avoid duplicate creation logs
            if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '/index.html') {
                const trialExpiry = new Date();
                trialExpiry.setDate(trialExpiry.getDate() + 30);
                saasDb.ref('licenses/' + LICENSE_ID).set({
                    clientName: "Demo Cafe & Resto",
                    expiryDate: trialExpiry.toISOString().split('T')[0],
                    isActive: true
                });
            }
            return;
        }

        const expiryDate = new Date(data.expiryDate);
        const isExpired = expiryDate < new Date() && data.expiryDate !== '';
        const isSuspended = data.isActive === false;

        if (isSuspended) {
            overlay.style.display = 'flex';
            msg.innerText = "Your service has been temporarily suspended by the administrator.";
        } else if (isExpired) {
            overlay.style.display = 'flex';
            msg.innerText = `Your subscription expired on ${expiryDate.toLocaleDateString()}. Please renew to continue.`;
        } else {
            overlay.style.display = 'none';
            // Update Heartbeat/Last Active in SaaS DB
            saasDb.ref('licenses/' + LICENSE_ID).update({
                lastActive: new Date().toISOString()
            });
        }
    });
}

// Auto-run if saasDb is already available (from firebase-config.js)
if (typeof saasDb !== 'undefined') {
    checkLicense();
} else {
    // If for some reason saasDb isn't ready, wait a bit
    window.addEventListener('load', () => {
        if (typeof saasDb !== 'undefined') checkLicense();
    });
}
