// Modul Ernaehrung: Mahlzeiten-Vorschlaege, tägliche Checkliste, Freitext-Mahlzeiten.
// Eigene Mahlzeiten: automatischer kostenloser lokaler Abgleich, sonst manuelle
// Eingabe; optionale KI-Schätzung nur auf Klick (siehe js/nutrition-estimate.js).
// Siehe Konzept-Dokument, Abschnitt "Modul Ernährung".

const CHECKLIST_ITEMS = [
  { key: "meal1", label: "Mahlzeit 1 wie vorgeschlagen (oder gleichwertiger Tausch)" },
  { key: "meal2", label: "Mahlzeit 2 wie vorgeschlagen (oder gleichwertiger Tausch)" },
  { key: "meal3", label: "Mahlzeit 3 wie vorgeschlagen (oder gleichwertiger Tausch)" },
  { key: "protein", label: "Proteinziel erreicht (geschätzt über Portionen)" },
  { key: "water", label: "Ausreichend getrunken (35–40 ml/kg Körpergewicht)" },
];

// Anzeigenamen + (wo sinnvoll) Stueck-Umrechnung fuer die Mengenangaben in der
// Rezept-Detailansicht. pieceG = typisches Gewicht eines Stuecks; wird nur
// angezeigt, wenn die Rezeptmenge nahe an einem glatten Vielfachen liegt.
const INGREDIENT_LABELS = {
  apfel: { name: "Apfel", pieceG: 100 },
  avocado: { name: "Avocado" },
  banane: { name: "Banane", pieceG: 120 },
  beeren_mix: { name: "Beerenmischung (TK oder frisch)" },
  brokkoli: { name: "Brokkoli" },
  champignons: { name: "Champignons" },
  curry_sauce_light: { name: "Currysauce (light)" },
  ei: { name: "Ei", pieceG: 50 },
  erdnussbutter: { name: "Erdnussbutter" },
  feta: { name: "Feta" },
  garnelen: { name: "Garnelen" },
  haehnchenbrust: { name: "Hähnchenbrust" },
  haferflocken: { name: "Haferflocken" },
  haferkleie: { name: "Haferkleie" },
  honig: { name: "Honig" },
  karotte: { name: "Karotte", pieceG: 70 },
  kartoffeln: { name: "Kartoffeln" },
  kichererbsen: { name: "Kichererbsen (abgetropft)" },
  kokosmilch_light: { name: "Kokosmilch (light)" },
  lachs: { name: "Lachs" },
  linsen: { name: "Linsen" },
  magerquark: { name: "Magerquark" },
  mandeln: { name: "Mandeln" },
  milch_fettarm: { name: "Milch (fettarm)" },
  olivenoel: { name: "Olivenöl" },
  paprika: { name: "Paprika", pieceG: 150 },
  putenbrust: { name: "Putenbrust" },
  quinoa: { name: "Quinoa" },
  reis_natur: { name: "Naturreis" },
  reis_weiss: { name: "Reis (weiß)" },
  rind_hack_5pct: { name: "Rinderhack (5% Fett)" },
  salat_mix: { name: "Salatmischung" },
  schwarze_bohnen: { name: "Schwarze Bohnen" },
  skyr: { name: "Skyr" },
  spinat: { name: "Spinat" },
  suesskartoffel: { name: "Süßkartoffel" },
  thunfisch_wasser: { name: "Thunfisch (in Wasser)" },
  tofu: { name: "Tofu" },
  tomate: { name: "Tomate", pieceG: 100 },
  tomatensauce: { name: "Tomatensauce (passiert)" },
  vollkornbrot: { name: "Vollkornbrot", pieceG: 20, pieceUnit: "Scheibe", pieceUnitPlural: "Scheiben" },
  vollkornnudeln: { name: "Vollkornnudeln" },
  whey_pulver: { name: "Whey-Proteinpulver" },
  zucchini: { name: "Zucchini" },
  zwiebel: { name: "Zwiebel", pieceG: 100 },
};

