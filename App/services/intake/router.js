function routeCases(cases) {
  const inputCases = Array.isArray(cases) ? cases : [];

  return inputCases.map(caseRecord => ({
    ...caseRecord
  }));
}

module.exports = { routeCases };
