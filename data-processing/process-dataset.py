import pandas as pd
import json

input_file = './src/Dataset_MTG_Cards.json'
output_file = '../data/dataProcessed.json'

# Open output file in write mode
with open(output_file, 'w', encoding='utf-8') as out_file:
    out_file.write('[')  # Start JSON array

    first_record = True  # Track if it's the first record to handle commas

    with open(input_file, 'r', encoding='utf-8') as in_file:
        for line in in_file:
            try:
                data = json.loads(line)  # Load each JSON line
                if 'name' in data:
                    if not first_record:
                        out_file.write(',')  # Add comma between records
                    json.dump({'name': data['name']}, out_file, ensure_ascii=False)
                    first_record = False
            except json.JSONDecodeError as e:
                print(f"Error decoding line: {e}")

    out_file.write(']')  # End JSON array
