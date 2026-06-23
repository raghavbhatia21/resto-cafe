let cart = [];
let currentCategory = 'starter';
let currentTable = null;
let sessionId = null;
let menuData = null;
let isProcessingOrder = false;

// DOM Elements
const menuContainer = document.getElementById('menu-container');
const tabBtns = document.querySelectorAll('.tab-btn');
const cartCount = document.getElementById('bar-cart-count');
const cartTotalBar = document.getElementById('bar-cart-total');
const bottomBar = document.getElementById('bottom-bar');
const cartModal = document.getElementById('cart-modal');
const closeCart = document.getElementById('close-cart');
const cartItemsList = document.getElementById('cart-items-list');
const cartTotal = document.getElementById('cart-total');
const placeOrderBtn = document.getElementById('place-order-btn');
const tableNoInput = document.getElementById('welcome-table-no');
const menuSearch = document.getElementById('menu-search');
let storeSettings = { storeName: 'DesignE' };

// Initialize App
function init() {
    checkLicense();
    setupListeners();
    checkSession();
    updateRequestBillVisibility();
    initTabIndicator();
    loadStoreSettings();
    loadCategories(); // New: Load categories first
    watchMenu();      // New: Real-time menu updates
    watchOffers();    // New: Real-time offers updates
}

function loadCategories() {
    db.ref('categories').orderByChild('order').on('value', snapshot => {
        const categories = snapshot.val();
        if (!categories) return;

        const tabsWrapper = document.querySelector('.tabs');
        const indicator = document.getElementById('tab-indicator');
        tabsWrapper.innerHTML = '';
        tabsWrapper.appendChild(indicator);

        Object.entries(categories).forEach(([id, cat], index) => {
            const btn = document.createElement('button');
            btn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
            btn.dataset.category = id;
            btn.innerText = cat.name;
            btn.onclick = () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateTabIndicator(btn);
                currentCategory = id;
                renderMenu(menuData);
            };
            tabsWrapper.appendChild(btn);
            if (index === 0) {
                currentCategory = id;
                setTimeout(() => updateTabIndicator(btn), 100);
            }
        });
    });
}

function loadStoreSettings() {
    db.ref('settings').on('value', snapshot => {
        if (snapshot.exists()) {
            storeSettings = { ...storeSettings, ...snapshot.val() };
            const name = storeSettings.storeName || 'DesignE';
            
            // Update Title
            document.title = `${name} | Digital Menu`;
            
            // Update Logo/Header
            const logoEl = document.querySelector('.logo');
            if (logoEl) logoEl.innerText = name;

            // Update Welcome Modal
            const brandSpan = document.querySelector('#welcome-modal .primary-brand-name');
            if (brandSpan) brandSpan.innerText = name;
        }
    });
}

function watchMenu() {
    renderSkeletons();
    db.ref('menu').on('value', snapshot => {
        menuData = snapshot.val();
        renderMenu(menuData);
    }, err => {
        console.error("Failed to watch menu:", err);
        menuContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Menu is currently unavailable. Please check back later.</p>';
    });
}

let offersData = null;
function watchOffers() {
    const offersSection = document.getElementById('offers-section');
    db.ref('offers').on('value', snapshot => {
        const data = snapshot.val();
        offersData = data;
        if (!data) {
            if (offersSection) offersSection.style.display = 'none';
            return;
        }
        renderOffers(data);
    }, err => {
        console.error("Failed to watch offers:", err);
        if (offersSection) offersSection.style.display = 'none';
    });
}

