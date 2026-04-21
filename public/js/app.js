// ══════════════════════════════════════════════════════════════
//  GST BILLING SOFTWARE - Frontend
// ══════════════════════════════════════════════════════════════

let TOKEN   = localStorage.getItem('gst_token') || '';
let USER    = null;
let COMPANY = null;
let CUSTOMERS = [];
let ITEMS     = [];
let EDIT_INVOICE_ID = null;

try { USER    = JSON.parse(localStorage.getItem('gst_user')    || 'null'); } catch(e){}
try { COMPANY = JSON.parse(localStorage.getItem('gst_company') || 'null'); } catch(e){}

// ── API ───────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({ error: 'Invalid response from server' }));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

// ── Helpers ───────────────────────────────────────────────────
const fmt  = n => parseFloat(n||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtD = d => { if(!d) return '—'; try { return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); } catch { return d; } };
const today  = () => new Date().toISOString().split('T')[0];
const mStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; };
// Indian financial year: Apr 1 of current FY (e.g. Apr 2025 if month>=Apr, else Apr 2024)
const fyStart = () => { const n = new Date(); const yr = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear()-1; return `${yr}-04-01`; };

function payBadge(s) {
  const m = { paid:'badge-green', partial:'badge-yellow', unpaid:'badge-red' };
  return `<span class="badge ${m[s]||'badge-gray'}">${s||'—'}</span>`;
}
function statusBadge(s) {
  const m = { issued:'badge-blue', paid:'badge-green', cancelled:'badge-gray', draft:'badge-yellow' };
  return `<span class="badge ${m[s]||'badge-gray'}">${s||'—'}</span>`;
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type='success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 3500);
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay'))
    document.getElementById('modal-overlay').classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  if (!email || !pass) { errEl.textContent = 'Enter email and password'; errEl.style.display = 'block'; return; }
  try {
    const d = await api('POST', '/api/login', { email, password: pass });
    TOKEN = d.token; USER = d.user;
    localStorage.setItem('gst_token', TOKEN);
    localStorage.setItem('gst_user', JSON.stringify(USER));
    showCompanySelect();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

document.addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    const loginPage = document.getElementById('page-login');
    if (loginPage && loginPage.style.display !== 'none') doLogin();
  }
});

function doLogout() {
  TOKEN = ''; USER = null; COMPANY = null;
  localStorage.clear();
  showLogin();
}

function goSelectCompany() { showCompanySelect(); }

// ── Page routing ──────────────────────────────────────────────
function showLogin() {
  document.getElementById('page-login').style.display = 'flex';
  document.getElementById('page-company').classList.add('hidden');
  document.getElementById('page-app').classList.add('hidden');
}

async function showCompanySelect() {
  document.getElementById('page-login').style.display = 'none';
  document.getElementById('page-company').classList.remove('hidden');
  document.getElementById('page-app').classList.add('hidden');
  const wEl = document.getElementById('welcome-name');
  if (wEl) wEl.textContent = USER ? 'Welcome back, ' + USER.name : '';
  try {
    const companies = await api('GET', '/api/companies');
    const typeLabel = { sales: 'Sales & Invoicing', rental: 'Rental Billing', banquet: 'Banquet Hall' };
    document.getElementById('company-list').innerHTML = companies.map(c => `
      <div class="company-card" onclick="selectCompany(${c.id})">
        <div class="company-card-top ${c.type}">
          <div style="font-size:11px;opacity:.8;text-transform:uppercase;letter-spacing:.05em">${typeLabel[c.type]||c.type}</div>
          <div style="font-size:11px;opacity:.7;margin-top:2px">Prefix: ${c.prefix}</div>
        </div>
        <div class="company-card-body">
          <h3>${c.name}</h3>
          <p>GSTIN: ${c.gstin||'—'}</p>
          <p>${[c.city,c.state].filter(Boolean).join(', ')}</p>
        </div>
      </div>`).join('');
  } catch(e) { toast(e.message, 'error'); }
}

async function selectCompany(id) {
  try {
    const companies = await api('GET', '/api/companies');
    COMPANY = companies.find(c => c.id == id);
    if (!COMPANY) { toast('Company not found', 'error'); return; }
    localStorage.setItem('gst_company', JSON.stringify(COMPANY));
    showApp();
  } catch(e) { toast(e.message, 'error'); }
}

function showApp() {
  document.getElementById('page-login').style.display = 'none';
  document.getElementById('page-company').classList.add('hidden');
  document.getElementById('page-app').classList.remove('hidden');
  const badge = document.getElementById('company-badge');
  badge.className = 'company-badge ' + (COMPANY.type || '');
  badge.innerHTML = `<div class="type-label">${COMPANY.type}</div><div>${COMPANY.name}</div>`;
  const uInfo = document.getElementById('user-info');
  if (uInfo) uInfo.textContent = (USER?.name||'') + ' · ' + (USER?.role||'');
  showPage('dashboard');
}

function showPage(page) {
  document.querySelectorAll('.content-page').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-link[data-page]').forEach(el => el.classList.remove('active'));
  const content = document.getElementById('content-' + page);
  if (content) content.classList.remove('hidden');
  const navLink = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (navLink) navLink.classList.add('active');
  const renders = {
    dashboard:     renderDashboard,
    invoices:      renderInvoices,
    'new-invoice': renderNewInvoice,
    customers:     renderCustomers,
    items:         renderItems,
    reports:       renderReports,
    settings:      renderSettings,
  };
  if (renders[page]) renders[page]();
}

document.querySelectorAll('.nav-link[data-page]').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); showPage(el.dataset.page); });
});

// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════
async function renderDashboard() {
  const el = document.getElementById('content-dashboard');
  el.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const d = await api('GET', `/api/reports/dashboard?company_id=${COMPANY.id}`);
    el.innerHTML = `
      <div class="page-header">
        <div><h1>Dashboard</h1><p>${COMPANY.name}</p></div>
        <button class="btn btn-primary" onclick="showPage('new-invoice')">+ New Invoice</button>
      </div>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-val">₹${fmt(d.totals.rev)}</div><div class="stat-sub">${d.totals.cnt} invoices</div></div>
        <div class="stat-card"><div class="stat-label">This Month</div><div class="stat-val">₹${fmt(d.month.rev)}</div><div class="stat-sub">${d.month.cnt} invoices</div></div>
        <div class="stat-card"><div class="stat-label">Outstanding</div><div class="stat-val" style="color:#e53e3e">₹${fmt(d.unpaid.outstanding)}</div><div class="stat-sub">${d.unpaid.cnt} unpaid</div></div>
        <div class="stat-card"><div class="stat-label">Total GST</div><div class="stat-val">₹${fmt(d.totals.tax)}</div><div class="stat-sub">Collected</div></div>
      </div>
      <div class="card mb-4">
        <div class="card-header"><h3>Recent Invoices</h3>
          <button class="btn btn-ghost btn-sm" onclick="showPage('invoices')">View all →</button></div>
        <div class="table-wrap" style="border:none;border-radius:0">
          <table class="tbl">
            <thead><tr><th>Invoice No</th><th>Customer</th><th>Date</th><th class="r">Amount</th><th>Status</th><th>Payment</th><th>Action</th></tr></thead>
            <tbody>
              ${d.recent.length === 0
                ? '<tr><td colspan="7" class="empty">No active invoices found. Cancelled invoices are excluded from the dashboard. Create a new invoice to see it here.</td></tr>'
                : d.recent.map(i => `<tr>
                    <td><a href="#" onclick="viewInvoice(${i.id})" style="color:#2563eb;font-weight:500">${i.invoice_no}</a></td>
                    <td>${i.cname}</td>
                    <td>${fmtD(i.invoice_date)}</td>
                    <td class="r">₹${fmt(i.total)}</td>
                    <td>${statusBadge(i.status)}</td>
                    <td>${payBadge(i.payment_status)}</td>
                    <td><button class="btn btn-sm btn-secondary" onclick="viewInvoice(${i.id})">View</button></td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ${d.monthly.length > 0 ? `
      <div class="card">
        <div class="card-header"><h3>Monthly Revenue (Last 6 months)</h3></div>
        <div class="card-body">
          <div style="display:flex;gap:10px;align-items:flex-end;height:120px">
            ${(() => {
              const mx = Math.max(...d.monthly.map(m => parseFloat(m.rev)), 1);
              return d.monthly.map(m => `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                  <div style="font-size:10px;color:#718096">₹${(parseFloat(m.rev)/1000).toFixed(0)}k</div>
                  <div style="width:100%;background:#2563eb;border-radius:4px 4px 0 0;height:${Math.max(6,parseFloat(m.rev)/mx*80)}px"></div>
                  <div style="font-size:10px;color:#718096;white-space:nowrap">${m.m}</div>
                </div>`).join('');
            })()}
          </div>
        </div>
      </div>` : ''}`;
  } catch(e) { el.innerHTML = `<div class="empty" style="color:red">${e.message}</div>`; }
}

// ══════════════════════════════════════════════════════════════
//  INVOICES LIST
// ══════════════════════════════════════════════════════════════
async function renderInvoices(search='', status='', from=fyStart(), to=today()) {
  const el = document.getElementById('content-invoices');
  el.innerHTML = `
    <div class="page-header">
      <div><h1>Invoices</h1><p>${COMPANY.name}</p></div>
      <button class="btn btn-primary" onclick="showPage('new-invoice')">+ New Invoice</button>
    </div>
    <div class="filter-bar">
      <input id="inv-search" placeholder="Search invoice no or customer..." value="${search}" style="flex:1;min-width:160px">
      <select id="inv-status">
        <option value="">All Status</option>
        <option value="issued" ${status==='issued'?'selected':''}>Issued</option>
        <option value="cancelled" ${status==='cancelled'?'selected':''}>Cancelled</option>
      </select>
      <input type="date" id="inv-from" value="${from}">
      <input type="date" id="inv-to"   value="${to}">
      <button class="btn btn-primary" onclick="loadInvoices()">Search</button>
      <button class="btn btn-secondary" onclick="renderInvoices()">Clear</button>
    </div>
    <div class="card">
      <div class="table-wrap" style="border:none">
        <table class="tbl">
          <thead><tr><th>Invoice No</th><th>Customer</th><th>Date</th><th>Type</th><th class="r">Amount</th><th class="r">Tax</th><th>Status</th><th>Payment</th><th>Actions</th></tr></thead>
          <tbody id="inv-tbody"><tr><td colspan="9" class="loading">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>`;
  loadInvoices();
}

async function loadInvoices() {
  const search = document.getElementById('inv-search')?.value || '';
  const status = document.getElementById('inv-status')?.value || '';
  const from   = document.getElementById('inv-from')?.value  || '';
  const to     = document.getElementById('inv-to')?.value    || '';
  const tb     = document.getElementById('inv-tbody');
  if (!tb) return;
  try {
    const rows = await api('GET', `/api/invoices?company_id=${COMPANY.id}&search=${encodeURIComponent(search)}&status=${status}&from=${from}&to=${to}&limit=50`);
    tb.innerHTML = rows.length === 0
      ? '<tr><td colspan="9" class="empty">No invoices found</td></tr>'
      : rows.map(i => `<tr>
          <td><a href="#" onclick="viewInvoice(${i.id})" style="color:#2563eb;font-weight:500">${i.invoice_no}</a></td>
          <td>${i.customer_name}</td>
          <td style="white-space:nowrap">${fmtD(i.invoice_date)}</td>
          <td style="text-transform:capitalize">${i.type}</td>
          <td class="r">₹${fmt(i.total)}</td>
          <td class="r" style="color:#718096">₹${fmt(i.total_tax)}</td>
          <td>${statusBadge(i.status)}</td>
          <td>${payBadge(i.payment_status)}</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-secondary" onclick="viewInvoice(${i.id})">View</button>
              <button class="btn btn-sm btn-secondary" onclick="printInvoice(${i.id})">Print</button>
              ${i.status !== 'cancelled' ? `<button class="btn btn-sm btn-secondary" onclick="copyBill(${i.id})">Copy</button>` : ''}
              ${i.status !== 'cancelled' ? `<button class="btn btn-sm btn-danger" onclick="cancelInv(${i.id})">Cancel</button>` : ''}
            </div>
          </td>
        </tr>`).join('');
  } catch(e) {
    if (tb) tb.innerHTML = `<tr><td colspan="9" class="empty" style="color:red">${e.message}</td></tr>`;
  }
}

async function cancelInv(id) {
  if (!confirm('Cancel this invoice? This cannot be undone.')) return;
  try { await api('POST', `/api/invoices/${id}/cancel`); toast('Invoice cancelled'); loadInvoices(); }
  catch(e) { toast(e.message, 'error'); }
}

function printInvoice(id) {
  window.open(`/api/print/${id}?auth=${encodeURIComponent(TOKEN)}`, '_blank');
}

// ══════════════════════════════════════════════════════════════
//  VIEW INVOICE
// ══════════════════════════════════════════════════════════════
async function viewInvoice(id) {
  showPage('invoices');
  const el = document.getElementById('content-invoices');
  el.innerHTML = '<div class="loading">Loading invoice...</div>';
  try {
    const { invoice: inv, items, payments } = await api('GET', `/api/invoices/${id}`);
    const isIGST = inv.tax_type === 'igst';
    const bal    = parseFloat(inv.total) - parseFloat(inv.amount_paid || 0);
    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1>${inv.invoice_no}</h1>
          <div class="flex gap-2" style="margin-top:6px">${statusBadge(inv.status)} ${payBadge(inv.payment_status)}</div>
        </div>
        <div class="flex gap-2" style="flex-wrap:wrap">
          <button class="btn btn-secondary" onclick="renderInvoices()">← Back</button>
          <button class="btn btn-secondary" onclick="printInvoice(${id})">🖨 Print / PDF</button>
          ${inv.status !== 'cancelled' ? `
            <button class="btn btn-secondary" onclick="copyBill(${id})">📋 Copy Bill</button>
            <button class="btn btn-primary"   onclick="editInvoice(${id})">✏ Edit</button>
            ${inv.payment_status !== 'paid' ? `<button class="btn btn-success" onclick="recordPayment(${id},${inv.total},${inv.amount_paid||0})">💰 Record Payment</button>` : ''}
            <button class="btn btn-danger"    onclick="cancelInv2(${id})">✕ Cancel</button>` : ''}
        </div>
      </div>
      <div class="grid-2 mb-4">
        <div class="card card-body">
          <div class="text-muted" style="font-size:11px;text-transform:uppercase;margin-bottom:6px">From</div>
          <div style="font-weight:600;font-size:15px">${inv.coname}</div>
          <div style="color:#718096">${inv.coaddress||''}</div>
          <div style="color:#718096">${[inv.cocity,inv.costate].filter(Boolean).join(', ')}</div>
          <div style="margin-top:4px">GSTIN: <strong>${inv.cogstin||'—'}</strong></div>
          ${inv.cophone ? `<div style="color:#718096">${inv.cophone}</div>` : ''}
        </div>
        <div class="card card-body">
          <div class="text-muted" style="font-size:11px;text-transform:uppercase;margin-bottom:6px">Bill To</div>
          <div style="font-weight:600;font-size:15px">${inv.cname}</div>
          <div style="color:#718096">${inv.caddress||''}</div>
          <div style="color:#718096">${[inv.ccity,inv.cstate].filter(Boolean).join(', ')}</div>
          ${inv.cgstin ? `<div style="margin-top:4px">GSTIN: <strong>${inv.cgstin}</strong></div>` : ''}
          ${inv.cphone ? `<div style="color:#718096">${inv.cphone}</div>` : ''}
        </div>
      </div>
      ${inv.event_name ? `<div class="bg-info mb-4">📅 Event: <strong>${inv.event_name}</strong>${inv.event_date?' · Date: '+fmtD(inv.event_date):''}${inv.pax_count?' · Pax: '+inv.pax_count:''}</div>` : ''}
      <div class="card mb-4">
        <div class="table-wrap" style="border:none">
          <table class="tbl">
            <thead><tr><th>#</th><th>Description</th><th>SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th><th class="r">GST%</th>
              ${isIGST ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'}
              <th class="r">Total</th>
            </tr></thead>
            <tbody>
              ${items.map((item, i) => `<tr>
                <td>${i+1}</td>
                <td><strong>${item.description}</strong></td>
                <td style="color:#a0aec0;font-size:12px">${item.sac_code||'—'}</td>
                <td class="r">${parseFloat(item.qty)} ${item.unit}</td>
                <td class="r">₹${fmt(item.rate)}</td>
                <td class="r">₹${fmt(item.amount)}</td>
                <td class="r">${item.gst_rate}%</td>
                ${isIGST ? `<td class="r">₹${fmt(item.igst_amount)}</td>` : `<td class="r">₹${fmt(item.cgst_amount)}</td><td class="r">₹${fmt(item.sgst_amount)}</td>`}
                <td class="r"><strong>₹${fmt(item.total_amount)}</strong></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <div class="totals-box">
          <div class="totals-row"><span>Subtotal</span><span>₹${fmt(inv.subtotal)}</span></div>
          ${isIGST
            ? `<div class="totals-row"><span>IGST</span><span>₹${fmt(inv.igst_amount)}</span></div>`
            : `<div class="totals-row"><span>CGST</span><span>₹${fmt(inv.cgst_amount)}</span></div>
               <div class="totals-row"><span>SGST</span><span>₹${fmt(inv.sgst_amount)}</span></div>`}
          <div class="totals-row grand"><span>TOTAL</span><span>₹${fmt(inv.total)}</span></div>
          ${parseFloat(inv.amount_paid||0) > 0 ? `
            <div class="totals-row" style="color:#059669"><span>Paid</span><span>₹${fmt(inv.amount_paid)}</span></div>
            <div class="totals-row" style="color:#e53e3e;font-weight:600"><span>Balance</span><span>₹${fmt(bal)}</span></div>` : ''}
        </div>
      </div>
      ${payments.length > 0 ? `
        <div class="card card-body mb-4">
          <div class="section-title">Payment History</div>
          ${payments.map(p => `
            <div class="flex justify-between" style="padding:7px 0;border-bottom:1px solid #f0f4f8">
              <span>${fmtD(p.paid_date)} · <strong>${p.mode.toUpperCase()}</strong>${p.ref_no ? ' · Ref: '+p.ref_no : ''}</span>
              <span style="color:#059669;font-weight:600">₹${fmt(p.amount)}</span>
            </div>`).join('')}
        </div>` : ''}`;
  } catch(e) { el.innerHTML = `<div class="empty" style="color:red">${e.message}</div>`; }
}

async function cancelInv2(id) {
  if (!confirm('Cancel this invoice?')) return;
  try { await api('POST', `/api/invoices/${id}/cancel`); toast('Invoice cancelled'); viewInvoice(id); }
  catch(e) { toast(e.message, 'error'); }
}

function recordPayment(invId, total, paid) {
  const bal = parseFloat(total) - parseFloat(paid || 0);
  openModal('Record Payment', `
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Payment Mode</label>
        <select id="p-mode" class="select">
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="cheque">Cheque</option>
          <option value="neft">NEFT</option>
          <option value="rtgs">RTGS</option>
          <option value="card">Card</option>
        </select>
      </div>
      <div class="form-group">
        <label>Amount (₹)</label>
        <input type="number" id="p-amount" class="input" value="${bal.toFixed(2)}" step="0.01" min="0.01">
      </div>
      <div class="form-group">
        <label>Payment Date</label>
        <input type="date" id="p-date" class="input" value="${today()}">
      </div>
      <div class="form-group">
        <label>Reference No (optional)</label>
        <input id="p-ref" class="input" placeholder="UTR / Cheque no...">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="savePayment(${invId})">Save Payment</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>`);
}

async function savePayment(invId) {
  const amount   = document.getElementById('p-amount')?.value;
  const paid_date= document.getElementById('p-date')?.value;
  const mode     = document.getElementById('p-mode')?.value;
  const ref_no   = document.getElementById('p-ref')?.value;
  if (!amount || parseFloat(amount) <= 0) { toast('Enter a valid amount', 'error'); return; }
  if (!paid_date) { toast('Select payment date', 'error'); return; }
  try {
    await api('POST', `/api/invoices/${invId}/payment`, { mode, amount: parseFloat(amount), paid_date, ref_no });
    toast('Payment recorded!');
    closeModal();
    viewInvoice(invId);
  } catch(e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
//  NEW / EDIT INVOICE
// ══════════════════════════════════════════════════════════════
let invoiceLines = [];

async function renderNewInvoice() {
  EDIT_INVOICE_ID = null;
  invoiceLines = [newLine()];
  await loadMasterData();
  buildInvoiceForm({});
}

async function editInvoice(id) {
  EDIT_INVOICE_ID = id;
  await loadMasterData();
  showPage('new-invoice');
  try {
    const { invoice: inv, items } = await api('GET', `/api/invoices/${id}`);
    invoiceLines = items.map(i => ({
      item_id: i.item_id || '', description: i.description,
      sac_code: i.sac_code || '', qty: i.qty, unit: i.unit,
      rate: i.rate, gst_rate: i.gst_rate
    }));
    if (!invoiceLines.length) invoiceLines = [newLine()];
    buildInvoiceForm(inv);
  } catch(e) { toast(e.message, 'error'); }
}

async function copyBill(id) {
  EDIT_INVOICE_ID = null;
  await loadMasterData();
  showPage('new-invoice');
  try {
    const tpl = await api('GET', `/api/invoices/${id}/copy`);
    invoiceLines = tpl.lines && tpl.lines.length ? tpl.lines : [newLine()];
    buildInvoiceForm({
      customer_id: tpl.customer_id, tax_type: tpl.tax_type,
      notes: tpl.notes, event_name: tpl.event_name, pax_count: tpl.pax_count,
      source_invoice_id: tpl.source_invoice_id
    });
    toast('Bill copied — update the date and save!', 'info');
  } catch(e) { toast(e.message, 'error'); }
}

function newLine() {
  const sac = COMPANY.default_sac !== undefined && COMPANY.default_sac !== null ? COMPANY.default_sac : '';
  const dGst = parseFloat(COMPANY.default_gst);
  const gst = !isNaN(dGst) ? dGst : 18;
  return { item_id: '', description: '', sac_code: sac, qty: 1, unit: 'NOS', rate: 0, gst_rate: gst };
}

async function loadMasterData() {
  try {
    [CUSTOMERS, ITEMS] = await Promise.all([
      api('GET', `/api/customers?company_id=${COMPANY.id}`),
      api('GET', `/api/items?company_id=${COMPANY.id}`)
    ]);
  } catch(e) { toast('Failed to load data: ' + e.message, 'error'); }
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function buildInvoiceForm(inv) {
  const el        = document.getElementById('content-new-invoice');
  const isBanquet = COMPANY.type === 'banquet';
  const isRental  = COMPANY.type === 'rental';

  el.innerHTML = `
    <div class="company-banner ${COMPANY.type}">
      <div>
        <div class="tag">${COMPANY.type} UNIT</div>
        <h2>${COMPANY.name}</h2>
      </div>
      <div style="text-align:right;opacity:0.9">
        <div style="font-size:12px;font-weight:600">GSTIN: ${COMPANY.gstin}</div>
        <div style="font-size:10px">${COMPANY.city}, ${COMPANY.state}</div>
      </div>
    </div>

    <div class="page-header">
      <div><h1>${EDIT_INVOICE_ID ? 'Edit Invoice' : 'New Invoice'}</h1></div>
      <button class="btn btn-secondary" onclick="showPage('invoices')">Cancel</button>
    </div>

    <div class="card mb-4"><div class="card-body">
      <div class="form-row cols-3">
        <div class="form-group"><label>Invoice Date *</label>
          <input type="date" id="f-date" class="input" value="${inv.invoice_date || today()}"></div>
        <div class="form-group"><label>Due Date</label>
          <input type="date" id="f-due" class="input" value="${inv.due_date || ''}"></div>
        <div class="form-group"><label>GST Type</label>
          <select id="f-taxtype" class="select" onchange="renderLines()">
            <option value="cgst_sgst" ${(inv.tax_type||'cgst_sgst') === 'cgst_sgst' ? 'selected' : ''}>CGST + SGST (Intrastate)</option>
            <option value="igst" ${inv.tax_type === 'igst' ? 'selected' : ''}>IGST (Interstate)</option>
          </select></div>
      </div>
    </div></div>

    ${isBanquet ? `
    <div class="card mb-4" style="border-color:#f6ad55"><div class="card-body">
      <div class="form-row cols-3">
        <div class="form-group"><label>Event Name</label>
          <input id="f-event" class="input" placeholder="Wedding, Birthday Party..." value="${inv.event_name||''}"></div>
        <div class="form-group"><label>Event Date</label>
          <input type="date" id="f-edate" class="input" value="${inv.event_date||''}"></div>
        <div class="form-group"><label>Pax Count</label>
          <input type="number" id="f-pax" class="input" placeholder="e.g. 200" value="${inv.pax_count||''}"></div>
      </div>
    </div></div>` : ''}

    <div class="card mb-4"><div class="card-body">
      <div class="flex justify-between items-center mb-4">
        <label>Customer *</label>
        <button class="btn btn-sm btn-secondary" onclick="openCustomerModal()">+ New Customer</button>
      </div>
      <div class="form-row cols-2">
        <div>
          <input id="cust-search" class="input" placeholder="Type to search customer..." oninput="filterCusts(this.value)" autocomplete="off" value="${CUSTOMERS.find(c=>c.id==inv.customer_id)?.name||''}">
          <div id="cust-dropdown" style="display:none;position:absolute;z-index:100;background:white;border:1px solid #e2e8f0;border-radius:0 0 8px 8px;max-height:160px;overflow-y:auto;width:280px"></div>
        </div>
        <select id="f-cust" class="select">
          <option value="">-- Select Customer --</option>
          ${CUSTOMERS.map(c => `<option value="${c.id}" ${c.id == inv.customer_id ? 'selected' : ''}>${c.name}${c.gstin?' ('+c.gstin+')':''}</option>`).join('')}
        </select>
      </div>
    </div></div>

    ${isRental ? `
    <div class="card mb-4"><div class="card-body">
      <div class="section-title" style="margin-bottom:8px">Quick Month Fill</div>
      <p style="font-size:12px;color:#718096;margin-bottom:8px">Click a month to update description in all line items</p>
      <div class="month-pills">
        ${MONTHS.map(m => `<span class="month-pill" onclick="fillMonth('${m}')">${m}</span>`).join('')}
      </div>
    </div></div>` : ''}

    <div class="card mb-4">
      <div class="card-header">
        <h3>Line Items</h3>
        <button class="btn btn-sm btn-secondary" onclick="addLine()">+ Add Row</button>
      </div>
      <div style="overflow-x:auto">
        <table class="line-table" id="lines-table">
          <thead><tr>
            <th style="text-align:left;min-width:250px">Item / Description *</th>
            <th style="text-align:left;width:100px">SAC</th>
            <th style="width:60px">Qty</th>
            <th style="text-align:left;width:55px">Unit</th>
            <th style="width:90px">Rate (₹)</th>
            <th style="width:80px">Amount</th>
            <th style="width:60px">GST%</th>
            <th style="width:72px" id="th-c">CGST</th>
            <th style="width:72px" id="th-s">SGST</th>
            <th style="width:82px">Total</th>
            <th style="width:28px"></th>
          </tr></thead>
          <tbody id="lines-body"></tbody>
        </table>
      </div>
    </div>

    <div class="flex justify-between items-start mb-4" style="flex-wrap:wrap;gap:16px">
      <div style="flex:1;min-width:220px">
        <div class="form-group"><label>Notes</label>
          <textarea id="f-notes" class="input" placeholder="Invoice notes (optional)..." style="height:80px">${inv.notes||''}</textarea>
        </div>
      </div>
      <div class="totals-box" id="totals-box"></div>
    </div>

    <div class="flex justify-end gap-2" style="padding-bottom:32px">
      <button class="btn btn-secondary" onclick="showPage('invoices')">Cancel</button>
      <button class="btn btn-primary" style="padding:10px 28px;font-size:15px" onclick="saveInvoice()">
        ${EDIT_INVOICE_ID ? 'Update Invoice' : 'Save Invoice'}
      </button>
    </div>
    <datalist id="item-datalist">
      ${ITEMS.map(it => `<option value="${it.name}">`).join('')}
    </datalist>`;

  renderLines();
}

function renderLines() {
  const tbody   = document.getElementById('lines-body');
  if (!tbody) return;
  const taxType = document.getElementById('f-taxtype')?.value || 'cgst_sgst';
  const isIGST  = taxType === 'igst';
  const thC = document.getElementById('th-c'); if (thC) thC.textContent = isIGST ? 'IGST'  : 'CGST';
  const thS = document.getElementById('th-s'); if (thS) thS.textContent = isIGST ? '—' : 'SGST';

  tbody.innerHTML = invoiceLines.map((l, i) => {
    const amt  = Math.round(parseFloat(l.qty||0) * parseFloat(l.rate||0) * 100) / 100;
    const gst  = parseFloat(l.gst_rate || 18);
    const cgst = isIGST ? 0 : Math.round(amt * gst / 2 / 100 * 100) / 100;
    const sgst = isIGST ? 0 : Math.round(amt * gst / 2 / 100 * 100) / 100;
    const igst = isIGST ? Math.round(amt * gst / 100 * 100) / 100 : 0;
    const tot  = amt + cgst + sgst + igst;
    return `<tr>
      <td><input list="item-datalist" value="${(l.description||'').replace(/"/g,'&quot;')}" oninput="lineDescChange(${i},this.value)"
        style="width:100%;padding:5px 6px;font-size:12px;border:1px solid #e2e8f0;border-radius:6px" placeholder="Item name or description..."></td>
      <td><input id="li-sac-${i}" value="${l.sac_code||''}" oninput="lineSet(${i},'sac_code',this.value)"
        style="width:90px;padding:5px 6px;font-size:12px;border:1px solid #e2e8f0;border-radius:6px"></td>
      <td><input id="li-qty-${i}" type="number" value="${l.qty}" min="0" step="0.01" oninput="lineSet(${i},'qty',parseFloat(this.value)||0)"
        style="width:55px;padding:5px 6px;font-size:12px;border:1px solid #e2e8f0;border-radius:6px;text-align:right"></td>
      <td><input id="li-unit-${i}" value="${l.unit||'NOS'}" oninput="lineSet(${i},'unit',this.value)"
        style="width:50px;padding:5px 6px;font-size:12px;border:1px solid #e2e8f0;border-radius:6px"></td>
      <td><input id="li-rate-${i}" type="number" value="${l.rate}" min="0" step="0.01" oninput="lineSet(${i},'rate',parseFloat(this.value)||0)"
        style="width:82px;padding:5px 6px;font-size:12px;border:1px solid #e2e8f0;border-radius:6px;text-align:right"></td>
      <td class="amt" id="rc-amt-${i}">₹${fmt(amt)}</td>
      <td><select id="li-gst-${i}" onchange="lineSet(${i},'gst_rate',parseFloat(this.value))"
        style="width:56px;padding:5px 4px;font-size:12px;border:1px solid #e2e8f0;border-radius:6px">
        ${[0,5,12,18,28].map(r => `<option value="${r}" ${r == l.gst_rate ? 'selected' : ''}>${r}%</option>`).join('')}
      </select></td>
      <td class="amt" id="rc-c-${i}">${isIGST ? `₹${fmt(igst)}` : `₹${fmt(cgst)}`}</td>
      <td class="amt" id="rc-s-${i}">${isIGST ? '—' : `₹${fmt(sgst)}`}</td>
      <td class="amt" id="rc-tot-${i}"><strong>₹${fmt(tot)}</strong></td>
      <td>${invoiceLines.length > 1
        ? `<button onclick="removeLine(${i})" style="border:none;background:none;color:#e53e3e;cursor:pointer;font-size:20px;line-height:1;padding:0 4px">×</button>` : ''}</td>
    </tr>`;
  }).join('');
  updateTotals();
}

function lineSet(i, k, v) {
  invoiceLines[i][k] = v;
  // NEVER call renderLines() here — it destroys every input element and
  // steals cursor focus on every keystroke.
  // Instead, recalculate just the display cells for this row in-place.
  if (k === 'qty' || k === 'rate' || k === 'gst_rate') {
    _updateRowDisplay(i);
  }
  // Text fields (description, sac_code, unit) need no recalculation at all.
  updateTotals();
}

// Update only the read-only calculated cells for one row — no inputs touched.
function _updateRowDisplay(i) {
  const l      = invoiceLines[i];
  const isIGST = (document.getElementById('f-taxtype')?.value || 'cgst_sgst') === 'igst';
  const amt    = Math.round(parseFloat(l.qty||0) * parseFloat(l.rate||0) * 100) / 100;
  const gst    = parseFloat(l.gst_rate || 18);
  const cgst   = isIGST ? 0 : Math.round(amt * gst / 2 / 100 * 100) / 100;
  const sgst   = isIGST ? 0 : Math.round(amt * gst / 2 / 100 * 100) / 100;
  const igst   = isIGST ? Math.round(amt * gst / 100 * 100) / 100 : 0;
  const tot    = amt + cgst + sgst + igst;
  const get    = id => document.getElementById(id);
  if (get(`rc-amt-${i}`)) get(`rc-amt-${i}`).textContent          = '₹' + fmt(amt);
  if (get(`rc-c-${i}`))   get(`rc-c-${i}`).textContent            = isIGST ? '₹' + fmt(igst) : '₹' + fmt(cgst);
  if (get(`rc-s-${i}`))   get(`rc-s-${i}`).textContent            = isIGST ? '—' : '₹' + fmt(sgst);
  if (get(`rc-tot-${i}`)) get(`rc-tot-${i}`).innerHTML            = '<strong>₹' + fmt(tot) + '</strong>';
}

function lineDescChange(i, val) {
  invoiceLines[i].description = val;
  const item = ITEMS.find(it => it.name === val);
  if (item) {
    invoiceLines[i].item_id  = item.id;
    invoiceLines[i].rate     = item.rate;
    invoiceLines[i].sac_code = item.sac_code || item.hsn_code || '';
    invoiceLines[i].gst_rate = item.gst_rate;
    invoiceLines[i].unit     = item.unit || 'NOS';
    
    // Update the UI fields manually
    const get = id => document.getElementById(id);
    if (get(`li-sac-${i}`))  get(`li-sac-${i}`).value  = invoiceLines[i].sac_code;
    if (get(`li-rate-${i}`)) get(`li-rate-${i}`).value = invoiceLines[i].rate;
    if (get(`li-unit-${i}`)) get(`li-unit-${i}`).value = invoiceLines[i].unit;
    if (get(`li-gst-${i}`))  get(`li-gst-${i}`).value  = invoiceLines[i].gst_rate;
    
    _updateRowDisplay(i);
  }
  updateTotals();
}

function addLine()    { invoiceLines.push(newLine()); renderLines(); }
function removeLine(i){ invoiceLines.splice(i, 1); renderLines(); }

function fillMonth(m) {
  invoiceLines = invoiceLines.map(l => {
    let desc = l.description || '';
    const replaced = desc.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi, m);
    return { ...l, description: replaced !== desc ? replaced : (desc || 'Rent for ' + m) };
  });
  renderLines();
  toast(`Description updated to ${m}`, 'info');
}

function updateTotals() {
  const taxType = document.getElementById('f-taxtype')?.value || 'cgst_sgst';
  const isIGST  = taxType === 'igst';
  let sub = 0, c = 0, s = 0, ig = 0;
  invoiceLines.forEach(l => {
    const amt = Math.round(parseFloat(l.qty||0) * parseFloat(l.rate||0) * 100) / 100;
    const gst = parseFloat(l.gst_rate || 18);
    sub += amt;
    c   += isIGST ? 0 : Math.round(amt * gst / 2 / 100 * 100) / 100;
    s   += isIGST ? 0 : Math.round(amt * gst / 2 / 100 * 100) / 100;
    ig  += isIGST ? Math.round(amt * gst / 100 * 100) / 100 : 0;
  });
  const tax = Math.round((c+s+ig)*100)/100;
  const tot = Math.round(sub + tax);
  const box = document.getElementById('totals-box');
  if (!box) return;
  box.innerHTML = `
    <div class="totals-row"><span>Subtotal</span><span>₹${fmt(sub)}</span></div>
    ${isIGST
      ? `<div class="totals-row"><span>IGST</span><span>₹${fmt(ig)}</span></div>`
      : `<div class="totals-row"><span>CGST</span><span>₹${fmt(c)}</span></div>
         <div class="totals-row"><span>SGST</span><span>₹${fmt(s)}</span></div>`}
    <div class="totals-row grand"><span>TOTAL</span><span>₹${fmt(tot)}</span></div>`;
}

function filterCusts(val) {
  const dd = document.getElementById('cust-dropdown');
  if (!val.trim()) { dd.style.display = 'none'; return; }
  const matches = CUSTOMERS.filter(c =>
    c.name.toLowerCase().includes(val.toLowerCase()) ||
    (c.phone && c.phone.includes(val))
  );
  if (!matches.length) { dd.style.display = 'none'; return; }
  dd.style.display = 'block';
  dd.innerHTML = matches.map(c => `
    <div onclick="pickCust(${c.id},'${c.name.replace(/'/g,"\\'")}')"
      style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f0f4f8;font-size:13px"
      onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      ${c.name}${c.gstin ? ' · <span style="color:#a0aec0;font-size:11px">'+c.gstin+'</span>' : ''}
    </div>`).join('');
}

function pickCust(id, name) {
  const sel = document.getElementById('f-cust');
  const inp = document.getElementById('cust-search');
  const dd  = document.getElementById('cust-dropdown');
  if (sel) sel.value = id;
  if (inp) inp.value = name;
  if (dd)  dd.style.display = 'none';
}

async function saveInvoice() {
  const custId = document.getElementById('f-cust')?.value;
  const date   = document.getElementById('f-date')?.value;
  if (!custId) { toast('Please select a customer', 'error'); return; }
  if (!date)   { toast('Please enter invoice date', 'error'); return; }
  const validLines = invoiceLines.filter(l => l.description && l.description.trim());
  if (!validLines.length) { toast('Add at least one line item with description', 'error'); return; }

  const taxType = document.getElementById('f-taxtype')?.value || 'cgst_sgst';
  const payload = {
    company_id:        COMPANY.id,
    customer_id:       parseInt(custId),
    invoice_date:      date,
    due_date:          document.getElementById('f-due')?.value   || null,
    type:              COMPANY.type,
    tax_type:          taxType,
    notes:             document.getElementById('f-notes')?.value || '',
    event_name:        document.getElementById('f-event')?.value || null,
    event_date:        document.getElementById('f-edate')?.value || null,
    pax_count:         document.getElementById('f-pax')?.value   || null,
    lines:             validLines,
  };

  try {
    if (EDIT_INVOICE_ID) {
      await api('PUT', `/api/invoices/${EDIT_INVOICE_ID}`, payload);
      toast('Invoice updated!');
      viewInvoice(EDIT_INVOICE_ID);
    } else {
      const r = await api('POST', '/api/invoices', payload);
      toast(`Invoice ${r.invoice_no} created!`);
      viewInvoice(r.id);
    }
  } catch(e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
//  CUSTOMERS
// ══════════════════════════════════════════════════════════════
async function renderCustomers(search = '') {
  const el = document.getElementById('content-customers');
  el.innerHTML = `
    <div class="page-header">
      <h1>Customers</h1>
      <button class="btn btn-primary" onclick="openCustomerModal()">+ Add Customer</button>
    </div>
    <div class="filter-bar">
      <input id="cust-q" class="input" placeholder="Search by name, phone, GSTIN..." value="${search}"
        oninput="renderCustomers(this.value)" style="max-width:320px">
    </div>
    <div class="card">
      <div class="table-wrap" style="border:none">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>City</th><th>GSTIN</th><th>Actions</th></tr></thead>
          <tbody id="cust-tbody"><tr><td colspan="6" class="loading">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>`;
  try {
    const rows = await api('GET', `/api/customers?company_id=${COMPANY.id}&search=${encodeURIComponent(search)}`);
    const tb = document.getElementById('cust-tbody');
    if (!tb) return;
    tb.innerHTML = rows.length === 0
      ? '<tr><td colspan="6" class="empty">No customers yet. Add your first customer!</td></tr>'
      : rows.map(c => `<tr>
          <td><strong>${c.name}</strong></td>
          <td>${c.phone || '—'}</td>
          <td>${c.email || '—'}</td>
          <td>${c.city  || '—'}</td>
          <td style="font-size:12px;font-family:monospace">${c.gstin || '—'}</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-secondary" onclick='openCustomerModal(${JSON.stringify(c).replace(/'/g,"&#39;")})'>Edit</button>
              <button class="btn btn-sm btn-danger" onclick="delCustomer(${c.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('');
  } catch(e) {
    const tb = document.getElementById('cust-tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="6" class="empty" style="color:red">${e.message}</td></tr>`;
  }
}

