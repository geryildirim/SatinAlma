import sqlite3
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from datetime import datetime

DB_NAME = "satin_alma.db"

def init_db():
    print("[Veritabanı] SQLite bağlantısı kontrol ediliyor...")
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_no TEXT,
            description TEXT,
            amount TEXT,
            status TEXT,
            date TEXT
        )
    ''')
    
    # Eğer tablo boşsa örnek veriler (Mock) ile doldur, böylece UI güzel görünür.
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

class APIServer(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # API Enpoints
        if self.path == '/api/requests':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            conn = sqlite3.connect(DB_NAME)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM requests ORDER BY id DESC")
            rows = [dict(ix) for ix in c.fetchall()]
            conn.close()
            
            self.wfile.write(json.dumps(rows).encode('utf-8'))
            return
            
        elif self.path == '/api/stats':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            conn = sqlite3.connect(DB_NAME)
            c = conn.cursor()
            
            c.execute("SELECT COUNT(*) FROM requests")
            total = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM requests WHERE status='pending'")
            pending = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM requests WHERE status='po'")
            po = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM requests WHERE status='approved'")
            approved = c.fetchone()[0]
            conn.close()
            
            stats = {
                "activeRequests": total,
                "pendingApprovals": pending,
                "activePOs": po,
                "readyInvoices": approved
            }
            self.wfile.write(json.dumps(stats).encode('utf-8'))
            return

        # Statik Dosya (HTML, CSS, JS) Sunumu
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/requests/update':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                req_id = data.get('id')
                new_status = data.get('status')
                new_amount = data.get('amount')
                
                conn = sqlite3.connect(DB_NAME)
                c = conn.cursor()
                
                if new_amount is not None:
                    c.execute("UPDATE requests SET status=?, amount=? WHERE id=?", (new_status, new_amount, req_id))
                else:
                    c.execute("UPDATE requests SET status=? WHERE id=?", (new_status, req_id))
                    
                conn.commit()
                conn.close()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

        if self.path == '/api/requests':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                desc = data.get('description', '')
                amount = data.get('amount', 'Hesaplanıyor...')
                
                conn = sqlite3.connect(DB_NAME)
                c = conn.cursor()
                c.execute("SELECT MAX(id) FROM requests")
                max_id = c.fetchone()[0]
                count = (max_id if max_id else 0) + 1
                request_no = f"PR-2026-{count:03d}"
                today = datetime.now().strftime("%d.%m.%Y")
                
                c.execute("INSERT INTO requests (request_no, description, amount, status, date) VALUES (?, ?, ?, ?, ?)",
                          (request_no, desc, amount, 'pending', today))
                new_id = c.lastrowid
                conn.commit()
                
                new_row = {
                    "id": new_id,
                    "request_no": request_no,
                    "description": desc,
                    "amount": amount,
                    "status": "pending",
                    "date": today
                }
                conn.close()
                
                self.send_response(201)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(new_row).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

        self.send_error(404, "Endpoint Bulunamadi")

def run(port=8000):
    init_db()
    server_address = ('', port)
    httpd = HTTPServer(server_address, APIServer)
    print("======================================================")
    print(f"🚀 Sistem Aktif: Satın Alma ve Faturalandırma")
    print(f"🌍 Tarayıcıda açın: http://localhost:{port}")
    print("======================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nSistem Kapatılıyor...")
        httpd.server_close()

if __name__ == '__main__':
    # Script çalıştırılan dizinde root olmalı. (index.html'in yaninda)
    run()
