module.exports = {
  formatTo837(canonicalClaim, options = {}) {
    return { segments: ['ISA','GS','ST','SE','GE','IEA'], claim: canonicalClaim, options };
  }
};
