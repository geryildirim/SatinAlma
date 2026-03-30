import sqlite3
from datetime import datetime

DB_NAME = "satin_alma.db"

def get_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    print("[Veritabanı] SQLite bağlantısı kontrol ediliyor...")
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_no TEXT,
            description TEXT,
            amount TEXT,
            status TEXT,
            date TEXT,
            supplier TEXT DEFAULT '',
            address TEXT DEFAULT ''
        )
    ''')
    
    c.execute("SELECT COUNT(*) FROM requests")
    if c.fetchone()[0] == 0:
        print("[Veritabanı] Tablo boş, demo veriler yükleniyor...")
        sample_data = [
            ("PR-2026-001", "Yeni Personeller için Laptop Alımı (3 Adet)", "125,000 ₺", "pending", "27.03.2026"),
            ("PR-2026-002", "Q3 Pazarlama Ajans Ödemesi", "85,000 ₺", "approved", "25.03.2026"),
            ("PR-2026-003", "Ofis Kırtasiye İhtiyaçları", "12,400 ₺", "po", "20.03.2026"),
            ("PR-2026-004", "Sunucu Altyapı Yenileme (AWS)", "350,000 ₺", "rejected", "15.03.2026")
        ]
        c.executemany("INSERT INTO requests (request_no, description, amount, status, date) VALUES (?,?,?,?,?)", sample_data)
        conn.commit()
    conn.close()
    print("[Veritabanı] Hazır.")

def get_all_requests():
    conn = get_connection()
    rows = [dict(r) for r in conn.execute("SELECT * FROM requests ORDER BY id DESC").fetchall()]
    conn.close()
    return rows

def get_stats():
    conn = get_connection()
    c = conn.cursor()
    total = c.execute("SELECT COUNT(*) FROM requests").fetchone()[0]
    pending = c.execute("SELECT COUNT(*) FROM requests WHERE status='pending'").fetchone()[0]
    po = c.execute("SELECT COUNT(*) FROM requests WHERE status='po'").fetchone()[0]
    approved = c.execute("SELECT COUNT(*) FROM requests WHERE status='approved'").fetchone()[0]
    conn.close()
    return {
        "activeRequests": total,
        "pendingApprovals": pending,
        "activePOs": po,
        "readyInvoices": approved
    }

def create_request(description: str, amount: str = "Teklif Bekleniyor"):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM requests")
    count = c.fetchone()[0] + 1
    request_no = f"PR-2026-{count:03d}"
    date_str = datetime.now().strftime("%d.%m.%Y")
    c.execute(
        "INSERT INTO requests (request_no, description, amount, status, date) VALUES (?,?,?,?,?)",
        (request_no, description, amount, "pending", date_str)
    )
    conn.commit()
    new_id = c.lastrowid
    conn.close()
    return {"id": new_id, "request_no": request_no}

def update_request(req_id: int, status: str, amount: str = None, supplier: str = None, address: str = None):
    conn = get_connection()
    c = conn.cursor()
    if amount is not None:
        c.execute("UPDATE requests SET status=?, amount=? WHERE id=?", (status, amount, req_id))
    else:
        c.execute("UPDATE requests SET status=? WHERE id=?", (status, req_id))
    if supplier:
        c.execute("UPDATE requests SET supplier=? WHERE id=?", (supplier, req_id))
    if address:
        c.execute("UPDATE requests SET address=? WHERE id=?", (address, req_id))
    conn.commit()
    conn.close()
    return {"success": True}

def delete_request(req_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM requests WHERE id=?", (req_id,))
    conn.commit()
    conn.close()
    return {"success": True}
