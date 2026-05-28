export async function init({ api, Auth, showAlert, setTitle, clearAlerts }) {
  if (typeof setTitle === "function") setTitle("Consistency Check");
  if (typeof clearAlerts !== "function") clearAlerts = () => {};

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

  showAlert("warning", "Ensure all peers are UP and READY before running this check.");

  const keyIdEl = document.getElementById("tk-consistency-keyId");
  const runBtn = document.getElementById("tk-consistency-run");
  const resultDiv = document.getElementById("tk-consistency-result");

  if (!keyIdEl || !runBtn || !resultDiv) {
    showAlert("danger", "Consistency page DOM mismatch. Hard refresh required.");
    return;
  }

  runBtn.addEventListener("click", async () => {
    clearAlerts();
    resultDiv.innerHTML = "";
    resultDiv.classList.add("d-none");
    runBtn.disabled = true;

    const keyId = (keyIdEl.value || "").trim();
    if (!keyId) {
      showAlert("warning", "Please enter a Target Key Identifier.");
      runBtn.disabled = false;
      return;
    }

    try {
      const res = await api.postJson("/v1/keeper/consistency/fix", null, { query: { keyId } });
      const data = res?.data ?? res;
      const verdict = data?.verdict || data?.data?.verdict;

      resultDiv.classList.remove("d-none");

      if (!verdict) {
        resultDiv.innerHTML = `<div class="alert alert-danger mb-0">Empty response from server. Check network tab.</div>`;
        return;
      }

      if (verdict === "OK") {
        resultDiv.innerHTML = `
            <div class="alert alert-success d-flex align-items-center mb-0 border-0 bg-green-lt text-dark">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2 text-green" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>
                <div><strong>Success:</strong> Key state is consistent across the cluster.</div>
            </div>`;
      }
      else if (verdict === "ROTATE_NEEDED") {
        const buttonId = "tk-consistency-goto-keys";
        resultDiv.innerHTML = `
          <div class="alert alert-warning d-flex justify-content-between align-items-center mb-0 border-0 bg-warning-lt text-dark" role="alert">
            <div class="d-flex align-items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2 text-warning" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.48 0l-7.1 12.25a2 2 0 0 0 1.84 2.75z" /></svg>
                <div><strong>Inconsistent State:</strong> Rotation is required to fix this key.</div>
            </div>
            <button type="button" id="${buttonId}" class="btn btn-sm btn-warning">Go to Keys</button>
          </div>`;

        setTimeout(() => {
            const btn = document.getElementById(buttonId);
            if (btn) {
              btn.addEventListener("click", () => {
                if (window.ROUTE_PARAMS) window.ROUTE_PARAMS.logicalId = keyId;
                else window.ROUTE_PARAMS = { logicalId: keyId };
                location.hash = "#/keys";
              });
            }
        }, 0);
      }
      else if (verdict === "MISSING") {
        resultDiv.innerHTML = `
            <div class="alert alert-danger mb-0 border-0 bg-danger-lt text-dark">
                <strong>Not Found:</strong> Key ID <code>${escapeHtml(keyId)}</code> does not exist on this cluster.
            </div>`;
      }
      else {
        resultDiv.innerHTML = `
            <div class="alert alert-secondary mb-0">
                Unknown verdict: <strong>${escapeHtml(verdict)}</strong>
            </div>`;
      }
    } catch (e) {
      const msg = e?.details || e?.message || String(e);
      showAlert("danger", msg);
    } finally {
        runBtn.disabled = false;
    }
  });
}