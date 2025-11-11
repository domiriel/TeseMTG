[← Back to main page](../)

The preprocessing step reads the raw Scryfall export and produces a normalized `card_details.json` used by all visualizations. For each non-memorabilia card, we derive and store:

- `name` – canonicalized front-face name.
- `cmc` – converted to numeric.
- `keywords` – Scryfall `keywords` array.
- `color_identity` – sorted W/U/B/R/G identity; lands are forced to colorless.
- `number_of_colours` – length of `color_identity`.
- `supertype`, `type`, `subtype` – parsed from `type_line` (front face only).
- `rarity`
- `release_date` – from `released_at`.
- `originality` – one of `original`, `reprint`, `functional reprint`, computed via rules over mana cost, type line, oracle text, P/T and release date.
- `complexity` – word count of oracle text (all faces).
- `digital` – Scryfall `digital` flag.
- `edhrec_rank`
- `price_usd`, `price_usd_foil`, `price_usd_etched`,
  `price_eur`, `price_eur_foil`, `price_tix` – numeric, 0 when missing/invalid.
- `set_name`
- `set_type` – prettified `set_type` (underscores → spaces).
- `image_normal` – primary display image.
- `faces` – minimal per-face info (`name`, `mana_cost`, `type_line`, `image_normal`) for multi-faced cards.
- `index` – stable sequential id used across views.

