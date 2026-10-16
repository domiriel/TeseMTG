// Shared, card-level selection model ("linking") for all coordinated views.
//
// A *predicate* describes cards by attribute values; a card matches if any
// listed value of any field matches (OR):
//   { identities: Set<"WU"|"Colorless">, numColors: Set<number>,
//     originalities: Set<string>, rarities: Set<string>,
//     pairs: Set<"original|rare">, sets: Set<set name>,
//     setTypes: Set<lower-case type>, years: Set<number>, names: Set<card name> }
//
// A *selection* is a Map(source → predicate), one entry per view that has
// something selected. Sources are AND-ed, except "scatter" (cards picked by
// hand in the Scatterplot), which is added on top. Evaluation happens on the
// printings themselves, so "set X AND year Y" means printings that are in X
// *and* from Y — not "elements that contain some X card and some Y card".
//
// Views never evaluate selections themselves: they paint from summarize(),
// which counts the selected printings per attribute value.

import { COLORLESS } from "./cards.js";

export const SCATTER_SOURCE = "scatter";

const FIELDS = {
  identities: (c) => c._ci,
  numColors: (c) => c._nc,
  originalities: (c) => c._orig,
  rarities: (c) => c._rar,
  pairs: (c) => `${c._orig}|${c._rar}`,
  sets: (c) => c.set_name,
  setTypes: (c) => (c.set_type ? c.set_type.toLowerCase() : ""),
  years: (c) => c._year,
  names: (c) => c.name,
};

export const SUMMARY_FIELDS = Object.keys(FIELDS);

export function isEmptyPredicate(pred) {
  return !pred || Object.values(pred).every((v) => !v || v.size === 0);
}

export function createLinker(cards, engine) {
  const n = cards.length;

  // Case-insensitive lookups into the filter index.
  const lowerIndex = (category) => {
    const m = new Map();
    for (const [k, list] of engine.index[category] ?? []) {
      const key = k.toLowerCase();
      const prev = m.get(key);
      m.set(key, prev ? Int32Array.from([...prev, ...list]).sort() : list);
    }
    return m;
  };
  const byOriginality = lowerIndex("Originality");
  const byRarity = lowerIndex("Rarity");
  const bySetType = lowerIndex("Set Types");

  const byName = new Map();
  for (let i = 0; i < n; i++) {
    const name = cards[i].name;
    let arr = byName.get(name);
    if (!arr) byName.set(name, (arr = []));
    arr.push(i);
  }

  const identityKey = (ci) => (ci === COLORLESS ? "colorless" : ci.toLowerCase());
  const numColorsKey = (nc) => (nc === 0 ? "colorless" : nc === 1 ? "1 color" : `${nc} colors`);

  function listsFor(field, value) {
    switch (field) {
      case "identities":
        return [engine.lookup("Color Identity", identityKey(value))];
      case "numColors":
        return [engine.lookup("Nº of Colors", numColorsKey(value))];
      case "originalities":
        return [byOriginality.get(String(value).toLowerCase())];
      case "rarities":
        return [byRarity.get(String(value).toLowerCase())];
      case "sets":
        return [engine.lookup("Set Names", value)];
      case "setTypes":
        return [bySetType.get(String(value).toLowerCase())];
      case "years":
        return [engine.lookup("Year", String(value))];
      case "names":
        return [byName.get(value)];
      default:
        return [];
    }
  }

  /** Printings (within `filteredMask`) matching any value of the predicate. */
  function predicateMask(pred, filteredMask) {
    const mask = new Uint8Array(n);
    for (const [field, values] of Object.entries(pred || {})) {
      if (!values || values.size === 0) continue;
      if (field === "pairs") {
        for (const pair of values) {
          const [o, r] = pair.split("|");
          const os = byOriginality.get(o);
          const rs = byRarity.get(r);
          if (!os || !rs) continue;
          const inR = new Uint8Array(n);
          for (const i of rs) inR[i] = 1;
          for (const i of os) if (inR[i]) mask[i] = 1;
        }
        continue;
      }
      for (const value of values) {
        for (const list of listsFor(field, value)) {
          if (list) for (let j = 0; j < list.length; j++) mask[list[j]] = 1;
        }
      }
    }
    if (filteredMask) for (let i = 0; i < n; i++) mask[i] &= filteredMask[i];
    return mask;
  }

  /** Combined selection mask, or null when nothing is selected. */
  function selectionMask(sources, filteredMask) {
    let mask = null;
    let picks = null;
    for (const [source, pred] of sources) {
      if (isEmptyPredicate(pred)) continue;
      const m = predicateMask(pred, filteredMask);
      if (source === SCATTER_SOURCE) {
        picks = m;
      } else if (mask === null) {
        mask = m;
      } else {
        for (let i = 0; i < n; i++) mask[i] &= m[i];
      }
    }
    if (picks) {
      if (mask === null) return picks;
      for (let i = 0; i < n; i++) mask[i] |= picks[i];
    }
    return mask;
  }

  /**
   * Counts of selected printings per attribute value, computed lazily per
   * field: summary.get("sets") → Map(set name → count).
   */
  function summarize(mask) {
    const selected = [];
    if (mask) for (let i = 0; i < n; i++) if (mask[i]) selected.push(cards[i]);
    const cache = new Map();
    const get = (field) => {
      let m = cache.get(field);
      if (!m) {
        m = new Map();
        const f = FIELDS[field];
        for (const c of selected) {
          const k = f(c);
          m.set(k, (m.get(k) || 0) + 1);
        }
        cache.set(field, m);
      }
      return m;
    };
    return {
      count: selected.length,
      active: mask !== null,
      mask,
      get,
      has: (field, value) => get(field).has(value),
    };
  }

  return { predicateMask, selectionMask, summarize };
}
