import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATASET_PATH = path.join(REPO_ROOT, "data", "dataset_card_details.json");

// Fresh parse each call: several functions under test mutate card objects.
export function loadDataset() {
  return JSON.parse(fs.readFileSync(DATASET_PATH, "utf8"));
}

export const PRICE_ATTRS = [
  "price_eur",
  "price_eur_foil",
  "price_usd",
  "price_usd_foil",
  "price_usd_etched",
  "price_tix",
];

// Build a selectedFilters object like state.js does.
export function filters(spec = {}) {
  const base = {
    Keywords: [],
    Rarity: [],
    Supertypes: [],
    Types: [],
    Subtypes: [],
    "Set Types": [],
    Originality: [],
    "Nº of Colors": [],
    "Color Identity": [],
    "Set Names": [],
    Year: [],
    FreeTextSearch: [],
  };
  const out = {};
  for (const k of Object.keys(base)) out[k] = new Set(spec[k] || []);
  for (const k of Object.keys(spec)) if (!(k in out)) out[k] = new Set(spec[k]);
  return out;
}

// Named scenarios shared by tests and benchmarks.
export const SCENARIOS = [
  { name: "no filters", f: {} },
  { name: "rarity=rare", f: { Rarity: ["rare"] } },
  { name: "rare|mythic + Creature", f: { Rarity: ["rare", "mythic"], Types: ["Creature"] } },
  { name: "wu identity", f: { "Color Identity": ["wu"] } },
  { name: "2 colors + uncommon", f: { "Nº of Colors": ["2 colors"], Rarity: ["uncommon"] } },
  { name: "expansion + Flying + 2020", f: { "Set Types": ["expansion"], Keywords: ["Flying"], Year: ["2020"] } },
  { name: "Flying+Trample (AND-AND)", f: { Keywords: ["Flying", "Trample"] }, mode: "AND-AND" },
  { name: "Legendary Creature Dragon (AND-AND)", f: { Supertypes: ["Legendary"], Types: ["Creature"], Subtypes: ["Dragon"] }, mode: "AND-AND" },
  { name: "text 'dragon'", f: { FreeTextSearch: ["dragon"] } },
  { name: "text + rarity", f: { FreeTextSearch: ["goblin"], Rarity: ["common"] } },
  { name: "unknown value", f: { Keywords: ["NoSuchKeyword"] } },
  { name: "AND-AND with unknown value", f: { Keywords: ["Flying", "NoSuchKeyword"] }, mode: "AND-AND" },
  { name: "set names", f: { "Set Names": ["Limited Edition Alpha", "Dominaria"] } },
  { name: "many categories", f: { Rarity: ["rare", "common"], Originality: ["original"], "Set Types": ["expansion", "core"], "Color Identity": ["r", "g", "rg"] } },
];