function renderOffers(offers) {
    const offersSection = document.getElementById('offers-section');
    const offersContainer = document.getElementById('offers-container');
    const activeOffers = Object.entries(offers).filter(([id, o]) => o.active !== false);

    if (activeOffers.length === 0) {
        offersSection.style.display = 'none';
        return;
    }

    offersSection.style.display = 'block';
    offersContainer.innerHTML = '';

    activeOffers.forEach(([id, offer]) => {
        const offerCard = document.createElement('div');
        offerCard.className = 'offer-card';
        const safeOfferImg = (offer.image || 'https://images.unsplash.com/photo-1476224483470-4f981f360a1e?w=800').replace(/['"()]/g, '');
        offerCard.style.backgroundImage = `url('${safeOfferImg}')`;
        offerCard.innerHTML = `
            ${offer.tag ? `<div class="offer-tag">${sanitize(offer.tag)}</div>` : ''}
            <div class="offer-content">
                <h3 class="offer-title">${sanitize(offer.title)}</h3>
                <p class="offer-desc">${sanitize(offer.description)}</p>
                <div class="offer-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                    <span class="offer-price" style="font-weight: 800; color: white; font-size: 1.1rem;">₹${offer.price || 0}</span>
                    <button class="offer-add-btn" onclick="addToCart('${id}', '${sanitize(offer.title).replace(/'/g, "\\'")}', ${offer.price || 0})">ADD +</button>
                </div>
            </div>
        `;
        offersContainer.appendChild(offerCard);
    });

    const indicators = document.querySelector('.scroll-indicators');
    if (indicators) {
        indicators.innerHTML = activeOffers.map((_, idx) => `<div class="dot ${idx === 0 ? 'active' : ''}"></div>`).join('');
        offersContainer.addEventListener('scroll', () => {
            const index = Math.round(offersContainer.scrollLeft / offersContainer.offsetWidth);
            const dots = indicators.querySelectorAll('.dot');
            dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
        });
    }
}

function renderMenu(items) {
    if (!items) {
        renderSkeletons();
        return;
    }

    const searchTerm = (menuSearch && menuSearch.value) ? menuSearch.value.toLowerCase().trim() : '';
    
    const filteredItems = Object.entries(items).filter(([id, item]) => {
        const matchesCategory = item.category === currentCategory;
        const matchesSearch = !searchTerm || 
            item.name.toLowerCase().includes(searchTerm) || 
            item.description.toLowerCase().includes(searchTerm);
        
        return item.available !== false && (searchTerm ? matchesSearch : matchesCategory);
    });

    if (filteredItems.length === 0) {
        menuContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem 2rem; opacity: 0.6;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
                <p style="font-weight: 600;">${searchTerm ? `No items found for "${searchTerm}"` : 'No items found in this category yet.'}</p>
            </div>
        `;
        return;
    }

    // Optimization: Batch DOM updates using DocumentFragment
    const fragment = document.createDocumentFragment();
    filteredItems.forEach(([id, item]) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'menu-item glass';
        let actionsHtml = '';

        if (item.variants && item.variants.length > 0) {
            const chipsHtml = item.variants.map((v, idx) => `
                <button class="variant-chip ${idx === 0 ? 'active' : ''}" data-price="${v.price}" data-variant="${sanitize(v.name)}" onclick="selectVariant(this, '${id}')">
                    ${sanitize(v.name)}
                </button>
            `).join('');
            actionsHtml = `<div class="variant-chips" id="chips-${id}">${chipsHtml}</div>
                           <button class="add-btn" onclick="addSelectedVariantToCart('${id}', '${sanitize(item.name).replace(/'/g, "\\'")}')">Add to Cart</button>`;
        } else {
            actionsHtml = `<button class="add-btn" onclick="addToCart('${id}', '${sanitize(item.name).replace(/'/g, "\\'")}', ${item.price})">Add to Cart</button>`;
        }

        itemEl.innerHTML = `
            <img src="${sanitize(item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400')}" alt="${sanitize(item.name)}" class="item-img" loading="lazy">
            <div class="item-content">
                ${item.dietary ? `<span class="${item.dietary}-badge">${item.dietary === 'nonveg' ? 'Non-Veg' : item.dietary.charAt(0).toUpperCase() + item.dietary.slice(1)}</span>` : ''}
                <div class="item-info">
                    <span class="item-name">${sanitize(item.name)}</span>
                    <span class="item-price" id="price-${id}">${item.variants && item.variants.length > 0 ? '₹' + item.variants[0].price : '₹' + item.price}</span>
                </div>
                <p class="item-desc">${sanitize(item.description)}</p>
                <div class="item-actions">${actionsHtml}</div>
            </div>
        `;
        fragment.appendChild(itemEl);
    });

    menuContainer.innerHTML = '';
    menuContainer.appendChild(fragment);
}

function renderSkeletons() {
    menuContainer.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const skeletonEl = document.createElement('div');
        skeletonEl.className = 'menu-item glass';
        skeletonEl.innerHTML = `
            <div class="skeleton skeleton-img"></div>
            <div class="item-info">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-price"></div>
            </div>
            <div class="skeleton skeleton-desc"></div>
            <div class="skeleton skeleton-btn"></div>
        `;
        menuContainer.appendChild(skeletonEl);
    }
}

