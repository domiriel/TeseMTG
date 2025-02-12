import ijson
import json
from decimal import Decimal

# Custom encoder to handle Decimal types
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def determine_originality(card):
    if card.get('reprint'):
        return 'reprint'
    else:
        return 'original'
# Path to the large JSON file
input_file = './src/Dataset_MTG_Cards.json'

# Function to calculate complexity
def calculate_complexity(card):
    # Card Text Length (CTL)
    oracle_text = card.get('oracle_text', '')
    ctl = len(oracle_text.split())


    # Total Complexity
    complexity = ctl
    return complexity


# Prepare to write to the output JSON file
with open(input_file, 'r', encoding='utf-8') as file, open('card_details.json', 'w') as outfile:
    parser = ijson.items(file, 'item')  # Parse each item in the JSON array
    outfile.write('[\n')  # Start of JSON array with a newline

    for index, card in enumerate(parser):
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

        card_details = {
            "name": card.get('name'),
            "cmc": card.get('cmc'),
            "keywords": card.get('keywords'),
            "color_identity": color_identity,
            "number_of_colours": len(color_identity),  # New attribute
            "supertype": supertype,
            "type": type_,
            "subtype": subtype,
            "originality": determine_originality(card),
            "edhrec_rank": card.get('edhrec_rank'),
            "set_name": card.get('set_name'),
            "set_type": card.get('set_type'),
            "rarity": card.get('rarity'),
            "release_date": card.get('released_at'),
            "complexity": calculate_complexity(card),  # Adjusted complexity attribute
            "prices": card.get('prices')
        }

        if index > 0:
            outfile.write(',\n')  # Add comma and newline before each item except the first

        # Use the custom encoder to handle Decimal values
        json.dump(card_details, outfile, separators=(',', ':'), cls=DecimalEncoder)

    outfile.write('\n]')  # End of JSON array with a newline

print("All card details have been saved to 'card_details.json'")
