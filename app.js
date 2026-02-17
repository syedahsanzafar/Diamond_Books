
// State Management
const STATE = {
    currentUser: null,
    users: JSON.parse(localStorage.getItem('khata_users')) || [
        { id: 1, name: 'Masroor Anwar' },
        { id: 2, name: 'Mansoor Anwar' }
    ],
    // Default to first user if none set
    currentUser: JSON.parse(localStorage.getItem('khata_current_user')) || { id: 1, name: 'Masroor Anwar' },
    customers: JSON.parse(localStorage.getItem('khata_customers')) || [],
    transactions: JSON.parse(localStorage.getItem('khata_transactions')) || [],
    categories: JSON.parse(localStorage.getItem('khata_categories')) || ['Goods', 'Cash Loan', 'Service', 'Payment'],
    currentView: 'customers', // dashboard, customers (home), customer-detail, settings
    selectedCustomerId: null,
    dashboardFilter: '30d' // 30d, 3m, 6m, 1y
};

// DOM Elements
const elements = {
    app: document.getElementById('app'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalContent: document.getElementById('modal-content'),
    views: {
        dashboard: document.getElementById('view-dashboard'),
        customers: document.getElementById('view-customers'),
        customerDetail: document.getElementById('view-customer-detail'),
        settings: document.getElementById('view-settings')
    }
};

// Utils
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
        minimumFractionDigits: 0
    }).format(amount);
};

const toTitleCase = (str) => {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
};

