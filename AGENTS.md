# Development Guidelines for Contributors and AI Agents

This document outlines the development standards and requirements for working on this keybind application project.

## Testing Requirements

### New Functionality
- **All new functionality MUST include comprehensive test cases**
- **Integration tests** are required to verify feature behavior in realistic scenarios
- **Unit tests** are required to verify individual component behavior
- Test coverage should be maintained at existing levels or improved

### Updates to Existing Functionality
- **All updates to existing functionality MUST include updates to existing test cases**
- **New test cases may be required** if the update introduces new behavior or edge cases
- Ensure existing tests still pass after modifications
- Update test descriptions and assertions to reflect changes

### Bug Fixes
- **User-reported bugs MUST receive regression test cases**
- Regression tests should reproduce the original bug condition
- Tests should verify the fix prevents the bug from recurring
- Include test cases for edge cases related to the bug

## Internationalization (i18n) Requirements

### String Handling
- **All user-facing strings MUST be treated as internationalized content**
- No hardcoded English strings should appear directly in the user interface
- All strings must use the i18n system for display

### Language File Management
- **English language file (`src/i18n/en.json`) MUST be populated** with all English labels
- English file serves as the master reference for all translatable content
- **Translation to other supported languages will be arranged by the user**
- Do not attempt to populate non-English language files unless specifically requested

### Supported Languages
The application currently supports:
- English (`en.json`)
- German (`de.json`) 
- Spanish (`es.json`)
- French (`fr.json`)

## Code Quality Standards

### Before Submitting Changes
1. Ensure all tests pass (unit, integration, and browser tests)
2. Verify i18n compliance for any new user-facing strings
3. Run the full test suite to check for regressions
4. Update documentation if functionality changes affect user workflows

### Test Organization
- **Unit tests**: `tests/unit/` - Test individual modules and functions
- **Integration tests**: `tests/integration/` - Test feature workflows and component interactions  
- **Browser tests**: `tests/browser/` - Test UI interactions and user workflows

## Development Workflow

1. **Analyze requirements** - Understand what functionality is being added/modified
2. **Plan testing strategy** - Determine what tests are needed (unit, integration, regression)
3. **Implement functionality** - Write code following i18n guidelines
4. **Write comprehensive tests** - Cover happy path, edge cases, and error conditions
5. **Update existing tests** - Modify tests affected by changes
6. **Verify i18n compliance** - Ensure all strings use the i18n system
7. **Run full test suite** - Confirm no regressions introduced

## Notes for AI Agents

- Always check existing test patterns before writing new tests
- Follow the established project structure and naming conventions
- When adding new features, consider the impact on existing functionality
- Prioritize test coverage and code maintainability
- Remember that the user handles translation coordination - focus on English content only 

## Patterns

### Component interaction

The project uses a broadcast/cache pattern with late-join state sync:

- Services broadcast state changes via emit()
- UIs cache state locally and listen for broadcasts
- Late-join handshake ensures components get initial state even if they initialize after the state was set
- Request/response is only used for actions where a reply is required, and never for state access
