#!/usr/bin/env python3
"""
Test Anti-Pattern Detector

Scans test files for problematic testing patterns that provide false confidence
by masking real issues or providing weak validation.

Anti-patterns detected:
1. Conditional test execution (if statements that skip tests)
2. Fallback patterns (try-catch with weak assertions)
3. Function existence tests (only checking typeof === 'function')
4. Weak toBeDefined() assertions
5. Mock testing instead of real components
6. Silent failure patterns
7. Weak not.toThrow() patterns
8. Generic toBeTruthy() fallbacks
"""

import os
import re
import sys
import json
from typing import List, Dict, Tuple, NamedTuple, Optional
from dataclasses import dataclass

@dataclass
class AntiPattern:
    name: str
    pattern: str
    description: str
    severity: str  # 'high', 'medium', 'low'

class Detection(NamedTuple):
    filename: str
    line_number: int
    pattern_name: str
    code_line: str
    context: List[str]  # surrounding lines
    is_false_positive: bool = False
    false_positive_reason: Optional[str] = None

@dataclass
class FalsePositive:
    file: str
    function: str
    line_range: List[int]  # [start, end]
    pattern_name: str
    code_snippet: str
    reason: str
    reviewed_by: str
    review_date: str
    confidence: str  # "high", "medium", "low"

