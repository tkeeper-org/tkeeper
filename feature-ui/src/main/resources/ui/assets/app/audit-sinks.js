export async function init({ api, Auth, showAlert, setTitle, clearAlerts }) {
  if (typeof clearAlerts !== "function") {
    clearAlerts = () => {};
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

  if (!Auth?.subject) {
    showAlert("warning", "Unauthenticated.");
    return;
  }

  if (!Auth.hasPermission("tkeeper.control.sinks")) {
    showAlert("danger", "Access denied.");
    return;
  }

  const els = ids([
    "tk-sinks-reload",
    "tk-sinks-badge",
    "tk-sinks-disabled",
    "tk-sinks-tablewrap",
    "tk-sinks-tbody",
    "tk-sinks-foot",
  ]);

  els["tk-sinks-reload"].addEventListener("click", () => load());

  await load();

  async function load() {
    setBadge(els["tk-sinks-badge"], "Loading", "bg-secondary-lt");
    els["tk-sinks-foot"].textContent = "";
    els["tk-sinks-disabled"].classList.add("d-none");
    els["tk-sinks-tablewrap"].classList.add("d-none");
    els["tk-sinks-tbody"].innerHTML = `<tr><td colspan="2" class="text-secondary">Loading…</td></tr>`;

    let res;
    try {
      res = await api.getJson("/v1/keeper/control/audit/sinks");
    } catch (e) {
      setBadge(els["tk-sinks-badge"], "Unavailable", "bg-red-lt");
      showAlert("danger", e?.details || e?.message || String(e));
      return;
    }

    clearAlerts();
    if (res?.warning) showAlert("warning", String(res.warning));

    const info = res?.data || res;
    const enabled = !!info?.enabled;
    const sinks = Array.isArray(info?.sinks) ? info.sinks : [];

    if (!enabled) {
      setBadge(els["tk-sinks-badge"], "Audit disabled", "bg-secondary-lt");
      els["tk-sinks-disabled"].classList.remove("d-none");
      els["tk-sinks-foot"].textContent = "";
      return;
    }

    els["tk-sinks-tablewrap"].classList.remove("d-none");

    const available = sinks.filter(s => !!s?.available);
    const unavailable = sinks.filter(s => s && s.available === false);

    renderTable(els["tk-sinks-tbody"], sinks);

    if (available.length === 0) {
      setBadge(els["tk-sinks-badge"], "Broken", "bg-red-lt");
      showAlert("danger", "No available audit sinks. TKeeper must have at least 1 available sink, otherwise it should refuse operations.");
    } else if (available.length === 1) {
      setBadge(els["tk-sinks-badge"], "Single sink", "bg-yellow-lt");
      showAlert("warning", "Only one audit sink is available. That’s a single point of failure. Add a backup sink to avoid request refusal if it goes down.");
    } else if (unavailable.length === 0) {
      setBadge(els["tk-sinks-badge"], "Healthy", "bg-green-lt");
      showAlert("success", "All configured audit sinks are available.");
    } else {
      setBadge(els["tk-sinks-badge"], "Degraded", "bg-orange-lt");
      showAlert("warning", "Some audit sinks are unavailable. At least one is up, so the system can operate, but you should fix or remove failing sinks.");
    }

    els["tk-sinks-foot"].textContent =
      `${available.length}/${sinks.length} sinks available.`;
  }

  function renderTable(tbody, sinks) {
    if (!sinks.length) {
      tbody.innerHTML = `<tr><td colspan="2" class="text-secondary">No sinks configured.</td></tr>`;
      return;
    }

    tbody.innerHTML = sinks.map(s => {
      const id = escapeHtml(s?.id ?? "unknown");
      const ok = !!s?.available;
      const badge = ok
        ? `<span class="badge bg-green-lt">Available</span>`
        : `<span class="badge bg-red-lt">Unavailable</span>`;
      return `
        <tr>
          <td class="font-monospace">${id}</td>
          <td class="text-end">${badge}</td>
        </tr>
      `;
    }).join("");
  }

  function setBadge(node, text, cls) {
    node.className = `badge ${cls}`;
    node.textContent = text;
  }

  function ids(list) {
    const out = {};
    for (const id of list) {
      const node = document.getElementById(id);
      if (!node) throw new Error(`Missing element #${id}`);
      out[id] = node;
    }
    return out;
  }
}