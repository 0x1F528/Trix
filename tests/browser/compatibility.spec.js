import { test, expect } from './fixtures.js';

test('tag factories, nested arrays and literal children', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { tags: { DIV, P, SPAN }, mount } = window.harness;
        const view = DIV({ class: 'chapter' }, P('hello'), [[' ', SPAN('world')]], null, undefined, 0, false);
        mount.trix(view);
        return { tag: view.tagName, className: view.className, text: view.textContent, tags: [...view.children].map(n => n.tagName) };
    });
    expect(result).toEqual({ tag: 'DIV', className: 'chapter', text: 'hello world0false', tags: ['P', 'SPAN'] });
});

test('instrumented nodes expose a fluent child setter', async ({ harnessPage: page }) => {
    expect(await page.evaluate(() => {
        const { trix, mount } = window.harness;
        const node = trix(document.createElement('section'));
        return node.trix('content') === node && mount.trix(node) === mount;
    })).toBe(true);
    await expect(page.locator('#mount section')).toHaveText('content');
});

test('insertion points support id, class and tag indexes', async ({ harnessPage: page }) => {
    expect(await page.evaluate(() => {
        const { trix } = window.harness;
        const a = document.createElement('section'), b = document.createElement('section');
        a.id = 'first'; a.className = b.className = 'target';
        document.body.append(a, b);
        return trix('#first') === a && trix('.target', 1) === b && trix('section', 1) === b;
    })).toBe(true);
});

test('attributes, properties and the for convenience mapping', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { tags: { LABEL, INPUT } } = window.harness;
        const label = LABEL({ for: 'name', 'data-purpose': 'label' }, 'Name');
        const input = INPUT({ id: 'name', value: 'Sam', disabled: true });
        return { for: label.htmlFor, data: label.getAttribute('data-purpose'), value: input.value, disabled: input.disabled };
    });
    expect(result).toEqual({ for: 'name', data: 'label', value: 'Sam', disabled: true });
});

test('reactive content updates and performs observable computation', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { reactiveProbe, tags: { P }, mount } = window.harness;
        const probe = reactiveProbe('before'), child = P(probe.value);
        mount.trix(child); probe.reset(); probe.set('after');
        return { text: child.textContent, computations: probe.stats.computations };
    });
    expect(result).toEqual({ text: 'after', computations: 1 });
});

test('reactive attributes and repeated configuration retain one effective binding', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { reactiveProbe, tags: { DIV } } = window.harness;
        const probe = reactiveProbe('before'), node = DIV({ title: probe.value });
        node.trix({ title: probe.value });
        probe.reset(); probe.set('after');
        return { title: node.title, computations: probe.stats.computations };
    });
    expect(result).toEqual({ title: 'after', computations: 1 });
});

test('io synchronizes text input in both directions', async ({ harnessPage: page }) => {
    await page.evaluate(() => {
        const h = window.harness;
        h.model = h.trax('before');
        h.mount.trix(h.tags.INPUT({ id: 'input', io: h.model }));
    });
    await expect(page.locator('#input')).toHaveValue('before');
    await page.locator('#input').fill('typed');
    expect(await page.evaluate(() => window.harness.model())).toBe('typed');
    await page.evaluate(() => window.harness.model('from model'));
    await expect(page.locator('#input')).toHaveValue('from model');
});

test('checkbox synchronizes checked state in both directions', async ({ harnessPage: page }) => {
    await page.evaluate(() => {
        const h = window.harness;
        h.model = h.trax(false);
        h.mount.trix(h.tags.INPUT({ id: 'check', type: 'checkbox', checkbox: h.model }));
    });
    await page.locator('#check').check();
    expect(await page.evaluate(() => window.harness.model())).toBe(true);
    await page.evaluate(() => window.harness.model(false));
    await expect(page.locator('#check')).not.toBeChecked();
});