class TestAntiPatternDetector:
    def __init__(self, false_positives_file: str = "false_positives.json", line_tolerance: int = 5):
        self.false_positives_file = false_positives_file
        self.line_tolerance = line_tolerance  # Allow this many lines of drift for fuzzy matching
        self.false_positives = self.load_false_positives()
        self.anti_patterns = [
            # 1. Conditional test execution patterns
            AntiPattern(
                name="Conditional Test Execution",
                pattern=r'^\s*if\s*\([^)]*\)\s*\{?\s*$',
                description="Tests wrapped in conditional statements that may skip execution",
                severity="high"
            ),
            
            # 2. Try-catch fallback patterns
            AntiPattern(
                name="Try-Catch Fallback",
                pattern=r'^\s*}\s*catch\s*\([^)]*\)\s*\{\s*$',
                description="Catch blocks that may hide real test failures",
                severity="high"
            ),
            
            # 3. Generic toBeTruthy fallbacks
            AntiPattern(
                name="Generic toBeTruthy Fallback",
                pattern=r'expect\(true\)\.toBeTruthy\(\)',
                description="Generic truthy assertions that always pass",
                severity="high"
            ),
            
            # 4. Function existence tests
            AntiPattern(
                name="Function Existence Test",
                pattern=r'expect\(typeof\s+[^)]+\)\.toBe\([\'"]function[\'"]\)',
                description="Tests that only check if functions exist, not their behavior",
                severity="medium"
            ),
            
            # 5. Weak toBeDefined assertions (context-aware)
            AntiPattern(
                name="Weak toBeDefined Assertion",
                pattern=r'expect\([^)]+\)\.toBeDefined\(\)',
                description="Weak assertions that pass for any non-undefined value",
                severity="medium"
            ),
            
            # 6. Weak not.toThrow patterns
            AntiPattern(
                name="Weak not.toThrow Pattern",
                pattern=r'expect\([^)]+\)\.not\.toThrow\(\)',
                description="Tests that only verify no exceptions, not actual behavior",
                severity="medium"
            ),
            
            # 7. Mock testing patterns (suspicious)
            AntiPattern(
                name="Suspicious Mock Usage",
                pattern=r'\.mockImplementation\(|\.mockReturnValue\(|jest\.fn\(',
                description="Mock usage that may be testing mocks instead of real behavior",
                severity="low"
            ),
            
            # 8. Silent failure patterns
            AntiPattern(
                name="Silent Failure Pattern",
                pattern=r'expect\([^)]*\)\.toBeFalsy\(\).*//.*fail',
                description="Tests that expect failure but may mask real issues",
                severity="medium"
            ),
            
            # 9. Conditional execution with result checks
            AntiPattern(
                name="Conditional Result Check",
                pattern=r'if\s*\(\s*result\s*\)',
                description="Tests that conditionally execute based on result existence",
                severity="high"
            ),
            
            # 10. Conditional execution with component checks
            AntiPattern(
                name="Conditional Component Check",
                pattern=r'if\s*\(\s*\w+Manager\s*\)',
                description="Tests that conditionally execute based on manager/component existence",
                severity="high"
            ),
            
            # 11. Conditional execution with element checks
            AntiPattern(
                name="Conditional Element Check",
                pattern=r'if\s*\(\s*element\s*\)',
                description="Tests that conditionally execute based on DOM element existence",
                severity="high"
            ),
            
            # 12. Empty catch blocks
            AntiPattern(
                name="Empty Catch Block",
                pattern=r'}\s*catch\s*\([^)]*\)\s*\{\s*}',
                description="Empty catch blocks that silently ignore errors",
                severity="high"
            ),
            
            # 13. Weak object type checks
            AntiPattern(
                name="Weak Object Type Check",
                pattern=r'expect\(typeof\s+[^)]+\)\.toBe\([\'"]object[\'"]\)',
                description="Weak object type checks that don't validate structure",
                severity="low"
            ),
            
            # 14. Generic expect.anything() overuse
            AntiPattern(
                name="Generic expect.anything() Overuse",
                pattern=r'expect\.anything\(\)',
                description="Overuse of expect.anything() which accepts any value",
                severity="low"
            ),
            
            # 15. Conditional test descriptions
            AntiPattern(
                name="Conditional Test Description",
                pattern=r'it\(.*\?\s*[\'"][^\'"]*[\'"].*:',
                description="Test descriptions that change based on conditions",
                severity="medium"
            ),
            
            # NEW PATTERNS - Testing Mocks Instead of Components
            
            # 16. Mock-only testing without real component validation
            AntiPattern(
                name="Mock-Only Testing",
                pattern=r'const\s+\w+\s*=\s*\{\s*[^}]*:\s*jest\.fn\(\)',
                description="Creating mock objects without testing real component behavior",
                severity="high"
            ),
            
            # 17. Testing mock return values instead of actual behavior
            AntiPattern(
                name="Mock Return Value Testing",
                pattern=r'mockFunction\.mockReturnValue\([^)]+\);\s*expect\(mockFunction\(\)\)',
                description="Testing what a mock returns rather than testing real component behavior",
                severity="high"
            ),
            
            # 18. Excessive mocking of core functionality
            AntiPattern(
                name="Excessive Core Mocking",
                pattern=r'window\.\w+\s*=\s*\{[^}]*\};\s*\/\/.*mock',
                description="Mocking core window objects instead of testing integration",
                severity="medium"
            ),
            
            # 19. Mock assertion without behavior verification
            AntiPattern(
                name="Mock Assertion Without Behavior",
                pattern=r'expect\(\w+\.mock\.calls\)\.toHaveLength\(\d+\)$',
                description="Only checking if mock was called, not verifying actual behavior/effects",
                severity="medium"
            ),
            
            # 20. Testing mock implementation details
            AntiPattern(
                name="Mock Implementation Testing",
                pattern=r'expect\(\w+\)\.toHaveBeenCalledWith\([^)]*\);\s*\/\/.*only',
                description="Only testing what parameters mock was called with, not actual results",
                severity="medium"
            ),
            
            # NEW PATTERNS - Hiding Failures Through Fallbacks
            
            # 21. Fallback assertions that mask failures
            AntiPattern(
                name="Fallback Assertion Masking",
                pattern=r'}\s*catch\s*\([^)]*\)\s*\{\s*expect\(true\)\.toBe\(true\)',
                description="Catch blocks with trivial assertions that hide real failures",
                severity="high"
            ),
            
            # 22. Conditional assertions that skip validation
            AntiPattern(
                name="Conditional Assertion Skip",
                pattern=r'if\s*\([^)]*\)\s*\{\s*expect\([^)]*\);\s*}\s*else\s*\{\s*expect\(true\)',
                description="Conditional assertions with trivial fallbacks that skip validation",
                severity="high"
            ),
            
            # 23. Try-catch with weak fallback expectations
            AntiPattern(
                name="Weak Fallback Expectation",
                pattern=r'}\s*catch\s*\([^)]*\)\s*\{\s*expect\([^)]*\)\.toBeDefined\(\)',
                description="Catch blocks with weak assertions that don't validate error handling",
                severity="medium"
            ),
            
            # 24. Null/undefined fallback patterns
            AntiPattern(
                name="Null Fallback Pattern",
                pattern=r'expect\([^)]*\|\|\s*null\)\.toBe\(null\)',
                description="Fallback to null assertions that hide missing functionality",
                severity="medium"
            ),
            
            # 25. Element existence fallback with weak validation
            AntiPattern(
                name="Element Existence Fallback",
                pattern=r'const\s+\w+\s*=\s*document\.\w+\([^)]*\)\s*\|\|\s*\{\};',
                description="DOM element fallbacks that create fake objects instead of proper validation",
                severity="high"
            ),
            
            # 26. Manager/component existence with object creation fallback
            AntiPattern(
                name="Manager Creation Fallback",
                pattern=r'if\s*\(.*window\.\w+.*undefined\)\s*\{\s*window\.\w+\s*=\s*\{',
                description="Creating fake manager objects instead of proper dependency injection testing",
                severity="high"
            ),
            
            # 27. Silent error swallowing in tests
            AntiPattern(
                name="Silent Error Swallowing",
                pattern=r'}\s*catch\s*\([^)]*\)\s*\{\s*\/\/.*ignore|\/\/.*silent',
                description="Catch blocks that explicitly ignore errors without proper handling",
                severity="high"
            ),
            
            # 28. Weak instanceof checks as fallbacks
            AntiPattern(
                name="Weak Instanceof Fallback",
                pattern=r'expect\([^)]*\)\.toBeInstanceOf\(Object\)',
                description="Generic Object instanceof checks that don't validate specific types",
                severity="low"
            ),
            
            # 29. Result existence checks without validation
            AntiPattern(
                name="Result Existence Without Validation",
                pattern=r'expect\(result\)\.toBeTruthy\(\);\s*\/\/.*exists',
                description="Only checking if result exists without validating its correctness",
                severity="medium"
            ),
            
            # 30. Multiple fallback expectations
            AntiPattern(
                name="Multiple Fallback Expectations",
                pattern=r'expect\([^)]*\|\||[^)]*\?\?\s*[^)]*\)\.toBe',
                description="Multiple fallback operators in expectations that mask missing values",
                severity="medium"
            ),
            
            # 31. DOM creation fallbacks in tests
            AntiPattern(
                name="DOM Creation Fallback",
                pattern=r'if\s*\(![^)]*getElementById[^)]*\)\s*\{\s*const\s+\w+\s*=\s*document\.createElement',
                description="Creating DOM elements in tests instead of testing real DOM interaction",
                severity="medium"
            ),
            
            # 32. Mock module loading fallbacks
            AntiPattern(
                name="Mock Module Loading Fallback",
                pattern=r'if\s*\(typeof\s+window\.\w+.*undefined\)\s*\{\s*throw\s+new\s+Error',
                description="Throwing errors for missing modules instead of proper mocking setup",
                severity="low"
            )
        ]
    
    def strip_comments(self, line: str) -> str:
        """Strip comments from a line while preserving strings"""
        result = []
        in_string = False
        in_single_comment = False
        in_multi_comment = False
        escape_next = False
        quote_char = None
        
        i = 0
        while i < len(line):
            char = line[i]
            
            if escape_next:
                if not in_single_comment and not in_multi_comment:
                    result.append(char)
                escape_next = False
                i += 1
                continue
            
            if char == '\\':
                if not in_single_comment and not in_multi_comment:
                    result.append(char)
                escape_next = True
                i += 1
                continue
            
            # Handle string literals
            if not in_single_comment and not in_multi_comment:
                if char in ['"', "'", '`'] and not in_string:
                    in_string = True
                    quote_char = char
                    result.append(char)
                    i += 1
                    continue
                elif in_string and char == quote_char:
                    in_string = False
                    quote_char = None
                    result.append(char)
                    i += 1
                    continue
            
            # Handle comments (only if not in string)
            if not in_string:
                # Single line comment
                if char == '/' and i + 1 < len(line) and line[i + 1] == '/':
                    break  # Rest of line is comment
                
                # Multi-line comment start
                if char == '/' and i + 1 < len(line) and line[i + 1] == '*':
                    in_multi_comment = True
                    i += 2
                    continue
                
                # Multi-line comment end
                if in_multi_comment and char == '*' and i + 1 < len(line) and line[i + 1] == '/':
                    in_multi_comment = False
                    i += 2
                    continue
            
            # Add character if not in comment
            if not in_single_comment and not in_multi_comment:
                result.append(char)
            
            i += 1
        
        return ''.join(result)

    def load_false_positives(self) -> List[FalsePositive]:
        """Load false positive patterns from JSON file"""
        if not os.path.exists(self.false_positives_file):
            print(f"⚠️  False positives file not found: {self.false_positives_file}")
            return []
        
        try:
            with open(self.false_positives_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            false_positives = []
            for fp_data in data.get('false_positives', []):
                false_positives.append(FalsePositive(
                    file=fp_data['file'],
                    function=fp_data['function'],
                    line_range=fp_data['line_range'],
                    pattern_name=fp_data['pattern_name'],
                    code_snippet=fp_data['code_snippet'],
                    reason=fp_data['reason'],
                    reviewed_by=fp_data['reviewed_by'],
                    review_date=fp_data['review_date'],
                    confidence=fp_data['confidence']
                ))
            
            print(f"Loaded {len(false_positives)} false positive patterns")
            return false_positives
            
        except Exception as e:
            print(f"Error loading false positives: {e}")
            return []
    
    def extract_function_name(self, lines: List[str], line_index: int) -> Optional[str]:
        """Extract the function/test name that contains the given line"""
        if line_index < 0 or line_index >= len(lines):
            return None
        
        # Look backwards from the line to find the nearest test function or setup block
        for i in range(line_index, max(-1, line_index - 20), -1):
            line = lines[i].strip()
            
            # Look for describe blocks
            describe_match = re.search(r'describe\s*\(\s*[\'"]([^\'"]+)[\'"]', line)
            if describe_match:
                return describe_match.group(1)
            
            # Look for it blocks
            it_match = re.search(r'it\s*\(\s*[\'"]([^\'"]+)[\'"]', line)
            if it_match:
                return it_match.group(1)
            
            # Look for test blocks
            test_match = re.search(r'test\s*\(\s*[\'"]([^\'"]+)[\'"]', line)
            if test_match:
                return test_match.group(1)
            
            # Look for beforeAll/beforeEach/afterAll/afterEach blocks
            before_match = re.search(r'(beforeAll|beforeEach|afterAll|afterEach)\s*\(', line)
            if before_match:
                return f"{before_match.group(1)} setup"
        
        return None
    
    def fuzzy_match_function(self, actual_function: str, expected_function: str) -> bool:
        """Check if function names match with fuzzy logic"""
        if not actual_function or not expected_function:
            return False
        
        # Exact match
        if actual_function == expected_function:
            return True
        
        # Case-insensitive match
        if actual_function.lower() == expected_function.lower():
            return True
        
        # Check if one contains the other (for partial matches due to refactoring)
        if expected_function.lower() in actual_function.lower() or actual_function.lower() in expected_function.lower():
            return True
        
        # Check similarity using simple word matching
        actual_words = set(re.findall(r'\w+', actual_function.lower()))
        expected_words = set(re.findall(r'\w+', expected_function.lower()))
        
        if len(expected_words) > 0:
            overlap = len(actual_words & expected_words) / len(expected_words)
            return overlap >= 0.6  # 60% word overlap
        
        return False
    
    def normalize_path(self, path: str) -> str:
        """Normalize path separators for cross-platform compatibility"""
        # Convert all path separators to forward slashes for consistent comparison
        return path.replace('\\', '/').replace('//', '/')
    
    def paths_match(self, path1: str, path2: str) -> bool:
        """Check if two paths match, handling different separator styles"""
        norm1 = self.normalize_path(path1)
        norm2 = self.normalize_path(path2)
        
        # Direct match
        if norm1 == norm2:
            return True
        
        # Check if one path ends with the other (relative vs absolute)
        if norm1.endswith(norm2) or norm2.endswith(norm1):
            return True
        
        # Check if the filenames match (last component)
        file1 = norm1.split('/')[-1]
        file2 = norm2.split('/')[-1]
        if file1 == file2 and len(file1) > 0:
            # Also check that the directory structure is similar
            parts1 = norm1.split('/')
            parts2 = norm2.split('/')
            # If both have test/suites structure, they likely match
            if len(parts1) >= 2 and len(parts2) >= 2:
                if (parts1[-2] == parts2[-2] or  # Same parent directory
                    ('test' in parts1 and 'test' in parts2)):  # Both are test files
                    return True
        
        return False

    def is_false_positive(self, detection: Detection) -> Tuple[bool, Optional[str]]:
        """Check if a detection matches any false positive patterns using fuzzy matching"""
        try:
            # Read the file to get function context
            with open(detection.filename, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except:
            return False, None
        
        # Extract function name from the detection
        actual_function = self.extract_function_name(lines, detection.line_number - 1)
        
        for fp in self.false_positives:
            # Check if pattern name matches
            if fp.pattern_name != detection.pattern_name:
                continue
            
            # Check if file matches using improved path matching
            if not self.paths_match(detection.filename, fp.file):
                continue
            
            # Check if function matches with fuzzy logic
            if not self.fuzzy_match_function(actual_function, fp.function):
                continue
            
            # Check if line is within the expected range (with fuzzy tolerance)
            # Allow for code changes by being flexible with line numbers
            line_tolerance = self.line_tolerance  # Configurable tolerance for line drift
            expected_start, expected_end = fp.line_range
            actual_line = detection.line_number
            
            # If it's a single line pattern, expand the range slightly
            if expected_start == expected_end:
                fuzzy_start = expected_start - line_tolerance
                fuzzy_end = expected_end + line_tolerance
            else:
                # For multi-line patterns, allow tolerance on both ends
                fuzzy_start = expected_start - line_tolerance
                fuzzy_end = expected_end + line_tolerance
            
            if (fuzzy_start <= actual_line <= fuzzy_end):
                # Additional check: does the code snippet match (enhanced fuzzy matching)
                fp_code_clean = re.sub(r'\s+', ' ', fp.code_snippet.strip().lower())
                detection_code_clean = re.sub(r'\s+', ' ', detection.code_line.strip().lower())
                
                # Enhanced fuzzy matching for code changes
                code_matches = False
                
                # Special handling for conditional patterns that should match
                if fp.pattern_name == "Conditional Test Execution":
                    # For conditional patterns, check for key elements
                    if ('typeof window.' in fp_code_clean and 'undefined' in fp_code_clean and 
                        'typeof window.' in detection_code_clean and 'undefined' in detection_code_clean):
                        # Extract the window object being checked
                        fp_match = re.search(r'typeof window\.(\w+)', fp_code_clean)
                        det_match = re.search(r'typeof window\.(\w+)', detection_code_clean)
                        if fp_match and det_match and fp_match.group(1) == det_match.group(1):
                            code_matches = True
                
                # Direct substring matches
                if not code_matches and (fp_code_clean in detection_code_clean or 
                    detection_code_clean in fp_code_clean):
                    code_matches = True
                
                # Pattern-specific fuzzy matching
                elif 'typeof' in fp_code_clean and 'object' in fp_code_clean:
                    # For typeof patterns, check if both contain typeof and object
                    if 'typeof' in detection_code_clean and 'object' in detection_code_clean:
                        code_matches = True
                
                elif 'expect(' in fp_code_clean and ').toBeDefined()' in fp_code_clean:
                    # For toBeDefined patterns, match the expect target
                    fp_target = re.search(r'expect\(([^)]+)\)\.toBeDefined', fp_code_clean)
                    det_target = re.search(r'expect\(([^)]+)\)\.toBeDefined', detection_code_clean)
                    if fp_target and det_target:
                        # Extract the variable/property being tested
                        fp_var = fp_target.group(1).strip()
                        det_var = det_target.group(1).strip()
                        # Allow for minor variations in variable names
                        if (fp_var in det_var or det_var in fp_var or 
                            fp_var.split('.')[-1] == det_var.split('.')[-1]):
                            code_matches = True
                
                elif 'catch' in fp_code_clean and 'error' in fp_code_clean:
                    # For catch patterns, match the general structure
                    if 'catch' in detection_code_clean and 'error' in detection_code_clean:
                        code_matches = True
                
                # Fallback: check if key identifiers match
                if not code_matches:
                    # Extract key words (excluding common test keywords)
                    fp_words = set(re.findall(r'\b\w{3,}\b', fp_code_clean)) - {'expect', 'tobe', 'defined', 'function', 'window'}
                    det_words = set(re.findall(r'\b\w{3,}\b', detection_code_clean)) - {'expect', 'tobe', 'defined', 'function', 'window'}
                    
                    # If 70% of meaningful words overlap, consider it a match
                    if fp_words and det_words:
                        overlap = len(fp_words & det_words)
                        total_unique = len(fp_words | det_words)
                        if overlap / total_unique >= 0.7:
                            code_matches = True
                
                if code_matches:
                    return True, f"{fp.reason} (confidence: {fp.confidence})"
        
        return False, None
    
    def add_false_positive(self, detection: Detection, reason: str, added_by: str = "user"):
        """Add a new false positive pattern to the file"""
        new_fp = {
            "pattern_name": detection.pattern_name,
            "file_pattern": ".*\\.test\\.js$",  # Default to all test files
            "line_pattern": re.escape(detection.code_line.strip()),
            "reason": reason,
            "added_by": added_by,
            "date_added": "2024-01-01"  # You might want to use actual date
        }
        
        # Load existing data
        data = {"false_positives": [], "metadata": {}}
        if os.path.exists(self.false_positives_file):
            try:
                with open(self.false_positives_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except:
                pass
        
        # Add new false positive
        data["false_positives"].append(new_fp)
        
        # Save back to file
        try:
            with open(self.false_positives_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print(f"Added false positive pattern for: {detection.pattern_name}")
        except Exception as e:
            print(f"Error saving false positive: {e}")
    
    def get_context_lines(self, lines: List[str], line_index: int, filename: str = "", context_size: int = 6) -> List[str]:
        """Get surrounding lines for context"""
        start = max(0, line_index - context_size)
        end = min(len(lines), line_index + context_size + 1)
        
        context = []
        for i in range(start, end):
            marker = ">>> " if i == line_index else "    "
            if filename:
                context.append(f"{marker}{filename}:{i+1:4d}: {lines[i].rstrip()}")
            else:
                context.append(f"{marker}{i+1:4d}: {lines[i].rstrip()}")
        
        return context
    
    def is_legitimate_to_be_defined(self, lines: List[str], line_index: int, line: str) -> bool:
        """
        Determine if a toBeDefined assertion is legitimate or problematic.
        
        Legitimate cases:
        - Standalone precondition checks (not inside if/else blocks)
        - Part of a sequence of structure validation assertions
        - Checking for required dependencies before testing behavior
        
        Problematic cases:
        - Inside conditional blocks that might skip tests
        - As fallback assertions in try-catch blocks
        - Testing mock objects instead of real behavior
        - Weak validation without follow-up behavioral tests
        """
        
        # Get surrounding context to analyze
        current_line = line.strip()
        
        # Check if this is inside a conditional block
        for i in range(max(0, line_index - 10), line_index):
            prev_line = lines[i].strip()
            # Look for if statements that might make this conditional
            if re.match(r'^\s*if\s*\([^)]*\)\s*\{?\s*$', prev_line):
                # Check if there's a corresponding closing brace after our line
                brace_count = 0
                found_opening = False
                for j in range(i, min(len(lines), line_index + 10)):
                    check_line = lines[j].strip()
                    if '{' in check_line:
                        brace_count += check_line.count('{')
                        found_opening = True
                    if '}' in check_line:
                        brace_count -= check_line.count('}')
                        if found_opening and brace_count <= 0 and j > line_index:
                            # This toBeDefined is inside a conditional block
                            return False
        
        # Check if this is part of a legitimate precondition check sequence
        # Look for patterns like multiple expect().toBeDefined() in sequence
        nearby_to_be_defined = 0
        for i in range(max(0, line_index - 3), min(len(lines), line_index + 4)):
            if i != line_index and 'toBeDefined()' in lines[i]:
                nearby_to_be_defined += 1
        
        # If there are multiple toBeDefined assertions nearby, this is likely a precondition check
        if nearby_to_be_defined >= 2:
            return True
        
        # Check for legitimate precondition patterns
        if re.search(r'expect\(window\.\w+\)\.toBeDefined\(\)', current_line):
            # Look ahead to see if there's actual behavior testing after this
            for i in range(line_index + 1, min(len(lines), line_index + 10)):
                next_line = lines[i].strip()
                # Look for actual behavior testing (not just more toBeDefined)
                if (re.search(r'expect\([^)]+\)\.(?:toBe|toEqual|toContain|toHaveLength|toBeGreaterThan)', next_line) and 
                    'toBeDefined' not in next_line):
                    return True
                # Stop looking if we hit another test or describe block
                if re.match(r'^\s*(?:it|describe)\s*\(', next_line):
                    break
        
        # Check if this is checking a builder/manager before using it
        if re.search(r'expect\(\w+(?:Manager|Builder)\)\.toBeDefined\(\)', current_line):
            # Look ahead for actual usage of the builder/manager
            for i in range(line_index + 1, min(len(lines), line_index + 8)):
                next_line = lines[i].strip()
                if re.search(r'\w+(?:Manager|Builder)\.\w+\(', next_line):
                    return True
        
        # Check for STO_DATA structure validation sequences
        if 'STO_DATA' in current_line:
            # This is likely part of a structure validation sequence
            return True
        
        # Check if this is at the beginning of a test function (precondition check)
        for i in range(max(0, line_index - 5), line_index):
            prev_line = lines[i].strip()
            if re.match(r'^\s*it\s*\(', prev_line):
                # This toBeDefined is near the start of a test, likely a precondition
                return True
        
        # If none of the above conditions are met, this might be a weak assertion
        return False
    
    def is_legitimate_instanceof_check(self, lines: List[str], line_index: int, line: str) -> bool:
        """
        Determine if a toBeInstanceOf(Object) assertion is legitimate or problematic.
        
        Legitimate cases:
        - API availability checks (window.stoKeybinds, window.stoCommands)
        - Manager instantiation validation
        - Precondition checks at test start
        
        Problematic cases:
        - Generic object checks without specific validation
        - Inside conditional blocks
        """
        current_line = line.strip()
        
        # Check if this is inside a conditional block
        for i in range(max(0, line_index - 10), line_index):
            prev_line = lines[i].strip()
            if re.match(r'^\s*if\s*\([^)]*\)\s*\{?\s*$', prev_line):
                return False
        
        # Check for API availability patterns
        if re.search(r'expect\(window\.\w+\)\.toBeInstanceOf\(Object\)', current_line):
            return True
        
        # Check for manager instantiation validation
        if re.search(r'expect\(\w+Manager\)\.toBeInstanceOf\(Object\)', current_line):
            return True
        
        # Check if this is at the beginning of a test function (precondition check)
        for i in range(max(0, line_index - 5), line_index):
            prev_line = lines[i].strip()
            if re.match(r'^\s*it\s*\(', prev_line):
                return True
        
        # Check if there are multiple instanceof checks nearby (precondition sequence)
        nearby_instanceof = 0
        for i in range(max(0, line_index - 3), min(len(lines), line_index + 4)):
            if i != line_index and 'toBeInstanceOf' in lines[i]:
                nearby_instanceof += 1
        
        if nearby_instanceof >= 1:
            return True
        
        return False
    
    def is_legitimate_object_type_check(self, lines: List[str], line_index: int, line: str) -> bool:
        """
        Determine if a typeof === 'object' check is legitimate or problematic.
        
        Legitimate cases:
        - Data structure validation before testing properties
        - Parameter object validation
        - Result object validation when followed by specific tests
        """
        current_line = line.strip()
        
        # Check if this is inside a conditional block
        for i in range(max(0, line_index - 10), line_index):
            prev_line = lines[i].strip()
            if re.match(r'^\s*if\s*\([^)]*\)\s*\{?\s*$', prev_line):
                return False
        
        # Check for parameter validation patterns
        if re.search(r'expect\(typeof\s+\w*[Pp]arams?\w*\)', current_line):
            return True
        
        # Check for data structure validation
        if re.search(r'expect\(typeof\s+\w*[Dd]ata\w*\)', current_line):
            return True
        
        # Check if followed by specific property tests
        for i in range(line_index + 1, min(len(lines), line_index + 5)):
            next_line = lines[i].strip()
            if re.search(r'expect\([^)]+\)\.(?:toHaveProperty|toEqual|toContain)', next_line):
                return True
            if re.match(r'^\s*(?:it|describe)\s*\(', next_line):
                break
        
        return False
    
    def is_legitimate_function_existence_check(self, lines: List[str], line_index: int, line: str) -> bool:
        """
        Determine if a function existence check is legitimate or problematic.
        
        Legitimate cases:
        - API availability checks before using functions
        - Precondition checks in E2E tests
        - Function availability validation when followed by actual usage
        """
        current_line = line.strip()
        
        # Check if this is inside a conditional block
        for i in range(max(0, line_index - 10), line_index):
            prev_line = lines[i].strip()
            if re.match(r'^\s*if\s*\([^)]*\)\s*\{?\s*$', prev_line):
                return False
        
        # Check for API function availability patterns
        if re.search(r'expect\(window\.\w+\.\w+\)\.toBeInstanceOf\(Function\)', current_line):
            return True
        
        # Check if this is at the beginning of a test function
        for i in range(max(0, line_index - 5), line_index):
            prev_line = lines[i].strip()
            if re.match(r'^\s*it\s*\(', prev_line):
                return True
        
        # Check if followed by actual function usage
        for i in range(line_index + 1, min(len(lines), line_index + 8)):
            next_line = lines[i].strip()
            if re.search(r'\w+\.\w+\(', next_line) and 'expect' not in next_line:
                return True
            if re.match(r'^\s*(?:it|describe)\s*\(', next_line):
                break
        
        return False
    
    def is_legitimate_expect_anything(self, lines: List[str], line_index: int, line: str) -> bool:
        """
        Determine if expect.anything() usage is legitimate or problematic.
        
        Legitimate cases:
        - Parameter default value testing (can be any type)
        - Timestamp/dynamic value testing
        - Template parameter validation
        """
        current_line = line.strip()
        
        # Check for parameter default value patterns
        if re.search(r'default:\s*expect\.anything\(\)', current_line):
            return True
        
        # Check for timestamp patterns
        if re.search(r'(?:created|modified|timestamp):\s*expect\.anything\(\)', current_line):
            return True
        
        # Check for template parameter patterns
        if re.search(r'parameters?:\s*expect\.anything\(\)', current_line):
            return True
        
        return False
    
    def detect_patterns_in_file(self, filepath: str) -> List[Detection]:
        """Detect anti-patterns in a single file"""
        detections = []
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except Exception as e:
            print(f"Error reading {filepath}: {e}")
            return detections
        
        for line_index, line in enumerate(lines):
            # Strip comments from line before pattern matching
            stripped_line = self.strip_comments(line)
            
            # Skip empty lines after comment stripping
            if not stripped_line.strip():
                continue
                
            for pattern in self.anti_patterns:
                if re.search(pattern.pattern, stripped_line, re.IGNORECASE):
                    # Special handling for context-aware patterns
                    if pattern.name == "Weak toBeDefined Assertion":
                        if self.is_legitimate_to_be_defined(lines, line_index, stripped_line):
                            continue  # Skip legitimate toBeDefined assertions
                    elif pattern.name == "Weak Instanceof Fallback":
                        if self.is_legitimate_instanceof_check(lines, line_index, stripped_line):
                            continue  # Skip legitimate instanceof checks
                    elif pattern.name == "Weak Object Type Check":
                        if self.is_legitimate_object_type_check(lines, line_index, stripped_line):
                            continue  # Skip legitimate object type checks
                    elif pattern.name == "Function Existence Test":
                        if self.is_legitimate_function_existence_check(lines, line_index, stripped_line):
                            continue  # Skip legitimate function existence checks
                    elif pattern.name == "Generic expect.anything() Overuse":
                        if self.is_legitimate_expect_anything(lines, line_index, stripped_line):
                            continue  # Skip legitimate expect.anything() usage
                    
                    context = self.get_context_lines(lines, line_index, filepath)
                    
                    detection = Detection(
                        filename=filepath,
                        line_number=line_index + 1,
                        pattern_name=pattern.name,
                        code_line=stripped_line.strip(),
                        context=context
                    )
                    
                    # Check if this is a false positive
                    is_fp, fp_reason = self.is_false_positive(detection)
                    if is_fp:
                        # Create detection with false positive info
                        detection = detection._replace(
                            is_false_positive=True,
                            false_positive_reason=fp_reason
                        )
                    
                    detections.append(detection)
        
        # Add multi-line pattern detection for complex anti-patterns
        detections.extend(self.detect_multiline_patterns(filepath, lines))
        
        return detections
    
    def detect_multiline_patterns(self, filepath: str, lines: List[str]) -> List[Detection]:
        """Detect complex multi-line anti-patterns that span multiple lines"""
        detections = []
        content = ''.join(lines)
        
        # Pattern 1: Mock-heavy test with no real validation
        mock_pattern = r'const\s+\w+Manager\s*=\s*\{[^}]*mock[^}]*\};\s*[^;]*;\s*expect\([^)]*\)\.toBeTruthy\(\)'
        for match in re.finditer(mock_pattern, content, re.MULTILINE | re.DOTALL):
            line_num = content[:match.start()].count('\n') + 1
            context = self.get_context_lines(lines, line_num - 1, filepath, 10)
            detections.append(Detection(
                filename=filepath,
                line_number=line_num,
                pattern_name="Mock-Heavy Test Without Validation",
                code_line=match.group().replace('\n', ' ').strip()[:80] + "...",
                context=context
            ))
        
        # Pattern 2: Try-catch test with only mock assertions
        try_catch_mock_pattern = r'try\s*\{[^}]*\}\s*catch[^}]*\{\s*expect\([^)]*mock[^)]*\)\.toBe'
        for match in re.finditer(try_catch_mock_pattern, content, re.MULTILINE | re.DOTALL):
            line_num = content[:match.start()].count('\n') + 1
            context = self.get_context_lines(lines, line_num - 1, filepath, 8)
            detections.append(Detection(
                filename=filepath,
                line_number=line_num,
                pattern_name="Try-Catch With Mock-Only Assertions",
                code_line=match.group().replace('\n', ' ').strip()[:80] + "...",
                context=context
            ))
        
        # Pattern 3: Tests that only mock window objects without integration testing
        window_mock_pattern = r'window\.\w+\s*=\s*\{[^}]*\};\s*[^;]*;\s*expect\(window\.\w+\)\.toBeDefined\(\)'
        for match in re.finditer(window_mock_pattern, content, re.MULTILINE | re.DOTALL):
            line_num = content[:match.start()].count('\n') + 1
            context = self.get_context_lines(lines, line_num - 1, filepath, 6)
            detections.append(Detection(
                filename=filepath,
                line_number=line_num,
                pattern_name="Window Mock Without Integration Testing",
                code_line=match.group().replace('\n', ' ').strip()[:80] + "...",
                context=context
            ))
        
        # Pattern 4: Fallback object creation in beforeEach that masks real dependencies
        beforeeach_fallback_pattern = r'beforeEach\([^{]*\{[^}]*if\s*\([^)]*undefined[^)]*\)[^}]*document\.createElement[^}]*\}'
        for match in re.finditer(beforeeach_fallback_pattern, content, re.MULTILINE | re.DOTALL):
            line_num = content[:match.start()].count('\n') + 1
            context = self.get_context_lines(lines, line_num - 1, filepath, 8)
            detections.append(Detection(
                filename=filepath,
                line_number=line_num,
                pattern_name="BeforeEach Fallback Creation",
                code_line=match.group().replace('\n', ' ').strip()[:80] + "...",
                context=context
            ))
        
        # Pattern 5: Tests with conditional execution based on mock existence
        conditional_mock_pattern = r'if\s*\([^)]*window\.\w+[^)]*\)\s*\{[^}]*expect[^}]*\}\s*else\s*\{[^}]*expect\(true\)'
        for match in re.finditer(conditional_mock_pattern, content, re.MULTILINE | re.DOTALL):
            line_num = content[:match.start()].count('\n') + 1
            context = self.get_context_lines(lines, line_num - 1, filepath, 8)
            detections.append(Detection(
                filename=filepath,
                line_number=line_num,
                pattern_name="Conditional Mock Execution With Trivial Fallback",
                code_line=match.group().replace('\n', ' ').strip()[:80] + "...",
                context=context
            ))
        
        # Pattern 6: Integration tests that create fake managers instead of using real ones
        fake_manager_pattern = r'const\s+\w+Manager\s*=\s*\{[^}]*:\s*\(\)\s*=>\s*true[^}]*\};\s*[^;]*;\s*expect\([^)]*Manager[^)]*\)\.toBeTruthy'
        for match in re.finditer(fake_manager_pattern, content, re.MULTILINE | re.DOTALL):
            line_num = content[:match.start()].count('\n') + 1
            context = self.get_context_lines(lines, line_num - 1, filepath, 6)
            detections.append(Detection(
                filename=filepath,
                line_number=line_num,
                pattern_name="Fake Manager Creation In Integration Test",
                code_line=match.group().replace('\n', ' ').strip()[:80] + "...",
                context=context
            ))
        
        # Pattern 7: DOM element creation patterns that avoid real DOM testing
        dom_creation_pattern = r'if\s*\(![^)]*getElementById[^)]*\)\s*\{[^}]*createElement[^}]*appendChild[^}]*\}'
        for match in re.finditer(dom_creation_pattern, content, re.MULTILINE | re.DOTALL):
            line_num = content[:match.start()].count('\n') + 1
            context = self.get_context_lines(lines, line_num - 1, filepath, 6)
            detections.append(Detection(
                filename=filepath,
                line_number=line_num,
                pattern_name="DOM Creation Avoiding Real DOM Testing",
                code_line=match.group().replace('\n', ' ').strip()[:80] + "...",
                context=context
            ))
        
        # Pattern 8: Catch blocks with weak fallback patterns
        catch_weak_pattern = r'}\s*catch\s*\([^)]*\)\s*\{[^}]*expect\([^)]*\|\|[^)]*\)\.toBe'
        for match in re.finditer(catch_weak_pattern, content, re.MULTILINE | re.DOTALL):
            line_num = content[:match.start()].count('\n') + 1
            context = self.get_context_lines(lines, line_num - 1, filepath, 6)
            detections.append(Detection(
                filename=filepath,
                line_number=line_num,
                pattern_name="Catch Block With Weak Fallback Assertion",
                code_line=match.group().replace('\n', ' ').strip()[:80] + "...",
                context=context
            ))
        
        # Pattern 9: Tests that perform all operations then only check truthy result
        all_operations_truthy_pattern = r'[^;]*save[^;]*\s*[^;]*edit[^;]*\s*[^;]*delete[^;]*\s*expect\([^)]*\)\.toBeTruthy\(\)'
        for match in re.finditer(all_operations_truthy_pattern, content, re.MULTILINE | re.DOTALL):
            line_num = content[:match.start()].count('\n') + 1
            context = self.get_context_lines(lines, line_num - 1, filepath, 6)
            detections.append(Detection(
                filename=filepath,
                line_number=line_num,
                pattern_name="All Operations With Only Truthy Check",
                code_line=match.group().replace('\n', ' ').strip()[:80] + "...",
                context=context
            ))
        
        return detections
    
    def scan_directory(self, directory: str, file_pattern: str = r'.*\.test\.js$') -> List[Detection]:
        """Scan directory for test files and detect anti-patterns"""
        all_detections = []
        
        for root, dirs, files in os.walk(directory):
            for file in files:
                if re.match(file_pattern, file):
                    filepath = os.path.join(root, file)
                    detections = self.detect_patterns_in_file(filepath)
                    all_detections.extend(detections)
        
        return all_detections
    
    def get_pattern_by_name(self, name: str) -> AntiPattern:
        """Get pattern definition by name"""
        for pattern in self.anti_patterns:
            if pattern.name == name:
                return pattern
        return None
    
    def print_detections(self, detections: List[Detection], show_false_positives: bool = False):
        """Print detections in a formatted way"""
        # Separate true positives from false positives
        true_positives = [d for d in detections if not d.is_false_positive]
        false_positives = [d for d in detections if d.is_false_positive]
        
        if not true_positives and not false_positives:
            print("No anti-patterns detected!")
            return
        
        if not true_positives:
            print(f"No true positive anti-patterns detected!")
            if false_positives:
                print(f"Found {len(false_positives)} false positives (filtered out)")
            return
        
        # Group true positives by pattern type
        by_pattern = {}
        for detection in true_positives:
            if detection.pattern_name not in by_pattern:
                by_pattern[detection.pattern_name] = []
            by_pattern[detection.pattern_name].append(detection)
        
        # Print summary
        total_patterns = len(true_positives)
        filtered_count = len(false_positives)
        print(f"\nDETECTED {total_patterns} ANTI-PATTERNS ACROSS {len(by_pattern)} TYPES")
        if filtered_count > 0:
            print(f"Filtered out {filtered_count} false positives")
        print()
        
        # Print detailed results
        for pattern_name, pattern_detections in by_pattern.items():
            pattern_def = self.get_pattern_by_name(pattern_name)
            severity_prefix = {"high": "[HIGH]", "medium": "[MED]", "low": "[LOW]"}
            prefix = severity_prefix.get(pattern_def.severity, "[UNK]")
            
            print(f"{prefix} {pattern_name.upper()} ({pattern_def.severity.upper()} SEVERITY)")
            print(f"   Description: {pattern_def.description}")
            print(f"   Occurrences: {len(pattern_detections)}")
            print()
            
            for detection in pattern_detections:
                print(f"   File: {detection.filename}:{detection.line_number}")
                print(f"   Code: {detection.code_line}")
                print()
                
                # Print context (handle encoding issues)
                for context_line in detection.context:
                    try:
                        print(f"   {context_line}")
                    except UnicodeEncodeError:
                        # Handle encoding issues by removing problematic characters
                        safe_line = context_line.encode('ascii', 'ignore').decode('ascii')
                        print(f"   {safe_line}")
                print()
        
        # Print summary statistics
        severity_counts = {"high": 0, "medium": 0, "low": 0}
        for detection in true_positives:
            pattern_def = self.get_pattern_by_name(detection.pattern_name)
            severity_counts[pattern_def.severity] += 1
        
        print("SUMMARY BY SEVERITY:")
        print(f"   High:     {severity_counts['high']} patterns")
        print(f"   Medium:   {severity_counts['medium']} patterns") 
        print(f"   Low:      {severity_counts['low']} patterns")
        print(f"   Total:    {len(true_positives)} patterns")
        if filtered_count > 0:
            print(f"   Filtered: {filtered_count} false positives")
        
        # Show false positives if requested
        if show_false_positives and false_positives:
            print(f"\nFALSE POSITIVES ({len(false_positives)} filtered out):")
            for fp in false_positives:
                print(f"   File: {fp.filename}:{fp.line_number}")
                print(f"   Code: {fp.code_line}")
                print(f"   Reason: {fp.false_positive_reason}")
                print()

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Detect anti-patterns in test files')
    parser.add_argument('directory', nargs='?', default='test/suites', 
                       help='Directory to scan for test files (default: test/suites)')
    parser.add_argument('--line-tolerance', type=int, default=5,
                       help='Number of lines tolerance for fuzzy matching (default: 5)')
    parser.add_argument('--false-positives', default='false_positives.json',
                       help='Path to false positives file (default: false_positives.json)')
    parser.add_argument('--show-false-positives', action='store_true',
                       help='Show filtered false positives in output')
    
    args = parser.parse_args()
    
    detector = TestAntiPatternDetector(
        false_positives_file=args.false_positives,
        line_tolerance=args.line_tolerance
    )
    
    scan_dir = args.directory
    
    if not os.path.exists(scan_dir):
        print(f"❌ Directory not found: {scan_dir}")
        sys.exit(1)
    
    print(f"Scanning {scan_dir} for test anti-patterns...")
    print(f"Checking for {len(detector.anti_patterns)} anti-pattern types")
    print(f"Using line tolerance: +/-{detector.line_tolerance} lines for fuzzy matching")
    print(f"False positives file: {detector.false_positives_file}")
    print()
    
    # Scan for patterns
    detections = detector.scan_directory(scan_dir)
    
    # Print results
    detector.print_detections(detections, show_false_positives=args.show_false_positives)
    
    # Exit with error code if high-severity patterns found (only count true positives)
    true_positives = [d for d in detections if not d.is_false_positive]
    high_severity_count = sum(1 for d in true_positives 
                             if detector.get_pattern_by_name(d.pattern_name).severity == "high")
    
    if high_severity_count > 0:
        print(f"\nFound {high_severity_count} high-severity anti-patterns that should be fixed!")
        sys.exit(1)
    else:
        print(f"\nNo high-severity anti-patterns detected!")
        sys.exit(0)

if __name__ == "__main__":
    main() 