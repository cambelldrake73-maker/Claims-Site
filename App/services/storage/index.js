async function storeDocument(fileMeta) {
  return {
    id: 'doc_' + Date.now(),
    ...fileMeta
  };
}

module.exports = { storeDocument };
