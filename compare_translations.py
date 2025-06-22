#!/usr/bin/env python3
import json
from pathlib import Path

def load_json(file_path):
    """Load JSON file and return parsed data"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return None

def prune_extras(ref, trans, path=""):
    """Recursively remove keys from trans that are not in ref. Returns True if any changes were made."""
    changed = False
    if isinstance(ref, dict) and isinstance(trans, dict):
        ref_keys = set(ref.keys())
        trans_keys = set(trans.keys())
        for key in list(trans_keys - ref_keys):
            print(f"  Pruning extra key: {path + '.' if path else ''}{key}")
            del trans[key]
            changed = True
        for key in ref_keys & trans_keys:
            if prune_extras(ref[key], trans[key], f"{path}.{key}" if path else key):
                changed = True
    elif isinstance(ref, list) and isinstance(trans, list):
        # Optionally, could prune list length, but usually lists are not pruned in i18n
        pass
    return changed

def prune_translation_file(ref, lang_file):
    trans = load_json(lang_file)
    if not trans:
        print(f"  Could not load {lang_file}")
        return
    changed = prune_extras(ref, trans)
    if changed:
        with open(lang_file, 'w', encoding='utf-8') as f:
            json.dump(trans, f, indent=2, ensure_ascii=False)
        print(f"  Pruned and updated {lang_file}")
    else:
        print(f"  No changes needed for {lang_file}")

def main():
    base_path = Path("src/i18n")
    en_data = load_json(base_path / "en.json")
    if not en_data:
        return
    languages = ["de", "es", "fr"]
    for lang in languages:
        print(f"\nPruning extras in {lang.upper()}:")
        lang_file = base_path / f"{lang}.json"
        prune_translation_file(en_data, lang_file)

if __name__ == "__main__":
    main() 