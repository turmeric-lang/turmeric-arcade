import { defineConfig, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// The suite starts its OWN dev server on a free port and never reuses one.
// Port 3000 is Try Turmeric's dev server on a developer's machine, so it is
// refused.  ARCADE_TEST_PORT pins the port; the pick is made once, in the
// runner, and handed to the workers through the environment.
if (!process.env.ARCADE_TEST_PORT) {
    process.env.ARCADE_TEST_PORT = execFileSync(process.execPath, [
        '-e',
        "const s = require('net').createServer();" +
        "s.listen(0, '127.0.0.1', () => { process.stdout.write(String(s.address().port)); s.close(); });",
    ]).toString().trim();
}
const PORT = process.env.ARCADE_TEST_PORT;
if (PORT === '3000') throw new Error('ARCADE_TEST_PORT=3000 is the Try Turmeric dev server; pick any other port');
const ORIGIN = `http://localhost:${PORT}`;

// JSPI needs Chrome 137 or later.  ARCADE_CHROMIUM names a Chromium binary to
// run instead of the one Playwright installed.
const launchOptions = process.env.ARCADE_CHROMIUM ? { executablePath: process.env.ARCADE_CHROMIUM } : {};

export default defineConfig({
    testDir: './tests',
    timeout: 60_000,
    retries: process.env.CI ? 2 : 0,
    use: { baseURL: ORIGIN },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    ],
    webServer: {
        command: `npm run dev -- --port ${PORT} --strictPort`,
        url: ORIGIN,
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
