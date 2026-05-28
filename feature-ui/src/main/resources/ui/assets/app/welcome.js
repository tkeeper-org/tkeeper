export async function init({ Auth }) {
  const authed = document.getElementById("tk-welcome-authed");
  const login = document.getElementById("tk-welcome-login");
  const subj = document.getElementById("tk-welcome-subject");

  if (Auth.subject) {
    login.classList.add("d-none");
    authed.classList.remove("d-none");
    subj.textContent = Auth.subject || "Unknown";
  } else {
    authed.classList.add("d-none");
    login.classList.remove("d-none");
  }
}