// Searchable GeoNames city/town chooser for the private member editor.
// Data shards are public CC BY 4.0 reference material, not member locations.
const cache = new Map();
const countries = new Intl.DisplayNames(["en"], { type: "region" });
export function cleanCitySearch(value) {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function cityShard(value) {
  return cleanCitySearch(value).slice(0, 2).padEnd(2, "_");
}
export function cityLabel(place) {
  const name = String(place.n || "").trim();
  const region = String(place.a || "").trim();
  const code = String(place.c || "");
  const country = /^[A-Z]{2}$/.test(code) ? (countries.of(code) || code) : code;
  return [name, region && region.toLowerCase() !== name.toLowerCase() ? region : "", country].filter(Boolean).join(", ");
}
async function getShard(key) {
  if (cache.has(key)) return cache.get(key);
  const response = await fetch("/locations/" + key + ".json", { cache: "force-cache" });
  if (!response.ok) throw new Error("City index unavailable");
  const places = await response.json();
  if (!Array.isArray(places)) throw new Error("Invalid city index");
  cache.set(key, places);
  return places;
}

export function createLocalityPicker(input, results, hint, onChange = () => {}) {
  let selected = null;
  let serial = 0;
  function close() {
    results.hidden = true;
    results.replaceChildren();
  }
  function restore(id, key, label) {
    serial++;
    selected = Number.isSafeInteger(Number(id)) && Number(id) > 0 && /^[a-z0-9_]{2}$/.test(String(key))
      ? { id: Number(id), key: String(key), label: String(label || "") } : null;
    input.value = String(label || "");
    close();
  }
  function clear() {
    restore(null, "", "");
  }
  function current() {
    return selected && input.value.trim() === selected.label ? { id: selected.id, key: selected.key } : null;
  }
  async function query() {
    const typed = input.value.trim();
    if (selected && selected.label !== typed) selected = null;
    onChange();
    const token = ++serial;
    const base = typed.split(",")[0].trim();
    const normalized = cleanCitySearch(base);
    close();
    if (normalized.length < 2) {
      hint.textContent = "Type at least two letters, then choose a town from the list.";
      return;
    }
    hint.textContent = "Searching towns…";
    try {
      const key = cityShard(base);
      const list = await getShard(key);
      if (token !== serial) return;
      const matches = list.filter(item => cleanCitySearch(item.n).startsWith(normalized)).slice(0, 14);
      hint.textContent = matches.length ? "Select the correct city, state/region and country." : "No matching towns in this index. Try a nearby town.";
      if (!matches.length) return;
      for (const item of matches) {
        const label = cityLabel(item);
        if (label.length > 100) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.role = "option";
        button.className = "locality-option";
        button.textContent = label;
        button.addEventListener("click", () => {
          selected = { id: item.id, key, label };
          input.value = label;
          hint.textContent = "Selected: " + label;
          close();
          onChange();
        });
        results.appendChild(button);
      }
      results.hidden = !results.childElementCount;
    } catch {
      if (token !== serial) return;
      hint.textContent = "City lookup is temporarily unavailable. Your existing profile can still be saved.";
    }
  }
  input.addEventListener("input", query);
  input.addEventListener("focus", () => { if (!selected && input.value.trim().length >= 2) query(); });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
    if (event.key === "ArrowDown" && !results.hidden) {
      event.preventDefault();
      results.querySelector("button")?.focus();
    }
  });
  input.addEventListener("blur", () => setTimeout(close, 180));
  return { current, restore, clear };
}
