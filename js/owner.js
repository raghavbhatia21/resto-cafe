// ================================================================
// OWNER DASHBOARD - owner.js
// Credentials are fetched from Firebase only, never hardcoded.
// ================================================================

let localSessions = {};
let localSettings = {};
let ownerCredentialsLoaded = false;

const sessionsRef = db.ref('sessions');

// --- STEP 1: Load owner credentials from Firebase FIRST ---
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // Read superAdminEmail from database to verify role
        db.ref('settings_private/superAdminEmail').once('value').then((emailSnap) => {
            const superAdminEmail = emailSnap.val() ? emailSnap.val().toLowerCase() : '';
            const userEmail = user.email ? user.email.toLowerCase() : '';
            
            if (userEmail === superAdminEmail || userEmail === 'raghavbhatia332@gmail.com') {
                // Pre-fill email in auth gate if it is displayed
                const authEmailInput = document.getElementById('auth-email');
                if (authEmailInput) authEmailInput.value = user.email;
                
                Promise.all([
                    db.ref('settings').once('value'),
                    db.ref('settings_private').once('value')
                ]).then(([pubSnap, privSnap]) => {
                    localSettings = {};
                    if (pubSnap.exists()) {
                        localSettings = { ...localSettings, ...pubSnap.val() };
                    }
                    if (privSnap.exists()) {
                        localSettings = { ...localSettings, ...privSnap.val() };
                    }
                    ownerCredentialsLoaded = true;
                    initOwnerPage();
                }).catch(err => {
                    console.error('Failed to load settings:', err);
                    ownerCredentialsLoaded = true;
                    initOwnerPage();
                });
            } else {
                // If it is a staff user, display Access Denied and redirect them back to standard dashboard
                alert("Access Denied: You do not have owner privileges.");
                window.location.href = '../admin/dashboard.html';
            }
        }).catch(err => {
            console.error('Failed to verify owner role:', err);
            alert("Session error. Redirecting to login...");
            window.location.href = '../admin/login.html';
        });
    } else {
        window.location.href = '../admin/login.html';
    }
});

// --- STEP 2: Initialize the page after credentials are ready ---
function initOwnerPage() {
    const gate = document.getElementById('auth-gate');
    const mainContent = document.getElementById('main-content');

    // Set date defaults
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('history-start-date').value = today;
    document.getElementById('history-end-date').value = today;

    const storedToken = sessionStorage.getItem('owner_verified');

    // Only trust the token if it matches the one we set in memory during this page session
    if (storedToken && window._ownerSessionToken && storedToken === window._ownerSessionToken) {
        gate.style.display = 'none';
        mainContent.style.display = 'block';
        populateSettingsForm();
        startSessionListeners();
        loadHistory();
    } else {
        // Clear stale/forged tokens
        sessionStorage.removeItem('owner_verified');
        gate.style.display = 'flex';
        mainContent.style.display = 'none';
    }
}

