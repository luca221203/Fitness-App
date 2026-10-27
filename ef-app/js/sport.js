// Modul Sport: Wochenplan, austauschbare Uebungen (gleiches "pattern" + mind. eine
// gemeinsame Muskelgruppe = gleichwertiger Ersatz), Gewicht/Wdh-Logging je Uebung,
// Fortschrittsansicht. Siehe Konzept-Dokument, Abschnitt "Modul Sport".

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const KICKBOX_CANDIDATE_DAYS = ["Mo", "Mi", "Fr"];
const DEFAULT_KICKBOX_DAYS = ["Mo", "Fr"];

// Di/Do/Sa/So sind nie Kickbox-Tage (Kickboxen geht laut Konzept nur Mo/Mi/Fr-Abend),
// bleiben also unabhaengig von der Kickbox-Tage-Wahl immer gleich.
function buildWeekPlan(kickboxDays) {
  return WEEKDAYS.map((day) => {
    if (KICKBOX_CANDIDATE_DAYS.includes(day)) {
      return kickboxDays.includes(day)
        ? { day, type: "Kickboxen", label: "Kickboxen (19–21:30 Uhr)" }
        : { day, type: "Ruhetag", label: "Ruhetag (ungenutzter Kickbox-Termin)" };
    }
    if (day === "Di") return { day, type: "Kraft-Oberkoerper", label: "Krafttraining Oberkörper" };
    if (day === "Do") return { day, type: "Kraft-Unterkoerper", label: "Krafttraining Unterkörper" };
    if (day === "Sa") return { day, type: "Kraft-Ganzkoerper", label: "Krafttraining Ganzkörper (optional) / Ausdauer" };
    return { day, type: "Ruhetag", label: "Ruhetag" };
  });
}

// Konkrete Uebungsauswahl je Krafttag, aus js/data/exercises.json (per id).
// "sets" hier ist der im Konzept dokumentierte Vorschlag; austauschbar gegen
// jede Uebung mit gleichem "pattern" + gemeinsamer Muskelgruppe.
//
// ex21 (Bizepscurls) + ex14 (Trizepsdruecken) ergaenzt: Compound-Zuege/Druecke
// (Klimmzuege, Bankdruecken) liefern nur indirekten Bizeps-/Trizeps-Reiz als
// Sekundaer-Muskel. Fuer maximalen Muskelaufbau der Armmuskulatur selbst
// empfehlen Uebersichtsarbeiten zusaetzliches direktes Isolationsvolumen
// (siehe Konzept-Dokument, Abschnitt "Wissenschaftliche Grundlagen & Quellen").
// Geringer Zeit-/Ermuedungsaufwand (kleine Muskelgruppen, kurze Erholungszeit),
// kollidiert daher nicht mit der Kickbox-Erholung.
const DAY_EXERCISES = {
  "Kraft-Oberkoerper": [
    { id: "ex09", sets: "3×6–10" },
    { id: "ex16", sets: "3×5–10" },
    { id: "ex12", sets: "3×8–10" },
    { id: "ex18", sets: "3×8–10" },
    { id: "ex20", sets: "2×15–20" },
    { id: "ex21", sets: "2×10–15" },
    { id: "ex14", sets: "2×10–15" },
    { id: "ex22", sets: "2×30–60 Sek." },
  ],
  "Kraft-Unterkoerper": [
    { id: "ex01", sets: "3×6–8" },
    { id: "ex03", sets: "3×8–10" },
    { id: "ex30", sets: "2×10–12/Seite" },
    { id: "ex06", sets: "2×10–15" },
    { id: "ex08", sets: "2×12–15" },
    { id: "ex25", sets: "2×15–20" },
  ],
  "Kraft-Ganzkoerper": [
    { id: "ex27", sets: "2×12–15" },
    { id: "ex26", sets: "2×30–40m" },
  ],
};

function todayWeekdayShort() {
  // JS: 0=Sonntag..6=Samstag -> auf unsere Mo-So Reihenfolge ummuenzen.
  const jsDay = new Date().getDay();
  return WEEKDAYS[(jsDay + 6) % 7];
}

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

async function loadExercises() {
  if (!window.__exercisesCache) {
    const res = await fetch("js/data/exercises.json");
    window.__exercisesCache = await res.json();
  }
  return window.__exercisesCache;
}

