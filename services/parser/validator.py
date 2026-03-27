from .schema import CanonicalClaim


ALLOWED_STATUSES = {"denied", "paid", "pending", "under_review", "approved", "submitted", "not_recoverable"}


def validate_claim(claim: CanonicalClaim) -> bool:
    if not claim.claim_id:
        raise ValueError("Missing claim_id")

    if not claim.patient_id:
        raise ValueError("Missing patient_id")

    if not claim.provider_id:
        raise ValueError("Missing provider_id")

    if not claim.procedure_code:
        raise ValueError("Missing procedure_code")

    if claim.amount_billed <= 0:
        raise ValueError("Invalid amount_billed")

    if claim.status not in ALLOWED_STATUSES:
        raise ValueError(f"Invalid claim status: {claim.status}")

    return True
