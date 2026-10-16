// Card-level helpers shared by every view.
//
// prepareCards() runs once at load and attaches derived fields so that views no
// longer re-parse dates or re-sort color identities on every render. The fields
// are non-enumerable: they don't show up in JSON, in `{...card}` spreads or in
// Object.keys(), so the dataset's own shape is unchanged.

export const COLOR_ORDER = "WUBRG";
export const COLORLESS = "Colorless";

const RANK = { W: 0, U: 1, B: 2, R: 3, G: 4 };

/** Canonical color identity key, always in WUBRG order: ["U","W"] → "WU". */
export function identityKey(colors) {
  if (!Array.isArray(colors) || colors.length === 0) return COLORLESS;
  return colors.slice().sort((a, b) => RANK[a] - RANK[b]).join("");
}

/**
 * Release year straight from the ISO date string ("1993-08-05" → 1993).
 * Timezone independent, unlike `new Date(str).getFullYear()`.
 */
export function releaseYear(date) {
  if (!date) return null;
  const y = Number(String(date).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function define(card, name, value) {
  Object.defineProperty(card, name, { value, writable: true, configurable: true, enumerable: false });
}

/**
 * Attach derived fields to every card (in place) and return the same array.
 *   _ci   color identity key ("WU" | "Colorless")
 *   _nc   number of colors in the identity (0–5)
 *   _year release year (number | null)
 *   _orig lower-cased originality ("" if missing)
 *   _rar  lower-cased rarity ("" if missing)
 */
export function prepareCards(cards) {
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (card.index !== i) {
      throw new Error(`prepareCards: card.index (${card.index}) must equal its position (${i})`);
    }
    const colors = Array.isArray(card.color_identity) ? card.color_identity : [];
    define(card, "_ci", identityKey(colors));
    define(card, "_nc", Math.min(colors.length, 5));
    define(card, "_year", releaseYear(card.release_date));
    define(card, "_orig", card.originality ? card.originality.toLowerCase() : "");
    define(card, "_rar", card.rarity ? card.rarity.toLowerCase() : "");
  }
  return cards;
}
