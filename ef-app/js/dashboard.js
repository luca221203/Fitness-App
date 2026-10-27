// Dashboard: verdichtete Kennzahlen aus beiden Modulen + Wochen-Rückblick.
// Siehe Konzept-Dokument, Abschnitt "Dashboard".

const HISTORY_WEEKS = 8;

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

async function renderProfileSetup(container) {
  container.innerHTML = `
    <div class="card">
      <h2>Kurz einrichten</h2>
      <p class="hint">Einmalig: Gewicht und Größe für Zielkorridor und Dashboard-Trend.</p>
      <div class="row">
        <input type="number" id="setup-weight" placeholder="Gewicht (kg)" value="73" />
        <input type="number" id="setup-height" placeholder="Größe (cm)" value="178" />
      </div>
      <p><button class="btn-primary btn-small" id="setup-save">Speichern</button></p>
    </div>`;
  document.getElementById("setup-save").addEventListener("click", async () => {
    const weightKg = Number(document.getElementById("setup-weight").value) || 73;
    const heightCm = Number(document.getElementById("setup-height").value) || 178;
    await DB.saveProfile({ weightKg, heightCm, targetRateMinPct: 0.25, targetRateMaxPct: 0.5 });
    renderDashboard(document.getElementById("view-dashboard"));
  });
}

async function weightTrendHtml() {
  const measurements = (await DB.allBodyMeasurements())
    .filter((m) => typeof m.weightKg === "number")
    .sort((a, b) => a.date.localeCompare(b.date));

  if (measurements.length === 0) {
    return `<p class="hint">Noch keine Gewichtsmessung erfasst.</p>`;
  }
  const last = measurements[measurements.length - 1];
  const recent = measurements.slice(-7);
  const avg = recent.reduce((s, m) => s + m.weightKg, 0) / recent.length;
  return `<p>Letzte Messung: <strong>${last.weightKg} kg</strong> (${formatDate(last.date)})</p>
          <p class="hint">Gleitender Schnitt (letzte ${recent.length}): ${avg.toFixed(1)} kg</p>`;
}

async function checklistProgressHtml() {
  const today = new Date().toISOString().slice(0, 10);
  const entries = await DB.mealLogByDate(today);
  const checklistEntry = entries.filter((e) => e.kind === "checklist").pop();
  if (!checklistEntry) {
    return `<p class="hint">Heute noch keine Checkliste ausgefüllt.</p>`;
  }
  const values = Object.values(checklistEntry.items || {});
  const done = values.filter(Boolean).length;
  return `<p><strong>${done}/${values.length}</strong> Punkte heute erfüllt</p>`;
}

async function trainingWeekHtml() {
  const sessions = await DB.allTrainingSessions();
  const kickboxDays = await getKickboxDays();
  const plan = buildWeekPlan(kickboxDays);
  const rows = plan.map((d) => {
    // Grobe Zuordnung: pruefen ob irgendeine Session in dieser Kalenderwoche an diesem Wochentag erfasst ist.
    const hasSession = sessions.some((s) => {
      const jsDay = new Date(s.date).getDay();
      const shortDay = WEEKDAYS[(jsDay + 6) % 7];
      return shortDay === d.day;
    });
    return `<tr><td class="day">${d.day}</td><td>${d.label}</td><td>${
      hasSession ? '<span class="pill good">erledigt</span>' : '<span class="pill">geplant</span>'
    }</td></tr>`;
  }).join("");
  return `<table class="week-table">${rows}</table>`;
}

// ---- Wochen-Rückblick: zwei Verlaufs-Charts (Ernährung / Training) ----

