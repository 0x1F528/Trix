import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    fullyParallel: true,
    workers: 2,
    retries: 0,
    timeout: 15_000,
    expect: { timeout: 3_000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4179',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [
        { name: 'compatibility', testMatch: 'compatibility.spec.js' },
        { name: 'regressions', testMatch: 'regressions.spec.js' },
        { name: 'checkpoints', testMatch: ['checkpoints.spec.js', 'ownership.spec.js'] }
    ],
    webServer: {
        command: 'node tests/browser/server.mjs',
        url: 'http://127.0.0.1:4179',
        reuseExistingServer: false,
        timeout: 15_000
    }
});
