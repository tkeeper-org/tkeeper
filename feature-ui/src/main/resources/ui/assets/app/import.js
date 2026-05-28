import {buildFourEyePolicy, initFourEyeUI} from "./fourEye.js";

export async function init({api, Auth, showAlert, setTitle, clearAlerts}) {
    setTitle?.("Import");

    if (!Auth?.subject) {
        showAlert("warning", "Unauthenticated.");
        return;
    }

    if (!Auth.hasPermission("tkeeper.storage.write")) {
        showAlert("danger", "Access denied.");
        return;
    }

    const el = ids([
        "tk-import-keyId",
        "tk-import-curve",
        "tk-import-assetOwner",
        "tk-import-value64",
        "tk-import-authorities",
        "tk-import-authority-add",
        "tk-import-authority-arbitrary",
        "tk-import-submit",
        "tk-import-clear",
        "tk-import-status",
        "tk-import-policy-enabled",
        "tk-import-policy",
        "tk-import-apply-notAfter",
        "tk-import-process-notAfter",
        "tk-import-allow-historical",
        "tk-import-foureye-enabled",
        "tk-import-foureye-m",
        "tk-import-foureye-add",
    ]);

    (function initClearable() {
        const pairs = [
            {wrapperId: "tk-import-apply-wrapper", inputId: "tk-import-apply-notAfter"},
            {wrapperId: "tk-import-process-wrapper", inputId: "tk-import-process-notAfter"},
        ];
        pairs.forEach(({wrapperId, inputId}) => {
            const wrapper = document.getElementById(wrapperId);
            const inputEl = document.getElementById(inputId);
            if (!wrapper || !inputEl) return;
            const btn = wrapper.querySelector(".input-clearable-btn");
            const update = () => {
                if (inputEl.value) wrapper.classList.add("has-value");
                else wrapper.classList.remove("has-value");
            };
            if (btn) {
                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    inputEl.value = "";
                    update();
                    inputEl.dispatchEvent(new Event("input", {bubbles: true}));
                    inputEl.dispatchEvent(new Event("change", {bubbles: true}));
                });
            }
            inputEl.addEventListener("input", update);
            inputEl.addEventListener("change", update);
            update();
        });
    })();

    const fourEyeEnabledEl = document.getElementById("tk-import-foureye-enabled");
    const fourEyeBodyEl = document.getElementById("tk-import-foureye-body");
    const fourEyeKeysEl = document.getElementById("tk-import-foureye-keys");
    const fourEyeAddEl = document.getElementById("tk-import-foureye-add");
    const fourEyeMEl = document.getElementById("tk-import-foureye-m");

    if (fourEyeEnabledEl && fourEyeBodyEl && fourEyeKeysEl && fourEyeAddEl && fourEyeMEl) {
        initFourEyeUI({
            enabledEl: fourEyeEnabledEl,
            bodyEl: fourEyeBodyEl,
            keysContainerEl: fourEyeKeysEl,
            addBtnEl: fourEyeAddEl,
        });
    }

    setArbitraryAuthority();

    el["tk-import-authority-arbitrary"].addEventListener("click", () => setArbitraryAuthority());
    el["tk-import-authority-add"].addEventListener("click", () => {
        const rows = readAuthorityRows();
        if (rows.length === 1 && rows[0].id.toLowerCase() === "arbitrary") {
            el["tk-import-authorities"].innerHTML = "";
        }
        addAuthorityRow("", "");
    });

    el["tk-import-policy-enabled"].addEventListener("change", () => {
        el["tk-import-policy"].classList.toggle("d-none", !el["tk-import-policy-enabled"].checked);
    });

    el["tk-import-clear"].addEventListener("click", () => {
        el["tk-import-keyId"].value = "";
        el["tk-import-curve"].value = "SECP256K1";
        el["tk-import-value64"].value = "";
        el["tk-import-policy-enabled"].checked = false;
        el["tk-import-policy"].classList.add("d-none");
        el["tk-import-apply-notAfter"].value = "";
        el["tk-import-process-notAfter"].value = "";
        el["tk-import-allow-historical"].checked = true;
        el["tk-import-status"].textContent = "";
        el["tk-import-assetOwner"].value = "";
        setArbitraryAuthority();
        if (fourEyeEnabledEl) fourEyeEnabledEl.checked = false;
        if (fourEyeBodyEl) fourEyeBodyEl.classList.add("d-none");
        if (fourEyeMEl) fourEyeMEl.value = "2";
        if (fourEyeKeysEl) fourEyeKeysEl.innerHTML = "";
    });

    el["tk-import-submit"].addEventListener("click", async () => {
        const keyId = (el["tk-import-keyId"].value || "").trim();
        const curve = el["tk-import-curve"].value;
        const value64 = (el["tk-import-value64"].value || "").trim();
        const assetOwnerRaw = (el["tk-import-assetOwner"].value || "").trim();
        let authorities;

        if (!keyId) return showAlert("warning", "Key ID is required.");
        if (!value64) return showAlert("warning", "Key value64 is required.");

        try {
            authorities = buildAuthorities();
        } catch (validationErr) {
            showAlert("warning", validationErr.message);
            return;
        }

        const policy = buildPolicy(el);

        const payload = {
            keyId,
            curve,
            authorities,
            value64,
            assetOwner: assetOwnerRaw.length ? assetOwnerRaw : null,
            ...(policy ? {policy} : {}),
        };

        lock(true, el);
        try {
            const res = await api.storeKey(payload);
            clearAlerts();
            if (res?.warning) showAlert("warning", String(res.warning));
            el["tk-import-status"].textContent = "Imported.";
            showAlert("success", "Key imported.");
        } catch (e) {
            showAlert("danger", e?.details || e?.message || String(e));
        } finally {
            lock(false, el);
        }
    });

    function setArbitraryAuthority() {
        el["tk-import-authorities"].innerHTML = "";
        addAuthorityRow("arbitrary", "");
    }

    function addAuthorityRow(id = "", oci = "") {
        const row = document.createElement("div");
        row.className = "tk-authority-row";
        row.innerHTML = `
      <div>
        <label class="form-label">Authority ID</label>
        <input class="form-control tk-authority-id" autocomplete="off" value="${escapeHtml(id)}" placeholder="arbitrary">
      </div>
      <div>
        <label class="form-label">OCI reference</label>
        <input class="form-control tk-authority-oci" autocomplete="off" value="${escapeHtml(oci)}" placeholder="registry.local/authority@sha256:...">
      </div>
      <div class="tk-authority-remove-cell">
        <button type="button" class="btn btn-outline-secondary tk-authority-remove" title="Remove authority" aria-label="Remove authority">
          <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24"
               stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M4 7l16 0"/>
            <path d="M10 11l0 6"/>
            <path d="M14 11l0 6"/>
            <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/>
            <path d="M9 7v-3l6 0v3"/>
          </svg>
        </button>
      </div>
    `;

        const idInput = row.querySelector(".tk-authority-id");
        const ociInput = row.querySelector(".tk-authority-oci");
        const syncArbitrary = () => {
            const arbitrary = String(idInput?.value || "").trim().toLowerCase() === "arbitrary";
            if (ociInput) {
                ociInput.disabled = arbitrary;
                if (arbitrary) ociInput.value = "";
            }
            row.classList.toggle("is-arbitrary", arbitrary);
        };

        idInput?.addEventListener("input", syncArbitrary);
        idInput?.addEventListener("change", syncArbitrary);
        syncArbitrary();

        row.querySelector(".tk-authority-remove")?.addEventListener("click", () => {
            row.remove();
            if (el["tk-import-authorities"].querySelectorAll(".tk-authority-row").length === 0) {
                setArbitraryAuthority();
            }
        });

        el["tk-import-authorities"].appendChild(row);
    }

    function readAuthorityRows() {
        return Array.from(el["tk-import-authorities"].querySelectorAll(".tk-authority-row")).map((row) => ({
            id: String(row.querySelector(".tk-authority-id")?.value || "").trim(),
            oci: String(row.querySelector(".tk-authority-oci")?.value || "").trim(),
        }));
    }

    function buildAuthorities() {
        const rows = readAuthorityRows().filter((row) => row.id.length > 0 || row.oci.length > 0);

        if (rows.length === 0) {
            throw new Error("At least one authority is required.");
        }

        const hasArbitrary = rows.some((row) => row.id.toLowerCase() === "arbitrary");
        if (hasArbitrary && rows.length > 1) {
            throw new Error("Arbitrary authority cannot be combined with other authorities.");
        }

        const seen = new Set();
        return rows.map((row) => {
            if (!row.id) throw new Error("Authority ID is required.");

            const normalized = row.id.toLowerCase();
            if (seen.has(normalized)) throw new Error(`Duplicate authority: ${row.id}`);
            seen.add(normalized);

            if (normalized === "arbitrary") return {id: "arbitrary"};
            if (!row.oci) throw new Error(`OCI reference is required for ${row.id}.`);

            return {id: row.id, oci: row.oci};
        });
    }

    function buildPolicy(el) {
        let fourEye = null;
        try {
            fourEye = buildFourEyePolicy({
                enabledEl: el["tk-import-foureye-enabled"],
                mEl: el["tk-import-foureye-m"],
                keysContainerEl: document.getElementById("tk-import-foureye-keys"),
            });
        } catch (validationErr) {
            showAlert("warning", validationErr.message);
            return;
        }

        if (!el["tk-import-policy-enabled"].checked && !fourEye) return null;

        const policy = {};

        if (el["tk-import-policy-enabled"].checked) {
            const apply = buildNotAfterFromDate(el["tk-import-apply-notAfter"].value);
            const process = buildNotAfterFromDate(el["tk-import-process-notAfter"].value);

            if (apply) policy.apply = apply;
            if (process) policy.process = process;
            policy.allowHistoricalProcess = !!el["tk-import-allow-historical"].checked;
        }

        if (fourEye) policy.fourEye = fourEye;

        return policy;
    }

    function buildNotAfterFromDate(dateValue) {
        const v = String(dateValue || "").trim();
        if (!v) return null;
        const d = new Date(v);
        if (!d.getTime() || isNaN(d.getTime())) return null;
        const seconds = Math.floor(d.getTime() / 1000);
        if (seconds <= 0) return null;
        return {unit: "SECONDS", notAfter: seconds};
    }

    function lock(v, el) {
        for (const k of Object.keys(el)) {
            if (el[k] && typeof el[k].disabled === "boolean") el[k].disabled = v;
        }
        document.querySelectorAll("#tk-import-authorities input, #tk-import-authorities button")
            .forEach((node) => {
                if (typeof node.disabled === "boolean") node.disabled = v;
            });
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

function escapeHtml(x) {
    return String(x ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
