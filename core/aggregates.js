// Per-view data aggregation, pulled out of the view modules so it can be tested
// and so the views only deal with layout and drawing. Each function matches the
// data step of the corresponding legacy view (tests/views-data.test.mjs) but
// uses the fields precomputed by prepareCards() instead of re-parsing dates and
// re-sorting color identities per card.

import { COLORLESS } from "./cards.js";

const groupName = (nc) => (nc === 0 ? "Colorless" : nc === 1 ? "1 Color" : `${nc} Colors`);

/** Icicle: color groups (by number of colors) → color identities. */
export function icicleAggregate(cards) {
  const groups = [];
  const groupMap = new Map();
  const childMap = new Map(); // `${group}|${identity}` → entry

  for (const card of cards) {
    const nc = card._nc;
    const gName = groupName(nc);
    let group = groupMap.get(gName);
    if (!group) {
      group = {
        name: gName,
        numColors: nc,
        originalCount: 0,
        reprintCount: 0,
        functionalReprintCount: 0,
        children: [],
        originalities: new Set(),
        rarities: new Set(),
        years: new Set(),
      };
      groupMap.set(gName, group);
      groups.push(group);
    }

    const key = `${gName}|${card._ci}`;
    let entry = childMap.get(key);
    if (!entry) {
      entry = {
        name: card._ci,
        value: 0,
        numColors: nc,
        originalCount: 0,
        reprintCount: 0,
        functionalReprintCount: 0,
        originalities: new Set(),
        rarities: new Set(),
        years: new Set(),
      };
      childMap.set(key, entry);
      group.children.push(entry);
    }

    entry.value += 1;
    if (card.originality === "original") entry.originalCount += 1;
    if (card.originality === "reprint") entry.reprintCount += 1;
    if (card.originality === "functional reprint") entry.functionalReprintCount += 1;

    if (card._orig) {
      entry.originalities.add(card._orig);
      group.originalities.add(card._orig);
    }
    if (card._rar) {
      entry.rarities.add(card._rar);
      group.rarities.add(card._rar);
    }
    const year = String(card._year);
    entry.years.add(year);
    group.years.add(year);
  }
  return groups;
}

/** Alluvial: originality → rarity flows with average prices. */
export function alluvialAggregate(cards, priceAttr) {
  const origs = new Set();
  const rars = new Set();
  for (const c of cards) {
    if (c._orig) origs.add(c._orig);
    if (c._rar) rars.add(c._rar);
  }
  const originalityCategories = [...origs].sort();
  const rarityCategories = [...rars].sort();
  const oIndex = new Map(originalityCategories.map((o, i) => [o, i]));
  const rIndex = new Map(rarityCategories.map((r, i) => [r, i]));
  const nO = originalityCategories.length;
  const nR = rarityCategories.length;

  // Sums are accumulated in card order, like the original implementation, so
  // floating-point results are identical.
  const linkCount = new Float64Array(nO * nR);
  const linkSum = new Float64Array(nO * nR);
  const linkN = new Float64Array(nO * nR);
  const oSum = new Float64Array(nO);
  const oN = new Float64Array(nO);
  const rSum = new Float64Array(nR);
  const rN = new Float64Array(nR);

  for (const c of cards) {
    const oi = oIndex.get(c._orig);
    const ri = rIndex.get(c._rar);
    if (oi === undefined || ri === undefined) continue;
    const k = oi * nR + ri;
    linkCount[k]++;
    const price = parseFloat(c[priceAttr]);
    if (!isNaN(price)) {
      linkSum[k] += price;
      linkN[k]++;
      oSum[oi] += price;
      oN[oi]++;
      rSum[ri] += price;
      rN[ri]++;
    }
  }

  const nodes = [
    ...originalityCategories.map((o, i) => ({ name: o, avgPrice: oN[i] ? oSum[i] / oN[i] : 0 })),
    ...rarityCategories.map((r, i) => ({ name: r, avgPrice: rN[i] ? rSum[i] / rN[i] : 0 })),
  ];
  const links = [];
  for (let oi = 0; oi < nO; oi++) {
    for (let ri = 0; ri < nR; ri++) {
      const k = oi * nR + ri;
      links.push({
        source: originalityCategories[oi],
        target: rarityCategories[ri],
        value: linkCount[k],
        avgPrice: linkN[k] ? linkSum[k] / linkN[k] : 0,
      });
    }
  }
  return { nodes, links };
}

/** Timeline: one entry per set, sorted by the release date of its first card. */
export function timelineAggregate(cards) {
  const sets = new Map();
  for (const card of cards) {
    let s = sets.get(card.set_name);
    if (!s) {
      s = {
        name: card.set_name,
        releaseDate: new Date(card.release_date),
        setType: card.set_type,
        cardCount: 0,
        originalities: new Set(),
        rarities: new Set(),
        colorIdentities: new Set(),
        numColorsPresent: new Set(),
      };
      sets.set(card.set_name, s);
    }
    s.cardCount += 1;
    if (card._orig) s.originalities.add(card._orig);
    if (card._rar) s.rarities.add(card._rar);
    s.numColorsPresent.add(card._ci === COLORLESS ? 0 : card._ci.length);
    s.colorIdentities.add(card._ci);
  }
  return [...sets.values()].sort((a, b) => a.releaseDate - b.releaseDate);
}

/** Line chart: per-year metrics (Gleemax excluded, as before). */
export function lineAggregate(cards) {
  const byYear = new Map();
  for (const card of cards) {
    if (card.name === "Gleemax") continue;
    let y = byYear.get(card._year);
    if (!y) {
      y = {
        n: 0,
        reprints: 0,
        complexity: 0,
        cmc: 0,
        originalities: new Set(),
        rarities: new Set(),
        colorIdentities: new Set(),
        numColorsPresent: new Set(),
      };
      byYear.set(card._year, y);
    }
    y.n++;
    if (card.originality === "functional reprint") y.reprints++;
    y.complexity += +card.complexity || 0;
    y.cmc += +card.cmc || 0;
    if (card._orig) y.originalities.add(card._orig);
    if (card._rar) y.rarities.add(card._rar);
    y.colorIdentities.add(card._ci);
    y.numColorsPresent.add(card._ci === COLORLESS ? 0 : card._ci.length);
  }
  return [...byYear]
    .map(([year, y]) => ({
      year: new Date(year, 0, 1),
      reprints: y.reprints,
      avgComplexity: y.complexity / y.n,
      avgCMC: y.cmc / y.n,
      originalities: y.originalities,
      rarities: y.rarities,
      colorIdentities: y.colorIdentities,
      numColorsPresent: y.numColorsPresent,
    }))
    .sort((a, b) => a.year - b.year);
}