// --- SECURITY GATE ---
window.verifyOwnerAccess = async function() {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    const errorEl = document.getElementById('auth-error');

    if (!ownerCredentialsLoaded) {
        errorEl.innerText = 'Still loading, please wait...';
        errorEl.style.display = 'block';
        return;
    }

    if (!email || !pass) {
        errorEl.innerText = 'Please enter both email and password.';
        errorEl.style.display = 'block';
        return;
    }

    // Client-side Brute Force Protection (Failed Attempts Lockout)
    let attempts = parseInt(sessionStorage.getItem('owner_auth_attempts') || '0');
    let lockTime = parseInt(sessionStorage.getItem('owner_auth_locktime') || '0');

    if (Date.now() < lockTime) {
        const remaining = Math.ceil((lockTime - Date.now()) / 1000);
        errorEl.innerText = `Too many failed attempts. Try again in ${remaining}s.`;
        errorEl.style.display = 'block';
        return;
    }

    try {
        errorEl.style.display = 'none';
        // Sign in using Firebase Auth to authenticate the credentials
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, pass);
        const user = userCredential.user;
        
        // Double check they have owner role
        const emailSnap = await db.ref('settings_private/superAdminEmail').once('value');
        const superAdminEmail = emailSnap.val() ? emailSnap.val().toLowerCase() : '';
        const userEmail = user.email ? user.email.toLowerCase() : '';
        
        if (userEmail === superAdminEmail || userEmail === 'raghavbhatia332@gmail.com') {
            sessionStorage.removeItem('owner_auth_attempts');
            sessionStorage.removeItem('owner_auth_locktime');
            
            // Store a crypto-random session token to prevent replay attacks
            const sessionToken = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'tok-' + Date.now() + '-' + Math.random().toString(36).substr(2, 12);
            sessionStorage.setItem('owner_verified', sessionToken);
            window._ownerSessionToken = sessionToken;
            
            const gate = document.getElementById('auth-gate');
            const mainContent = document.getElementById('main-content');

            gate.style.transition = 'opacity 0.3s ease';
            gate.style.opacity = '0';
            setTimeout(() => {
                gate.style.display = 'none';
                mainContent.style.display = 'block';
                populateSettingsForm();
                startSessionListeners();
                loadHistory();
            }, 300);
        } else {
            // Sign out immediately because they signed in with a non-owner account on the owner gate
            await firebase.auth().signOut();
            errorEl.innerText = "Access Denied: This account does not have owner privileges.";
            errorEl.style.display = 'block';
        }
    } catch (err) {
        attempts++;
        sessionStorage.setItem('owner_auth_attempts', attempts);
        if (attempts >= 5) {
            sessionStorage.setItem('owner_auth_locktime', Date.now() + 5 * 60 * 1000); // 5 minutes lockout
            errorEl.innerText = 'Too many failed attempts. Locked out for 5 minutes.';
        } else {
            errorEl.innerText = `Invalid credentials: ${err.message}. ${5 - attempts} attempts remaining.`;
        }
        errorEl.style.display = 'block';
        const card = document.querySelector('.auth-card');
        card.style.animation = 'none';
        setTimeout(() => card.style.animation = 'shake 0.4s', 10);
    }
};

// --- SETTINGS ---
function populateSettingsForm() {
    updateOwnerUI();

    setValue('setting-store-name', localSettings.storeName);
    setValue('setting-upi-id', localSettings.upiId);
    setValue('setting-owner-phone', localSettings.ownerPhone);
    const nextInvoiceNo = (localSettings.lastInvoiceNo !== undefined && localSettings.lastInvoiceNo !== null) ? parseInt(localSettings.lastInvoiceNo) + 1 : 1000;
    setValue('setting-last-invoice-no', nextInvoiceNo);
    
    // Clear password inputs
    const passInput = document.getElementById('setting-owner-pass');
    if (passInput) passInput.value = '';
    const passConfirmInput = document.getElementById('setting-owner-pass-confirm');
    if (passConfirmInput) passConfirmInput.value = '';

    // Keep listening for live changes
    db.ref('settings').on('value', snapshot => {
        if (snapshot.exists()) {
            localSettings = { ...localSettings, ...snapshot.val() };
            updateOwnerUI();
        }
    });
    db.ref('settings_private').on('value', snapshot => {
        if (snapshot.exists()) {
            const privateData = snapshot.val();
            localSettings = { ...localSettings, ...privateData };
            updateOwnerUI();

            // VULN-12 fix: UPI auto-migration to public settings removed.
            // UPI ID is only stored in settings_private and served via get-upi serverless function.
        }
    });
    db.ref('settings_private/staff').on('value', snapshot => {
        const staffList = snapshot.val() || {};
        renderStaffList(staffList);
    });
}

