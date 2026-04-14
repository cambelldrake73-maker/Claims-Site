(function attachAuthClient(global) {
  const TOKEN_STORAGE_KEY = 'revcapture_auth_token';
  const nativeFetch = typeof global.fetch === 'function'
    ? global.fetch.bind(global)
    : null;

  function normalizeToken(value) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  function readStoredToken() {
    try {
      return normalizeToken(global.localStorage && global.localStorage.getItem(TOKEN_STORAGE_KEY));
    } catch (err) {
      return null;
    }
  }

  function persistAuthToken(token) {
    const normalized = normalizeToken(token);

    if (!normalized) {
      return;
    }

    try {
      if (global.localStorage) {
        global.localStorage.setItem(TOKEN_STORAGE_KEY, normalized);
      }
    } catch (err) {
      // Ignore localStorage failures in restricted browsers.
    }
  }

  function clearAuthToken() {
    try {
      if (global.localStorage) {
        global.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (err) {
      // Ignore localStorage failures in restricted browsers.
    }
  }

  function getAuthToken() {
    return readStoredToken();
  }

  function getRequestUrl(input) {
    if (typeof input === 'string') {
      return input;
    }

    if (input && typeof input.url === 'string') {
      return input.url;
    }

    return '';
  }

  function isApiRequest(input) {
    const requestUrl = getRequestUrl(input);

    if (!requestUrl) {
      return false;
    }

    if (requestUrl.startsWith('/api/')) {
      return true;
    }

    try {
      const absolute = new URL(requestUrl, global.location && global.location.origin
        ? global.location.origin
        : undefined);
      return absolute.origin === global.location.origin && absolute.pathname.startsWith('/api/');
    } catch (err) {
      return false;
    }
  }

  function isLoginRequest(input) {
    return getRequestUrl(input).includes('/api/auth/login');
  }

  async function fetchWithAuth(input, init) {
    if (!nativeFetch) {
      throw new Error('fetch is not available in this browser');
    }

    if (!isApiRequest(input)) {
      return nativeFetch(input, init);
    }

    const token = getAuthToken();
    const requestInit = init ? { ...init } : {};
    const headers = new Headers(requestInit.headers || undefined);

    if (token && !headers.has('Authorization') && !isLoginRequest(input)) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    requestInit.headers = headers;
    const response = await nativeFetch(input, requestInit);

    if (response.status === 401 && !isLoginRequest(input)) {
      clearAuthToken();
    }

    return response;
  }

  async function loginWithPassword(email, password) {
    if (!nativeFetch) {
      throw new Error('fetch is not available in this browser');
    }

    const response = await nativeFetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload || payload.ok === false || !payload.token) {
      throw new Error(payload && payload.error ? payload.error : 'Login failed');
    }

    persistAuthToken(payload.token);
    return payload;
  }

  async function logoutSession() {
    try {
      if (nativeFetch && getAuthToken()) {
        await fetchWithAuth('/api/auth/logout', {
          method: 'POST'
        });
      }
    } finally {
      clearAuthToken();
    }
  }

  global.fetchWithAuth = fetchWithAuth;
  global.getAuthToken = getAuthToken;
  global.persistAuthToken = persistAuthToken;
  global.clearAuthToken = clearAuthToken;
  global.loginWithPassword = loginWithPassword;
  global.logoutSession = logoutSession;

  if (nativeFetch) {
    global.fetch = function patchedFetch(input, init) {
      return fetchWithAuth(input, init);
    };
  }
})(window);
