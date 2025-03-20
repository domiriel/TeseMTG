import os
import json
from decimal import Decimal
from collections import Counter, defaultdict

# Custom encoder to handle Decimal types
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

# Paths
input_file = './src/Dataset_MTG_Cards.json'
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

# Process dataset
with open(output_file, 'w') as outfile:
    outfile.write('[\n')  # Start of JSON array

    for index, card in enumerate(all_cards):
        color_identity = card.get('color_identity', [])
        type_line = card.get('type_line', '')

        # Extract supertype, type, and subtype
        supertype, type_, subtype = '', '', ''
        if '—' in type_line:
            parts = type_line.split('—')
            type_part = parts[0].strip()
            subtype = parts[1].strip() if len(parts) > 1 else ''
            type_parts = type_part.split(' ')
            supertype = ' '.join(type_parts[:-1]) if len(type_parts) > 1 else ''
            type_ = type_parts[-1]
        else:
            type_ = type_line

        # Update counters
        color_count[len(color_identity)] += 1
        color_identity_count[tuple(sorted(color_identity))] += 1
        rarity_count[card.get('rarity', 'unknown')] += 1

        originality = determine_originality(card)
        originality_count[originality] += 1

        # Extract set name and set type
        card_details = {
            "name": card.get('name'),
            "cmc": card.get('cmc', 0),
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
            "price_eur": float(card.get('prices', {}).get('eur', 0) or 0),
            "set_name": card.get('set_name', 'Unknown'),
            "set_type": card.get('set_type', 'Unknown'),
        }

        if index > 0:
            outfile.write(',\n')

        json.dump(card_details, outfile, separators=(',', ':'), cls=DecimalEncoder)

    outfile.write('\n]')  # End of JSON array

# Display statistics
print("Color Count:", dict(color_count))
print("Color Identity Count:", dict(color_identity_count))
print("Rarity Count:", dict(rarity_count))
print("Originality Count:", dict(originality_count))
print(f"All card details have been saved to '{output_file}'")
