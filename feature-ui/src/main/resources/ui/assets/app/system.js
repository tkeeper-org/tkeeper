export async function init({ api, Auth, showAlert, clearAlerts }) {
  if (!Auth.hasPermission("tkeeper.control.system")) {
    showAlert("warning", "Access denied.");
    return;
  }

  const PROMOTE_PERMISSION = "tkeeper.quorum.promote";

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

    upgrade: document.getElementById("tk-quorum-upgrade"),
    upgradeThreshold: document.getElementById("tk-quorum-threshold"),
    upgradeTotal: document.getElementById("tk-quorum-total"),
    upgradeAck: document.getElementById("tk-quorum-ack"),
    upgradePromote: document.getElementById("tk-quorum-promote"),
    upgradeStatus: document.getElementById("tk-quorum-status"),
    upgradeResult: document.getElementById("tk-quorum-result"),
  };

  let lastSystem = null;
  let promoting = false;
  let promotionComplete = false;
  let promotionError = null;

  els.refresh.addEventListener("click", () => load());
  els.upgradeThreshold?.addEventListener("input", handleUpgradeEdit);
  els.upgradeTotal?.addEventListener("input", handleUpgradeEdit);
  els.upgradeAck?.addEventListener("change", handleUpgradeEdit);
  els.upgradePromote?.addEventListener("click", promote);

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
    lastSystem = sys;

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
    renderUpgradeSection(sys);

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

  function renderUpgradeSection(sys) {
    const threshold = Number(sys?.threshold ?? 0) || 0;
    const totalPeers = Number(sys?.totalPeers ?? 0) || 0;
    const mono = threshold === 1 && totalPeers === 1;

    if (!els.upgrade) return;
    els.upgrade.classList.toggle("d-none", !mono);

    if (!mono) return;

    const allowed = Auth.hasPermission(PROMOTE_PERMISSION);
    els.upgrade.classList.toggle("is-disabled", !allowed);

    if (promotionComplete) {
      setUpgradeInputsEnabled(false);
      setUpgradeStatus("Promotion completed. Restart this keeper before normal operations.", "success");
      return;
    }

    setUpgradeInputsEnabled(allowed && !promoting);

    syncUpgradeState();
  }

  function setUpgradeInputsEnabled(enabled) {
    for (const el of [els.upgradeThreshold, els.upgradeTotal, els.upgradeAck, els.upgradePromote]) {
      if (el) el.disabled = !enabled;
    }
  }

  function syncUpgradeState() {
    if (!els.upgrade || els.upgrade.classList.contains("d-none")) return;

    const allowed = Auth.hasPermission(PROMOTE_PERMISSION);
    const invalid = validatePromotion();
    const ack = Boolean(els.upgradeAck?.checked);
    const canSubmit = allowed && !promoting && !invalid && ack;

    if (els.upgradePromote) els.upgradePromote.disabled = !canSubmit;

    if (promotionError) {
      setUpgradeStatus(promotionError, "danger");
      return;
    }

    if (!allowed) return setUpgradeStatus("");

    if (invalid) {
      setUpgradeStatus(invalid);
      return;
    }

    if (!ack) {
      setUpgradeStatus("Confirm that you understand consequences before promoting.");
      return;
    }

    setUpgradeStatus("");
  }

  function handleUpgradeEdit() {
    if (!promotionComplete) {
      promotionError = null;
      setUpgradeResult(null);
    }

    syncUpgradeState();
  }

  function validatePromotion() {
    const threshold = intValue(els.upgradeThreshold?.value);
    const total = intValue(els.upgradeTotal?.value);

    if (!threshold || !total) return "Enter target threshold and total peers.";
    if (threshold <= 1) return "Target threshold must be greater than 1.";
    if (total <= 1) return "Target total peers must be greater than 1.";
    if (threshold > total) return "Target threshold cannot be greater than total peers.";

    return null;
  }

  async function promote() {
    if (promoting) return;
    if (!Auth.hasPermission(PROMOTE_PERMISSION)) return;

    const invalid = validatePromotion();
    if (invalid) {
      setUpgradeStatus(invalid);
      syncUpgradeState();
      return;
    }

    if (!window.confirm("Promote this keeper to threshold mode? TKeeper will distribute existing keys to peers, delete mono history, and this keeper cannot return to mono mode.")) {
      return;
    }

    promoting = true;
    promotionError = null;
    setUpgradeInputsEnabled(false);
    setUpgradeResult(null);
    setUpgradeStatus("Promoting...");

    try {
      const threshold = intValue(els.upgradeThreshold.value);
      const total = intValue(els.upgradeTotal.value);
      const result = await api.promoteQuorum({ threshold, total });

      promotionComplete = true;
      setUpgradeResult(result);
      setUpgradeStatus("Promotion completed. Restart this keeper before normal operations.", "success");
    } catch (e) {
      promotionError = e?.details || e?.message || String(e);
      setUpgradeStatus(promotionError, "danger");
    } finally {
      promoting = false;
      renderUpgradeSection(lastSystem);
    }
  }

  function setUpgradeStatus(text, kind = "muted") {
    if (!els.upgradeStatus) return;

    els.upgradeStatus.textContent = text || "";
    els.upgradeStatus.className =
      kind === "danger" ? "text-danger small fw-semibold" :
      kind === "success" ? "text-green small fw-semibold" :
      "text-muted small";
  }

  function setUpgradeResult(result) {
    if (!els.upgradeResult) return;

    if (!result) {
      els.upgradeResult.classList.add("d-none");
      els.upgradeResult.innerHTML = "";
      return;
    }

    const restart = result.restartRequired ? "Restart required" : "Restart not required";
    els.upgradeResult.classList.remove("d-none");
    els.upgradeResult.innerHTML = `
      <div class="alert alert-success mb-0" role="alert">
        <div class="fw-semibold mb-1">Promoted to ${escapeHtml(result.threshold)}-of-${escapeHtml(result.total)}</div>
        <div class="small">
          Peer ID ${escapeHtml(result.peerId)}. Promoted keys: ${escapeHtml(result.promotedKeys)}. ${escapeHtml(restart)}.
        </div>
      </div>
    `;
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

  function intValue(s) {
    const n = Number(String(s || "").trim());
    return Number.isInteger(n) && n > 0 ? n : 0;
  }
}
