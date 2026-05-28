import { api, ApiError } from "../app/api.js";
import { Auth } from "../app/auth.js";

export async function init({ showAlert, setTitle }) {
  setTitle("Signing in");
  await api.initAuth().catch(() => {});

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const err = params.get("error");
  const errDesc = params.get("error_description");

  if (err) {
    showAlert("danger", `${err}${errDesc ? `: ${errDesc}` : ""}`);
    return;
  }
  if (!code) {
    showAlert("danger", "Missing authorization code.");
    return;
  }

  const saved = api.oidc.loadPkce();
  if (!saved?.verifier || !saved?.state || !saved?.cfg) {
    showAlert("danger", "OIDC session missing or expired. Start login again.");
    return;
  }
  if (saved.state !== state) {
    api.oidc.clearPkce();
    showAlert("danger", "OIDC state mismatch.");
    return;
  }

  try {
    const disc = await api.oidc.discover(saved.cfg.discoveryUrl);
    if (!disc?.token_endpoint) throw new Error("Discovery missing token_endpoint");

    const tok = await api.oidc.exchangeCode({
      tokenEndpoint: disc.token_endpoint,
      clientId: saved.cfg.clientId,
      code,
      verifier: saved.verifier,
      callbackUrl: saved.cfg.callbackUrl,
    });

    const accessToken = tok?.access_token;
    if (!accessToken) throw new Error("OIDC did not return access_token.");

    api.setToken(accessToken);
    api.oidc.clearPkce();

    await Auth.load();
    window.dispatchEvent(new Event("tkeeper:auth-changed"));

    window.history.replaceState({}, document.title, "/ui/#/welcome");
    window.location.reload();
  } catch (e) {
    api.clearToken();
    api.oidc.clearPkce();
    showAlert("danger", errMsg(e));
  }
}

function errMsg(e) {
  if (e instanceof ApiError) return e.details || e.message;
  return e?.message || String(e);
}