function prettifyKey(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAmount(key, grams) {
  const info = INGREDIENT_LABELS[key] || { name: prettifyKey(key) };
  if (info.pieceG) {
    const pieces = grams / info.pieceG;
    const rounded = Math.round(pieces * 2) / 2;
    if (rounded > 0 && Math.abs(rounded - pieces) <= 0.15) {
      const unit = rounded === 1 ? info.pieceUnit || "Stück" : info.pieceUnitPlural || info.pieceUnit || "Stück";
      const amountLabel = String(rounded).replace(".", ",");
      return `${amountLabel} ${unit} (${grams} g)`;
    }
  }
  return `${grams} g`;
}

function ingredientsListHtml(recipe) {
  const rows = Object.entries(recipe.ingredients)
    .map(([key, grams]) => {
      const info = INGREDIENT_LABELS[key] || { name: prettifyKey(key) };
      return `<li>${info.name}: <strong>${formatAmount(key, grams)}</strong></li>`;
    })
    .join("");
  return `<ul class="ingredient-list">${rows}</ul>`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function loadRecipes() {
  if (!window.__recipesCache) {
    const res = await fetch("js/data/recipes.json");
    window.__recipesCache = await res.json();
  }
  return window.__recipesCache;
}

function pickSuggestion(recipes, mealType) {
  const pool = recipes.filter((r) => r.mealType === mealType);
  if (pool.length === 0) return null;
  // Einfache Tagesrotation statt reinem Zufall, damit der Vorschlag am selben Tag stabil bleibt.
  const dayIndex = new Date().getDate();
  return pool[dayIndex % pool.length];
}

function recipeCardHtml(recipe) {
  if (!recipe) return `<p class="hint">Kein Vorschlag verfügbar.</p>`;
  const p = recipe.perServing;
  const batchHint =
    recipe.servingsPerBatch > 1
      ? ` · Batch ergibt ${recipe.servingsPerBatch} Portionen (Meal-Prep)`
      : "";
  return `
    <details class="recipe-details">
      <summary>
        <span class="recipe-name">${recipe.name}</span>
        <span class="hint">${p.kcal} kcal · ${p.protein_g} g P · ${p.carbs_g} g KH · ${p.fat_g} g F
          ${recipe.mealPrepFriendly ? '<span class="pill good">meal-prep</span>' : ""}
        </span>
      </summary>
      <div class="recipe-detail-body">
        <p class="hint">Zutaten pro Portion${batchHint}:</p>
        ${ingredientsListHtml(recipe)}
        <p class="hint">Grobe Orientierung – nach Hunger/Alltag frei anpassbar.</p>
      </div>
    </details>`;
}

async function getTodayChecklist() {
  const entries = await DB.mealLogByDate(todayIso());
  const checklistEntry = entries.find((e) => e.kind === "checklist");
  return checklistEntry ? checklistEntry.items : {};
}

async function saveChecklist(items) {
  const entries = await DB.mealLogByDate(todayIso());
  const existing = entries.find((e) => e.kind === "checklist");
  // Einfachheit halber im Grundgerüst: neuer Eintrag pro Speichern (Verlauf bleibt erhalten).
  await DB.addMealLog({ date: todayIso(), kind: "checklist", items });
}

async function renderChecklist(container) {
  const current = await getTodayChecklist();
  container.innerHTML = CHECKLIST_ITEMS.map(
    (item) => `
      <label class="checklist-item">
        <input type="checkbox" data-key="${item.key}" ${current[item.key] ? "checked" : ""} />
        ${item.label}
      </label>`
  ).join("");

  container.querySelectorAll("input[type=checkbox]").forEach((box) => {
    box.addEventListener("change", async () => {
      const items = {};
      container.querySelectorAll("input[type=checkbox]").forEach((b) => {
        items[b.dataset.key] = b.checked;
      });
      await saveChecklist(items);
    });
  });
}

// ---- Eigene Mahlzeiten: lokaler Abgleich (automatisch, kostenlos), manuelle
// Eingabe (Standard-Fallback), optionale KI-Schätzung (nur auf Klick, kostenpflichtig) ----

async function getApiKeyStatus() {
  const profile = await DB.getProfile();
  return !!(profile && profile.anthropicApiKey);
}

function settingsCardHtml(hasKey) {
  return `
    <details class="recipe-details" id="estimate-settings">
      <summary>
        <span class="recipe-name">Optional: KI-Schätzung per eigenem API-Key</span>
        <span class="hint">${hasKey ? '<span class="pill good">API-Key hinterlegt</span>' : '<span class="pill">nicht eingerichtet – nicht nötig</span>'}</span>
      </summary>
      <div class="recipe-detail-body">
        <p class="hint">
          Standardmäßig trägst du Nährwerte, die nicht automatisch erkannt werden, einfach selbst ein –
          kostenlos, ohne irgendetwas einzurichten. Wer zusätzlich eine automatische KI-Schätzung für
          zusammengesetzte Mahlzeiten möchte, kann optional einen eigenen Anthropic-API-Key hinterlegen
          (verursacht minimale, aber echte Kosten pro Anfrage, Cent-Bruchteile).
        </p>
        <p class="hint">
          Key besorgen: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>
          → Account anlegen/einloggen → Zahlungsmethode hinterlegen → "Create Key" → Key kopieren
          (beginnt mit <code>sk-ant-...</code>) und unten einfügen.
        </p>
        <div class="row">
          <input type="password" id="api-key-input" placeholder="sk-ant-..." autocomplete="off" />
          <button class="btn-secondary btn-small" id="api-key-save">Speichern</button>
        </div>
        ${hasKey ? '<p class="hint" id="api-key-clear-wrap"><button class="btn-secondary btn-small" id="api-key-clear">Key entfernen</button></p>' : ""}
      </div>
    </details>`;
}

async function saveApiKey() {
  const input = document.getElementById("api-key-input");
  const key = input.value.trim();
  if (!key) return;
  const profile = (await DB.getProfile()) || {};
  await DB.saveProfile({ ...profile, anthropicApiKey: key });
  input.value = "";
  const settingsEl = document.getElementById("estimate-settings");
  const wasOpen = settingsEl && settingsEl.open;
  await renderCustomMealSection();
  if (wasOpen) document.getElementById("estimate-settings").open = true;
}

async function clearApiKey() {
  const profile = (await DB.getProfile()) || {};
  await DB.saveProfile({ ...profile, anthropicApiKey: null });
  await renderCustomMealSection();
}

function macroLineHtml(entry) {
  const sourceLabels = { local: "automatisch erkannt", manual: "manuell eingetragen", api: "per KI geschätzt" };
  const sourceLabel = sourceLabels[entry.source] || "";
  return `${entry.kcal} kcal · ${entry.protein_g} g P · ${entry.carbs_g} g KH · ${entry.fat_g} g F
    ${sourceLabel ? `<span class="pill ${entry.source === "local" ? "good" : ""}">${sourceLabel}</span>` : ""}`;
}

function manualEntryFormHtml(entry, hasKey) {
  return `
    <div class="checklist-item" style="flex-direction:column; align-items:stretch; gap:6px;">
      <div class="row">
        <span>${entry.description}</span>
        ${hasKey ? `<button class="btn-secondary btn-small try-api" data-id="${entry.id}">Stattdessen per KI schätzen</button>` : ""}
      </div>
      <p class="hint">Nicht automatisch erkannt – Werte selbst eintragen (z.B. von der Verpackung, oder frag mich kurz im Chat):</p>
      <div class="manual-entry-grid">
        <input type="number" class="manual-kcal" data-id="${entry.id}" placeholder="kcal" />
        <input type="number" step="0.1" class="manual-protein" data-id="${entry.id}" placeholder="P (g)" />
        <input type="number" step="0.1" class="manual-carbs" data-id="${entry.id}" placeholder="KH (g)" />
        <input type="number" step="0.1" class="manual-fat" data-id="${entry.id}" placeholder="F (g)" />
      </div>
      <button class="btn-primary btn-small save-manual" data-id="${entry.id}">Speichern</button>
    </div>`;
}

function customMealRowHtml(entry, hasKey) {
  if (entry.status === "estimated") {
    return `
      <div class="checklist-item">
        <div>
          <div>${entry.description}</div>
          <div class="hint">${macroLineHtml(entry)}</div>
          ${entry.note ? `<div class="hint">${entry.note}</div>` : ""}
        </div>
      </div>`;
  }
  if (entry.status === "estimating") {
    return `
      <div class="checklist-item">
        <span>${entry.description}</span>
        <span class="pill warn">schätze per KI…</span>
      </div>`;
  }
  // "needs_manual" sowie alte/legacy Status ("pending", "failed", undefined) -> manuelles Formular.
  return manualEntryFormHtml(entry, hasKey);
}

async function saveManualEstimate(id) {
  const kcal = Number(document.querySelector(`.manual-kcal[data-id="${id}"]`).value);
  const protein_g = Number(document.querySelector(`.manual-protein[data-id="${id}"]`).value) || 0;
  const carbs_g = Number(document.querySelector(`.manual-carbs[data-id="${id}"]`).value) || 0;
  const fat_g = Number(document.querySelector(`.manual-fat[data-id="${id}"]`).value) || 0;
  if (!kcal) return;
  await DB.updateMealLog(id, {
    status: "estimated",
    estimated: true,
    source: "manual",
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    note: "manuell eingetragen",
  });
  await renderCustomMealLog();
}

async function triggerApiEstimate(id, text, gramsStr) {
  await DB.updateMealLog(id, { status: "estimating" });
  await renderCustomMealLog();

  const result = await estimateMealViaApi(text, gramsStr);
  if (result.error) {
    await DB.updateMealLog(id, { status: "needs_manual", note: result.error });
  } else {
    await DB.updateMealLog(id, {
      status: "estimated",
      estimated: true,
      source: result.source,
      kcal: result.kcal,
      protein_g: result.protein_g,
      carbs_g: result.carbs_g,
      fat_g: result.fat_g,
      note: result.note,
    });
  }
  await renderCustomMealLog();
}

async function submitCustomMeal() {
  const textInput = document.getElementById("custom-meal-text");
  const gramsInput = document.getElementById("custom-meal-grams");
  const text = textInput.value.trim();
  const grams = gramsInput.value.trim();
  if (!text) return;

  // Automatischer, kostenloser lokaler Abgleich zuerst (siehe js/nutrition-estimate.js).
  const local = await estimateMeal(text, grams);

  await DB.addMealLog({
    date: todayIso(),
    kind: "custom",
    description: `${grams ? grams + " – " : ""}${text}`,
    status: local ? "estimated" : "needs_manual",
    estimated: !!local,
    source: local ? local.source : null,
    kcal: local ? local.kcal : null,
    protein_g: local ? local.protein_g : null,
    carbs_g: local ? local.carbs_g : null,
    fat_g: local ? local.fat_g : null,
    note: local ? local.note : null,
  });

  textInput.value = "";
  gramsInput.value = "";
  await renderCustomMealLog();
}

function parseDescriptionParts(description) {
  const match = description.match(/^(.*?)\s–\s(.*)$/);
  return match ? { gramsStr: match[1], text: match[2] } : { gramsStr: "", text: description };
}

async function renderCustomMealLog() {
  const container = document.getElementById("custom-meal-log");
  if (!container) return;
  const entries = (await DB.mealLogByDate(todayIso())).filter((e) => e.kind === "custom");
  const hasKey = await getApiKeyStatus();

  if (entries.length === 0) {
    container.innerHTML = `<p class="hint">Noch keine eigenen Mahlzeiten heute.</p>`;
    return;
  }
  container.innerHTML = entries.map((e) => customMealRowHtml(e, hasKey)).join("");

  container.querySelectorAll(".save-manual").forEach((btn) => {
    btn.addEventListener("click", () => saveManualEstimate(Number(btn.dataset.id)));
  });
  container.querySelectorAll(".try-api").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      const { gramsStr, text } = parseDescriptionParts(entry.description);
      triggerApiEstimate(id, text, gramsStr);
    });
  });
}

