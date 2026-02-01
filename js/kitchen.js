const ordersContainer = document.getElementById('orders-container');

// Listen for orders
db.ref('orders').on('value', (snapshot) => {
    const orders = snapshot.val();
    renderOrders(orders);
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

window.completeOrder = (id) => {
    if (confirm('Mark this order as complete?')) {
        db.ref('orders/' + id).remove();
    }
};
