module.exports = class Document {
  constructor(fields = {}) {
    Object.assign(this, fields);
  }
};
