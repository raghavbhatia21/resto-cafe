const billsContainer = document.getElementById('bills-container');

// Listen for active sessions
db.ref('sessions').on('value', (snapshot) => {
    const sessions = snapshot.val();
    renderBills(sessions);
});

function renderBills(sessions) {
    if (!sessions) {
        showEmptyState();
        return;
    }

    const activeSessions = Object.entries(sessions)
        .filter(([id, data]) => data.status === 'active')
        .sort((a, b) => (b[1].lastOrderTime || 0) - (a[1].lastOrderTime || 0));

    if (activeSessions.length === 0) {
        showEmptyState();
        return;
    }

    billsContainer.innerHTML = '';

    activeSessions.forEach(([id, session]) => {
        const isRequested = session.status === 'bill_requested';
        const billCard = document.createElement('div');
        billCard.className = `bill-card glass ${isRequested ? 'pulse-border' : ''}`;

        const itemsHtml = (session.items || []).map(item => `
            <li class="bill-item">
                <span><span class="item-qty">${item.quantity}x</span> ${item.name}</span>
                <span>₹${item.price * item.quantity}</span>
            </li>
        `).join('');

        const itemsString = (session.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ');

        billCard.innerHTML = `
            <div class="bill-header">
                <div>
                    <span class="table-no">Table ${session.tableNo}</span>
                    ${isRequested ? '<span class="status-badge requested">BILL REQUESTED</span>' : ''}
                </div>
                <span style="font-size: 0.8rem; color: var(--text-muted)">ID: ${id.substr(-6).toUpperCase()}</span>
            </div>
            <ul class="bill-items">
                ${itemsHtml || '<li class="bill-item">No items yet</li>'}
            </ul>
            <div class="bill-footer">
                <div class="total-row">
                    <span>Grand Total:</span>
                    <span style="color: var(--primary)">₹${session.total || 0}</span>
                </div>
                <button class="paid-btn" onclick="markAsPaid('${id}', '${session.tableNo}')">SETTLE & RELEASE</button>
                <div class="cashier-actions" style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <button class="wa-btn" style="background: #25D366; color: white; border: none; padding: 0.6rem; border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;" 
                        onclick="sendBillWhatsApp('${itemsString.replace(/'/g, "\\'")}', '${session.total}', '${session.tableNo}', '${session.customerPhone || ''}', '${id.substr(-6).toUpperCase()}')">
                        <i class="fab fa-whatsapp"></i> SEND BILL
                    </button>
                    <button class="qr-btn" style="background: var(--primary); color: white; border: none; padding: 0.6rem; border-radius: 5px; cursor: pointer;" 
                        onclick="showPaymentQR('${session.total}', '${session.tableNo}')">
                        <i class="fas fa-qrcode"></i> SHOW QR
                    </button>
                </div>
            </div>
        `;
        billsContainer.appendChild(billCard);
    });
}

function showEmptyState() {
    billsContainer.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-file-invoice-dollar fa-4x" style="margin-bottom: 1rem"></i>
            <p>No active bills. Happy hunting!</p>
        </div>
    `;
}

window.markAsPaid = (sessionId, tableNo) => {
    if (confirm(`Confirm payment for Table ${tableNo}? This will free the table for new customers.`)) {
        db.ref('sessions/' + sessionId).update({
            status: 'paid',
            settledAt: Date.now()
        }).then(() => {
            db.ref('tables/table_' + tableNo).update({
                status: 'free',
                sessionId: null
            }).then(() => {
                alert(`Table ${tableNo} is now free.`);
            });
        }).catch(err => {
            console.error("Error settling bill:", err);
            alert("Failed to settle bill. Please check console.");
        });
    }
};

window.sendBillWhatsApp = (items, total, tableNo, phone, orderId) => {
    if (!phone) {
        alert("Phone number not found for this session.");
        return;
    }

    const message = `🧾 *Bill from Caferesto*\n\nOrder ID: #${orderId}\nTable: ${tableNo}\nItems: ${items}\n-------------------\nTotal: *₹${total}*\n-------------------\n\nThank you for visiting! Please let us know if you need anything else. ✨`;

    const waUrl = `https://wa.me/91${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
};

window.showPaymentQR = (total, tableNo) => {
    const upiId = "raghavbhatia332@okhdfcbank"; // USER: Change this to your actual UPI ID
    const name = "Caferesto";
    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${total}&cu=INR&tn=${encodeURIComponent('Table ' + tableNo)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`;

    const modal = document.createElement('div');
    modal.style = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; flex-direction: column; color: white;";
    modal.innerHTML = `
        <div style="background: white; padding: 2rem; border-radius: 15px; text-align: center; color: black; max-width: 300px;">
            <h3 style="margin-bottom: 1rem;">Table ${tableNo} Payment</h3>
            <img src="${qrUrl}" alt="Payment QR" style="width: 200px; height: 200px; margin-bottom: 1rem;">
            <p style="font-weight: bold; font-size: 1.2rem;">Total: ₹${total}</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 0.5rem;">Scan with any UPI App (PhonePe, GPay, etc.)</p>
            <button onclick="this.parentElement.parentElement.remove()" style="margin-top: 1.5rem; padding: 0.5rem 2rem; background: var(--accent-main); color: white; border: none; border-radius: 5px; cursor: pointer;">CLOSE</button>
        </div>
    `;
    document.body.appendChild(modal);
};