async function getKickboxDays() {
  const profile = await DB.getProfile();
  const days = profile && Array.isArray(profile.kickboxDays) ? profile.kickboxDays : null;
  return days && days.length === 2 ? days : DEFAULT_KICKBOX_DAYS;
}

async function saveKickboxDays(days) {
  const profile = (await DB.getProfile()) || {};
  await DB.saveProfile({ ...profile, kickboxDays: days });
}

// Gleichwertiger Ersatz = gleiches Bewegungsmuster UND mind. eine gemeinsame
// Muskelgruppe. Reines Pattern-Matching reicht nicht: "Isolation" ist ein
// Sammel-Tag fuer z.B. Bizepscurls UND Wadenheben, die muskulaer nichts
// miteinander zu tun haben.
function alternativesFor(exercise, allExercises) {
  return allExercises.filter(
    (e) =>
      e.id !== exercise.id &&
      e.pattern === exercise.pattern &&
      e.muscleGroups.some((m) => exercise.muscleGroups.includes(m))
  );
}

function renderWeekTable(plan, today) {
  const rows = plan.map(
    (d) =>
      `<tr class="${d.day === today ? "today" : ""}"><td class="day">${d.day}</td><td>${d.label}</td></tr>`
  ).join("");
  return `<table class="week-table">${rows}</table>`;
}

function kickboxDaySelectHtml(selectIndex, selectedDay, otherDay) {
  const options = KICKBOX_CANDIDATE_DAYS.map((day) => {
    const disabled = day === otherDay ? "disabled" : "";
    const selected = day === selectedDay ? "selected" : "";
    return `<option value="${day}" ${disabled} ${selected}>${day}</option>`;
  }).join("");
  return `<select data-kickbox-select="${selectIndex}">${options}</select>`;
}

function renderKickboxSettings(kickboxDays) {
  return `
    <div class="card">
      <h2>Kickbox-Tage diese Woche</h2>
      <p class="hint">Fest sind Montag, Mittwoch oder Freitag (19–21:30 Uhr) – wähle, welche 2 von 3 du diese Woche nimmst. Krafttage (Di/Do) bleiben davon unberührt.</p>
      <div class="row">
        ${kickboxDaySelectHtml(0, kickboxDays[0], kickboxDays[1])}
        <span class="hint">und</span>
        ${kickboxDaySelectHtml(1, kickboxDays[1], kickboxDays[0])}
      </div>
    </div>`;
}

function exerciseSelectHtml(rowId, exercise, alternatives) {
  const options = [exercise, ...alternatives]
    .map((e) => `<option value="${e.id}">${e.name}</option>`)
    .join("");
  return `<select data-row="${rowId}" class="exercise-swap">${options}</select>`;
}

async function renderDayExercises(dayType) {
  const list = DAY_EXERCISES[dayType];
  if (!list) return "";
  const exercises = await loadExercises();
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));

  const rows = list
    .map((item, idx) => {
      const ex = byId[item.id];
      if (!ex) return "";
      const alts = alternativesFor(ex, exercises);
      return `
        <div class="exercise-row" data-row-id="row-${idx}">
          <div class="exercise-row-top">
            ${exerciseSelectHtml("row-" + idx, ex, alts)}
            <span class="exercise-sets">${item.sets}</span>
          </div>
          <div class="exercise-row-log">
            <span class="hint">Heute eintragen:</span>
            <input type="number" step="0.5" placeholder="kg" class="log-weight" data-row="row-${idx}" />
            <span class="hint">×</span>
            <input type="number" placeholder="Wdh" class="log-reps" data-row="row-${idx}" />
          </div>
        </div>`;
    })
    .join("");

  return `
    <div class="card">
      <h2>Übungen (austauschbar)</h2>
      <p class="hint">Jede Übung kann gegen eine Alternative mit gleichem Bewegungsmuster + gleicher Muskelgruppe getauscht werden – z.B. bei fehlendem Equipment oder wenn du gerade keine Lust auf sie hast.</p>
      ${rows}
    </div>`;
}

function trendPill(first, latest) {
  if (typeof first !== "number" || typeof latest !== "number") return "";
  if (latest > first) return '<span class="pill good">↑ Steigerung</span>';
  if (latest < first) return '<span class="pill warn">↓</span>';
  return '<span class="pill">→ gleich</span>';
}

