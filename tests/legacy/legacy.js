// FROZEN reference implementation — DO NOT EDIT.
//
// Verbatim copies of the pre-refactor data logic (commit 6253068), with only the
// implicit `getState()` / d3 dependencies turned into explicit parameters, so the
// refactored code in `core/` can be differentially tested against it.
//
// Sources:
//   extractCardValues, buildGroupedData, filterData, filterPriceOnly,
//   isFilterEmpty, intersectSets          ← script.js
//   filterPanelCounts                      ← idioms/FilterPanel.js updateFilterPanel()
//   prepareScatterData                     ← idioms/Scatterplot.js
//   icicleAggregate                        ← idioms/IcicleChart.js createIcicleChart() §1
//   alluvialAggregate                      ← idioms/AlluvialChart.js createAlluvialChart()
//   timelineAggregate                      ← idioms/TimelineView.js createTimelineView()
//   lineAggregate                          ← idioms/LineChart.js createStackedLineChart() §1
//
// Known bugs are preserved on purpose (e.g. the timezone-dependent year).

const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };

export const filterApplicationOrder = [
  "FreeTextSearch",
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

export function extractCardValues(card, category) {
  switch (category) {
    case "Originality":
      return card.originality ? [card.originality] : [];
    case "Keywords":
      return Array.isArray(card.keywords)
        ? card.keywords.map((k) => k.trim())
        : [];
    case "Rarity":
      return card.rarity ? [card.rarity] : [];
    case "Supertypes":
      return card.supertype
        ? card.supertype.split(/[\s/]+/).map((v) => v.trim())
        : [];
    case "Types":
      return card.type ? card.type.split(/[\s/]+/).map((v) => v.trim()) : [];
    case "Subtypes":
      return card.subtype
        ? card.subtype.split(/[\s/]+/).map((v) => v.trim())
        : [];
    case "Set Types":
      return card.set_type ? [card.set_type] : [];
    case "Set Names":
      return card.set_name ? [card.set_name] : [];
    case "Year":
      if (!card.release_date) return [];
      return [new Date(card.release_date).getFullYear().toString()];
    case "Nº of Colors":
      if (card.number_of_colours === 1) return ["1 color"];
      if (card.number_of_colours === 0) return ["colorless"];
      return [`${card.number_of_colours} colors`];
    case "Color Identity":
      if (!Array.isArray(card.color_identity) || card.color_identity.length === 0)
        return ["colorless"];
      const sortedColors = card.color_identity
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("");
      return [sortedColors.toLowerCase()];
    default:
      return [];
  }
}

export function buildGroupedData(data) {
  const grouped = {
    Originality: new Map(),
    Keywords: new Map(),
    Rarity: new Map(),
    Supertypes: new Map(),
    Types: new Map(),
    Subtypes: new Map(),
    "Set Types": new Map(),
    "Set Names": new Map(),
    Year: new Map(),
    "Nº of Colors": new Map(),
    "Color Identity": new Map(),
  };

  data.forEach((card) => {
    for (const category of Object.keys(grouped)) {
      const values = extractCardValues(card, category);
      values.forEach((value) => {
        if (!grouped[category].has(value)) {
          grouped[category].set(value, []);
        }
        grouped[category].get(value).push(card);
      });
    }
  });
  return grouped;
}

function intersectSets(setA, setB) {
  return new Set([...setA].filter((x) => setB.has(x)));
}

// was: filterData(groupedData, selectedFilters, { excludeCategory }) reading
// getState().filterLogicMode and getState().originalData
export function filterData(
  groupedData,
  selectedFilters,
  { excludeCategory, mode = "AND-OR", originalData }
) {
  const applyAndWithin = mode.endsWith("AND");

  let filteredSet = new Set();
  const perCategoryMatches = [];

  for (const category of filterApplicationOrder || Object.keys(selectedFilters)) {
    if (excludeCategory && category === excludeCategory) continue;

    const values = selectedFilters[category];
    if (!values || values.size === 0) continue;

    const group = groupedData[category];
    if (!group) continue;

    let matched = new Set();

    if (applyAndWithin) {
      const sets = Array.from(values)
        .map((val) => group.get(val))
        .filter((set) => set);

      if (sets.length === 1) {
        matched = new Set(sets[0]);
      } else if (sets.length > 1) {
        matched = sets.reduce((a, b) => intersectSets(new Set(a), new Set(b)));
      } else {
        matched = new Set();
      }
    } else {
      values.forEach((val) => {
        const set = group.get(val);
        if (set) set.forEach((card) => matched.add(card));
      });
    }

    perCategoryMatches.push(matched);
  }

  filteredSet = perCategoryMatches.reduce(
    (a, b) => intersectSets(a, b),
    new Set(originalData || [])
  );

  const textTerms = selectedFilters["FreeTextSearch"];
  if (textTerms?.size > 0) {
    const searchTerms = Array.from(textTerms).map((t) => t.toLowerCase());
    filteredSet = new Set(
      [...filteredSet].filter((card) => {
        const cardText = [card.name?.toLowerCase() || ""];
        return searchTerms.some((term) =>
          cardText.some((text) => text.includes(term))
        );
      })
    );
  }

  return Array.from(filteredSet);
}

export function filterPriceOnly(cards, priceAttr) {
  return cards.filter(
    (card) => typeof card[priceAttr] === "number" && card[priceAttr] > 0
  );
}

export function isFilterEmpty(selectedFilters) {
  return Object.values(selectedFilters).every((set) => set.size === 0);
}

// What getFilteredData() returns (ignoring its memo layers).
export function getFilteredData(originalData, groupedData, selectedFilters, priceAttr, mode = "AND-OR") {
  if (isFilterEmpty(selectedFilters)) return filterPriceOnly(originalData, priceAttr);
  return filterPriceOnly(
    filterData(groupedData, selectedFilters, { mode, originalData }),
    priceAttr
  );
}

const VISIBLE_FILTER_CATEGORIES = [
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

// Counts section of updateFilterPanel(): category → Map(value → count)
export function filterPanelCounts(
  originalData,
  groupedData,
  filteredCards,
  selectedFilters,
  priceAttr,
  mode = "AND-OR"
) {
  const applyAndWithin = mode.endsWith("AND");
  const result = new Map();

  const getFilteredSetExcluding = (categoryToIgnore, selectedFiltersArg) => {
    const filtered = filterData(groupedData, selectedFiltersArg, {
      excludeCategory: categoryToIgnore,
      mode,
      originalData,
    });
    return filterPriceOnly(filtered, priceAttr);
  };

  let cachedFilteredSet = null;

  VISIBLE_FILTER_CATEGORIES.forEach((category) => {
    const categoryGroup = groupedData[category];
    if (!categoryGroup) return;

    let filteredSet;
    if (isFilterEmpty(selectedFilters)) {
      filteredSet = filteredCards;
    } else if (!applyAndWithin) {
      filteredSet = getFilteredSetExcluding(category, selectedFilters);
    } else {
      if (!cachedFilteredSet) {
        const allFiltered = filterData(groupedData, selectedFilters, { mode, originalData });
        cachedFilteredSet = filterPriceOnly(allFiltered, priceAttr);
      }
      filteredSet = cachedFilteredSet;
    }

    const filteredIds = new Set(filteredSet.map((c) => c.index));
    const optionCounts = new Map();

    categoryGroup.forEach((cards, value) => {
      const count = cards.reduce(
        (acc, card) => acc + filteredIds.has(card.index),
        0
      );
      optionCounts.set(value, count);
    });

    result.set(category, optionCounts);
  });

  return result;
}

export function prepareScatterData(data, selectedPriceAttribute) {
  const excludedSetTypes = new Set(["memorabilia", "alchemy", "token"]);
  const excludedSetNames = ["Arena", "Alchemy", "Digital"];
  const excludedTypes = [];

  const cardMap = new Map();

  for (const card of data) {
    if (
      card.digital ||
      excludedSetTypes.has(card.set_type) ||
      excludedSetNames.some((keyword) => card.set_name?.includes(keyword)) ||
      excludedTypes.includes(card.type)
    )
      continue;

    if (!cardMap.has(card.name)) {
      cardMap.set(card.name, {
        ...card,
        prices: [],
        setTypes: new Map(),
        printImages: [],
        printMetadata: [],
        tooltip_image: null,
        foundOriginal: false,
        all_years: new Set(),
        all_originalities: new Set(),
      });
    }

    const entry = cardMap.get(card.name);

    entry.setTypes.set(card.set_name, card.set_type);
    if (!entry.all_set_types) entry.all_set_types = new Set();
    if (card.set_type) entry.all_set_types.add(card.set_type.toLowerCase());

    const price =
      isNaN(card[selectedPriceAttribute]) ||
      card[selectedPriceAttribute] == null
        ? 0
        : card[selectedPriceAttribute];
    if (!isNaN(card.complexity)) {
      entry.prices.push(price);
    }

    if (card.release_date) {
      const releaseDate = new Date(card.release_date);
      const year = releaseDate.getFullYear();
      if (!isNaN(year)) {
        entry.all_years.add(year);

        if (
          !entry.earliest_release_date ||
          releaseDate < new Date(entry.earliest_release_date)
        ) {
          entry.earliest_release_date = releaseDate;
        }
      }
    }

    if (card.originality) {
      entry.all_originalities.add(card.originality.toLowerCase());
    }

    if (card.image_normal) {
      entry.printImages.push(card.image_normal);
      entry.printMetadata.push({
        image: card.image_normal,
        set_name: card.set_name,
        set_type: card.set_type,
      });

      if (!entry.foundOriginal && card.originality === "original") {
        entry.tooltip_image = card.image_normal;
        entry.foundOriginal = true;
      }
    } else if (Array.isArray(card.faces)) {
      for (const face of card.faces) {
        if (face.image_normal) {
          entry.printImages.push(face.image_normal);
          entry.printMetadata.push({
            image: face.image_normal,
            set_name: card.set_name,
            set_type: card.set_type,
          });

          if (!entry.foundOriginal && card.originality === "original") {
            entry.tooltip_image = face.image_normal;
            entry.foundOriginal = true;
          }
        }
      }
    }
  }

  const result = [];
  for (const card of cardMap.values()) {
    card.all_sets = Array.from(card.setTypes.entries()).map(([name, type]) => ({
      name,
      type,
    }));
    card.all_set_types = Array.from(card.all_set_types || []);
    card.all_years = Array.from(card.all_years);
    card.all_originalities = Array.from(card.all_originalities);
    card.all_print_images = card.printImages;
    card.print_image_metadata = card.printMetadata;
    card.tooltip_image = card.tooltip_image || card.image_normal;

    const sum = card.prices.reduce((a, b) => a + b, 0);
    card.avg_price = card.prices.length > 0 ? sum / card.prices.length : 0;
    card.release_date = card.earliest_release_date || card.release_date;

    result.push(card);
  }

  return result;
}

// Data part of createIcicleChart() (before colors / layout).
export function icicleAggregate(data) {
  const groupedData = [];
  const groupMap = new Map();

  data.forEach((card) => {
    const colors = Array.isArray(card.color_identity) ? card.color_identity : [];
    let numColors = colors.length;
    if (numColors > 5) numColors = 5;

    const colorKey =
      colors
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("") || "Colorless";

    const colorGroupName =
      numColors === 0 ? "Colorless" : numColors === 1 ? "1 Color" : `${numColors} Colors`;

    let group = groupMap.get(colorGroupName);
    if (!group) {
      group = {
        name: colorGroupName,
        numColors,
        originalCount: 0,
        reprintCount: 0,
        functionalReprintCount: 0,
        children: [],
        originalities: new Set(),
        rarities: new Set(),
        years: new Set(),
      };
      groupMap.set(colorGroupName, group);
      groupedData.push(group);
    }

    let identityEntry = group.children.find((c) => c.name === colorKey);
    if (!identityEntry) {
      identityEntry = {
        name: colorKey,
        value: 0,
        numColors,
        originalCount: 0,
        reprintCount: 0,
        functionalReprintCount: 0,
        originalities: new Set(),
        rarities: new Set(),
        years: new Set(),
      };
      group.children.push(identityEntry);
    }

    identityEntry.value += 1;
    if (card.originality === "original") identityEntry.originalCount += 1;
    if (card.originality === "reprint") identityEntry.reprintCount += 1;
    if (card.originality === "functional reprint") identityEntry.functionalReprintCount += 1;

    const cardOriginality = card.originality?.toLowerCase();
    const cardRarity = card.rarity?.toLowerCase();
    const cardYear = new Date(card.release_date).getFullYear().toString();

    if (cardOriginality) {
      identityEntry.originalities.add(cardOriginality);
      group.originalities.add(cardOriginality);
    }
    if (cardRarity) {
      identityEntry.rarities.add(cardRarity);
      group.rarities.add(cardRarity);
    }
    if (cardYear) {
      identityEntry.years.add(cardYear);
      group.years.add(cardYear);
    }
  });

  return groupedData;
}

// Data part of createAlluvialChart(): nodes (name, avgPrice) and links.
export function alluvialAggregate(data, priceAttr) {
  const originalitySet = new Set();
  const raritySet = new Set();

  data.forEach((card) => {
    if (card.originality) originalitySet.add(card.originality.toLowerCase());
    if (card.rarity) raritySet.add(card.rarity.toLowerCase());
  });

  const originalityCategories = Array.from(originalitySet).sort();
  const rarityCategories = Array.from(raritySet).sort();

  const origPriceSums = {};
  const origPriceCounts = {};
  const rarityPriceSums = {};
  const rarityPriceCounts = {};
  const linkCounts = {};
  const linkPriceSums = {};
  const linkPriceCounts = {};

  originalityCategories.forEach((o) => (origPriceSums[o] = origPriceCounts[o] = 0));
  rarityCategories.forEach((r) => (rarityPriceSums[r] = rarityPriceCounts[r] = 0));

  data.forEach((card) => {
    const orig = card.originality?.toLowerCase() || "";
    const rarity = card.rarity?.toLowerCase() || "";
    if (!originalitySet.has(orig) || !raritySet.has(rarity)) return;

    const key = `${orig}|${rarity}`;
    linkCounts[key] = (linkCounts[key] || 0) + 1;

    const price = parseFloat(card[priceAttr]);
    if (!isNaN(price)) {
      linkPriceSums[key] = (linkPriceSums[key] || 0) + price;
      linkPriceCounts[key] = (linkPriceCounts[key] || 0) + 1;
      origPriceSums[orig] += price;
      origPriceCounts[orig] += 1;
      rarityPriceSums[rarity] += price;
      rarityPriceCounts[rarity] += 1;
    }
  });

  const nodes = [
    ...originalityCategories.map((o) => ({
      name: o,
      avgPrice: origPriceCounts[o] ? origPriceSums[o] / origPriceCounts[o] : 0,
    })),
    ...rarityCategories.map((r) => ({
      name: r,
      avgPrice: rarityPriceCounts[r] ? rarityPriceSums[r] / rarityPriceCounts[r] : 0,
    })),
  ];

  const links = originalityCategories.flatMap((orig) =>
    rarityCategories.map((rarity) => {
      const key = `${orig}|${rarity}`;
      return {
        source: orig,
        target: rarity,
        value: linkCounts[key] || 0,
        avgPrice: linkPriceCounts[key] ? linkPriceSums[key] / linkPriceCounts[key] : 0,
      };
    })
  );

  return { nodes, links };
}

// Per-set aggregation of createTimelineView().
export function timelineAggregate(data) {
  const setMap = new Map();
  data.forEach((card) => {
    const parsed = new Date(card.release_date);
    const setName = card.set_name;
    if (!setMap.has(setName)) {
      setMap.set(setName, {
        name: setName,
        releaseDate: parsed,
        setType: card.set_type,
        cardCount: 0,
        originalities: new Set(),
        rarities: new Set(),
        colorIdentities: new Set(),
        numColorsPresent: new Set(),
      });
    }
    const setEntry = setMap.get(setName);
    setEntry.cardCount += 1;
    if (card.originality) setEntry.originalities.add(card.originality.toLowerCase());
    if (card.rarity) setEntry.rarities.add(card.rarity.toLowerCase());

    let identity;
    if (!card.color_identity || card.color_identity.length === 0) {
      identity = "Colorless";
      setEntry.numColorsPresent.add(0);
    } else {
      identity = card.color_identity
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("");
      setEntry.numColorsPresent.add(identity.length);
    }
    setEntry.colorIdentities.add(identity);
  });
  return Array.from(setMap.values()).sort((a, b) => a.releaseDate - b.releaseDate);
}

// Yearly rollup of createStackedLineChart() (d3.rollups replaced by a Map).
export function lineAggregate(data) {
  data = data.filter((card) => card.name !== "Gleemax");
  const byYear = new Map();
  for (const card of data) {
    const y = new Date(card.release_date).getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(card);
  }
  const mean = (cards, f) => {
    let s = 0;
    let n = 0;
    for (const c of cards) {
      const v = f(c);
      if (v != null && !isNaN(v)) {
        s += v;
        n++;
      }
    }
    return n ? s / n : undefined;
  };
  return Array.from(byYear, ([year, cards]) => {
    const reprints = cards.filter((c) => c.originality === "functional reprint").length;
    const avgComplexity = mean(cards, (c) => +c.complexity || 0);
    const avgCMC = mean(cards, (c) => +c.cmc || 0);
    const originalities = new Set();
    const rarities = new Set();
    const colorIdentities = new Set();
    const numColorsPresent = new Set();
    cards.forEach((card) => {
      if (card.originality) originalities.add(card.originality.toLowerCase());
      if (card.rarity) rarities.add(card.rarity.toLowerCase());
      let identity;
      let numColors;
      if (!card.color_identity || card.color_identity.length === 0) {
        identity = "Colorless";
        numColors = 0;
      } else {
        identity = card.color_identity
          .slice()
          .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
          .join("");
        numColors = identity.length;
      }
      colorIdentities.add(identity);
      numColorsPresent.add(numColors);
    });
    return {
      year: new Date(year, 0, 1),
      reprints,
      avgComplexity,
      avgCMC,
      originalities,
      rarities,
      colorIdentities,
      numColorsPresent,
    };
  }).sort((a, b) => a.year - b.year);
}

// From idioms/FilterPanel.js: inferFilterCategoryFromValue() + its local
// extractCardValue() for the three candidate categories.
export function inferFilterCategoryFromValue(
  value,
  data,
  candidates = ["Supertypes", "Types", "Subtypes"]
) {
  const extract = (card, category) =>
    category === "Supertypes" ? card.supertype : category === "Types" ? card.type : card.subtype;
  const valueLower = value.trim().toLowerCase();
  const counts = {};
  candidates.forEach((category) => (counts[category] = 0));

  data.forEach((card) => {
    candidates.forEach((category) => {
      const raw = extract(card, category);
      if (!raw) return;
      const values = raw.split(/[\s/]+/).map((v) => v.trim().toLowerCase());
      if (values.includes(valueLower)) {
        counts[category]++;
      }
    });
  });

  const maxCategory = Object.entries(counts).reduce(
    (a, b) => (b[1] > a[1] ? b : a),
    ["", 0]
  )[0];

  return maxCategory;
}