test('click signals fire reactive nodes and literal callbacks', async ({ harnessPage: page }) => {
    await page.evaluate(() => {
        const h = window.harness;
        h.clicks = [];
        const signal = h.trax(1).onChange(value => h.clicks.push(value));
        h.mount.trix(
            h.tags.BUTTON({ id: 'reactive', onclick: signal }, 'Reactive'),
            h.tags.BUTTON({ id: 'literal', onclick: value => h.clicks.push(value) }, 'Literal')
        );
    });
    await page.locator('#reactive').click();
    await page.locator('#literal').click();
    expect(await page.evaluate(() => window.harness.clicks)).toEqual([1, true]);
});

test('keyboard and focus handlers receive their documented arguments', async ({ harnessPage: page }) => {
    await page.evaluate(() => {
        const h = window.harness; h.events = [];
        h.mount.trix(h.tags.INPUT({
            id: 'keys',
            onkeydown: key => h.events.push(key),
            onfocus: node => h.events.push(node.id)
        }));
    });
    await page.locator('#keys').focus();
    await page.locator('#keys').press('Enter');
    expect(await page.evaluate(() => window.harness.events)).toEqual(['keys', 'Enter']);
});

test('elements and unchanged text nodes retain identity across reordering', async ({ harnessPage: page }) => {
    expect(await page.evaluate(() => {
        const { tags: { P }, mount } = window.harness;
        const a = P('a'), b = P('b');
        mount.trix(a, 'middle', b);
        const text = mount.childNodes[1];
        mount.trix(b, 'middle', a);
        return mount.childNodes[0] === b && mount.childNodes[1] === text && mount.childNodes[2] === a;
    })).toBe(true);
});

test('removed attribute bindings stop computing', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { reactiveProbe, tags: { P }, mount } = window.harness;
        const probe = reactiveProbe('before'), child = P({ title: probe.value }, 'content');
        mount.trix(child); mount.trix('replacement');
        probe.reset(); probe.set('after');
        return { title: child.title, computations: probe.stats.computations };
    });
    expect(result).toEqual({ title: 'before', computations: 0 });
});

test('nested cleanup runs child before parent and only for removed nodes', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { cleanupProbe, tags: { DIV, P }, mount } = window.harness;
        const log = [], parent = cleanupProbe('parent', log), child = cleanupProbe('child', log), kept = cleanupProbe('kept', log);
        const survivor = P({ cleanup: kept.callback }, 'keep');
        mount.trix(DIV({ cleanup: parent.callback }, P({ cleanup: child.callback }, 'remove')), survivor);
        mount.trix(survivor);
        mount.trix(survivor);
        return { log, parent: parent.stats.calls, child: child.stats.calls, kept: kept.stats.calls };
    });
    expect(result).toEqual({ log: ['child', 'parent'], parent: 1, child: 1, kept: 0 });
});

test('removal preserves shared sources and surviving attribute views', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { trax, reactiveProbe, tags: { P }, mount } = window.harness;
        const shared = trax('before'), removed = reactiveProbe(undefined, shared), kept = reactiveProbe(undefined, shared);
        const a = P({ title: removed.value }, 'a'), b = P({ title: kept.value }, 'b');
        mount.trix(a, b); mount.trix(b);
        removed.reset(); kept.reset(); shared('after');
        return { removed: removed.stats.computations, kept: kept.stats.computations, source: shared(), title: b.title };
    });
    expect(result).toEqual({ removed: 0, kept: 1, source: 'after', title: 'after' });
});

test('ASYNC updates settle using the harness flush helper', async ({ harnessPage: page }) => {
    const result = await page.evaluate(async () => {
        const { Trax, trax, tags: { P }, mount, flush } = window.harness;
        const source = trax('before'), node = P(source);
        mount.trix(node);
        Trax.onChange(Trax.MODE.ASYNC);
        source('intermediate'); source('after');
        const immediate = node.textContent;
        await flush();
        return { immediate, settled: node.textContent };
    });
    expect(result).toEqual({ immediate: 'before', settled: 'after' });
});
