#!/usr/bin/env python3
"""
i18n Duplicate Key Checker

This script checks for duplicate keys in the English translation file by loading it
as a JSON and comparing all keys as they are, treating the JSON as a flat key-value store.

Usage:
    python check_duplicate_i18n.py [--i18n-dir I18N_DIR] [--case-sensitive]

Options:
    --i18n-dir DIR      Directory containing translation files (default: src/i18n/)
    --case-sensitive    Perform case-sensitive duplicate check (default: case-insensitive)
"""

import os
import re
import sys
import json
import argparse
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Any, Set

def flatten_dict(d: Dict[str, Any], parent_key: str = '', sep: str = '.') -> Dict[str, str]:
    """
    Flatten a nested dictionary into a single level with dot-notation keys.
    """
    items: Dict[str, str] = {}
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.update(flatten_dict(v, new_key, sep=sep))
        else:
            items[new_key] = v
    return items

def find_duplicate_keys(translations: Dict[str, Any], case_sensitive: bool = False) -> Dict[str, List[str]]:
    """
    Find exact duplicate keys by scanning the file line by line.
    Returns a dictionary mapping keys to lists of line numbers where they appear.
    """
    file_path = Path('src/i18n/en.json')
    
    # Track all keys and their line numbers
    key_paths = {}
    duplicates = {}
    
    # Track the current path in the JSON structure
    current_path = []
    
    with open(file_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith('//'):
                continue
                
            # Check for opening/closing braces to track structure
            if line.startswith('{'):
                current_path.append('')
            elif line.startswith('}') and current_path:
                current_path.pop()
            
            # Look for key-value pairs
            key_match = re.search(r'"([^"]+)"\s*:', line)
            if key_match:
                key = key_match.group(1)
                full_path = '.'.join(filter(None, current_path + [key]))
                
                # Normalize if case-insensitive
                path_to_use = full_path.lower() if not case_sensitive else full_path
                
                # Track the line number where this key was found
                if path_to_use in key_paths:
                    if path_to_use not in duplicates:
                        duplicates[path_to_use] = [key_paths[path_to_use]]
                    duplicates[path_to_use].append(line_num)
                else:
                    key_paths[path_to_use] = line_num
                
                # Update current path for nested objects
                if line.rstrip().endswith('{'):
                    current_path.append(key)
    
    # Convert to the expected format: {key_path: [line1, line2, ...]}
    return {k: [f"Line {line}" for line in v] for k, v in duplicates.items()}

def check_duplicates(i18n_dir: str, case_sensitive: bool = False) -> int:
    """Check for duplicate keys in the English translation file."""
    en_file = Path(i18n_dir) / 'en.json'
    
    if not en_file.exists():
        print(f"Error: English translation file not found at {en_file}")
        return 1
    
    try:
        # Load the translations
        with open(en_file, 'r', encoding='utf-8') as f:
            translations = json.load(f)
        
        # Find duplicate keys
        duplicates = find_duplicate_keys(translations, case_sensitive)
        
        if duplicates:
            print("\nDuplicate translation keys found:")
            print("=" * 50)
            for normalized_key, original_keys in sorted(duplicates.items()):
                print(f"Key: {normalized_key}")
                for key in original_keys:
                    print(f"  - {key}")
                print()
            return 1
        else:
            sensitivity = "case-sensitive" if case_sensitive else "case-insensitive"
            print(f"\n✓ No duplicate keys found ({sensitivity} check).")
            return 0
            
    except json.JSONDecodeError as e:
        print(f"Error: {en_file} is not valid JSON: {e}")
        return 1
    except Exception as e:
        print(f"Error processing {en_file}: {e}")
        return 1

def main() -> int:
    parser = argparse.ArgumentParser(description='Check for duplicate i18n keys in the English translation file.')
    parser.add_argument('--i18n-dir', default='src/i18n',
                      help='Directory containing translation files (default: src/i18n/)')
    parser.add_argument('--case-sensitive', action='store_true',
                      help='Perform case-sensitive duplicate check (default: case-insensitive)')
    
    args = parser.parse_args()
    
    print(f"Checking for duplicate keys in {os.path.join(args.i18n_dir, 'en.json')}")
    if not args.case_sensitive:
        print("Note: Performing case-insensitive check. Use --case-sensitive for exact matches only.")
    
    return check_duplicates(args.i18n_dir, args.case_sensitive)

if __name__ == '__main__':
    sys.exit(main())
