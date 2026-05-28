export async function init({ api, Auth, params }) {
  const text = document.getElementById("tk-unavail-text");
  const refresh = document.getElementById("tk-unavail-refresh");
  const logout = document.getElementById("tk-unavail-logout");

  text.textContent = params?.message || "Not available.";

  refresh.addEventListener("click", async () => {
    try {
      const st = await api.getStatus();
      if (st?.state === "UNINITIALIZED" && Auth.hasPermission("tkeeper.system.init")) {
        location.hash = "#/init";
        return;
      }
      if (st?.state === "SEALED" && Auth.hasPermission("tkeeper.system.unseal")) {
        location.hash = "#/unseal";
        return;
      }
      location.reload();
    } catch {
      location.reload();
    }
  });

  logout.addEventListener("click", () => {
    api.clearToken();
    location.hash = "#/welcome";
    location.reload();
  });
}