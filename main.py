from fastapi import FastAPI, HTTPException, Depends, status, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from datetime import datetime, timedelta
from schemas import RequestCreate, RequestUpdate, UserLogin, UserOut, Token
import database

# Veritabanını başlat
database.init_db()

app = FastAPI(
    title="CorpBuy - Enterprise Purchasing & Billing API",
    description="Kurumsal Satın Alma ve Faturalandırma Sistemi REST API",
    version="2.0.0"
)

# --- Auth Configuration ---
SECRET_KEY = "SatinAlma_Sistemi_Secret_Key_Change_Me"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 1 day

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

# ===================== API ENDPOINTS =====================

@app.get("/api/requests")
def list_requests(current_user: dict = Depends(get_current_user)):
    """Tüm satın alma taleplerini listeler."""
    return database.get_all_requests()

@app.get("/api/stats")
def get_stats(current_user: dict = Depends(get_current_user)):
    """Dashboard istatistiklerini döner."""
    return database.get_stats()

@app.post("/api/requests")
def create_request(data: RequestCreate, current_user: dict = Depends(get_current_user)):
    """Yeni bir satın alma talebi oluşturur."""
    result = database.create_request(data.description, data.amount)
    return result

@app.post("/api/requests/update")
def update_request(data: RequestUpdate, current_user: dict = Depends(check_admin)):
    """Mevcut bir talebin durumunu günceller. (Sadece Admin)"""
    result = database.update_request(
        req_id=data.id,
        status=data.status,
        amount=data.amount,
        supplier=data.supplier,
        address=data.address
    )
    return result

@app.delete("/api/requests/{req_id}")
def delete_request(req_id: int, current_user: dict = Depends(check_admin)):
    """Bir talebi tamamen siler. (Sadece Admin)"""
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

@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
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
