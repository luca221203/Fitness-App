// App-Bootstrap: Service-Worker-Registrierung + Tab-Navigation.

const VIEWS = {
  dashboard: { el: () => document.getElementById("view-dashboard"), render: () => renderDashboard(document.getElementById("view-dashboard")) },
  nutrition: { el: () => document.getElementById("view-nutrition"), render: () => renderNutrition(document.getElementById("view-nutrition")) },
  sport: { el: () => document.getElementById("view-sport"), render: () => renderSport(document.getElementById("view-sport")) },
};

function showView(name) {
  Object.entries(VIEWS).forEach(([key, view]) => {
    view.el().classList.toggle("hidden", key !== name);
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  VIEWS[name].render();
}

function initNav() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
}

function initOfflineBadge() {
  const badge = document.getElementById("offline-badge");
  const update = () => badge.classList.toggle("hidden", navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
    } catch (err) {
      console.warn("Service Worker Registrierung fehlgeschlagen:", err);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initNav();
  initOfflineBadge();
  registerServiceWorker();
  showView("dashboard");
});
