import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const BROWSER_TEST_ROOT = resolve(REPOSITORY_ROOT, "tests/browser");
const VITEST_ENTRY = resolve(REPOSITORY_ROOT, "node_modules/vitest/vitest.mjs");
const BROWSER_TEST_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/u;

/** @param {string} filePath */
function repositoryPath(filePath) {
  return relative(REPOSITORY_ROOT, filePath).split(sep).join("/");
}

/** @param {string} directory @returns {Promise<string[]>} */
async function collectBrowserTests(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectBrowserTests(entryPath)));
    } else if (entry.isFile() && BROWSER_TEST_PATTERN.test(entry.name)) {
      files.push(repositoryPath(entryPath));
    }
  }
  return files;
}

export async function discoverBrowserTests() {
  return (await collectBrowserTests(BROWSER_TEST_ROOT)).sort();
}

/**
 * Run one browser file per Vitest process. Vitest's shared multi-file browser
 * session can strand iframe module requests during collection; process-level
 * isolation makes every file use a fresh module server and Chromium context.
 *
 * @param {Object} [options]
 * @param {string[]} [options.args]
 * @param {() => Promise<string[]>} [options.discover]
 * @param {(file: string, passthrough: string[]) => number | Promise<number>} [options.execute]
 * @param {(file: string) => void} [options.announce]
 * @returns {Promise<number>}
 */
export async function runBrowserTests({
  args = process.argv.slice(2),
  discover = discoverBrowserTests,
  execute = executeBrowserTest,
  announce = (file) => console.log(`\n[chromium] ${file}`),
} = {}) {
  const requestedFiles = args.filter((arg) => BROWSER_TEST_PATTERN.test(arg));
  const passthrough = args.filter((arg) => !BROWSER_TEST_PATTERN.test(arg));
  const files =
    requestedFiles.length > 0
      ? requestedFiles
      : [...(await discover())].sort((left, right) =>
          left.localeCompare(right),
        );

  if (files.length === 0) {
    console.error("No browser test files found.");
    return 1;
  }

  for (const file of files) {
    announce(file);
    const exitCode = await execute(file, passthrough);
    if (exitCode !== 0) return exitCode;
  }
  return 0;
}

/** @param {string} file @param {string[]} passthrough */
function executeBrowserTest(file, passthrough) {
  const result = spawnSync(
    process.execPath,
    [
      VITEST_ENTRY,
      "run",
      "--config=vitest.workspace.js",
      "--project",
      "browser",
      ...passthrough,
      file,
    ],
    {
      cwd: REPOSITORY_ROOT,
      env: { ...process.env, VITEST_PROJECT: "browser" },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  process.exitCode = await runBrowserTests();
}
