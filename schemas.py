from pydantic import BaseModel
from typing import Optional

class RequestCreate(BaseModel):
    description: str
    amount: Optional[str] = "Teklif Bekleniyor"

class RequestUpdate(BaseModel):
    id: int
    status: str
    amount: Optional[str] = None
    supplier: Optional[str] = None
    address: Optional[str] = None
