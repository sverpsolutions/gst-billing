CREATE DATABASE IF NOT EXISTS gst_billing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gst_billing;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','staff') DEFAULT 'admin',
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  gstin VARCHAR(15) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(150),
  prefix VARCHAR(10) NOT NULL,
  invoice_start INT DEFAULT 1,
  type ENUM('sales','rental','banquet') NOT NULL,
  bank_name VARCHAR(200),
  bank_account VARCHAR(50),
  bank_ifsc VARCHAR(20),
  bank_branch VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS company_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  cgst_rate DECIMAL(5,2) DEFAULT 9.00,
  sgst_rate DECIMAL(5,2) DEFAULT 9.00,
  igst_rate DECIMAL(5,2) DEFAULT 18.00,
  invoice_terms TEXT,
  invoice_footer TEXT,
  UNIQUE KEY uq_company (company_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Fix existing installs: remove duplicate company_settings rows then add unique key
DELETE cs1 FROM company_settings cs1
  INNER JOIN company_settings cs2
  WHERE cs1.id > cs2.id AND cs1.company_id = cs2.company_id;
ALTER TABLE company_settings ADD UNIQUE IF NOT EXISTS uq_company (company_id);

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(150),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  gstin VARCHAR(15),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(300) NOT NULL,
  type ENUM('goods','service') DEFAULT 'service',
  hsn_code VARCHAR(20),
  sac_code VARCHAR(20),
  rate DECIMAL(12,2) DEFAULT 0.00,
  gst_rate DECIMAL(5,2) DEFAULT 18.00,
  unit VARCHAR(30) DEFAULT 'NOS',
  active TINYINT(1) DEFAULT 1
);

CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  customer_id INT NOT NULL,
  invoice_no VARCHAR(30) NOT NULL UNIQUE,
  invoice_no_seq INT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  type ENUM('sales','rental','banquet') NOT NULL,
  subtotal DECIMAL(14,2) DEFAULT 0,
  cgst_amount DECIMAL(14,2) DEFAULT 0,
  sgst_amount DECIMAL(14,2) DEFAULT 0,
  igst_amount DECIMAL(14,2) DEFAULT 0,
  total_tax DECIMAL(14,2) DEFAULT 0,
  round_off DECIMAL(6,2) DEFAULT 0,
  total DECIMAL(14,2) DEFAULT 0,
  tax_type ENUM('cgst_sgst','igst') DEFAULT 'cgst_sgst',
  notes TEXT,
  status ENUM('issued','paid','cancelled') DEFAULT 'issued',
  payment_status ENUM('unpaid','partial','paid') DEFAULT 'unpaid',
  amount_paid DECIMAL(14,2) DEFAULT 0,
  source_invoice_id INT DEFAULT NULL,
  event_name VARCHAR(200),
  event_date DATE,
  pax_count INT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  item_id INT DEFAULT NULL,
  description VARCHAR(500) NOT NULL,
  sac_code VARCHAR(20),
  qty DECIMAL(10,3) DEFAULT 1,
  unit VARCHAR(30) DEFAULT 'NOS',
  rate DECIMAL(12,2) DEFAULT 0,
  amount DECIMAL(14,2) DEFAULT 0,
  gst_rate DECIMAL(5,2) DEFAULT 18,
  cgst_rate DECIMAL(5,2) DEFAULT 9,
  sgst_rate DECIMAL(5,2) DEFAULT 9,
  igst_rate DECIMAL(5,2) DEFAULT 0,
  cgst_amount DECIMAL(12,2) DEFAULT 0,
  sgst_amount DECIMAL(12,2) DEFAULT 0,
  igst_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(14,2) DEFAULT 0,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  mode ENUM('cash','cheque','upi','neft','rtgs','card','other') DEFAULT 'cash',
  amount DECIMAL(14,2) NOT NULL,
  paid_date DATE NOT NULL,
  ref_no VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

-- ── Seed Data ──────────────────────────────────────────────

INSERT IGNORE INTO users (id, name, email, password_hash, role) VALUES
(1, 'Admin', 'admin@yourdomain.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'admin');

INSERT IGNORE INTO companies (id, name, gstin, address, city, state, phone, prefix, invoice_start, type) VALUES
(1, 'My Sales Company', '07AAAAA0000A1Z5', 'Office Address, City', 'Delhi', 'Delhi', '9999000001', 'SAL', 1, 'sales'),
(2, 'My Rental Business', '07AAAAA0000A1Z6', 'Office Address, City', 'Delhi', 'Delhi', '9999000002', 'RNT', 1, 'rental'),
(3, 'My Banquet Hall', '07AAAAA0000A1Z7', 'Hall Address, City', 'Delhi', 'Delhi', '9999000003', 'BNQ', 1, 'banquet');

INSERT IGNORE INTO company_settings (company_id, cgst_rate, sgst_rate, igst_rate) VALUES
(1, 9, 9, 18), (2, 9, 9, 18), (3, 9, 9, 18);


