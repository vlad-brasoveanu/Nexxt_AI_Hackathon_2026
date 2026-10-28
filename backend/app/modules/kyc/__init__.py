"""KYC check modules. Each file holds one independently registered check."""
from app.modules.kyc import consistency, freshness, validity

MODULES = [validity.MODULE, consistency.MODULE, freshness.MODULE]
