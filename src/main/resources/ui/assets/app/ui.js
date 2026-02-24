import { api, ApiError } from "./api.js";
import { Auth } from "./auth.js";

const ROUTES = {
  "#/welcome": { title: "Welcome", page: "/ui/pages/welcome.html", module: "/ui/assets/app/welcome.js" },
  "#/login": { title: "Login", page: "/ui/pages/login.html", module: "/ui/assets/app/login.js" },
  "#/oidc/callback": { title: "Signing in", page: "/ui/pages/oidc-callback.html", module: "/ui/assets/app/oidc-callback.js" },
  "#/keys": { title: "Manage Keys", page: "/ui/pages/keys.html", module: "/ui/assets/app/keys.js" },
  "#/keygen": { title: "Key Lifecycle", page: "/ui/pages/keygen.html", module: "/ui/assets/app/keygen.js" },
  "#/consistency": { title: "Consistency check", page: "/ui/pages/consistency.html", module: "/ui/assets/app/consistency.js" },
  "#/system": { title: "System", page: "/ui/pages/system.html", module: "/ui/assets/app/system.js" },
  "#/inventory": { title: "Asset Inventory", page: "/ui/pages/inventory.html", module: "/ui/assets/app/inventory.js" },
  "#/audit": { title: "Audit logging", page: "/ui/pages/audit.html", module: "/ui/assets/app/audit.js" },
  "#/init": { title: "Initialize", page: "/ui/pages/init.html", module: "/ui/assets/app/init.js" },
  "#/unseal": { title: "Unseal", page: "/ui/pages/unseal.html", module: "/ui/assets/app/unseal.js" },
  "#/unavailable": { title: "Unavailable", page: "/ui/pages/unavailable.html", module: "/ui/assets/app/unavailable.js" },
  "#/import": { title: "Import", page: "/ui/pages/import.html", module: "/ui/assets/app/import.js" },
  "#/audit-sinks": { title: "Sinks", page: "/ui/pages/audit-sinks.html", module: "/ui/assets/app/audit-sinks.js" },
};

const els = {
  view: document.getElementById("tk-view"),
  alerts: document.getElementById("tk-alerts"),
  title: document.getElementById("tk-page-title"),
  subject: document.getElementById("tk-subject"),
  hint: document.getElementById("tk-authhint"),
  avatar: document.getElementById("tk-avatar"),
  logout: document.getElementById("tk-logout"),
  logoutDD: document.getElementById("tk-logout-dd"),
};

let ROUTE_PARAMS = {};

boot();

async function boot() {
  wireLogout();

  bridgeOidcCallbackToHash();
  await api.initAuth().catch(() => {});

  await hydrateMe();
  applyNavPermissions();

  await gateByStatus();
  await navigate(normalizeRoute(location.hash));

  window.addEventListener("hashchange", async () => {
    await gateByStatus();
    await navigate(normalizeRoute(location.hash));
  });

  window.addEventListener("tkeeper:auth-changed", async () => {
    await hydrateMe();
    applyNavPermissions();
  });
}

function bridgeOidcCallbackToHash() {
  const p = window.location.pathname || "";
  if (!p.endsWith("/ui/oidc/callback")) return;

  const qs = new URLSearchParams(window.location.search);
  if (!qs.get("code") && !qs.get("error")) return;

  if (window.location.hash !== "#/oidc/callback") {
    window.location.hash = "#/oidc/callback";
  }
}

async function hydrateMe() {
  const token = api.getToken();
  if (!token) {
    renderSubjectUnauth();
    if (typeof Auth.reset === "function") Auth.reset();
    return;
  }

  try {
    await Auth.load();
    renderSubject(Auth.subject);
  } catch (e) {
    api.clearToken();
    if (typeof Auth.reset === "function") Auth.reset();
    renderSubjectUnauth();
    showAlert("warning", errorMessage(e));
  }
}

