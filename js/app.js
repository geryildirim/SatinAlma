// app.js
// Dynamic Data fetching logic linked to Python SQLite API

const statusMap = {
    'pending': { label: 'Yönetici Onayında', class: 'status-pending' },
    'approved': { label: 'Satın Almada', class: 'status-approved' },
    'po': { label: 'Sipariş Geçildi', class: 'status-po' },
    'rejected': { label: 'Reddedildi', class: 'status-rejected' },
    'paid': { label: 'Ödendi', class: 'status-paid' },
    'delivered': { label: 'Teslim Alındı', class: 'status-delivered' }
};

const App = {
    version: '27',
    requestsData: [], 
    isEditMode: false,
    grid: null,
    user: null, // Giriş yapmış kullanıcı bilgisi

    async init() {
        try {
            console.log("App.init version:", this.version);
            if (typeof lucide !== 'undefined') lucide.createIcons();
            
            if (!this.checkAuth()) {
                this.showLogin();
            } else {
                // Authed: Ensure login overlay is definitely gone
                this.hideLogin();
                this.initGridStack();
                this.bindNav();
                this.bindForms();
                await this.fetchDataAndRender();
            }
            this.bindLogin();

            document.addEventListener('click', (e) => {
                const dropdown = document.getElementById('notificationsDropdown');
                if(dropdown && dropdown.classList.contains('show') && !e.target.closest('.dropdown-wrapper')) {
                    dropdown.classList.remove('show');
                }
            });
        } catch (error) {
            console.error("Initialization error:", error);
            this.showLogin();
        }
    },

    checkAuth() {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (token && userData) {
            try {
                this.user = JSON.parse(userData);
                this.applyRoleUI();
                return true;
            } catch(e) {
                console.error("Auth parse error:", e);
                return false;
            }
        }
        return false;
    },

    showLogin() {
        document.body.classList.add('login-pending');
        const overlay = document.getElementById('loginOverlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.style.setProperty('display', 'flex', 'important');
            overlay.style.setProperty('pointer-events', 'auto', 'important');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    hideLogin() {
        document.body.classList.remove('login-pending');
        const overlay = document.getElementById('loginOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.setProperty('display', 'none', 'important');
            overlay.style.setProperty('pointer-events', 'none', 'important');
        }
    },

    async login(username, password) {
        const errorDiv = document.getElementById('loginError');
        errorDiv.style.display = 'none';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Giriş başarısız");
            }

            const data = await response.json();
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            this.user = data.user;
            this.hideLogin();
            await this.init(); // Uygulamayı tekrar başlat
        } catch (error) {
            errorDiv.textContent = error.message;
            errorDiv.style.display = 'flex';
        }
    },

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        location.assign('/'); 
    },

    getHeaders() {
        const token = localStorage.getItem('token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    },

    applyRoleUI() {
        document.body.classList.remove('role-admin', 'role-user');
        document.body.classList.add(`role-${this.user.role}`);

        const profileName = document.getElementById('profile-name');
        const profileRole = document.getElementById('profile-role');
        if (profileName) profileName.textContent = this.user.full_name;
        if (profileRole) profileRole.textContent = this.user.role === 'admin' ? 'Sistem Yöneticisi' : 'Personel';
        
        document.querySelectorAll('[data-role]').forEach(el => {
            const requiredRole = el.getAttribute('data-role');
            if (requiredRole === this.user.role) {
                el.style.display = '';
            } else {
                el.style.setProperty('display', 'none', 'important');
            }
        });
    },

    toggleNotifications(e) {
        if(e) e.stopPropagation();
        const dropdown = document.getElementById('notificationsDropdown');
        if(dropdown) {
            dropdown.classList.toggle('show');
            lucide.createIcons();
        }
    },

    async fetchDataAndRender() {
        try {
            const [statsRes, reqsRes] = await Promise.all([
                fetch('/api/stats', { headers: this.getHeaders() }),
                fetch('/api/requests', { headers: this.getHeaders() })
            ]);
            
            if (statsRes.status === 401 || reqsRes.status === 401) {
                this.logout();
                return;
            }

            if(!statsRes.ok || !reqsRes.ok) throw new Error("API hatası");

            const stats = await statsRes.json();
            this.requestsData = await reqsRes.json();

            this.renderDashboardStats(stats);
            this.renderProgressBars(); 
            this.filterByStatus('all');
            this.renderRequestsPage('all');
            this.renderApprovalsPage();
            this.renderOrdersPage();
            this.renderInvoicesPage();
            this.renderReceivingPage();
            this.renderStocksPage();
            // Initial render of stock cards
            this.renderStockCards();
            if (this.user.role === 'admin') {
                this.renderUsersPage();
            }
        } catch (error) {
            console.error("Veritabanı hatası:", error);
            const body = document.getElementById('recent-requests-body');
            if (body) {
                body.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Veritabanı bağlantısı yok.</td></tr>`;
            }
            lucide.createIcons();
        }
    },

    bindNav() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            if (item.classList.contains('logout-nav')) return;
            item.addEventListener('click', (e) => {
                const href = item.getAttribute('href');
                if (href && href.startsWith('#')) {
                    e.preventDefault();
                    const viewId = item.getAttribute('data-view');
                    if (viewId) this.switchView(viewId);
                }
            });
        });
    },

    bindForms() {
        const form = document.getElementById('newRequestForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const inputs = form.querySelectorAll('input');
                const desc = inputs[1].value;
                const reqBody = { description: desc, amount: "Teklif Bekleniyor" };
                try {
                    const response = await fetch('/api/requests', {
                        method: 'POST',
                        headers: this.getHeaders(),
                        body: JSON.stringify(reqBody)
                    });
                    if (response.status === 401) return this.logout();
                    if(response.ok) {
                        document.getElementById('newRequestModal')?.classList.remove('show');
                        form.reset();
                        await this.fetchDataAndRender();
                    }
                } catch (err) { console.error(err); }
            });
        }

        const paymentForm = document.getElementById('paymentForm');
        if(paymentForm) {
            paymentForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const reqId = document.getElementById('payment-req-id').value;
                this.updateStatus(null, reqId, 'paid');
                document.getElementById('paymentModal').classList.remove('show');
            });
        }

        const quoteForm = document.getElementById('quoteForm');
        if(quoteForm) {
            quoteForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const reqId = document.getElementById('quote-req-id').value;
                const amt = document.getElementById('quote-amount').value;
                const supplier = document.getElementById('po-supplier-input').value;
                const addr = document.getElementById('po-address-input').value;
                const formattedAmount = "₺" + Number(amt).toLocaleString('tr-TR', {minimumFractionDigits: 2});
                this.updateStatus(null, reqId, 'po', { amount: formattedAmount, supplier, address: addr });
            });
        }

        const userForm = document.getElementById('userForm');
        if (userForm) {
            userForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const fullName = document.getElementById('user-fullname').value;
                const username = document.getElementById('user-username').value;
                const password = document.getElementById('user-password').value;
                const role = document.getElementById('user-role').value;
                const editId = document.getElementById('edit-user-id').value;

                try {
                    let response;
                    if (editId) {
                        // Edit Mode: Only role update as requested
                        response = await fetch(`/api/users/${editId}/role`, {
                            method: 'PUT',
                            headers: this.getHeaders(),
                            body: JSON.stringify({ role })
                        });
                    } else {
                        // Create Mode
                        response = await fetch('/api/users', {
                            method: 'POST',
                            headers: this.getHeaders(),
                            body: JSON.stringify({ full_name: fullName, username, password, role })
                        });
                    }
                    
                    if (response.status === 401) return this.logout();
                    if (response.ok) {
                        this.closeModals();
                        userForm.reset();
                        await this.fetchDataAndRender();
                    } else {
                        const err = await response.json();
                        alert(err.detail || "İşlem başarısız");
                    }
                } catch (err) { console.error(err); }
            });
        }
    },

    bindLogin() {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            // Remove any old listeners by replacing the element or just being careful
            const newForm = loginForm.cloneNode(true);
            loginForm.parentNode.replaceChild(newForm, loginForm);
            newForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const user = document.getElementById('login-username').value;
                const pass = document.getElementById('login-password').value;
                this.login(user, pass);
            });
        }
    },

    filterRequestsPage(status, btnElement) {
        if(btnElement) {
            const tabs = btnElement.parentElement.querySelectorAll('.tab-btn');
            tabs.forEach(t => t.classList.remove('active'));
            btnElement.classList.add('active');
        }
        this.renderRequestsPage(status);
    },

    renderRequestsPage(filter) {
        const tbody = document.getElementById('requests-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        let data = this.requestsData;
        if(filter !== 'all') data = this.requestsData.filter(r => r.status === filter);

        if(data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 48px 0;">Talep kaydı bulunmuyor.</td></tr>`;
            return;
        }

        data.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${req.request_no}</strong></td><td>${req.description}</td><td style="font-weight: 500;">${req.amount}</td><td><span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span></td><td>${req.date}</td>`;
            tbody.appendChild(tr);
        });
    },

    renderApprovalsPage() {
        const tbody = document.getElementById('approvals-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        let pendingData = this.requestsData.filter(req => req.status === 'pending');

        if (pendingData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 48px 0;">Onay bekleyen talep yok.</td></tr>`;
            return;
        }

        pendingData.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${req.request_no}</strong></td>
                <td>${req.description}</td>
                <td><span class="status-badge status-pending">Onay Bekliyor</span></td>
                <td>${req.date}</td>
                <td style="text-align: right;">
                    <button class="primary-btn" onclick="app.updateStatus(event, ${req.id}, 'approved')">Onayla</button>
                    <button class="outline-btn" onclick="app.updateStatus(event, ${req.id}, 'rejected')">Reddet</button>
                    <button class="outline-btn" onclick="app.deleteRequest(${req.id})"><i data-lucide="trash-2" style="width:14px; color:#ef4444;"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    renderDashboardStats(stats) {
        const ids = ['stat-active', 'stat-pending', 'stat-pos', 'stat-invoices', 'stat-stock'];
        const values = [stats.activeRequests, stats.pendingApprovals, stats.activePOs, stats.readyInvoices, 0]; // Stock handled by another fetch usually
        ids.forEach((id, idx) => {
            const el = document.getElementById(id);
            if(el) el.innerText = values[idx] || 0;
        });
        
        // Update stock stat separately since it's from /api/stock
        fetch('/api/stock', { headers: this.getHeaders() })
            .then(res => res.json())
            .then(stocks => {
                const stockEl = document.getElementById('stat-stock-val');
                if (stockEl) stockEl.innerText = stocks.length || 0;
            });

        const badge = document.getElementById('nav-approval-count');
        if(badge) badge.innerText = stats.pendingApprovals || 0;
    },

    renderProgressBars() {
        const total = this.requestsData.length || 1;
        const counts = { 'pending': 0, 'approved': 0, 'po': 0, 'delivered': 0, 'paid': 0, 'rejected': 0 };
        this.requestsData.forEach(req => { if(counts[req.status] !== undefined) counts[req.status]++; });
        const colors = { 'pending': '#f59e0b', 'approved': '#10b981', 'po': '#3b82f6', 'delivered': '#8b5cf6', 'paid': '#ec4899', 'rejected': '#ef4444' };
        let currentPos = 0;
        let gradientString = "";
        let legendHtml = "";
        ['pending', 'approved', 'po', 'delivered', 'paid', 'rejected'].forEach(status => {
            const count = counts[status];
            const percent = (count / total) * 100;
            if(percent > 0) {
                gradientString += `${colors[status]} ${currentPos}% ${currentPos + percent}%, `;
                currentPos += percent;
                legendHtml += `<div class="legend-item"><span class="dot" style="background:${colors[status]}"></span><span class="label">${statusMap[status].label}</span><span class="val">${Math.round(percent)}%</span></div>`;
            }
        });
        gradientString = gradientString.slice(0, -2);
        const circle = document.getElementById('pie-chart');
        if(circle) circle.style.background = `conic-gradient(${gradientString})`;
        const legend = document.getElementById('pie-legend');
        if(legend) legend.innerHTML = legendHtml;
    },

    renderOrdersPage() {
        const tbody = document.getElementById('orders-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        let ordersData = this.requestsData.filter(req => req.status === 'approved' || req.status === 'po');
        if (ordersData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 48px 0;">Sipariş bekleyen talep yok.</td></tr>`;
            return;
        }
        ordersData.forEach(req => {
            const isPO = req.status === 'po';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${req.request_no}</strong></td><td>${req.description}</td><td>${req.amount}</td><td><span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span></td><td style="text-align: right;">${isPO ? '✓ Sipariş Edildi' : `<button class="primary-btn" onclick="app.openQuoteModal(${req.id}, '${req.request_no}', '${req.description.replace(/'/g, "\\'")}')">Sipariş Oluştur</button>`}</td>`;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    renderReceivingPage() {
        const tbody = document.getElementById('receiving-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        let receivingData = this.requestsData.filter(req => req.status === 'po');
        if (receivingData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 48px 0;">Teslim alınacak ürün yok.</td></tr>`;
            return;
        }
        receivingData.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${req.request_no}</strong></td><td>${req.description}</td><td><span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span></td><td>${req.date}</td><td style="text-align: right;"><button class="primary-btn" onclick="app.updateStatus(event, ${req.id}, 'delivered')">Teslim Alındı</button></td>`;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    renderInvoicesPage() {
        const tbody = document.getElementById('invoices-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        let invoiceData = this.requestsData.filter(req => req.status === 'delivered');
        if (invoiceData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding: 48px 0;">Ödenecek fatura yok.</td></tr>`;
            return;
        }
        invoiceData.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${req.request_no}</strong></td><td>${req.description}</td><td><span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span></td><td>${req.amount}</td><td>${req.date}</td><td style="text-align: right;"><button class="primary-btn" onclick="app.openPaymentModal(${req.id}, '${req.request_no}', '${req.amount}')">Öde</button></td>`;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    async renderStocksPage(filterText = '') {
        const tbody = document.getElementById('stock-body');
        const cardsContainer = document.getElementById('stock-cards-container');
        if (!tbody && !cardsContainer) return;

        try {
            const res = await fetch('/api/stock', { headers: this.getHeaders() });
            if (res.status === 401) return this.logout();
            
            let stocks = await res.json();
            this.stocksData = stocks; // Store locally for detail view
            
            if (filterText) {
                const lowerFilter = filterText.toLowerCase();
                stocks = stocks.filter(s => 
                    s.item_name.toLowerCase().includes(lowerFilter) || 
                    s.request_no.toLowerCase().includes(lowerFilter)
                );
            }

            // Render Table (hidden by default)
            if (tbody) {
                tbody.innerHTML = '';
                if (stocks.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding: 48px 0;">Ürün bulunamadı.</td></tr>`;
                } else {
                    stocks.forEach(item => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `<td><strong>${item.request_no}</strong></td><td>${item.item_name}</td><td>${item.quantity}</td><td>${item.unit}</td><td>${item.date_added}</td><td style="text-align: right;"><span class="status-badge status-delivered">Stokta</span></td>`;
                        tbody.appendChild(tr);
                    });
                }
            }

            // Render Cards (default view)
            if (cardsContainer) {
                this.renderStockCards(stocks);
            }

        } catch (err) {
            console.error("Stok verisi çekme hatası:", err);
        }
    },

    renderStockCards(stocks) {
        const container = document.getElementById('stock-cards-container');
        if (!container) return;
        container.innerHTML = '';

        if (!stocks || stocks.length === 0) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 48px; color: var(--text-muted);">
                <i data-lucide="search-x" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>Aradığınız kriterlere uygun ürün bulunamadı.</p>
            </div>`;
            lucide.createIcons();
            return;
        }

        stocks.forEach(item => {
            const card = document.createElement('div');
            card.className = 'inventory-card';
            card.style.cursor = 'pointer';
            card.onclick = () => this.viewStockDetail(item.id);
            card.innerHTML = `
                <div class="inv-card-header">
                    <div class="inv-card-icon">
                        <i data-lucide="archive"></i>
                    </div>
                    <span class="inv-card-id">${item.request_no}</span>
                </div>
                <h3 class="inv-card-title">${item.item_name}</h3>
                <div class="inv-card-details">
                    <div class="inv-detail-item">
                        <span class="inv-detail-label">Miktar</span>
                        <span class="inv-detail-value">${item.quantity} ${item.unit}</span>
                    </div>
                    <div class="inv-detail-item">
                        <span class="inv-detail-label">Giriş Tarihi</span>
                        <span class="inv-detail-value">${item.date_added}</span>
                    </div>
                </div>
                <div class="inv-card-footer">
                    <span class="inv-status">Stokta</span>
                </div>
            `;
            container.appendChild(card);
        });
        lucide.createIcons();
    },

    handleStockSearch(val) {
        this.renderStocksPage(val);
    },

    viewStockDetail(id) {
        const item = this.stocksData.find(s => s.id === id);
        if (!item) return;

        document.getElementById('stock-detail-title').innerText = item.item_name;
        document.getElementById('stock-detail-subtitle').innerText = `#${item.request_no}`;
        document.getElementById('stock-detail-quantity').innerText = `${item.quantity} ${item.unit}`;
        document.getElementById('stock-detail-date').innerText = item.date_added;
        document.getElementById('stock-detail-request').innerText = item.request_no;

        const modal = document.getElementById('stockDetailModal');
        if (modal) {
            modal.classList.add('show');
            lucide.createIcons();
        }
    },

    renderUsersPage() {
        const tbody = document.getElementById('users-body');
        if (!tbody) return;
        
        fetch('/api/users', { headers: this.getHeaders() })
            .then(res => {
                if (res.status === 401) return this.logout();
                return res.json();
            })
            .then(users => {
                tbody.innerHTML = '';
                if (!users || users.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 48px 0;">Kayıtlı kullanıcı bulunmuyor.</td></tr>`;
                    return;
                }
                users.forEach(u => {
                    const tr = document.createElement('tr');
                    const roleBadge = u.role === 'admin' ? '<span class="status-badge status-po">Yönetici</span>' : '<span class="status-badge status-approved">Personel</span>';
                    tr.innerHTML = `
                        <td>#${u.id}</td>
                        <td><strong>${u.username}</strong></td>
                        <td>${u.full_name}</td>
                        <td>${roleBadge}</td>
                        <td style="text-align: right;">
                            <button class="outline-btn" onclick='app.editUser(${JSON.stringify(u)})' style="margin-right: 8px;">
                                <i data-lucide="edit" style="width:14px; color:var(--info);"></i>
                            </button>
                            <button class="outline-btn" onclick="app.deleteUser(${u.id})" ${u.username === 'admin' ? 'disabled style="opacity:0.5;"' : ''}>
                                <i data-lucide="trash-2" style="width:14px; color:#ef4444;"></i>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
                lucide.createIcons();
            })
            .catch(err => console.error("Kullanıcı listesi hatası:", err));
    },

    async deleteRequest(id) {
        if(!confirm('Bu talebi silmek istediğinize emin misiniz?')) return;
        try {
            const res = await fetch(`/api/requests/${id}`, { method: 'DELETE', headers: this.getHeaders() });
            if (res.status === 401) return this.logout();
            if (res.status === 403) return alert("Hata: Admin yetkisi gereklidir.");
            if(res.ok) await this.fetchDataAndRender();
        } catch(err) { console.error(err); }
    },

    async deleteUser(id) {
        if(!confirm('Bu kullanıcıyı sistemden silmek istediğinize emin misiniz?')) return;
        try {
            const res = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: this.getHeaders() });
            if (res.status === 401) return this.logout();
            if (res.status === 403) return alert("Hata: Admin yetkisi gereklidir.");
            if(res.ok) await this.fetchDataAndRender();
        } catch(err) { console.error(err); }
    },

    async updateStatus(event, id, newStatus, extra = {}) {
        if(event) { event.preventDefault(); event.stopPropagation(); }
        const body = { id: parseInt(id), status: newStatus, ...extra };
        try {
            const res = await fetch('/api/requests/update', {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(body)
            });
            if (res.status === 401) return this.logout();
            if (res.status === 403) return alert("Hata: Admin yetkisi gereklidir.");
            if(res.ok) {
                document.getElementById('quoteModal')?.classList.remove('show');
                document.getElementById('paymentModal')?.classList.remove('show');
                await this.fetchDataAndRender();
            }
        } catch(err) { console.error(err); }
    },

    openQuoteModal(id, requestNo, description) {
        document.getElementById('quote-req-id').value = id;
        document.getElementById('quoteModal').classList.add('show');
    },

    openPaymentModal(id, requestNo, amount) {
        document.getElementById('payment-req-id').value = id;
        document.getElementById('paymentModal').classList.add('show');
    },

    switchView(viewId) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-view') === viewId) item.classList.add('active');
        });
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById(viewId);
        if (targetView) targetView.classList.add('active');
    },

    initGridStack() {
        const gridEl = document.getElementById('dashboard-grid');
        if(typeof GridStack !== 'undefined' && gridEl) {
            const savedLayout = localStorage.getItem('dashboard-layout');
            const options = { 
                staticGrid: true, 
                cellHeight: '120px', 
                margin: 12,
                float: true,
                removable: '.trash',
                removeTimeout: 100
            };
            
            this.grid = GridStack.init(options, gridEl);
            
            if (savedLayout) {
                try {
                    const layout = JSON.parse(savedLayout);
                    this.grid.load(layout);

                    // Yeni eklenen ancak layout'ta olmayan itemlar varsa onları da ekle
                    const currentItems = this.grid.getGridItems();
                    const currentIds = currentItems.map(item => item.getAttribute('gs-id')).filter(id => id);
                    
                    const allHtmlItems = Array.from(gridEl.querySelectorAll('.grid-stack-item'));
                    allHtmlItems.forEach(htmlItem => {
                        const id = htmlItem.getAttribute('gs-id');
                        if (id && !currentIds.includes(id)) {
                            this.grid.makeWidget(htmlItem);
                        }
                    });

                } catch (e) {
                    console.error("Layout load error:", e);
                }
            }
        }
    },

    resetDashboardLayout() {
        if(!confirm('Panel yerleşimini varsayılan ayarlara döndürmek istediğinize emin misiniz?')) return;
        localStorage.removeItem('dashboard-layout');
        window.location.reload();
    },

    toggleDashboardEditMode() {
        this.isEditMode = !this.isEditMode;
        const btn = document.getElementById('btn-edit-dashboard');
        const resetBtn = document.getElementById('btn-reset-dashboard');
        
        if (this.isEditMode) {
            if (this.grid) {
                this.grid.setStatic(false);
                this.grid.enableMove(true);
                this.grid.enableResize(true);
            }
            if (resetBtn) resetBtn.style.display = 'flex';
            if (btn) {
                btn.innerHTML = '<i data-lucide="check"></i> Yerleşimi Kaydet';
                btn.style.background = 'var(--success)';
                btn.style.color = 'white';
                btn.style.borderColor = 'var(--success)';
            }
        } else {
            if (this.grid) {
                this.grid.setStatic(true);
                this.grid.enableMove(false);
                this.grid.enableResize(false);
                const layout = this.grid.save();
                localStorage.setItem('dashboard-layout', JSON.stringify(layout));
            }
            if (resetBtn) resetBtn.style.display = 'none';
            if (btn) {
                btn.innerHTML = '<i data-lucide="layout"></i> Görünümü Düzenle';
                btn.style.background = 'transparent';
                btn.style.color = 'var(--text-main)';
                btn.style.borderColor = 'var(--surface-border)';
            }
        }
        lucide.createIcons();
    },

    openNewRequestModal() {
        const modal = document.getElementById('newRequestModal');
        if (modal) modal.classList.add('show');
    },

    openUserModal() {
        document.getElementById('userForm').reset();
        document.getElementById('edit-user-id').value = '';
        document.querySelector('#userModal h2').innerText = 'Sistem Kullanıcısı Tanımla';
        document.querySelector('#userModal .submit-btn').innerHTML = '<i data-lucide="save" style="width:16px;"></i> Kaydet ve Oluştur';
        
        document.getElementById('user-fullname-group').style.display = 'block';
        document.getElementById('user-username-group').style.display = 'block';
        document.getElementById('user-password-group').style.display = 'block';
        
        const modal = document.getElementById('userModal');
        if (modal) modal.classList.add('show');
        lucide.createIcons();
    },

    editUser(user) {
        document.getElementById('userForm').reset();
        document.getElementById('edit-user-id').value = user.id;
        document.querySelector('#userModal h2').innerText = 'Kullanıcı Yetkisi Düzenle';
        document.querySelector('#userModal .submit-btn').innerHTML = '<i data-lucide="check" style="width:16px;"></i> Değişiklikleri Uygula';
        
        // Hide name/pass for role-only edit to keep it clean, but set values
        document.getElementById('user-fullname').value = user.full_name;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-password').value = '********'; // Dummy
        
        document.getElementById('user-fullname-group').style.display = 'none';
        document.getElementById('user-username-group').style.display = 'none';
        document.getElementById('user-password-group').style.display = 'none';
        
        document.getElementById('user-role').value = user.role;
        
        const modal = document.getElementById('userModal');
        if (modal) modal.classList.add('show');
        lucide.createIcons();
    },

    closeModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
    },

    switchSettingsTab(tabId) {
        document.querySelectorAll('.settings-tab').forEach(t => t.style.display = 'none');
        document.querySelectorAll('.settings-nav-item').forEach(i => {
            i.classList.remove('active');
            i.style.color = 'var(--text-muted)';
        });

        const activeTab = document.getElementById(`settings-${tabId}`);
        const activeNav = document.getElementById(`nav-${tabId}`);
        
        if (activeTab) activeTab.style.display = 'block';
        if (activeNav) {
            activeNav.classList.add('active');
            activeNav.style.color = 'var(--primary-color)';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    saveSettings() {
        alert("Profil ayarları başarıyla kaydedildi.");
    },

    updatePreview() {
        const supplier = document.getElementById('po-supplier-input')?.value || "Belirtilmedi";
        const amountStr = document.getElementById('quote-amount')?.value || "0";
        const address = document.getElementById('po-address-input')?.value || "Belirtilmedi";
        const notes = document.getElementById('po-notes-input')?.value || "Yok";

        const formattedAmount = "₺" + Number(amountStr).toLocaleString('tr-TR', {minimumFractionDigits: 2});

        const prevSupplier = document.getElementById('prev-supplier');
        const prevAmount = document.getElementById('prev-amount');
        const prevAddress = document.getElementById('prev-address');
        const prevNotes = document.getElementById('prev-notes');

        if(prevSupplier) prevSupplier.innerText = supplier;
        if(prevAmount) prevAmount.innerText = formattedAmount;
        if(prevAddress) prevAddress.innerText = address;
        if(prevNotes) prevNotes.innerText = notes;
    },

    printPO() {
        window.print();
    },

    filterByStatus(status) {
        this.renderTable(status);
    },

    renderTable(filterStatus) {
        const tbody = document.getElementById('recent-requests-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        let filteredData = this.requestsData;
        if(filterStatus !== 'all') filteredData = this.requestsData.filter(req => req.status === filterStatus);
        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 24px 0;">Kayıt bulunmuyor.</td></tr>`;
            return;
        }
        filteredData.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${req.request_no}</strong></td><td>${req.description}</td><td>${req.amount}</td><td><span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span></td><td>${req.date}</td>`;
            tbody.appendChild(tr);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => { App.init(); });
window.app = App;
