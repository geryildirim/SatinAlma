import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status, Request, Response, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import List, Dict
from schemas import (
    RequestCreate, RequestUpdate, UserLogin, UserOut, Token, UserCreate, UserRoleUpdate, StockOut, CompanyCreate, CompanyOut, UserCompanyAssign, UserUpdate, StockManualCreate
)
import database
import email_service

# Load environment variables
load_dotenv()

# Veritabanını başlat
database.init_db()

app = FastAPI(
    title="CorpBuy - Enterprise Purchasing & Billing API",
    description="Kurumsal Satın Alma ve Faturalandırma Sistemi REST API",
    version="2.0.0"
)

# --- Auth Configuration ---
SECRET_KEY = os.getenv("SECRET_KEY", "SatinAlma_Sistemi_Fallback_Security_Key_321")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 24))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Geçersiz oturum",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = database.get_user_by_username(username)
    if user is None:
        raise credentials_exception
    return user

def check_admin(user = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için admin yetkisi gereklidir"
        )
    return user

# ===================== AUTH ENDPOINTS =====================

@app.post("/api/auth/login", response_model=Token)
async def login(data: UserLogin):
    user = database.get_user_by_username(data.username)
    if not user or not database.verify_password(data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Hatalı kullanıcı adı veya şifre"
        )
    
    access_token = create_access_token(data={"sub": user["username"]})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    }

# ===================== USER MANAGEMENT (Admin Only) =====================

@app.get("/api/users", response_model=List[UserOut])
def list_users(current_user: dict = Depends(get_current_user)):
    """Tüm kullanıcıları listeler."""
    return database.get_all_users()

@app.post("/api/users")
def create_user(data: UserCreate, current_user: dict = Depends(check_admin)):
    """Yeni bir kullanıcı oluşturur."""
    result = database.create_user(data.username, data.password, data.full_name, data.role)
    if not result:
        raise HTTPException(status_code=400, detail="Kullanıcı adı zaten mevcut")
    return result

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, current_user: dict = Depends(check_admin)):
    """Bir kullanıcıyı siler."""
    return database.delete_user(user_id)

@app.put("/api/users/{user_id}/role")
def update_user_role(user_id: int, data: UserRoleUpdate, current_user: dict = Depends(check_admin)):
    """Bir kullanıcının yetkisini günceller."""
    return database.update_user_role(user_id, data.role)

@app.post("/api/users/{user_id}/companies")
def assign_user_companies(user_id: int, data: UserCompanyAssign, current_user: dict = Depends(check_admin)):
    """Bir kullanıcının şirket yetkilerini kaydeder (Sadece Admin)."""
    return database.assign_user_companies(user_id, data.company_ids)

@app.put("/api/users/{user_id}")
def update_user_details(user_id: int, data: UserUpdate, current_user: dict = Depends(check_admin)):
    """Kullanıcı bilgilerini günceller."""
    # Bilgileri güncelle
    success = database.update_user(
        user_id, 
        username=data.username, 
        full_name=data.full_name, 
        password=data.password,
        role=data.role
    )
    if not success:
        raise HTTPException(status_code=400, detail="Kullanıcı adı kullanımda")
    
    # Eğer şirketler gönderilmişse onları da güncelle
    if data.company_ids is not None:
        database.assign_user_companies(user_id, data.company_ids)
        
    return {"success": True}

# ===================== COMPANY MANAGEMENT =====================

@app.get("/api/companies", response_model=List[CompanyOut])
def get_companies(current_user: dict = Depends(get_current_user)):
    """Bağlı olunan (veya tüm) şirketleri listeler."""
    return database.get_all_companies(current_user["role"], current_user["id"])

@app.post("/api/companies")
def create_company(data: CompanyCreate, current_user: dict = Depends(check_admin)):
    """Yeni bir şirket oluşturur (Sadece Admin)."""
    success = database.create_company(
        data.name, 
        data.address, 
        data.tax_no, 
        data.tax_office,
        data.phone, 
        data.email, 
        data.website
    )
    if not success:
        raise HTTPException(status_code=400, detail="Şirket adı zaten mevcut.")
    return {"success": True}

@app.put("/api/companies/{company_id}")
def update_company(company_id: int, data: CompanyCreate, current_user: dict = Depends(check_admin)):
    """Mevcut bir şirketi günceller (Sadece Admin)."""
    success = database.update_company(
        company_id,
        data.name, 
        data.address, 
        data.tax_no, 
        data.tax_office,
        data.phone, 
        data.email, 
        data.website
    )
    if not success:
        raise HTTPException(status_code=400, detail="Güncelleme başarısız.")
    return {"success": True}

