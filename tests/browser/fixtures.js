import { test as base, expect } from '@playwright/test';

export const test = base.extend({
    harnessPage: async ({ page }, use) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            return url.origin === 'http://127.0.0.1:4179' ?
                route.continue() : route.abort('blockedbyclient');
        });
        await page.goto('/');
        await page.waitForFunction(() => Boolean(window.harness));
        await use(page);
        expect(errors, 'Unexpected browser errors').toEqual([]);
    }
});
export { expect };
