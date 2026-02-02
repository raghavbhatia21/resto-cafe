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
        const billCard = document.createElement('div');
        billCard.className = 'bill-card glass';

        const itemsHtml = (session.items || []).map(item => `
            <li class="bill-item">
                <span><span class="item-qty">${item.quantity}x</span> ${item.name}</span>
                <span>₹${item.price * item.quantity}</span>
            </li>
        `).join('');

        billCard.innerHTML = `
            <div class="bill-header">
                <span class="table-no">Table ${session.tableNo}</span>
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
        // 1. Mark session as paid
        db.ref('sessions/' + sessionId).update({
            status: 'paid',
            settledAt: Date.now()
        }).then(() => {
            // 2. Release the table
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
