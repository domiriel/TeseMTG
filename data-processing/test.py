import json

# Sample test dataset with two cards
sample_cards = [
    {
        "name": "Test Card B",
        "cmc": 3,
        "type_line": "Creature — Elf Warrior",
        "oracle_text": "Test ability",
        "power": "2",
        "toughness": "2",
        "released_at": "2020-01-01",
        "reprint": False
    },
    {
        "name": "Test Card B",
        "cmc": 3,
        "type_line": "Creature — Elf Warrior",
        "oracle_text": "Test ability",
        "power": "2",
        "toughness": "2",
        "released_at": "2022-01-01",
        "reprint": False
    }
]

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
            existing_card.get('type_line', '') == type_line and
            existing_card.get('oracle_text', '') == oracle_text and
            existing_card.get('power', '') == power and
            existing_card.get('toughness', '') == toughness and
            existing_card.get('released_at', '') < release_date
        ):
            return 'functional reprint'

    if card.get('reprint'):
        return 'reprint'
    
    return 'original'

# Run test on sample cards
for card in sample_cards:
    originality = determine_originality(card, sample_cards)
    print(f"Card: {card['name']}, Originality: {originality}")