function initTabIndicator() {
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) updateTabIndicator(activeTab);
    window.addEventListener('resize', () => {
        const currentActive = document.querySelector('.tab-btn.active');
        if (currentActive) updateTabIndicator(currentActive);
    });
}

function updateTabIndicator(btn) {
    const indicator = document.getElementById('tab-indicator');
    if (indicator) {
        indicator.style.width = `${btn.offsetWidth}px`;
        indicator.style.left = `${btn.offsetLeft}px`;
    }
}

window.selectVariant = (chip, id) => {
    const container = document.getElementById(`chips-${id}`);
    container.querySelectorAll('.variant-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    document.getElementById(`price-${id}`).innerText = `₹${chip.dataset.price}`;
};

window.addSelectedVariantToCart = (id, baseName) => {
    const activeChip = document.querySelector(`#chips-${id} .variant-chip.active`);
    if (activeChip) {
        const variantName = activeChip.dataset.variant;
        const variantPrice = parseFloat(activeChip.dataset.price);
        addToCart(id, `${baseName} (${variantName})`, variantPrice, variantName);
    }
};

function setupListeners() {
    // Removed tabBtns.forEach loop as it is now handled by loadCategories() dynamically
    
    const triggerAndCart = [document.getElementById('bar-cart-trigger'), document.getElementById('bar-open-cart-btn')];
    triggerAndCart.forEach(el => {
        if (el) el.addEventListener('click', () => {
            renderCart();
            updateRequestBillVisibility();
            cartModal.classList.add('active');
        });
    });

    if (closeCart) closeCart.addEventListener('click', () => cartModal.classList.remove('active'));
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', placeOrder);

    const reqBillBtn = document.getElementById('request-bill-btn');
    if (reqBillBtn) reqBillBtn.addEventListener('click', openBillSummary);
    
    const barReqBillBtn = document.getElementById('bar-request-bill-btn');
    if (barReqBillBtn) barReqBillBtn.addEventListener('click', openBillSummary);

    const statusBtn = document.getElementById('bar-order-status-btn');
    if (statusBtn) {
        statusBtn.addEventListener('click', () => {
            if (sessionId) {
                window.open(`order-status.html?sid=${sessionId}`, '_blank');
            }
        });
    }

    const closeBillSummary = document.getElementById('close-bill-summary');
    if (closeBillSummary) closeBillSummary.addEventListener('click', () => document.getElementById('bill-summary-modal').classList.remove('active'));

    const confirmBillBtn = document.getElementById('confirm-bill-btn');
    if (confirmBillBtn) confirmBillBtn.addEventListener('click', requestBill);
    
    const payNowBtn = document.getElementById('pay-now-btn');
    if (payNowBtn) {
        payNowBtn.addEventListener('click', () => {
            if (sessionId) {
                // Lock cart and notify cashier by requesting bill/initiating payment
                db.ref('sessions/' + sessionId).update({ 
                    status: 'bill_requested', 
                    billRequestedAt: Date.now() 
                }).then(() => {
                    window.open(`pay.html?sid=${sessionId}`, '_blank');
                    document.getElementById('bill-summary-modal').classList.remove('active');
                }).catch(err => {
                    console.error("Failed to initiate online payment session:", err);
                    // Open payment page anyway as fallback
                    window.open(`pay.html?sid=${sessionId}`, '_blank');
                });
            }
        });
    }
    
    const startOrderBtnAct = document.getElementById('start-order-btn');
    if (startOrderBtnAct) startOrderBtnAct.addEventListener('click', handleTableSelection);
    
    if (menuSearch) {
        menuSearch.addEventListener('input', () => {
            if (menuSearch.value.trim().length > 0) {
                // If searching, we might want to hide categories or just filter within current
                // For now, let's filter globally if searching, but show current category if empty
                renderMenu(menuData);
            } else {
                renderMenu(menuData);
            }
        });
    }
}

function checkSession() {
    const storedTable = localStorage.getItem('caferesto_table');
    const storedSession = localStorage.getItem('caferesto_session');
    const storedPhone = localStorage.getItem('caferesto_phone');
    const storedName = localStorage.getItem('caferesto_name');

    if (storedTable && storedSession) {
        document.getElementById('welcome-modal').classList.remove('active');
        
        db.ref('tables/table_' + storedTable).once('value').then(snapshot => {
            const data = snapshot.val();
            if (data && data.status === 'occupied' && data.sessionId === storedSession) {
                currentTable = storedTable;
                sessionId = storedSession;
                window.customerPhone = storedPhone;
                window.customerName = storedName;
                if (bottomBar) bottomBar.classList.add('active');
                updateRequestBillVisibility();
                watchSessionStatus();
                watchCustomerOrders();
            } else {
                ['caferesto_table', 'caferesto_session', 'caferesto_phone', 'caferesto_name']
                    .forEach(k => localStorage.removeItem(k));
                document.getElementById('welcome-modal').classList.add('active');
            }
        });
    } else {
        document.getElementById('welcome-modal').classList.add('active');
        if (bottomBar) bottomBar.classList.remove('active');
    }
}

// Optimization: Static listener to prevent memory leaks from multiple .on() calls
let sessionStatusListenerAttached = false;

function updateRequestBillVisibility() {
    const confirmBillBtn = document.getElementById('confirm-bill-btn');
    const btnBar = document.getElementById('bar-request-bill-btn');

    if (sessionId && !sessionStatusListenerAttached) {
        sessionStatusListenerAttached = true;
        db.ref('sessions/' + sessionId).on('value', snapshot => {
            const data = snapshot.val();
            const showBtn = data && data.items && data.items.length > 0;
            const isBillRequested = data && data.status === 'bill_requested';

            if (data && data.invoiceNo) {
                window.currentInvoiceNo = data.invoiceNo;
            }

            // 1. Handle Bottom Bar Button (Never disabled, allows opening modal to view/pay)
            if (btnBar) {
                btnBar.style.display = showBtn ? 'block' : 'none';
                btnBar.disabled = false;
                btnBar.style.opacity = '1';
                if (isBillRequested) {
                    btnBar.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> VIEW BILL / PAY';
                } else {
                    btnBar.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> REQUEST BILL';
                }
            }

            // 2. Handle Confirm Request Button in the modal
            if (confirmBillBtn) {
                if (isBillRequested) {
                    confirmBillBtn.disabled = true;
                    confirmBillBtn.innerHTML = '<i class="fas fa-check"></i> BILL REQUESTED';
                    confirmBillBtn.style.opacity = '0.7';
                } else {
                    confirmBillBtn.disabled = false;
                    confirmBillBtn.innerHTML = 'CONFIRM & REQUEST BILL';
                    confirmBillBtn.style.opacity = '1';
                }
            }
        });
    }
}

// watchSessionStatus function declaration removed since it is duplicate and real implementation is below

// Generates a cryptographically secure UUID for session tracking (M5 fix)
function generateSecureUUID() {
    if (typeof crypto !== 'undefined') {
        if (crypto.randomUUID) {
            return crypto.randomUUID();
        }
        if (crypto.getRandomValues) {
            return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
            );
        }
    }
    // Last resort fallback
    return 'sec-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}

function handleTableSelection() {
    const input = document.getElementById('welcome-table-no');
    const phoneInput = document.getElementById('welcome-phone');
    const nameInput = document.getElementById('welcome-name');
    const errorMsg = document.getElementById('table-error');
    const startBtn = document.getElementById('start-order-btn');

    const tableNo = parseInt(input.value).toString();
    const phone = phoneInput.value;
    const name = nameInput.value;

    const originalText = startBtn.innerHTML;

    function showTableError(msg) {
        errorMsg.innerText = msg;
        errorMsg.style.display = 'block';
        startBtn.disabled = false;
        startBtn.innerHTML = originalText;
    }

    const cleanName = sanitize(name.trim());
    const cleanPhone = phone.replace(/\D/g, '');

    if (!cleanName || cleanName.length < 2) { showTableError("Please enter a valid name"); return; }
    if (!tableNo || parseInt(tableNo) < 1) { showTableError("Please enter a valid table number"); return; }
    if (!phone || cleanPhone.length !== 10) { showTableError("Please enter a valid 10-digit mobile number"); return; }

    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> VERIFYING...';

    db.ref('settings/tableLimit').once('value').then(limitSnapshot => {
        const maxTables = parseInt(limitSnapshot.val()) || 20;
        if (parseInt(tableNo) > maxTables) {
            showTableError(`Invalid Table Number. Max is ${maxTables}.`);
            return;
        }

        const tableRef = db.ref('tables/table_' + tableNo);
        tableRef.once('value').then(snapshot => {
            const data = snapshot.val();
            if (data && data.status === 'occupied' && data.sessionId !== localStorage.getItem('caferesto_session')) {
                const occupantName = data.customerName || 'GUEST';
                showTableError(`Table ${tableNo} is occupied by ${occupantName}.`);
                startBtn.disabled = false;
                startBtn.innerHTML = originalText;
            } else {
                const newSessionId = (data && data.sessionId) ? data.sessionId : generateSecureUUID();
                
                const proceedSessionInit = () => {
                    const sessionInit = {
                        tableNo, customerName: cleanName, customerPhone: cleanPhone,
                        status: 'active', startTime: Date.now(), total: 0, subtotal: 0, items: []
                    };
                    // Invoice number is NOT assigned here — it will be assigned on first order
                    // to prevent wasting invoice numbers on sessions with no orders.

                    db.ref('sessions/' + newSessionId).set(sessionInit).then(() => {
                        tableRef.update({
                            status: 'occupied', sessionId: newSessionId,
                            timestamp: Date.now(), customerName: cleanName, customerPhone: cleanPhone
                        }).then(() => {
                            currentTable = tableNo; sessionId = newSessionId;
                            window.customerPhone = cleanPhone; window.customerName = cleanName;
                            localStorage.setItem('caferesto_table', currentTable);
                            localStorage.setItem('caferesto_session', sessionId);
                            localStorage.setItem('caferesto_phone', cleanPhone);
                            localStorage.setItem('caferesto_name', cleanName);
                            document.getElementById('welcome-modal').classList.remove('active');
                            if (bottomBar) bottomBar.classList.add('active');
                            watchSessionStatus();
                            watchCustomerOrders();

                            // --- Customer Directory: Upsert by phone ---
                            const customerKey = cleanPhone.replace(/\D/g, '');
                            if (customerKey.length >= 10) {
                                db.ref('customers/' + customerKey).transaction(current => {
                                    if (current) {
                                        current.name = cleanName;
                                        current.visits = (current.visits || 0) + 1;
                                        current.lastVisit = Date.now();
                                        return current;
                                    }
                                    return {
                                        name: cleanName,
                                        phone: customerKey,
                                        visits: 1,
                                        totalSpent: 0,
                                        firstVisit: Date.now(),
                                        lastVisit: Date.now()
                                    };
                                });
                            }
                        });
                    });
                };

                proceedSessionInit();
            }
        });
    });
}

function watchSessionStatus() {
    if (!currentTable || !sessionId) return;
    updateRequestBillVisibility();
    const tableRef = db.ref('tables/table_' + currentTable);
    tableRef.on('value', snapshot => {
        const data = snapshot.val();
        if (!data || data.status !== 'occupied' || data.sessionId !== sessionId) {
            tableRef.off();
            showToast('Session ended. Refreshing...', 'info');
            ['caferesto_table', 'caferesto_session', 'caferesto_phone', 'caferesto_name']
                .forEach(k => localStorage.removeItem(k));
            setTimeout(() => window.location.reload(), 1500);
        }
    });
}

window.addToCart = (id, displayName, price, variant = null) => {
    const cartId = variant ? `${id}-${variant}` : id;
    const existing = cart.find(item => item.cartId === cartId);
    if (existing) existing.quantity += 1;
    else cart.push({ id, cartId, name: displayName, price, quantity: 1, variant });
    updateCartUI();
    showToast(`Added ${displayName}`, 'success');
    // Bounce the cart counter
    if (cartCount) {
        cartCount.classList.remove('bounce');
        void cartCount.offsetWidth; // force reflow
        cartCount.classList.add('bounce');
    }
};

function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.className = 'toast'; // reset classes
    if (type) toast.classList.add(type);
    toast.querySelector('span').innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function showOrderSuccess() {
    const el = document.createElement('div');
    el.className = 'order-success-toast';
    el.innerHTML = '<i class="fas fa-check-circle"></i> Order placed successfully!';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function renderCart() {
    cartItemsList.innerHTML = '';
    let total = 0;
    if (cart.length === 0) {
        cartItemsList.innerHTML = '<p style="text-align: center; opacity: 0.5;">Your cart is empty.</p>';
        cartTotal.innerText = '₹0';
        return;
    }
    cart.forEach((item, index) => {
        total += item.price * item.quantity;
        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item';
        itemEl.innerHTML = `
            <div><div style="font-weight: 700">${item.name}</div><div style="font-size: 0.8rem; opacity: 0.6;">₹${item.price}</div></div>
            <div class="cart-item-qty">
                <button class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
                <span>${item.quantity}</span>
                <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
            </div>
        `;
        cartItemsList.appendChild(itemEl);
    });
    cartTotal.innerText = `₹${total}`;
}

window.updateQty = (index, delta) => {
    cart[index].quantity += delta;
    if (cart[index].quantity <= 0) cart.splice(index, 1);
    renderCart();
    updateCartUI();
};

function updateCartUI() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (cartCount) cartCount.innerText = totalItems;
    if (cartTotalBar) cartTotalBar.innerText = `₹${totalPrice}`;
}

// Helper to verify item price against real-time menu data to prevent manipulation (C2 fix)
function getVerifiedPrice(itemId, variantName) {
    if (menuData && menuData[itemId]) {
        const menuItem = menuData[itemId];
        if (variantName && menuItem.variants) {
            const variant = menuItem.variants.find(v => v.name === variantName);
            return variant ? parseFloat(variant.price) : null;
        }
        return menuItem.price !== undefined ? parseFloat(menuItem.price) : null;
    }
    if (offersData && offersData[itemId]) {
        return offersData[itemId].price !== undefined ? parseFloat(offersData[itemId].price) : null;
    }
    return null;
}

function placeOrder() {
    // Security Restriction: Block orders placed from local host / local files
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.hostname === '::1' || 
                        window.location.protocol === 'file:';
    
    if (isLocalhost) {
        showToast("⚠️ Ordering is disabled from local environments. Please use the live site.", "warning");
        alert("Security Alert:\nOrdering is restricted to the official live website. Orders cannot be submitted from a local environment (localhost).");
        return;
    }

    if (isProcessingOrder || cart.length === 0) return;
    isProcessingOrder = true;
    const originalBtn = placeOrderBtn.innerHTML;
    placeOrderBtn.disabled = true;
    placeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PLACING...';

    // Verify and sanitize all cart item prices against Firebase menuData (C2 fix)
    if (!menuData) {
        showToast("⚠️ Menu is loading. Please wait a moment.", "warning");
        placeOrderBtn.disabled = false;
        placeOrderBtn.innerHTML = originalBtn;
        isProcessingOrder = false;
        return;
    }

    let verificationFailed = false;
    const verifiedCart = [];

    for (const item of cart) {
        const verifiedPrice = getVerifiedPrice(item.id, item.variant);
        if (verifiedPrice === null) {
            verificationFailed = true;
            break;
        }
        verifiedCart.push({
            ...item,
            price: verifiedPrice
        });
    }

    if (verificationFailed) {
        showToast("⚠️ Price verification failed. Item metadata mismatch. Please reload.", "error");
        placeOrderBtn.disabled = false;
        placeOrderBtn.innerHTML = originalBtn;
        isProcessingOrder = false;
        return;
    }

    // --- Lazy invoice assignment: assign invoice number on first order ---
    const pushOrderWithInvoice = (invoiceNo) => {
        const order = {
            tableNo: currentTable, items: verifiedCart, timestamp: Date.now(),
            status: 'pending', sessionId, customerPhone: window.customerPhone,
            invoiceNo: invoiceNo || sessionId.substr(-6).toUpperCase(),
            comment: document.getElementById('order-comment') ? document.getElementById('order-comment').value.trim() : ""
        };

        db.ref('orders').push(order).then(() => {
            const sessionRef = db.ref('sessions/' + sessionId);
            sessionRef.transaction(currentData => {
                if (!currentData) return currentData;
                
                const existingItems = currentData.items || [];
                verifiedCart.forEach(c => {
                    const found = existingItems.find(i => i.cartId === c.cartId);
                    if (found) {
                        found.quantity += c.quantity;
                        found.price = c.price; // Keep price updated and verified
                    } else {
                        existingItems.push(c);
                    }
                });
                
                const newSubtotal = existingItems.reduce((s, i) => s + (i.price * i.quantity), 0);
                let newTotal = newSubtotal;
                if (currentData.modifiers && Array.isArray(currentData.modifiers)) {
                    currentData.modifiers.forEach(mod => {
                        const amount = mod.isPercentage ? (newSubtotal * (mod.value / 100)) : mod.value;
                        if (mod.type === 'discount') newTotal -= amount;
                        else newTotal += amount;
                    });
                }
                newTotal = Math.max(0, Math.round(newTotal));
                
                currentData.items = existingItems;
                currentData.subtotal = newSubtotal;
                currentData.total = newTotal;
                currentData.lastOrderTime = Date.now();
                // Assign invoice number to session if not already set
                if (!currentData.invoiceNo && invoiceNo) {
                    currentData.invoiceNo = invoiceNo;
                }
                
                return currentData;
            }, (error, committed, snapshot) => {
                if (error) {
                    console.error("Session update transaction failed:", error);
                    showToast("Order transaction failed. Please retry.", "error");
                    placeOrderBtn.disabled = false;
                    placeOrderBtn.innerHTML = originalBtn;
                    isProcessingOrder = false;
                } else if (!committed) {
                    console.error("Session update transaction aborted.");
                    showToast("Order placement aborted. Please retry.", "error");
                    placeOrderBtn.disabled = false;
                    placeOrderBtn.innerHTML = originalBtn;
                    isProcessingOrder = false;
                } else {
                    showOrderSuccess();
                    cart = [];
                    updateCartUI();
                    cartModal.classList.remove('active');
                    placeOrderBtn.disabled = false;
                    placeOrderBtn.innerHTML = originalBtn;
                    isProcessingOrder = false;
                }
            });
        });
    };

    // Check if session already has an invoice number
    db.ref('sessions/' + sessionId + '/invoiceNo').once('value').then(snap => {
        const existingInvoice = snap.val();
        if (existingInvoice) {
            pushOrderWithInvoice(existingInvoice);
        } else {
            // First order — assign invoice number now
            db.ref('settings/lastInvoiceNo').transaction(currentVal => {
                return (currentVal === null || currentVal === undefined) ? 1000 : currentVal + 1;
            }, (error, committed, snapshot) => {
                const newInvoice = (committed && snapshot) ? snapshot.val() : null;
                pushOrderWithInvoice(newInvoice);
            });
        }
    });
}

function requestBill() {
    if (!sessionId) return;
    const btn = document.getElementById('confirm-bill-btn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REQUESTING...';
    }

    if (confirm('Are you sure you want to request the bill? You will not be able to add more items.')) {
        const updates = { status: 'bill_requested', billRequestedAt: Date.now() };
        db.ref('sessions/' + sessionId).update(updates)
            .then(() => {
                showToast('Bill requested! 🧾', 'success');
                document.getElementById('bill-summary-modal').classList.remove('active');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            }).catch(err => {
                console.error("Bill request failed:", err);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            });
    } else {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

function openBillSummary() {
    if (!sessionId) return;
    renderBillSummary();
    document.getElementById('bill-summary-modal').classList.add('active');
    // Also close cart modal if open
    cartModal.classList.remove('active');
}

function renderBillSummary() {
    const billItemsList = document.getElementById('bill-items-list');
    const billTotalEl = document.getElementById('bill-summary-total');
    
    billItemsList.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-circle-notch fa-spin"></i></div>';

    db.ref('sessions/' + sessionId).once('value').then(snapshot => {
        const data = snapshot.val();
        if (!data || !data.items || data.items.length === 0) {
            billItemsList.innerHTML = '<p style="text-align: center; opacity: 0.5;">No items ordered yet.</p>';
            billTotalEl.innerText = '₹0';
            return;
        }

        billItemsList.innerHTML = '';
        data.items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'cart-item';
            itemEl.style.padding = '0.8rem 0';
            itemEl.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            itemEl.innerHTML = `
                <div>
                    <div style="font-weight: 700">${item.name}</div>
                    <div style="font-size: 0.8rem; opacity: 0.6;">₹${item.price} x ${item.quantity}</div>
                </div>
                <div style="font-weight: 800; color: white;">₹${item.price * item.quantity}</div>
            `;
            billItemsList.appendChild(itemEl);
        });

        // Add Modifiers if any
        if (data.modifiers && data.modifiers.length > 0) {
            data.modifiers.forEach(mod => {
                const calculatedAmt = mod.isPercentage ? (data.subtotal * (mod.value / 100)) : mod.value;
                const sign = mod.type === 'discount' ? '-' : '+';
                const modEl = document.createElement('div');
                modEl.className = 'cart-item';
                modEl.style.padding = '0.5rem 0';
                modEl.style.fontSize = '0.85rem';
                modEl.style.color = mod.type === 'discount' ? 'var(--accent-starter)' : 'var(--primary)';
                modEl.innerHTML = `
                    <div>${mod.label} ${mod.isPercentage ? `(${mod.value}%)` : ''}</div>
                    <div style="font-weight: 700;">${sign}₹${Math.round(calculatedAmt)}</div>
                `;
                billItemsList.appendChild(modEl);
            });
        }

        billTotalEl.innerText = `₹${data.total || 0}`;
    });
}

let lastWaiterCallTime = 0;
window.callWaiter = () => {
    if (!sessionId) return;
    const now = Date.now();
    if (now - lastWaiterCallTime < 30000) {
        showToast("Please wait a moment before calling the waiter again.", "warning");
        return;
    }
    
    db.ref('waiter_calls').orderByChild('sessionId').equalTo(sessionId).once('value').then(snapshot => {
        if (snapshot.exists()) {
            const calls = Object.values(snapshot.val());
            const hasPending = calls.some(c => c.status === 'pending');
            if (hasPending) {
                showToast("Waiter has already been notified.", "info");
                return;
            }
        }
        
        lastWaiterCallTime = now;
        firebase.database().ref('waiter_calls').push({
            tableNo: currentTable, customerName: window.customerName,
            timestamp: Date.now(), status: 'pending', sessionId
        }).then(() => showToast("Waiter called!"));
    });
};

// --- Connection Optimization ---
// Automatically disconnects from Firebase when the tab is hidden to save connections.
// Debounced by 3 seconds to prevent rapid reconnect loops in preview/development environments.
let _appConnectionTimeout = null;
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        clearTimeout(_appConnectionTimeout);
        _appConnectionTimeout = setTimeout(() => {
            console.log('[Firebase] User Tab hidden. Conserving connections...');
            firebase.database().goOffline();

        }, 3000);
    } else {
        clearTimeout(_appConnectionTimeout);
        console.log('[Firebase] User Tab active. Restoring connections...');
        firebase.database().goOnline();

    }
});

