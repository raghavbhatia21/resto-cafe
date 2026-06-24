let localMenu = {};
let localOffers = {};
let localCategories = {};
let currentTab = 'menu';
let activeCategoryFilter = 'all';
let menuSearchQuery = '';

// Auth Guard
firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        const email = user.email || '';
        if (!email) {
            showAccessDenied("Your account email is missing. Please contact the administrator.");
            return;
        }
        const emailKey = email.toLowerCase().replace(/\./g, '_');
        
        // Fallback Timeout: Remove cloak after 4 seconds if database check hangs (e.g. API key block or offline)
        const fallbackTimeout = setTimeout(() => {
            const cloak = document.getElementById('auth-cloak');
            if (cloak) {
                console.warn("Database whitelist check timed out. Removing cloak.");
                cloak.remove();
            }
        }, 4000);

        firebase.database().ref('settings_private/superAdminEmail').once('value').then(emailSnap => {
            clearTimeout(fallbackTimeout);
            const superAdminEmail = emailSnap.val() ? emailSnap.val().toLowerCase() : '';
            const userEmail = email.toLowerCase();
            
            if (userEmail === superAdminEmail || userEmail === 'raghavbhatia332@gmail.com') {
                document.getElementById('auth-cloak')?.remove();
                init();
            } else {
                // Live check whitelisted status
                firebase.database().ref(`settings_private/staff/${emailKey}`).on('value', staffSnap => {
                    if (staffSnap.exists()) {
                        document.getElementById('auth-cloak')?.remove();
                        if (!window.isInitialized) {
                            window.isInitialized = true;
                            init();
                        }
                    } else {
                        showAccessDenied("Your staff authorization has been revoked.");
                    }
                }, error => {
                    console.error("Staff whitelist listener failed:", error);
                    showAccessDenied("Database access denied. Please verify your permissions.");
                });
            }
        }).catch(err => {
            clearTimeout(fallbackTimeout);
            console.error("Auth validation failed:", err);
            showAccessDenied("Failed to verify authorization credentials.");
        });
    }
});

