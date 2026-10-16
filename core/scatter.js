// Scatterplot data preparation: one entry per card *name*, aggregated over the
// printings in the current filtered set.
//
// Output is identical to the legacy prepareScatterData() (see
// tests/views-data.test.mjs); the speed-up comes from deciding eligibility once
// per printing up front and comparing ISO date strings instead of building two
// Date objects per printing.

const EXCLUDED_SET_TYPES = new Set(["memorabilia", "alchemy", "token"]);
const EXCLUDED_SET_NAME_PARTS = ["Arena", "Alchemy", "Digital"];

/** Whether a printing is drawn in the Scatterplot at all. */
export function isScatterEligible(card) {
  return !(
    card.digital ||
    EXCLUDED_SET_TYPES.has(card.set_type) ||
    EXCLUDED_SET_NAME_PARTS.some((part) => card.set_name?.includes(part))
  );
}

export function createScatterPrep(allCards) {
  const eligible = new Uint8Array(allCards.length);
  for (let i = 0; i < allCards.length; i++) eligible[i] = isScatterEligible(allCards[i]) ? 1 : 0;

  function prepare(cards, priceAttr) {
    const byName = new Map();
    const minDate = new Map(); // name → earliest ISO date string

    for (const card of cards) {
      if (!eligible[card.index]) continue;

      let entry = byName.get(card.name);
      if (!entry) {
        entry = {
          ...card,
          prices: [],
          setTypes: new Map(),
          printImages: [],
          printMetadata: [],
          tooltip_image: null,
          foundOriginal: false,
          all_years: new Set(),
          all_originalities: new Set(),
        };
        byName.set(card.name, entry);
      }

      entry.setTypes.set(card.set_name, card.set_type);
      if (!entry.all_set_types) entry.all_set_types = new Set();
      if (card.set_type) entry.all_set_types.add(card.set_type.toLowerCase());

      const p = card[priceAttr];
      const price = isNaN(p) || p == null ? 0 : p;
      if (!isNaN(card.complexity)) entry.prices.push(price);

      if (card.release_date && card._year != null) {
        entry.all_years.add(card._year);
        const m = minDate.get(card.name);
        if (m === undefined || card.release_date < m) minDate.set(card.name, card.release_date);
      }

      if (card.originality) entry.all_originalities.add(card._orig);

      const isOriginal = card.originality === "original";
      if (card.image_normal) {
        entry.printImages.push(card.image_normal);
        entry.printMetadata.push({ image: card.image_normal, set_name: card.set_name, set_type: card.set_type });
        if (!entry.foundOriginal && isOriginal) {
          entry.tooltip_image = card.image_normal;
          entry.foundOriginal = true;
        }
      } else if (Array.isArray(card.faces)) {
        for (const face of card.faces) {
          if (!face.image_normal) continue;
          entry.printImages.push(face.image_normal);
          entry.printMetadata.push({ image: face.image_normal, set_name: card.set_name, set_type: card.set_type });
          if (!entry.foundOriginal && isOriginal) {
            entry.tooltip_image = face.image_normal;
            entry.foundOriginal = true;
          }
        }
      }
    }

    const result = [];
    for (const entry of byName.values()) {
      entry.all_sets = Array.from(entry.setTypes, ([name, type]) => ({ name, type }));
      entry.all_set_types = Array.from(entry.all_set_types || []);
      entry.all_years = Array.from(entry.all_years);
      entry.all_originalities = Array.from(entry.all_originalities);
      entry.all_print_images = entry.printImages;
      entry.print_image_metadata = entry.printMetadata;
      entry.tooltip_image = entry.tooltip_image || entry.image_normal;

      let sum = 0;
      for (const x of entry.prices) sum += x;
      entry.avg_price = entry.prices.length > 0 ? sum / entry.prices.length : 0;

      const m = minDate.get(entry.name);
      if (m !== undefined) {
        entry.earliest_release_date = new Date(m);
        entry.release_date = entry.earliest_release_date;
      }
      result.push(entry);
    }
    return result;
  }

  return { prepare, isEligible: (card) => eligible[card.index] === 1 };
}