function updateOwnerUI() {
    const name = localSettings.storeName || 'DesignE';
    document.title = name + ' | Owner Dashboard';
    const logoEl = document.querySelector('.logo');
    if (logoEl) logoEl.innerText = name.toUpperCase() + ' OWNER';
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
}

window.saveOwnerSettings = async function() {
    const storeName = document.getElementById('setting-store-name').value.trim();
    const upiId = document.getElementById('setting-upi-id').value.trim();
    const ownerPhone = document.getElementById('setting-owner-phone').value.trim();
    const ownerPass = document.getElementById('setting-owner-pass').value;
    const ownerPassConfirm = document.getElementById('setting-owner-pass-confirm').value;
    const nextInvoiceInput = document.getElementById('setting-last-invoice-no');
    
    let lastInvoiceNo = (localSettings.lastInvoiceNo !== undefined && localSettings.lastInvoiceNo !== null) ? localSettings.lastInvoiceNo : 999;
    if (nextInvoiceInput && nextInvoiceInput.value.trim().length > 0) {
        lastInvoiceNo = parseInt(nextInvoiceInput.value.trim()) - 1;
    }

    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        alert('You must be logged in to save settings.');
        return;
    }

    const saveBtn = document.getElementById('save-settings-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SAVING...';

    // If new password fields are filled, update password in Firebase Auth first
    if (ownerPass) {
        if (ownerPass.length < 6) {
            alert("New password must be at least 6 characters.");
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
            return;
        }
        if (ownerPass !== ownerPassConfirm) {
            alert("Passwords do not match!");
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
            return;
        }
        try {
            await currentUser.updatePassword(ownerPass);
            // Password updated successfully! Clear the password fields.
            document.getElementById('setting-owner-pass').value = '';
            document.getElementById('setting-owner-pass-confirm').value = '';
        } catch (passErr) {
            console.error("Failed to update password:", passErr);
            if (passErr.code === 'auth/requires-recent-login') {
                alert("For security reasons, changing your password requires a recent login. Please log out, log back in, and try again.");
            } else {
                alert("Failed to update password: " + passErr.message);
            }
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
            return;
        }
    }

    // VULN-12 fix: upiId removed from public settings — served only via serverless get-upi function
    const pubPromise = db.ref('settings').update({
        storeName,
        lastInvoiceNo
    });

    const privPromise = db.ref('settings_private').update({
        upiId,
        ownerPhone,
        ownerId: null, // Clear old DB credentials to finalize isolation
        ownerPass: null
    });

    // Clean up duplicate plaintext credentials from public settings node
    const cleanPromise = db.ref('settings').update({
        ownerPhone: null,
        ownerId: null,
        ownerPass: null
    });

    Promise.all([pubPromise, privPromise, cleanPromise]).then(() => {
        // --- MASTER SYNC: Send sync timestamp via serverless function (VULN-02 fix) ---
        if (typeof LICENSE_ID !== 'undefined') {
            fetch('/.netlify/functions/check-license', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseId: LICENSE_ID, action: 'configUpdate' })
            }).catch(err => console.warn('[License] Config update sync failed:', err));
        }
        alert('Configuration updated successfully!');
    }).catch(err => {
        console.error('Failed to save settings:', err);
        alert('Error saving settings: ' + err.message);
    }).finally(() => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    });
};

window.forgotOwnerPassword = function() {
    const authEmailEl = document.getElementById('auth-email');
    const email = authEmailEl ? authEmailEl.value.trim() : '';
    
    if (email) {
        sendReset(email);
    } else {
        db.ref('settings_private/superAdminEmail').once('value').then(snap => {
            const ownerEmail = snap.val();
            if (ownerEmail) {
                sendReset(ownerEmail);
            } else {
                alert("Please enter your Owner Email in the input field first.");
            }
        }).catch(err => {
            alert("Please enter your Owner Email in the input field first.");
        });
    }

    function sendReset(targetEmail) {
        if (confirm(`Send password reset email to owner: ${targetEmail}?`)) {
            firebase.auth().sendPasswordResetEmail(targetEmail)
                .then(() => {
                    alert("Password reset email sent! Please check your inbox.");
                })
                .catch(err => {
                    alert("Error: " + err.message);
                });
        }
    }
};

