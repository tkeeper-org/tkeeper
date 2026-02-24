const PERMS = Object.freeze({
  create: "tkeeper.dkg.create",
  rotate: "tkeeper.dkg.rotate",
  refresh: "tkeeper.dkg.refresh",
});

export async function init({ api, Auth, showAlert, clearAlerts }) {
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

  const disabled = document.getElementById("tk-keygen-disabled");
  const form = document.getElementById("tk-keygen-form");

  const keyIdEl = document.getElementById("tk-keygen-keyId");
  const curveEl = document.getElementById("tk-keygen-curve");
  const modeEl = document.getElementById("tk-keygen-mode");
  const modeHint = document.getElementById("tk-keygen-mode-hint");
  const ownerEl = document.getElementById("tk-keygen-assetOwner");

  const polEnabled = document.getElementById("tk-keygen-policy-enabled");
  const polBox = document.getElementById("tk-keygen-policy");
  const allowHistEl = document.getElementById("tk-keygen-allowHistorical");

  const applyValEl = document.getElementById("tk-keygen-apply-value");
  const procValEl = document.getElementById("tk-keygen-process-value");

  const submit = document.getElementById("tk-keygen-submit");
  const reset = document.getElementById("tk-keygen-reset");
  const notificationsEl = document.getElementById("tk-keygen-notifications");

  function showNotification(type, title, message) {
    if (!notificationsEl) return;

    const notif = document.createElement("div");
    notif.className = `tk-notification ${type}`;
    notif.innerHTML = `
      <div class="tk-notification-content">
        <div class="tk-notification-title">${escapeHtml(title)}</div>
        <div class="tk-notification-message">${escapeHtml(message)}</div>
      </div>
      <button class="tk-notification-close" aria-label="Close">×</button>
    `;

    const closeBtn = notif.querySelector(".tk-notification-close");
    const doClose = () => {
      notif.style.animation = "tk-notification-slide-out 0.3s ease-out";
      setTimeout(() => notif.remove(), 300);
    };

    closeBtn?.addEventListener("click", doClose);
    notificationsEl.appendChild(notif);
    setTimeout(doClose, 5000);
  }

  function clearNotifications() {
    if (notificationsEl) notificationsEl.innerHTML = "";
  }

  if (!disabled || !form || !keyIdEl || !curveEl || !modeEl || !modeHint || !polEnabled || !polBox || !allowHistEl || !applyValEl || !procValEl || !submit || !reset) {
    console.error("Keygen init: missing required DOM elements.");
    return;
  }

  (function initClearable() {
    const configs = [
      { wrapperId: "tk-keygen-apply-wrapper", inputEl: applyValEl },
      { wrapperId: "tk-keygen-process-wrapper", inputEl: procValEl },
    ];

    configs.forEach(({ wrapperId, inputEl }) => {
      const wrapper = document.getElementById(wrapperId);
      if (!wrapper || !inputEl) return;

      const btn = wrapper.querySelector(".input-clearable-btn");
      const update = () => {
        if (inputEl.value) wrapper.classList.add("has-value");
        else wrapper.classList.remove("has-value");
      };

      btn?.addEventListener("click", (e) => {
        e.preventDefault();
        inputEl.value = "";
        update();
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      });

      inputEl.addEventListener("input", update);
      inputEl.addEventListener("change", update);
      update();
    });
  })();

  const allowed = Auth?.permissions?.anyOf?.([PERMS.create, PERMS.rotate, PERMS.refresh]) ?? false;

  if (!allowed) {
    disabled.classList.remove("d-none");
    form.querySelectorAll("input,select,button,textarea").forEach((x) => (x.disabled = true));
    submit.disabled = true;
    reset.disabled = true;
    return;
  }

  const syncPolicyVisibility = () => {
    polBox.classList.toggle("d-none", !polEnabled.checked);
  };

  polEnabled.addEventListener("change", syncPolicyVisibility);
  polEnabled.addEventListener("input", syncPolicyVisibility);
  polEnabled.addEventListener("click", () => setTimeout(syncPolicyVisibility, 0));
  syncPolicyVisibility();

  modeEl.addEventListener("change", updateModeHint);
  updateModeHint();

  reset.addEventListener("click", () => {
    keyIdEl.value = "";
    curveEl.value = "SECP256K1";
    modeEl.value = "CREATE";

    ownerEl.value = "";
    polEnabled.checked = false;
    polBox.classList.add("d-none");

    allowHistEl.checked = true;
    applyValEl.value = "";
    procValEl.value = "";

    clearNotifications();
    updateModeHint();

    applyValEl.dispatchEvent(new Event("input", { bubbles: true }));
    procValEl.dispatchEvent(new Event("input", { bubbles: true }));
  });

  submit.addEventListener("click", async () => {
    const mode = String(modeEl.value || "").toUpperCase();

    if (!isModeAllowed(mode, Auth)) {
      showAlert?.("danger", "Not enough permissions for selected mode.");
      return;
    }

    const keyId = String(keyIdEl.value || "").trim();
    if (!keyId) {
      showAlert?.("danger", "Key ID is required.");
      return;
    }

    const curve = String(curveEl.value || "").toUpperCase();
    const assetOwnerRaw = String(ownerEl.value || "").trim();

    const body = { keyId, curve, mode, assetOwner: assetOwnerRaw.length ? assetOwnerRaw : null };

    if (polEnabled.checked) {
      const policy = { allowHistoricalProcess: !!allowHistEl.checked };

      const apply = buildNotAfterFromDate(applyValEl.value);
      const process = buildNotAfterFromDate(procValEl.value);

      if (apply) policy.apply = apply;
      if (process) policy.process = process;

      body.policy = policy;
    }

    submit.disabled = true;

    try {
      const r = await api.dkgGenerate(body);

      clearAlerts?.();

      const warning = r?.warning;
      if (warning) showNotification("warning", "Warning", warning);

      showNotification("success", "DKG operation completed", `${mode} was successful`);
    } catch (e) {
      showNotification("danger", "Error", e?.details || e?.message || String(e));
    } finally {
      submit.disabled = false;
    }
  });

  function updateModeHint() {
    const m = String(modeEl.value || "").toUpperCase();
    const ok = isModeAllowed(m, Auth);
    modeHint.textContent = ok ? "" : "You don’t have permission for this mode.";
  }
}

function isModeAllowed(mode, Auth) {
  if (mode === "CREATE") return !!Auth?.hasPermission?.(PERMS.create);
  if (mode === "ROTATE") return !!Auth?.hasPermission?.(PERMS.rotate);
  if (mode === "REFRESH") return !!Auth?.hasPermission?.(PERMS.refresh);
  return false;
}

function buildNotAfterFromDate(dateValue) {
  const v = String(dateValue || "").trim();
  if (!v) return null;

  const d = new Date(v);
  const t = d.getTime();
  if (!t || Number.isNaN(t)) return null;

  const seconds = Math.floor(t / 1000);
  if (seconds <= 0) return null;

  return { unit: "SECONDS", notAfter: seconds };
}
