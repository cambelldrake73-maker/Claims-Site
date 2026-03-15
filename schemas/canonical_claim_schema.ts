export interface CanonicalClaimSchema {
  patient?: Record<string, unknown>;
  provider?: Record<string, unknown>;
  claimItems?: unknown[];
  denialCodes?: unknown[];
  originalPayerResponse?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
}
