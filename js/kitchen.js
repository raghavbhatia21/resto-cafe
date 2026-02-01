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
            <button class="complete-btn" onclick="completeOrder('${id}')">MARK AS READY</button>
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