function showAccessDenied(message) {
    document.getElementById('auth-cloak')?.remove();
    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #020205; color: white; font-family: 'Outfit', sans-serif; text-align: center; padding: 2rem;">
            <div class="glass" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); padding: 3rem; border-radius: 24px; max-width: 450px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                <div style="font-size: 4rem; color: #ff4b2b; margin-bottom: 1.5rem;"><i class="fas fa-exclamation-triangle"></i></div>
                <h2 style="font-weight: 800; margin-bottom: 1rem; font-size: 1.8rem; letter-spacing: -0.5px;">ACCESS DENIED</h2>
                <p style="color: #888899; margin-bottom: 2rem; line-height: 1.5; font-size: 0.95rem;">${message}</p>
                <div style="font-size: 0.85rem; color: #ff9d00; font-weight: 600;"><i class="fas fa-spinner fa-spin"></i> Redirecting to login...</div>
            </div>
        </div>
    `;
    firebase.auth().signOut().then(() => {
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 3000);
    });
}

function init() {
    loadCategories();
    watchMenu();
    watchOffers();
    watchCustomers();
    loadStoreSettings();
}

function loadStoreSettings() {
    firebase.database().ref('settings').on('value', snapshot => {
        if (snapshot.exists()) {
            const settings = snapshot.val();
            const name = settings.storeName || 'DesignE';
            document.title = `${name} | Admin Panel`;
            const logoEl = document.querySelector('.logo');
            if (logoEl) logoEl.innerText = name;
        }
    });
}

// Data Fetching
function loadCategories() {
    firebase.database().ref('categories').orderByChild('order').on('value', snapshot => {
        localCategories = snapshot.val() || {};
        renderCategories();
        updateCategorySelects();
        if (currentTab === 'menu') renderCategoryFilters();
    });
}

function watchMenu() {
    firebase.database().ref('menu').on('value', snapshot => {
        localMenu = snapshot.val() || {};
        if (currentTab === 'menu') renderMenuItems();
    });
}

function watchOffers() {
    firebase.database().ref('offers').on('value', snapshot => {
        localOffers = snapshot.val() || {};
        if (currentTab === 'offers') renderOffers();
    });
}

// Responsive Navigation
window.toggleSidebar = () => {
    document.getElementById('sidebar').classList.toggle('active');
};

window.closeSidebar = () => {
    document.getElementById('sidebar').classList.remove('active');
};

window.switchTab = (tab) => {
    currentTab = tab;
    // Update Nav UI
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    document.getElementById(`nav-${tab}`).classList.add('active');
    
    // Update Section UI
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    document.getElementById(`section-${tab}`).style.display = 'block';

    if (tab === 'menu') {
        renderCategoryFilters();
        renderMenuItems();
    }
    if (tab === 'offers') renderOffers();
    if (tab === 'customers') renderCustomers();
};

// Filtering Logic
window.handleSearch = (query) => {
    menuSearchQuery = query.toLowerCase().trim();
    renderMenuItems();
};

window.setCategoryFilter = (catId) => {
    activeCategoryFilter = catId;
    renderCategoryFilters();
    renderMenuItems();
};

function renderCategoryFilters() {
    const container = document.getElementById('category-filter-tabs');
    if (!container) return;
    
    let html = `<div class="filter-tab ${activeCategoryFilter === 'all' ? 'active' : ''}" onclick="setCategoryFilter('all')">All Items</div>`;
    
    Object.entries(localCategories).sort((a,b) => a[1].order - b[1].order).forEach(([id, cat]) => {
        html += `<div class="filter-tab ${activeCategoryFilter === id ? 'active' : ''}" onclick="setCategoryFilter('${id}')">${cat.name}</div>`;
    });
    
    container.innerHTML = html;
}

// Renderers
function renderMenuItems() {
    const grid = document.getElementById('admin-menu-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // Convert to array and handle array/object formats from Firebase
    let items = Object.entries(localMenu || {})
        .filter(([id, item]) => item && typeof item === 'object')
        .sort((a, b) => b[0].toString().localeCompare(a[0].toString())); // Newest items first

    // Apply Category Filter
    if (activeCategoryFilter !== 'all') {
        items = items.filter(([id, item]) => item.category === activeCategoryFilter);
    }

    // Apply Search Filter
    if (menuSearchQuery) {
        items = items.filter(([id, item]) => 
            item.name.toLowerCase().includes(menuSearchQuery) || 
            (item.description && item.description.toLowerCase().includes(menuSearchQuery))
        );
    }

    if (items.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-muted);">
            <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 1.5rem; opacity: 0.2;"></i>
            <p>${menuSearchQuery || activeCategoryFilter !== 'all' ? 'No items match your filters.' : 'No menu items found. Start by adding your first dish!'}</p>
        </div>`;
        return;
    }

    items.forEach(([id, item]) => {
        try {
            const catName = localCategories[item.category]?.name || item.category || 'Uncategorized';
            const card = document.createElement('div');
            card.className = 'item-card';
            card.innerHTML = `
                <div class="item-img-wrapper">
                    <img src="${sanitize(item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400')}" class="item-img" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'">
                    <div class="item-badge ${item.available ? 'badge-available' : 'badge-soldout'}">
                        ${item.available ? 'Available' : 'Sold Out'}
                    </div>
                </div>
                <div class="item-info">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <h3 style="margin:0; font-size: 1.25rem;">${sanitize(item.name) || 'Unnamed Item'}</h3>
                        ${item.dietary ? `<span class="${sanitize(item.dietary)}-badge" style="margin: 0; padding: 0.1rem 0.3rem;"></span>` : ''}
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.4rem 0;">${sanitize(catName)}</p>
                    <div class="item-details">
                        <span class="item-price">₹${item.price || 0}</span>
                    </div>
                </div>
                <div class="item-actions">
                    <button onclick="editMenuItem('${sanitize(id)}')" class="btn-action"><i class="fas fa-edit"></i> Edit</button>
                    <button onclick="deleteMenuItem('${sanitize(id)}')" class="btn-action delete"><i class="fas fa-trash"></i></button>
                </div>
            `;
            grid.appendChild(card);
        } catch (err) {
            console.error("Error rendering item:", id, err);
        }
    });
}

