import os
import json
from decimal import Decimal
from collections import Counter, defaultdict

MTG_SUPERTYPES = {"Basic", "Legendary", "Ongoing","Token", "Snow", "World", "Host", "Elite"}
MTG_CARD_TYPES = {
    "Artifact", "Conspiracy", "Creature","Dungeon", "Emblem", "Enchantment","Hero", "Instant","Kindred", "Land", "Phenomenon",
    "Plane", "Planeswalker", "Scheme", "Sorcery", "Vanguard", "Battle"
}

def parse_type_line(type_line):
    # Handle double-faced/split/meld cards — we only parse the front face
    front_type_line = type_line.split("//")[0].strip()

    # Split into subtypes (if any)
    if '—' in front_type_line:
        type_part, subtype = map(str.strip, front_type_line.split('—', 1))
    else:
        type_part, subtype = front_type_line.strip(), ''

    words = type_part.split()
    supertypes = [w for w in words if w in MTG_SUPERTYPES]
    types = [w for w in words if w in MTG_CARD_TYPES]

    return {
        "supertype": ' '.join(supertypes) if supertypes else '',
        "type": ' '.join(types) if types else '',
        "subtype": subtype
    }

# Custom encoder to handle Decimal types
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

# Paths
input_file = './src/MTG_DATASET_2.json'
output_dir = './data'
os.makedirs(output_dir, exist_ok=True)
output_file = os.path.join(output_dir, 'card_details.json')

# Function to calculate complexity
def calculate_complexity(card):
    oracle_text = card.get('oracle_text', '')
    return len(oracle_text.split())

# Precompute dictionaries to speed up originality determination
originality_lookup = defaultdict(list)

# Load entire dataset and build lookup dictionaries
with open(input_file, 'r', encoding='utf-8') as file:
    all_cards = json.load(file)

    for card in all_cards:
        key = (card.get('cmc', 0), card.get('type_line', ''), card.get('oracle_text', ''),
               card.get('power', ''), card.get('toughness', ''))
        originality_lookup[key].append(card)

# Function to determine originality of the card
def determine_originality(card):
    key = (card.get('cmc', 0), card.get('type_line', ''), card.get('oracle_text', ''),
           card.get('power', ''), card.get('toughness', ''))

    existing_cards = originality_lookup.get(key, [])
    
    for existing_card in existing_cards:
        if existing_card.get('name', '') != card.get('name', '') and \
           existing_card.get('released_at', '') < card.get('released_at', ''):
            return 'functional reprint'

    return 'reprint' if card.get('reprint') else 'original'

# Counters for statistics
color_count = Counter()
color_identity_count = Counter()
rarity_count = Counter()
originality_count = Counter()
supertype_count = Counter()
type_count = Counter()
subtype_count = Counter()


# Process dataset
with open(output_file, 'w') as outfile:
    outfile.write('[\n')  # Start of JSON array

    for index, card in enumerate(all_cards):
        color_identity = card.get('color_identity', [])
        type_line = card.get('type_line', '')

        # Extract supertype, type, and subtype
        parsed = parse_type_line(type_line)
        supertype = parsed['supertype'] if parsed['supertype'] else 'Basic'
        type_ = parsed['type']
        subtype = parsed['subtype']


        # If the card is a Land, override color to be colorless
        if "Land" in type_:
            color_identity = []

        supertype_count[supertype] += 1
        type_count[type_] += 1
        subtype_count[subtype] += 1

        # Update counters
        color_count[len(color_identity)] += 1
        color_identity_count[tuple(sorted(color_identity))] += 1
        rarity_count[card.get('rarity', 'unknown')] += 1


        # Determine foil_status
        price_usd = float(card.get('prices', {}).get('usd', 0) or 0)
        price_usd_foil = float(card.get('prices', {}).get('usd_foil', 0) or 0)
        price_eur = float(card.get('prices', {}).get('eur', 0) or 0)
        price_eur_foil = float(card.get('prices', {}).get('eur_foil', 0) or 0)

        if (price_usd == 0 and price_eur == 0) and (price_usd_foil > 0 or price_eur_foil > 0):
            foil_status = 'always_foil'
        elif (price_usd_foil == 0 and price_eur_foil == 0):
            foil_status = 'always_non_foil'
        else:
            foil_status = 'can_be_foil'

        originality = determine_originality(card)
        originality_count[originality] += 1

        # Extract set name and set type
        image_uris = card.get('image_uris', {})

        faces_data = []
        if 'card_faces' in card:
            for face in card['card_faces']:
                faces_data.append({
                    "name": face.get('name'),
                    "mana_cost": face.get('mana_cost', ''),
                    "type_line": face.get('type_line', ''),
                    "image_normal": face.get('image_uris', {}).get('normal', ''),
                  

                    })
        else:
            faces_data.append({
                "name": card.get('name'),
                "mana_cost": card.get('mana_cost', ''),
                "type_line": card.get('type_line', ''),
                "image_normal": image_uris.get('normal', ''),

            })
        card_details = {
            "name": card.get('name'),
            "cmc": float(card.get('cmc', 0)),
            "keywords": card.get('keywords', []),
            "color_identity": color_identity,
            "number_of_colours": len(color_identity),
            "supertype": supertype,
            "type": type_,
            "subtype": subtype,
            "rarity": card.get('rarity', 'unknown'),
            "release_date": card.get('released_at', ''),
            "originality": originality,
            "complexity": calculate_complexity(card),
            "digital": card.get('digital', False),
            "edhrec_rank": card.get('edhrec_rank', 0),
            "price_usd": float(card.get('prices', {}).get('usd', 0) or 0),
            "price_usd_foil": float(card.get('prices', {}).get('usd_foil', 0) or 0),
            "price_usd_etched": float(card.get('prices', {}).get('usd_etched', 0) or 0),
            "price_eur": float(card.get('prices', {}).get('eur', 0) or 0),
            "price_eur_foil": float(card.get('prices', {}).get('eur_foil', 0) or 0),
            "price_tix": float(card.get('prices', {}).get('tix', 0) or 0),
            "set_name": card.get('set_name', 'Unknown'),
            "set_type": card.get('set_type', 'Unknown'),
            "image_normal": image_uris.get('normal', ''),
            "faces": faces_data,
            "foil_status": foil_status,

        }

        if index > 0:
            outfile.write(',\n')

        json.dump(card_details, outfile, separators=(',', ':'), cls=DecimalEncoder)

    outfile.write('\n]')  # End of JSON array

total_cards = len(all_cards)
supertype_total = sum(supertype_count.values())
type_total = sum(type_count.values())
subtype_total = sum(subtype_count.values())


print("Supertype Count:", dict(supertype_count))
print("Type Count:", dict(type_count))
print(f"Total cards processed: {total_cards}")
print(f"Sum of all supertypes counted: {supertype_total}")
print(f"Sum of all types counted: {type_total}")
print(f"Sum of all subtypes counted: {subtype_total}")
print(f"All card details have been saved to '{output_file}'")

