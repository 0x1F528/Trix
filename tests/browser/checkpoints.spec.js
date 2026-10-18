import { test, expect } from './fixtures.js';

// Contracts use a small adapter so the test semantics stay independent of syntax.
test.describe('checkpoint ownership contracts', () => {

    test('returning from construction leaves the view active', async ({ harnessPage: page }) => {
        const result = await page.evaluate(() => {
            const { checkpoints, reactiveProbe, tags: { P }, mount } = window.harness;
            const probe = reactiveProbe('before');
            const owner = checkpoints.run(() => P(probe.value));
            mount.trix(owner.value); probe.reset(); probe.set('after');
            return { text: owner.value.textContent, computations: probe.stats.computations };
        });
        expect(result).toEqual({ text: 'after', computations: 1 });
    });

    test('disposing an owner stops its content bindings', async ({ harnessPage: page }) => {
        const result = await page.evaluate(() => {
            const { checkpoints, reactiveProbe, tags: { P }, mount } = window.harness;
            const probe = reactiveProbe('before');
            const owner = checkpoints.run(() => P(probe.value));
            mount.trix(owner.value); owner.dispose();
            probe.reset(); probe.set('after');
            return { computations: probe.stats.computations, text: owner.value.textContent };
        });
        expect(result).toEqual({ computations: 0, text: 'before' });
    });

    test('parent disposal disposes nested checkpoints child first', async ({ harnessPage: page }) => {
        const log = await page.evaluate(() => {
            const { checkpoints } = window.harness, log = [];
            const parent = checkpoints.run(() => {
                checkpoints.onCleanup(() => log.push('parent'));
                checkpoints.run(() => checkpoints.onCleanup(() => log.push('child')));
            });
            parent.dispose();
            return log;
        });
        expect(log).toEqual(['child', 'parent']);
    });

    test('consuming a shared source does not transfer its ownership', async ({ harnessPage: page }) => {
        const result = await page.evaluate(() => {
            const { checkpoints, trax, reactiveProbe, tags: { P }, mount } = window.harness;
            const source = trax('before');
            const removed = reactiveProbe(undefined, source), kept = reactiveProbe(undefined, source);
            const owner = checkpoints.run(() => P(removed.value));
            const sibling = checkpoints.run(() => P(kept.value));
            mount.trix(owner.value, sibling.value); owner.dispose();
            removed.reset(); kept.reset(); source('after');
            return { removed: removed.stats.computations, kept: kept.stats.computations, source: source(), text: sibling.value.textContent };
        });
        expect(result).toEqual({ removed: 0, kept: 1, source: 'after', text: 'after' });
    });

    test('failed construction releases resources acquired before failure', async ({ harnessPage: page }) => {
        const result = await page.evaluate(() => {
            const { checkpoints, reactiveProbe, tags: { P } } = window.harness;
            const probe = reactiveProbe('before'), log = [];
            let error;
            try {
                checkpoints.run(() => {
                    checkpoints.onCleanup(() => log.push('cleanup'));
                    P(probe.value);
                    throw new Error('construction failed');
                });
            } catch (failure) { error = failure.message; }
            probe.reset(); probe.set('after');
            return { log, computations: probe.stats.computations, error };
        });
        expect(result).toEqual({ log: ['cleanup'], computations: 0, error: 'construction failed' });
    });

    test('disposal is idempotent', async ({ harnessPage: page }) => {
        expect(await page.evaluate(() => {
            const { checkpoints } = window.harness;
            let calls = 0;
            const owner = checkpoints.run(() => checkpoints.onCleanup(() => calls++));
            owner.dispose(); owner.dispose();
            return calls;
        })).toBe(1);
    });

    test('cleanup continues after an error and reports the error', async ({ harnessPage: page }) => {
        const result = await page.evaluate(() => {
            const { checkpoints } = window.harness, log = [];
            const owner = checkpoints.run(() => {
                checkpoints.onCleanup(() => { log.push('first'); throw new Error('cleanup failed'); });
                checkpoints.onCleanup(() => log.push('second'));
            });
            let error;
            try { owner.dispose(); } catch (failure) { error = failure.message; }
            return { log: log.sort(), error };
        });
        expect(result).toEqual({ log: ['first', 'second'], error: 'cleanup failed' });
    });

    test('reconciliation retains owners for reused elements and releases removed owners', async ({ harnessPage: page }) => {
        const result = await page.evaluate(() => {
            const { checkpoints, reactiveProbe, tags: { P }, mount } = window.harness;
            const a = reactiveProbe('a'), b = reactiveProbe('b');
            const removed = checkpoints.run(() => P(a.value));
            const kept = checkpoints.run(() => P(b.value));
            mount.trix(removed.value, kept.value); mount.trix(kept.value);
            a.reset(); b.reset(); a.set('obsolete'); b.set('alive');
            return { removed: a.stats.computations, kept: b.stats.computations, text: kept.value.textContent };
        });
        expect(result).toEqual({ removed: 0, kept: 1, text: 'alive' });
    });

    test('replacing an attribute binding releases its previous owner', async ({ harnessPage: page }) => {
        const result = await page.evaluate(() => {
            const { checkpoints, reactiveProbe, tags: { DIV } } = window.harness;
            const old = reactiveProbe('old'), current = reactiveProbe('current');
            const owner = checkpoints.run(() => DIV({ title: old.value }));
            owner.value.trix({ title: current.value });
            old.reset(); old.set('stale');
            return { title: owner.value.title, computations: old.stats.computations };
        });
        expect(result).toEqual({ title: 'current', computations: 0 });
    });
});
