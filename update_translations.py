#!/usr/bin/env python3
"""
Transaction-based translation updater for i18n files.
Usage: python update_translations.py < transaction.json
   or: python update_translations.py transaction.json

The transaction file should contain:
{
  "de": {
    "new_key": "Neuer Wert",
    "command_definitions.new_nested_key": {
      "name": "Neuer Name",
      "description": "Neue Beschreibung"
    }
  },
  "es": { ... },
  "fr": { ... }
}
"""
import json
import sys
from pathlib import Path
from copy import deepcopy

def load_json(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return None

def save_json(file_path, data):
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def merge_dict(target, updates, path='', added=None, updated=None):
    """Recursively merge updates into target. Track added/updated keys."""
    if added is None: added = []
    if updated is None: updated = []
    for key, value in updates.items():
        full_path = f"{path}.{key}" if path else key
        if isinstance(value, dict):
            if key not in target or not isinstance(target[key], dict):
                target[key] = {}
            merge_dict(target[key], value, full_path, added, updated)
        else:
            if key not in target:
                added.append(full_path)
            elif target[key] != value:
                updated.append(full_path)
            target[key] = value
    return added, updated

def set_by_dot_notation(d, dotted_key, value):
    """Set a value in a nested dict using dot notation."""
    keys = dotted_key.split('.')
    for k in keys[:-1]:
        if k not in d or not isinstance(d[k], dict):
            d[k] = {}
        d = d[k]
    d[keys[-1]] = value

def apply_dot_notation_updates(target, updates):
    for dotted_key, value in updates.items():
        if '.' in dotted_key:
            set_by_dot_notation(target, dotted_key, value)
        else:
            target[dotted_key] = value

def verify_transaction(transaction, en_data):
    """Verify that the transaction structure is valid against English reference."""
    errors = []
    for lang, updates in transaction.items():
        if lang not in ['de', 'es', 'fr']:
            errors.append(f"Unknown language: {lang}")
        for key, value in updates.items():
            if '.' in key:
                # Check if the path exists in English
                keys = key.split('.')
                current = en_data
                for k in keys[:-1]:
                    if k not in current:
                        errors.append(f"Path {key} does not exist in English reference")
                        break
                    current = current[k]
            else:
                if key not in en_data:
                    errors.append(f"Key {key} does not exist in English reference")
    return errors

def update_translation_file(lang, ref, lang_file, updates):
    trans = load_json(lang_file)
    if not trans:
        print(f"  Could not load {lang_file}")
        return False
    # Apply dot notation updates first
    dot_updates = {k: v for k, v in updates.items() if '.' in k}
    nested_updates = {k: v for k, v in updates.items() if '.' not in k}
    apply_dot_notation_updates(trans, dot_updates)
    # Merge nested updates
    added, updated = merge_dict(trans, nested_updates)
    save_json(lang_file, trans)
    print(f"  Updated {lang_file}")
    if added:
        print(f"    Added keys: {added}")
    if updated:
        print(f"    Updated keys: {updated}")
    return True

def main():
    # Read transaction from stdin or file
    if len(sys.argv) > 1:
        transaction_file = sys.argv[1]
        try:
            with open(transaction_file, 'r', encoding='utf-8') as f:
                transaction = json.load(f)
        except Exception as e:
            print(f"Error reading transaction file {transaction_file}: {e}")
            return
    else:
        try:
            transaction = json.load(sys.stdin)
        except Exception as e:
            print(f"Error reading transaction from stdin: {e}")
            return

    # Load English reference
    base_path = Path("src/i18n")
    en_data = load_json(base_path / "en.json")
    if not en_data:
        return

    # Verify transaction
    errors = verify_transaction(transaction, en_data)
    if errors:
        print("Transaction verification failed:")
        for error in errors:
            print(f"  {error}")
        return

    # Apply transaction
    print("Applying transaction...")
    for lang, updates in transaction.items():
        print(f"\nUpdating {lang.upper()}:")
        lang_file = base_path / f"{lang}.json"
        update_translation_file(lang, en_data, lang_file, updates)

if __name__ == "__main__":
    main() 