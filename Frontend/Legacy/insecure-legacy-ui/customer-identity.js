(function attachCustomerIdentity(global) {
  const STORAGE_KEY = 'revcapture_customer_id';
  const FALLBACK_CUSTOMER_ID = 'demo_customer';

  function normalizeCustomerId(value) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  function readUrlCustomerId() {
    try {
      const params = new URLSearchParams(global.location && global.location.search
        ? global.location.search
        : '');
      return normalizeCustomerId(params.get('customer_id'));
    } catch (err) {
      return null;
    }
  }

  function readStoredCustomerId() {
    try {
      return normalizeCustomerId(global.localStorage && global.localStorage.getItem(STORAGE_KEY));
    } catch (err) {
      return null;
    }
  }

  function persistCustomerId(customerId) {
    const normalized = normalizeCustomerId(customerId);
    if (!normalized) {
      return;
    }

    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, normalized);
      }
    } catch (err) {
      // Ignore localStorage write failures in restricted browser contexts.
    }
  }

  function getCurrentCustomerId() {
    const urlCustomerId = readUrlCustomerId();
    if (urlCustomerId) {
      persistCustomerId(urlCustomerId);
      return urlCustomerId;
    }

    return readStoredCustomerId() || FALLBACK_CUSTOMER_ID;
  }

  global.persistCustomerId = persistCustomerId;
  global.getCurrentCustomerId = getCurrentCustomerId;
})(window);