function startOfWeek(date) {
  const d = new Date(date);
  const dayIdx = (d.getDay() + 6) % 7; // Mo=0..So=6
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dayIdx);
  return d;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function weekLabel(monday) {
  return monday.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function lastNWeeks(n) {
  const weeks = [];
  const thisMonday = startOfWeek(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const monday = new Date(thisMonday);
    monday.setDate(monday.getDate() - i * 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    weeks.push({ monday, sunday, label: weekLabel(monday) });
  }
  return weeks;
}

async function computeNutritionWeeklyScores() {
  const allLogs = await DB.allMealLog();
  const checklistByDate = {};
  allLogs
    .filter((e) => e.kind === "checklist")
    .forEach((e) => {
      checklistByDate[e.date] = e; // letzter Eintrag je Tag gewinnt (Einfuegereihenfolge)
    });

  return lastNWeeks(HISTORY_WEEKS).map(({ monday, label }) => {
    const dayScores = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(monday);
      day.setDate(day.getDate() + d);
      const entry = checklistByDate[isoDate(day)];
      if (!entry) continue;
      const vals = Object.values(entry.items || {});
      if (vals.length === 0) continue;
      dayScores.push(vals.filter(Boolean).length / vals.length);
    }
    const hasData = dayScores.length > 0;
    const pct = hasData ? Math.round((dayScores.reduce((s, v) => s + v, 0) / dayScores.length) * 100) : null;
    return { label, pct, hasData };
  });
}

async function computeTrainingWeeklyScores() {
  const sessions = await DB.allTrainingSessions();

  return lastNWeeks(HISTORY_WEEKS).map(({ monday, sunday, label }) => {
    const weekSessions = sessions.filter((s) => {
      const d = new Date(s.date);
      return d >= monday && d <= sunday;
    });
    const hasData = weekSessions.length > 0;
    // Fixer Soll-Wert laut Konzept: 2x Kickboxen + Kraft-Oberkoerper + Kraft-Unterkoerper = 4 "Pflicht"-Einheiten/Woche
    // (Samstag Ganzkoerper ist optional und zaehlt hier bewusst nicht mit rein).
    const kickboxCount = Math.min(weekSessions.filter((s) => s.type === "Kickboxen").length, 2);
    const oberDone = weekSessions.some((s) => s.type === "Kraft-Oberkoerper") ? 1 : 0;
    const unterDone = weekSessions.some((s) => s.type === "Kraft-Unterkoerper") ? 1 : 0;
    const doneCount = kickboxCount + oberDone + unterDone;
    const pct = hasData ? Math.round((doneCount / 4) * 100) : null;
    return { label, pct, hasData };
  });
}

function roundedTopBarPath(x, y, w, h, r) {
  if (h <= 0) return "";
  const radius = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${(y + h).toFixed(1)} L${x},${(y + radius).toFixed(1)} Q${x},${y.toFixed(1)} ${(x + radius).toFixed(1)},${y.toFixed(1)} L${(x + w - radius).toFixed(1)},${y.toFixed(1)} Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + radius).toFixed(1)} L${(x + w).toFixed(1)},${(y + h).toFixed(1)} Z`;
}

function weekBarChartSvg(weeks, color) {
  const width = 320;
  const height = 104;
  const paddingTop = 10;
  const paddingBottom = 16;
  const chartHeight = height - paddingTop - paddingBottom;
  const gap = 4;
  const n = weeks.length;
  const barWidth = (width - gap * (n - 1)) / n;
  const baselineY = paddingTop + chartHeight;

  const lastWithData = [...weeks].reverse().find((w) => w.hasData);

  const bars = weeks
    .map((w, i) => {
      const x = i * (barWidth + gap);
      if (!w.hasData) {
        // Dezenter Platzhalter-Strich fuer Wochen ohne Daten (statt leerer Flaeche).
        return `
          <g>
            <rect x="${x.toFixed(1)}" y="${(baselineY - 2).toFixed(1)}" width="${barWidth.toFixed(1)}" height="2" rx="1" fill="${color}" fill-opacity="0.18"></rect>
            <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 3}" text-anchor="middle" class="chart-axis-label">${w.label}</text>
          </g>`;
      }
      const pct = w.pct;
      const barHeight = Math.max((pct / 100) * chartHeight, 3);
      const y = baselineY - barHeight;
      const isLast = w === lastWithData;
      const path = roundedTopBarPath(x, y, barWidth, barHeight, 4);
      return `
        <g>
          <path d="${path}" fill="${color}">
            <title>${w.label}: ${pct}%</title>
          </path>
          ${isLast ? `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" class="chart-headline-label">${pct}%</text>` : ""}
          <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 3}" text-anchor="middle" class="chart-axis-label">${w.label}</text>
        </g>`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="week-chart" role="img" aria-label="Wochenverlauf, letzte ${n} Wochen">
      <line x1="0" y1="${paddingTop}" x2="${width}" y2="${paddingTop}" class="chart-gridline" />
      <line x1="0" y1="${baselineY}" x2="${width}" y2="${baselineY}" class="chart-baseline" />
      ${bars}
    </svg>`;
}