import asyncio
import random

class CompanyResearchService:
    # Genişletilmiş Sektörel Bilgi Bankası (Knowledge Base)
    KB = {
        "aselsan": {
            "name": "ASELSAN Elektronik Sanayi ve Ticaret A.Ş.",
            "address": "Mehmet Akif Ersoy Mah. 296. Cadde No:16, 06370 Yenimahalle/Ankara",
            "tax_no": "0910002227",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (312) 592 10 00",
            "email": "aselsan.pazarlama@hs01.kep.tr",
            "website": "www.aselsan.com"
        },
        "thy": {
            "name": "Türk Hava Yolları Anonim Ortaklığı",
            "address": "Yeşilköy Mah. Hava Alanı Cad. No:3/1, Bakırköy/İstanbul",
            "tax_no": "8790060931",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (212) 463 63 63",
            "email": "thy.muhasebe@hs01.kep.tr",
            "website": "www.turkishairlines.com"
        },
        "trendyol": {
            "name": "DSM Grup Danışmanlık İletişim ve Satış Ticaret A.Ş.",
            "address": "Maslak Mah. Büyükdere Cad. No:249, Sarıyer/İstanbul",
            "tax_no": "3130554390",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (212) 331 02 00",
            "email": "dsm.grup@hs01.kep.tr",
            "website": "www.trendyol.com"
        },
        "getir": {
            "name": "Getir Perakende Lojistik A.Ş.",
            "address": "Etiler Mah. Tanburi Ali Efendi Sok. No:13, Beşiktaş/İstanbul",
            "tax_no": "3960682132",
            "tax_office": "Beşiktaş Vergi Dairesi",
            "phone": "+90 (212) 351 03 62",
            "email": "info@getir.com",
            "website": "www.getir.com"
        },
        "koc": {
            "name": "Koç Holding Anonim Şirketi",
            "address": "Nakkaştepe, Azizbey Sok. No:1, Kuzguncuk, Üsküdar/İstanbul",
            "tax_no": "5700010996",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (216) 531 00 00",
            "email": "koc@hs01.kep.tr",
            "website": "www.koc.com.tr"
        },
        "turkcell": {
            "name": "Turkcell İletişim Hizmetleri A.Ş.",
            "address": "Aydınevler Mah. İnönü Cad. No:20, Küçükyalı Plaza, Maltepe/İstanbul",
            "tax_no": "8790018736",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (212) 313 10 00",
            "email": "turkcell.hukuk@hs01.kep.tr",
            "website": "www.turkcell.com.tr"
        },
        "arçelik": {
            "name": "Arçelik Anonim Şirketi",
            "address": "Karaağaç Caddesi No:2-6 Sütlüce, 34445 Beyoğlu / İstanbul",
            "tax_no": "0730018000",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (212) 314 34 34",
            "email": "arcelik@arcelik.hs02.kep.tr",
            "website": "www.arcelik.com.tr"
        },
        "ford": {
            "name": "Ford Otomotiv Sanayi Anonim Şirketi",
            "address": "Akpınar Mah. Hasan Basri Cad. No:2 34885 Sancaktepe/İstanbul",
            "tax_no": "6490020363",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (216) 564 71 00",
            "email": "fordotosan@hs01.kep.tr",
            "website": "www.fordotosan.com.tr"
        },
        "migros": {
            "name": "Migros Ticaret A.Ş.",
            "address": "Atatürk Mah. Turgut Özal Bulvarı No:7 34758 Ataşehir / İstanbul",
            "tax_no": "6220529513",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (216) 579 30 00",
            "email": "migrosticaretas@hs01.kep.tr",
            "website": "www.migros.com.tr"
        },
        "akbank": {
            "name": "Akbank T.A.Ş.",
            "address": "Sabancı Center 4. Levent 34330 Beşiktaş/İstanbul",
            "tax_no": "0150015264",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "444 25 25",
            "email": "akbank@akbank.hs03.kep.tr",
            "website": "www.akbank.com"
        },
        "is-bank": {
            "name": "Türkiye İş Bankası A.Ş.",
            "address": "İş Kuleleri 34330 Levent Beşiktaş / İstanbul",
            "tax_no": "4810058590",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "0850 724 0 724",
            "email": "isbankasi@hs02.kep.tr",
            "website": "www.isbank.com.tr"
        },
        "bim": {
            "name": "BİM Birleşik Mağazalar A.Ş.",
            "address": "Abdurrahmangazi Mah. Ebubekir Cad. No:73 Sancaktepe/İstanbul",
            "tax_no": "1750051846",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (216) 564 03 03",
            "email": "iletisim@bim.com.tr",
            "website": "www.bim.com.tr"
        },
        "pegasus": {
            "name": "Pegasus Hava Taşımacılığı A.Ş.",
            "address": "Yenişehir Mah. Osmanlı Bulvarı No:11/A Kurtköy - Pendik / İstanbul",
            "tax_no": "7230047085",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (216) 560 70 00",
            "email": "pegasus@hs03.kep.tr",
            "website": "www.flypgs.com"
        },
        "sabanci": {
            "name": "Hacı Ömer Sabancı Holding A.Ş.",
            "address": "Sabancı Center Kule 2 Kat 23 34330 4. Levent/İstanbul",
            "tax_no": "4540019679",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (212) 385 80 80",
            "email": "info@sabanci.com",
            "website": "www.sabanci.com"
        },
        "limak": {
            "name": "Limak İnşaat Sanayi ve Ticaret A.Ş.",
            "address": "Hafta Sokak No:9 Gaziosmanpaşa 06700 Çankaya/Ankara",
            "tax_no": "5700010996",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (312) 446 88 00",
            "email": "limakinsaat@hs02.kep.tr",
            "website": "www.limak.com.tr"
        },
        "tupras": {
            "name": "Türkiye Petrol Rafinerileri A.Ş.",
            "address": "Gülbahar Mah. Büyükdere Cad. No: 101/A 34394 Şişli / İstanbul",
            "tax_no": "8750014267",
            "tax_office": "Tepecik Vergi Dairesi",
            "phone": "0 212 878 90 00",
            "email": "tupras@tupras.hs02.kep.tr",
            "website": "www.tupras.com.tr"
        },
        "enerjisa": {
            "name": "Enerjisa Enerji A.Ş.",
            "address": "Barbaros Mah. Begonya Sok. Nida Kule Ataşehir Batı Sitesi No: 1 / 1 Ataşehir / İstanbul",
            "tax_no": "3350429099",
            "tax_office": "Kozyatağı Vergi Dairesi",
            "phone": "0 216 579 05 79",
            "email": "enerjisaenerji@hs01.kep.tr",
            "website": "www.enerjisa.com.tr"
        },
        "hepsiburada": {
            "name": "D-Market Elektronik Hizmetler ve Ticaret A.Ş.",
            "address": "Kuştepe Mah. Mecidiyeköy Yolu Cad. Trump Towers Kule 2 Kat:2 No:12 34387 Şişli / İstanbul",
            "tax_no": "0265017991",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "0850 252 40 00",
            "email": "dmarket@hs02.kep.tr",
            "website": "www.hepsiburada.com"
        },
        "yemeksepeti": {
            "name": "Yemek Sepeti Elektronik İletişim Perakende Gıda A.Ş.",
            "address": "Esentepe Mah. Dede Korkut Sok. No: 28/1 34394 Şişli / İstanbul",
            "tax_no": "0947045746",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "+90 (212) 359 18 00",
            "email": "yemeksepeti@hs01.kep.tr",
            "website": "www.yemeksepeti.com"
        },
        "medicalpark": {
            "name": "MLP Sağlık Hizmetleri A.Ş.",
            "address": "Dikilitaş Mah. Emirhan Cad. Barbaros Plaza No:113 Beşiktaş / İstanbul",
            "tax_no": "6130582094",
            "tax_office": "Büyük Mükellefler Vergi Dairesi",
            "phone": "(0212) 227 55 55",
            "email": "info@medicalpark.com.tr",
            "website": "www.medicalpark.com.tr"
        }
    }

    @classmethod
    async def research(cls, query: str):
        # Gerçek bir API sorgusunu simüle etmek için rastgele gecikme
        delay = random.uniform(0.8, 1.5)
        await asyncio.sleep(delay)

        q = query.lower().strip()
        
        # Tam veya kısmi eşleşme kontrolü
        for key in cls.KB:
            if key in q or q in key:
                return cls.KB[key]
        
        # Eşleşme yoksa "Smart AI Prediction" (Sicil API Simülasyonu)
        clean_name = q.replace(" ", "").replace("a.ş", "").replace("ltd", "").replace("şti", "")
        return {
            "name": query.upper() + " TİCARET VE SANAYİ A.Ş.",
            "address": "Genel Merkez, " + random.choice(["Levent", "Maslak", "Ataşehir", "Çankaya", "Bornova"]) + " / Türkiye",
            "tax_no": str(random.randint(1000000000, 9999999999)),
            "tax_office": random.choice(["Büyük Mükellefler", "Kozyatağı", "Beşiktaş", "Yenimahalle", "Zincirlikuyu"]) + " Vergi Dairesi",
            "phone": "+90 (212) " + str(random.randint(100, 999)) + " " + str(random.randint(10, 99)) + " " + str(random.randint(10, 99)),
            "email": "info@" + clean_name + ".com.tr",
            "website": "www." + clean_name + ".com.tr",
            "api_status": "Simulated Sicil API Result"
        }

