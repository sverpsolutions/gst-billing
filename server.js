require('dotenv').config({ override: true });
const express = require('express');
const mysql   = require('mysql2/promise');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const multer  = require('multer');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gst_secret_2024';

const pool = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  database:           process.env.DB_NAME || 'gst_billing',
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASS || '',
  waitForConnections: true,
  connectionLimit:    10,
  timezone:           '+05:30',
  dateStrings:        true,
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Multer Config ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'));
  }
});

// ── Auth ──────────────────────────────────────────────────────
const auth = (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please login again' });
  }
};

// ── Async error wrapper ───────────────────────────────────────
const go = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── GST Calculator ────────────────────────────────────────────
function calcTotals(lines, taxType) {
  const isIGST = taxType === 'igst';
  let sub = 0, cgst = 0, sgst = 0, igst = 0;
  const calc = (lines || []).filter(l => l.description).map(item => {
    const amt  = Math.round(parseFloat(item.qty||1) * parseFloat(item.rate||0) * 100) / 100;
    const gR   = parseFloat(item.gst_rate || 18);
    const c    = isIGST ? 0 : Math.round(amt * gR / 2 / 100 * 100) / 100;
    const s    = isIGST ? 0 : Math.round(amt * gR / 2 / 100 * 100) / 100;
    const ig   = isIGST ? Math.round(amt * gR / 100 * 100) / 100 : 0;
    sub += amt; cgst += c; sgst += s; igst += ig;
    return { ...item, amount: amt, cgst_amount: c, sgst_amount: s, igst_amount: ig,
             tax_amount: c+s+ig, total_amount: amt+c+s+ig };
  });
  const tax  = Math.round((cgst+sgst+igst)*100)/100;
  const raw  = sub + tax;
  const tot  = Math.round(raw);
  const roff = Math.round((tot - raw)*100)/100;
  return { calc, subtotal: Math.round(sub*100)/100, cgst: Math.round(cgst*100)/100,
           sgst: Math.round(sgst*100)/100, igst: Math.round(igst*100)/100,
           totalTax: tax, roundOff: roff, total: tot };
}

// ══════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════
app.post('/api/login', go(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const [rows] = await pool.execute('SELECT * FROM users WHERE email=? AND active=1', [email.trim().toLowerCase()]);
  if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id:rows[0].id, name:rows[0].name, email:rows[0].email, role:rows[0].role }, JWT_SECRET, { expiresIn:'10h' });
  res.json({ token, user: { id:rows[0].id, name:rows[0].name, email:rows[0].email, role:rows[0].role } });
}));

app.post('/api/upload', auth, upload.single('logo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    console.log('✅ Logo uploaded:', req.file.filename);
    res.json({ url: '/uploads/' + req.file.filename });
  } catch (err) {
    console.error('❌ Upload Route Error:', err.message);
    res.status(500).json({ error: 'Internal server error during upload' });
  }
});

// Manual error handler for multer errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Only images are allowed') {
    console.error('❌ Multer Error:', err.message);
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ══════════════════════════════════════════════════════════════
// COMPANIES
// ══════════════════════════════════════════════════════════════
app.get('/api/companies', auth, go(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT c.*, cs.cgst_rate, cs.sgst_rate, cs.igst_rate, cs.invoice_terms, cs.invoice_footer, cs.default_sac, cs.default_gst FROM companies c LEFT JOIN company_settings cs ON cs.company_id=c.id GROUP BY c.id ORDER BY c.id'
  );
  res.json(rows);
}));

app.put('/api/companies/:id', auth, go(async (req, res) => {
  const { name,gstin,cin_no,pan_no,address,city,state,phone,email,bank_name,bank_account,bank_ifsc,bank_branch,invoice_terms,invoice_footer,cgst_rate,sgst_rate,igst_rate,logo_url,default_sac,default_gst,prefix } = req.body;
  await pool.execute(
    'UPDATE companies SET name=?,gstin=?,cin_no=?,pan_no=?,address=?,city=?,state=?,phone=?,email=?,bank_name=?,bank_account=?,bank_ifsc=?,bank_branch=?,logo_url=?,prefix=? WHERE id=?',
    [name||'',gstin||'',cin_no||'',pan_no||'',address||'',city||'',state||'',phone||'',email||'',bank_name||'',bank_account||'',bank_ifsc||'',bank_branch||'',logo_url||null,prefix||'',req.params.id]
  );
  await pool.execute(
    `INSERT INTO company_settings (company_id,cgst_rate,sgst_rate,igst_rate,invoice_terms,invoice_footer,default_sac,default_gst)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE cgst_rate=VALUES(cgst_rate),sgst_rate=VALUES(sgst_rate),igst_rate=VALUES(igst_rate),invoice_terms=VALUES(invoice_terms),invoice_footer=VALUES(invoice_footer),default_sac=VALUES(default_sac),default_gst=VALUES(default_gst)`,
    [req.params.id,cgst_rate||9,sgst_rate||9,igst_rate||18,invoice_terms||'',invoice_footer||'',default_sac||null,default_gst||18.00]
  );
  res.json({ ok:true });
}));

