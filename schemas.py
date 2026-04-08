from pydantic import BaseModel
from typing import Optional, List

class RequestCreate(BaseModel):
    description: str
    amount: Optional[str] = "Teklif Bekleniyor"
    requester: Optional[str] = "Bilinmiyor"
    company_id: Optional[int] = 1

class CompanyOut(BaseModel):
    id: int
    name: str
    address: Optional[str] = ""
    tax_no: Optional[str] = ""
    tax_office: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    website: Optional[str] = ""

class CompanyCreate(BaseModel):
    name: str
    address: Optional[str] = ""
    tax_no: Optional[str] = ""
    tax_office: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    website: Optional[str] = ""

class RequestUpdate(BaseModel):
    id: int
    status: str
    amount: Optional[str] = None
    supplier: Optional[str] = None
    address: Optional[str] = None

# --- Auth Schemas ---

class UserLogin(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str

class UserRoleUpdate(BaseModel):
    role: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    company_ids: Optional[List[int]] = None

class StockManualCreate(BaseModel):
    item_name: str
    quantity: int
    unit: str
    company_id: int
    supplier: Optional[str] = ""

class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    company_ids: Optional[List[int]] = []

class UserCompanyAssign(BaseModel):
    company_ids: List[int]

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

class StockOut(BaseModel):
    id: int
    request_id: int
    item_name: str
    quantity: int
    unit: str
    date_added: str
    request_no: str
