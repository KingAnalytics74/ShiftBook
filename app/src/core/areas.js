import { AREAS } from "./areas-data.js";

// Where a carer lives, as a council area chosen from an official list instead of free text.
// The label is what other carers see and what "Near me" compares, so it is unique per council.
export const OUTSIDE = { code: "OUTSIDE", name: "Outside the UK", county: "", region: "", nation: "", label: "Outside the UK" };

export const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

export const labelOf = a => (a.county ? a.name + ", " + a.county : a.name);

export const ALL = AREAS.map(([code, name, county, region, nation]) => {
  const a = { code, name, county, region, nation };
  a.label = labelOf(a);
  a.nname = norm(name); a.nlabel = norm(a.label); a.ncounty = norm(county); a.nregion = norm(region);
  return a;
});
const byCode = new Map(ALL.map(a => [a.code, a]));
const byLabel = new Map(ALL.map(a => [a.nlabel, a]));

// Names people use that are not in the official name.
const ALIASES = { "western isles": "S12000013", "londonderry": "N09000005", "derry": "N09000005", "edinburgh": "S12000036", "bristol": "E06000023" };
const OUTSIDE_WORDS = ["outside", "abroad", "overseas", "international", "not in the uk", "other country"];

export const areaByCode = code => (code === OUTSIDE.code ? OUTSIDE : byCode.get(code) || null);

// Exactly what the box says, as an area, or null. Accepts the full label or a name that is unique.
export function resolveArea(text) {
  const q = norm(text);
  if (!q) return null;
  if (q === norm(OUTSIDE.label)) return OUTSIDE;
  if (byLabel.has(q)) return byLabel.get(q);
  const named = ALL.filter(a => a.nname === q);
  return named.length === 1 ? named[0] : null;
}

// Best matches first: name starts with it, then a word in the name, then the county or region.
export function searchAreas(text, limit = 8) {
  const q = norm(text);
  if (!q) return [];
  const aliased = ALIASES[q] && byCode.get(ALIASES[q]);
  const scored = [];
  for (const a of ALL) {
    const words = a.nname.split(" ");
    let s = -1;
    if (a.nname === q) s = 0;
    else if (a.nname.startsWith(q)) s = 1;
    else if (words.some(w => w.startsWith(q))) s = 2;
    else if (a.nlabel.includes(q)) s = 3;
    else if (a.ncounty.startsWith(q)) s = 4;
    else if (a.nregion.startsWith(q)) s = 5;
    if (aliased && a === aliased) s = 0;
    if (s >= 0) scored.push([s, a]);
  }
  scored.sort((x, y) => x[0] - y[0] || x[1].name.localeCompare(y[1].name));
  const out = scored.slice(0, limit).map(x => x[1]);
  if (OUTSIDE_WORDS.some(w => w.startsWith(q) || q.startsWith(w)) && !out.includes(OUTSIDE)) out.push(OUTSIDE);
  return out;
}