function progressRowHtml(exercise, allLogs) {
  const entries = allLogs
    .filter((e) => e.exerciseId === exercise.id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-4);

  if (entries.length === 0) {
    return `<div class="progress-item"><span class="exercise-name">${exercise.name}</span><span class="hint">Noch keine Werte erfasst</span></div>`;
  }

  const history = entries
    .map((e) => `${formatShortDate(e.date)}: ${e.weightKg != null ? e.weightKg + " kg" : "–"}×${e.reps != null ? e.reps : "–"}`)
    .join("&nbsp;&nbsp;→&nbsp;&nbsp;");

  const trend = trendPill(entries[0].weightKg, entries[entries.length - 1].weightKg);

  return `
    <div class="progress-item">
      <div>
        <span class="exercise-name">${exercise.name}</span>
        <div class="hint">${history}</div>
      </div>
      ${trend}
    </div>`;
}

async function renderProgress(dayType) {
  const list = DAY_EXERCISES[dayType];
  if (!list) return "";
  const exercises = await loadExercises();
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const allLogs = await DB.allSetLog();

  const rows = list
    .map((item) => {
      const ex = byId[item.id];
      return ex ? progressRowHtml(ex, allLogs) : "";
    })
    .join("");

  return `
    <div class="card">
      <h2>Fortschritt</h2>
      <p class="hint">Letzte eingetragenen Werte je Übung (bei Tausch gegen eine Alternative wird deren eigene Historie angezeigt).</p>
      ${rows}
    </div>`;
}

async function logSession(type, container) {
  const rpe = prompt("Belastungsempfinden (RPE, 1–10)?");
  if (rpe === null) return;
  const sleep = prompt("Schlafqualität letzte Nacht (1–5)?");
  if (sleep === null) return;

  const sessionId = await DB.addTrainingSession({
    date: new Date().toISOString().slice(0, 10),
    type,
    rpe: Number(rpe) || null,
    sleepQuality: Number(sleep) || null,
  });

  const exercises = await loadExercises();
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const today = new Date().toISOString().slice(0, 10);

  const rows = container.querySelectorAll(".exercise-row");
  for (const row of rows) {
    const select = row.querySelector(".exercise-swap");
    const weightInput = row.querySelector(".log-weight");
    const repsInput = row.querySelector(".log-reps");
    const weightKg = weightInput && weightInput.value !== "" ? Number(weightInput.value) : null;
    const reps = repsInput && repsInput.value !== "" ? Number(repsInput.value) : null;
    if (weightKg === null && reps === null) continue; // nichts eingetragen, überspringen

    const exerciseId = select ? select.value : null;
    const ex = byId[exerciseId];
    await DB.addSetLog({
      sessionId,
      date: today,
      exerciseId,
      exerciseName: ex ? ex.name : exerciseId,
      weightKg,
      reps,
    });
  }

  alert("Einheit gespeichert.");
  renderSport(document.getElementById("view-sport"));
}

async function renderSport(container) {
  const today = todayWeekdayShort();
  const kickboxDays = await getKickboxDays();
  const plan = buildWeekPlan(kickboxDays);
  const todayPlan = plan.find((d) => d.day === today);

  container.innerHTML = `
    ${renderKickboxSettings(kickboxDays)}
    <div class="card">
      <h2>Diese Woche</h2>
      ${renderWeekTable(plan, today)}
    </div>
    <div class="card">
      <h2>Heute: ${todayPlan.label}</h2>
      <button class="btn-primary btn-small" id="log-session-btn">Einheit abschließen (Gewicht/Wdh. + RPE/Schlaf eintragen)</button>
    </div>
    <div id="day-exercises"></div>
    <div id="progress-section"></div>
  `;

  const exContainer = document.getElementById("day-exercises");
  exContainer.innerHTML = await renderDayExercises(todayPlan.type);
  document.getElementById("progress-section").innerHTML = await renderProgress(todayPlan.type);

  document
    .getElementById("log-session-btn")
    .addEventListener("click", () => logSession(todayPlan.type, container));

  container.querySelectorAll("[data-kickbox-select]").forEach((select) => {
    select.addEventListener("change", async () => {
      const selects = container.querySelectorAll("[data-kickbox-select]");
      const newDays = [selects[0].value, selects[1].value];
      await saveKickboxDays(newDays);
      renderSport(container);
    });
  });
}

window.renderSport = renderSport;
window.buildWeekPlan = buildWeekPlan;
window.getKickboxDays = getKickboxDays;
