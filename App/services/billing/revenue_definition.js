const DEFAULT_PLATFORM_FEE_PERCENT = 0.20;
const DEFAULT_CLEARINGHOUSE_COST = 0.75;

function normalizeAmount(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).replace(/[$,\s]/g, '');
  if (normalized === '') {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  const normalized = normalizeAmount(value);
  return normalized === null ? 0 : Number(normalized.toFixed(2));
}

function normalizeStatus(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

function getRecoveredAmount(claim = {}, recoveryEvent = {}) {
  const claimObject = claim && typeof claim === 'object' ? claim : {};
  const eventObject = recoveryEvent && typeof recoveryEvent === 'object' ? recoveryEvent : {};
  const candidates = [
    eventObject.paid_amount,
    eventObject.recovered_amount,
    claimObject.recovered_amount,
    claimObject.paid_amount
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAmount(candidate);
    if (normalized !== null) {
      return roundCurrency(normalized);
    }
  }

  return 0;
}

function isRecoveredClaim(claim = {}, recoveryEvent = {}) {
  const recoveredAmount = getRecoveredAmount(claim, recoveryEvent);

  if (recoveredAmount <= 0) {
    return false;
  }

  const statuses = [
    normalizeStatus(recoveryEvent.status),
    normalizeStatus(recoveryEvent.submission_result),
    normalizeStatus(claim.status)
  ].filter(Boolean);

  if (!statuses.length) {
    return true;
  }

  if (statuses.some(status => status === 'paid' || status === 'partial' || status === 'recovered')) {
    return true;
  }

  if (statuses.some(status => (
    status === 'failed'
    || status === 'denied'
    || status === 'pending'
    || status === 'submitted'
    || status === 'approved'
    || status === 'ready_for_submission'
    || status === 'not_recoverable'
  ))) {
    return false;
  }

  return true;
}

function getPlatformFeePercent(input = {}) {
  const explicit = normalizeAmount(
    input.platform_fee_percent
    ?? input.fee_percent
  );

  return explicit === null ? DEFAULT_PLATFORM_FEE_PERCENT : explicit;
}

function getPlatformFeeAmount(input = {}) {
  const explicit = normalizeAmount(input.platform_fee_amount);
  if (explicit !== null) {
    return roundCurrency(explicit);
  }

  const claim = input.claim || input;
  const recoveryEvent = input.event || input.recoveryEvent || input;
  const recoveredAmount = getRecoveredAmount(claim, recoveryEvent);

  if (recoveredAmount <= 0) {
    return 0;
  }

  return roundCurrency(recoveredAmount * getPlatformFeePercent(input));
}

function getClearinghouseCost(input = {}) {
  const explicit = normalizeAmount(input.clearinghouse_cost);
  if (explicit !== null) {
    return roundCurrency(explicit);
  }

  const claim = input.claim || input;
  const recoveryEvent = input.event || input.recoveryEvent || input;
  return getRecoveredAmount(claim, recoveryEvent) > 0
    ? DEFAULT_CLEARINGHOUSE_COST
    : 0;
}

function getInvoiceableAmount(input = {}) {
  const explicit = normalizeAmount(
    input.invoiceable_amount
    ?? input.amount_due
    ?? input.net_due
  );

  if (explicit !== null) {
    return roundCurrency(explicit);
  }

  const claim = input.claim || input;
  const recoveryEvent = input.event || input.recoveryEvent || input;
  const recoveredAmount = getRecoveredAmount(claim, recoveryEvent);

  if (recoveredAmount <= 0) {
    return 0;
  }

  return roundCurrency(
    getPlatformFeeAmount(input) + getClearinghouseCost(input)
  );
}

function getInvoiceAmountPaid(invoice = {}) {
  const explicit = normalizeAmount(invoice.amount_paid);
  if (explicit !== null) {
    return roundCurrency(explicit);
  }

  return normalizeStatus(invoice.status) === 'paid'
    ? getInvoiceableAmount(invoice)
    : 0;
}

function getRemainingBalance(invoice = {}) {
  const explicit = normalizeAmount(invoice.remaining_balance);
  if (explicit !== null) {
    return Math.max(0, roundCurrency(explicit));
  }

  return Math.max(
    0,
    roundCurrency(getInvoiceableAmount(invoice) - getInvoiceAmountPaid(invoice))
  );
}

function getInvoicePaymentStatus(invoice = {}) {
  const explicitStatus = normalizeStatus(invoice.status);
  if (explicitStatus === 'paid' || explicitStatus === 'partial' || explicitStatus === 'pending') {
    return explicitStatus;
  }

  const amountDue = getInvoiceableAmount(invoice);
  const amountPaid = getInvoiceAmountPaid(invoice);

  if (amountDue > 0 && amountPaid >= amountDue) {
    return 'paid';
  }

  if (amountPaid > 0) {
    return 'partial';
  }

  return 'pending';
}

function getRecoverySummary(input = {}) {
  const claim = input.claim || input;
  const recoveryEvent = input.event || input.recoveryEvent || input;
  const recovered_amount = getRecoveredAmount(claim, recoveryEvent);
  const recovered_claim = isRecoveredClaim(claim, recoveryEvent);
  const platform_fee_percent = getPlatformFeePercent(input);
  const platform_fee_amount = getPlatformFeeAmount({
    ...input,
    claim,
    event: recoveryEvent
  });
  const clearinghouse_cost = getClearinghouseCost({
    ...input,
    claim,
    event: recoveryEvent
  });
  const invoiceable_amount = getInvoiceableAmount({
    ...input,
    claim,
    event: recoveryEvent
  });

  return {
    recovered_claim,
    recovered_amount,
    gross_recovered_amount: recovered_amount,
    platform_fee_percent,
    platform_fee_amount,
    clearinghouse_cost,
    invoiceable_amount,
    net_due: invoiceable_amount
  };
}

module.exports = {
  DEFAULT_PLATFORM_FEE_PERCENT,
  DEFAULT_CLEARINGHOUSE_COST,
  normalizeAmount,
  isRecoveredClaim,
  getRecoveredAmount,
  getPlatformFeePercent,
  getPlatformFeeAmount,
  getClearinghouseCost,
  getInvoiceableAmount,
  getInvoiceAmountPaid,
  getInvoicePaymentStatus,
  getRemainingBalance,
  getRecoverySummary
};
