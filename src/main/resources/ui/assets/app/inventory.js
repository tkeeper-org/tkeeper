export async function init({ api, Auth, showAlert, clearAlerts }) {
  if (!Auth?.hasPermission?.("tkeeper.compliance.inventory")) {
    showAlert("warning", "Access denied.");
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

  els.refresh.addEventListener("click", () => reload());
  els.apply.addEventListener("click", () => {
    const v = String(els.filter.value || "").trim();
    currentFilter = v || null;

    const o = String(els.owner.value || "").trim();
    currentOwner = o || null;

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
    await loadPage({ append: true });
  });

  await reload();

  async function reload() {
    cursor = null;
    hasMore = false;
    els.list.innerHTML = "";
    els.more.classList.add("d-none");
    els.foot.textContent = "";
    await loadPage({ append: false });
  }

  async function loadPage({ append }) {
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
        const q = String(currentOwner).toLowerCase();
        items = items.filter(it => String(it?.assetOwner || "").toLowerCase().includes(q));
      }
      const html = items.map(renderItemCard).join("");

      if (append) els.list.insertAdjacentHTML("beforeend", html);
      else els.list.innerHTML = html || emptyStateHtml(currentFilter, currentOwner);

      cursor = page?.nextCursor ?? null;
      hasMore = !!page?.hasMore;

      els.more.classList.toggle("d-none", !hasMore);
      els.foot.textContent = hasMore ? "" : "End of list.";

      wireCards(els.list);
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

  function wireCards(root) {
    const byAttr = (attr, value) => {
      const nodes = root.querySelectorAll(`[${attr}]`);
      for (const n of nodes) {
        if (n.getAttribute(attr) === value) return n;
      }
      return null;
    };

    root.querySelectorAll("[data-inv-toggle]").forEach(btn => {
      if (btn.__wired) return;
      btn.__wired = true;

      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-inv-toggle");
        const body = byAttr("data-inv-body", id);
        if (!body) return;

        const visible = !body.classList.contains("d-none");
        body.classList.toggle("d-none");
        btn.textContent = visible ? "Details" : "Hide details";
      });
    });

    root.querySelectorAll("[data-inv-hist]").forEach(btn => {
      if (btn.__wired) return;
      btn.__wired = true;

      btn.addEventListener("click", async () => {
        const logicalId = btn.getAttribute("data-inv-hist");
        const host = byAttr("data-inv-histbox", logicalId);
        if (!host) return;

        const becameVisible = host.classList.toggle("d-none") === false;
        btn.textContent = becameVisible ? "Hide historical" : "View historical";

        if (!becameVisible) return;
        if (host.getAttribute("data-loaded") === "true") return;

        host.setAttribute("data-loaded", "true");
        await loadHistorical(host, logicalId);
      });
    });
  }

  async function loadHistorical(host, logicalId) {
    host.innerHTML = `<div class="text-secondary small">Loading…</div>`;

    let hCursor = null;
    let hHasMore = false;

    const state = {
      page: 1,
      perPage: 50,
      rows: [],
    };

    const render = () => {
      const total = state.rows.length;
      const pages = Math.max(1, Math.ceil(total / state.perPage));
      state.page = Math.min(state.page, pages);

      const start = (state.page - 1) * state.perPage;
      const end = Math.min(total, start + state.perPage);
      const slice = state.rows.slice(start, end);

      const anyTampered = state.rows.some(r => r && r.tampered === true);
      host.innerHTML = `
        <div class="card card-sm mt-3">
          <div class="card-body">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
              <div class="fw-semibold">Historical generations</div>
              <div class="d-flex align-items-center gap-2">
                <div class="text-secondary small">Page ${escapeHtml(String(state.page || 0))}/${escapeHtml(String(pages || 0))}</div>
                <button class="btn btn-outline-secondary btn-sm" type="button" data-hprev ${state.page <= 1 ? "disabled" : ""}>Prev</button>
                <button class="btn btn-outline-secondary btn-sm" type="button" data-hnext ${state.page >= pages ? "disabled" : ""}>Next</button>
                <button class="btn btn-outline-primary btn-sm" type="button" data-hmore ${hHasMore ? "" : "disabled"}>${hHasMore ? "Load more" : "No more"}</button>
              </div>
            </div>

            <div class="table-responsive">
              <table class="table table-vcenter">
                <thead>
                  <tr class="${anyTampered ? "table-danger" : ""}">
                    <th>Status</th>
                    <th>Generation</th>
                    <th>Curve</th>
                    <th>Created</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    slice.length
                      ? slice.map(renderHistoricalRow).join("")
                      : `<tr><td colspan="5" class="text-secondary">No records.</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      host.querySelector("[data-hprev]")?.addEventListener("click", () => { state.page--; render(); });
      host.querySelector("[data-hnext]")?.addEventListener("click", () => { state.page++; render(); });
      host.querySelector("[data-hmore]")?.addEventListener("click", async () => {
        await fetchMore();
      });
    };

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

      if (state.page === 0) state.page = 1;
      render();
    };

    try {
      await fetchMore();
    } catch (e) {
      host.innerHTML = `<div class="alert alert-danger" role="alert">${escapeHtml(e?.details || e?.message || String(e))}</div>`;
    }
  }

  function renderItemCard(it) {
    const logicalId = String(it.logicalId || "");
    const status = statusMeta(it.status);
    const curve = it.curve ? String(it.curve) : "—";

    const gen = it.currentGeneration == null ? "—" : String(it.currentGeneration);
    const pending = it.lastPendingGeneration == null ? "—" : String(it.lastPendingGeneration);

    const created = fmtTime(it.createdAt);
    const updated = fmtTime(it.updatedAt);

    const policy = it.policy ? renderPolicy(it.policy) : `<span class="text-secondary">No policy</span>`;
    const tampered = it.tampered === true;

    const owner = it.assetOwner != null && String(it.assetOwner).trim() !== "" ? String(it.assetOwner) : null;

    const tamperedBadge = tampered ? ` <span class="badge bg-danger ms-2">Meta tampered</span>` : "";
    const tamperedNote = tampered ? `
      <div class="alert alert-danger mt-3 mb-0" role="alert">
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <div class="fw-semibold">Meta is tampered.</div>
          <div class="text-secondary">Check system logs for integrity verification details.</div>
        </div>
      </div>
    ` : "";

    const pills = `
      <div class="d-flex flex-wrap tk-inv-pills text-secondary small mt-2">
        <span class="tk-inv-pill"><span class="badge bg-azure-lt">Curve</span> <span class="fw-semibold">${escapeHtml(curve)}</span></span>
        <span class="tk-inv-pill"><span class="badge bg-indigo-lt">Gen</span> <span class="fw-semibold">${escapeHtml(gen)}</span></span>
        <span class="tk-inv-pill"><span class="badge bg-cyan-lt">Pending</span> <span class="fw-semibold">${escapeHtml(pending)}</span></span>
        ${
          owner
            ? `<span class="tk-inv-pill"><span class="badge bg-teal-lt">Owner</span> <span class="fw-semibold">${escapeHtml(owner)}</span></span>`
            : ""
        }
      </div>
    `;

    return `
      <div class="card mb-3 ${tampered ? "border-danger" : ""}">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-start justify-content-between gap-3">
            <div class="tk-inv-item-head">
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <div class="fw-semibold font-monospace text-truncate tk-inv-kid" title="${escapeHtml(logicalId)}">${escapeHtml(logicalId)}</div>
                ${status.badge}${tamperedBadge}
              </div>
              ${pills}
            </div>

            <div class="d-flex align-items-center gap-2">
              <button class="btn btn-outline-secondary btn-sm" type="button" data-inv-toggle="${escapeHtml(logicalId)}">Details</button>
            </div>
          </div>

          <div class="mt-3 pt-3 border-top d-none" data-inv-body="${escapeHtml(logicalId)}">
            ${tamperedNote}
            <div class="row g-3">
              <div class="col-12 col-xl-5">
                <div class="card card-sm">
                  <div class="card-body">
                    <div class="text-secondary mb-1">Status</div>
                    <div class="fw-semibold">${escapeHtml(status.label)}</div>
                    <div class="text-secondary mt-1">${escapeHtml(status.hint)}</div>
                  </div>
                </div>
              </div>

              <div class="col-12 col-xl-7">
                <div class="card card-sm">
                  <div class="card-body">
                    <div class="text-secondary mb-2">Timestamps</div>
                    <div class="d-flex justify-content-between">
                      <span class="text-secondary">Created</span>
                      <span class="fw-semibold">${escapeHtml(created)}</span>
                    </div>
                    <div class="d-flex justify-content-between mt-1">
                      <span class="text-secondary">Updated</span>
                      <span class="fw-semibold">${escapeHtml(updated)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-12">
                <div class="card card-sm">
                  <div class="card-body">
                    <div class="text-secondary mb-2">Policy</div>
                    ${policy}
                  </div>
                </div>
              </div>

              <div class="col-12 d-flex flex-wrap gap-2">
                <button class="btn btn-outline-primary btn-sm" type="button" data-inv-hist="${escapeHtml(logicalId)}">View historical</button>
              </div>

              <div class="col-12 d-none" data-inv-histbox="${escapeHtml(logicalId)}"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderHistoricalRow(it) {
    const status = statusMeta(it.status);

    const tampered = it.tampered === true;
const curve = it.curve ? String(it.curve) : "—";
    const gen = it.currentGeneration == null ? "—" : String(it.currentGeneration);

    return `
      <tr>
        <td>${status.badge}${tampered ? ` <span class="badge bg-danger ms-2">Tampered</span>` : ""}</td>
        <td class="fw-semibold">${escapeHtml(gen)}</td>
        <td>${escapeHtml(curve)}</td>
        <td class="text-secondary">${escapeHtml(fmtTime(it.createdAt))}</td>
        <td class="text-secondary">${escapeHtml(fmtTime(it.updatedAt))}</td>
      </tr>
    `;
  }

  function renderPolicy(p) {
    const allow = p.allowHistoricalProcess !== false;
    const apply = renderNotAfter(p.apply);
    const process = renderNotAfter(p.process);

    const warnA = allow ? "" : `<span class="badge bg-danger-lt ms-2">Historical disabled</span>`;
    const warnP = process && process.expired ? `<span class="badge bg-danger-lt ms-2">Expired</span>` : "";

    return `
      <div class="row g-2">
        <div class="col-12 col-lg-4">
          <div class="text-secondary">Allow historical process</div>
          <div class="fw-semibold">${allow ? "Yes" : "No"} ${warnA}</div>
        </div>
        <div class="col-12 col-lg-4">
          <div class="text-secondary">Apply NotAfter</div>
          <div class="fw-semibold">${apply ? escapeHtml(apply.text) : "—"}</div>
        </div>
        <div class="col-12 col-lg-4">
          <div class="text-secondary">Process NotAfter</div>
          <div class="fw-semibold">${process ? escapeHtml(process.text) : "—"} ${warnP}</div>
        </div>
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
    return { text: d.toLocaleString(), expired };
  }

  function statusMeta(s) {
    const st = String(s || "").toUpperCase();
    if (st === "ACTIVE") return {
      label: "Active",
      hint: "All allowed operations are available.",
      badge: `<span class="badge bg-green-lt">ACTIVE</span>`,
    };
    if (st === "DISABLED") return {
      label: "Disabled",
      hint: "Operations are blocked.",
      badge: `<span class="badge bg-secondary-lt">DISABLED</span>`,
    };
    if (st === "APPLY_EXPIRED") return {
      label: "Process-only",
      hint: "Apply operations are not allowed. Process operations may still be possible.",
      badge: `<span class="badge bg-warning-lt">APPLY_EXPIRED</span>`,
    };
    if (st === "EXPIRED") return {
      label: "Expired",
      hint: "Operations are not allowed.",
      badge: `<span class="badge bg-danger-lt">EXPIRED</span>`,
    };
    if (st === "DESTROYED") return {
      label: "Destroyed",
      hint: "Key material has been destroyed.",
      badge: `<span class="badge bg-dark-lt">DESTROYED</span>`,
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
    const hint = filter || owner ? "Nothing matched your filter." : "No items returned.";
    return `
      <div class="empty">
        <div class="empty-img">
          <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
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