function weekTableHtml(weeks, columnLabel) {
  const rows = weeks
    .map((w) => `<tr><td>${w.label}</td><td>${w.hasData ? w.pct + " %" : "–"}</td></tr>`)
    .join("");
  return `<table class="week-table history-table"><tr><td><strong>Woche</strong></td><td><strong>${columnLabel}</strong></td></tr>${rows}</table>`;
}

function weeklyAverageText(weeks) {
  const withData = weeks.filter((w) => w.hasData);
  if (withData.length === 0) return "Noch keine Daten in diesem Zeitraum.";
  const avg = Math.round(withData.reduce((s, w) => s + w.pct, 0) / withData.length);
  return `Schnitt über ${withData.length} Woche${withData.length === 1 ? "" : "n"} mit Daten: <strong>${avg}%</strong>`;
}

function historyChartBlockHtml(id, title, weeks, color, columnLabel) {
  return `
    <div class="history-block">
      <div class="row">
        <h3>${title}</h3>
        <button class="btn-secondary btn-small history-toggle" data-target="${id}">Als Tabelle</button>
      </div>
      <div id="${id}-chart">
        ${weekBarChartSvg(weeks, color)}
        <p class="hint">${weeklyAverageText(weeks)}</p>
      </div>
      <div id="${id}-table" class="hidden">
        ${weekTableHtml(weeks, columnLabel)}
      </div>
    </div>`;
}

async function weeklyHistoryHtml() {
  const nutritionWeeks = await computeNutritionWeeklyScores();
  const trainingWeeks = await computeTrainingWeeklyScores();
  return `
    ${historyChartBlockHtml("history-nutrition", "Ernährung", nutritionWeeks, "var(--accent)", "Checkliste erfüllt")}
    ${historyChartBlockHtml("history-training", "Training", trainingWeeks, "var(--accent2)", "Pflicht-Einheiten erledigt")}
    <p class="hint">Ernährung = Ø erfüllte Punkte der täglichen Checkliste je Woche. Training = erledigte von 4 Pflicht-Einheiten je Woche (2× Kickboxen + Oberkörper + Unterkörper; Samstag optional, zählt nicht mit).</p>
  `;
}

function wireHistoryToggles(container) {
  container.querySelectorAll(".history-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.target;
      const chartEl = document.getElementById(`${id}-chart`);
      const tableEl = document.getElementById(`${id}-table`);
      const showingTable = !tableEl.classList.contains("hidden");
      chartEl.classList.toggle("hidden", !showingTable);
      tableEl.classList.toggle("hidden", showingTable);
      btn.textContent = showingTable ? "Als Tabelle" : "Als Diagramm";
    });
  });
}

async function renderDashboard(container) {
  const profile = await DB.getProfile();
  if (!profile) {
    await renderProfileSetup(container);
    return;
  }

  container.innerHTML = `
    <div class="card">
      <h2>Gewichtstrend</h2>
      <div id="weight-trend"></div>
      <div class="row" style="margin-top:8px">
        <input type="number" id="new-weight" placeholder="Gewicht (kg)" step="0.1" />
        <button class="btn-secondary btn-small" id="add-weight">Messung eintragen</button>
      </div>
    </div>
    <div class="card">
      <h2>Heutige Ernährung</h2>
      <div id="checklist-progress"></div>
    </div>
    <div class="card">
      <h2>Trainingswoche</h2>
      <div id="training-week"></div>
    </div>
    <div class="card">
      <h2>Verlauf (letzte ${HISTORY_WEEKS} Wochen)</h2>
      <div id="weekly-history"></div>
    </div>
  `;

  document.getElementById("weight-trend").innerHTML = await weightTrendHtml();
  document.getElementById("checklist-progress").innerHTML = await checklistProgressHtml();
  document.getElementById("training-week").innerHTML = await trainingWeekHtml();
  const historyEl = document.getElementById("weekly-history");
  historyEl.innerHTML = await weeklyHistoryHtml();
  wireHistoryToggles(historyEl);

  document.getElementById("add-weight").addEventListener("click", async () => {
    const weightKg = Number(document.getElementById("new-weight").value);
    if (!weightKg) return;
    await DB.addBodyMeasurement({ date: new Date().toISOString().slice(0, 10), weightKg });
    renderDashboard(document.getElementById("view-dashboard"));
  });
}

window.renderDashboard = renderDashboard;
