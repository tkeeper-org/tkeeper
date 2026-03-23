export async function init({api, Auth, showAlert, setTitle, clearAlerts}) {
    if (typeof clearAlerts !== "function") clearAlerts = () => {
    };

    if (!Auth?.subject) {
        showAlert("warning", "Unauthenticated.");
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
        const cleaned = DP.sanitize(String(x ?? ""), {ALLOWED_TAGS: [], ALLOWED_ATTR: []});
        return encodeHtml(cleaned);
    }

    const tbody = document.getElementById("tk-keys-tbody");
    const footer = document.getElementById("tk-keys-footer");
    const nextBtn = document.getElementById("tk-keys-next");
    const prevBtn = document.getElementById("tk-keys-prev");

    const logicalIdEl = document.getElementById("tk-keys-logicalId");
    const limitEl = document.getElementById("tk-keys-limit");
    const reloadBtn = document.getElementById("tk-keys-reload");
    const clearBtn = document.getElementById("tk-keys-clear");

    const modeBadge = document.getElementById("tk-keys-mode-badge");
    const histBanner = document.getElementById("tk-keys-historical-banner");
    const histKeyEl = document.getElementById("tk-keys-historical-key");
    const histMetaEl = document.getElementById("tk-keys-historical-meta");
    const exitHistBtn = document.getElementById("tk-keys-exit-historical");

    if (
        !tbody || !footer || !nextBtn || !prevBtn ||
        !logicalIdEl || !limitEl || !reloadBtn || !clearBtn ||
        !modeBadge || !histBanner || !histKeyEl || !histMetaEl || !exitHistBtn
    ) {
        showAlert("danger", "Keys page DOM mismatch. Hard refresh / clear cache.");
        return;
    }

    let currentCursor = null;
    let nextCursor = null;
    let hasMore = false;
    let loading = false;

    let showingHistoricalFor = null;
    let activeGenForHistorical = null;

    const cursorStack = [];
    let lastKeys = [];
    const keyHistoricalState = new Map();

    reloadBtn.addEventListener("click", () => resetAndLoad());

    clearBtn.addEventListener("click", () => {
        logicalIdEl.value = "";
        limitEl.value = "200";
        resetAndLoad();
    });

    logicalIdEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") resetAndLoad();
    });

    limitEl.addEventListener("change", () => resetAndLoad());

    exitHistBtn.addEventListener("click", () => {
        keyHistoricalState.clear();
        cursorStack.length = 0;
        currentCursor = null;
        nextCursor = null;
        hasMore = false;
        showingHistoricalFor = null;
        activeGenForHistorical = null;
        loadPage(null);
    });

    nextBtn.addEventListener("click", async () => {
        if (!hasMore || loading) return;
        cursorStack.push(currentCursor);
        currentCursor = nextCursor;
        await loadPage(showingHistoricalFor);
    });

    prevBtn.addEventListener("click", async () => {
        if (loading) return;
        if (cursorStack.length === 0) return;
        currentCursor = cursorStack.pop() ?? null;
        await loadPage(showingHistoricalFor);
    });

    try {
        const prefill = window?.ROUTE_PARAMS?.logicalId;
        if (typeof prefill === "string" && prefill.trim().length > 0) {
            logicalIdEl.value = prefill.trim();
            delete window.ROUTE_PARAMS.logicalId;
        }
    } catch {
    }

    await resetAndLoad();

    async function resetAndLoad() {
        cursorStack.length = 0;
        currentCursor = null;
        nextCursor = null;
        hasMore = false;
        keyHistoricalState.clear();
        showingHistoricalFor = null;
        activeGenForHistorical = null;
        await loadPage(null);
    }

    function updateHistoricalUi() {
        const on = !!showingHistoricalFor;

        if (on) {
            modeBadge.classList.remove("d-none");

            histBanner.classList.remove("d-none");
            histBanner.classList.add("d-flex");
        } else {
            modeBadge.classList.add("d-none");

            histBanner.classList.remove("d-flex");
            histBanner.classList.add("d-none");
        }

        histKeyEl.textContent = on ? String(showingHistoricalFor) : "";

        if (!on) {
            histMetaEl.textContent = "";
            return;
        }

        const parts = [];
        if (Number.isFinite(Number(activeGenForHistorical))) {
            parts.push(`active generation: ${Number(activeGenForHistorical)}`);
        }
        histMetaEl.textContent = parts.length ? `(${parts.join(" · ")})` : "";
    }

    async function loadPage(keyIdForHistorical = null) {
        lock(true);
        tbody.innerHTML = `<tr><td colspan="5" class="text-secondary">Loading…</td></tr>`;
        footer.textContent = "";
        nextBtn.disabled = true;
        prevBtn.disabled = cursorStack.length === 0;

        const query = {
            historical: keyIdForHistorical ? true : false,
            logicalId: keyIdForHistorical || (logicalIdEl.value || "").trim() || undefined,
            lastSeen: currentCursor || undefined,
            limit: Math.min(200, Math.max(1, Number(limitEl.value || "200"))),
        };

        try {
            const res = await api.getJson("/v1/keeper/control/keys", {query});
            const page = res?.data ?? res ?? {keys: [], hasMore: false, nextCursor: null};
            const keys = Array.isArray(page.keys) ? page.keys : [];

            nextCursor = page.nextCursor || null;
            hasMore = !!page.hasMore;

            showingHistoricalFor = keyIdForHistorical ? String(keyIdForHistorical) : null;

            if (showingHistoricalFor) {
                let maxGen = null;
                const apiActive = page.activeGeneration;
                const apiGenNum = Number(apiActive);
                if (Number.isFinite(apiGenNum)) maxGen = Math.trunc(apiGenNum);

                if (!Number.isFinite(maxGen)) {
                    for (const k of keys) {
                        const g = Number(k?.generation);
                        if (Number.isFinite(g)) maxGen = maxGen == null ? g : Math.max(maxGen, g);
                    }
                }
                activeGenForHistorical = Number.isFinite(maxGen) ? maxGen : null;
            } else {
                activeGenForHistorical = null;
            }

            updateHistoricalUi();

            lastKeys = keys;
            renderKeys(keys);
            wireActions();

            const parts = [];
            if (showingHistoricalFor) parts.push("Historical view");
            parts.push(keys.length ? `Loaded ${keys.length}` : "Loaded 0");
            if (hasMore) parts.push("More available");
            else parts.push("End");
            footer.textContent = parts.join(" · ");

            nextBtn.disabled = !hasMore;
            prevBtn.disabled = cursorStack.length === 0;

            if (res?.warning) showAlert("warning", String(res.warning));
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-danger">Failed to load keys</td></tr>`;
            showAlert("danger", e?.details || e?.message || String(e));
            nextBtn.disabled = true;
        } finally {
            lock(false);
        }
    }

    function lock(v) {
        loading = v;
        reloadBtn.disabled = v;
        clearBtn.disabled = v;
        nextBtn.disabled = v || !hasMore;
        prevBtn.disabled = v || cursorStack.length === 0;
        logicalIdEl.disabled = v;
        limitEl.disabled = v;
        exitHistBtn.disabled = v;
    }

    function renderKeys(keys) {
        if (!keys.length) {
            const msg = showingHistoricalFor
                ? "No historical generations available."
                : "No keys available.";
            tbody.innerHTML = `<tr><td colspan="5" class="text-secondary">${msg}</td></tr>`;
            return;
        }

        const ctx = {
            historical: !!showingHistoricalFor,
            activeGeneration: activeGenForHistorical,
        };

        tbody.innerHTML = keys.map(k => {
            const curve = k.curve || "UNKNOWN";
            const status = badgeStatus(k.status);
            const gen = Number.isFinite(Number(k.generation)) ? Number(k.generation) : "-";
            const logicalId = k.logicalId || "";

            const rowId = keyRowId(logicalId, k.generation);
            const actions = actionsForKey(k, ctx);

            const actionsHtml = actions.length > 0
                ? `<div class="tk-key-actions">${actions.map(a => actionButtonHtml(a, rowId)).join("")}</div>`
                : `<span class="text-secondary">-</span>`;

            const curveUpper = String(curve || "").toUpperCase();
            const curveClass = curveUpper === "ED25519"
                ? "bg-purple-lt"
                : curveUpper === "P256" || curveUpper === "SECP256R1"
                    ? "bg-azure-lt"
                    : "bg-indigo-lt";

            const rowTone = (showingHistoricalFor ? "table-info" : "");
            return `
        <tr class="${rowTone}">
          <td class="font-monospace">${escapeHtml(logicalId)}</td>
          <td><span class="badge ${curveClass}">${escapeHtml(curve)}</span></td>
          <td>${gen}</td>
          <td>${status}</td>
          <td>${actionsHtml}</td>
        </tr>
      `;
        }).join("");
    }

    function actionButtonHtml(action, rowId) {
        const icons = {
            sigs: `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
            encrypt: `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
            public: `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>`,
            destroy: `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="m19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
            historical: `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        };
        const icon = icons[action.action] || "";
        const cls = action.action === "destroy" ? "btn-danger-soft" : "";
        return `<button type="button" class="tk-key-action-btn tk-key-action ${cls}" data-tk-action="${action.action}" data-tk-key="${escapeHtml(rowId)}" title="${escapeHtml(action.label)}">${icon}${escapeHtml(action.label)}</button>`;
    }

    function badgeStatus(s) {
        const v = String(s || "").toUpperCase();
        const map = {
            ACTIVE: "bg-green-lt",
            DISABLED: "bg-secondary-lt",
            APPLY_EXPIRED: "bg-warning-lt",
            EXPIRED: "bg-danger-lt",
            DESTROYED: "bg-dark-lt",
        };
        const cls = map[v] || "bg-secondary-lt";
        return `<span class="badge ${cls}">${escapeHtml(v || "UNKNOWN")}</span>`;
    }

    function actionsForKey(k, ctx = {}) {
        const scopes = new Set((k.scopes || []).map(s => String(s || "").toUpperCase()));
        const curve = String(k.curve || "").toUpperCase();
        const status = String(k.status || "").toUpperCase();
        const isWeierstrass = curve === "SECP256K1" || curve === "P256";
        const historical = !!ctx.historical;
        const activeGen = ctx.activeGeneration;
        const gen = Number(k.generation);

        let allowSigs = scopes.has("SIGN") || scopes.has("VERIFY");
        let allowEncrypt = (scopes.has("ENCRYPT") || scopes.has("DECRYPT")) && isWeierstrass;
        let allowPublic = scopes.has("PUBLIC");

        if (status === "DESTROYED") {
            allowSigs = false;
            allowEncrypt = false;
            allowPublic = false;
        } else if (status === "APPLY_EXPIRED") {
            allowEncrypt = false;
        } else if (status === "EXPIRED") {
            allowSigs = false;
            allowEncrypt = false;
            allowPublic = false;
        }

        const out = [];

        if (!historical) {
            if (allowSigs) out.push({action: "sigs", label: "Signatures"});
            if (allowEncrypt) out.push({action: "encrypt", label: "Cipher"});
            if (allowPublic) out.push({action: "public", label: "Public"});

            const gNum = Number.isFinite(gen) ? gen : 0;
            if (gNum > 1) out.push({action: "historical", label: "History"});
        } else {
            if (allowSigs) out.push({action: "sigs", label: "Signatures"});
            if (allowEncrypt) out.push({action: "encrypt", label: "Cipher"});
            if (allowPublic) out.push({action: "public", label: "Public"});

            if (scopes.has("DESTROY") && status !== "DESTROYED") {
                const ag = Number(activeGen);
                const gVal = Number(gen);
                if (Number.isFinite(ag) && Number.isFinite(gVal) && gVal <= (ag - 2)) {
                    out.push({action: "destroy", label: "Destroy"});
                }
            }
        }

        return out;
    }

    function wireActions() {
        const byRowId = new Map();
        for (const k of lastKeys) {
            if (!k || !k.logicalId) continue;
            const rowId = keyRowId(k.logicalId, k.generation);
            byRowId.set(rowId, k);
        }

        const buttons = tbody.querySelectorAll(".tk-key-action[data-tk-action][data-tk-key]");
        buttons.forEach(btn => {
            if (btn.__wired) return;
            btn.__wired = true;

            const rowId = btn.getAttribute("data-tk-key") || "";
            const action = btn.getAttribute("data-tk-action") || "";
            const key = byRowId.get(rowId);

            if (!key) {
                btn.disabled = true;
                return;
            }

            if (action === "historical") {
                const isActive = keyHistoricalState.get(key.logicalId) || false;
                if (isActive) btn.classList.add("active");

                btn.addEventListener("click", async () => {
                    const newState = !(keyHistoricalState.get(key.logicalId) || false);
                    cursorStack.length = 0;
                    currentCursor = null;
                    nextCursor = null;
                    hasMore = false;
                    keyHistoricalState.clear();
                    keyHistoricalState.set(key.logicalId, newState);
                    btn.classList.toggle("active", newState);
                    await loadPage(newState ? key.logicalId : null);
                });
            } else {
                btn.addEventListener("click", () => handleAction(action, key));
            }
        });
    }

    function handleAction(action, key) {
        if (!key || !action) return;
        if (action === "sigs") openSignatures(key);
        else if (action === "encrypt") openCrypto(key, "encrypt");
        else if (action === "public") openPublic(key);
        else if (action === "destroy") openDestroy(key, activeGenForHistorical);
    }

    function modalInstance(el) {
        if (!el) return null;
        const backdrop = el.querySelector(".tk-modal-backdrop");
        let savedBodyOverflow = null;

        const setShown = (node, show) => {
            if (!node) return;
            node.classList.toggle("d-none", !show);
        };

        const doShow = () => {
            el.classList.add("show");
            setShown(backdrop, true);

            savedBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
        };

        const doHide = () => {
            el.classList.remove("show");
            setShown(backdrop, false);

            document.body.style.overflow = savedBodyOverflow != null ? savedBodyOverflow : "";
        };

        if (backdrop) backdrop.addEventListener("click", doHide);
        return {show: doShow, hide: doHide};
    }

    function parseIntSafe(v) {
        const n = Number(String(v || "").trim());
        if (!Number.isFinite(n)) return null;
        return Math.trunc(n);
    }

    function keyRowId(logicalId, generation) {
        const lid = String(logicalId || "");
        const gNum = Number(generation);
        const g = Number.isFinite(gNum) ? String(Math.trunc(gNum)) : "na";
        return `${lid}::${g}`;
    }

    function bytesToB64(bytes) {
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(bin);
    }

    function b64ToBytes(b64) {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function utf8ToB64(text) {
        const enc = new TextEncoder();
        return bytesToB64(enc.encode(String(text ?? "")));
    }

    function b64ToUtf8(b64) {
        const dec = new TextDecoder();
        return dec.decode(b64ToBytes(b64));
    }

    function makeDataModeAdapter({modeEl, fieldEl, statusEl, base64Placeholder, textPlaceholder}) {
        const setUi = () => {
            const m = String(modeEl?.value || "base64");
            fieldEl.placeholder = (m === "text")
                ? (textPlaceholder || "Text")
                : (base64Placeholder || "Base64");
        };

        const getBase64 = () => {
            const m = String(modeEl?.value || "base64");
            const v = String(fieldEl.value || "");
            if (m === "text") return utf8ToB64(v);
            return v.trim();
        };

        const setFromBase64 = (b64) => {
            const m = String(modeEl?.value || "base64");
            if (m === "text") {
                try {
                    fieldEl.value = b64 ? b64ToUtf8(String(b64)) : "";
                } catch (e) {
                    if (statusEl) statusEl.textContent = "Cannot decode as text.";
                    fieldEl.value = "";
                }
            } else {
                fieldEl.value = String(b64 || "");
            }
        };

        if (modeEl) modeEl.addEventListener("change", () => setUi());
        setUi();
        return {getBase64, setFromBase64, setUi};
    }

    function buildContext(kind, merkleRoot64) {
        const k = String(kind || "").toUpperCase();
        if (k === "BIP340") return {kind: "BIP340"};
        if (k === "TAPROOT") return {kind: "TAPROOT", merkleRoot64: merkleRoot64 ? String(merkleRoot64) : null};
        return null;
    }

    function openSignatures(key) {
        const modalEl = document.getElementById("tk-modal-sigs");
        const m = modalInstance(modalEl);

        const keyEl = document.getElementById("tk-sigs-key");
        const curveEl = document.getElementById("tk-sigs-curve");
        const modeEl = document.getElementById("tk-sigs-mode");
        const submit = document.getElementById("tk-sigs-submit");
        const cancel = document.getElementById("tk-sigs-cancel");
        const close = document.getElementById("tk-sigs-close");

        const signBlock = document.getElementById("tk-sigs-sign-block");
        const verifyBlock = document.getElementById("tk-sigs-verify-block");

        const algoEl = document.getElementById("tk-sigs-algo");
        const opIdEl = document.getElementById("tk-sigs-op-id");
        const dataElSign = document.getElementById("tk-sigs-data64-sign");
        const dataModeSign = document.getElementById("tk-sigs-data-mode-sign");
        const hashSignEl = document.getElementById("tk-sigs-hash-sign");
        const statusEl = document.getElementById("tk-sigs-status");
        const resultEl = document.getElementById("tk-sigs-result");

        const schnorrWrap = document.getElementById("tk-sigs-schnorr-wrap");
        const schnorrModeEl = document.getElementById("tk-sigs-schnorr-mode");
        const merkleWrap = document.getElementById("tk-sigs-merkle-wrap");
        const merkleEl = document.getElementById("tk-sigs-merkleRoot64");

        const verifyTypeEl = document.getElementById("tk-sigs-verify-type");
        const verifySchnorrWrap = document.getElementById("tk-sigs-verify-schnorr-wrap");
        const verifySchnorrModeEl = document.getElementById("tk-sigs-verify-schnorr-mode");
        const verifyMerkleWrap = document.getElementById("tk-sigs-verify-merkle-wrap");
        const verifyMerkleEl = document.getElementById("tk-sigs-verify-merkleRoot64");
        const dataElVerify = document.getElementById("tk-sigs-data64-verify");
        const dataModeVerify = document.getElementById("tk-sigs-data-mode-verify");
        const sigEl = document.getElementById("tk-sigs-signature64");
        const genEl = document.getElementById("tk-sigs-generation");
        const hashVerifyEl = document.getElementById("tk-sigs-hash-verify");
        const verifyStatusEl = document.getElementById("tk-sigs-verify-status");

        if (
            !m || !keyEl || !curveEl || !modeEl || !submit || !cancel || !close ||
            !signBlock || !verifyBlock ||
            !algoEl || !opIdEl || !dataElSign || !dataModeSign || !statusEl || !resultEl ||
            !verifyTypeEl || !dataElVerify || !dataModeVerify || !sigEl || !genEl || !verifyStatusEl
        ) return;

        const curve = String(key.curve || "").toUpperCase();
        const isSecp = curve === "SECP256K1";
        const isEd = curve === "ED25519";
        const isP256 = curve === "P256";

        const scopes = new Set((key.scopes || []).map(s => String(s || "").toUpperCase()));
        const canSign = scopes.has("SIGN");
        const canVerify = scopes.has("VERIFY");

        keyEl.value = String(key.logicalId || "");
        curveEl.value = String(key.curve || "");

        opIdEl.value = "";
        dataElSign.value = "";
        resultEl.value = "";
        statusEl.textContent = "";
        if (hashSignEl) hashSignEl.checked = false;

        dataElVerify.value = "";
        sigEl.value = "";
        verifyStatusEl.textContent = "";
        if (hashVerifyEl) hashVerifyEl.checked = false;

        if (showingHistoricalFor) genEl.value = key.generation != null ? String(key.generation) : "";
        else genEl.value = "";

        const signData = makeDataModeAdapter({
            modeEl: dataModeSign,
            fieldEl: dataElSign,
            statusEl,
            base64Placeholder: "Base64 payload",
            textPlaceholder: "Text payload",
        });

        const verifyData = makeDataModeAdapter({
            modeEl: dataModeVerify,
            fieldEl: dataElVerify,
            statusEl: verifyStatusEl,
            base64Placeholder: "Base64 data",
            textPlaceholder: "Text data",
        });

        const setShown = (el, show) => {
            if (!el) return;
            el.classList.toggle("d-none", !show);
        };

        while (algoEl.firstChild) algoEl.removeChild(algoEl.firstChild);
        const algoOptions = [];
        if (curve === "SECP256K1" || curve === "P256") algoOptions.push("GG20", "FROST");
        else if (curve === "ED25519") algoOptions.push("FROST");

        if (algoOptions.length === 0) algoOptions.push("FROST");

        for (const v of algoOptions) {
            const opt = document.createElement("option");
            opt.value = v;
            opt.textContent = v;
            algoEl.appendChild(opt);
        }

        function applyModeUi() {
            const mode = String(modeEl.value || "sign");
            setShown(signBlock, mode === "sign");
            setShown(verifyBlock, mode === "verify");

            if (mode === "sign") {
                if (!canSign && canVerify) modeEl.value = "verify";
            } else {
                if (!canVerify && canSign) modeEl.value = "sign";
            }
            submit.textContent = (String(modeEl.value) === "verify") ? "Verify" : "Sign";
        }

        function updateSignContextUi() {
            const algo = String(algoEl.value || "").toUpperCase();
            const show = isSecp && algo === "FROST";
            setShown(schnorrWrap, show);

            if (!show) {
                setShown(merkleWrap, false);
                if (merkleEl) merkleEl.value = "";
                return;
            }

            const mode = String(schnorrModeEl?.value || "RFC").toUpperCase();
            const showMerkle = mode === "TAPROOT";
            setShown(merkleWrap, showMerkle);
            if (!showMerkle && merkleEl) merkleEl.value = "";
        }

        function rebuildVerifyTypeOptions() {
            const opts = Array.from(verifyTypeEl.options);
            for (const opt of opts) {
                const v = String(opt.value || "");
                if (!v) continue;
                if (isEd) opt.disabled = v !== "SCHNORR";
                else if (isP256) opt.disabled = v === "SCHNORR";
                else if (isSecp) opt.disabled = false;
                else opt.disabled = v !== "SCHNORR";
            }
            if (isEd) {
                verifyTypeEl.value = "SCHNORR";
                verifyTypeEl.disabled = true;
            } else if (isP256) {
                verifyTypeEl.disabled = false;
                const cur = String(verifyTypeEl.value || "");
                const curOpt = verifyTypeEl.querySelector(`option[value="${cur}"]`);
                if (!curOpt || curOpt.disabled) verifyTypeEl.value = "ECDSA";
            } else {
                verifyTypeEl.disabled = false;
                const cur = String(verifyTypeEl.value || "");
                const curOpt = verifyTypeEl.querySelector(`option[value="${cur}"]`);
                if (!curOpt || curOpt.disabled) verifyTypeEl.value = isSecp ? "ECDSA" : "SCHNORR";
            }
        }

        function updateVerifyContextUi() {
            const t = String(verifyTypeEl.value || "").toUpperCase();
            const show = isSecp && t === "SCHNORR";
            setShown(verifySchnorrWrap, show);

            if (!show) {
                setShown(verifyMerkleWrap, false);
                if (verifyMerkleEl) verifyMerkleEl.value = "";
                return;
            }

            const mode = String(verifySchnorrModeEl?.value || "BIP340").toUpperCase();
            const showMerkle = mode === "TAPROOT";
            setShown(verifyMerkleWrap, showMerkle);
            if (!showMerkle && verifyMerkleEl) verifyMerkleEl.value = "";
        }

        modeEl.onchange = () => {
            applyModeUi();
        };
        algoEl.onchange = () => updateSignContextUi();
        if (schnorrModeEl) schnorrModeEl.onchange = () => updateSignContextUi();

        rebuildVerifyTypeOptions();
        verifyTypeEl.onchange = () => updateVerifyContextUi();
        if (verifySchnorrModeEl) verifySchnorrModeEl.onchange = () => updateVerifyContextUi();

        applyModeUi();
        updateSignContextUi();
        updateVerifyContextUi();

        let busy = false;
        const doClose = () => {
            if (!busy) m.hide();
        };

        const onSubmit = async () => {
            if (busy) return;
            const mode = String(modeEl.value || "sign");

            clearAlerts();
            statusEl.textContent = "";
            verifyStatusEl.textContent = "";
            resultEl.value = "";

            if (mode === "sign") {
                if (!canSign) {
                    statusEl.textContent = "Not allowed.";
                    return;
                }

                const opId = String(opIdEl.value || "").trim();
                const algo = String(algoEl.value || "").trim();
                const data64 = signData.getBase64();

                if (!opId || !algo || !data64) {
                    statusEl.textContent = "Operation id and payload are required.";
                    return;
                }

                busy = true;
                submit.disabled = true;

                try {
                    const operations = {};
                    operations[opId] = data64;

                    const body = {
                        keyId: key.logicalId,
                        algorithm: algo,
                        operations,
                    };

                    if (hashSignEl) body.hash = !!hashSignEl.checked;

                    if (schnorrWrap && !schnorrWrap.classList.contains("d-none") && schnorrModeEl) {
                        const sm = String(schnorrModeEl.value || "RFC").toUpperCase();
                        if (sm === "BIP340") {
                            body.context = buildContext("BIP340");
                        } else if (sm === "TAPROOT") {
                            const mr = merkleEl ? String(merkleEl.value || "").trim() : "";
                            body.context = buildContext("TAPROOT", mr || null);
                        }
                    }

                    const res = await api.signThreshold(body);
                    const data = (res && res.data !== undefined) ? res.data : res;

                    const code = String(data?.code || "").toUpperCase();
                    const gen = data?.generation;
                    const sig = data?.signature;
                    const values = sig && typeof sig === "object" ? sig : null;

                    const lines = [];
                    if (code) lines.push(`code: ${code}`);
                    if (gen != null) lines.push(`generation: ${gen}`);
                    if (values) {
                        lines.push(`signatures:`);
                        for (const [k2, v2] of Object.entries(values)) lines.push(`  ${k2}: ${v2}`);
                    }

                    resultEl.value = lines.join("\n");
                    statusEl.textContent = "Done.";
                } catch (e) {
                    statusEl.textContent = e?.details || e?.message || String(e);
                } finally {
                    busy = false;
                    submit.disabled = false;
                }

                return;
            }

            if (!canVerify) {
                verifyStatusEl.textContent = "Not allowed.";
                return;
            }

            const sigType = String(verifyTypeEl.value || "").trim();
            const data64 = verifyData.getBase64();
            const signature64 = String(sigEl.value || "").trim();

            if (!sigType || !data64 || !signature64) {
                verifyStatusEl.textContent = "Data and signature are required.";
                return;
            }

            const genRaw = String(genEl.value || "").trim();
            let gen = null;
            if (genRaw) gen = parseIntSafe(genRaw);
            else gen = showingHistoricalFor ? parseIntSafe(key.generation) : null;

            busy = true;
            submit.disabled = true;

            try {
                const body = {
                    keyId: key.logicalId,
                    sigType,
                    data64,
                    signature64,
                };

                if (gen != null) body.generation = gen;
                if (hashVerifyEl) body.hash = !!hashVerifyEl.checked;

                if (isSecp && String(sigType).toUpperCase() === "SCHNORR") {
                    const vm = String(verifySchnorrModeEl?.value || "BIP340").toUpperCase();
                    if (vm === "TAPROOT") {
                        const mr = verifyMerkleEl ? String(verifyMerkleEl.value || "").trim() : "";
                        body.context = buildContext("TAPROOT", mr || null);
                    } else {
                        body.context = buildContext("BIP340");
                    }
                }

                const res = await api.verifyThreshold(body);
                const data = (res && res.data !== undefined) ? res.data : res;
                const ok = data?.valid === true || data === true || data?.ok === true;

                verifyStatusEl.textContent = ok ? "Valid." : "Invalid.";
            } catch (e) {
                verifyStatusEl.textContent = e?.details || e?.message || String(e);
            } finally {
                busy = false;
                submit.disabled = false;
            }
        };

        submit.onclick = onSubmit;
        cancel.onclick = doClose;
        close.onclick = doClose;

        m.show();
    }

    function openPublic(key) {
        const modalEl = document.getElementById("tk-modal-public");
        const m = modalInstance(modalEl);
        const keyEl = document.getElementById("tk-public-key");
        const dataEl = document.getElementById("tk-public-data64");
        const statusEl = document.getElementById("tk-public-status");
        const close = document.getElementById("tk-public-close");
        const close2 = document.getElementById("tk-public-close2");

        if (!m || !keyEl || !dataEl || !statusEl || !close || !close2) return;

        keyEl.value = String(key.logicalId || "");
        dataEl.value = "";
        statusEl.textContent = "";

        let busy = false;
        const doClose = () => {
            if (!busy) m.hide();
        };

        const load = async () => {
            busy = true;
            try {
                const genParam = showingHistoricalFor ? parseIntSafe(key.generation) : null;
                const res = await api.getPublicKey(String(key.logicalId || ""), genParam);
                clearAlerts();
                const v = res?.data64 || res?.data || "";
                dataEl.value = String(v || "");
                statusEl.textContent = v ? "" : "No data.";
            } catch (e) {
                statusEl.textContent = e?.details || e?.message || String(e);
            } finally {
                busy = false;
            }
        };

        close.onclick = doClose;
        close2.onclick = doClose;

        m.show();
        load();
    }

    function openDestroy(key, activeGen) {
        const modalEl = document.getElementById("tk-modal-destroy");
        const m = modalInstance(modalEl);
        const keyEl = document.getElementById("tk-destroy-key");
        const genEl = document.getElementById("tk-destroy-generation");
        const confirmEl = document.getElementById("tk-destroy-confirm");
        const statusEl = document.getElementById("tk-destroy-status");
        const submit = document.getElementById("tk-destroy-submit");
        const cancel = document.getElementById("tk-destroy-cancel");
        const close = document.getElementById("tk-destroy-close");

        if (!m || !keyEl || !genEl || !confirmEl || !statusEl || !submit || !cancel || !close) return;

        keyEl.value = String(key.logicalId || "");
        const targetGen = parseIntSafe(key.generation);
        genEl.value = String(targetGen != null ? targetGen : "");
        confirmEl.value = "";
        statusEl.textContent = "";

        if (Number.isFinite(Number(activeGen)) && Number.isFinite(Number(targetGen))) {
            statusEl.textContent = `Active: ${Number(activeGen)} · Target: ${Number(targetGen)}`;
        }

        let busy = false;
        const doClose = () => {
            if (!busy) m.hide();
        };

        const onSubmit = async () => {
            if (busy) return;
            const expected = String(key.logicalId || "");
            const entered = String(confirmEl.value || "").trim();
            statusEl.textContent = "";

            if (!entered || entered !== expected) {
                statusEl.textContent = "Confirmation mismatch.";
                return;
            }
            if (targetGen == null) {
                statusEl.textContent = "Unknown generation.";
                return;
            }

            const ag = Number(activeGen);
            if (Number.isFinite(ag) && Number.isFinite(targetGen)) {
                const minAllowed = ag - 2;
                if (targetGen > minAllowed) {
                    statusEl.textContent = "Forbidden for recent generations.";
                    return;
                }
            }

            busy = true;
            submit.disabled = true;
            try {
                await api.destroyKey({keyId: key.logicalId, version: targetGen});
                clearAlerts();
                await loadPage(showingHistoricalFor);
                doClose();
            } catch (e) {
                statusEl.textContent = e?.details || e?.message || String(e);
            } finally {
                busy = false;
                submit.disabled = false;
            }
        };

        submit.onclick = onSubmit;
        cancel.onclick = doClose;
        close.onclick = doClose;

        m.show();
    }

    function openCrypto(key, mode = "encrypt") {
        const modalEl = document.getElementById("tk-modal-crypto");
        const m = modalInstance(modalEl);

        const keyEl = document.getElementById("tk-crypto-key");
        const curveEl = document.getElementById("tk-crypto-curve");

        const opSelect = document.getElementById("tk-crypto-op");

        const inputLabel = document.getElementById("tk-crypto-input-label");
        const inputEl = document.getElementById("tk-crypto-input64");
        const inputModeEl = document.getElementById("tk-crypto-input-mode");

        const statusEl = document.getElementById("tk-crypto-status");

        const outputLabel = document.getElementById("tk-crypto-output-label");
        const outputEl = document.getElementById("tk-crypto-output64");
        const outputModeEl = document.getElementById("tk-crypto-output-mode");

        const submit = document.getElementById("tk-crypto-submit");
        const cancel = document.getElementById("tk-crypto-cancel");
        const close = document.getElementById("tk-crypto-close");

        if (
            !m || !keyEl || !curveEl || !opSelect ||
            !inputLabel || !inputEl || !statusEl || !outputLabel || !outputEl ||
            !submit || !cancel || !close
        ) return;

        keyEl.value = String(key.logicalId || "");
        curveEl.value = String(key.curve || "");

        const scopes = new Set((key.scopes || []).map(s => String(s || "").toUpperCase()));
        const canEncrypt = scopes.has("ENCRYPT");
        const canDecrypt = scopes.has("DECRYPT");

        Array.from(opSelect.options).forEach(opt => {
            if (opt.value === "encrypt" && !canEncrypt) opt.disabled = true;
            else if (opt.value === "decrypt" && !canDecrypt) opt.disabled = true;
            else opt.disabled = false;
        });

        let initialOp = mode || "encrypt";
        if (initialOp === "encrypt" && !canEncrypt) initialOp = canDecrypt ? "decrypt" : "encrypt";
        if (initialOp === "decrypt" && !canDecrypt) initialOp = canEncrypt ? "encrypt" : "decrypt";
        try {
            opSelect.value = initialOp;
        } catch {
        }

        inputEl.value = "";
        outputEl.value = "";
        statusEl.textContent = "";

        const inputAdapter = makeDataModeAdapter({
            modeEl: inputModeEl,
            fieldEl: inputEl,
            statusEl,
            base64Placeholder: "Base64",
            textPlaceholder: "Text",
        });

        let outputBase64 = "";

        const renderOutput = () => {
            const op = opSelect.value === "decrypt" ? "decrypt" : "encrypt";
            const outMode = String(outputModeEl?.value || "base64");

            if (outMode === "text" && op === "decrypt") {
                try {
                    outputEl.value = outputBase64 ? b64ToUtf8(outputBase64) : "";
                } catch {
                    outputEl.value = "";
                    statusEl.textContent = "Not valid UTF-8. Switch output to Base64.";
                }
            } else {
                outputEl.value = String(outputBase64 || "");
            }
        };

        const updateLabels = () => {
            const op = opSelect.value === "decrypt" ? "decrypt" : "encrypt";

            if (op === "encrypt") {
                inputLabel.textContent = "Plaintext";

                if (inputModeEl) inputModeEl.disabled = false;

                outputLabel.textContent = "Ciphertext";

                if (outputModeEl) {
                    outputModeEl.value = "base64";
                    outputModeEl.disabled = true;
                }
            } else {
                inputLabel.textContent = "Ciphertext";

                if (inputModeEl) {
                    inputModeEl.value = "base64";
                    inputModeEl.disabled = true;
                    inputModeEl.dispatchEvent(new Event("change"));
                }

                outputLabel.textContent = "Plaintext";

                if (outputModeEl) outputModeEl.disabled = false;
            }

            inputEl.value = "";
            outputBase64 = "";
            statusEl.textContent = "";
            renderOutput();
        };

        opSelect.onchange = updateLabels;
        if (outputModeEl) outputModeEl.onchange = () => renderOutput();

        updateLabels();

        let busy = false;
        const doClose = () => {
            if (!busy) m.hide();
        };

        const onSubmit = async () => {
            if (busy) return;

            const op = opSelect.value === "decrypt" ? "decrypt" : "encrypt";
            const payload64 = inputAdapter.getBase64();

            statusEl.textContent = "";
            outputBase64 = "";
            renderOutput();

            if (!payload64) {
                statusEl.textContent = op === "encrypt" ? "Plaintext required." : "Ciphertext required.";
                return;
            }

            busy = true;
            submit.disabled = true;

            try {
                let res;
                if (op === "encrypt") {
                    res = await api.encryptEcies({
                        keyId: key.logicalId,
                        algorithm: "AES_GCM",
                        plaintext64: payload64,
                    });
                } else {
                    const genVal = showingHistoricalFor ? parseIntSafe(key.generation) : null;
                    const body = {
                        keyId: key.logicalId,
                        algorithm: "AES_GCM",
                        ciphertext64: payload64,
                    };
                    if (genVal != null) body.generation = genVal;
                    res = await api.decryptEcies(body);
                }

                clearAlerts();

                const data = (res && res.data !== undefined) ? res.data : res;

                if (op === "encrypt") {
                    const ct = data?.ciphertext64 || data?.data64 || data?.ciphertext || "";
                    outputBase64 = String(ct || "");
                    statusEl.textContent = outputBase64 ? "Done." : "Done.";
                } else {
                    const pt = data?.plaintext64 || data?.data64 || data?.plaintext || "";
                    outputBase64 = String(pt || "");
                    statusEl.textContent = outputBase64 ? "Done." : "Done.";
                }

                renderOutput();
            } catch (e) {
                statusEl.textContent = e?.details || e?.message || String(e);
            } finally {
                busy = false;
                submit.disabled = false;
            }
        };

        submit.onclick = onSubmit;
        cancel.onclick = doClose;
        close.onclick = doClose;

        m.show();
    }
}