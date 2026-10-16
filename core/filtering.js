// Index-based filter engine.
//
// The index maps each category value to a sorted Int32Array of card indices.
// A filter run builds one Uint8Array mask per active category, so the filtered
// set *and* every Filter Panel count come out of a single pass instead of the
// old 1 + 11 full re-filters. Semantics are identical to the legacy pipeline
// (see tests/filtering.test.mjs):
//   • AND across categories; OR within (AND-OR) or AND within (AND-AND)
//   • AND-AND ignores selected values that don't exist, unless none exist
//   • FreeTextSearch = any term contained in the card name (lower-case)
//   • only cards with a positive numeric price in the selected attribute
//   • counts: AND-OR excludes the category being counted, AND-AND doesn't

import { releaseYear } from "./cards.js";

/** Order in which categories are combined (kept from the legacy code). */
export const FILTER_CATEGORIES = [
  "Set Names",
  "Set Types",
  "Keywords",
  "Year",
  "Originality",
  "Rarity",
  "Nº of Colors",
  "Color Identity",
  "Supertypes",
  "Types",
  "Subtypes",
];

/** Categories shown in the Filter Panel (and therefore counted). */
export const VISIBLE_FILTER_CATEGORIES = [
  "Keywords",
  "Supertypes",
  "Types",
  "Subtypes",
  "Set Types",
  "Set Names",
  "Originality",
  "Rarity",
  "Year",
  "Nº of Colors",
  "Color Identity",
];

const splitWords = (s) => s.split(/[\s/]+/).map((v) => v.trim());

/** All values of `category` for one card (what the card is indexed under). */
export function extractCardValues(card, category) {
  switch (category) {
    case "Originality":
      return card.originality ? [card.originality] : [];
    case "Keywords":
      return Array.isArray(card.keywords) ? card.keywords.map((k) => k.trim()) : [];
    case "Rarity":
      return card.rarity ? [card.rarity] : [];
    case "Supertypes":
      return card.supertype ? splitWords(card.supertype) : [];
    case "Types":
      return card.type ? splitWords(card.type) : [];
    case "Subtypes":
      return card.subtype ? splitWords(card.subtype) : [];
    case "Set Types":
      return card.set_type ? [card.set_type] : [];
    case "Set Names":
      return card.set_name ? [card.set_name] : [];
    case "Year": {
      const y = card._year ?? releaseYear(card.release_date);
      return y == null ? [] : [String(y)];
    }
    case "Nº of Colors":
      if (card.number_of_colours === 1) return ["1 color"];
      if (card.number_of_colours === 0) return ["colorless"];
      return [`${card.number_of_colours} colors`];
    case "Color Identity":
      return [card._ci === "Colorless" ? "colorless" : card._ci.toLowerCase()];
    default:
      return [];
  }
}

/** { category: Map<value, Int32Array of card indices> } */
export function buildIndex(cards) {
  const lists = Object.fromEntries(FILTER_CATEGORIES.map((c) => [c, new Map()]));
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    for (const category of FILTER_CATEGORIES) {
      const map = lists[category];
      for (const value of extractCardValues(card, category)) {
        let arr = map.get(value);
        if (!arr) map.set(value, (arr = []));
        if (arr[arr.length - 1] !== i) arr.push(i); // de-duplicate per card
      }
    }
  }
  const index = {};
  for (const [category, map] of Object.entries(lists)) {
    index[category] = new Map([...map].map(([v, arr]) => [v, Int32Array.from(arr)]));
  }
  return index;
}

export function isFilterEmpty(selectedFilters) {
  return Object.values(selectedFilters).every((set) => set.size === 0);
}

/** Stable string key for (filters, price attribute, logic mode). */
export function filterKey(selectedFilters, priceAttr, mode) {
  const parts = Object.keys(selectedFilters)
    .filter((k) => selectedFilters[k]?.size > 0)
    .sort()
    .map((k) => [k, [...selectedFilters[k]].sort()]);
  return JSON.stringify([mode, priceAttr, parts]);
}

