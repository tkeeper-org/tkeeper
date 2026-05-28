import { Permission } from "./auth.js";

export async function init({api, Auth, showAlert, clearAlerts}) {
    if (!Auth?.hasPermission?.("tkeeper.compliance.inventory")) {
        showAlert("warning", "Access denied.");
        return;
    }

    const DP = requireDomPurify();
    const ids = [
        "tk-keys-refresh",
        "tk-keys-export-json",
        "tk-keys-export-csv",
        "tk-keys-filter",
        "tk-keys-owner",
        "tk-keys-limit",
        "tk-keys-apply",
        "tk-keys-clear",
        "tk-keys-foot",
        "tk-keys-list",
        "tk-keys-more",
        "tk-keys-browser",
        "tk-keys-detail",
    ];

    for (const id of ids) {
        if (!document.getElementById(id)) {
            showAlert("danger", `Vault UI mismatch (missing #${id}). Hard refresh / clear cache.`);
            return;
        }
    }

    const els = {
        refresh: document.getElementById("tk-keys-refresh"),
        exportJson: document.getElementById("tk-keys-export-json"),
        exportCsv: document.getElementById("tk-keys-export-csv"),
        filter: document.getElementById("tk-keys-filter"),
        owner: document.getElementById("tk-keys-owner"),
        limit: document.getElementById("tk-keys-limit"),
        apply: document.getElementById("tk-keys-apply"),
        clear: document.getElementById("tk-keys-clear"),
        foot: document.getElementById("tk-keys-foot"),
        list: document.getElementById("tk-keys-list"),
        more: document.getElementById("tk-keys-more"),
        browser: document.getElementById("tk-keys-browser"),
        detail: document.getElementById("tk-keys-detail"),
    };

    let cursor = null;
    let hasMore = false;
    let currentFilter = null;
    let currentOwner = null;
    let loading = false;
    let totalLoaded = 0;
    let loadedItems = [];
    let lastInventoryMeta = null;
    let activeGenerationByKey = new Map();

    els.refresh.addEventListener("click", () => reload());
    els.apply.addEventListener("click", () => {
        currentFilter = String(els.filter.value || "").trim() || null;
        currentOwner = String(els.owner.value || "").trim() || null;
        reload();
    });
    els.clear.addEventListener("click", () => {
        els.filter.value = "";
        els.owner.value = "";
        els.limit.value = "200";
        currentFilter = null;
        currentOwner = null;
        reload();
    });
    els.filter.addEventListener("keydown", (e) => {
        if (e.key === "Enter") els.apply.click();
    });
    els.owner.addEventListener("keydown", (e) => {
        if (e.key === "Enter") els.apply.click();
    });
    els.limit.addEventListener("change", () => reload());
    els.more.addEventListener("click", async () => {
        if (!hasMore || loading) return;
        await loadPage({append: true});
    });
    els.exportJson.addEventListener("click", () => exportJson());
    els.exportCsv.addEventListener("click", () => exportCsv());

    await reload();

    async function reload() {
        cursor = null;
        hasMore = false;
        totalLoaded = 0;
        loadedItems = [];
        lastInventoryMeta = null;
        activeGenerationByKey = new Map();

        closeDetail();
        els.more.classList.add("d-none");
        els.foot.textContent = "";

        els.list.innerHTML = `
      <div class="table-responsive">
        <table class="table table-vcenter table-hover card-table mb-0 tk-inv-table">
          <thead>
            <tr class="text-secondary small text-uppercase">
              <th class="tk-col-icon text-center" title="Tampered indicator"></th>
              <th>Key ID</th>
              <th class="tk-col-status">Status</th>
              <th class="tk-col-curve">Curve</th>
              <th class="tk-col-gen">Gen / Pending</th>
              <th class="tk-col-owner">Asset Owner</th>
              <th class="tk-col-date">Updated</th>
              <th class="tk-col-toggle"></th>
            </tr>
          </thead>
          <tbody id="tk-keys-tbody"></tbody>
        </table>
      </div>
    `;

        await loadPage({append: false});
    }

    async function loadPage({append}) {
        loading = true;
        lock(true);

        try {
            const page = await api.getInventory({
                logicalId: currentFilter,
                assetOwner: currentOwner,
                historical: false,
                lastSeen: cursor,
                limit: Number(els.limit.value || "200"),
            });

            const inv = page?.inventory;
            if (!inv) {
                showAlert("danger", "Inventory payload is missing.");
                return;
            }

            lastInventoryMeta = {
                generatedAt: inv.generatedAt,
                peerId: inv.peerId,
                threshold: inv.threshold,
                totalPeers: inv.totalPeers,
                filter: currentFilter,
                assetOwner: currentOwner,
            };
            const items = Array.isArray(inv.items) ? inv.items : [];
            for (const it of items) {
                const key = String(it?.logicalId || "");
                const gen = Number(it?.currentGeneration);
                if (key && Number.isFinite(gen)) activeGenerationByKey.set(key, Math.trunc(gen));
            }

            const tbody = document.getElementById("tk-keys-tbody");
            if (!tbody) {
                showAlert("danger", "Table not initialized.");
                return;
            }

            if (!append) tbody.innerHTML = "";

            if (items.length === 0 && !append) {
                tbody.innerHTML = `
          <tr>
            <td colspan="8" class="p-0">
              ${emptyStateHtml(currentFilter, currentOwner)}
            </td>
          </tr>
        `;
            } else {
                for (const it of items) {
                    tbody.insertAdjacentHTML("beforeend", renderItemRow(it, {historical: false}));
                }
                loadedItems.push(...items);
                totalLoaded += items.length;
            }

            cursor = page?.nextCursor ?? null;
            hasMore = !!page?.hasMore;

            els.more.classList.toggle("d-none", !hasMore);
            els.foot.textContent = totalLoaded > 0
                ? `${totalLoaded} item${totalLoaded !== 1 ? "s" : ""} loaded${hasMore ? " - more available" : " - end of list"}.`
                : "";

            wireInteractions(tbody);
        } catch (e) {
            showAlert("danger", e?.details || e?.message || String(e));
        } finally {
            loading = false;
            lock(false);
        }
    }

    function lock(v) {
        els.more.disabled = v;
        els.refresh.disabled = v;
        els.apply.disabled = v;
        els.clear.disabled = v;
        els.filter.disabled = v;
        els.owner.disabled = v;
        els.limit.disabled = v;
        els.exportJson.disabled = v || loadedItems.length === 0;
        els.exportCsv.disabled = v || loadedItems.length === 0;

        const icon = els.refresh.querySelector(".tk-inv-refresh-icon");
        if (icon) icon.classList.toggle("tk-spin", !!v);

        if (v) els.refresh.setAttribute("aria-busy", "true");
        else els.refresh.removeAttribute("aria-busy");
    }

    function wireInteractions(root) {
        root.querySelectorAll("[data-vault-open]").forEach((btn) => {
            if (btn.__wired) return;
            btn.__wired = true;
            btn.addEventListener("click", () => openDetail(btn.getAttribute("data-vault-open")));
        });

        root.querySelectorAll("[data-vault-toggle]").forEach((btn) => {
            if (btn.__wired) return;
            btn.__wired = true;

            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-vault-toggle");
                const detRow = document.getElementById(`tk-vaultd-${cssEsc(id)}`);
                if (!detRow) return;

                const isOpen = !detRow.classList.contains("d-none");
                detRow.classList.toggle("d-none", isOpen);
                btn.setAttribute("aria-expanded", String(!isOpen));

                const chevron = btn.querySelector(".tk-inv-toggle-icon");
                if (chevron) chevron.classList.toggle("is-open", !isOpen);
            });
        });

        root.querySelectorAll("[data-vault-hist]").forEach((btn) => {
            if (btn.__wired) return;
            btn.__wired = true;

            btn.addEventListener("click", async () => {
                const logicalId = btn.getAttribute("data-vault-hist");
                const host = root.querySelector(`[data-vault-histbox="${cssEsc(logicalId)}"]`);
                if (!host) return;

                const becameVisible = host.classList.toggle("d-none") === false;
                const label = btn.querySelector(".tk-hist-label");
                if (label) label.textContent = becameVisible ? "Hide historical" : "View historical generations";

                if (!becameVisible) return;
                if (host.getAttribute("data-loaded") === "true") return;

                host.setAttribute("data-loaded", "true");
                await loadHistorical(host, logicalId);
            });
        });

        root.querySelectorAll("[data-vault-public]").forEach((btn) => {
            if (btn.__wired) return;
            btn.__wired = true;
            btn.addEventListener("click", () => {
                openPublic({
                    logicalId: btn.getAttribute("data-vault-public"),
                    generation: parseIntSafe(btn.getAttribute("data-vault-generation")),
                });
            });
        });

        root.querySelectorAll("[data-vault-destroy]").forEach((btn) => {
            if (btn.__wired) return;
            btn.__wired = true;
            btn.addEventListener("click", () => {
                const keyId = btn.getAttribute("data-vault-destroy");
                openDestroy({
                    logicalId: keyId,
                    generation: parseIntSafe(btn.getAttribute("data-vault-generation")),
                }, activeGenerationByKey.get(keyId));
            });
        });
    }

    async function loadHistorical(host, logicalId) {
        host.innerHTML = `
      <div class="card card-sm mt-3 border-0 bg-light">
        <div class="card-body py-3">
          <div class="d-flex align-items-center gap-2 text-secondary">
            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
            <span class="small">Loading historical generations...</span>
          </div>
        </div>
      </div>
    `;

        let hCursor = null;
        let hHasMore = false;
        const state = {page: 1, perPage: 10, rows: []};

        const fetchMore = async () => {
            const page = await api.getInventory({
                logicalId,
                historical: true,
                lastSeen: hCursor,
                limit: 200,
            });

            const inv = page?.inventory;
            const items = Array.isArray(inv?.items) ? inv.items : [];
            state.rows.push(...items);

            hCursor = page?.nextCursor ?? null;
            hHasMore = !!page?.hasMore;
            renderTable();
        };

        const renderTable = () => {
            const total = state.rows.length;
            const pages = Math.max(1, Math.ceil(total / state.perPage));
            state.page = Math.min(state.page, pages);

            const start = (state.page - 1) * state.perPage;
            const slice = state.rows.slice(start, start + state.perPage);
            const anyTamp = state.rows.some((r) => r?.tampered === true);

            const svgPrev = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 6l-6 6l6 6"/></svg>`;
            const svgNext = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 6l6 6l-6 6"/></svg>`;

            host.innerHTML = `
        <div class="card card-sm mt-3 border-0 bg-light">
          <div class="card-header d-flex align-items-center justify-content-between flex-wrap gap-2 py-2">
            <div class="d-flex align-items-center gap-2">
              <span class="fw-semibold text-secondary small text-uppercase">Historical generations</span>
              ${anyTamp ? `<span class="badge tk-badge-danger-solid">Contains tampered</span>` : ""}
              <span class="badge bg-secondary-lt">${escapeHtml(String(total))}${hHasMore ? "+" : ""} total</span>
            </div>
            <div class="d-flex align-items-center gap-2">
              <span class="text-secondary small">Page ${escapeHtml(String(state.page))} / ${escapeHtml(String(pages))}</span>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary d-inline-flex align-items-center justify-content-center"
                        type="button" data-hprev ${state.page <= 1 ? "disabled" : ""} aria-label="Previous page">${svgPrev}</button>
                <button class="btn btn-outline-secondary d-inline-flex align-items-center justify-content-center"
                        type="button" data-hnext ${state.page >= pages ? "disabled" : ""} aria-label="Next page">${svgNext}</button>
              </div>
              <button class="btn btn-sm btn-outline-primary" type="button" data-hmore ${!hHasMore ? "disabled" : ""}>
                ${hHasMore ? "Load more" : "All loaded"}
              </button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="table table-sm table-vcenter mb-0">
              <thead>
                <tr class="text-secondary small text-uppercase">
                  <th class="tk-col-h-icon text-center"></th>
                  <th>Status</th>
                  <th class="tk-col-h-gen">Generation</th>
                  <th class="tk-col-curve">Curve</th>
                  <th>Authorities</th>
                  <th>Policy</th>
                  <th class="tk-col-h-date">Created</th>
                  <th class="tk-col-h-date">Updated</th>
                  <th class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${slice.length ? slice.map(renderHistoricalRow).join("") : `<tr><td colspan="9" class="text-secondary text-center py-3">No records.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `;

            host.querySelector("[data-hprev]")?.addEventListener("click", () => {
                state.page--;
                renderTable();
            });
            host.querySelector("[data-hnext]")?.addEventListener("click", () => {
                state.page++;
                renderTable();
            });
            host.querySelector("[data-hmore]")?.addEventListener("click", async () => {
                const btn = host.querySelector("[data-hmore]");
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = "Loading...";
                }
                await fetchMore();
            });
            wireInteractions(host);
        };

        try {
            await fetchMore();
        } catch (e) {
            host.innerHTML = `
        <div class="alert alert-danger mt-3" role="alert">
          <strong>Failed to load historical generations.</strong>
          <span class="text-secondary ms-2">${escapeHtml(e?.details || e?.message || String(e))}</span>
        </div>
      `;
        }
    }

    function renderItemRow(it) {
        const logicalId = String(it.logicalId || "");
        const status = statusMeta(it.status);
        const curve = it.curve ? String(it.curve) : "-";
        const gen = it.currentGeneration == null ? "-" : String(it.currentGeneration);
        const pending = it.lastPendingGeneration == null ? "-" : String(it.lastPendingGeneration);
        const updated = fmtTime(it.updatedAt);
        const owner = it.assetOwner?.trim() || null;
        const tampered = it.tampered === true;

        const genCell = pending !== "-"
            ? `<span class="fw-semibold">${escapeHtml(gen)}</span> <span class="text-muted small">/ ${escapeHtml(pending)}</span>`
            : `<span class="fw-semibold">${escapeHtml(gen)}</span>`;

        const tamperedCell = tampered ? tamperedBadgeCell("Metadata integrity check failed", 12) : `<td></td>`;
        const actions = renderActions(logicalId, it.currentGeneration, {status: it.status, current: true});
        return `
      <tr data-vault-row="${escapeHtml(logicalId)}" class="${tampered ? "table-danger tk-row-tampered" : ""}">
        ${tamperedCell}
        <td class="tk-td-keyid">
          <button class="btn btn-link p-0 text-start font-monospace fw-semibold text-decoration-none tk-vault-key-link"
                  type="button" data-vault-open="${escapeHtml(logicalId)}"
                  title="${escapeHtml(logicalId)}">${escapeHtml(logicalId)}</button>
        </td>
        <td>${status.badge}</td>
        <td class="text-secondary">${escapeHtml(curve)}</td>
        <td>${genCell}</td>
        <td class="text-secondary">
          ${owner ? `<span class="text-truncate d-block tk-td-owner-cell" title="${escapeHtml(owner)}">${escapeHtml(owner)}</span>` : `<span class="text-muted">-</span>`}
        </td>
        <td class="text-secondary small text-nowrap">${escapeHtml(updated)}</td>
        <td class="text-end">
          <div class="d-flex justify-content-end align-items-center gap-1">
            ${actions}
            <button class="btn btn-sm btn-outline-primary" type="button"
                    data-vault-open="${escapeHtml(logicalId)}">Open</button>
          </div>
        </td>
      </tr>
    `;
    }

    function openDetail(logicalId) {
        const keyId = String(logicalId || "");
        const it = loadedItems.find((item) => String(item?.logicalId || "") === keyId);
        if (!it) {
            showAlert("warning", "Key is not loaded in the current Vault view.");
            return;
        }

        els.browser.classList.add("d-none");
        els.detail.classList.remove("d-none");
        els.detail.innerHTML = renderKeyDetail(it);
        wireInteractions(els.detail);

        const back = els.detail.querySelector("[data-vault-back]");
        if (back && !back.__wired) {
            back.__wired = true;
            back.addEventListener("click", () => closeDetail());
        }
    }

    function closeDetail() {
        if (!els.browser || !els.detail) return;
        els.detail.innerHTML = "";
        els.detail.classList.add("d-none");
        els.browser.classList.remove("d-none");
    }

    function renderKeyDetail(it) {
        const logicalId = String(it.logicalId || "");
        const status = statusMeta(it.status);
        const curve = it.curve ? String(it.curve) : "-";
        const gen = it.currentGeneration == null ? "-" : String(it.currentGeneration);
        const pending = it.lastPendingGeneration == null ? "-" : String(it.lastPendingGeneration);
        const owner = it.assetOwner?.trim() || null;
        const auth = extractAuthorities(it);
        const tampered = it.tampered === true;
        const actions = renderActions(logicalId, it.currentGeneration, {status: it.status, current: true});

        return `
      <div class="tk-vault-detail-page">
        <div class="tk-vault-detail-top">
          <button class="btn btn-outline-secondary" type="button" data-vault-back>
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline me-2" width="18" height="18"
                 viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" aria-hidden="true">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M15 6l-6 6l6 6"/>
            </svg>
            Back
          </button>
          <div class="tk-vault-detail-actions">${actions}</div>
        </div>

        ${tampered ? tamperedAlert() : ""}

        <section class="tk-vault-detail-hero">
          <div class="min-w-0">
            <div class="tk-vault-detail-key font-monospace">${escapeHtml(logicalId)}</div>
            <div class="tk-vault-detail-muted">${escapeHtml(status.hint || "Key metadata and authority configuration.")}</div>
          </div>
          <div class="tk-vault-detail-status">${status.badge}</div>
        </section>

        <section class="tk-vault-detail-section">
          <div class="tk-vault-detail-title">Overview</div>
          <div class="tk-vault-overview-grid">
            ${detailFact("Generation", pending !== "-" ? `${gen} / ${pending}` : gen)}
            ${detailFact("Curve", curve)}
            ${detailFact("Asset owner", owner || "-")}
            ${detailFact("Created", fmtTime(it.createdAt))}
            ${detailFact("Updated", fmtTime(it.updatedAt))}
            ${detailFact("Tampered", tampered ? "Yes" : "No")}
          </div>
        </section>

        <section class="tk-vault-detail-section">
          <div class="tk-vault-detail-title">Authorities</div>
          ${renderAuthorities(auth)}
        </section>

        <section class="tk-vault-detail-section">
          <div class="tk-vault-detail-title">Policy</div>
          ${it.policy ? renderPolicy(it.policy) : `<span class="text-secondary small">No policy configured.</span>`}
        </section>

        <section class="tk-vault-detail-section">
          <div class="tk-vault-detail-title">Generations</div>
          <div class="d-flex align-items-center justify-content-between gap-3 flex-wrap">
            <div class="text-secondary small">Current generation is shown above. Historical records load on demand.</div>
            <button class="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
                    type="button" data-vault-hist="${escapeHtml(logicalId)}">
              <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16"
                   viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" aria-hidden="true">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M12 8l0 4l2 2"/>
                <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/>
              </svg>
              <span class="tk-hist-label">View historical generations</span>
            </button>
          </div>
          <div class="d-none" data-vault-histbox="${escapeHtml(logicalId)}"></div>
        </section>
      </div>
    `;
    }

    function detailFact(label, value) {
        return `
      <div class="tk-vault-fact">
        <div class="tk-vault-fact-label">${escapeHtml(label)}</div>
        <div class="tk-vault-fact-value">${escapeHtml(value)}</div>
      </div>
    `;
    }

    function renderHistoricalRow(it) {
        const logicalId = String(it.logicalId || "");
        const status = statusMeta(it.status);
        const tampered = it.tampered === true;
        const curve = it.curve ? String(it.curve) : "-";
        const gen = it.currentGeneration == null ? "-" : String(it.currentGeneration);
        const auth = extractAuthorities(it);

        return `
      <tr class="${tampered ? "table-danger" : ""}">
        ${tampered ? tamperedBadgeCell("Tampered", 10) : `<td></td>`}
        <td>${status.badge}</td>
        <td class="fw-semibold">${escapeHtml(gen)}</td>
        <td class="text-secondary">${escapeHtml(curve)}</td>
        <td>${renderAuthoritySummary(auth)}</td>
        <td>${it.policy ? renderPolicySummary(it.policy) : `<span class="text-muted">-</span>`}</td>
        <td class="text-secondary small text-nowrap">${escapeHtml(fmtTime(it.createdAt))}</td>
        <td class="text-secondary small text-nowrap">${escapeHtml(fmtTime(it.updatedAt))}</td>
        <td class="text-end">${renderActions(logicalId, it.currentGeneration, {status: it.status, current: false})}</td>
      </tr>
    `;
    }

    function renderActions(logicalId, generation, {status, current}) {
        const keyId = String(logicalId || "");
        const gen = parseIntSafe(generation);
        const st = String(status || "").toUpperCase();
        const canPublic = Auth.hasPermission?.(Permission.keyGetPublicKey(keyId)) && st !== "DESTROYED" && st !== "EXPIRED";
        const canDestroy = Auth.hasPermission?.(Permission.keyDestroy(keyId)) && !current && st !== "DESTROYED";
        const activeGen = activeGenerationByKey.get(keyId);

        const out = [];
        if (canPublic) {
            out.push(`
        <button class="btn btn-sm btn-outline-secondary" type="button"
                data-vault-public="${escapeHtml(keyId)}"
                data-vault-generation="${escapeHtml(String(gen ?? ""))}">Public</button>
      `);
        }

        if (canDestroy && gen != null) {
            const allowedByUi = Number.isFinite(Number(activeGen)) ? gen <= Number(activeGen) - 2 : true;
            if (allowedByUi) {
                out.push(`
          <button class="btn btn-sm btn-outline-danger" type="button"
                  data-vault-destroy="${escapeHtml(keyId)}"
                  data-vault-generation="${escapeHtml(String(gen))}">Destroy</button>
        `);
            }
        }

        return out.length ? `<div class="d-inline-flex gap-1 flex-wrap justify-content-end">${out.join("")}</div>` : "";
    }

    function renderAuthoritySummary(auth) {
        if (!auth.available) return `<span class="text-muted">-</span>`;
        if (auth.items.length === 0) return `<span class="text-muted">-</span>`;
        const first = auth.items.slice(0, 2).map((a) => authorityBadge(a)).join("");
        const more = auth.items.length > 2 ? `<span class="badge bg-secondary-lt">+${auth.items.length - 2}</span>` : "";
        return `<div class="d-flex flex-wrap gap-1">${first}${more}</div>`;
    }

    function renderAuthorities(auth) {
        if (!auth.available) {
            return `<div class="text-secondary small">-</div>`;
        }
        if (!auth.items.length) return `<div class="text-secondary small">No authorities configured.</div>`;

        const rows = auth.items.map((a) => `
      <tr>
        <td class="font-monospace fw-semibold tk-vault-authority-id">${escapeHtml(a.id || "-")}</td>
        <td>
          ${a.oci
            ? `<code class="tk-vault-oci-ref">${escapeHtml(a.oci)}</code>`
            : `<span class="text-muted">-</span>`}
        </td>
      </tr>
    `).join("");

        return `
      <div class="table-responsive tk-vault-authorities">
        <table class="table table-sm table-vcenter mb-0">
          <thead>
            <tr class="text-secondary small text-uppercase">
              <th>Authority ID</th>
              <th>OCI Reference</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    }

    function extractAuthorities(it) {
        const raw = it?.authorities ?? it?.authority ?? it?.keyAuthorities ?? it?.allowedAuthorities;
        if (raw == null) return {available: false, items: []};

        const values = Array.isArray(raw)
            ? raw
            : Array.isArray(raw?.values)
                ? raw.values
                : Array.isArray(raw?.items)
                    ? raw.items
                    : [];

        const items = values.map((v) => {
            if (typeof v === "string") return {id: v, oci: null};
            return {
                id: String(v?.id ?? v?.authorityId ?? v?.type ?? "-"),
                oci: v?.oci == null ? null : String(v.oci),
            };
        }).filter((v) => v.id && v.id !== "-");

        return {available: true, items};
    }

    function authorityBadge(a) {
        const id = String(a?.id || "-");
        const cls = id === "arbitrary" ? "bg-secondary-lt" : "bg-indigo-lt";
        return `<span class="badge ${cls}" title="${escapeHtml(a?.oci || id)}">${escapeHtml(id)}</span>`;
    }

    function renderPolicySummary(p) {
        if (!p) return `<span class="text-muted">-</span>`;

        const badges = [];
        if (p.allowHistoricalProcess === false)
            badges.push(`<span class="badge tk-badge-danger-solid" title="Historical operations blocked">No historical</span>`);

        const apply = renderNotAfter(p.apply);
        if (apply) {
            badges.push(apply.expired
                ? `<span class="badge bg-danger-lt" title="Apply notAfter: ${escapeHtml(apply.text)}">Apply expired</span>`
                : `<span class="badge bg-warning-lt" title="Apply notAfter: ${escapeHtml(apply.text)}">Apply limit</span>`);
        }

        const process = renderNotAfter(p.process);
        if (process) {
            badges.push(process.expired
                ? `<span class="badge bg-danger-lt" title="Process notAfter: ${escapeHtml(process.text)}">Process expired</span>`
                : `<span class="badge bg-warning-lt" title="Process notAfter: ${escapeHtml(process.text)}">Process limit</span>`);
        }

        if (p.fourEye) {
            const m = Number(p.fourEye.m ?? 0);
            const n = Number(p.fourEye.n ?? 0);
            badges.push(`<span class="badge bg-warning-lt" title="${escapeHtml(String(m))}/${escapeHtml(String(n))} approvals required">4-eye ${escapeHtml(String(m))}/${escapeHtml(String(n))}</span>`);
        }

        return badges.length ? `<div class="d-flex flex-wrap gap-1">${badges.join("")}</div>` : `<span class="text-muted">-</span>`;
    }

    function renderPolicy(p) {
        const allow = p.allowHistoricalProcess !== false;
        const apply = renderNotAfter(p.apply);
        const process = renderNotAfter(p.process);

        return `
      <div class="row g-3">
        <div class="col-6 col-md-3">
          <div class="text-muted small mb-1">Historical operations</div>
          <div>${allow ? `<span class="badge bg-green-lt">Allowed</span>` : `<span class="badge tk-badge-danger-solid">Blocked</span>`}</div>
        </div>
        <div class="col-6 col-md-3">
          <div class="text-muted small mb-1">Apply not after</div>
          <div class="fw-semibold small">${apply ? renderTimeLimit(apply) : `<span class="text-muted">No limit</span>`}</div>
        </div>
        <div class="col-6 col-md-3">
          <div class="text-muted small mb-1">Process not after</div>
          <div class="fw-semibold small">${process ? renderTimeLimit(process) : `<span class="text-muted">No limit</span>`}</div>
        </div>
      </div>
      ${p.fourEye ? renderFourEyePolicy(p.fourEye) : ""}
    `;
    }

    function renderTimeLimit(limit) {
        return limit.expired
            ? `<span class="text-danger">${escapeHtml(limit.text)}</span><span class="badge bg-danger-lt ms-1">Expired</span>`
            : escapeHtml(limit.text);
    }

    function renderFourEyePolicy(fe) {
        const m = Number(fe.m ?? 0);
        const n = Number(fe.n ?? 0);
        const keys = Array.isArray(fe.keys) ? fe.keys : [];

        const keysHtml = keys.map((k, i) => `
      <tr>
        <td class="tk-col-fe-num text-secondary">${escapeHtml(String(i + 1))}</td>
        <td class="tk-col-fe-curve"><span class="badge bg-secondary-lt">${escapeHtml(String(k.curve || "-"))}</span></td>
        <td class="font-monospace small tk-td-pubkey" title="${escapeHtml(String(k.publicKey64 || ""))}">
          ${escapeHtml(String(k.publicKey64 || "-"))}
        </td>
      </tr>
    `).join("");

        return `
      <div class="mt-3 pt-3 border-top">
        <div class="d-flex align-items-center gap-2 mb-3">
          <span class="badge tk-badge-indigo">Four-Eye Control</span>
          <span class="text-secondary small">Requires <strong>${escapeHtml(String(m))}</strong> of <strong>${escapeHtml(String(n))}</strong> approvals</span>
        </div>
        ${keys.length > 0 ? `
          <div class="table-responsive">
            <table class="table table-sm table-vcenter mb-0">
              <thead>
                <tr class="text-secondary small text-uppercase">
                  <th class="tk-col-fe-num">#</th>
                  <th class="tk-col-fe-curve">Curve</th>
                  <th>Public Key</th>
                </tr>
              </thead>
              <tbody>${keysHtml}</tbody>
            </table>
          </div>
        ` : `<div class="text-muted small">No approver keys listed.</div>`}
      </div>
    `;
    }

    function renderNotAfter(na) {
        if (!na) return null;
        const unit = String(na.unit || "SECONDS").toUpperCase();
        const raw = na.notAfter;
        if (raw == null) return null;

        const seconds = unit === "MILLISECONDS" ? Math.floor(Number(raw) / 1000) : Math.floor(Number(raw));
        if (!Number.isFinite(seconds) || seconds <= 0) return null;

        const d = new Date(seconds * 1000);
        const expired = Date.now() > d.getTime();
        return {text: d.toLocaleString(), expired};
    }

    function statusMeta(s) {
        const st = String(s || "").toUpperCase();
        if (st === "ACTIVE") return {
            hint: "Allowed operations are available according to the key policy.",
            badge: `<span class="badge bg-green-lt">ACTIVE</span>`,
        };
        if (st === "DISABLED") return {
            hint: "Operations are blocked.",
            badge: `<span class="badge bg-secondary-lt">DISABLED</span>`,
        };
        if (st === "APPLY_EXPIRED") return {
            hint: "Apply operations are blocked. Process operations may still be available.",
            badge: `<span class="badge bg-warning-lt">APPLY EXPIRED</span>`,
        };
        if (st === "EXPIRED") return {
            hint: "All operations are blocked.",
            badge: `<span class="badge bg-danger-lt">EXPIRED</span>`,
        };
        if (st === "DESTROYED") return {
            hint: "Key material has been permanently destroyed.",
            badge: `<span class="badge bg-secondary-lt">DESTROYED</span>`,
        };
        return {
            hint: "",
            badge: `<span class="badge bg-secondary-lt">${escapeHtml(st || "UNKNOWN")}</span>`,
        };
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
                const res = await api.getPublicKey(String(key.logicalId || ""), key.generation ?? null);
                clearAlerts?.();
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

        const targetGen = parseIntSafe(key.generation);
        keyEl.value = String(key.logicalId || "");
        genEl.value = String(targetGen != null ? targetGen : "");
        confirmEl.value = "";
        statusEl.textContent = "";

        if (Number.isFinite(Number(activeGen)) && Number.isFinite(Number(targetGen))) {
            statusEl.textContent = `Active: ${Number(activeGen)} - Target: ${Number(targetGen)}`;
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
            if (Number.isFinite(ag) && Number.isFinite(targetGen) && targetGen > ag - 2) {
                statusEl.textContent = "Forbidden for recent generations.";
                return;
            }

            busy = true;
            submit.disabled = true;
            try {
                await api.destroyKey({keyId: key.logicalId, version: targetGen});
                clearAlerts?.();
                await reload();
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

        if (backdrop && !backdrop.__wired) {
            backdrop.__wired = true;
            backdrop.addEventListener("click", doHide);
        }
        return {show: doShow, hide: doHide};
    }

    async function exportJson() {
        try {
            const snapshot = await collectExportSnapshot();
            const payload = {
                exportedAt: new Date().toISOString(),
                inventory: snapshot.meta,
                items: snapshot.items,
            };
            download(`tkeeper-vault-${timestampForFile()}.json`, JSON.stringify(payload, null, 2), "application/json");
        } catch (e) {
            showAlert("danger", e?.details || e?.message || String(e));
        }
    }

    async function exportCsv() {
        try {
            const snapshot = await collectExportSnapshot();
            const rows = [
                ["logicalId", "status", "generation", "curve", "assetOwner", "authorities", "policy", "createdAt", "updatedAt", "tampered"],
                ...snapshot.items.map((it) => [
                    it?.logicalId ?? "",
                    it?.status ?? "",
                    it?.currentGeneration ?? "",
                    it?.curve ?? "",
                    it?.assetOwner ?? "",
                    extractAuthorities(it).items.map((a) => a.oci ? `${a.id}@${a.oci}` : a.id).join(";"),
                    policyForExport(it?.policy),
                    fmtTime(it?.createdAt),
                    fmtTime(it?.updatedAt),
                    it?.tampered === true ? "true" : "false",
                ]),
            ];

            const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
            download(`tkeeper-vault-${timestampForFile()}.csv`, csv, "text/csv");
        } catch (e) {
            showAlert("danger", e?.details || e?.message || String(e));
        }
    }

    async function collectExportSnapshot() {
        const items = [];
        let exportCursor = null;
        let meta = null;

        lock(true);
        try {
            while (true) {
                const page = await api.getInventory({
                    logicalId: currentFilter,
                    assetOwner: currentOwner,
                    historical: false,
                    lastSeen: exportCursor,
                    limit: 200,
                });

                const inv = page?.inventory;
                if (inv && !meta) {
                    meta = {
                        generatedAt: inv.generatedAt,
                        peerId: inv.peerId,
                        threshold: inv.threshold,
                        totalPeers: inv.totalPeers,
                        filter: currentFilter,
                        assetOwner: currentOwner,
                    };
                }

                items.push(...(Array.isArray(inv?.items) ? inv.items : []));

                exportCursor = page?.nextCursor ?? null;
                if (!page?.hasMore || !exportCursor) break;
            }
        } finally {
            lock(false);
        }

        return {meta: meta ?? lastInventoryMeta, items};
    }

    function download(name, content, type) {
        const blob = new Blob([content], {type});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function csvCell(v) {
        const s = String(v ?? "");
        return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    }

    function policyForExport(policy) {
        if (!policy) return "";
        try {
            return JSON.stringify(policy);
        } catch {
            return String(policy);
        }
    }

    function timestampForFile() {
        return new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
    }

    function tamperedBadgeCell(title, size) {
        return `<td class="text-center">
           <span class="badge tk-badge-danger-solid" title="${escapeHtml(title)}">
             <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
                  stroke-width="2.5" stroke="currentColor" fill="none" aria-hidden="true">
               <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
               <path d="M12 9v2m0 4v.01"/>
               <path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.48 0l-7.1 12.25a2 2 0 0 0 1.84 2.75z"/>
             </svg>
           </span>
         </td>`;
    }

    function tamperedAlert() {
        return `
      <div class="alert alert-danger d-flex gap-2 align-items-start mb-3" role="alert">
        <svg xmlns="http://www.w3.org/2000/svg" class="icon mt-1 flex-shrink-0" width="20" height="20"
             viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M12 9v2m0 4v.01"/>
          <path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.48 0l-7.1 12.25a2 2 0 0 0 1.84 2.75z"/>
        </svg>
        <div>
          <div class="fw-bold">Metadata integrity check failed</div>
          <div class="text-secondary small mt-1">
            This key entry has been flagged as tampered. Inspect system integrity logs before relying on this metadata.
          </div>
        </div>
      </div>
    `;
    }

    function fmtTime(ts) {
        const t = Number(ts);
        if (!Number.isFinite(t) || t <= 0) return "-";
        const ms = t > 1e12 ? t : t * 1000;
        return new Date(ms).toLocaleString();
    }

    function emptyStateHtml(filter, owner) {
        const hint = filter || owner ? "Nothing matched your filters." : "No vault items found.";
        return `
      <div class="empty py-5">
        <div class="empty-img">
          <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24"
               stroke-width="1.5" stroke="currentColor" fill="none">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/>
            <path d="M12 10l-2 2l2 2l2 -2l-2 -2"/>
            <path d="M12 13l0 9"/>
          </svg>
        </div>
        <p class="empty-title">No vault items</p>
        <p class="empty-subtitle text-secondary">${escapeHtml(hint)}</p>
      </div>
    `;
    }

    function parseIntSafe(v) {
        const n = Number(String(v ?? "").trim());
        if (!Number.isFinite(n)) return null;
        return Math.trunc(n);
    }

    function requireDomPurify() {
        const dp = typeof window !== "undefined" ? window.DOMPurify : null;
        if (!dp || typeof dp.sanitize !== "function") {
            throw new Error("DOMPurify is required but not loaded.");
        }
        return dp;
    }

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

    function cssEsc(s) {
        const v = String(s ?? "");
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(v);
        return v.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\A ");
    }
}