// --- Real-time Order Tracking & Notifications ---
let ordersListenerAttached = false;
let previousItemsState = {};

function watchCustomerOrders() {
    if (!sessionId || ordersListenerAttached) return;
    ordersListenerAttached = true;
    
    const statusBtn = document.getElementById('bar-order-status-btn');
    
    db.ref('orders').orderByChild('sessionId').equalTo(sessionId).on('value', snapshot => {
        const orders = snapshot.val();
        if (!orders) {
            if (statusBtn) statusBtn.style.display = 'none';
            previousItemsState = {};
            return;
        }
        
        const myOrders = Object.entries(orders)
            .map(([id, o]) => ({ id, ...o }));
            
        if (myOrders.length > 0) {
            if (statusBtn) statusBtn.style.display = 'block';
        } else {
            if (statusBtn) statusBtn.style.display = 'none';
        }
        
        // Track state transitions to notify customer
        myOrders.forEach(order => {
            const orderId = order.id;
            const status = order.status || 'pending';
            
            // If previous status was 'pending' and now is 'prepared', notify!
            if (previousItemsState[orderId] === 'pending' && status === 'prepared') {
                const itemNames = (order.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ');
                triggerPreparedNotification(itemNames);
            }
            
            previousItemsState[orderId] = status;
        });
    });
}

// Audio notification — reuses a single AudioContext to prevent resource leaks (M7 fix)
let _appAudioCtx = null;
function getAppAudioCtx() {
    if (!_appAudioCtx || _appAudioCtx.state === 'closed') {
        _appAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_appAudioCtx.state === 'suspended') _appAudioCtx.resume();
    return _appAudioCtx;
}

function triggerPreparedNotification(itemNames) {
    // Show a beautiful glowing green toast
    showToast(`Order Ready! 🍽️ ${itemNames}`, 'success');
    
    // Play a soft, beautiful chime sound
    try {
        const ctx = getAppAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        // F5 (698.46 Hz) followed by A5 (880.00 Hz) - a lovely chime
        osc.type = 'sine';
        osc.frequency.value = 698.46;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
        
        setTimeout(() => {
            try {
                const ctx2 = getAppAudioCtx();
                const osc2 = ctx2.createOscillator();
                const gain2 = ctx2.createGain();
                osc2.connect(gain2);
                gain2.connect(ctx2.destination);
                osc2.type = 'sine';
                osc2.frequency.value = 880.00;
                gain2.gain.setValueAtTime(0.15, ctx2.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.01, ctx2.currentTime + 0.8);
                osc2.start();
                osc2.stop(ctx2.currentTime + 0.8);
            } catch (err) {
                console.log("Sub-Audio context notification failed:", err);
            }
        }, 150);
    } catch (e) {
        console.log("Audio notification failed to play:", e);
    }
}

init();