// ══════════════════════════════════════════════════════════════
// CUSTOMERS
// ══════════════════════════════════════════════════════════════
app.get('/api/customers', auth, go(async (req, res) => {
  const { company_id, search } = req.query;
  let sql = 'SELECT * FROM customers WHERE 1=1';
  const p = [];
  if (company_id) { sql += ' AND company_id=?'; p.push(company_id); }
  if (search)     { sql += ' AND (name LIKE ? OR phone LIKE ? OR gstin LIKE ?)'; const s=`%${search}%`; p.push(s,s,s); }
  sql += ' ORDER BY name LIMIT 500';
  const [rows] = await pool.execute(sql, p);
  res.json(rows);
}));

app.post('/api/customers', auth, go(async (req, res) => {
  const { company_id, name, phone, email, address, city, state, gstin, pan_no } = req.body;
  if (!company_id) return res.status(400).json({ error: 'company_id is required' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Customer name is required' });
  const [r] = await pool.execute(
    'INSERT INTO customers (company_id,name,phone,email,address,city,state,gstin,pan_no) VALUES (?,?,?,?,?,?,?,?,?)',
    [company_id, name.trim(), phone||'', email||'', address||'', city||'', state||'', gstin||'', pan_no||null]
  );
  const [[row]] = await pool.execute('SELECT * FROM customers WHERE id=?', [r.insertId]);
  res.json(row);
}));

app.put('/api/customers/:id', auth, go(async (req, res) => {
  const { name, phone, email, address, city, state, gstin, pan_no } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  await pool.execute(
    'UPDATE customers SET name=?,phone=?,email=?,address=?,city=?,state=?,gstin=?,pan_no=? WHERE id=?',
    [name.trim(), phone||'', email||'', address||'', city||'', state||'', gstin||'', pan_no||null, req.params.id]
  );
  res.json({ ok: true });
}));

app.delete('/api/customers/:id', auth, go(async (req, res) => {
  await pool.execute('DELETE FROM customers WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ══════════════════════════════════════════════════════════════
// ITEMS
// ══════════════════════════════════════════════════════════════
app.get('/api/items', auth, go(async (req, res) => {
  const { company_id, search } = req.query;
  let sql = 'SELECT * FROM items WHERE active=1';
  const p = [];
  if (company_id) { sql += ' AND company_id=?'; p.push(company_id); }
  if (search)     { sql += ' AND (name LIKE ? OR sac_code LIKE ?)'; const s=`%${search}%`; p.push(s,s); }
  sql += ' ORDER BY name LIMIT 500';
  const [rows] = await pool.execute(sql, p);
  res.json(rows);
}));

app.post('/api/items', auth, go(async (req, res) => {
  const { company_id, name, type, sac_code, hsn_code, rate, gst_rate, unit } = req.body;
  if (!company_id) return res.status(400).json({ error: 'company_id is required' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Item name is required' });
  const [r] = await pool.execute(
    'INSERT INTO items (company_id,name,type,sac_code,hsn_code,rate,gst_rate,unit) VALUES (?,?,?,?,?,?,?,?)',
    [company_id, name.trim(), type||'service', sac_code||'', hsn_code||'', parseFloat(rate)||0, parseFloat(gst_rate)||18, unit||'NOS']
  );
  const [[row]] = await pool.execute('SELECT * FROM items WHERE id=?', [r.insertId]);
  res.json(row);
}));

app.put('/api/items/:id', auth, go(async (req, res) => {
  const { name, type, sac_code, hsn_code, rate, gst_rate, unit } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  await pool.execute(
    'UPDATE items SET name=?,type=?,sac_code=?,hsn_code=?,rate=?,gst_rate=?,unit=? WHERE id=?',
    [name.trim(), type||'service', sac_code||'', hsn_code||'', parseFloat(rate)||0, parseFloat(gst_rate)||18, unit||'NOS', req.params.id]
  );
  res.json({ ok: true });
}));

app.delete('/api/items/:id', auth, go(async (req, res) => {
  await pool.execute('UPDATE items SET active=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ══════════════════════════════════════════════════════════════
// INVOICES
// ══════════════════════════════════════════════════════════════
app.get('/api/invoices', auth, go(async (req, res) => {
  const { company_id, search, status, from, to, page=1, limit=50 } = req.query;
  let sql = `SELECT i.*, c.name AS customer_name, co.name AS company_name
             FROM invoices i
             JOIN customers c ON c.id=i.customer_id
             JOIN companies co ON co.id=i.company_id WHERE 1=1`;
  const p = [];
  if (company_id) { sql += ' AND i.company_id=?'; p.push(company_id); }
  if (status)     { sql += ' AND i.status=?'; p.push(status); }
  if (from)       { sql += ' AND i.invoice_date>=?'; p.push(from); }
  if (to)         { sql += ' AND i.invoice_date<=?'; p.push(to); }
  if (search)     { sql += ' AND (i.invoice_no LIKE ? OR c.name LIKE ?)'; const s=`%${search}%`; p.push(s,s); }
  sql += ' ORDER BY i.invoice_date DESC, i.id DESC';
  sql += ` LIMIT ${parseInt(limit)} OFFSET ${(parseInt(page)-1)*parseInt(limit)}`;
  const [rows] = await pool.execute(sql, p);
  res.json(rows);
}));

app.get('/api/invoices/:id', auth, go(async (req, res) => {
  const [[inv]] = await pool.execute(
    `SELECT i.*, c.name AS cname, c.phone AS cphone, c.email AS cemail,
       c.address AS caddress, c.city AS ccity, c.state AS cstate, c.gstin AS cgstin, c.pan_no AS cpan,
       co.name AS coname, co.gstin AS cogstin, co.address AS coaddress,
       co.city AS cocity, co.state AS costate, co.phone AS cophone,
       co.bank_name, co.bank_account, co.bank_ifsc, co.bank_branch,
       cs.invoice_terms, cs.invoice_footer
     FROM invoices i
     JOIN customers c ON c.id=i.customer_id
     JOIN companies co ON co.id=i.company_id
     LEFT JOIN company_settings cs ON cs.company_id=i.company_id
     WHERE i.id=?`, [req.params.id]
  );
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const [items]    = await pool.execute('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sort_order', [req.params.id]);
  const [payments] = await pool.execute('SELECT * FROM payments WHERE invoice_id=? ORDER BY paid_date', [req.params.id]);
  res.json({ invoice: inv, items, payments });
}));

app.post('/api/invoices', auth, go(async (req, res) => {
  const { company_id, customer_id, invoice_date, due_date, type, tax_type='cgst_sgst',
          notes, lines, event_name, event_date, pax_count, source_invoice_id } = req.body;
  if (!company_id)   return res.status(400).json({ error: 'Company is required' });
  if (!customer_id)  return res.status(400).json({ error: 'Customer is required' });
  if (!invoice_date) return res.status(400).json({ error: 'Invoice date is required' });
  if (!lines || !lines.length) return res.status(400).json({ error: 'Add at least one line item' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[comp]] = await conn.execute('SELECT prefix,invoice_start FROM companies WHERE id=? FOR UPDATE', [company_id]);
    const prefix = comp.prefix || '';
    const [[last]] = await conn.execute('SELECT MAX(invoice_no_seq) AS s FROM invoices WHERE company_id=? AND invoice_no LIKE ?', [company_id, `${prefix}%`]);
    const seq = (last.s || (comp.invoice_start - 1)) + 1;
    const no  = `${prefix}${String(seq).padStart(3,'0')}`;
    const { calc, subtotal, cgst, sgst, igst, totalTax, roundOff, total } = calcTotals(lines, tax_type);
    const isIGST = tax_type === 'igst';

    const [r] = await conn.execute(
      `INSERT INTO invoices (company_id,customer_id,invoice_no,invoice_no_seq,invoice_date,due_date,type,
         subtotal,cgst_amount,sgst_amount,igst_amount,total_tax,round_off,total,
         tax_type,notes,status,event_name,event_date,pax_count,source_invoice_id,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'issued',?,?,?,?,?)`,
      [company_id,customer_id,no,seq,invoice_date,due_date||null,type||'sales',
       subtotal,cgst,sgst,igst,totalTax,roundOff,total,
       tax_type,notes||null,event_name||null,event_date||null,pax_count||null,source_invoice_id||null,req.user.id]
    );
    const invId = r.insertId;
    for (let i=0; i<calc.length; i++) {
      const l = calc[i];
      await conn.execute(
        `INSERT INTO invoice_items (invoice_id,item_id,description,sac_code,qty,unit,rate,amount,
           gst_rate,cgst_rate,sgst_rate,igst_rate,cgst_amount,sgst_amount,igst_amount,tax_amount,total_amount,sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [invId,l.item_id||null,l.description||'',l.sac_code||'',l.qty,l.unit||'NOS',l.rate,l.amount,
         l.gst_rate, isIGST?0:l.gst_rate/2, isIGST?0:l.gst_rate/2, isIGST?l.gst_rate:0,
         l.cgst_amount,l.sgst_amount,l.igst_amount,l.tax_amount,l.total_amount,i]
      );
    }
    await conn.commit();
    res.json({ id: invId, invoice_no: no });
  } catch(e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}));

app.put('/api/invoices/:id', auth, go(async (req, res) => {
  const { customer_id, invoice_date, due_date, tax_type='cgst_sgst',
          notes, lines, event_name, event_date, pax_count } = req.body;
  const { calc, subtotal, cgst, sgst, igst, totalTax, roundOff, total } = calcTotals(lines, tax_type);
  const isIGST = tax_type === 'igst';
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE invoices SET customer_id=?,invoice_date=?,due_date=?,tax_type=?,
         subtotal=?,cgst_amount=?,sgst_amount=?,igst_amount=?,total_tax=?,round_off=?,total=?,
         notes=?,event_name=?,event_date=?,pax_count=? WHERE id=?`,
      [customer_id,invoice_date,due_date||null,tax_type,subtotal,cgst,sgst,igst,totalTax,roundOff,total,
       notes||null,event_name||null,event_date||null,pax_count||null,req.params.id]
    );
    await conn.execute('DELETE FROM invoice_items WHERE invoice_id=?', [req.params.id]);
    for (let i=0; i<calc.length; i++) {
      const l = calc[i];
      await conn.execute(
        `INSERT INTO invoice_items (invoice_id,item_id,description,sac_code,qty,unit,rate,amount,
           gst_rate,cgst_rate,sgst_rate,igst_rate,cgst_amount,sgst_amount,igst_amount,tax_amount,total_amount,sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [req.params.id,l.item_id||null,l.description||'',l.sac_code||'',l.qty,l.unit||'NOS',l.rate,l.amount,
         l.gst_rate, isIGST?0:l.gst_rate/2, isIGST?0:l.gst_rate/2, isIGST?l.gst_rate:0,
         l.cgst_amount,l.sgst_amount,l.igst_amount,l.tax_amount,l.total_amount,i]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch(e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}));

app.post('/api/invoices/:id/cancel', auth, go(async (req, res) => {
  await pool.execute("UPDATE invoices SET status='cancelled' WHERE id=?", [req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/invoices/:id/copy', auth, go(async (req, res) => {
  const [[inv]] = await pool.execute('SELECT * FROM invoices WHERE id=?', [req.params.id]);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const [items] = await pool.execute('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sort_order', [req.params.id]);
  res.json({ company_id:inv.company_id, customer_id:inv.customer_id, type:inv.type,
    tax_type:inv.tax_type, notes:inv.notes, event_name:inv.event_name, pax_count:inv.pax_count,
    source_invoice_id:inv.id,
    lines: items.map(i => ({ item_id:i.item_id, description:i.description, sac_code:i.sac_code||'', qty:i.qty, unit:i.unit, rate:i.rate, gst_rate:i.gst_rate }))
  });
}));

app.post('/api/invoices/:id/payment', auth, go(async (req, res) => {
  const { mode, amount, paid_date, ref_no } = req.body;
  if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
  if (!paid_date) return res.status(400).json({ error: 'Payment date is required' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('INSERT INTO payments (invoice_id,mode,amount,paid_date,ref_no) VALUES (?,?,?,?,?)',
      [req.params.id, mode||'cash', parseFloat(amount), paid_date, ref_no||'']);
    const [[{tp}]] = await conn.execute('SELECT COALESCE(SUM(amount),0) AS tp FROM payments WHERE invoice_id=?', [req.params.id]);
    const [[inv]]  = await conn.execute('SELECT total FROM invoices WHERE id=?', [req.params.id]);
    const ps = parseFloat(tp) >= parseFloat(inv.total) ? 'paid' : parseFloat(tp) > 0 ? 'partial' : 'unpaid';
    await conn.execute('UPDATE invoices SET amount_paid=?,payment_status=? WHERE id=?', [tp, ps, req.params.id]);
    await conn.commit();
    res.json({ ok: true, payment_status: ps });
  } catch(e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}));

// ══════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════
app.get('/api/reports/dashboard', auth, go(async (req, res) => {
  const { company_id } = req.query;
  const p = []; let w = "i.status != 'cancelled'";
  if (company_id) { w += ' AND i.company_id=?'; p.push(company_id); }
  const ms = new Date(); ms.setDate(1);
  const mStr = ms.toISOString().split('T')[0];
  const [[tot]]   = await pool.execute(`SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS rev, COALESCE(SUM(total_tax),0) AS tax FROM invoices i WHERE ${w}`, p);
  const [[mon]]   = await pool.execute(`SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS rev FROM invoices i WHERE ${w} AND i.invoice_date>=?`, [...p, mStr]);
  const [[unp]]   = await pool.execute(`SELECT COUNT(*) AS cnt, COALESCE(SUM(total-amount_paid),0) AS outstanding FROM invoices i WHERE ${w} AND i.payment_status!='paid'`, p);
  const [recent]  = await pool.execute(`SELECT i.id,i.invoice_no,i.invoice_date,i.total,i.status,i.payment_status,c.name AS cname FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE ${w} ORDER BY i.id DESC LIMIT 10`, p);
  const [monthly] = await pool.execute(`SELECT DATE_FORMAT(i.invoice_date,'%b %Y') AS m, COALESCE(SUM(i.total),0) AS rev, COUNT(*) AS cnt FROM invoices i WHERE ${w} AND i.invoice_date>=DATE_SUB(NOW(),INTERVAL 6 MONTH) GROUP BY DATE_FORMAT(i.invoice_date,'%Y-%m') ORDER BY DATE_FORMAT(i.invoice_date,'%Y-%m')`, p);
  res.json({ totals: tot, month: mon, unpaid: unp, recent, monthly });
}));

app.get('/api/reports/gst', auth, go(async (req, res) => {
  const { company_id, from, to } = req.query;
  let w = "i.status != 'cancelled'"; const p=[];
  if (company_id) { w += ' AND i.company_id=?'; p.push(company_id); }
  if (from)       { w += ' AND i.invoice_date>=?'; p.push(from); }
  if (to)         { w += ' AND i.invoice_date<=?'; p.push(to); }
  const [[sum]] = await pool.execute(`SELECT COALESCE(SUM(subtotal),0) AS taxable,COALESCE(SUM(cgst_amount),0) AS cgst,COALESCE(SUM(sgst_amount),0) AS sgst,COALESCE(SUM(igst_amount),0) AS igst,COALESCE(SUM(total_tax),0) AS tax,COALESCE(SUM(total),0) AS total FROM invoices i WHERE ${w}`, p);
  const [invs]  = await pool.execute(`SELECT i.invoice_no,i.invoice_date,c.name AS cname,c.gstin AS cgstin,i.subtotal,i.cgst_amount,i.sgst_amount,i.igst_amount,i.total_tax,i.total FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE ${w} ORDER BY i.invoice_date DESC`, p);
  res.json({ summary: sum, invoices: invs });
}));

// ══════════════════════════════════════════════════════════════
// PRINT
// ══════════════════════════════════════════════════════════════
app.get('/api/print/:id', go(async (req, res) => {
  const token = req.query.auth || (req.headers.authorization||'').replace('Bearer ','');
  try { jwt.verify(token, JWT_SECRET); } catch { return res.status(401).send('<h2>Unauthorized</h2>'); }

  const [[inv]] = await pool.execute(
    `SELECT i.*, c.name AS cname,c.phone AS cphone,c.email AS cemail,c.address AS caddress,
       c.city AS ccity,c.state AS cstate,c.gstin AS cgstin, c.pan_no AS cpan,
       co.name AS coname,co.gstin AS cogstin,co.cin_no,co.pan_no AS copan,co.address AS coaddress,co.city AS cocity,
       co.state AS costate,co.phone AS cophone,co.bank_name,co.bank_account,co.bank_ifsc,co.bank_branch,co.logo_url,
       cs.invoice_terms,cs.invoice_footer
     FROM invoices i
     JOIN customers c ON c.id=i.customer_id
     JOIN companies co ON co.id=i.company_id
     LEFT JOIN company_settings cs ON cs.company_id=i.company_id
     WHERE i.id=?`, [req.params.id]
  );
  if (!inv) return res.status(404).send('<h2>Invoice not found</h2>');
  const [items]    = await pool.execute('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sort_order', [req.params.id]);
  const [payments] = await pool.execute('SELECT * FROM payments WHERE invoice_id=? ORDER BY paid_date', [req.params.id]);

  const isIGST = inv.tax_type === 'igst';
  const fN = n => parseFloat(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fD = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '';

  const rows = items.map((it,i) => `<tr>
    <td>${i+1}</td>
    <td>${it.description||''}</td>
    <td>${parseFloat(it.qty)} ${it.unit}</td>
    <td>₹${fN(it.rate)}</td>
    <td>₹${fN(it.amount)}</td>
    <td>${it.gst_rate}%</td>
    ${isIGST?`<td>₹${fN(it.igst_amount)}</td>`:`<td>₹${fN(it.cgst_amount)}</td><td>₹${fN(it.sgst_amount)}</td>`}
    <td><b>₹${fN(it.total_amount)}</b></td>
  </tr>`).join('');

  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ${inv.invoice_no}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#222;padding:12mm}
.hdr{display:flex;justify-content:space-between;border-bottom:2px solid #1a365d;padding-bottom:10px;margin-bottom:10px}
.co h1{font-size:16px;color:#1a365d}.co p{font-size:10px;color:#555;line-height:1.5}
.meta{text-align:right}.meta h2{font-size:18px;color:#1a365d;text-transform:uppercase}.meta b{font-size:14px}
.meta p{font-size:10px;color:#555}
.pts{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:10px 0}
.pt{border:1px solid #ddd;border-radius:3px;padding:8px}.pt h3{font-size:9px;color:#888;text-transform:uppercase;margin-bottom:3px}
.pt .nm{font-size:12px;font-weight:700}.pt p{font-size:10px;color:#555;line-height:1.5}
table{width:100%;border-collapse:collapse;font-size:10px;margin:8px 0}
th{background:#1a365d;color:white;padding:5px 4px;text-align:right}th:nth-child(1),th:nth-child(2){text-align:left}
td{padding:4px;border-bottom:1px solid #eee;text-align:right}td:nth-child(1),td:nth-child(2){text-align:left}
.tw{display:flex;justify-content:flex-end;margin-top:6px}.tt{min-width:220px}
.tt table{margin:0}.tt td{padding:2px 4px;border:none}.tt .l{text-align:left;color:#555}.tt .v{text-align:right;font-weight:600}
.gr{background:#1a365d;color:white}.gr td{padding:6px 4px!important;font-size:12px!important}
.bot{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;border-top:1px solid #eee;padding-top:8px}
.bk{font-size:10px}.bk h4{font-size:9px;text-transform:uppercase;color:#888;margin-bottom:3px}
.sg{text-align:right;font-size:10px}.sg h4{font-size:9px;text-transform:uppercase;color:#888;margin-bottom:28px}
.ft{text-align:center;font-size:9px;color:#888;margin-top:8px;border-top:1px solid #eee;padding-top:5px}
@media print{@page{size:A4;margin:8mm}body{padding:0}}</style></head><body>
<div class="hdr">
  ${inv.logo_url ? `<img src="${inv.logo_url}" style="max-height:64px;max-width:200px;margin-right:15px">` : ''}
  <div class="co" style="flex:1"><h1>${inv.coname}</h1>
    <p>${[inv.coaddress,inv.cocity,inv.costate].filter(Boolean).join(', ')}</p>
    <p>GSTIN: <b>${inv.cogstin}</b>${inv.cin_no ? ' | CIN: <b>'+inv.cin_no+'</b>' : ''}${inv.copan ? ' | PAN: <b>'+inv.copan+'</b>' : ''}${inv.cophone?' | '+inv.cophone:''}</p></div>
  <div class="meta"><h2>Tax Invoice</h2><b>${inv.invoice_no}</b>
    <p>Date: <b>${fD(inv.invoice_date)}</b></p>
    <p style="color:${inv.payment_status==='paid'?'green':'red'};font-weight:600;text-transform:uppercase">${inv.payment_status}</p></div>
</div>
<div class="pts">
  <div class="pt"><h3>Bill To</h3><div class="nm">${inv.cname}</div>
    <p>${inv.caddress||''}</p><p>${[inv.ccity,inv.costate].filter(Boolean).join(', ')}</p>
    ${inv.cgstin?`<p>GSTIN: <b>${inv.cgstin}</b></p>`:''}
    ${inv.cpan?`<p>PAN: <b>${inv.cpan}</b></p>`:''}</div>
  <div class="pt"><h3>Invoice Info</h3>
    <p>No: <b>${inv.invoice_no}</b></p><p>Date: <b>${fD(inv.invoice_date)}</b></p>
    <p>${isIGST?'IGST (Interstate)':'CGST+SGST (Intrastate)'}</p>
    ${inv.event_name?`<p>Event: <b>${inv.event_name}</b></p>`:''}
    ${inv.event_date?`<p>Event Date: <b>${fD(inv.event_date)}</b></p>`:''}
    ${inv.pax_count?`<p>Pax: <b>${inv.pax_count}</b></p>`:''}</div>
</div>
<table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th>GST%</th>
${isIGST?'<th>IGST</th>':'<th>CGST</th><th>SGST</th>'}<th>Total</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="tw"><div class="tt"><table>
  <tr><td class="l">Subtotal:</td><td class="v">₹${fN(inv.subtotal)}</td></tr>
  ${isIGST?`<tr><td class="l">IGST:</td><td class="v">₹${fN(inv.igst_amount)}</td></tr>`:`<tr><td class="l">CGST:</td><td class="v">₹${fN(inv.cgst_amount)}</td></tr><tr><td class="l">SGST:</td><td class="v">₹${fN(inv.sgst_amount)}</td></tr>`}
  <tr class="gr"><td><b>TOTAL:</b></td><td><b>₹${fN(inv.total)}</b></td></tr>
  ${parseFloat(inv.amount_paid||0)>0?`<tr><td class="l" style="color:green">Paid:</td><td class="v" style="color:green">₹${fN(inv.amount_paid)}</td></tr><tr><td class="l" style="color:red">Balance:</td><td class="v" style="color:red">₹${fN(inv.total-inv.amount_paid)}</td></tr>`:''}
</table></div></div>
${payments.length>0?`<p style="font-size:10px;color:#555;margin-top:4px">Payments: ${payments.map(p=>`${fD(p.paid_date)} ${p.mode.toUpperCase()} ₹${fN(p.amount)}${p.ref_no?' Ref:'+p.ref_no:''}`).join(' | ')}</p>`:''}
<div class="bot">
  <div class="bk">${inv.bank_name?`<h4>Bank Details</h4><p>Bank: ${inv.bank_name}</p><p>A/C: ${inv.bank_account} &nbsp; IFSC: ${inv.bank_ifsc}</p>`:''}
  ${inv.invoice_terms?`<p style="margin-top:6px;font-style:italic">${inv.invoice_terms}</p>`:''}</div>
  <div class="sg"><h4>For ${inv.coname}</h4><p>Authorised Signatory</p></div>
</div>
<div class="ft">${inv.invoice_footer||'This is a computer generated invoice. Thank you for your business.'}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
}));

// ── SPA fallback ──────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Start ─────────────────────────────────────────────────────
pool.getConnection()
  .then(conn => { conn.release();
    app.listen(PORT, () => {
      console.log('');
      console.log('  ✅  GST Billing is running!');
      console.log(`  🌐  http://localhost:${PORT}`);
      console.log('  📧  admin@yourdomain.com  /  Admin@123');
      console.log('');
    });
  })
  .catch(err => {
    console.error('\n  ❌  Database connection FAILED:', err.message);
    console.error('  👉  Make sure MySQL is running in XAMPP\n');
    process.exit(1);
  });