async function gateByStatus() {
  const r = normalizeRoute(location.hash);
  if (r === "#/login" || r === "#/oidc/callback" || r === "#/welcome") return;

  if (!Auth.subject) {
    location.hash = "#/welcome";
    return;
  }

  let st;
  try {
    st = await api.getStatus();
  } catch {
    ROUTE_PARAMS = {
      message: "Cannot read keeper status. Ask an administrator or check server connectivity."
    };
    location.hash = "#/unavailable";
    return;
  }

  if (st?.state === "UNINITIALIZED") {
    if (!Auth.hasPermission?.("tkeeper.system.init")) {
      ROUTE_PARAMS = {
        message: "Keeper is UNINITIALIZED. You don’t have tkeeper.system.init. Find someone who can initialize it."
      };
      location.hash = "#/unavailable";
      return;
    }
    location.hash = "#/init";
    return;
  }

  if (st?.state === "SEALED") {
    if (!Auth.hasPermission?.("tkeeper.system.unseal")) {
      ROUTE_PARAMS = {
        message: "Keeper is SEALED. You don’t have tkeeper.system.unseal. Find someone who can unseal it."
      };
      location.hash = "#/unavailable";
      return;
    }
    location.hash = "#/unseal";
    return;
  }
}

function wireLogout() {
  const fn = (e) => {
    e.preventDefault();

    api.clearToken();

    try { api.oidc?.clearPkce?.(); } catch {}

    if (typeof Auth.reset === "function") Auth.reset();
    else {
      Auth.subject = null;
      Auth.loaded = false;
      try { Auth.permissions = new Auth.permissions.constructor([]); }
      catch { Auth.permissions = { anyOf: () => false, has: () => false }; }
    }

    location.hash = "#/welcome";
    clearAlerts();
    renderSubjectUnauth();
    applyNavPermissions();
  };

  els.logout?.addEventListener("click", fn);
  els.logoutDD?.addEventListener("click", fn);
}

function renderSubject(subject) {
  const s = subject || "Unknown";
  els.subject.textContent = s;
  els.hint.textContent = "";
  els.avatar.textContent = s.trim().slice(0, 1).toUpperCase() || "?";
}

function renderSubjectUnauth() {
  els.subject.textContent = "Unauthenticated";
  els.hint.textContent = "";
  els.avatar.textContent = "?";
}

function applyNavPermissions() {
  const links = document.querySelectorAll("a.nav-link[data-route]");
  links.forEach((a) => {
    const req = a.getAttribute("data-requires");
    const route = a.getAttribute("data-route");

    if (route === "#/welcome" || route === "#/login") return;

    const patterns = (req || "")
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean);

    const enabled = patterns.length ? Auth.permissions.anyOf(patterns) : true;

    if (!enabled) {
      a.setAttribute("aria-disabled", "true");
      a.classList.add("disabled");
    } else {
      a.removeAttribute("aria-disabled");
      a.classList.remove("disabled");
    }
  });
}

async function navigate(route) {
  const r = ROUTES[route] || ROUTES["#/welcome"];
  setActiveNav(route);

  els.title.textContent = r.title;
  clearAlerts();

  let html;
  try {
    html = await fetchText(r.page);
  } catch (e) {
    showAlert("danger", errorMessage(e));
    els.view.innerHTML = "";
    return;
  }

  els.view.innerHTML = html;

  if (r.module) {
    try {
      const mod = await import(r.module);
      if (typeof mod.init === "function") {
        await mod.init({
          route,
          api,
          Auth,
          params: ROUTE_PARAMS,
          setTitle: (t) => (els.title.textContent = t),
          showAlert,
          clearAlerts,
        });
        ROUTE_PARAMS = {};
      }
    } catch (e) {
      showAlert("danger", errorMessage(e));
    }
  }
}

function setActiveNav(route) {
  const links = document.querySelectorAll("a.nav-link[data-route]");
  links.forEach((a) => {
    const r = a.getAttribute("data-route");
    if (r === route) a.classList.add("active");
    else a.classList.remove("active");
  });
}

function normalizeRoute(hash) {
  const h = (hash || "").trim();
  if (!h || h === "#") return "#/welcome";
  return ROUTES[h] ? h : "#/welcome";
}

async function fetchText(url) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(`Failed to load ${url} (HTTP ${res.status})`, { url, method: "GET", status: res.status });
  return await res.text();
}

function clearAlerts() {
  els.alerts.innerHTML = "";
}

function showAlert(kind, text) {
  clearAlerts();
  const div = document.createElement("div");
  div.className = `alert alert-${kind}`;
  div.setAttribute("role", "alert");
  div.textContent = text;
  els.alerts.appendChild(div);
}

function errorMessage(e) {
  if (e instanceof ApiError) {
    const bits = [];
    if (e.errorType) bits.push(e.errorType);
    if (e.details) bits.push(e.details);
    if (!bits.length) bits.push(e.message || `HTTP ${e.status}`);
    return bits.join(": ");
  }
  return e?.message || String(e);
}
