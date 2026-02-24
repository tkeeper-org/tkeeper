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

  const els = {
    input: document.getElementById("tk-audit-input"),
    count: document.getElementById("tk-audit-count"),
    verify: document.getElementById("tk-audit-verify"),
    clear: document.getElementById("tk-audit-clear"),
    result: document.getElementById("tk-audit-result"),
  };

  if (!els.input || !els.count || !els.verify || !els.clear || !els.result) {
    showAlert("danger", "Audit page DOM is incomplete (missing element ids).");
    return;
  }

  const canVerify = Auth?.hasPermission?.("tkeeper.audit.log.verify") === true;

  els.verify.disabled = !canVerify;

  els.clear.addEventListener("click", () => {
    els.input.value = "";
    els.result.innerHTML = "";
    updateCount();
  });

  els.input.addEventListener("input", updateCount);
  updateCount();

  els.verify.addEventListener("click", async () => {
    els.result.innerHTML = "";

    if (!canVerify) {
      showAlert("warning", "Access denied.");
      return;
    }

    const parsed = parseNdjson(els.input.value);
    const nonEmptyLines = parsed.nonEmptyLines;

    if (nonEmptyLines === 0) {
      showAlert("warning", "Nothing to verify.");
      return;
    }

    if (parsed.errors.length) {
      els.result.innerHTML = renderParseErrors(parsed.errors);
      return;
    }

    const rows = parsed.rows.slice(0, 1000);
    if (rows.length === 0) {
      showAlert("warning", "No valid entries found.");
      return;
    }

    lock(true);
    try {
      let out;
      if (rows.length === 1) out = await api.verifyAuditLine(rows[0]);
      else out = await api.verifyAuditBatch(rows);

      clearAlerts();
      els.result.innerHTML = renderVerifyResult(out, rows.length);
    } catch (e) {
      showAlert("danger", e?.details || e?.message || String(e));
    } finally {
      lock(false);
    }
  });

  function lock(v) {
    els.verify.disabled = v || !canVerify;
    els.clear.disabled = v;
    els.input.disabled = v;
  }

  function updateCount() {
    const { nonEmptyLines, parseFailures } = countLines(els.input.value);
    const n = Math.min(nonEmptyLines, 1000);
    els.count.textContent = `${n}/1000`;
    els.count.className = parseFailures > 0 ? "text-danger small" : "text-secondary small";
  }

  function countLines(text) {
    const lines = String(text || "").split(/\r?\n/);
    let nonEmptyLines = 0;
    let parseFailures = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      nonEmptyLines++;
      if (nonEmptyLines > 1000) break;

      try { JSON.parse(raw); } catch { parseFailures++; }
    }

    return { nonEmptyLines, parseFailures };
  }

  function parseNdjson(text) {
    const lines = String(text || "").split(/\r?\n/);

    const rows = [];
    const errors = [];
    let nonEmptyLines = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;

      nonEmptyLines++;
      if (nonEmptyLines > 1000) break;

      let obj;
      try {
        obj = JSON.parse(raw);
      } catch (err) {
        errors.push({ line: i + 1, message: err?.message || "Invalid JSON" });
        continue;
      }

      if (!obj || typeof obj !== "object" || !obj.event || !obj.signature) {
        errors.push({ line: i + 1, message: "Missing required fields: event/signature" });
        continue;
      }

      rows.push(obj);
    }

    return { rows, errors, nonEmptyLines };
  }

  function renderParseErrors(errs) {
    const items = errs.slice(0, 50).map(e => `
      <tr>
        <td class="text-secondary" style="width:90px;">#${e.line}</td>
        <td class="font-monospace">${escapeHtml(e.message)}</td>
      </tr>
    `).join("");

    const more = errs.length > 50
      ? `<div class="text-secondary small mt-2">Showing 50/${errs.length} errors.</div>`
      : "";

    return `
      <div class="alert alert-danger" role="alert">Invalid NDJSON. Fix the lines below.</div>
      <div class="card card-sm">
        <div class="table-responsive">
          <table class="table table-vcenter">
            <thead><tr><th>Line</th><th>Error</th></tr></thead>
            <tbody>${items}</tbody>
          </table>
        </div>
      </div>
      ${more}
    `;
  }

  function renderVerifyResult(out, total) {
    if (out && typeof out === "object" && !Array.isArray(out) && typeof out.valid === "boolean" && total === 1) {
      return out.valid
        ? `<div class="alert alert-success" role="alert">Signature is valid.</div>`
        : `<div class="alert alert-danger" role="alert">Signature is invalid.</div>`;
    }

    if (out && typeof out === "object" && !Array.isArray(out)) {
      const entries = Object.entries(out);
      const invalid = entries
        .filter(([, v]) => !(v && v.valid === true))
        .map(([k]) => String(k));

      if (invalid.length === 0) {
        return `<div class="alert alert-success" role="alert">Verified ${entries.length}/${entries.length}.</div>`;
      }

      return renderBatchInvalid(invalid, entries.length);
    }

    return `
      <div class="alert alert-warning" role="alert">Unexpected verification response.</div>
      <pre class="p-3 bg-dark text-white rounded" style="max-height: 360px; overflow:auto;">${escapeHtml(JSON.stringify(out, null, 2))}</pre>
    `;
  }

  function renderBatchInvalid(invalidKeys, totalEntries) {
    const invalidCount = invalidKeys.length;
    const okCount = Math.max(0, totalEntries - invalidCount);

    const state = {
      page: 1,
      perPage: 50,
      keys: invalidKeys,
      total: invalidCount,
    };

    const id = `tk-audit-batch-${Math.random().toString(16).slice(2)}`;
    setTimeout(() => wireBatchPagination(id, state), 0);

    return `
      <div class="alert alert-danger" role="alert">${okCount} valid, ${invalidCount} invalid.</div>

      <div class="card card-sm" id="${id}">
        <div class="card-body">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
            <div class="text-secondary small">
              Showing <span data-from></span>–<span data-to></span> of <span class="fw-semibold">${invalidCount}</span> invalid entries
            </div>
            <div class="d-flex align-items-center gap-2">
              <button class="btn btn-outline-secondary btn-sm" type="button" data-prev>Prev</button>
              <div class="text-secondary small">Page <span data-page></span>/<span data-pages></span></div>
              <button class="btn btn-outline-secondary btn-sm" type="button" data-next>Next</button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="table table-vcenter">
              <thead>
                <tr>
                  <th style="width:70%;">Entry</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody data-tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function wireBatchPagination(containerId, state) {
    const root = document.getElementById(containerId);
    if (!root) return;

    const tbody = root.querySelector("[data-tbody]");
    const prev = root.querySelector("[data-prev]");
    const next = root.querySelector("[data-next]");
    const fromEl = root.querySelector("[data-from]");
    const toEl = root.querySelector("[data-to]");
    const pageEl = root.querySelector("[data-page]");
    const pagesEl = root.querySelector("[data-pages]");

    const pages = Math.max(1, Math.ceil(state.total / state.perPage));

    const render = () => {
      const start = (state.page - 1) * state.perPage;
      const end = Math.min(state.total, start + state.perPage);
      const slice = state.keys.slice(start, end);

      fromEl.textContent = String(state.total === 0 ? 0 : start + 1);
      toEl.textContent = String(end);
      pageEl.textContent = String(state.page);
      pagesEl.textContent = String(pages);

      prev.disabled = state.page <= 1;
      next.disabled = state.page >= pages;

      tbody.innerHTML = slice.map(k => `
        <tr>
          <td class="font-monospace">${escapeHtml(k)}</td>
          <td><span class="badge bg-danger-lt">INVALID</span></td>
        </tr>
      `).join("");
    };

    prev.addEventListener("click", () => { if (state.page > 1) { state.page--; render(); } });
    next.addEventListener("click", () => { if (state.page < pages) { state.page++; render(); } });

    render();
  }
}
