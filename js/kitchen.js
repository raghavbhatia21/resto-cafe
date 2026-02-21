const ordersContainer = document.getElementById('orders-container');
const tablesContainer = document.getElementById('tables-container');

// Listen for orders
db.ref('orders').on('value', (snapshot) => {
    const orders = snapshot.val();
    renderOrders(orders);
});

// Listen for tables
db.ref('tables').on('value', (snapshot) => {
    renderTables(snapshot.val());
});

function renderOrders(orders) {
    if (!orders) {
        ordersContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-utensils fa-4x" style="margin-bottom: 1rem"></i>
                <p>No active orders. Relax and wait for the magic!</p>
            </div>
        `;
        return;
    }

    ordersContainer.innerHTML = '';

    // Sort orders by timestamp (oldest first)
    const sortedOrders = Object.entries(orders).sort((a, b) => a[1].timestamp - b[1].timestamp);

    sortedOrders.forEach(([id, order]) => {
        const orderCard = document.createElement('div');
        orderCard.className = 'order-card glass';

        const itemsHtml = order.items.map(item => `
            <li class="order-item">
                <span><span class="item-qty">${item.quantity}x</span> ${item.name}</span>
            </li>
        `).join('');

        const time = new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        orderCard.innerHTML = `
            <div class="order-header">
                <span class="table-no">Table ${order.tableNo}</span>
                <span class="order-time">${time}</span>
            </div>
            <ul class="order-items">
                ${itemsHtml}
            </ul>
            ${order.comment ? `<div class="order-comment" style="background: rgba(255,107,107,0.1); border: 1px dashed var(--accent-main); padding: 0.6rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; color: #ffeb3b;">
                <strong>Note:</strong> ${order.comment}
            </div>` : ''}
            <div class="order-actions">
                <button class="complete-btn" onclick="completeOrder('${id}')">MARK AS READY</button>
                <div class="wa-actions" style="margin-top: 0.5rem; display: flex; gap: 0.5rem;">
                    <button class="wa-btn" style="background: #25D366; color: white; border: none; padding: 0.5rem; border-radius: 5px; flex: 1; cursor: pointer;" 
                        onclick="sendWhatsAppUpdate('${order.customerPhone}', 'preparing', '${order.tableNo}')">
                        <i class="fab fa-whatsapp"></i> PREPARING
                    </button>
                    <button class="wa-btn" style="background: #25D366; color: white; border: none; padding: 0.5rem; border-radius: 5px; flex: 1; cursor: pointer;" 
                        onclick="sendWhatsAppUpdate('${order.customerPhone}', 'ready', '${order.tableNo}')">
                        <i class="fab fa-whatsapp"></i> READY
                    </button>
                </div>
            </div>
        `;
        ordersContainer.appendChild(orderCard);
    });
}

function renderTables(tables) {
    if (!tables) {
        tablesContainer.innerHTML = '<p style="color: var(--text-muted)">No active tables.</p>';
        return;
    }

    tablesContainer.innerHTML = '';

    Object.entries(tables).forEach(([id, data]) => {
        if (data.status === 'occupied') {
            const tableCard = document.createElement('div');
            tableCard.className = 'order-card glass'; // Reuse style
            tableCard.style.borderLeftColor = 'var(--accent-drinks)'; // Blue for tables

            const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            tableCard.innerHTML = `
                <div class="order-header">
                    <span class="table-no" style="color: white; font-size: 1.2rem;">${id.replace('table_', 'Table ')}</span>
                    <span class="order-time">${time}</span>
                </div>
                <p style="color: var(--text-muted); margin-bottom: 1rem;">Occupied</p>
                <button class="complete-btn" style="background: var(--accent-main);" onclick="releaseTable('${id}')">RELEASE TABLE</button>
            `;
            tablesContainer.appendChild(tableCard);
        }
    });

    if (tablesContainer.innerHTML === '') {
        tablesContainer.innerHTML = '<p style="color: var(--text-muted)">All tables are free.</p>';
    }
}

window.completeOrder = (id) => {
    if (confirm('Mark this order as complete?')) {
        db.ref('orders/' + id).remove();
    }
};

window.releaseTable = (tableId) => {
    if (confirm(`Release ${tableId.replace('_', ' ')}? This will allow new customers to use it.`)) {
        db.ref('tables/' + tableId).update({
            status: 'free',
            sessionId: null
        });
    }
};

window.sendWhatsAppUpdate = (phone, status, tableNo) => {
    if (!phone) {
        alert("No phone number associated with this order.");
        return;
    }

    let message = "";
    if (status === 'preparing') {
        message = `👨‍🍳 *Update from Caferesto!*\n\nTable: ${tableNo}\nYour order is now being *prepared* in the kitchen. Just a few more minutes!`;
    } else if (status === 'ready') {
        message = `✅ *Update from Caferesto!*\n\nTable: ${tableNo}\nGood news! Your order is *ready* and will be served shortly. Bon appétit! 🍽️`;
    }

    if (message) {
        const waUrl = `https://wa.me/91${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
        alert(`WhatsApp link opened for: ${status.toUpperCase()}`);
    }
};

// Waiter Call Logic
const waiterCallsArea = document.getElementById('waiter-calls-area');
if (waiterCallsArea) {
    db.ref('waiter_calls').on('value', snapshot => {
        const calls = snapshot.val();
        if (!calls) {
            waiterCallsArea.classList.remove('active');
            waiterCallsArea.innerHTML = '';
            return;
        }

        waiterCallsArea.classList.add('active');
        waiterCallsArea.innerHTML = '';

        Object.entries(calls).forEach(([id, call]) => {
            const time = new Date(call.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const card = document.createElement('div');
            card.className = 'waiter-card glass';
            card.innerHTML = `
                <h4>Table ${call.tableNo}</h4>
                <p><i class="fas fa-user"></i> ${call.customerName}</p>
                <p><i class="far fa-clock"></i> ${time}</p>
                <button class="resolve-btn" onclick="resolveWaiterCall('${id}')">RESOLVED / CLEAR</button>
            `;
            waiterCallsArea.appendChild(card);
        });
    });
}

window.resolveWaiterCall = (id) => {
    db.ref('waiter_calls/' + id).remove();
};
