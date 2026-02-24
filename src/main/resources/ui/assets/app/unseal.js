export async function init({ api, Auth, showAlert, clearAlerts }) {
  if (!Auth.subject) {
    location.hash = "#/login";
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

  const sharesEl = document.getElementById("tk-unseal-shares");
  const resetEl = document.getElementById("tk-unseal-reset");
  const submit = document.getElementById("tk-unseal-submit");
  const progEl = document.getElementById("tk-unseal-progress");
  const statusEl = document.getElementById("tk-unseal-status");

  const st = await safeStatus(api, showAlert);
  if (!st) return;

  statusEl.textContent = `State: ${st.state}`;

  renderProgress(st.progress);

  if (st.state !== "SEALED") {
    statusEl.textContent = "Keeper is not sealed.";
    submit.disabled = true;
    return;
  }

  if ((st.sealedBy || "").toLowerCase() !== "shamir") {
    statusEl.textContent = "Unsupported unseal flow for this sealedBy. Contact administrator.";
    submit.disabled = true;
    return;
  }

  submit.addEventListener("click", async () => {
    statusEl.textContent = "";
    const lines = String(sharesEl.value || "")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    if (!lines.length) {
      showAlert("danger", "No unseal shares provided");
      return;
    }

    const payload64 = lines[0] || null;
    const payloads64 = lines.length > 1 ? lines.slice(1) : null;
    const reset = resetEl.checked ? true : false;

    try {
      const res = await api.systemUnseal({ payload64, payloads64, reset });
      if (res?.warning) showAlert("warning", res.warning);

      const progress = res?.data ?? res;
      renderProgress(progress);

      const st2 = await safeStatus(api, showAlert);
      if (st2?.state === "UNSEALED") {
        clearAlerts();
        location.hash = "#/welcome";
        return;
      }
      clearAlerts();
      statusEl.textContent = "Submitted. Keeper still sealed.";
    } catch (e) {
      showAlert("danger", e?.details || e?.message || String(e));
    }
  });

  function renderProgress(p) {
    if (!p) {
      progEl.innerHTML = `<div class="text-secondary">No progress</div>`;
      return;
    }

    if (typeof p.threshold === "number") {
      const threshold = p.threshold || 0;
      const progress = p.progress || 0;
      const total = p.total || 0;
      const pct = threshold > 0 ? Math.min(100, Math.round((progress / threshold) * 100)) : 0;

      const safeProgress = Number(progress) || 0;
      const safeThreshold = Number(threshold) || 0;
      const safeTotal = Number(total) || 0;
      const safePct = Math.max(0, Math.min(100, Number(pct) || 0));
      progEl.innerHTML = `
        <div class="mb-2 text-secondary">Shamir: ${safeProgress}/${safeThreshold} (total ${safeTotal})</div>
        <div class="progress">
          <div class="progress-bar" style="width: ${safePct}%"></div>
        </div>
      `;
      return;
    }

    if (p.ready === true) {
      progEl.innerHTML = `<span class="badge bg-green-lt">Ready</span>`;
      return;
    }

    progEl.innerHTML = `<div class="text-secondary">Progress: ${escapeHtml(JSON.stringify(p))}</div>`;
  }
}

async function safeStatus(api, showAlert) {
  try {
    const st = await api.getStatus();
    return st;
  } catch (e) {
    showAlert("danger", e?.details || e?.message || String(e));
    return null;
  }
}
