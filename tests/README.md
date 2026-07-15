# Test Suite Architecture

This directory contains the fixture-based test suite for the STO Keybind Manager application.

## Structure

```
tests/
├── fixtures/           # Reusable test fixtures
│   ├── core/          # Core infrastructure fixtures
│   ├── data/          # Data fixtures
│   └── index.js       # Main fixtures export
├── unit/              # Unit tests
├── integration/       # Integration tests
├── browser/           # Browser/E2E tests
├── setup.js           # Test setup file
├── browser-setup.js   # Browser test setup
└── README.md          # This file

```

## Fixture Philosophy

The fixture system provides:

- **Consistent Setup**: Reusable, well-tested configurations
- **Automatic Cleanup**: Prevents test interference
- **Realistic Behavior**: Maintains production patterns
- **Easy Debugging**: Built-in diagnostics and state inspection

## Important Notes

### Command Format in Profiles

Commands in profiles are stored as simple string arrays directly on keys, and aliases are objects with commands arrays and descriptions:

```javascript
// ✅ Correct format
builds: {
  space: {
    keys: {
      F1: ['FireAll', 'FirePhasers', 'FireTorps'],
      F2: ['Target_Enemy_Near']
    }
  }
},
aliases: {
  AttackSequence: {
    commands: ['FireAll', '+TrayExecByTray 0 0', 'FireTorps'],
    description: 'Standard attack sequence'
  },
  QuickHeal: {
    commands: ['+TrayExecByTray 1 0'],
    description: 'Quick heal ability'
  }
}

// ❌ Legacy format (no longer supported)
keys: {
  F1: { commands: ['FireAll'] }
}
aliases: {
  AttackSequence: {
    commands: 'FireAll$$+TrayExecByTray 0 0$$FireTorps',
    description: 'Attack sequence'
  }
}
```

The string arrays get joined with `$$` later in the processing pipeline. This is the canonical format used throughout the application.

## Usage

```javascript
import {
  createEventBusFixture,
  createServiceCollectionFixture,
} from "../fixtures";

test("service communication", async () => {
  const eventBus = createEventBusFixture();
  const services = createServiceCollectionFixture(
    ["KeyService", "ProfileService"],
    { eventBus },
  );

  // Test logic here
  // Automatic cleanup happens in afterEach
});
```

## Running Tests

The repository requires Node.js 22 and uses the projects in `vitest.workspace.js` to keep unit, integration, and browser tests isolated.

```bash
# Unit tests in jsdom
npm run test:unit

# Integration tests in jsdom
npm run test:integration

# Browser smoke tests in Chromium through Playwright
npm run test:browser

# Unit and integration tests together
npm run test:run

# Every Vitest project, including browser tests
npm test

# Watch mode and coverage
npm run test:watch
npm run test:coverage
```

## Quality Gates

Run the complete local quality gate before pushing:

```bash
npm run check
```

This runs TypeScript checking for the JavaScript sources and tool configuration, zero-warning ESLint, unit and integration tests, Prettier verification, Knip dead-code analysis, and jscpd duplicate detection.

The CI entry point also builds the application and runs the browser smoke test:

```bash
npm run test:ci
```

GitHub Actions runs that CI entry point for pushes to `main`, pull requests, and manual workflow dispatches. The workflow installs dependencies with `npm ci` and provisions Chromium before validation.

### Test Structure Examples

```javascript
// Unit Test Example
import { createEventBusFixture } from "../fixtures";

test("eventBus functionality", () => {
  const { eventBus, expectEvent } = createEventBusFixture();
  eventBus.emit("test", { data: "hello" });
  expectEvent("test", { data: "hello" });
});

// Integration Test Example
import { createBasicTestEnvironment } from "../fixtures";

test("profile operations", async () => {
  const env = await createBasicTestEnvironment();
  env.storage.saveProfile("test", env.profile);
  expect(env.storage.getProfile("test")).toBeDefined();
});
```
