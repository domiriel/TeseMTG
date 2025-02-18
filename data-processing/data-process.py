import os
import json
from decimal import Decimal
from collections import Counter

# Custom encoder to handle Decimal types
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

# Path to the large JSON file
input_file = './src/Dataset_MTG_Cards.json'

# Ensure the 'data' folder exists
output_dir = './data'
os.makedirs(output_dir, exist_ok=True)

# Output file path
output_file = os.path.join(output_dir, 'card_details.json')

# Function to determine the originality of the card
def determine_originality(card, all_cards):
    name = card.get('name')
    cmc = card.get('cmc', 0)
    type_line = card.get('type_line', '')
    oracle_text = card.get('oracle_text', '')
    power = card.get('power', '')
    toughness = card.get('toughness', '')
    release_date = card.get('released_at', '')

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

    for existing_card in all_cards:
        if (
            existing_card.get('name', '') != name and
            existing_card.get('cmc', 0) == cmc and
            existing_card.get('supertype', '') == supertype and
            existing_card.get('type', '') == type_ and
            existing_card.get('subtype', '') == subtype and
            existing_card.get('oracle_text', '') == oracle_text and
            existing_card.get('power', '') == power and
            existing_card.get('toughness', '') == toughness and
            existing_card.get('release_date', '') < release_date
        ):
            return 'functional reprint'

    if card.get('reprint'):
        return 'reprint'
    
    return 'original'

# Function to calculate complexity
def calculate_complexity(card):
    oracle_text = card.get('oracle_text', '')
    ctl = len(oracle_text.split())
    return ctl

# Counters for statistics
color_count = Counter()
color_identity_count = Counter()
rarity_count = Counter()
originality_count = Counter()
all_cards = []

# Load entire dataset into memory
with open(input_file, 'r', encoding='utf-8') as file:
    all_cards = json.load(file)

# Prepare to write to the output JSON file
with open(output_file, 'w') as outfile:
    outfile.write('[\n')  # Start of JSON array with a newline

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

        originality = determine_originality(card, all_cards)
        originality_count[originality] += 1

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
            "complexity": calculate_complexity(card)
        }

        if index > 0:
            outfile.write(',\n')

        json.dump(card_details, outfile, separators=(',', ':'), cls=DecimalEncoder)

    outfile.write('\n]')

# Display statistics
print("Color Count:", dict(color_count))
print("Color Identity Count:", dict(color_identity_count))
print("Rarity Count:", dict(rarity_count))
print("Originality Count:", dict(originality_count))
print(f"All card details have been saved to '{output_file}'")