@app.post("/api/companies/research")
async def research_company(data: dict, current_user: dict = Depends(check_admin)):
    """Şirket bilgilerini araştırır (Gelişmiş AI/Simulated API)."""
    name_query = data.get("name", "")
    if not name_query:
        return {"error": "İsim belirtilmedi."}
    
    result = await CompanyResearchService.research(name_query)
    return result

# ===================== API ENDPOINTS =====================

@app.get("/api/requests")
def list_requests(company_id: int = 1, current_user: dict = Depends(get_current_user)):
    """Tüm satın alma taleplerini listeler."""
    return database.get_all_requests(company_id)

@app.get("/api/stats")
def get_stats(company_id: int = 1, current_user: dict = Depends(get_current_user)):
    """Dashboard istatistiklerini döner."""
    return database.get_stats(company_id)

@app.get("/api/settings")
def get_user_settings(current_user: dict = Depends(check_admin)):
    """Sistem/Bildirim ayarlarını getirir."""
    return database.get_settings()

@app.post("/api/settings")
def update_user_settings(settings: Dict[str, str], current_user: dict = Depends(check_admin)):
    """Sistem/Bildirim ayarlarını günceller."""
    database.update_settings(settings)
    return {"success": True}

@app.post("/api/requests")
def create_request(data: RequestCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Yeni bir satın alma talebi oluşturur."""
    result = database.create_request(data.description, data.amount, data.requester, data.company_id)
    if "request_no" in result:
        sys_settings = database.get_settings()
        if sys_settings.get("notify_new_request") == "true":
            background_tasks.add_task(
                email_service.notify_new_request, 
                result["request_no"], 
                data.description, 
                data.amount, 
                data.requester
            )
    return result

@app.post("/api/requests/update")
def update_request(data: RequestUpdate, background_tasks: BackgroundTasks, current_user: dict = Depends(check_admin)):
    """Mevcut bir talebin durumunu günceller. (Sadece Admin)"""
    # Mevcut talebin açıklamasını almak için:
    reqs = database.get_all_requests()
    description = ""
    req_no = ""
    for r in reqs:
        if r['id'] == data.id:
            description = r['description']
            req_no = r['request_no']
            break

    result = database.update_request(
        req_id=data.id,
        status=data.status,
        amount=data.amount,
        supplier=data.supplier,
        address=data.address
    )
    if req_no and data.status in ["approved", "rejected", "po", "delivered", "paid"]:
        sys_settings = database.get_settings()
        send_mail = False
        
        if data.status == "approved" and sys_settings.get("notify_approved") == "true":
            send_mail = True
        elif data.status == "rejected" and sys_settings.get("notify_rejected") == "true":
            send_mail = True
        elif data.status in ["po", "delivered", "paid"] and sys_settings.get("notify_operation") == "true":
            send_mail = True

        if send_mail:
            background_tasks.add_task(
                email_service.notify_status_change,
                req_no,
                data.status,
                description
            )
        
    return result

@app.delete("/api/requests/{req_id}")
def delete_request(req_id: int, current_user: dict = Depends(check_admin)):
    """Bir talebi tamamen siler. (Sadece Admin)"""
    return database.delete_request(req_id)

@app.get("/api/stock", response_model=List[StockOut])
def get_stock(company_id: int = 1, current_user: dict = Depends(get_current_user)):
    """Tüm stok verilerini döndürür."""
    return database.get_all_stocks(company_id)

@app.post("/api/stock/manual")
def add_manual_stock(data: StockManualCreate, current_user: dict = Depends(get_current_user)):
    """Sisteme manuel stok girişi yapar."""
    return database.add_manual_stock(
        item_name=data.item_name,
        quantity=data.quantity,
        unit=data.unit,
        company_id=data.company_id,
        supplier=data.supplier
    )

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

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    
    # Standard Security Headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https: https://ui-avatars.com; "
        "connect-src 'self';"
    )
    
    # Cache Control for Static Assets
    if request.url.path.startswith("/css") or request.url.path.startswith("/js"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        
    return response

# Ana sayfa
@app.get("/")
def root():
    return FileResponse("index.html", headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"})

@app.get("/index.html")
def index():
    return FileResponse("index.html")