function renderOffers() {
    const grid = document.getElementById('admin-offers-grid');
    grid.innerHTML = '';
    
    Object.entries(localOffers).forEach(([id, offer]) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-img-wrapper">
                <img src="${sanitize(offer.image || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400')}" class="item-img">
                <div class="item-badge" style="background: var(--accent-main); color: white;">${sanitize(offer.tag || 'PROMO')}</div>
            </div>
            <div class="item-info">
                <h3 style="margin:0; font-size: 1.1rem;">${sanitize(offer.title)}</h3>
                <p style="font-size:0.8rem; color:var(--text-muted); line-height: 1.4; margin-top: 0.5rem;">${sanitize(offer.description)}</p>
            </div>
            <div class="item-actions">
                <button onclick="editOffer('${sanitize(id)}')" class="btn-action"><i class="fas fa-edit"></i> Edit</button>
                <button onclick="deleteOffer('${sanitize(id)}')" class="btn-action delete"><i class="fas fa-trash"></i></button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderCategories() {
    const list = document.getElementById('admin-categories-list');
    list.innerHTML = '';
    
    Object.entries(localCategories).sort((a,b) => a[1].order - b[1].order).forEach(([id, cat]) => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.style.flexDirection = 'row';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';
        div.style.padding = '1.5rem';
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1.5rem;">
                <span style="color: var(--primary); font-weight: 800; font-size: 1.2rem; opacity: 0.5;">#${cat.order}</span>
                <span style="font-weight: 700; font-size: 1.1rem;">${sanitize(cat.name)}</span>
                <code style="font-size: 0.75rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 0.2rem 0.5rem; border-radius: 6px;">ID: ${sanitize(id)}</code>
            </div>
            <div style="display: flex; gap: 1rem;">
                <button onclick="deleteCategory('${sanitize(id)}')" class="btn-action delete" style="padding: 0.6rem;"><i class="fas fa-times"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
}

function updateCategorySelects() {
    const select = document.getElementById('item-category');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select Category</option>';
    Object.entries(localCategories).forEach(([id, cat]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.innerText = cat.name;
        select.appendChild(opt);
    });
}

// Menu CRUD
window.openMenuModal = () => {
    document.getElementById('modal-title').innerText = 'Add Menu Item';
    document.getElementById('menu-form').reset();
    document.getElementById('edit-item-id').value = '';
    document.getElementById('item-dietary').value = '';
    document.getElementById('variants-list').innerHTML = '';
    document.getElementById('price-field-container').style.display = 'block';
    document.getElementById('menu-modal').classList.add('active');
};

window.editMenuItem = (id) => {
    const item = localMenu[id];
    document.getElementById('modal-title').innerText = 'Edit Menu Item';
    document.getElementById('edit-item-id').value = id;
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-category').value = item.category;
    document.getElementById('item-price').value = item.price || 0;
    document.getElementById('item-dietary').value = item.dietary || '';
    document.getElementById('item-image').value = item.image || '';
    document.getElementById('item-description').value = item.description || '';
    document.getElementById('item-available').checked = item.available !== false;
    
    // Fill Variants
    const variantsList = document.getElementById('variants-list');
    variantsList.innerHTML = '';
    if (item.variants && Array.isArray(item.variants)) {
        item.variants.forEach(v => addVariantField(v.name, v.price));
        document.getElementById('price-field-container').style.display = 'none';
    } else {
        document.getElementById('price-field-container').style.display = 'block';
    }
    
    document.getElementById('menu-modal').classList.add('active');
};

window.addVariantField = (name = '', price = '') => {
    const container = document.getElementById('variants-list');
    const div = document.createElement('div');
    div.className = 'variant-row';
    const vId = Date.now();
    div.innerHTML = `
        <div class="input-field">
            <label for="vname_${vId}" style="font-size: 0.7rem;">Variant Name</label>
            <input type="text" id="vname_${vId}" class="variant-name" value="${name}" placeholder="e.g. Large" required>
        </div>
        <div class="input-field">
            <label for="vprice_${vId}" style="font-size: 0.7rem;">Price (₹)</label>
            <input type="number" id="vprice_${vId}" class="variant-price" value="${price}" placeholder="120" required>
        </div>
        <button type="button" onclick="this.parentElement.remove(); checkPriceField();" class="btn-action delete" style="padding: 0.6rem; height: 44px;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
    checkPriceField();
};

window.checkPriceField = () => {
    const hasVariants = document.querySelectorAll('.variant-row').length > 0;
    document.getElementById('price-field-container').style.display = hasVariants ? 'none' : 'block';
};

window.saveMenuItem = (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('save-item-btn');
    const originalBtnText = saveBtn.innerText;
    saveBtn.innerText = 'SAVING...';
    saveBtn.disabled = true;

    const id = document.getElementById('edit-item-id').value || 'item_' + Date.now();
    
    // Collect Variants
    const variants = [];
    document.querySelectorAll('.variant-row').forEach(row => {
        const vName = row.querySelector('.variant-name').value.trim();
        const vPrice = parseFloat(row.querySelector('.variant-price').value);
        if (vName && !isNaN(vPrice)) {
            variants.push({ name: vName, price: vPrice });
        }
    });

    const data = {
        name: document.getElementById('item-name').value.trim(),
        category: document.getElementById('item-category').value,
        dietary: document.getElementById('item-dietary').value,
        price: variants.length > 0 ? variants[0].price : parseFloat(document.getElementById('item-price').value || 0),
        image: document.getElementById('item-image').value.trim(),
        description: document.getElementById('item-description').value.trim(),
        available: document.getElementById('item-available').checked,
        id: id
    };

    if (variants.length > 0) data.variants = variants;

    firebase.database().ref('menu/' + id).set(data).then(() => {
        closeModals();
        alert("Menu item saved!");
    }).catch(err => {
        console.error("Firebase Save Error:", err);
        alert("Error saving item: " + err.message);
    }).finally(() => {
        saveBtn.innerText = originalBtnText;
        saveBtn.disabled = false;
        document.getElementById('edit-item-id').value = ''; // Ensure ID is cleared
    });
};

window.deleteMenuItem = (id) => {
    if (confirm("Are you sure you want to delete this item?")) {
        firebase.database().ref('menu/' + id).remove();
    }
};

window.closeModals = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
};

// Offer CRUD exports stay similar but with better UI in render
window.openOfferModal = () => {
    document.getElementById('offer-modal-title').innerText = 'Add Offer';
    document.getElementById('offer-form').reset();
    document.getElementById('edit-offer-id').value = '';
    document.getElementById('offer-modal').classList.add('active');
};

window.editOffer = (id) => {
    const offer = localOffers[id];
    document.getElementById('offer-modal-title').innerText = 'Edit Offer';
    document.getElementById('edit-offer-id').value = id;
    document.getElementById('offer-title').value = offer.title;
    document.getElementById('offer-tag').value = offer.tag || '';
    document.getElementById('offer-price').value = offer.price || 0;
    document.getElementById('offer-image').value = offer.image || '';
    document.getElementById('offer-description').value = offer.description || '';
    document.getElementById('offer-active').checked = offer.active !== false;
    document.getElementById('offer-modal').classList.add('active');
};

window.saveOffer = (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-offer-id').value || 'offer_' + Date.now();
    const data = {
        title: document.getElementById('offer-title').value.trim(),
        tag: document.getElementById('offer-tag').value.trim(),
        price: parseFloat(document.getElementById('offer-price').value),
        image: document.getElementById('offer-image').value.trim(),
        description: document.getElementById('offer-description').value.trim(),
        active: document.getElementById('offer-active').checked,
        id: id
    };

    firebase.database().ref('offers/' + id).set(data).then(() => {
        closeModals();
        alert("Offer saved!");
    });
};

window.deleteOffer = (id) => {
    if (confirm("Are you sure you want to delete this offer?")) {
        firebase.database().ref('offers/' + id).remove();
    }
};

// Category CRUD
window.addCategory = () => {
    const name = prompt("Enter Category Name (e.g. Desserts):");
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, '_');
    const order = Object.keys(localCategories).length + 1;
    
    firebase.database().ref('categories/' + id).set({ name, order });
};

window.deleteCategory = (id) => {
    const itemsCount = Object.values(localMenu).filter(i => i.category === id).length;
    if (itemsCount > 0) {
        alert(`Cannot delete category "${id}" as it contains ${itemsCount} items. Move items to another category first.`);
        return;
    }
    if (confirm(`Delete category "${id}"?`)) {
        firebase.database().ref('categories/' + id).remove();
    }
};

// Security
window.changePassword = () => {
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    
    if (newPass !== confirmPass) {
        alert("Passwords do not match!");
        return;
    }
    if (newPass.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
    }
    
    const user = firebase.auth().currentUser;
    user.updatePassword(newPass).then(() => {
        alert("Password updated successfully!");
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
    }).catch(err => {
        alert("Error: " + err.message);
        if(err.code === 'auth/requires-recent-login') {
            alert("For security, please logout and login again to change your password.");
        }
    });
};



window.logout = () => {
    firebase.auth().signOut().then(() => window.location.href = 'login.html');
};

// --- Connection Optimization ---
// Automatically disconnects from Firebase when the tab is hidden to save connections.
// Debounced by 3 seconds to prevent rapid reconnect loops in preview/development environments.

// ================================================================
// CUSTOMER DIRECTORY
// ================================================================
let localCustomers = {};

function watchCustomers() {
    firebase.database().ref('customers').on('value', snapshot => {
        localCustomers = snapshot.val() || {};
        if (currentTab === 'customers') renderCustomers();
    });
}

window.renderCustomers = () => {
    const container = document.getElementById('customer-list-container');
    const searchQuery = (document.getElementById('customer-search')?.value || '').toLowerCase().trim();
    
    const entries = Object.entries(localCustomers)
        .filter(([key, c]) => {
            if (!searchQuery) return true;
            return (c.name || '').toLowerCase().includes(searchQuery) ||
                   (c.phone || '').includes(searchQuery);
        })
        .sort((a, b) => (b[1].lastVisit || 0) - (a[1].lastVisit || 0));

    // Calculate stats
    const allEntries = Object.values(localCustomers);
    const totalCustomers = allEntries.length;
    const totalVisits = allEntries.reduce((sum, c) => sum + (c.visits || 0), 0);
    const repeatCustomers = allEntries.filter(c => (c.visits || 0) > 1).length;
    const repeatRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;
    const totalRevenue = allEntries.reduce((sum, c) => sum + (c.totalSpent || 0), 0);

    const statEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    statEl('stat-total-customers', totalCustomers);
    statEl('stat-total-visits', totalVisits);
    statEl('stat-repeat-rate', repeatRate + '%');
    statEl('stat-customer-revenue', '\u20B9' + totalRevenue.toLocaleString());

    if (entries.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
                <i class="fas fa-${searchQuery ? 'search' : 'users'}" style="font-size: 3rem; opacity: 0.2; margin-bottom: 1rem; display: block;"></i>
                <p style="font-weight: 600;">${searchQuery ? 'No matching customers' : 'No customers yet'}</p>
                <span style="font-size: 0.85rem;">${searchQuery ? 'Try a different search term.' : 'Customer data will appear here once visitors start ordering.'}</span>
            </div>`;
        return;
    }

    container.innerHTML = entries.map(([key, c]) => {
        const lastVisitDate = c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
        const lastVisitTime = c.lastVisit ? new Date(c.lastVisit).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const firstVisitDate = c.firstVisit ? new Date(c.firstVisit).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
        const visits = c.visits || 0;
        const spent = c.totalSpent || 0;
        const isRepeat = visits > 1;

        return `
            <div class="item-card" style="padding: 1.25rem 1.5rem; margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                <div style="display: flex; align-items: center; gap: 1.25rem; flex: 1; min-width: 200px;">
                    <div style="width: 48px; height: 48px; border-radius: 14px; background: ${isRepeat ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(255, 107, 107, 0.15))' : 'rgba(255,255,255,0.05)'}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.2rem; color: ${isRepeat ? 'var(--primary)' : 'var(--text-muted)'}; flex-shrink: 0;">
                        ${sanitize((c.name || '?')[0].toUpperCase())}
                    </div>
                    <div>
                        <div style="font-weight: 700; font-size: 1.05rem; color: white; margin-bottom: 0.2rem;">
                            ${sanitize(c.name || 'Unknown')}
                            ${isRepeat ? '<span style="font-size: 0.6rem; background: rgba(245, 158, 11, 0.15); color: var(--primary); padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 800; margin-left: 0.5rem; vertical-align: middle;">REPEAT</span>' : ''}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 1rem; flex-wrap: wrap;">
                            <span><i class="fas fa-phone" style="opacity: 0.5; margin-right: 0.3rem;"></i>${sanitize(c.phone || '--')}</span>
                            <span><i class="fas fa-calendar" style="opacity: 0.5; margin-right: 0.3rem;"></i>Since ${firstVisitDate}</span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 2rem; flex-wrap: wrap;">
                    <div style="text-align: center; min-width: 60px;">
                        <div style="font-size: 1.3rem; font-weight: 800; color: var(--secondary-glow);">${visits}</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Visits</div>
                    </div>
                    <div style="text-align: center; min-width: 80px;">
                        <div style="font-size: 1.3rem; font-weight: 800; color: #10b981;">\u20B9${spent.toLocaleString()}</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Spent</div>
                    </div>
                    <div style="text-align: center; min-width: 90px;">
                        <div style="font-size: 0.85rem; font-weight: 600; color: white;">${lastVisitDate}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted);">${lastVisitTime}</div>
                    </div>
                    <button onclick="deleteCustomer('${key}')" class="add-btn" style="width: auto; padding: 0.6rem 0.9rem; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); font-size: 0.8rem;" title="Delete customer">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>`;
    }).join('');
};

window.deleteCustomer = (key) => {
    const c = localCustomers[key];
    const displayName = c ? sanitize(c.name || 'this customer') : 'this customer';
    if (confirm(`Delete customer "${displayName}" from the directory? This cannot be undone.`)) {
        firebase.database().ref('customers/' + key).remove()
            .then(() => alert('Customer removed successfully.'))
            .catch(err => alert('Failed to delete: ' + err.message));
    }
};

window.exportCustomersCSV = () => {
    const entries = Object.entries(localCustomers);
    if (entries.length === 0) {
        alert('No customer data to export.');
        return;
    }

    const headers = ['Name', 'Phone', 'Visits', 'Total Spent (INR)', 'First Visit', 'Last Visit'];
    const rows = entries
        .sort((a, b) => (b[1].lastVisit || 0) - (a[1].lastVisit || 0))
        .map(([key, c]) => [
            '"' + (c.name || '').replace(/"/g, '""') + '"',
            c.phone || '',
            c.visits || 0,
            c.totalSpent || 0,
            c.firstVisit ? new Date(c.firstVisit).toLocaleDateString('en-IN') : '',
            c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('en-IN') : ''
        ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

// ================================================================
// CONNECTION MANAGEMENT
// ================================================================
let _adminConnectionTimeout = null;
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        clearTimeout(_adminConnectionTimeout);
        _adminConnectionTimeout = setTimeout(() => {
            console.log('[Firebase] Admin Tab hidden. Conserving connections...');
            firebase.database().goOffline();
            if (typeof saasDb !== 'undefined') saasDb.goOffline();
        }, 3000);
    } else {
        clearTimeout(_adminConnectionTimeout);
        console.log('[Firebase] Admin Tab active. Restoring connections...');
        firebase.database().goOnline();
        if (typeof saasDb !== 'undefined') saasDb.goOnline();
    }
});
