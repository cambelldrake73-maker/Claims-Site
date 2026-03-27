import json
from .schema import CanonicalClaim


def parse_claim(raw_input: str) -> CanonicalClaim:
    try:
        data = json.loads(raw_input)
    except Exception as e:
        raise ValueError(f"Invalid JSON input: {e}")

    return CanonicalClaim(
        claim_id=data.get("claim_id"),
        patient_id=data.get("patient_id"),
        provider_id=data.get("provider_id"),
        procedure_code=data.get("procedure_code"),
        diagnosis_code=data.get("diagnosis_code"),
        amount_billed=float(data.get("amount_billed", 0)),
        amount_paid=float(data.get("amount_paid", 0)) if data.get("amount_paid") is not None else None,
        status=data.get("status", "unknown"),
    )