export function createFilterEngine(cards, { index = buildIndex(cards), memoSize = 16 } = {}) {
  const n = cards.length;
  const priceMasks = new Map();
  const memo = new Map();
  let lowerNames = null;

  function priceMask(attr) {
    let m = priceMasks.get(attr);
    if (!m) {
      m = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const v = cards[i][attr];
        m[i] = typeof v === "number" && v > 0 ? 1 : 0;
      }
      priceMasks.set(attr, m);
    }
    return m;
  }

  function categoryMask(category, values, andWithin) {
    const group = index[category];
    const mask = new Uint8Array(n);
    if (!andWithin) {
      for (const v of values) {
        const list = group.get(v);
        if (list) for (let j = 0; j < list.length; j++) mask[list[j]] = 1;
      }
      return mask;
    }
    const lists = [...values].map((v) => group.get(v)).filter(Boolean);
    if (lists.length === 0) return mask;
    if (lists.length === 1) {
      for (const i of lists[0]) mask[i] = 1;
      return mask;
    }
    const hits = new Uint8Array(n);
    for (const list of lists) for (let j = 0; j < list.length; j++) hits[list[j]]++;
    const k = lists.length;
    for (let i = 0; i < n; i++) mask[i] = hits[i] === k ? 1 : 0;
    return mask;
  }

  function compute(selectedFilters, priceAttr, mode) {
    const andWithin = mode.endsWith("AND");
    const base = Uint8Array.from(priceMask(priceAttr));

    const terms = selectedFilters.FreeTextSearch;
    if (terms?.size > 0) {
      if (!lowerNames) lowerNames = cards.map((c) => c.name?.toLowerCase() || "");
      const t = [...terms].map((x) => x.toLowerCase());
      for (let i = 0; i < n; i++) {
        if (base[i] && !t.some((term) => lowerNames[i].includes(term))) base[i] = 0;
      }
    }

    // One mask per active category; sat[i] = how many of them card i passes.
    const active = new Map();
    for (const category of FILTER_CATEGORIES) {
      const values = selectedFilters[category];
      if (!values || values.size === 0 || !index[category]) continue;
      active.set(category, categoryMask(category, values, andWithin));
    }
    const nActive = active.size;
    const sat = new Uint8Array(n);
    for (const mask of active.values()) for (let i = 0; i < n; i++) sat[i] += mask[i];

    const out = [];
    const full = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (base[i] && sat[i] === nActive) {
        full[i] = 1;
        out.push(cards[i]);
      }
    }

    const counts = new Map();
    for (const category of VISIBLE_FILTER_CATEGORIES) {
      const group = index[category];
      if (!group) continue;
      const own = !andWithin ? active.get(category) : undefined;
      const valueCounts = new Map();
      for (const [value, list] of group) {
        let c = 0;
        if (own) {
          // Passes every active category except (possibly) this one.
          for (let j = 0; j < list.length; j++) {
            const i = list[j];
            if (base[i] && (sat[i] === nActive || (sat[i] === nActive - 1 && !own[i]))) c++;
          }
        } else {
          for (let j = 0; j < list.length; j++) c += full[list[j]];
        }
        valueCounts.set(value, c);
      }
      counts.set(category, valueCounts);
    }

    return { cards: out, counts, mask: full };
  }

  return {
    index,
    /** Values of a category, in index order. */
    values: (category) => [...(index[category]?.keys() ?? [])],
    /** Card indices for one value (Int32Array, may be undefined). */
    lookup: (category, value) => index[category]?.get(value),
    /**
     * Filter + Filter Panel counts. Memoized: identical inputs return the
     * same result object, so callers can compare by identity.
     */
    run(selectedFilters, priceAttr, mode = "AND-OR") {
      const key = filterKey(selectedFilters, priceAttr, mode);
      let result = memo.get(key);
      if (result) {
        memo.delete(key);
        memo.set(key, result); // refresh LRU position
        return result;
      }
      result = compute(selectedFilters, priceAttr, mode);
      memo.set(key, result);
      if (memo.size > memoSize) memo.delete(memo.keys().next().value);
      return result;
    },
  };
}

/**
 * Which of Supertypes / Types / Subtypes a bare token (e.g. from "t:goblin")
 * most likely refers to: the category with the most cards having that word
 * (case-insensitive). Ties go to the earlier candidate; "" if none.
 */
export function inferTypeCategory(engine, value, candidates = ["Supertypes", "Types", "Subtypes"]) {
  const needle = value.trim().toLowerCase();
  let best = "";
  let bestCount = 0;
  for (const category of candidates) {
    const hits = new Set();
    for (const [key, list] of engine.index[category] ?? []) {
      if (key.toLowerCase() === needle) for (const i of list) hits.add(i);
    }
    if (hits.size > bestCount) {
      best = category;
      bestCount = hits.size;
    }
  }
  return best;
}
