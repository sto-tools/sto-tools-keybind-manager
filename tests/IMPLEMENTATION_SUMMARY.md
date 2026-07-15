# Test Suite Implementation Summary

The repository now uses one fixture-based Vitest workspace, defined in
`vitest.workspace.js`, with separate unit, integration, and browser projects.
The former parallel-suite migration is complete; there is no second workspace
or `unit-integration` project to maintain.

## Current coverage

- Unit tests exercise core infrastructure, parsers, services, and UI components
  in jsdom.
- Integration tests exercise profile, selection, keybind, alias, and virtual VFX
  workflows using the production broadcast/cache communication model.
- Browser tests load the real application in Chromium and verify that the SPA
  completes initialization.
- Shared fixtures under `tests/fixtures/` provide event-bus, storage, service,
  data, and UI harnesses with cleanup between tests.

## Commands

```bash
npm run test:unit
npm run test:integration
npm run test:browser
npm run test:coverage
npm run test:html
```

Run `npm run check` for the local quality gate. Run `npm run test:ci` for the
same gate plus the production bundle and Chromium smoke test. GitHub Actions
runs the CI command and rejects changes that leave `src/dist/bundle.js` stale.

See `tests/README.md` for fixture usage and the canonical profile command shape.
