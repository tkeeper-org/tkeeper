export class ApiError extends Error {
  constructor(message, {
    url,
    method,
    status,
    warning = null,
    errorType = null,
    errorCode = null,
    details = null,
    responseText = null,
    cause = null
  } = {}) {
    super(message);
    this.name = "ApiError";
    this.url = url;
    this.method = method;
    this.status = status;
    this.warning = warning;
    this.errorType = errorType;
    this.errorCode = errorCode;
    this.details = details;
    this.responseText = responseText;
    if (cause) this.cause = cause;
  }
}

export class ApiResult {
  constructor(data, { warning = null, status = 200, headers = null } = {}) {
    this.data = data;
    this.warning = warning;
    this.status = status;
    this.headers = headers;
  }
}

class TokenStore {
  constructor(mode = "session") {
    this.mode = mode;
    this.memoryToken = null;
    this.key = "tkeeper.ui.token";
  }

  setMode(mode) { this.mode = mode; }

  get() {
    if (this.mode === "memory") return this.memoryToken;
    if (this.mode === "local") return safeGetStorage(localStorage, this.key);
    return safeGetStorage(sessionStorage, this.key);
  }

  set(token) {
    const t = normalizeToken(token);
    if (this.mode === "memory") { this.memoryToken = t; return; }
    if (this.mode === "local") { safeSetStorage(localStorage, this.key, t); return; }
    safeSetStorage(sessionStorage, this.key, t);
  }

  clear() {
    if (this.mode === "memory") { this.memoryToken = null; return; }
    safeRemoveStorage(sessionStorage, this.key);
    safeRemoveStorage(localStorage, this.key);
  }
}

function safeGetStorage(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
function safeSetStorage(storage, key, value) {
  try {
    if (value == null || value === "") storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {}
}
function safeRemoveStorage(storage, key) {
  try { storage.removeItem(key); } catch {}
}
function normalizeToken(token) {
  if (token == null) return null;
  const t = String(token).trim();
  return t.length ? t : null;
}

const OIDC_PKCE_KEY = "tkeeper.ui.oidc.pkce";

function b64url(bytes) {
  const bin = Array.from(bytes, b => String.fromCharCode(b)).join("");
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function randBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}
async function sha256(str) {
  const enc = new TextEncoder().encode(str);
  const dig = await crypto.subtle.digest("SHA-256", enc);
  return new Uint8Array(dig);
}
function rndStateHex() {
  const a = randBytes(16);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

export const api = {
  auth: {
    config: null,
    id: null,
    requestHeader: null,
    loaded: false,
  },

  _tokenStore: new TokenStore("session"),

  async initAuth() {
    const cfg = await this.getAuthConfig();
    this.auth.config = cfg || null;
    this.auth.id = cfg?.id ?? null;
    this.auth.requestHeader = cfg?.header ?? null;
    this.auth.loaded = true;
    return this.auth;
  },

  async getAuthConfig() {
    const res = await requestJson("GET", "/v1/keeper/control/auth/config", { skipAuth: true });
    return res.data;
  },

  setToken(token) { this._tokenStore.set(token); },
  getToken() { return this._tokenStore.get(); },
  clearToken() { this._tokenStore.clear(); },
  setTokenStorage(mode) { this._tokenStore.setMode(mode); },

  oidc: {
    savePkce(data) {
      try { sessionStorage.setItem(OIDC_PKCE_KEY, JSON.stringify(data)); } catch {}
    },
    loadPkce() {
      try {
        const s = sessionStorage.getItem(OIDC_PKCE_KEY);
        return s ? JSON.parse(s) : null;
      } catch { return null; }
    },
    clearPkce() {
      try { sessionStorage.removeItem(OIDC_PKCE_KEY); } catch {}
    },

    async discover(discoveryUrl) {
      const res = await requestJson("GET", discoveryUrl, { skipAuth: true });
      return res.data;
    },

    async makePkce() {
      const verifier = b64url(randBytes(32));
      const challenge = b64url(await sha256(verifier));
      return { verifier, challenge, method: "S256" };
    },

    buildAuthorizeUrl({ authorizationEndpoint, clientId, callbackUrl, scope, audience = null, state, challenge }) {
      const u = new URL(authorizationEndpoint);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", clientId);
      u.searchParams.set("redirect_uri", callbackUrl);
      u.searchParams.set("scope", scope || "openid");
      u.searchParams.set("code_challenge_method", "S256");
      u.searchParams.set("code_challenge", challenge);
      u.searchParams.set("state", state);
      if (audience) u.searchParams.set("audience", audience);
      return u.toString();
    },

    async exchangeCode({ tokenEndpoint, clientId, code, verifier, callbackUrl }) {
      const body = new URLSearchParams();
      body.set("grant_type", "authorization_code");
      body.set("client_id", clientId);
      body.set("code", code);
      body.set("redirect_uri", callbackUrl);
      body.set("code_verifier", verifier);

      const res = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "accept": "application/json",
        },
        body: body.toString(),
        credentials: "omit",
      });

      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch {}

      if (!res.ok) {
        throw new ApiError(`OIDC token exchange failed (HTTP ${res.status})`, {
          url: tokenEndpoint,
          method: "POST",
          status: res.status,
          details: json?.error_description || json?.error || text,
          responseText: text,
        });
      }
      return json;
    },

    rndState: rndStateHex,
  },

  async getMe() {
    const res = await this.getJson("/v1/keeper/control/me");
    return res.data;
  },

  async listKeys(params = {}) {
    const res = await this.getJson("/v1/keeper/control/keys", { query: params });
    return res.data;
  },

  async getStatus() {
    const res = await this.getJson("/v1/keeper/system/status");
    return res.data;
  },

  async dkgGenerate(body) {
    const res = await this.postJson("/v2/keeper/dkg", body);
    return res?.data ?? res;
  },

  async getSystem() {
    const res = await this.getJson("/v1/keeper/control/system");
    return res?.data ?? res;
  },

  async getInventory({ logicalId = null, assetOwner = null, historical = false, lastSeen = null, limit = 200 } = {}) {
    const qs = new URLSearchParams();
    if (logicalId) qs.set("logicalId", logicalId);
    if (assetOwner) qs.set("assetOwner", assetOwner);
    if (historical) qs.set("historical", "true");
    if (lastSeen) qs.set("lastSeen", lastSeen);
    if (limit != null) qs.set("limit", String(Math.min(200, Number(limit) || 200)));

    const url = "/v1/keeper/compliance/inventory" + (qs.toString() ? `?${qs}` : "");
    const res = await this.getJson(url);
    return res?.data ?? res;
  },

  async verifyAuditLine(signedLine) {
    const res = await this.postJson("/v1/keeper/audit/verify", signedLine);
    return res?.data ?? res;
  },

  async verifyAuditBatch(lines) {
    const res = await this.postJson("/v1/keeper/audit/verify/batch", { logs: lines });
    return res?.data ?? res;
  },

  async storeKey(body) {
    return await this.postJson("/v2/keeper/storage/store", body);
  },

  async promoteQuorum(body) {
    const res = await this.postJson("/v2/keeper/quorum/promote", body);
    return res?.data ?? res;
  },

  async getAuditSinks() {
    const res = await this.getJson("/v1/keeper/control/audit/sinks");
    return res?.data ?? res;
  },

  async systemInit(body) {
    const res = await this.postJson("/v1/keeper/system/init", body);
    return res.data;
  },

  async systemUnseal(body) {
    const res = await this.postJson("/v1/keeper/system/unseal", body);
    return res.data;
  },

  async systemUnsealAuto() {
    const res = await this.getJson("/v1/keeper/system/unseal");
    return res?.data ?? res;
  },

  async getPublicKey(keyId, generation = null) {
    const query = {};
    if (keyId != null && keyId !== "") query.keyId = keyId;
    if (generation != null) query.generation = generation;
    const res = await this.getJson("/v1/keeper/publicKey", { query });
    return res?.data ?? res;
  },

  async destroyKey(body) {
    return await this.postJson("/v1/keeper/destroy", body);
  },

  async getJson(path, { query = null, headers = null, signal = null } = {}) {
    return requestJson("GET", path, { query, headers, signal });
  },
  async postJson(path, body, { query = null, headers = null, signal = null } = {}) {
    return requestJson("POST", path, { query, headers, body, signal });
  },
  async deleteJson(path, { query = null, headers = null, signal = null } = {}) {
    return requestJson("DELETE", path, { query, headers, signal });
  },
};

