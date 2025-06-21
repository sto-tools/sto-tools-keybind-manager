#!/usr/bin/env python3
import json
import sys
from pathlib import Path

def load_json(file_path):
    """Load JSON file and return parsed data"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return None

def get_all_keys(obj, prefix=""):
    """Recursively get all keys from a nested JSON object"""
    keys = set()
    if isinstance(obj, dict):
        for key, value in obj.items():
            full_key = f"{prefix}.{key}" if prefix else key
            keys.add(full_key)
            if isinstance(value, dict):
                keys.update(get_all_keys(value, full_key))
    return keys

def compare_translations():
    """Compare English translations with other language files"""
    base_path = Path("src/i18n")
    
    # Load English (reference) file
    en_data = load_json(base_path / "en.json")
    if not en_data:
        return
    
    en_keys = get_all_keys(en_data)
    print(f"English file has {len(en_keys)} keys")
    
    # Compare with other language files
    languages = ["de", "es", "fr"]
    
    for lang in languages:
        lang_file = base_path / f"{lang}.json"
        lang_data = load_json(lang_file)
        
        if not lang_data:
            continue
            
        lang_keys = get_all_keys(lang_data)
        missing_keys = en_keys - lang_keys
        
        print(f"\n{lang.upper()} file has {len(lang_keys)} keys")
        print(f"Missing {len(missing_keys)} keys:")
        
        for key in sorted(missing_keys):
            print(f"  - {key}")

if __name__ == "__main__":
    compare_translations() 