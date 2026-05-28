export function createFourEyeKeyRow(onRemove) {
    const wrapper = document.createElement("div");
    wrapper.className = "d-flex align-items-start gap-2 border rounded p-2 bg-white";
    wrapper.dataset.fourEyeKey = "1";

    const curveSelect = document.createElement("select");
    curveSelect.className = "form-select form-select-sm";
    curveSelect.style.maxWidth = "140px";
    curveSelect.style.flexShrink = "0";
    for (const c of ["SECP256K1", "ED25519", "P256"]) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        curveSelect.appendChild(opt);
    }

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "form-control form-control-sm font-monospace";
    keyInput.placeholder = "Base64-encoded public key…";
    keyInput.autocomplete = "off";
    keyInput.spellcheck = false;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-sm btn-ghost-danger flex-shrink-0";
    removeBtn.setAttribute("aria-label", "Remove key");
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => onRemove(wrapper));

    wrapper.append(curveSelect, keyInput, removeBtn);

    wrapper._getCurve = () => curveSelect.value;
    wrapper._getKey   = () => keyInput.value.trim();

    return wrapper;
}

export function initFourEyeUI({ enabledEl, bodyEl, keysContainerEl, addBtnEl }) {
    const syncVisibility = () =>
        bodyEl.classList.toggle("d-none", !enabledEl.checked);

    enabledEl.addEventListener("change", syncVisibility);
    syncVisibility();

    addBtnEl.addEventListener("click", () => {
        const row = createFourEyeKeyRow((el) => el.remove());
        keysContainerEl.appendChild(row);
    });
}

export function buildFourEyePolicy({ enabledEl, mEl, keysContainerEl }) {
    if (!enabledEl.checked) return null;

    const mRaw = mEl.value.trim();
    if (!mRaw) throw new Error("Four-Eye: Min Approvers (M) is required.");

    const m = parseInt(mRaw, 10);
    if (!Number.isInteger(m) || m < 2) {
        throw new Error("Four-Eye: M must be an integer ≥ 2.");
    }
    if (m > 99) {
        throw new Error("Four-Eye: M is unreasonably large (max 99).");
    }

    const rows = Array.from(
        keysContainerEl.querySelectorAll("[data-four-eye-key]")
    );

    if (rows.length === 0) {
        throw new Error("Four-Eye: add at least one approver key.");
    }
    if (m > rows.length) {
        throw new Error(`Four-Eye: M (${m}) cannot exceed N (${rows.length} keys).`);
    }

    const keys = [];
    const seen = new Set();

    for (let i = 0; i < rows.length; i++) {
        const curve      = rows[i]._getCurve();
        const publicKey64 = rows[i]._getKey();
        const label      = `Approver key ${i + 1}`;

        if (!publicKey64) {
            throw new Error(`${label}: public key is required.`);
        }
        if (!isValidBase64(publicKey64)) {
            throw new Error(`${label}: invalid base64 encoding.`);
        }

        const dedup = `${curve}::${publicKey64}`;
        if (seen.has(dedup)) {
            throw new Error(`${label}: duplicate key detected.`);
        }
        seen.add(dedup);

        keys.push({ curve, publicKey64 });
    }

    return { m, n: rows.length, keys };
}

function isValidBase64(s) {
    if (!s || s.length === 0) return false;
    if (s.length % 4 === 1) return false;
    return /^[A-Za-z0-9+/\-_]+=*$/.test(s);
}