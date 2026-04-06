export async function init({api, Auth, showAlert, clearAlerts}) {
    if (!Auth.subject) {
        location.hash = "#/login";
        return;
    }

    const form = document.getElementById("tk-init-form");
    const result = document.getElementById("tk-init-result");

    const peerIdEl = document.getElementById("tk-init-peerId");
    const thresholdEl = document.getElementById("tk-init-threshold");
    const totalEl = document.getElementById("tk-init-total");
    const submit = document.getElementById("tk-init-submit");
    const statusEl = document.getElementById("tk-init-status");

    const resTh = document.getElementById("tk-init-res-threshold");
    const resTotal = document.getElementById("tk-init-res-total");
    const sharesEl = document.getElementById("tk-init-shares");
    const downloadBtn = document.getElementById("tk-init-download");
    const copyBtn = document.getElementById("tk-init-copy");
    const ackEl = document.getElementById("tk-init-ack");
    const contBtn = document.getElementById("tk-init-continue");
    const resStatus = document.getElementById("tk-init-result-status");

    let bundle = null;

    submit.addEventListener("click", async () => {
        if (submit.disabled) return
        submit.disabled = true;

        statusEl.textContent = "";
        resStatus.textContent = "";

        const peerId = int(peerIdEl.value);
        const threshold = int(thresholdEl.value);
        const total = int(totalEl.value);

        if (!peerId || !threshold || !total || threshold > total) {
            showAlert("danger", "Invalid init parameters");
            return;
        }

        try {
            const r = await api.systemInit({peerId, threshold, total});

            if (!r) {
                try {
                    const st = await api.getStatus();
                    if (st?.state === "SEALED") location.hash = "#/unseal";
                    else location.hash = "#/welcome";
                } catch {
                    location.hash = "#/welcome";
                }
                return;
            }

            const warning = r?.warning;
            const data = r?.data ?? r;

            if (warning) showAlert("warning", warning);

            if (!data || !Array.isArray(data.shares64) || data.shares64.length === 0) {
                showAlert("danger", "Init response missing shares64");
                submit.disabled = false;
                return;
            }

            bundle = {
                peerId,
                threshold: data.threshold ?? threshold,
                total: data.total ?? total,
                shares64: data.shares64,
            };

            clearAlerts();
            form.classList.add("d-none");
            result.classList.remove("d-none");

            resTh.textContent = String(bundle.threshold);
            resTotal.textContent = String(bundle.total);
            sharesEl.value = bundle.shares64.join("\n");
            resStatus.textContent = `Download file name: keeper-${bundle.peerId}.json`;

            result.scrollIntoView({behavior: "smooth", block: "start"});
        } catch (e) {
            showAlert("danger", e?.details || e?.message || String(e));
        } finally {
            submit.disabled = false;
        }
    });

    downloadBtn.addEventListener("click", () => {
        if (!bundle) return;
        downloadJson(bundle, `keeper-${bundle.peerId}.json`);
    });

    copyBtn.addEventListener("click", async () => {
        if (!bundle) return;
        const text = JSON.stringify(bundle, null, 2);
        try {
            await navigator.clipboard.writeText(text);
            resStatus.textContent = "Copied to clipboard.";
        } catch {
            resStatus.textContent = "Copy failed. Download instead.";
        }
    });

    ackEl.addEventListener("change", () => {
        contBtn.disabled = !ackEl.checked;
    });

    contBtn.addEventListener("click", async () => {
        try {
            const st = await api.getStatus();
            if (st?.state === "SEALED") location.hash = "#/unseal";
            else location.hash = "#/welcome";
        } catch {
            location.hash = "#/welcome";
        }
    });
}

function int(v) {
    const n = Number(String(v || "").trim());
    return Number.isFinite(n) ? n : 0;
}

function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}