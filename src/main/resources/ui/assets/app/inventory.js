export async function init({api, Auth, showAlert, clearAlerts}) {
    if (!Auth?.hasPermission?.("tkeeper.compliance.inventory")) {
        showAlert("warning", "Access denied.");
        return;
    }

    function requireDomPurify() {
        const dp = typeof window !== "undefined" ? window.DOMPurify : null;
        if (!dp || typeof dp.sanitize !== "function") {
            throw new Error("DOMPurify is required but not loaded.");
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

    const needIds = [
        "tk-inv-generated",
        "tk-inv-refresh",
        "tk-inv-filter",
        "tk-inv-owner",
        "tk-inv-apply",
        "tk-inv-clear",
        "tk-inv-foot",
        "tk-inv-list",
        "tk-inv-more",
    ];
    for (const id of needIds) {
        if (!document.getElementById(id)) {
            showAlert("danger", `Inventory UI mismatch (missing #${id}). Hard refresh / clear cache.`);
            return;
        }
    }

    const els = {
        generated: document.getElementById("tk-inv-generated"),
        refresh: document.getElementById("tk-inv-refresh"),
        filter: document.getElementById("tk-inv-filter"),
        owner: document.getElementById("tk-inv-owner"),
        apply: document.getElementById("tk-inv-apply"),
        clear: document.getElementById("tk-inv-clear"),
        foot: document.getElementById("tk-inv-foot"),
        list: document.getElementById("tk-inv-list"),
        more: document.getElementById("tk-inv-more"),
    };

    let cursor = null;
    let hasMore = false;
    let currentFilter = null;
    let currentOwner = null;
    let loading = false;
    let totalLoaded = 0;

    els.refresh.addEventListener("click", () => reload());

    els.apply.addEventListener("click", () => {
        currentFilter = String(els.filter.value || "").trim() || null;
        currentOwner = String(els.owner.value || "").trim() || null;
        reload();
    });

    els.clear.addEventListener("click", () => {
        els.filter.value = "";
        els.owner.value = "";
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

    els.more.addEventListener("click", async () => {
        if (!hasMore || loading) return;
        await loadPage({append: true});
    });

    await reload();

    async function reload() {
        cursor = null;
        hasMore = false;
        totalLoaded = 0;

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
              <th>Policy</th>
              <th class="tk-col-date">Updated</th>
              <th class="tk-col-toggle"></th>
            </tr>
          </thead>
          <tbody id="tk-inv-tbody"></tbody>
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
                historical: false,
                lastSeen: cursor,
                limit: 200,
            });

            const inv = page?.inventory;
            if (!inv) {
                showAlert("danger", "Inventory payload is missing.");
                return;
            }

            els.generated.textContent = inv.generatedAt ? fmtTime(inv.generatedAt) : "";

            let items = Array.isArray(inv.items) ? inv.items : [];

            if (currentOwner) {
                const q = currentOwner.toLowerCase();
                items = items.filter((it) => String(it?.assetOwner || "").toLowerCase().includes(q));
            }

            const tbody = document.getElementById("tk-inv-tbody");
            if (!tbody) {
                showAlert("danger", "Table not initialized.");
                return;
            }

            if (!append) tbody.innerHTML = "";

            if (items.length === 0 && !append) {
                tbody.innerHTML = `
          <tr>
            <td colspan="9" class="p-0">
              ${emptyStateHtml(currentFilter, currentOwner)}
            </td>
          </tr>
        `;
            } else {
                for (const it of items) {
                    tbody.insertAdjacentHTML("beforeend", renderItemRow(it));
                }
                totalLoaded += items.length;
            }

            cursor = page?.nextCursor ?? null;
            hasMore = !!page?.hasMore;

            els.more.classList.toggle("d-none", !hasMore);
            els.foot.textContent = totalLoaded > 0
                ? `${totalLoaded} item${totalLoaded !== 1 ? "s" : ""} loaded${hasMore ? " — more available" : " — end of list"}.`
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

        const icon = els.refresh.querySelector(".tk-inv-refresh-icon");
        if (icon) icon.classList.toggle("tk-spin", !!v);

        if (v) els.refresh.setAttribute("aria-busy", "true");
        else els.refresh.removeAttribute("aria-busy");
    }

    function wireInteractions(root) {
        root.querySelectorAll("[data-inv-toggle]").forEach((btn) => {
            if (btn.__wired) return;
            btn.__wired = true;

            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-inv-toggle");
                const detRow = document.getElementById(`tk-invd-${cssEsc(id)}`);
                if (!detRow) return;

                const isOpen = !detRow.classList.contains("d-none");
                detRow.classList.toggle("d-none", isOpen);
                btn.setAttribute("aria-expanded", String(!isOpen));

                // Rotate chevron via .is-open class — no inline style (CSP-safe)
                const chevron = btn.querySelector(".tk-inv-toggle-icon");
                if (chevron) chevron.classList.toggle("is-open", !isOpen);
            });
        });

        root.querySelectorAll("[data-inv-hist]").forEach((btn) => {
            if (btn.__wired) return;
            btn.__wired = true;

            btn.addEventListener("click", async () => {
                const logicalId = btn.getAttribute("data-inv-hist");
                const host = root.querySelector(`[data-inv-histbox="${cssEsc(logicalId)}"]`);
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
    }

    async function loadHistorical(host, logicalId) {
        host.innerHTML = `
      <div class="card card-sm mt-3 border-0 bg-light">
        <div class="card-body py-3">
          <div class="d-flex align-items-center gap-2 text-secondary">
            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
            <span class="small">Loading historical generations…</span>
          </div>
        </div>
      </div>
    `;

        let hCursor = null;
        let hHasMore = false;

        const state = {
            page: 1,
            perPage: 10,
            rows: [],
        };

        const renderTable = () => {
            const total = state.rows.length;
            const pages = Math.max(1, Math.ceil(total / state.perPage));
            state.page = Math.min(state.page, pages);

            const start = (state.page - 1) * state.perPage;
            const slice = state.rows.slice(start, start + state.perPage);
            const anyTamp = state.rows.some((r) => r?.tampered === true);

            // SVG pagination arrows — proper icons, CSP-safe
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
              <span class="text-secondary small">
                Page ${escapeHtml(String(state.page))} / ${escapeHtml(String(pages))}
              </span>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary d-inline-flex align-items-center justify-content-center"
                        type="button" data-hprev
                        ${state.page <= 1 ? "disabled" : ""}
                        aria-label="Previous page">
                  ${svgPrev}
                </button>
                <button class="btn btn-outline-secondary d-inline-flex align-items-center justify-content-center"
                        type="button" data-hnext
                        ${state.page >= pages ? "disabled" : ""}
                        aria-label="Next page">
                  ${svgNext}
                </button>
              </div>
              <button class="btn btn-sm btn-outline-primary" type="button" data-hmore
                      ${!hHasMore ? "disabled" : ""}>
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
                  <th>Policy</th>
                  <th class="tk-col-h-date">Created</th>
                  <th class="tk-col-h-date">Updated</th>
                </tr>
              </thead>
              <tbody>
                ${slice.length
                ? slice.map(renderHistoricalRow).join("")
                : `<tr><td colspan="7" class="text-secondary text-center py-3">No records.</td></tr>`
            }
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
                    btn.textContent = "Loading…";
                }
                await fetchMore();
            });
        };

        const fetchMore = async () => {
            const page = await api.getInventory({
                logicalId: logicalId,
                historical: true,
                lastSeen: hCursor,
                limit: 200,
            });

            const inv = page?.inventory;
            const items = Array.isArray(inv?.items) ? inv.items : [];

            state.rows.push(...items);

            hCursor = page?.nextCursor ?? null;
            hHasMore = !!page?.hasMore;

            if (state.page < 1) state.page = 1;
            renderTable();
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
        const curve = it.curve ? String(it.curve) : "—";
        const gen = it.currentGeneration == null ? "—" : String(it.currentGeneration);
        const pending = it.lastPendingGeneration == null ? "—" : String(it.lastPendingGeneration);
        const updated = fmtTime(it.updatedAt);
        const created = fmtTime(it.createdAt);
        const owner = it.assetOwner?.trim() || null;
        const tampered = it.tampered === true;
        const detId = `tk-invd-${logicalId}`;

        const genCell = pending !== "—"
            ? `<span class="fw-semibold">${escapeHtml(gen)}</span> <span class="text-muted small">/ ${escapeHtml(pending)}</span>`
            : `<span class="fw-semibold">${escapeHtml(gen)}</span>`;

        const tamperedCell = tampered
            ? `<td class="text-center">
           <span class="badge tk-badge-danger-solid" title="Metadata integrity check failed">
             <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                  stroke-width="2.5" stroke="currentColor" fill="none" aria-hidden="true">
               <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
               <path d="M12 9v2m0 4v.01"/>
               <path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.48 0l-7.1 12.25a2 2 0 0 0 1.84 2.75z"/>
             </svg>
           </span>
         </td>`
            : `<td></td>`;

        const chevronSvg = `
      <svg xmlns="http://www.w3.org/2000/svg"
           class="icon icon-sm tk-inv-toggle-icon"
           width="18" height="18" viewBox="0 0 24 24"
           stroke-width="2" stroke="currentColor" fill="none"
           aria-hidden="true">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M6 9l6 6l6 -6"/>
      </svg>
    `;

        const mainRow = `
      <tr data-inv-row="${escapeHtml(logicalId)}"
          class="${tampered ? "table-danger tk-row-tampered" : ""}">
        ${tamperedCell}
        <td class="tk-td-keyid">
          <span class="font-monospace fw-semibold text-truncate d-block"
                title="${escapeHtml(logicalId)}">${escapeHtml(logicalId)}</span>
        </td>
        <td>${status.badge}</td>
        <td class="text-secondary">${escapeHtml(curve)}</td>
        <td>${genCell}</td>
        <td class="text-secondary">
          ${owner
            ? `<span class="text-truncate d-block tk-td-owner-cell"
                     title="${escapeHtml(owner)}">${escapeHtml(owner)}</span>`
            : `<span class="text-muted">—</span>`}
        </td>
        <td>${renderPolicySummary(it.policy)}</td>
        <td class="text-secondary small text-nowrap">${escapeHtml(updated)}</td>
        <td class="text-center">
          <button class="btn btn-ghost-secondary tk-inv-toggle-btn"
                  type="button"
                  data-inv-toggle="${escapeHtml(logicalId)}"
                  aria-expanded="false"
                  aria-label="Toggle details"
                  title="Toggle details">
            ${chevronSvg}
          </button>
        </td>
      </tr>
    `;

        const detailRow = `
      <tr id="${escapeHtml(detId)}"
          class="d-none ${tampered ? "tk-row-tampered-detail" : ""}">
        <td colspan="9" class="p-0 border-0">
          <div class="p-3 p-md-4 bg-light border-bottom">

            ${tampered ? `
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
                    This key entry has been flagged as tampered.
                    Inspect system integrity logs immediately and do not rely on this key's policy data until verified.
                  </div>
                </div>
              </div>
            ` : ""}

            <div class="row g-3 mb-3">
              <div class="col-12 col-md-4">
                <div class="card card-sm h-100 border">
                  <div class="card-body">
                    <div class="text-muted small text-uppercase fw-semibold mb-2">Status</div>
                    <div class="mb-1">${status.badge}</div>
                    ${status.hint ? `<div class="text-secondary small mt-1">${escapeHtml(status.hint)}</div>` : ""}
                  </div>
                </div>
              </div>

              <div class="col-12 col-md-4">
                <div class="card card-sm h-100 border">
                  <div class="card-body">
                    <div class="text-muted small text-uppercase fw-semibold mb-2">Timestamps</div>
                    <div class="d-flex justify-content-between align-items-baseline gap-2 mb-1">
                      <span class="text-secondary small">Created</span>
                      <span class="fw-semibold small text-nowrap">${escapeHtml(created)}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-baseline gap-2">
                      <span class="text-secondary small">Updated</span>
                      <span class="fw-semibold small text-nowrap">${escapeHtml(updated)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-12 col-md-4">
                <div class="card card-sm h-100 border">
                  <div class="card-body">
                    <div class="text-muted small text-uppercase fw-semibold mb-2">Asset Owner</div>
                    ${owner
            ? `<div class="fw-semibold font-monospace small">${escapeHtml(owner)}</div>`
            : `<div class="text-secondary small">Not assigned</div>`}
                  </div>
                </div>
              </div>
            </div>

            <div class="card border mb-3">
              <div class="card-body">
                <div class="text-muted small text-uppercase fw-semibold mb-3">Access Policy</div>
                ${it.policy
            ? renderPolicy(it.policy)
            : `<span class="text-secondary small">No policy configured.</span>`}
              </div>
            </div>

            <div>
              <button class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2"
                      type="button"
                      data-inv-hist="${escapeHtml(logicalId)}">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16"
                     viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" aria-hidden="true">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <path d="M12 8l0 4l2 2"/>
                  <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/>
                </svg>
                <span class="tk-hist-label">View historical generations</span>
              </button>
              <div class="d-none" data-inv-histbox="${escapeHtml(logicalId)}"></div>
            </div>

          </div>
        </td>
      </tr>
    `;

        return mainRow + detailRow;
    }

    function renderHistoricalRow(it) {
        const status = statusMeta(it.status);
        const tampered = it.tampered === true;
        const curve = it.curve ? String(it.curve) : "—";
        const gen = it.currentGeneration == null ? "—" : String(it.currentGeneration);

        const tamperedCell = tampered
            ? `<td class="text-center">
           <span class="badge tk-badge-danger-solid" title="Tampered">
             <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
                  stroke-width="3" stroke="currentColor" fill="none" aria-hidden="true">
               <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
               <path d="M12 9v2m0 4v.01"/>
               <path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.48 0l-7.1 12.25a2 2 0 0 0 1.84 2.75z"/>
             </svg>
           </span>
         </td>`
            : `<td></td>`;

        return `
      <tr class="${tampered ? "table-danger" : ""}">
        ${tamperedCell}
        <td>${status.badge}</td>
        <td class="fw-semibold">${escapeHtml(gen)}</td>
        <td class="text-secondary">${escapeHtml(curve)}</td>
        <td>${it.policy ? renderPolicySummary(it.policy) : `<span class="text-muted">—</span>`}</td>
        <td class="text-secondary small text-nowrap">${escapeHtml(fmtTime(it.createdAt))}</td>
        <td class="text-secondary small text-nowrap">${escapeHtml(fmtTime(it.updatedAt))}</td>
      </tr>
    `;
    }

    function renderPolicySummary(p) {
        if (!p) return `<span class="text-muted">—</span>`;

        const badges = [];

        if (p.allowHistoricalProcess === false)
            badges.push(`<span class="badge tk-badge-danger-solid" title="Historical operations blocked">No historical</span>`);

        const apply = renderNotAfter(p.apply);
        if (apply) {
            badges.push(apply.expired
                ? `<span class="badge bg-danger-lt" title="Apply notAfter: ${escapeHtml(apply.text)}">Apply expired</span>`
                : `<span class="badge bg-warning-lt" title="Apply notAfter: ${escapeHtml(apply.text)}">Apply limit</span>`
            );
        }

        const process = renderNotAfter(p.process);
        if (process) {
            badges.push(process.expired
                ? `<span class="badge bg-danger-lt" title="Process notAfter: ${escapeHtml(process.text)}">Process expired</span>`
                : `<span class="badge bg-warning-lt" title="Process notAfter: ${escapeHtml(process.text)}">Process limit</span>`
            );
        }

        if (p.fourEye) {
            const m = Number(p.fourEye.m ?? 0);
            const n = Number(p.fourEye.n ?? 0);
            badges.push(
                `<span class="badge bg-warning-lt"
               title="${escapeHtml(String(m))}/${escapeHtml(String(n))} approvals required">
          4-eye ${escapeHtml(String(m))}/${escapeHtml(String(n))}
         </span>`
            );
        }

        return badges.length
            ? `<div class="d-flex flex-wrap gap-1">${badges.join("")}</div>`
            : `<span class="text-muted">—</span>`;
    }

    function renderPolicy(p) {
        const allow = p.allowHistoricalProcess !== false;
        const apply = renderNotAfter(p.apply);
        const process = renderNotAfter(p.process);

        return `
      <div class="row g-3">
        <div class="col-6 col-md-3">
          <div class="text-muted small mb-1">Historical operations</div>
          <div>
            ${allow
            ? `<span class="badge bg-green-lt">Allowed</span>`
            : `<span class="badge tk-badge-danger-solid">Blocked</span>`}
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="text-muted small mb-1">Apply not after</div>
          <div class="fw-semibold small">
            ${apply
            ? (apply.expired
                ? `<span class="text-danger">${escapeHtml(apply.text)}</span>
                     <span class="badge bg-danger-lt ms-1">Expired</span>`
                : escapeHtml(apply.text))
            : `<span class="text-muted">No limit</span>`}
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="text-muted small mb-1">Process not after</div>
          <div class="fw-semibold small">
            ${process
            ? (process.expired
                ? `<span class="text-danger">${escapeHtml(process.text)}</span>
                     <span class="badge bg-danger-lt ms-1">Expired</span>`
                : escapeHtml(process.text))
            : `<span class="text-muted">No limit</span>`}
          </div>
        </div>
      </div>

      ${p.fourEye ? renderFourEyePolicy(p.fourEye) : ""}
    `;
    }

    function renderFourEyePolicy(fe) {
        const m = Number(fe.m ?? 0);
        const n = Number(fe.n ?? 0);
        const keys = Array.isArray(fe.keys) ? fe.keys : [];

        const keysHtml = keys.map((k, i) => `
      <tr>
        <td class="tk-col-fe-num text-secondary">${escapeHtml(String(i + 1))}</td>
        <td class="tk-col-fe-curve">
          <span class="badge bg-secondary-lt">${escapeHtml(String(k.curve || "—"))}</span>
        </td>
        <td class="font-monospace small tk-td-pubkey"
            title="${escapeHtml(String(k.publicKey64 || ""))}">
          ${escapeHtml(String(k.publicKey64 || "—"))}
        </td>
      </tr>
    `).join("");

        return `
      <div class="mt-3 pt-3 border-top">
        <div class="d-flex align-items-center gap-2 mb-3">
          <span class="badge tk-badge-indigo">Four-Eye Control</span>
          <span class="text-secondary small">
            Requires <strong>${escapeHtml(String(m))}</strong>
            of <strong>${escapeHtml(String(n))}</strong> approvals
          </span>
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
            label: "Active",
            hint: "All allowed operations are available.",
            badge: `<span class="badge bg-green-lt">ACTIVE</span>`
        };
        if (st === "DISABLED") return {
            label: "Disabled",
            hint: "Operations are blocked.",
            badge: `<span class="badge bg-secondary-lt">DISABLED</span>`
        };
        if (st === "APPLY_EXPIRED") return {
            label: "Process-only",
            hint: "Apply operations blocked. Process operations may still be available.",
            badge: `<span class="badge bg-warning-lt">APPLY EXPIRED</span>`
        };
        if (st === "EXPIRED") return {
            label: "Expired",
            hint: "All operations blocked.",
            badge: `<span class="badge bg-danger-lt">EXPIRED</span>`
        };
        if (st === "DESTROYED") return {
            label: "Destroyed",
            hint: "Key material has been permanently destroyed.",
            badge: `<span class="badge bg-secondary-lt">DESTROYED</span>`
        };
        return {
            label: st || "Unknown",
            hint: "",
            badge: `<span class="badge bg-secondary-lt">${escapeHtml(st || "UNKNOWN")}</span>`,
        };
    }

    function fmtTime(ts) {
        const t = Number(ts);
        if (!Number.isFinite(t) || t <= 0) return "—";
        const ms = t > 1e12 ? t : t * 1000;
        return new Date(ms).toLocaleString();
    }

    function emptyStateHtml(filter, owner) {
        const hint = filter || owner ? "Nothing matched your filters." : "No inventory items found.";
        return `
      <div class="empty py-5">
        <div class="empty-img">
          <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24"
               stroke-width="1.5" stroke="currentColor" fill="none">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
            <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
            <path d="M9 14l2 2l4 -4" />
          </svg>
        </div>
        <p class="empty-title">No inventory items</p>
        <p class="empty-subtitle text-secondary">${escapeHtml(hint)}</p>
      </div>
    `;
    }

    function cssEsc(s) {
        const v = String(s ?? "");
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(v);
        return v.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\A ");
    }
}