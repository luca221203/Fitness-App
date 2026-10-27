// Freitext-Naehrwerte fuer eigene Mahlzeiten: automatischer, kostenloser lokaler
// Abgleich (offline, js/data/foods.json) fuer eindeutige Einzel-Lebensmittel.
// Fuer alles andere traegst du die Werte manuell ein (siehe nutrition.js) -
// optional gibt es zusaetzlich eine KI-Schaetzung per eigenem Anthropic-API-Key,
// aber NUR auf ausdruecklichen Klick, nie automatisch (vermeidet unerwartete Kosten).
// Siehe Konzept-Dokument, Abschnitt "Eigene Mahlzeiten: automatische Naehrwertschaetzung".
//
// Sicherheitshinweis: Der API-Key wird nur lokal in IndexedDB auf diesem Geraet
// gespeichert und direkt aus dem Browser an die Anthropic-API geschickt (kein
// eigener Server). Das ist fuer eine rein private, lokal genutzte App okay,
// sollte aber niemals in eine oeffentlich erreichbare/gehostete Version
// uebernommen werden, da jeder mit Zugriff auf den Browser den Key auslesen
// koennte (siehe https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access).

const CLAUDE_MODEL = "claude-haiku-5-5"; // schnell + guenstig, reicht fuer Naehrwertschaetzungen

async function loadFoodDb() {
  if (!window.__foodDbCache) {
    const res = await fetch("js/data/foods.json");
    window.__foodDbCache = await res.json();
  }
  return window.__foodDbCache;
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Umlaute/Akzente grob entfernen fuer robusteren Abgleich
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGrams(gramsStr, text) {
  const fromField = gramsStr && gramsStr.match(/\d+([.,]\d+)?/);
  if (fromField) return parseFloat(fromField[0].replace(",", "."));
  const fromText = text.match(/(\d+([.,]\d+)?)\s*g\b/i);
  if (fromText) return parseFloat(fromText[1].replace(",", "."));
  return null;
}

// Nur dann lokal schaetzen, wenn der Text (ohne Menge) im Wesentlichen EIN
// bekanntes Lebensmittel benennt. Bei "mit"/"und"/"plus" (zusammengesetzte
// Mahlzeiten wie "Brötchen mit Leberwurst") bewusst NICHT lokal raten.
async function localLookup(text, grams) {
  if (!grams) return null;
  const normalized = normalizeText(text);
  if (/\b(mit|und|plus|dazu)\b/.test(normalized)) return null;

  const db = await loadFoodDb();
  for (const food of db) {
    const hit = food.synonyms.some((syn) => {
      const normSyn = normalizeText(syn);
      return (
        normalized === normSyn ||
        normalized.startsWith(normSyn + " ") ||
        normalized.endsWith(" " + normSyn)
      );
    });
    if (hit) {
      const factor = grams / 100;
      return {
        source: "local",
        kcal: Math.round(food.per100g.kcal * factor),
        protein_g: Math.round(food.per100g.protein_g * factor * 10) / 10,
        carbs_g: Math.round(food.per100g.carbs_g * factor * 10) / 10,
        fat_g: Math.round(food.per100g.fat_g * factor * 10) / 10,
        note: `Lokaler Abgleich: ${food.name} (${grams} g)`,
      };
    }
  }
  return null;
}

// Kostenloser Standardpfad (automatisch bei jeder eigenen Mahlzeit): NUR der
// lokale Abgleich, keine API, keine Kosten. Treffer = sofort fertig, sonst
// null -> UI zeigt manuelles Eingabefeld.
async function estimateMeal(text, gramsStr) {
  const grams = parseGrams(gramsStr, text);
  return await localLookup(text, grams);
}

async function estimateViaClaude(text, grams, apiKey) {
  const amountHint = grams ? `${grams} g` : "Menge nicht angegeben, bitte realistisch für eine Portion schätzen";
  const prompt =
    `Schätze die Nährwerte für folgende Mahlzeit, gegessen von einer Einzelperson. ` +
    `Beschreibung: "${text}". Menge: ${amountHint}. ` +
    `Antworte AUSSCHLIESSLICH mit einem einzeiligen JSON-Objekt, keine Erklärung, kein Markdown, ` +
    `genau diese Felder: {"kcal": <Zahl>, "protein_g": <Zahl>, "carbs_g": <Zahl>, "fat_g": <Zahl>, ` +
    `"note": "<kurze Begründung/Annahmen auf Deutsch, max. 15 Wörter>"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    let msg = `Claude-API-Fehler ${res.status}`;
    try {
      const parsedErr = JSON.parse(errBody);
      if (parsedErr && parsedErr.error && parsedErr.error.message) msg += `: ${parsedErr.error.message}`;
    } catch (e) {
      /* ignore */
    }
    throw new Error(msg);
  }

  const data = await res.json();
  const textOut = (data.content || []).map((b) => b.text || "").join("").trim();
  const jsonMatch = textOut.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Antwort der API enthielt kein auswertbares JSON.");
  const parsed = JSON.parse(jsonMatch[0]);

  return {
    source: "api",
    kcal: Math.round(Number(parsed.kcal)),
    protein_g: Math.round(Number(parsed.protein_g) * 10) / 10,
    carbs_g: Math.round(Number(parsed.carbs_g) * 10) / 10,
    fat_g: Math.round(Number(parsed.fat_g) * 10) / 10,
    note: parsed.note || "Geschätzt per KI-API.",
  };
}

// Optionaler Pfad, NUR auf expliziten Button-Klick (siehe nutrition.js): verursacht
// echte, wenn auch minimale, API-Kosten. Wird nie automatisch aufgerufen.
async function estimateMealViaApi(text, gramsStr) {
  const profile = await DB.getProfile();
  const apiKey = profile && profile.anthropicApiKey;
  if (!apiKey) {
    return { source: "none", error: "Kein API-Key hinterlegt." };
  }
  const grams = parseGrams(gramsStr, text);
  try {
    return await estimateViaClaude(text, grams, apiKey);
  } catch (err) {
    return { source: "none", error: (err && err.message) || String(err) };
  }
}

window.estimateMeal = estimateMeal;
window.estimateMealViaApi = estimateMealViaApi;