const renderHeader = () => {
    const userOptions = STATE.users.map(u =>
        `<option value="${u.id}" ${STATE.currentUser && STATE.currentUser.id === u.id ? 'selected' : ''}>${u.name}</option>`
    ).join('');

    document.getElementById('header-content').innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
            <img src="logo.png" alt="Logo" style="height: 32px; width: auto; object-fit: contain;">
            <span style="font-weight: 700; font-size: 1.2rem;">Cash Book</span>
            <select onchange="app.switchUser(this.value)" style="background: transparent; color: inherit; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 2px; font-family: inherit; margin-left: auto;">
                ${userOptions}
            </select>
        </div>
    `;
};

const switchUser = (id) => {
    STATE.currentUser = STATE.users.find(u => u.id == id);
    renderHeader();
};


const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

const saveState = () => {
    localStorage.setItem('khata_users', JSON.stringify(STATE.users));
    localStorage.setItem('khata_customers', JSON.stringify(STATE.customers));
    localStorage.setItem('khata_transactions', JSON.stringify(STATE.transactions));
    localStorage.setItem('khata_categories', JSON.stringify(STATE.categories));
    localStorage.setItem('khata_current_user', JSON.stringify(STATE.currentUser));
};

// Navigation
const navigate = (viewId) => {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');

    // Update bottom nav
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navItem = document.getElementById(`nav-${viewId}`);
    if (navItem) navItem.classList.add('active');

    STATE.currentView = viewId;

    if (viewId === 'dashboard') renderDashboard();
    if (viewId === 'customers') renderCustomers();
};

// Modals
const showModal = (content) => {
    elements.modalContent.innerHTML = content;
    elements.modalOverlay.classList.add('active');
};
const closeModal = () => {
    elements.modalOverlay.classList.remove('active');
};

// Core Logic

const calculateBalance = (customer) => {
    if (!customer) return 0;
    return STATE.transactions.reduce((acc, t) => {
        if (t.customerId === customer.id) {
            return t.type === 'credit' ? acc - t.amount : acc + t.amount; // Negative implies they owe us
        }
        return acc;
    }, 0);
};

const addCustomer = (name, mobile, nic) => {
    const newCustomer = {
        id: generateId(),
        name,
        mobile,
        nic,
        createdAt: new Date().toISOString()
    };
    STATE.customers.push(newCustomer);
    saveState();
    navigate('customers');
};

const addTransaction = (customerId, amount, type, note, category = 'General') => {
    const customer = STATE.customers.find(c => c.id === customerId);
    if (!customer) return;

    const transaction = {
        id: generateId(),
        customerId,
        date: new Date().toISOString(),
        amount: parseFloat(amount),
        type, // 'credit' (gave money/goods) or 'payment' (received money)
        note,
        category,
        userId: STATE.currentUser ? STATE.currentUser.id : 1
    };

    STATE.transactions.push(transaction);
    saveState();
    renderCustomerDetail(customerId);
};

// Dashboard Helpers
const getDateThreshold = (filter) => {
    const now = new Date();
    if (filter === '30d') return new Date(now.setDate(now.getDate() - 30));
    if (filter === '3m') return new Date(now.setMonth(now.getMonth() - 3));
    if (filter === '6m') return new Date(now.setMonth(now.getMonth() - 6));
    if (filter === '1y') return new Date(now.setFullYear(now.getFullYear() - 1));
    return new Date(0); // All time
};

const calculateCashFlow = () => {
    const threshold = getDateThreshold(STATE.dashboardFilter);
    let cashIn = 0;
    let cashOut = 0;

    STATE.transactions.forEach(t => {
        if (new Date(t.date) >= threshold) {
            if (t.type === 'payment') cashIn += t.amount;
            if (t.type === 'credit') cashOut += t.amount;
        }
    });
    return { cashIn, cashOut };
};

const getRecentTransactions = (limit = 10) => {
    let allTx = [];
    STATE.transactions.forEach(t => {
        const customer = STATE.customers.find(c => c.id === t.customerId);
        allTx.push({ ...t, customerName: customer ? customer.name : 'N/A' });
    });
    return allTx.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
};

const getOldestCredits = (limit = 5) => {
    // Filter customers with negative balance (they owe us)
    const debtors = STATE.customers.filter(c => calculateBalance(c) < 0);

    // Sort by last transaction date (oldest first)? Or just show them.
    // Let's sort by last transaction date ascending (inactive for longest)
    debtors.sort((a, b) => {
        const lastTxA = STATE.transactions.filter(t => t.customerId === a.id).sort((x, y) => new Date(y.date) - new Date(x.date))[0];
        const lastTxB = STATE.transactions.filter(t => t.customerId === b.id).sort((x, y) => new Date(y.date) - new Date(x.date))[0];
        const lastDateA = lastTxA ? new Date(lastTxA.date) : new Date(0);
        const lastDateB = lastTxB ? new Date(lastTxB.date) : new Date(0);
        return lastDateA - lastDateB;
    });

    return debtors.slice(0, limit);
};

// Rendering

const renderDashboard = () => {
    // Render Filter Tabs
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(t => {
        t.classList.remove('active');
        if (t.dataset.filter === STATE.dashboardFilter) {
            t.classList.add('active');
        }
    });

    // Render Summary
    const { cashIn, cashOut } = calculateCashFlow();
    document.getElementById('summary-in').innerText = formatCurrency(cashIn);
    document.getElementById('summary-out').innerText = formatCurrency(cashOut);

    // Render Recent Transactions
    const recent = getRecentTransactions();
    const tbody = document.getElementById('recent-transactions-body');
    if (tbody) {
        tbody.innerHTML = recent.length ? recent.map(t => `
            <tr>
                <td>${new Date(t.date).toLocaleDateString()}</td>
                <td>${toTitleCase(t.customerName)}</td>
                <td class="${t.type === 'payment' ? 'text-success' : 'text-danger'}">${formatCurrency(t.amount)}</td>
                <td>${t.category || t.note || '-'}</td>
                <td><span class="tag ${t.type === 'payment' ? 'in' : 'out'}">${t.type === 'payment' ? 'In' : 'Out'}</span></td>
            </tr>
        `).join('') : '<tr><td colspan="5" style="text-align:center; padding: 2rem;">No recent transactions</td></tr>';
    }

    // Render Older Credits
    const older = getOldestCredits();
    const olderList = document.getElementById('older-credits-list');
    if (olderList) {
        olderList.innerHTML = older.length ? older.map(c => {
            const bal = calculateBalance(c);
            const customerTransactions = STATE.transactions.filter(t => t.customerId === c.id);
            const lastTxDate = customerTransactions.length ? new Date(customerTransactions.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date) : new Date();
            const daysAgo = Math.floor((new Date() - lastTxDate) / (1000 * 60 * 60 * 24));

            return `
            <div class="customer-item" onclick="app.viewCustomer('${c.id}')">
                <div class="customer-info">
                    <h3>${toTitleCase(c.name)} <span class="older-days">${daysAgo} days ago</span></h3>
                    <p>${c.mobile || 'No Mobile'}</p>
                </div>
                <div style="text-align: right;">
                    <div class="balance negative">${formatCurrency(Math.abs(bal))}</div>
                    <div class="text-sm text-muted">Receivable</div>
                </div>
            </div>
            `;
        }).join('') : '<div style="padding:1rem; text-align:center; color: var(--text-secondary);">No pending credits found.</div>';
    }
};

const renderCustomers = () => {
    const totalReceivable = STATE.customers.reduce((acc, c) => {
        const bal = calculateBalance(c);
        return bal < 0 ? acc + Math.abs(bal) : acc;
    }, 0);

    const customerListHTML = STATE.customers.length === 0
        ? `<div class="empty-state">
            <div class="empty-icon">👥</div>
            <h3>No Customers Yet</h3>
            <p>Add your first customer to start tracking credit.</p>
           </div>`
        : STATE.customers.map(c => {
            const bal = calculateBalance(c);
            const balanceClass = bal < 0 ? 'negative' : (bal > 0 ? 'positive' : 'text-muted');
            const balanceText = bal === 0 ? 'Settled' : formatCurrency(Math.abs(bal));
            const statusLabel = bal < 0 ? 'Receivable' : (bal > 0 ? 'Advance' : '');

            return `
            <div class="customer-item" onclick="app.viewCustomer('${c.id}')">
                <div class="customer-info">
                    <h3>${toTitleCase(c.name)}</h3>
                    <p>${c.mobile || 'No Mobile'}</p>
                </div>
                <div style="text-align: right;">
                    <div class="balance ${balanceClass}">${balanceText}</div>
                    <div class="text-sm text-muted">${statusLabel}</div>
                </div>
            </div>
            `;
        }).join('');

    document.getElementById('customer-list').innerHTML = customerListHTML;
};

const renderCustomerDetail = (id) => {
    const customer = STATE.customers.find(c => c.id === id);
    if (!customer) return navigate('dashboard');
    STATE.selectedCustomerId = id;

    const balance = calculateBalance(customer);
    const balanceClass = balance < 0 ? 'negative' : (balance > 0 ? 'positive' : 'text-muted');
    const balanceLabel = balance < 0 ? 'They Owe You' : (balance > 0 ? 'You Owe Them' : 'Settled');

    const customerTransactions = STATE.transactions.filter(t => t.customerId === customer.id);

    const transactionsHTML = customerTransactions.slice().reverse().map(t => {
        const isCredit = t.type === 'credit'; // We gave them goods/credit (Receivable increases)
        const colorClass = isCredit ? 'negative' : 'positive';
        const sign = isCredit ? 'OUT' : 'IN';
        return `
        <div class="transaction-item">
            <div>
                <div class="transaction-desc">${t.note || t.category || (isCredit ? 'Credit Given' : 'Payment Received')}</div>
                <div class="transaction-date">${new Date(t.date).toLocaleDateString()} ${new Date(t.date).toLocaleTimeString()}</div>
            </div>
            <div class="transaction-amount ${colorClass}">
                ${isCredit ? '-' : '+'}${formatCurrency(t.amount)}
            </div>
        </div>
        `;
    }).join('');

    document.getElementById('detail-header').innerHTML = `
        <button onclick="app.navigate('customers')" style="background:none; border:none; color:white; font-size:1.5rem; margin-right:1rem;">←</button>
        <div>
            <h2 style="font-size: 1.1rem; margin-bottom: 0;">${toTitleCase(customer.name)}</h2>
            <p class="text-sm text-muted">${customer.mobile || 'No Mobile'}</p>
        </div>
    `;

    document.getElementById('detail-content').innerHTML = `
        <div class="card" style="text-align: center; margin-top: 1rem;">
            <div class="text-sm text-muted">${balanceLabel}</div>
            <h1 class="balance ${balanceClass}" style="font-size: 2.5rem; margin: 0.5rem 0;">${formatCurrency(Math.abs(balance))}</h1>
            <div class="flex-row" style="margin-top: 1rem;">
                <button class="btn btn-danger flex-1" onclick="app.showTransactionModal('credit')">
                    Made Sale (Credit)
                </button>
                <button class="btn btn-success flex-1" onclick="app.showTransactionModal('payment')">
                    Received Payment
                </button>
            </div>
        </div>

        <h3 style="margin: 1.5rem 0 0.5rem 0; padding: 0 0.5rem; font-size: 1rem;">Transaction History</h3>
        <div class="card" style="padding: 0;">
            ${transactionsHTML || '<div class="empty-state" style="padding: 2rem;"><p>No transactions yet.</p></div>'}
        </div>
    `;

    navigate('customer-detail');
};


// Public API for HTML interactions
window.app = {
    navigate,
    viewCustomer: (id) => renderCustomerDetail(id),

    showAddCustomerModal: () => {
        showModal(`
            <div class="modal-header">
                <h2>Add Customer</h2>
                <button class="modal-close" onclick="closeModal()">×</button>
            </div>
            <form onsubmit="app.handleAddCustomer(event)">
                <div class="form-group">
                    <label class="form-label">Full Name *</label>
                    <input type="text" name="name" class="form-input" required placeholder="e.g. Ali Khan">
                </div>
                <div class="form-group">
                    <label class="form-label">Mobile Number (Optional)</label>
                    <input type="tel" name="mobile" class="form-input" placeholder="0300 1234567">
                </div>
                <div class="form-group">
                    <label class="form-label">CNIC (Optional)</label>
                    <input type="text" name="nic" class="form-input" placeholder="12345-1234567-1">
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%">Save Customer</button>
            </form>
        `);
    },

    handleAddCustomer: (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        addCustomer(formData.get('name'), formData.get('mobile'), formData.get('nic'));
        closeModal();
    },

    showTransactionModal: (type) => {
        const isCredit = type === 'credit';
        const title = isCredit ? 'Give Credit (Out)' : 'Receive Payment (In)';
        const btnClass = isCredit ? 'btn-danger' : 'btn-success';

        const categoryOptions = STATE.categories.map(cat => `<option value="${cat}">`).join('');

        showModal(`
            <div class="modal-header">
                <h2>${title}</h2>
                <button class="modal-close" onclick="closeModal()">×</button>
            </div>
            <form onsubmit="app.handleTransaction(event, '${type}')">
                <div class="form-group">
                    <label class="form-label">Amount (Rs) *</label>
                    <input type="number" name="amount" class="form-input" required placeholder="0" min="1" step="any">
                </div>
                <div class="form-group">
                    <label class="form-label">Category</label>
                    <input type="text" name="category" class="form-input" list="category-list" placeholder="e.g. Goods, Loan">
                    <datalist id="category-list">
                        ${categoryOptions}
                    </datalist>
                </div>
                <div class="form-group">
                    <label class="form-label">Description / Note</label>
                    <input type="text" name="note" class="form-input" placeholder="details...">
                </div>
                <div class="form-group">
                    <label class="form-label">Date</label>
                    <input type="date" name="date" class="form-input" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <button type="submit" class="btn ${btnClass}" style="width:100%">${title}</button>
            </form>
        `);
    },

    handleTransaction: (e, type) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        addTransaction(STATE.selectedCustomerId, formData.get('amount'), type, formData.get('note'), formData.get('category'));
        closeModal();
    },

    setDashboardFilter: (filter) => {
        STATE.dashboardFilter = filter;
        renderDashboard();
    },

    syncModal: () => {
        showModal(`
            <div class="modal-header">
                <h2>Sync Database</h2>
                <button class="modal-close" onclick="closeModal()">×</button>
            </div>
            <div style="text-align: center;">
                <p class="text-muted mb-4">Export your data to JSON or Load from a URL.</p>
                <button class="btn btn-primary mb-4" onclick="app.downloadJSON()">Download Backup (JSON)</button>
                
                <hr style="border-color: var(--border-color); margin: 1.5rem 0;">
                
                <div class="form-group" style="text-align: left;">
                    <label class="form-label">Import from JSON URL</label>
                    <input type="url" id="json-url" class="form-input" placeholder="https://example.com/db.json">
                </div>
                <button class="btn btn-success" onclick="app.loadFromURL()">Load from URL</button>
            </div>
        `);
    },

    downloadJSON: () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(STATE));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "khata_backup_" + new Date().toISOString().split('T')[0] + ".json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    loadFromURL: async () => {
        const url = document.getElementById('json-url').value;
        if (!url) return alert('Please enter a valid URL');
        try {
            const res = await fetch(url);
            const data = await res.json();

            if (data.customers) {
                STATE.customers = data.customers;
                STATE.transactions = data.transactions || [];
                // Migration if needed during load
                if (STATE.transactions.length === 0) {
                    STATE.customers.forEach(c => {
                        if (c.transactions) {
                            c.transactions.forEach(t => {
                                t.customerId = c.id;
                                STATE.transactions.push(t);
                            });
                            delete c.transactions;
                        }
                    });
                }

                STATE.users = data.users || STATE.users;
                saveState();
                alert('Database loaded successfully!');
                closeModal();
                renderDashboard();
                if (STATE.currentView === 'customers') renderCustomers();
            } else {
                alert('Invalid JSON format');
            }
        } catch (e) {
            alert('Error loading data: ' + e.message);
        }
    },

    loadFromURLInput: async () => {
        const url = document.getElementById('json-url-input').value;
        if (!url) return alert('Please enter a valid URL');
        try {
            const res = await fetch(url);
            const data = await res.json();

            if (data.customers) {
                STATE.customers = data.customers;
                STATE.transactions = data.transactions || [];
                // Migration if needed during load
                if (STATE.transactions.length === 0) {
                    STATE.customers.forEach(c => {
                        if (c.transactions) {
                            c.transactions.forEach(t => {
                                t.customerId = c.id;
                                STATE.transactions.push(t);
                            });
                            delete c.transactions;
                        }
                    });
                }

                STATE.users = data.users || STATE.users;
                saveState();
                alert('Database loaded successfully!');
                renderDashboard();
                if (STATE.currentView === 'customers') renderCustomers();
            } else {
                alert('Invalid JSON format');
            }
        } catch (e) {
            alert('Error loading data: ' + e.message);
        }
    },

    // Initialize
    init: () => {
        // Migration: If transactions exist on customers but not in main array, move them
        if (STATE.transactions.length === 0 && STATE.customers.some(c => c.transactions && c.transactions.length > 0)) {
            console.log("Migrating transactions...");
            STATE.customers.forEach(c => {
                if (c.transactions) {
                    c.transactions.forEach(t => {
                        t.customerId = c.id;
                        STATE.transactions.push(t);
                    });
                    delete c.transactions; // Clean up
                }
            });
            saveState();
        }

        if (!STATE.currentUser) STATE.currentUser = STATE.users[0];
        renderHeader();

        // Render based on default view
        renderCustomers();
        document.getElementById('nav-customers').classList.add('active'); // Default UI state

        // Setup Close Modal on Overlay Click
        elements.modalOverlay.addEventListener('click', (e) => {
            if (e.target === elements.modalOverlay) closeModal();
        });
    },
    switchUser: (id) => {
        STATE.currentUser = STATE.users.find(u => u.id == id);
        localStorage.setItem('khata_current_user', JSON.stringify(STATE.currentUser));
        renderHeader();
    }
};

// Start App
document.addEventListener('DOMContentLoaded', app.init);

