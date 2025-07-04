import { test, expect } from '@playwright/test';
import {
  waitForAppReady,
  clearAppData,
  loadTestData,
  selectKey,
  getCommandChain,
  addCommandFromLibrary,
} from '../utils/test-helpers.js';

function createBugTestProfile() {
  return {
    id: 'test-profile-for-chain-bug',
    name: 'Test Profile Chain Bug',
    version: '1.0.0', // or some version
    builds: {
      space: {
        keys: {
          F1: [
            { command: '+power_exec Distribute_Shields', id: 'uuid1-test' },
            { command: 'GenSendMessage Targets_Broadcast_Threat', id: 'uuid2-test' },
          ],
        },
      },
      ground: { keys: {} },
    },
    aliases: {},
  };
}

test.describe('Command Chain Duplication Bug Fix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAppData(page);
    await loadTestData(page, createBugTestProfile());
    await waitForAppReady(page);
  });

  test('should not duplicate commands in the UI when adding a new command', async ({ page }) => {
    // 1. Select the key with pre-existing commands
    await selectKey(page, 'F1');

    // 2. Get initial command count
    let initialCommands = await getCommandChain(page);
    const initialCount = initialCommands.length;
    expect(initialCount).toBe(2);

    // 3. Add a new command from the library by clicking on the elements
    // This is more realistic than the helper.
    await page.click('[data-category="combat"]');
    await page.click('[data-command-id="fire_all"]');
    
    // Wait for the UI to update
    await page.waitForTimeout(500); // Give it a moment to process events

    // 4. Get final command count
    const finalCommands = await getCommandChain(page);
    const finalCount = finalCommands.length;

    // 5. Assert that the count is correct
    expect(finalCount).toBe(initialCount + 1);
  });
});