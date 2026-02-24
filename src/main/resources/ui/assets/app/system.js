export async function init({ api, Auth, showAlert, clearAlerts }) {
  if (!Auth.hasPermission("tkeeper.control.system")) {
    showAlert("warning", "Access denied.");
    return;
  }

  function requireDomPurify() {
    const dp = (typeof window !== "undefined") ? window.DOMPurify : null;
    if (!dp || typeof dp.sanitize !== "function") {
      throw new Error("DOMPurify is required but not loaded (window.DOMPurify missing).");
    }
    return dp;
  }

  const DP = requireDomPurify();

  function encodeHtml(s) {
     return String(s)
       .replaceAll("&", "&amp;")
       .replaceAll("<", "&lt;")
       .replaceAll(">", "&gt;")
       .replaceAll('"', "&quot;")
       .replaceAll("'", "&#039;");
   }

  function escapeHtml(x) {
    const cleaned = DP.sanitize(String(x ?? ""), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    return encodeHtml(cleaned);
  }

  const els = {
    badge: document.getElementById("tk-system-badge"),
    refresh: document.getElementById("tk-system-refresh"),
    alerts: document.getElementById("tk-system-alerts"),

    capability: document.getElementById("tk-system-capability"),
    peerstate: document.getElementById("tk-system-peerstate"),
    ready: document.getElementById("tk-system-ready"),
    threshold: document.getElementById("tk-system-threshold"),

    peers: document.getElementById("tk-system-peers"),
    foot: document.getElementById("tk-system-footnote"),
  };

  els.refresh.addEventListener("click", () => load());
  await load();

  async function load() {
    clear(els.alerts);
    clearAlerts();
    setTopBadge("LOADING", "secondary");

    let sys;
    try {
      sys = await api.getSystem();
    } catch (e) {
      showAlert("danger", e?.details || e?.message || String(e));
      setTopBadge("UNAVAILABLE", "danger");
      return;
    }

    clearAlerts();

    const selfId = sys?.id ? String(sys.id) : null;
    const selfState = String(sys?.state || "").toUpperCase();

    const peerEntries = normalizePeers(sys);
    const readyCount = peerEntries.filter(p => p.state === "READY").length;

    const totalPeers = Number(sys.totalPeers ?? peerEntries.length ?? 0) || peerEntries.length;
    const threshold = Number(sys.threshold ?? 0) || 0;

    const cap = clusterCapability(readyCount, threshold, totalPeers);
    renderCapability(cap, readyCount, threshold, totalPeers);

    renderThisPeer(selfState);

    els.foot.textContent = selfId ? `Node: ${selfId}` : "";
    els.ready.textContent = `${readyCount} / ${totalPeers}`;
    els.threshold.textContent = String(threshold);

    els.peers.innerHTML = peerEntries.map(rowHtml).join("");

    if (cap === "READY") setTopBadge("READY", "green");
    else if (cap === "LIMITED") setTopBadge("LIMITED", "warning");
    else setTopBadge("UNAVAILABLE", "danger");
  }

  function clusterCapability(readyCount, threshold, totalPeers) {
    if (threshold > 0 && readyCount < threshold) return "UNAVAILABLE";
    if (readyCount < totalPeers) return "LIMITED";
    return "READY";
    }

  function renderCapability(cap, readyCount, threshold, totalPeers) {
    if (cap === "READY") {
      els.capability.textContent = "Ready";
      addAlert("success", "Cluster can perform all operations, including key generation/rotation/refresh.");
      return;
    }

    if (cap === "LIMITED") {
      els.capability.textContent = "Limited";
      addAlert("warning", "Cluster can perform operations, but key generation/rotation/refresh will be unavailable.");
      return;
    }

    els.capability.textContent = "Unavailable";
    addAlert("danger", "Not enough READY peers to reach threshold. Operations will fail.");
  }

  function renderThisPeer(state) {
    if (state === "READY") els.peerstate.textContent = "Ready";
    else if (state === "NOT_READY") els.peerstate.textContent = "Not ready";
    else els.peerstate.textContent = "Unavailable";
  }

  function setTopBadge(text, kind) {
    const cls =
      kind === "green" ? "badge bg-green-lt" :
      kind === "warning" ? "badge bg-warning-lt" :
      kind === "danger" ? "badge bg-danger-lt" :
      "badge bg-secondary-lt";

    els.badge.className = cls;
    els.badge.textContent = text;
  }

  function addAlert(kind, text) {
    const div = document.createElement("div");
    div.className = `alert alert-${kind}`;
    div.setAttribute("role", "alert");
    div.textContent = text;
    els.alerts.appendChild(div);
  }

  function normalizePeers(sys) {
    const peers = sys?.peers && typeof sys.peers === "object" ? sys.peers : {};
    const entries = Object.keys(peers).map(id => ({
      id,
      state: String(peers[id] || "").toUpperCase()
    }));

    const selfId = sys?.id ? String(sys.id) : null;
    const selfState = sys?.state ? String(sys.state).toUpperCase() : null;
    if (selfId && selfState && !entries.some(e => e.id === selfId)) {
      entries.push({ id: selfId, state: selfState });
    }

    entries.sort((a, b) => {
      if (selfId) {
        if (a.id === selfId && b.id !== selfId) return -1;
        if (b.id === selfId && a.id !== selfId) return 1;
      }
      const an = toNum(a.id), bn = toNum(b.id);
      if (an !== null && bn !== null) return an - bn;
      if (an !== null) return -1;
      if (bn !== null) return 1;
      return a.id.localeCompare(b.id);
    });

    return entries;
  }

  function rowHtml(p) {
    const badge = peerBadge(p.state);
    const note = peerNote(p.state);
    return `
      <tr>
        <td class="font-monospace">${escapeHtml(p.id)}</td>
        <td>${badge}</td>
        <td class="text-secondary">${note}</td>
      </tr>
    `;
  }

  function peerBadge(state) {
    if (state === "READY") return `<span class="badge bg-green-lt">READY</span>`;
    if (state === "NOT_READY") return `<span class="badge bg-warning-lt">NOT_READY</span>`;
    return `<span class="badge bg-danger-lt">UNAVAILABLE</span>`;
  }

  function peerNote(state) {
    if (state === "READY") return "Active";
    if (state === "NOT_READY") return "Sealed or uninitialized";
    return "Network or process unavailable";
  }

  function clear(el) { el.innerHTML = ""; }

  function toNum(s) {
    const n = Number(String(s));
    return Number.isFinite(n) ? n : null;
  }
}
