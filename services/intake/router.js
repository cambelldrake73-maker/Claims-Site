function routeCases(cases) {
  const inputCases = Array.isArray(cases) ? cases : [];

  return inputCases.map(caseRecord => {
    const routedCase = { ...caseRecord };

    const patientMissing = !routedCase.patient;
    const payerMissing = !routedCase.payer;

    const amountInvalid =
      routedCase.amount === null ||
      routedCase.amount === undefined ||
      Number.isNaN(Number(routedCase.amount));

    const denialReason = String(routedCase.denial_reason || '')
      .trim()
      .toLowerCase();

    // 1. Hard stop: not recoverable
    if (!amountInvalid && Number(routedCase.amount) <= 0) {
      routedCase.status = 'not_recoverable';
      return routedCase;
    }

    // 2. Missing core fields → review
    if (patientMissing || payerMissing || amountInvalid) {
      routedCase.status = 'needs_review';
      return routedCase;
    }

    // 3. Missing or weak denial reason → review
    if (!denialReason || denialReason === 'unspecified') {
      routedCase.status = 'needs_review';
      return routedCase;
    }

    // 4. Otherwise ready
    routedCase.status = 'submission_ready';
    return routedCase;
  });
}

module.exports = { routeCases };
