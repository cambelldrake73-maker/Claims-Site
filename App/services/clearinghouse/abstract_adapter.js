class AbstractAdapter {
  async submitClaim(formattedEdi, metadata) {
    throw new Error('submitClaim not implemented');
  }
}
module.exports = AbstractAdapter;
