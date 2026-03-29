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

        if (!keyId) return showAlert("warning", "Key ID is required.");
        if (!value64) return showAlert("warning", "Key value64 is required.");

        const policy = buildPolicy(el);

        const payload = {
            keyId,
            curve,
            value64,
            assetOwner: assetOwnerRaw.length ? assetOwnerRaw : null,
            ...(policy ? {policy} : {}),
        };

        lock(true, el);
        try {
            const res = await api.postJson("/v1/keeper/storage/store", payload);
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

        if (!el["tk-import-policy-enabled"].checked) return null;

        const apply = buildNotAfterFromDate(el["tk-import-apply-notAfter"].value);
        const process = buildNotAfterFromDate(el["tk-import-process-notAfter"].value);
        const allowHistoricalProcess = !!el["tk-import-allow-historical"].checked;

        return {
            ...(apply ? {apply} : {}),
            ...(process ? {process} : {}),
            ...(fourEye ? {fourEye} : {}),
            allowHistoricalProcess,
        };
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