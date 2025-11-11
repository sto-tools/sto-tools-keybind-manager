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

def find_missing_keys(ref_data, trans_data, path=""):
    """Recursively find keys in ref_data that are missing from trans_data"""
    missing_keys = []
    if isinstance(ref_data, dict) and isinstance(trans_data, dict):
        ref_keys = set(ref_data.keys())
        trans_keys = set(trans_data.keys())
        for key in ref_keys - trans_keys:
            missing_keys.append(f"{path + '.' if path else ''}{key}")
        for key in ref_keys & trans_keys:
            missing_keys.extend(find_missing_keys(ref_data[key], trans_data[key], f"{path}.{key}" if path else key))
    elif isinstance(ref_data, list) and isinstance(trans_data, list):
        # For lists, we could check if lengths match, but typically i18n lists are not pruned
        pass
    return missing_keys

def check_missing_keys(en_data, lang_file, lang_name):
    """Check for keys missing from a specific language file"""
    trans_data = load_json(lang_file)
    if not trans_data:
        print(f"  Could not load {lang_file}")
        return []
    
    missing_keys = find_missing_keys(en_data, trans_data)
    if missing_keys:
        print(f"  Missing keys in {lang_name.upper()}:")
        for key in sorted(missing_keys):
            print(f"    {key}")
    else:
        print(f"  No missing keys in {lang_name.upper()}")
    
    return missing_keys

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
    
    # First, check for missing keys
    print("=== CHECKING FOR MISSING KEYS ===")
    all_missing_keys = {}
    for lang in languages:
        print(f"\nChecking {lang.upper()}:")
        lang_file = base_path / f"{lang}.json"
        missing_keys = check_missing_keys(en_data, lang_file, lang)
        if missing_keys:
            all_missing_keys[lang] = missing_keys
    
    # Summary of missing keys
    if all_missing_keys:
        print(f"\n=== SUMMARY: MISSING KEYS ===")
        for lang, keys in all_missing_keys.items():
            print(f"{lang.upper()}: {len(keys)} missing keys")
        
        # Find keys missing from multiple languages
        print(f"\n=== KEYS MISSING FROM MULTIPLE LANGUAGES ===")
        key_counts = {}
        for lang, keys in all_missing_keys.items():
            for key in keys:
                key_counts[key] = key_counts.get(key, 0) + 1
        
        for key, count in sorted(key_counts.items(), key=lambda x: (-x[1], x[0])):
            if count > 1:
                missing_langs = [lang for lang, keys in all_missing_keys.items() if key in keys]
                print(f"  {key} (missing from {count} languages: {', '.join(missing_langs)})")
    else:
        print(f"\n=== SUMMARY: NO MISSING KEYS ===")
        print("All language files have the same keys as en.json")
    
    # Then, prune extra keys (original functionality)
    print(f"\n=== PRUNING EXTRA KEYS ===")
    for lang in languages:
        print(f"\nPruning extras in {lang.upper()}:")
        lang_file = base_path / f"{lang}.json"
        prune_translation_file(en_data, lang_file)

if __name__ == "__main__":
    main() 
    