function openCustomerModal(c = null) {
  openModal(c ? 'Edit Customer' : 'Add Customer', `
    <div class="form-row cols-2">
      <div class="form-group" style="grid-column:1/-1">
        <label>Full Name *</label>
        <input id="cm-name" class="input" value="${c?.name||''}" placeholder="Customer name">
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input id="cm-phone" class="input" value="${c?.phone||''}" placeholder="9999000000">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input id="cm-email" class="input" value="${c?.email||''}" placeholder="email@example.com">
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label>Address</label>
        <input id="cm-addr" class="input" value="${c?.address||''}" placeholder="Street address">
      </div>
      <div class="form-group">
        <label>City</label>
        <input id="cm-city" class="input" value="${c?.city||''}" placeholder="Delhi">
      </div>
      <div class="form-group">
        <label>State</label>
        <input id="cm-state" class="input" value="${c?.state||''}" placeholder="Delhi">
      </div>
      <div class="form-group">
        <label>GSTIN (if GST registered)</label>
        <input id="cm-gstin" class="input" value="${c?.gstin||''}" placeholder="15-digit GSTIN" maxlength="15"
          style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()">
      </div>
      <div class="form-group">
        <label>PAN Number</label>
        <input id="cm-pan" class="input" value="${c?.pan_no||''}" placeholder="ABCDE1234F" maxlength="10"
          style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveCustomer(${c?.id||0})">Save Customer</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>`);
}

