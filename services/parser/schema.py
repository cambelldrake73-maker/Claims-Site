from pydantic import BaseModel
from typing import Optional


class CanonicalClaim(BaseModel):
    claim_id: str
    patient_id: str
    provider_id: str
    procedure_code: str
    diagnosis_code: Optional[str] = None
    amount_billed: float
    amount_paid: Optional[float] = None
    status: str