async function requestJson(method, path, { query, headers, body, signal, skipAuth = false } = {}) {
  const url = withQuery(path, query);

  const reqHeaders = new Headers(headers || {});
  reqHeaders.set("accept", "application/json");

  if (!skipAuth) {
    const token = api.getToken();
    const headerName = api.auth.requestHeader;
    if (token && headerName) reqHeaders.set(headerName, token);
  }

  let payload = undefined;
  if (body !== undefined) {
    reqHeaders.set("content-type", "application/json");
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: payload,
      credentials: "same-origin",
      signal,
    });
  } catch (e) {
    throw new ApiError(`Network error calling ${method} ${url}`, {
      url, method, status: 0, cause: e
    });
  }

  const warning = parseWarningHeader(res);

  if (res.status === 299) {
    const data = await tryReadJson(res);
    return new ApiResult(data, { warning, status: res.status, headers: res.headers });
  }

  if (res.ok) {
    const data = await tryReadJson(res);
    return new ApiResult(data, { warning, status: res.status, headers: res.headers });
  }

  const errParsed = await tryReadJson(res);
  if (isErrorMessage(errParsed)) {
    throw new ApiError(
      errParsed.details || `${errParsed.error}`,
      {
        url,
        method,
        status: res.status,
        warning,
        errorType: errParsed.error,
        errorCode: errParsed.code ?? null,
        details: errParsed.details ?? null,
      }
    );
  }

  const text = await safeReadText(res);
  throw new ApiError(`HTTP ${res.status} calling ${method} ${url}`, {
    url,
    method,
    status: res.status,
    warning,
    responseText: text
  });
}

function withQuery(path, query) {
  if (!query) return path;

  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  return url.origin === window.location.origin
    ? (url.pathname + (url.search ? url.search : ""))
    : url.toString();
}

function parseWarningHeader(res) {
  const w = res.headers.get("Warning") || res.headers.get("warning");
  return w || null;
}

async function tryReadJson(res) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const text = await safeReadText(res);
  if (!text) return null;

  const looksJson =
    ct.includes("application/json") ||
    text.trim().startsWith("{") ||
    text.trim().startsWith("[");

  if (!looksJson) return null;

  try { return JSON.parse(text); } catch { return null; }
}

async function safeReadText(res) {
  try { return await res.text(); } catch { return ""; }
}

function isErrorMessage(obj) {
  return obj
    && typeof obj === "object"
    && typeof obj.error === "string"
    && (obj.code === undefined || obj.code === null || typeof obj.code === "number")
    && (obj.details === undefined || obj.details === null || typeof obj.details === "string");
}
