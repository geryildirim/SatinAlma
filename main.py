from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from schemas import RequestCreate, RequestUpdate
import database

# Veritabanını başlat
database.init_db()

app = FastAPI(
    title="CorpBuy - Enterprise Purchasing & Billing API",
    description="Kurumsal Satın Alma ve Faturalandırma Sistemi REST API",
    version="2.0.0"
)

# ===================== API ENDPOINTS =====================

@app.get("/api/requests")
def list_requests():
    """Tüm satın alma taleplerini listeler."""
    return database.get_all_requests()

@app.get("/api/stats")
def get_stats():
    """Dashboard istatistiklerini döner."""
    return database.get_stats()

@app.post("/api/requests")
def create_request(data: RequestCreate):
    """Yeni bir satın alma talebi oluşturur."""
    result = database.create_request(data.description, data.amount)
    return result

@app.post("/api/requests/update")
def update_request(data: RequestUpdate):
    """Mevcut bir talebin durumunu günceller."""
    result = database.update_request(
        req_id=data.id,
        status=data.status,
        amount=data.amount,
        supplier=data.supplier,
        address=data.address
    )
    return result

@app.delete("/api/requests/{req_id}")
def delete_request(req_id: int):
    """Bir talebi tamamen siler."""
    return database.delete_request(req_id)

# ===================== STATIC FILES (Frontend) =====================

# Service worker ve manifest kök dizinde olmalı
@app.get("/sw.js")
def service_worker():
    return FileResponse("sw.js", media_type="application/javascript")

@app.get("/manifest.json")
def manifest():
    return FileResponse("manifest.json", media_type="application/json")

# Statik dosyalar (CSS, JS, vb.)
app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/js", StaticFiles(directory="js"), name="js")
app.mount("/icons", StaticFiles(directory="icons"), name="icons")

# Ana sayfa
@app.get("/")
def root():
    return FileResponse("index.html")

@app.get("/index.html")
def index():
    return FileResponse("index.html")