async function saveCustomer(id) {
  const name  = document.getElementById('cm-name')?.value?.trim();
  if (!name)  { toast('Customer name is required', 'error'); return; }
  const data  = {
    name,
    phone:   document.getElementById('cm-phone')?.value  || '',
    email:   document.getElementById('cm-email')?.value  || '',
    address: document.getElementById('cm-addr')?.value   || '',
    city:    document.getElementById('cm-city')?.value   || '',
    state:   document.getElementById('cm-state')?.value  || '',
    gstin:   document.getElementById('cm-gstin')?.value  || '',
    pan_no:  document.getElementById('cm-pan')?.value    || '',
  };
  try {
    if (id) {
      await api('PUT', `/api/customers/${id}`, data);
      toast('Customer updated!');
    } else {
      await api('POST', '/api/customers', { ...data, company_id: COMPANY.id });
      toast('Customer added!');
    }
    closeModal();
    await renderCustomers();
    // Silently refresh invoice dropdowns — errors here must NOT override the save toast
    try { await loadMasterData(); } catch(_) {}
  } catch(e) { toast(e.message, 'error'); }
}

async function delCustomer(id) {
  if (!confirm('Delete this customer? This cannot be undone.')) return;
  try { await api('DELETE', `/api/customers/${id}`); toast('Deleted'); renderCustomers(); }
  catch(e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
//  ITEMS
// ══════════════════════════════════════════════════════════════
async function renderItems(search = '') {
  const el = document.getElementById('content-items');
  el.innerHTML = `
    <div class="page-header">
      <div><h1>Items & Services</h1><p>Master catalogue for invoice line items</p></div>
      <button class="btn btn-primary" onclick="openItemModal()">+ Add Item</button>
    </div>
    <div class="filter-bar">
      <input class="input" placeholder="Search by name or SAC code..." value="${search}"
        oninput="renderItems(this.value)" style="max-width:320px">
    </div>
    <div class="card">
      <div class="table-wrap" style="border:none">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Type</th><th>SAC / HSN</th><th class="r">Rate (₹)</th><th class="r">GST%</th><th>Unit</th><th>Actions</th></tr></thead>
          <tbody id="items-tbody"><tr><td colspan="7" class="loading">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>`;
  try {
    const rows = await api('GET', `/api/items?company_id=${COMPANY.id}&search=${encodeURIComponent(search)}`);
    const tb = document.getElementById('items-tbody');
    if (!tb) return;
    tb.innerHTML = rows.length === 0
      ? '<tr><td colspan="7" class="empty">No items yet. Add your first item/service!</td></tr>'
      : rows.map(it => `<tr>
          <td><strong>${it.name}</strong></td>
          <td><span class="badge ${it.type==='service'?'badge-blue':'badge-green'}">${it.type}</span></td>
          <td style="font-size:12px;font-family:monospace">${it.sac_code||it.hsn_code||'—'}</td>
          <td class="r">₹${fmt(it.rate)}</td>
          <td class="r">${it.gst_rate}%</td>
          <td>${it.unit}</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-secondary" onclick='openItemModal(${JSON.stringify(it).replace(/'/g,"&#39;")})'>Edit</button>
              <button class="btn btn-sm btn-danger" onclick="delItem(${it.id})">Remove</button>
            </div>
          </td>
        </tr>`).join('');
  } catch(e) {
    const tb = document.getElementById('items-tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="7" class="empty" style="color:red">${e.message}</td></tr>`;
  }
}

function openItemModal(it = null) {
  openModal(it ? 'Edit Item' : 'Add Item', `
    <div class="form-row cols-2">
      <div class="form-group" style="grid-column:1/-1">
        <label>Name *</label>
        <input id="im-name" class="input" value="${it?.name||''}" placeholder="e.g. Office Space Rent">
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="im-type" class="select">
          <option value="service" ${!it||it?.type==='service'?'selected':''}>Service</option>
          <option value="goods"   ${it?.type==='goods'?'selected':''}>Goods</option>
        </select>
      </div>
      <div class="form-group">
        <label>SAC / HSN Code</label>
        <input id="im-sac" class="input" value="${it?.sac_code||it?.hsn_code||''}" placeholder="e.g. 997212">
      </div>
      <div class="form-group">
        <label>Default Rate (₹)</label>
        <input type="number" id="im-rate" class="input" value="${it?.rate||0}" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label>GST Rate %</label>
        <select id="im-gst" class="select">
          ${[0,5,12,18,28].map(r => `<option value="${r}" ${r==(it?.gst_rate??18)?'selected':''}>${r}%</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label>Unit</label>
        <input id="im-unit" class="input" value="${it?.unit||'NOS'}" placeholder="NOS / Month / Pax / Day...">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveItem(${it?.id||0})">Save Item</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>`);
}

async function saveItem(id) {
  const name = document.getElementById('im-name')?.value?.trim();
  if (!name) { toast('Item name is required', 'error'); return; }
  const type = document.getElementById('im-type')?.value || 'service';
  const sac  = document.getElementById('im-sac')?.value  || '';
  const data = {
    name,
    type,
    sac_code:  type === 'service' ? sac : '',
    hsn_code:  type === 'goods'   ? sac : '',
    rate:      parseFloat(document.getElementById('im-rate')?.value) || 0,
    gst_rate:  parseFloat(document.getElementById('im-gst')?.value)  || 18,
    unit:      document.getElementById('im-unit')?.value || 'NOS',
  };
  try {
    if (id) { await api('PUT',  `/api/items/${id}`, data); toast('Item updated!'); }
    else    { await api('POST', '/api/items', { ...data, company_id: COMPANY.id }); toast('Item added!'); }
    closeModal();
    renderItems();
  } catch(e) { toast(e.message, 'error'); }
}

async function delItem(id) {
  if (!confirm('Remove this item from catalogue?')) return;
  try { await api('DELETE', `/api/items/${id}`); toast('Removed'); renderItems(); }
  catch(e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
//  REPORTS
// ══════════════════════════════════════════════════════════════
async function renderReports() {
  const el = document.getElementById('content-reports');
  el.innerHTML = `
    <div class="page-header"><h1>GST Report</h1></div>
    <div class="filter-bar">
      <div>
        <label class="label" style="margin-bottom:3px">From Date</label>
        <input type="date" id="r-from" class="input" value="${fyStart()}">
      </div>
      <div>
        <label class="label" style="margin-bottom:3px">To Date</label>
        <input type="date" id="r-to" class="input" value="${today()}">
      </div>
      <div style="align-self:flex-end">
        <button class="btn btn-primary" onclick="loadGSTReport()">Generate Report</button>
      </div>
      <div style="align-self:flex-end">
        <button class="btn btn-secondary" onclick="exportCSV()">Export CSV</button>
      </div>
    </div>
    <div id="report-body" style="color:#718096;padding:20px">Click "Generate Report" to load data...</div>`;
}

let _reportData = null;

async function loadGSTReport() {
  const from = document.getElementById('r-from')?.value;
  const to   = document.getElementById('r-to')?.value;
  const el   = document.getElementById('report-body');
  el.innerHTML = '<div class="loading">Loading report...</div>';
  try {
    _reportData = await api('GET', `/api/reports/gst?company_id=${COMPANY.id}&from=${from}&to=${to}`);
    const s = _reportData.summary;
    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-label">Taxable Amount</div><div class="stat-val">₹${fmt(s.taxable)}</div></div>
        <div class="stat-card"><div class="stat-label">CGST</div><div class="stat-val">₹${fmt(s.cgst)}</div></div>
        <div class="stat-card"><div class="stat-label">SGST</div><div class="stat-val">₹${fmt(s.sgst)}</div></div>
        <div class="stat-card"><div class="stat-label">IGST</div><div class="stat-val">₹${fmt(s.igst)}</div></div>
        <div class="stat-card"><div class="stat-label">Total GST</div><div class="stat-val">₹${fmt(s.tax)}</div></div>
        <div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-val">₹${fmt(s.total)}</div></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Invoice-wise Detail (${_reportData.invoices.length} invoices)</h3></div>
        <div class="table-wrap" style="border:none">
          <table class="tbl">
            <thead><tr><th>Invoice No</th><th>Date</th><th>Customer</th><th>GSTIN</th>
              <th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">IGST</th><th class="r">Total</th></tr></thead>
            <tbody>
              ${_reportData.invoices.length === 0
                ? '<tr><td colspan="9" class="empty">No invoices in this period</td></tr>'
                : _reportData.invoices.map(i => `<tr>
                    <td style="color:#2563eb;font-weight:500">${i.invoice_no}</td>
                    <td>${fmtD(i.invoice_date)}</td>
                    <td>${i.cname}</td>
                    <td style="font-size:12px;font-family:monospace">${i.cgstin||'—'}</td>
                    <td class="r">₹${fmt(i.subtotal)}</td>
                    <td class="r">₹${fmt(i.cgst_amount)}</td>
                    <td class="r">₹${fmt(i.sgst_amount)}</td>
                    <td class="r">₹${fmt(i.igst_amount)}</td>
                    <td class="r"><strong>₹${fmt(i.total)}</strong></td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch(e) { el.innerHTML = `<div class="empty" style="color:red">${e.message}</div>`; }
}

function exportCSV() {
  if (!_reportData) { toast('Generate report first', 'error'); return; }
  const rows = [
    ['Invoice No','Date','Customer','GSTIN','Taxable Amt','CGST','SGST','IGST','Total Tax','Total'],
    ..._reportData.invoices.map(i => [i.invoice_no, i.invoice_date, i.cname, i.cgstin||'', i.subtotal, i.cgst_amount, i.sgst_amount, i.igst_amount, i.total_tax, i.total])
  ];
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a   = document.createElement('a');
  a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `GST_Report_${document.getElementById('r-from')?.value}_${document.getElementById('r-to')?.value}.csv`;
  a.click();
  toast('CSV downloaded!');
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════
async function renderSettings() {
  const el = document.getElementById('content-settings');
  el.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const companies = await api('GET', '/api/companies');
    const c = companies.find(x => x.id === COMPANY.id) || COMPANY;
    el.innerHTML = `
      <div class="page-header">
        <h1>Settings</h1>
        <button class="btn btn-primary" onclick="saveSettings()">Save Changes</button>
      </div>
      <div class="card mb-4"><div class="card-header"><h3>Company Information</h3></div><div class="card-body">
        <div class="form-row cols-2">
          <div class="form-group" style="grid-column:1/-1">
            <label>Company Logo</label>
            <div style="display:flex;align-items:center;gap:15px">
              <div id="logo-preview-wrap" style="width:80px;height:80px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;display:flex;align-items:center;justify-content:center;overflow:hidden">
                ${c.logo_url ? `<img src="${c.logo_url}" style="max-width:100%;max-height:100%">` : '<span style="color:#a0aec0;font-size:10px">No Logo</span>'}
              </div>
              <div>
                <input type="file" id="logo-file" style="display:none" accept="image/*" onchange="doUploadLogo(this)">
                <button class="btn btn-secondary btn-sm" onclick="document.getElementById('logo-file').click()">Upload Logo</button>
                <input type="hidden" id="s-logo" value="${c.logo_url||''}">
                <p style="font-size:11px;color:#718096;margin-top:5px">JPG, PNG (Max 2MB)</p>
              </div>
            </div>
          </div>
          <div class="form-group" style="grid-column:1/-1"><label>Company Name</label><input id="s-name" class="input" value="${c.name||''}"></div>
          <div class="form-group"><label>GSTIN</label><input id="s-gstin" class="input" value="${c.gstin||''}" style="text-transform:uppercase" maxlength="15"></div>
          <div class="form-group"><label>CIN Number</label><input id="s-cin" class="input" value="${c.cin_no||''}"></div>
          <div class="form-group"><label>PAN Number</label><input id="s-pan" class="input" value="${c.pan_no||''}"></div>
          <div class="form-group"><label>Invoice Prefix (e.g. RNT/26/)</label><input id="s-prefix" class="input" value="${c.prefix||''}"></div>
          <div class="form-group"><label>Phone</label><input id="s-phone" class="input" value="${c.phone||''}"></div>
          <div class="form-group" style="grid-column:1/-1"><label>Address</label><input id="s-addr" class="input" value="${c.address||''}"></div>
          <div class="form-group"><label>City</label><input id="s-city" class="input" value="${c.city||''}"></div>
          <div class="form-group"><label>State</label><input id="s-state" class="input" value="${c.state||''}"></div>
          <div class="form-group"><label>Email</label><input id="s-email" class="input" value="${c.email||''}"></div>
        </div>
      </div></div>
      <div class="card mb-4"><div class="card-header"><h3>Bank Details (shown on invoice)</h3></div><div class="card-body">
        <div class="form-row cols-2">
          <div class="form-group"><label>Bank Name</label><input id="s-bank" class="input" value="${c.bank_name||''}"></div>
          <div class="form-group"><label>Account Number</label><input id="s-acc" class="input" value="${c.bank_account||''}"></div>
          <div class="form-group"><label>IFSC Code</label><input id="s-ifsc" class="input" value="${c.bank_ifsc||''}" style="text-transform:uppercase"></div>
          <div class="form-group"><label>Branch</label><input id="s-branch" class="input" value="${c.bank_branch||''}"></div>
        </div>
      </div></div>
      <div class="card mb-4"><div class="card-header"><h3>GST & Billing Defaults</h3></div><div class="card-body">
        <div class="form-row cols-2">
          <div class="form-group"><label>Default SAC Code</label><input id="s-dsac" class="input" value="${c.default_sac||''}" placeholder="e.g. 9972"></div>
          <div class="form-group"><label>Default GST Rate %</label>
            <select id="s-dgst" class="select">
              ${[0,5,12,18,28].map(r => `<option value="${r}" ${r==(parseFloat(c.default_gst)||18)?'selected':''}>${r}%</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row cols-3">
          <div class="form-group"><label>Tax Breakdown: CGST %</label><input type="number" id="s-cgst" class="input" value="${c.cgst_rate||9}" step="0.01"></div>
          <div class="form-group"><label>SGST %</label><input type="number" id="s-sgst" class="input" value="${c.sgst_rate||9}" step="0.01"></div>
          <div class="form-group"><label>IGST %</label><input type="number" id="s-igst" class="input" value="${c.igst_rate||18}" step="0.01"></div>
        </div>
      </div></div>
      <div class="card mb-4"><div class="card-header"><h3>Invoice Customization</h3></div><div class="card-body">
        <div class="form-group"><label>Default Terms</label><textarea id="s-terms" class="input" style="height:72px">${c.invoice_terms||''}</textarea></div>
        <div class="form-group"><label>Invoice Footer</label><textarea id="s-footer" class="input" style="height:60px">${c.invoice_footer||'This is a computer generated invoice. Thank you for your business.'}</textarea></div>
      </div></div>
      <div class="flex justify-end" style="padding-bottom:32px">
        <button class="btn btn-primary btn-lg" onclick="saveSettings()">Save All Changes</button>
      </div>`;
  } catch(e) { el.innerHTML = `<div class="empty" style="color:red">${e.message}</div>`; }
}

async function doUploadLogo(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 2 * 1024 * 1024) { toast('File too large (max 2MB)', 'error'); return; }
  
  const fd = new FormData();
  fd.append('logo', file);
  
  try {
    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + TOKEN },
      body: fd
    });
    
    // Check if response is JSON
    const contentType = r.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      document.getElementById('s-logo').value = d.url;
      document.getElementById('logo-preview-wrap').innerHTML = `<img src="${d.url}" style="max-width:100%;max-height:100%">`;
      toast('Logo uploaded! Save changes to apply.');
    } else {
      const text = await r.text();
      console.error('Non-JSON response:', text);
      throw new Error(`Server returned an invalid response (Status: ${r.status}). Please restart your server.`);
    }
  } catch(e) { 
    toast(e.message, 'error');
    console.error('Upload catch:', e);
  }
}

async function saveSettings() {
  const data = {
    name:           document.getElementById('s-name')?.value   || '',
    gstin:          document.getElementById('s-gstin')?.value  || '',
    cin_no:         document.getElementById('s-cin')?.value    || '',
    pan_no:         document.getElementById('s-pan')?.value    || '',
    prefix:         document.getElementById('s-prefix')?.value || '',
    address:        document.getElementById('s-addr')?.value   || '',
    city:           document.getElementById('s-city')?.value   || '',
    state:          document.getElementById('s-state')?.value  || '',
    phone:          document.getElementById('s-phone')?.value  || '',
    email:          document.getElementById('s-email')?.value  || '',
    bank_name:      document.getElementById('s-bank')?.value   || '',
    bank_account:   document.getElementById('s-acc')?.value    || '',
    bank_ifsc:      document.getElementById('s-ifsc')?.value   || '',
    bank_branch:    document.getElementById('s-branch')?.value || '',
    cgst_rate:      document.getElementById('s-cgst')?.value   || 9,
    sgst_rate:      document.getElementById('s-sgst')?.value   || 9,
    igst_rate:      document.getElementById('s-igst')?.value   || 18,
    invoice_terms:  document.getElementById('s-terms')?.value  || '',
    invoice_footer: document.getElementById('s-footer')?.value || '',
    logo_url:       document.getElementById('s-logo')?.value   || '',
    default_sac:    document.getElementById('s-dsac')?.value   || '',
    default_gst:    parseFloat(document.getElementById('s-dgst')?.value) || 18,
  };
  try {
    await api('PUT', `/api/companies/${COMPANY.id}`, data);
    COMPANY = { ...COMPANY, ...data };
    localStorage.setItem('gst_company', JSON.stringify(COMPANY));
    // Update badge
    const badge = document.getElementById('company-badge');
    if (badge) badge.innerHTML = `<div class="type-label">${COMPANY.type}</div><div>${COMPANY.name}</div>`;
    toast('Settings saved!');
  } catch(e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
window.onload = () => {
  if (TOKEN && USER && COMPANY) {
    showApp();
  } else if (TOKEN && USER) {
    showCompanySelect();
  } else {
    showLogin();
  }
};
