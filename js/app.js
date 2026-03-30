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
    requestsData: [], // Tüm raw datayı saklamak için
    isEditMode: false,
    grid: null,

    async init() {
        lucide.createIcons();
        this.initGridStack();
        this.bindNav();
        this.bindForms();

        // Mouse focus/outside click listener for dropdown closure
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('notificationsDropdown');
            if(dropdown && dropdown.classList.contains('show') && !e.target.closest('.dropdown-wrapper')) {
                dropdown.classList.remove('show');
            }
        });

        await this.fetchDataAndRender();
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
                fetch('/api/stats'),
                fetch('/api/requests')
            ]);
            
            if(!statsRes.ok || !reqsRes.ok) throw new Error("API hatası");

            const stats = await statsRes.json();
            this.requestsData = await reqsRes.json();

            this.renderDashboardStats(stats);
            this.renderProgressBars(); // Inject charts
            this.filterByStatus('all');
            this.renderRequestsPage('all');
            this.renderApprovalsPage();
            this.renderOrdersPage();
            this.renderInvoicesPage();
            this.renderReceivingPage();
        } catch (error) {
            console.error("Veritabanı hatası:", error);
            document.getElementById('recent-requests-body').innerHTML = `
                <tr><td colspan="5" style="text-align:center; color:#ef4444;">
                <i data-lucide="alert-circle" style="display:block; margin: 10px auto;"></i>
                Veritabanı bağlantısı yok. Uygulamayı <b>python3 server.py</b> ile çalıştırdığınızdan emin olun.
                </td></tr>
            `;
            lucide.createIcons();
        }
    },

    bindNav() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                if (item.getAttribute('href').startsWith('#')) {
                    e.preventDefault();
                    const viewId = item.getAttribute('data-view');
                    if (viewId) this.switchView(viewId);
                }
            });
        });
    },

    bindForms() {
        const form = document.getElementById('newRequestForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const inputs = form.querySelectorAll('input');
            const desc = inputs[1].value;
            
            const reqBody = {
                description: desc,
                amount: "Teklif Bekleniyor"
            };

            const submitBtn = form.querySelector('.submit-btn');
            const oldText = submitBtn.innerText;
            submitBtn.innerText = "Gönderiliyor...";
            submitBtn.disabled = true;

            try {
                const res = await fetch('/api/requests', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reqBody)
                });

                if (res.ok) {
                    this.closeModals();
                    alert("Talebiniz başarıyla veritabanına kaydedildi.");
                    form.reset();
                    await this.fetchDataAndRender();
                } else {
                    throw new Error("Sunucu yanıt vermedi");
                }
            } catch (err) {
                console.error(err);
                alert("Hata: Kayıt işlemi veritabanına ulaşılamadığı için başarısız oldu.");
            } finally {
                submitBtn.innerText = oldText;
                submitBtn.disabled = false;
            }
        });

        // Payment Form Binding
        const paymentForm = document.getElementById('paymentForm');
        if(paymentForm) {
            paymentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const reqId = document.getElementById('pay-req-id').value;
                const submitBtn = paymentForm.querySelector('.submit-btn');
                const oldText = submitBtn.innerHTML;
                
                submitBtn.innerHTML = "İşleniyor...";
                submitBtn.disabled = true;

                // Simulate payment gateway delay for realism
                await new Promise(r => setTimeout(r, 1500));

                try {
                    const res = await fetch('/api/requests/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: reqId, status: 'paid' })
                    });

                    if(res.ok) {
                        this.closeModals();
                        paymentForm.reset();
                        alert("Ödeme işlemi başarıyla tamamlandı. Fatura yansıtıldı.");
                        await this.fetchDataAndRender();
                    } else {
                        alert("Banka bağlantı hatası oluştu.");
                    }
                } catch(err) {
                    console.error(err);
                    alert("Ödeme işlemi sırasında ağ hatası oluştu.");
                } finally {
                    submitBtn.innerHTML = oldText;
                    submitBtn.disabled = false;
                }
            });
        }

        // Quote / PO Form Binding
        const quoteForm = document.getElementById('quoteForm');
        if(quoteForm) {
            quoteForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const reqId = document.getElementById('quote-req-id').value;
                const amt = document.getElementById('quote-amount').value;
                const submitBtn = quoteForm.querySelector('.submit-btn');
                const oldText = submitBtn.innerHTML;
                
                submitBtn.innerHTML = "Sipariş Geçiliyor...";
                submitBtn.disabled = true;

                try {
                    const formattedAmount = "₺" + Number(amt).toLocaleString('tr-TR', {minimumFractionDigits: 2});
                    const res = await fetch('/api/requests/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: reqId, status: 'po', amount: formattedAmount })
                    });

                    if(res.ok) {
                        this.closeModals();
                        quoteForm.reset();
                        alert("Satın alma siparişi (PO) başarıyla tedarikçiye iletildi!");
                        await this.fetchDataAndRender();
                    } else {
                        alert("Sunucu hatası oluştu.");
                    }
                } catch(err) {
                    console.error(err);
                    alert("Ağ hatası oluştu.");
                } finally {
                    submitBtn.innerHTML = oldText;
                    submitBtn.disabled = false;
                }
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

    renderRequestsPage(filterStatus) {
        const tbody = document.getElementById('my-requests-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        let filteredData = this.requestsData;
        if(filterStatus !== 'all') {
            filteredData = this.requestsData.filter(req => req.status === filterStatus);
        }

        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding: 32px 0;">Bu statüde satın alma talebi bulunamadı.</td></tr>`;
            return;
        }

        filteredData.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${req.request_no}</strong></td>
                <td>${req.description}</td>
                <td>${req.amount}</td>
                <td><span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span></td>
                <td>${req.date}</td>
                <td style="text-align: right;">
                    <button class="icon-btn" style="width: 32px; height: 32px; margin-left: auto;" title="Detayı Gör">
                        <i data-lucide="chevron-right" style="width: 16px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    renderApprovalsPage() {
        const tbody = document.getElementById('approvals-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        let pendingData = this.requestsData.filter(req => req.status === 'pending');

        if (pendingData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#10b981; padding: 48px 0;"><i data-lucide="check-circle" style="width: 48px; height: 48px; display:block; margin: 0 auto 16px; opacity: 0.8;"></i>Şu anda onayınızı bekleyen hiçbir işlem bulunmuyor. Harika!</td></tr>`;
            lucide.createIcons();
            return;
        }

        pendingData.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${req.request_no}</strong></td>
                <td>${req.description}</td>
                <td>${req.amount}</td>
                <td>${req.date}</td>
                <td style="text-align: right; display: flex; justify-content: flex-end; gap: 12px;">
                    <button class="icon-btn" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3);" title="Onayla" onclick="app.updateRequestStatus(event, ${req.id}, 'approved')">
                        <i data-lucide="check" style="width: 18px;"></i>
                    </button>
                    <button class="icon-btn" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" title="Reddet" onclick="app.updateRequestStatus(event, ${req.id}, 'rejected')">
                        <i data-lucide="x" style="width: 18px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    renderProgressBars() {
        const activeRequests = this.requestsData.filter(req => req.status !== 'rejected');
        const total = activeRequests.length;
        
        let counts = {
            'pending': 0,
            'approved': 0,
            'po': 0,
            'delivered': 0,
            'paid': 0
        };

        activeRequests.forEach(req => {
            if(counts[req.status] !== undefined) counts[req.status]++;
        });

        const overallPercent = total === 0 ? 0 : Math.round((counts['paid'] / total) * 100);

        const stages = [
            { key: 'pending', id: 'Onay Bekleyenler', color: '#fbbf24' },
            { key: 'approved', id: 'Satın Almada', color: '#34d399' },
            { key: 'po', id: 'Sipariş Geçildi', color: '#60a5fa' },
            { key: 'delivered', id: 'Teslim Alındı', color: '#a78bfa' },
            { key: 'paid', id: 'Ödendi (Tamamlandı)', color: '#f472b6' }
        ];

        let gradientString = '';
        let cumulativePct = 0;
        let legendHtml = '';

        if(total === 0) {
            gradientString = 'rgba(255,255,255,0.05) 0% 100%';
            legendHtml = '<div style="color:var(--text-muted); text-align:center;">Veri bulunmuyor.</div>';
        } else {
            let gradientParts = [];
            stages.forEach(stage => {
                const count = counts[stage.key];
                if (count > 0) {
                    const pct = (count / total) * 100;
                    const start = cumulativePct;
                    cumulativePct += pct;
                    const end = cumulativePct;
                    gradientParts.push(`${stage.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
                }
                
                const displayPct = Math.round((count / total) * 100) || 0;
                legendHtml += `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; font-size: 0.95rem; color: var(--text-main);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: ${stage.color}; box-shadow: 0 0 8px ${stage.color};"></span>
                        <span style="opacity: 0.9;">${stage.id}</span>
                    </div>
                    <div style="font-weight: 600; color: ${stage.color};">${displayPct}% <span style="font-size: 0.75rem; color: var(--text-muted); margin-left:4px; font-weight:400;">(${count})</span></div>
                </div>
                `;
            });
            gradientString = gradientParts.join(', ');
        }

        const circle = document.getElementById('pie-chart');
        const legend = document.getElementById('pie-legend');
        const totalText = document.getElementById('pie-total-text');

        if(circle && legend && totalText) {
            circle.style.background = `conic-gradient(${gradientString})`;
            legend.innerHTML = legendHtml;
            totalText.innerText = total;
        }
    },

    renderOrdersPage() {
        const tbody = document.getElementById('orders-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        // Onaylanmış (Approved) veya halihazırda PO olan siparişleri listele
        let ordersData = this.requestsData.filter(req => req.status === 'approved' || req.status === 'po');

        if (ordersData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 48px 0;"><i data-lucide="shopping-cart" style="width: 48px; height: 48px; display:block; margin: 0 auto 16px; opacity: 0.5;"></i>İşlem bekleyen satın alma talebi bulunmuyor.</td></tr>`;
            lucide.createIcons();
            return;
        }

        ordersData.forEach(req => {
            const isPO = req.status === 'po';
            const actionHtml = isPO 
                ? `<div style="display:flex; align-items:center; gap:12px; justify-content:flex-end;">
                     <span style="color: var(--text-muted); font-size: 0.85rem;"><i data-lucide="check" style="width:14px; vertical-align:middle;"></i> Sipariş Edildi</span>
                     <button class="outline-btn" style="padding: 4px 10px; font-size: 0.8rem; border-color: rgba(255,255,255,0.2);" onclick="app.showOrderDetails(${req.id})" title="Sipariş Detayları">
                         <i data-lucide="eye" style="width: 14px; height: 14px;"></i> Detay
                     </button>
                   </div>`
                : `<button class="primary-btn" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border-color: rgba(59, 130, 246, 0.3); padding: 6px 14px; font-size: 0.85rem;" onclick="app.openQuoteModal(${req.id}, '${req.request_no}', '${req.description.replace(/'/g, "\\'")}')">
                        <i data-lucide="file-plus" style="width: 14px; height: 14px;"></i> Sipariş Formu Oluştur
                   </button>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${req.request_no}</strong></td>
                <td>${req.description}</td>
                <td style="font-weight: 500;">${req.amount}</td>
                <td><span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span></td>
                <td style="text-align: right;">${actionHtml}</td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    renderReceivingPage() {
        const tbody = document.getElementById('receiving-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        // Sadece PO sekmesindeki siparişler teslim alınabilir
        let receivingData = this.requestsData.filter(req => req.status === 'po');

        if (receivingData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 48px 0;"><i data-lucide="package-check" style="width: 48px; height: 48px; display:block; margin: 0 auto 16px; opacity: 0.5;"></i>Depoya/Ofise teslim edilmesi bekleyen sipariş bulunmuyor.</td></tr>`;
            lucide.createIcons();
            return;
        }

        receivingData.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${req.request_no}</strong></td>
                <td>${req.description}</td>
                <td><span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span></td>
                <td>${req.date}</td>
                <td style="text-align: right;">
                    <button class="primary-btn" style="padding: 6px 16px; font-size: 0.85rem; background: rgba(139, 92, 246, 0.2); border-color: rgba(139, 92, 246, 0.4); color: #c4b5fd;" onclick="app.updateRequestStatus(event, ${req.id}, 'delivered')">
                        <i data-lucide="check-square" style="width: 14px; height: 14px;"></i> Teslim Alındı
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    renderInvoicesPage() {
        const tbody = document.getElementById('invoices-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        // Sadece satın alınmış, teslim alınmış veya siparişi geçilmiş olanlar faturalandırılabilir
        let invoiceData = this.requestsData.filter(req => req.status === 'approved' || req.status === 'po' || req.status === 'delivered');

        if (invoiceData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding: 48px 0;"><i data-lucide="receipt" style="width: 48px; height: 48px; display:block; margin: 0 auto 16px; opacity: 0.5;"></i>Ödenecek fatura bulunamadı.</td></tr>`;
            lucide.createIcons();
            return;
        }

        invoiceData.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${req.request_no}</strong></td>
                <td>${req.description}</td>
                <td><span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span></td>
                <td style="font-weight: 600; color: #fff;">${req.amount}</td>
                <td>${req.date}</td>
                <td style="text-align: right;">
                    <button class="primary-btn" style="padding: 6px 16px; font-size: 0.85rem;" onclick="app.openPaymentModal(${req.id}, '${req.request_no}', '${req.amount}')">
                        <i data-lucide="credit-card" style="width: 14px; height: 14px;"></i> Öde
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    async updateRequestStatus(event, id, newStatus) {
        if(event) {
            event.preventDefault();
            event.stopPropagation();
        }

        try {
            const res = await fetch('/api/requests/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, status: newStatus })
            });

            if(res.ok) {
                await this.fetchDataAndRender();
            } else {
                alert("Sunucu hatası oluştu.");
            }
        } catch(err) {
            console.error(err);
            alert("İşlem sırasında sunucuya ulaşılamadı.");
        }
    },

    saveSettings() {
        const name = document.getElementById('setting-name').value;
        const title = document.getElementById('setting-title').value;
        const email = document.getElementById('setting-email').value;
        const emailNotif = document.getElementById('setting-email-notif').checked;
        const sysNotif = document.getElementById('setting-sys-notif').checked;

        const settingsData = {
            name, title, email, emailNotif, sysNotif
        };

        localStorage.setItem('corpbuy_settings', JSON.stringify(settingsData));
        alert("Ayarlarınız başarıyla güncellendi!");
    },

    switchSettingsTab(tabId) {
        // Reset nav links
        document.querySelectorAll('.settings-nav-item').forEach(el => {
            el.classList.remove('active');
            el.style.background = 'transparent';
            el.style.color = 'var(--text-muted)';
        });
        
        // Hide all tabs
        document.querySelectorAll('.settings-tab').forEach(el => {
            el.style.display = 'none';
        });

        // Activate selected nav link
        const activeNav = document.getElementById('nav-' + tabId);
        if(activeNav) {
            activeNav.classList.add('active');
            activeNav.style.background = 'rgba(99, 102, 241, 0.2)';
            activeNav.style.color = '#fff';
        }

        // Show selected tab
        const activeTab = document.getElementById('settings-' + tabId);
        if(activeTab) {
            activeTab.style.display = 'block';
        }
    },

    clearNotifications() {
        const body = document.querySelector('.dropdown-body');
        if(body) {
            body.innerHTML = '<div style="padding: 32px 20px; text-align: center; color: var(--text-muted);"><i data-lucide="bell-off" style="width: 32px; height: 32px; margin-bottom: 12px; opacity: 0.5;"></i><p>Bildirimler temizlendi.</p></div>';
            lucide.createIcons();
        }
        
        const badge = document.querySelector('.notifications-dropdown .badge');
        if(badge) badge.style.display = 'none';

        const dot = document.querySelector('.notification-dot');
        if(dot) dot.style.display = 'none';
        
        const footer = document.querySelector('.dropdown-footer');
        if(footer) footer.style.display = 'none';
    },

    navigateTo(viewId) {
        this.switchView(viewId);
        const dropdown = document.getElementById('notificationsDropdown');
        if(dropdown && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        }
    },

    switchView(viewId) {
        document.querySelectorAll('.sidebar-nav .nav-item, .sidebar-footer .nav-item, .bottom-nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-view') === viewId) {
                item.classList.add('active');
            }
        });

        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        const targetView = document.getElementById(viewId);
        if (targetView) targetView.classList.add('active');
    },

    openNewRequestModal() {
        document.getElementById('newRequestModal').classList.add('show');
    },

    openQuoteModal(id, requestNo, description) {
        document.getElementById('quote-req-id').value = id;
        
        document.getElementById('po-supplier-input').value = '';
        document.getElementById('quote-amount').value = '';
        document.getElementById('po-address-input').value = 'Merkez Ofis Lojistik Deposu, İstanbul';
        document.getElementById('po-notes-input').value = '30 Gün Vadeli Ödeme. Kargo alıcı ödemeli.';

        document.getElementById('prev-req-no').innerText = requestNo;
        document.getElementById('prev-date').innerText = new Date().toLocaleDateString('tr-TR');
        document.getElementById('prev-desc').innerText = description;
        
        this.updatePreview();

        document.getElementById('quoteModal').classList.add('show');
        lucide.createIcons();
    },

    updatePreview() {
        const amt = document.getElementById('quote-amount').value;
        const formattedAmount = amt ? "₺" + Number(amt).toLocaleString('tr-TR', {minimumFractionDigits: 2}) : '₺0.00';
        document.getElementById('prev-amount').innerText = formattedAmount;

        const sup = document.getElementById('po-supplier-input').value;
        document.getElementById('prev-supplier').innerText = sup || 'Belirtilmedi';

        document.getElementById('prev-address').innerText = document.getElementById('po-address-input').value;
        document.getElementById('prev-notes').innerText = document.getElementById('po-notes-input').value;
    },

    printPO() {
        window.print();
    },

    showOrderDetails(id) {
        const req = this.requestsData.find(r => r.id === id);
        if(!req) return;

        document.getElementById('det-req-no').innerText = req.request_no;
        document.getElementById('det-amount').innerText = req.amount;
        document.getElementById('det-date').innerText = req.date;
        document.getElementById('det-desc').innerText = req.description;
        
        const stBadge = `<span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span>`;
        document.getElementById('det-status').innerHTML = stBadge;

        document.getElementById('detailsModal').classList.add('show');
        lucide.createIcons();
    },

    openPaymentModal(id, requestNo, amount) {
        document.getElementById('pay-req-id').value = id;
        document.getElementById('pay-req-no').innerText = requestNo;
        document.getElementById('pay-amount').innerText = amount;
        document.getElementById('paymentModal').classList.add('show');
        lucide.createIcons();
    },

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('show');
        });
    },

    renderDashboardStats(stats) {
        document.getElementById('stat-active-requests').innerText = stats.activeRequests || 0;
        document.getElementById('stat-pending-approvals').innerText = stats.pendingApprovals || 0;
        document.getElementById('stat-active-pos').innerText = stats.activePOs || 0;
        document.getElementById('stat-ready-invoices').innerText = stats.readyInvoices || 0;
        document.getElementById('nav-approval-count').innerText = stats.pendingApprovals || 0;
    },

    filterByStatus(status) {
        // Tablo başlığını güncelle
        const titleMap = {
            'all': 'Tüm Son Talepler',
            'pending': 'Onay Bekleyenler',
            'po': 'Bekleyen Siparişler (PO)',
            'approved': 'Satın Almaya İletilenler'
        };
        const tableTitle = document.getElementById('table-title');
        if(tableTitle) tableTitle.innerText = titleMap[status] || 'Son Talepler';

        // Kart stillerini değiştir (aktif/pasif vurgulama)
        document.querySelectorAll('.stat-card').forEach(card => card.classList.remove('active-filter'));
        const activeCard = document.getElementById(`card-${status}`);
        if(activeCard) activeCard.classList.add('active-filter');

        // Tabloyu filtreleyip çiz
        this.renderTable(status);
        
        // Ekranda tabloyu görünür hale getir, ama all'da fazla kaydırma
        if(status !== 'all') {
            document.querySelector('.dashboard-content').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    renderTable(filterStatus) {
        const tbody = document.getElementById('recent-requests-body');
        tbody.innerHTML = '';
        
        let filteredData = this.requestsData;
        if(filterStatus !== 'all') {
            filteredData = this.requestsData.filter(req => req.status === filterStatus);
        }

        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 32px 0;">Bu kritere uygun kayıt bulunmuyor.</td></tr>`;
            return;
        }

        filteredData.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${req.request_no}</strong></td>
                <td>${req.description}</td>
                <td>${req.amount}</td>
                <td><span class="status-badge ${statusMap[req.status].class}">${statusMap[req.status].label}</span></td>
                <td>${req.date}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    initGridStack() {
        const gridEl = document.getElementById('dashboard-grid');
        if(typeof GridStack !== 'undefined' && gridEl) {
            this.grid = GridStack.init({
                staticGrid: true, // kapalı durumda başla
                cellHeight: '120px',
                margin: 12,
                handle: '.drag-handle',
                animate: true,
                float: true
            });

            // LocalStorage'dan önceki yerleşimi yükle
            const savedLayout = localStorage.getItem('dashboard_grid_layout');
            if (savedLayout) {
                try {
                    const parsed = JSON.parse(savedLayout);
                    this.grid.load(parsed);
                } catch(e) { console.warn("Layout okunamadı", e); }
            }

            // Değişiklik anında LocalStorage'a kaydet
            this.grid.on('change', (e, items) => {
                if(!this.isEditMode) return; // if programmatic
                this.saveGridState();
            });
        }
    },

    saveGridState() {
        if(this.grid) {
            const layout = this.grid.save();
            localStorage.setItem('dashboard_grid_layout', JSON.stringify(layout));
        }
    },

    toggleDashboardEditMode() {
        this.isEditMode = !this.isEditMode;
        const gridEl = document.getElementById('dashboard-grid');
        const btn = document.getElementById('btn-edit-dashboard');

        if(this.isEditMode) {
            if(gridEl) gridEl.classList.add('edit-mode-active');
            if(btn) {
                btn.classList.add('btn-active-edit');
                btn.innerHTML = `<i data-lucide="check"></i> Düzenlemeyi Bitir`;
            }
            if(this.grid) {
                this.grid.setStatic(false); // Enable drag/resize
            }
        } else {
            if(gridEl) gridEl.classList.remove('edit-mode-active');
            if(btn) {
                btn.classList.remove('btn-active-edit');
                btn.innerHTML = `<i data-lucide="layout"></i> Görünümü Düzenle`;
            }
            if(this.grid) {
                this.grid.setStatic(true); // Lock it
                this.saveGridState(); // Save final state on lock
            }
        }
        lucide.createIcons();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

window.app = App;
