import { api } from "./api.js";

export const Permission = Object.freeze({
  KEY_GET_PUBLICKEY: "tkeeper.key.%s.public",
  KEY_SIGN: "tkeeper.key.%s.sign",
  KEY_VERIFY: "tkeeper.key.%s.verify",
  KEY_ENCRYPT: "tkeeper.key.%s.encrypt",
  KEY_DECRYPT: "tkeeper.key.%s.decrypt",
  KEY_DESTROY: "tkeeper.key.%s.destroy",

  SYSTEM_UNSEAL: "tkeeper.system.unseal",
  SYSTEM_SEAL: "tkeeper.system.seal",
  SYSTEM_INIT: "tkeeper.system.init",
  SYSTEM_STATUS: "tkeeper.system.status",

  STORE_WRITE: "tkeeper.storage.write",
  GENERATE_KEY: "tkeeper.dkg.%s",

  INTEGRITY_ROTATE: "tkeeper.integrity.rotate",
  AUDIT_LOG_VERIFY: "tkeeper.audit.log.verify",
  COMPLIANCE_INVENTORY: "tkeeper.compliance.inventory",
  CONSISTENCY_FIX: "tkeeper.consistency.fix",

  integrityRotate() { return Permission.INTEGRITY_ROTATE; },
  systemUnseal() { return Permission.SYSTEM_UNSEAL; },
  systemSeal() { return Permission.SYSTEM_SEAL; },
  systemInit() { return Permission.SYSTEM_INIT; },
  systemStatus() { return Permission.SYSTEM_STATUS; },
  storageWrite() { return Permission.STORE_WRITE; },
  auditLogVerify() { return Permission.AUDIT_LOG_VERIFY; },
  inventory() { return Permission.COMPLIANCE_INVENTORY; },
  consistencyFix() { return Permission.CONSISTENCY_FIX; },

  keyGetPublicKey(key) { return fmt(Permission.KEY_GET_PUBLICKEY, key); },
  keySign(key) { return fmt(Permission.KEY_SIGN, key); },
  keyVerify(key) { return fmt(Permission.KEY_VERIFY, key); },
  keyEncrypt(key) { return fmt(Permission.KEY_ENCRYPT, key); },
  keyDecrypt(key) { return fmt(Permission.KEY_DECRYPT, key); },
  keyDestroy(key) { return fmt(Permission.KEY_DESTROY, key); },

  generateKey(mode) { return fmt(Permission.GENERATE_KEY, String(mode).toLowerCase()); },
});

function fmt(template, value) {
  return template.replace("%s", String(value));
}

function createSegment(raw) {
  if (raw === "**") {
    throw new Error("Deep wildcard '**' is not allowed — permissions must be explicit per segment");
  }

  if (raw === "*") {
    return { matches: () => true };
  }

  const starCount = (raw.match(/\*/g) || []).length;

  if (starCount === 0) {
    return { matches: (v) => v === raw };
  }

  if (starCount > 1) {
    throw new Error(`Invalid pattern segment: '${raw}' — max one wildcard per segment`);
  }

  if (raw.endsWith("*")) {
    const prefix = raw.slice(0, -1);
    return { matches: (v) => v.startsWith(prefix) };
  }

  if (raw.startsWith("*")) {
    const suffix = raw.slice(1);
    return { matches: (v) => v.endsWith(suffix) };
  }

  const idx = raw.indexOf("*");
  const prefix = raw.slice(0, idx);
  const suffix = raw.slice(idx + 1);
  return {
    matches: (v) => v.startsWith(prefix) && v.endsWith(suffix) && v.length >= prefix.length + suffix.length,
  };
}

function parseSegments(pattern) {
  return String(pattern).split(".").filter(Boolean).map(createSegment);
}

function splitRaw(permission) {
  return String(permission).split(".").filter(Boolean);
}

function matchPermission(patternSegments, permission) {
  const pathSegments = splitRaw(permission);
  if (pathSegments.length === 0) return false;
  if (patternSegments.length !== pathSegments.length) return false;

  for (let i = 0; i < patternSegments.length; i++) {
    if (!patternSegments[i].matches(pathSegments[i])) return false;
  }
  return true;
}

export class PermissionSet {
  constructor(perms = []) {
    this._allow = [];
    this._deny = [];
    this._cache = new Map();
    this._cacheMax = 256;

    for (const p of perms) {
      if (typeof p !== "string" || !p) continue;

      if (p.startsWith("-")) {
        this._deny.push(parseSegments(p.slice(1)));
      } else {
        this._allow.push(parseSegments(p));
      }
    }
  }

  has(permission) {
    if (!permission || typeof permission !== "string") return false;

    const cached = this._cache.get(permission);
    if (cached !== undefined) return cached;

    const result = this._evaluate(permission);
    this._remember(permission, result);
    return result;
  }

  anyOf(patterns) {
    for (const p of patterns) if (this.has(p)) return true;
    return false;
  }

  allOf(patterns) {
    for (const p of patterns) if (!this.has(p)) return false;
    return true;
  }

  _evaluate(permission) {
    const allowed = this._allow.some((segs) => matchPermission(segs, permission));
    if (!allowed) return false;

    const denied = this._deny.some((segs) => matchPermission(segs, permission));
    return !denied;
  }

  _remember(key, value) {
    this._cache.set(key, value);
    if (this._cache.size > this._cacheMax) {
      const first = this._cache.keys().next().value;
      this._cache.delete(first);
    }
  }
}

export const Auth = {
  subject: null,
  permissions: new PermissionSet([]),
  loaded: false,

  async load() {
    const data = await api.getMe();
    this.subject = data?.subject ?? null;
    this.permissions = new PermissionSet(Array.isArray(data?.permissions) ? data.permissions : []);
    this.loaded = true;
    return this;
  },

  reset() {
    this.subject = null;
    this.permissions = new PermissionSet([]);
    this.loaded = false;
  },

  hasPermission(pattern) {
    return this.permissions.has(pattern);
  },

  requirePerm(pattern, message = "Access denied") {
    if (!this.hasPermission(pattern)) {
      const err = new Error(message);
      err.code = "ACCESS_DENIED";
      err.permission = pattern;
      throw err;
    }
  },

  requireAny(patterns, message = "Access denied") {
    if (!this.permissions.anyOf(patterns)) {
      const err = new Error(message);
      err.code = "ACCESS_DENIED";
      err.permissions = patterns;
      throw err;
    }
  },
};

export function keyPerms(key) {
  return Object.freeze({
    public: Permission.keyGetPublicKey(key),
    sign: Permission.keySign(key),
    verify: Permission.keyVerify(key),
    encrypt: Permission.keyEncrypt(key),
    decrypt: Permission.keyDecrypt(key),
    destroy: Permission.keyDestroy(key),
  });
}