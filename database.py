import sqlite3
from datetime import datetime
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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

    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            hashed_password TEXT,
            full_name TEXT,
            role TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS stocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER,
            item_name TEXT,
            quantity INTEGER DEFAULT 1,
            unit TEXT DEFAULT 'Adet',
            date_added TEXT,
            FOREIGN KEY (request_id) REFERENCES requests (id)
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

    # Varsayılan kullanıcıları ekle
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        print("[Veritabanı] Kullanıcı tablosu boş, admin ve user hesapları oluşturuluyor...")
        users = [
            ("admin", pwd_context.hash("admin123"), "Sistem Yöneticisi", "admin"),
            ("user", pwd_context.hash("user123"), "Ali Yılmaz", "user")
        ]
        c.executemany("INSERT INTO users (username, hashed_password, full_name, role) VALUES (?,?,?,?)", users)
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

    # Eğer durum 'delivered' ise stoğa ekle
    if status == 'delivered':
        add_to_stock(req_id)
        
    conn.close()
    return {"success": True}

def delete_request(req_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM requests WHERE id=?", (req_id,))
    conn.commit()
    conn.close()
    return {"success": True}

# --- Kullanıcı İşlemleri ---

def get_user_by_username(username: str):
    conn = get_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return dict(user) if user else None

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_hash(password):
    return pwd_context.hash(password)

def get_all_stocks():
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT s.*, r.request_no 
        FROM stocks s
        JOIN requests r ON s.request_id = r.id
        ORDER BY s.id DESC
    """)
    stocks = [dict(row) for row in c.fetchall()]
    conn.close()
    return stocks

def add_to_stock(request_id: int):
    conn = get_connection()
    c = conn.cursor()
    
    # Zaten stokta var mı kontrol et (tekrar eklemeyi önle)
    c.execute("SELECT id FROM stocks WHERE request_id = ?", (request_id,))
    if c.fetchone():
        conn.close()
        return
        
    # Talepten bilgileri al
    c.execute("SELECT description FROM requests WHERE id = ?", (request_id,))
    req = c.fetchone()
    if not req:
        conn.close()
        return
        
    date_str = datetime.now().strftime("%d.%m.%Y")
    c.execute(
        "INSERT INTO stocks (request_id, item_name, quantity, unit, date_added) VALUES (?,?,?,?,?)",
        (request_id, req['description'], 1, 'Birim', date_str)
    )
    conn.commit()
    conn.close()

def get_all_users():
    conn = get_connection()
    users = [dict(u) for u in conn.execute("SELECT id, username, full_name, role FROM users").fetchall()]
    conn.close()
    return users

def create_user(username, password, full_name, role):
    conn = get_connection()
    c = conn.cursor()
    hashed_password = get_hash(password)
    try:
        c.execute(
            "INSERT INTO users (username, hashed_password, full_name, role) VALUES (?,?,?,?)",
            (username, hashed_password, full_name, role)
        )
        conn.commit()
        new_id = c.lastrowid
        conn.close()
        return {"id": new_id, "username": username, "success": True}
    except sqlite3.IntegrityError:
        conn.close()
        return None

def delete_user(user_id):
    conn = get_connection()
    conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True}

def update_user_role(user_id, role):
    conn = get_connection()
    conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    conn.commit()
    conn.close()
    return {"success": True}