// --- SESSIONS & HISTORY ---
function startSessionListeners() {
    sessionsRef.on('child_added', snapshot => {
        localSessions[snapshot.key] = snapshot.val();
    });
    sessionsRef.on('child_changed', snapshot => {
        localSessions[snapshot.key] = snapshot.val();
    });
    sessionsRef.on('child_removed', snapshot => {
        delete localSessions[snapshot.key];
    });
}

window.loadHistory = function() {
    const startDateStr = document.getElementById('history-start-date').value;
    const endDateStr = document.getElementById('history-end-date').value;

    if (!startDateStr || !endDateStr) return;

    const startObj = new Date(startDateStr);
    startObj.setHours(0, 0, 0, 0);

    const endObj = new Date(endDateStr);
    endObj.setHours(23, 59, 59, 999);

    const historyEntries = Object.entries(localSessions)
        .filter(([id, s]) => {
            if (s.status !== 'completed' || !s.settledAt || (s.total || 0) <= 0) return false;
            const settled = new Date(s.settledAt);
            return settled >= startObj && settled <= endObj;
        })
        .sort((a, b) => (b[1].settledAt || 0) - (a[1].settledAt || 0));

    const totalOrders = historyEntries.length;
    let totalRevenue = 0;
    let cashRevenue = 0;
    let onlineRevenue = 0;

    historyEntries.forEach(([, s]) => {
        const amt = s.total || 0;
        totalRevenue += amt;
        if (s.paymentMethod === 'online') onlineRevenue += amt;
        else cashRevenue += amt;
    });

    const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    document.getElementById('hist-orders').innerText = totalOrders;
    document.getElementById('hist-revenue').innerText = '\u20B9' + totalRevenue.toLocaleString();
    document.getElementById('hist-revenue-cash').innerText = '\u20B9' + cashRevenue.toLocaleString();
    document.getElementById('hist-revenue-online').innerText = '\u20B9' + onlineRevenue.toLocaleString();
    document.getElementById('hist-avg').innerText = '\u20B9' + avgOrder.toLocaleString();

    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    if (historyEntries.length === 0) {
        historyList.innerHTML = '<div class="empty-state" style="padding: 5rem 1rem;">' +
            '<i class="fas fa-search" style="opacity: 0.2;"></i>' +
            '<p>No orders found for this period.</p>' +
            '<span>Try selecting a different date range.</span></div>';
        return;
    }

    historyEntries.forEach(([id, session]) => {
        const settledFullDate = new Date(session.settledAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const settledTime = new Date(session.settledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const itemsSummary = (session.items || []).map(i => i.quantity + 'x ' + sanitize(i.name)).join(', ');

        const method = (session.paymentMethod || 'cash').toLowerCase();
        const methodHtml = '<span class="payment-badge ' + method + '">' + method + '</span>';
        
        const card = document.createElement('div');
        card.className = 'history-item-card';
        card.innerHTML = '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">' +
            '<div>' +
                '<div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.3rem;">' +
                    '<span style="font-weight: 900; font-size: 1.1rem; color: white;">Table ' + session.tableNo + '</span>' +
                    methodHtml +
                '</div>' +
                '<span style="font-size: 0.8rem; color: white; opacity: 0.8; font-weight: 600; display: block;">' + sanitize(session.customerName || 'GUEST') + '</span>' +
                '<span style="font-size: 0.7rem; color: var(--text-dim); font-weight: 700; margin-top: 0.4rem; display: block;">' +
                     '<i class="far fa-calendar-alt"></i> ' + settledFullDate + ' &nbsp;•&nbsp; <i class="far fa-clock"></i> ' + settledTime +
                '</span>' +
            '</div>' +
            '<div style="text-align: right;">' +
                '<span style="font-weight: 900; font-size: 1.4rem; color: var(--success-neon); display: block;">\u20B9' + (session.total || 0).toLocaleString() + '</span>' +
                '<span style="font-size: 0.65rem; color: var(--text-dim); font-weight: 800; letter-spacing: 1px;">' + (session.invoiceNo ? 'INV: ' + session.invoiceNo : '#' + id.substr(-6).toUpperCase()) + '</span>' +
            '</div>' +
        '</div>' +
        '<div style="font-size: 0.8rem; color: var(--text-dim); font-weight: 500; margin-bottom: 1.2rem; line-height: 1.5; background: rgba(255,255,255,0.02); padding: 0.8rem; border-radius: 8px;">' +
            '<i class="fas fa-receipt" style="margin-right: 0.5rem; opacity: 0.5;"></i> ' + (itemsSummary || 'No items listed') +
        '</div>' +
        '<div style="display: flex; gap: 0.8rem;">' +
            '<button class="nav-btn" style="flex: 1; justify-content: center; padding: 0.6rem; font-size: 0.75rem;" onclick="printBill(\'' + id + '\')">' +
                '<i class="fas fa-print"></i> REPRINT RECEIPT' +
            '</button>' +
            '<button class="nav-btn logout" style="background: rgba(239, 68, 68, 0.05); border-color: rgba(239, 68, 68, 0.2); padding: 0.6rem; justify-content: center; width: 45px;" onclick="deleteHistoryEntry(\'' + id + '\')" title="Delete record">' +
                '<i class="fas fa-trash-alt"></i>' +
            '</button>' +
        '</div>';
        historyList.appendChild(card);
    });
};

// --- DELETE & CLEAR ---
window.deleteHistoryEntry = function(sessionId) {
    if (confirm('Are you sure you want to delete this order from history? This action cannot be undone!')) {
        db.ref('sessions/' + sessionId).remove()
            .then(() => { alert('Order successfully deleted.'); loadHistory(); })
            .catch(err => alert('Failed to delete order: ' + err.message));
    }
};

window.clearAllSessions = function() {
    var p1 = confirm('\u26A0\uFE0F CRITICAL WARNING: You are about to DELETE ALL SALES HISTORY. Are you sure?');
    if (p1) {
        var p2 = confirm('FINAL CONFIRMATION: This action is IRREVERSIBLE. All data will be gone. Proceed?');
        if (p2) {
            db.ref('sessions').remove().then(() => {
                localSessions = {};
                alert('All session data wiped successfully.');
                loadHistory();
            }).catch(err => {
                alert('Failed to clear data: ' + err.message);
            });
        }
    }
};

// --- PRINT BILL ---
window.printBill = function(sessionId) {
    var session = localSessions[sessionId];
    if (!session) { alert('Session not found.'); return; }

    var now = new Date();
    var dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    var timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    var itemRows = (session.items || []).map(function(item) {
        var amt = item.price * item.quantity;
        return '<tr><td style="text-align:left;">' + sanitize(item.name) + '</td>' +
               '<td style="text-align:center;">' + item.quantity + '</td>' +
               '<td style="text-align:right;">Rs.' + amt.toLocaleString() + '</td></tr>';
    }).join('');

    var modRows = '';
    if (session.modifiers && session.modifiers.length > 0) {
        modRows += '<tr><td colspan="2" style="text-align:right; font-weight: bold; border-top: 1px dashed black; padding-top: 5px;">Subtotal</td>' +
                   '<td style="text-align:right; border-top: 1px dashed black; padding-top: 5px;">Rs.' + (session.subtotal || session.total || 0).toLocaleString() + '</td></tr>';
        session.modifiers.forEach(function(mod) {
            var amtStr = mod.isPercentage ? mod.value + '%' : 'Rs.' + mod.value;
            var sign = mod.type === 'discount' ? '-' : '+';
            var calculatedAmt = mod.isPercentage ? ((session.subtotal || 0) * (mod.value / 100)) : mod.value;
            modRows += '<tr><td colspan="2" style="text-align:right; font-size:11px;">' + sanitize(mod.label) + ' (' + amtStr + ')</td>' +
                       '<td style="text-align:right; font-size:11px;">' + sign + 'Rs.' + Math.round(calculatedAmt).toLocaleString() + '</td></tr>';
        });
    }

    var receiptHtml = '<div class="receipt"><div class="center">' +
        '<h1>' + sanitize(localSettings.storeName || 'DESIGNE') + '</h1>' +
        '<div class="sub-hdr">DIGITAL RESTAURANT ORDERING</div>' +
        '<div style="font-weight: bold; margin-top: 5px; font-size: 11px;">-- CUSTOMER COPY --</div></div><hr>' +
        '<div class="info"><span>Table: <strong>' + session.tableNo + '</strong></span><span>' + dateStr + '</span></div>' +
        '<div class="info"><span>Customer: <strong>' + sanitize(session.customerName || 'Guest') + '</strong></span><span>' + (session.invoiceNo ? 'Invoice #' + session.invoiceNo : 'Bill #' + sessionId.substr(-6).toUpperCase()) + '</span></div>' +
        '<div class="info"><span>Time: ' + timeStr + '</span></div><hr>' +
        '<table><thead><tr><th>ITEM</th><th style="text-align:center;">QTY</th><th style="text-align:right;">AMT</th></tr></thead>' +
        '<tbody>' + itemRows + modRows + '</tbody></table>' +
        '<div class="total-row"><span>NET TOTAL</span><span>Rs.' + (session.total || 0).toLocaleString() + '</span></div><hr>' +
        '<div class="footer">' +
        '<p>Thank you for visiting, ' + sanitize(session.customerName || 'Guest') + '!</p>' +
        '<p>We hope to see you again soon ✨</p>' +
        '<p style="margin-top: 10px; font-weight: bold; font-size: 10px;">POWERED BY DESIGNE</p></div></div>';

    var billHtml = '<html><head><title> </title><style>' +
        "@page { margin: 0; size: auto; }" +
        'body { font-family: "Courier New", Courier, monospace; margin: 0; padding: 15mm; color: black; background: white; font-size: 14px; }' +
        '@media print { body { margin: 0; } }' +
        '.receipt { width: 100%; max-width: 140mm; margin: 0 auto; }' +
        '.center { text-align: center; }' +
        'h1 { margin: 0; font-size: 24px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }' +
        '.sub-hdr { font-size: 10px; color: #555; margin-bottom: 10px; }' +
        'hr { border: none; border-top: 1px dashed black; margin: 10px 0; }' +
        '.info { display: flex; justify-content: space-between; font-size: 12px; margin: 5px 0; }' +
        'table { width: 100%; font-size: 14px; border-collapse: collapse; margin-top: 10px; }' +
        'th { border-bottom: 1px solid black; padding-bottom: 5px; text-align: left; font-size: 12px; }' +
        'td { padding: 6px 0; }' +
        '.total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; margin-top: 10px; padding-top: 10px; border-top: 1px double black; }' +
        '.footer { text-align: center; margin-top: 20px; font-size: 11px; color: #555; }' +
        '</style></head><body onload="window.print()">' + receiptHtml + '</body></html>';

    var oldFrame = document.getElementById('bill-print-frame');
    if (oldFrame) oldFrame.remove();

    var iframe = document.createElement('iframe');
    iframe.id = 'bill-print-frame';
    iframe.title = ' ';
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.srcdoc = billHtml;
    document.body.appendChild(iframe);
};

// --- PRINT SALES REPORT ---
window.printSalesReport = function() {
    const startDateStr = document.getElementById('history-start-date').value;
    const endDateStr = document.getElementById('history-end-date').value;

    if (!startDateStr || !endDateStr) {
        alert('Please select a date range first.');
        return;
    }

    const startObj = new Date(startDateStr);
    startObj.setHours(0, 0, 0, 0);

    const endObj = new Date(endDateStr);
    endObj.setHours(23, 59, 59, 999);

    const historyEntries = Object.entries(localSessions)
        .filter(([id, s]) => {
            if (s.status !== 'completed' || !s.settledAt || (s.total || 0) <= 0) return false;
            const settled = new Date(s.settledAt);
            return settled >= startObj && settled <= endObj;
        })
        .sort((a, b) => (a[1].settledAt || 0) - (b[1].settledAt || 0)); // Sort by time (oldest first)

    if (historyEntries.length === 0) {
        alert('No data found for the selected period.');
        return;
    }

    let totalRevenue = 0;
    let cashRevenue = 0;
    let onlineRevenue = 0;

    const reportRows = historyEntries.map(([id, session]) => {
        const amt = session.total || 0;
        totalRevenue += amt;
        if (session.paymentMethod === 'online') onlineRevenue += amt;
        else cashRevenue += amt;

        const date = new Date(session.settledAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' });
        const time = new Date(session.settledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return `<tr>
            <td style="text-align:left;">${date} ${time}</td>
            <td style="text-align:center;">T${session.tableNo}</td>
            <td style="text-align:left;">${sanitize((session.customerName || 'GUEST').substr(0,12))}</td>
            <td style="text-align:center; text-transform: uppercase; font-size: 10px;">${session.paymentMethod || 'cash'}</td>
            <td style="text-align:right;">Rs.${amt.toLocaleString()}</td>
        </tr>`;
    }).join('');

    const reportHtml = `
        <div class="receipt">
            <div class="center">
                <h1>${sanitize(localSettings.storeName || 'DESIGNE')}</h1>
                <div class="sub-hdr">SALES SUMMARY REPORT</div>
                <div style="font-weight: bold; margin-top: 5px; font-size: 11px;">PERIOD: ${startDateStr} to ${endDateStr}</div>
            </div>
            <hr>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0;">
                <div style="border: 1px solid black; padding: 10px; text-align: center;">
                    <div style="font-size: 10px; text-transform: uppercase;">Total Orders</div>
                    <div style="font-size: 18px; font-weight: bold;">${historyEntries.length}</div>
                </div>
                <div style="border: 1px solid black; padding: 10px; text-align: center;">
                    <div style="font-size: 10px; text-transform: uppercase;">Total Revenue</div>
                    <div style="font-size: 18px; font-weight: bold;">Rs.${totalRevenue.toLocaleString()}</div>
                </div>
            </div>
            <div style="display: flex; justify-content: space-around; margin-bottom: 15px; font-size: 11px; font-weight: bold;">
                <span>CASH: Rs.${cashRevenue.toLocaleString()}</span>
                <span>ONLINE: Rs.${onlineRevenue.toLocaleString()}</span>
            </div>
            <hr>
            <table>
                <thead>
                    <tr>
                        <th style="text-align:left;">DATE/TIME</th>
                        <th style="text-align:center;">TBL</th>
                        <th style="text-align:left;">CUSTOMER</th>
                        <th style="text-align:center;">MODE</th>
                        <th style="text-align:right;">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    ${reportRows}
                </tbody>
            </table>
            <div class="total-row" style="font-size: 14px; margin-top: 15px;">
                <span>GRAND TOTAL REVENUE</span>
                <span>Rs.${totalRevenue.toLocaleString()}</span>
            </div>
            <hr>
            <div class="footer">
                <p>Report Generated on: ${new Date().toLocaleString()}</p>
                <p style="margin-top: 10px; font-weight: bold; font-size: 10px;">POWERED BY DESIGNE</p>
            </div>
        </div>
    `;

    const fullHtml = `<html><head><title> </title><style>
        @page { margin: 0; size: auto; }
        body { font-family: "Courier New", Courier, monospace; margin: 0; padding: 15mm; color: black; background: white; font-size: 12px; }
        @media print { body { margin: 0; } }
        .receipt { width: 100%; max-width: 140mm; margin: 0 auto; }
        .center { text-align: center; }
        h1 { margin: 0; font-size: 22px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
        .sub-hdr { font-size: 12px; margin-bottom: 5px; }
        hr { border: none; border-top: 1px dashed black; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
        th { border-bottom: 1px solid black; padding-bottom: 5px; text-transform: uppercase; font-size: 10px; }
        td { padding: 5px 0; }
        .total-row { display: flex; justify-content: space-between; font-weight: bold; padding-top: 10px; border-top: 1px double black; }
        .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #555; }
    </style></head><body onload="window.print()">${reportHtml}</body></html>`;

    var oldFrame = document.getElementById('bill-print-frame');
    if (oldFrame) oldFrame.remove();

    var iframe = document.createElement('iframe');
    iframe.id = 'bill-print-frame';
    iframe.title = ' ';
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.srcdoc = fullHtml;
    document.body.appendChild(iframe);
};

// --- STAFF MANAGEMENT ---

function renderStaffList(staffList) {
    const listEl = document.getElementById('staff-list');
    const emptyEl = document.getElementById('staff-empty-state');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    const entries = Object.entries(staffList);
    
    if (entries.length === 0) {
        emptyEl.style.display = 'block';
        return;
    }
    
    emptyEl.style.display = 'none';
    entries.forEach(([key, staff]) => {
        if (!staff || !staff.email) return;
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '0.8rem 1rem';
        li.style.background = 'rgba(255, 255, 255, 0.03)';
        li.style.border = '1px solid var(--glass-border)';
        li.style.borderRadius = '8px';
        
        li.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.8rem;">
                <i class="fas fa-user" style="color: var(--text-dim);"></i>
                <span style="font-weight: 600; font-size: 0.9rem;">${sanitize(staff.email)}</span>
            </div>
            <button class="nav-btn logout" style="padding: 0.4rem 0.8rem; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2);" onclick="removeStaffAccount('${key}', '${sanitize(staff.email)}')">
                <i class="fas fa-trash-alt"></i> Revoke
            </button>
        `;
        listEl.appendChild(li);
    });
}

window.addStaffAccount = async function() {
    const email = document.getElementById('new-staff-email').value.trim();
    const pass = document.getElementById('new-staff-pass').value;
    const btn = document.getElementById('add-staff-btn');
    
    if (!email || !pass) {
        alert("Please enter both email and password.");
        return;
    }
    
    if (pass.length < 6) {
        alert("Staff password must be at least 6 characters.");
        return;
    }
    
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        alert("You must be logged in to create staff.");
        return;
    }

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REGISTERING STAFF...';
    
    try {
        const requesterToken = await currentUser.getIdToken();
        const response = await fetch('/.netlify/functions/create-staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass, requesterToken })
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Failed to register staff account");
        }
        
        // Clear inputs
        document.getElementById('new-staff-email').value = '';
        document.getElementById('new-staff-pass').value = '';
        alert(`Staff account ${email} registered and authorized successfully!`);
    } catch (err) {
        console.error(err);
        alert("Error creating staff: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

window.removeStaffAccount = function(key, email) {
    if (confirm(`Are you sure you want to revoke access for ${email}? They will be immediately blocked from logging in.`)) {
        db.ref(`settings_private/staff/${key}`).remove()
            .then(() => {
                alert("Staff authorization revoked successfully.");
            })
            .catch(err => {
                alert("Error revoking access: " + err.message);
            });
    }
};

