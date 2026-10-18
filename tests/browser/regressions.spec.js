import { test, expect } from './fixtures.js';

// Ordinary failing tests: do not use test.fail(), which would hide these bugs.
test('removed content bindings stop computing and updating detached views', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { reactiveProbe, tags: { P }, mount } = window.harness;
        const probe = reactiveProbe('before'), child = P(probe.value);
        mount.trix(child); mount.trix('replacement');
        probe.reset(); probe.set('after removal');
        return { text: child.textContent, computations: probe.stats.computations };
    });
    expect(result).toEqual({ text: 'before', computations: 0 });
});

test('replacing a reactive attribute releases the previous binding', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { reactiveProbe, tags: { DIV } } = window.harness;
        const old = reactiveProbe('old'), current = reactiveProbe('current');
        const node = DIV({ title: old.value });
        node.trix({ title: current.value });
        old.reset(); old.set('stale'); current.set('latest'); old.set('stale again');
        return { title: node.title, oldComputations: old.stats.computations };
    });
    expect(result).toEqual({ title: 'latest', oldComputations: 0 });
});

test('instrumenting an element again does not leave a competing renderer', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { trix, reactiveProbe, tags: { DIV } } = window.harness;
        const probe = reactiveProbe('before'), node = DIV(probe.value);
        trix(node); node.trix('replacement');
        probe.reset(); probe.set('obsolete');
        return { text: node.textContent, computations: probe.stats.computations };
    });
    expect(result).toEqual({ text: 'replacement', computations: 0 });
});

test('an empty child list clears the mounted view', async ({ harnessPage: page }) => {
    expect(await page.evaluate(() => {
        const { mount } = window.harness;
        mount.trix('content'); mount.trix();
        return mount.childNodes.length;
    })).toBe(0);
});

test('reactive values nested inside reactive arrays remain subscribed', async ({ harnessPage: page }) => {
    expect(await page.evaluate(() => {
        const { trax, tags: { DIV } } = window.harness;
        const inner = trax('before'), outer = trax([inner]), node = DIV(outer);
        inner('after');
        return node.textContent;
    })).toBe('after');
});

test('retained input keeps focus and selection when a sibling changes', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { tags: { INPUT, SPAN }, mount } = window.harness;
        const input = INPUT({ value: 'abcdef' });
        mount.trix(input, SPAN('before'));
        input.focus(); input.setSelectionRange(2, 4);
        mount.trix(input, SPAN('after'));
        return { focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd };
    });
    expect(result).toEqual({ focused: true, start: 2, end: 4 });
});

test('unchanged elements are not disconnected and reconnected', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { connectionProbe, mount } = window.harness;
        const node = connectionProbe();
        mount.trix(node);
        const initial = { connects: node.connects, disconnects: node.disconnects };
        mount.trix(node);
        return { connects: node.connects - initial.connects, disconnects: node.disconnects - initial.disconnects };
    });
    expect(result).toEqual({ connects: 0, disconnects: 0 });
});

test('text factory creates a usable reactive text node', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { trax, tags: { text }, mount } = window.harness;
        const source = trax('before'), node = text(source);
        mount.trix(node); source('after');
        return { type: node.nodeType, value: node.textContent };
    });
    expect(result).toEqual({ type: 3, value: 'after' });
});

test('supplied native text and comment nodes retain their identity', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { mount } = window.harness;
        const text = document.createTextNode('text'), comment = document.createComment('comment');
        mount.trix(text, comment);
        return { text: mount.childNodes[0] === text, comment: mount.childNodes[1] === comment };
    });
    expect(result).toEqual({ text: true, comment: true });
});

test('document fragments contribute their children', async ({ harnessPage: page }) => {
    expect(await page.evaluate(() => {
        const { mount } = window.harness;
        const fragment = document.createDocumentFragment(), child = document.createElement('strong');
        child.textContent = 'content'; fragment.append(child); mount.trix(fragment);
        return mount.firstChild === child;
    })).toBe(true);
});

test('cleanup descends through ordinary uninstrumented wrappers', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { reactiveProbe, cleanupProbe, tags: { P }, mount } = window.harness;
        const probe = reactiveProbe('before'), cleanup = cleanupProbe('child');
        const child = P({ cleanup: cleanup.callback }, probe.value), wrapper = document.createElement('section');
        wrapper.append(child); mount.trix(wrapper); mount.trix('replacement');
        probe.reset(); probe.set('after');
        return { cleanup: cleanup.stats.calls, computations: probe.stats.computations };
    });
    expect(result).toEqual({ cleanup: 1, computations: 0 });
});

test('one failing cleanup does not prevent sibling cleanup', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { cleanupProbe, tags: { P }, mount } = window.harness;
        const sibling = cleanupProbe('sibling');
        mount.trix(
            P({ cleanup: () => { throw new Error('cleanup failed'); } }, 'first'),
            P({ cleanup: sibling.callback }, 'second')
        );
        let error;
        try { mount.trix('replacement'); } catch (failure) { error = failure.message; }
        return { sibling: sibling.stats.calls, error };
    });
    expect(result).toEqual({ sibling: 1, error: 'cleanup failed' });
});