async function renderCustomMealSection() {
  const container = document.getElementById("custom-meal-section");
  if (!container) return;
  const hasKey = await getApiKeyStatus();
  container.innerHTML = `
    ${settingsCardHtml(hasKey)}
    <p class="hint">Isst du etwas anderes? Beschreibung + Menge eintragen (z.B. "Chili con Carne" + "300 g"). Eindeutige Einzel-Lebensmittel werden automatisch erkannt, sonst trägst du die Werte selbst ein.</p>
    <div class="row">
      <input type="text" id="custom-meal-text" placeholder="z.B. Chili con Carne" />
      <input type="text" id="custom-meal-grams" placeholder="300 g" style="max-width:90px" />
    </div>
    <p>
      <button class="btn-primary btn-small" id="submit-custom-meal">Eintragen</button>
    </p>
    <div id="custom-meal-log"></div>
  `;
  document.getElementById("api-key-save").addEventListener("click", saveApiKey);
  const clearBtn = document.getElementById("api-key-clear");
  if (clearBtn) clearBtn.addEventListener("click", clearApiKey);
  document.getElementById("submit-custom-meal").addEventListener("click", submitCustomMeal);
  await renderCustomMealLog();
}

async function renderNutrition(container) {
  const recipes = await loadRecipes();
  const breakfast = pickSuggestion(recipes, "breakfast");
  const lunchDinner = pickSuggestion(recipes, "lunch_dinner");
  const snack = pickSuggestion(recipes, "snack");

  container.innerHTML = `
    <div class="card">
      <h2>Heutige Vorschläge</h2>
      <p class="hint">Antippen für Mengenangaben je Zutat.</p>
      <div class="section-title">Frühstück</div>
      ${recipeCardHtml(breakfast)}
      <div class="section-title">Mittag/Abend</div>
      ${recipeCardHtml(lunchDinner)}
      <div class="section-title">Snack</div>
      ${recipeCardHtml(snack)}
    </div>

    <div class="card">
      <h2>Tägliche Checkliste</h2>
      <div id="checklist"></div>
    </div>

    <div class="card">
      <h2>Eigene Mahlzeit eintragen</h2>
      <div id="custom-meal-section"></div>
    </div>
  `;

  await renderChecklist(document.getElementById("checklist"));
  await renderCustomMealSection();
}

window.renderNutrition = renderNutrition;
