import { test, expect } from './fixtures.js';

test('using an existing view does not transfer its checkpoint ownership', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { checkpoint, reactiveProbe, tags: { P }, mount } = window.harness;
        const probe = reactiveProbe('before');
        const original = checkpoint(() => P(probe.value));
        const consumer = checkpoint(() => original.value);
        mount.trix(consumer.value); consumer.dispose();
        probe.reset(); probe.set('after');
        const active = { text: original.value.textContent, computations: probe.stats.computations };
        original.dispose(); probe.reset(); probe.set('disposed');
        return { active, disposed: probe.stats.computations };
    });
    expect(result).toEqual({ active: { text: 'after', computations: 1 }, disposed: 0 });
});

test('retained owners can explicitly collect resources during later synchronous work', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { checkpoint, onCleanup, tags: { P }, mount } = window.harness;
        const log = [], owner = checkpoint(() => 'initial');
        const node = owner.run(() => {
            onCleanup(() => log.push('later resource'));
            return P({ cleanup: () => log.push('view') }, 'later');
        });
        mount.trix(node); owner.dispose();
        return log;
    });
    expect(result).toEqual(['view', 'later resource']);
});

test('failed nested construction restores the enclosing checkpoint', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { checkpoint, onCleanup } = window.harness, log = [];
        const owner = checkpoint(() => {
            try {
                checkpoint(() => {
                    onCleanup(() => log.push('failed child'));
                    throw new Error('failure');
                });
            } catch {}
            onCleanup(() => log.push('parent'));
        });
        const before = [...log]; owner.dispose();
        return { before, after: log };
    });
    expect(result).toEqual({ before: ['failed child'], after: ['failed child', 'parent'] });
});

test('construction and cleanup errors are both retained', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { checkpoint, onCleanup } = window.harness;
        try {
            checkpoint(() => {
                onCleanup(() => { throw new Error('cleanup'); });
                throw new Error('construction');
            });
        } catch (error) {
            return { aggregate: error instanceof AggregateError, messages: error.errors.map(e => e.message) };
        }
    });
    expect(result).toEqual({ aggregate: true, messages: ['construction', 'cleanup'] });
});

test('async builders are rejected before executing and ownership does not leak', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { checkpoint, onCleanup } = window.harness;
        let called = false, rejected = false, outside = false;
        try { checkpoint(async () => { called = true; }); } catch (e) { rejected = e instanceof TypeError; }
        try { onCleanup(() => {}); } catch (e) { outside = /active checkpoint/.test(e.message); }
        return { called, rejected, outside };
    });
    expect(result).toEqual({ called: false, rejected: true, outside: true });
});

test('disposed checkpoints reject new resources and remain idempotent after errors', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { checkpoint, onCleanup } = window.harness;
        let calls = 0, enter = false, register = false;
        const owner = checkpoint(() => onCleanup(() => { calls++; throw new Error('failure'); }));
        try { owner.dispose(); } catch {}
        owner.dispose();
        try { owner.run(() => {}); } catch { enter = true; }
        try { owner.own(() => {}); } catch { register = true; }
        return { calls, enter, register };
    });
    expect(result).toEqual({ calls: 1, enter: true, register: true });
});

test('early resource release is idempotent and does not run again at disposal', async ({ harnessPage: page }) => {
    expect(await page.evaluate(() => {
        const { checkpoint, onCleanup } = window.harness;
        let calls = 0;
        const owner = checkpoint(() => onCleanup(() => calls++));
        owner.value(); owner.value(); owner.dispose();
        return calls;
    })).toBe(1);
});

test('replacing reactive nested content unsubscribes obsolete inner dependencies', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { trax, reactiveProbe, tags: { DIV }, mount } = window.harness;
        const old = reactiveProbe('old'), current = reactiveProbe('current');
        const list = trax([old.value]), node = DIV(list); mount.trix(node);
        list([[current.value]]);
        old.reset(); current.reset(); old.set('stale'); current.set('latest');
        return { old: old.stats.computations, current: current.stats.computations, text: node.textContent };
    });
    expect(result).toEqual({ old: 0, current: 1, text: 'latest' });
});

test('literal attribute replacement releases the reactive subscription', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { reactiveProbe, tags: { DIV } } = window.harness;
        const probe = reactiveProbe('before'), node = DIV({ title: probe.value });
        node.trix({ title: 'static' }); probe.reset(); probe.set('after');
        return { title: node.title, computations: probe.stats.computations };
    });
    expect(result).toEqual({ title: 'static', computations: 0 });
});

test('disposal releases DOM event handlers as well as subscriptions', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { dispose, tags: { BUTTON }, mount } = window.harness;
        let calls = 0;
        const node = BUTTON({ onclick: () => calls++ }, 'button');
        mount.trix(node); node.click(); dispose(node); node.click();
        return { calls, handler: node.onclick };
    });
    expect(result).toEqual({ calls: 1, handler: null });
});

test('pending ASYNC content updates are cancelled by removal', async ({ harnessPage: page }) => {
    const result = await page.evaluate(async () => {
        const { Trax, reactiveProbe, tags: { P }, mount, flush } = window.harness;
        const probe = reactiveProbe('before'), node = P(probe.value); mount.trix(node);
        Trax.onChange(Trax.MODE.ASYNC);
        probe.reset(); probe.set('after'); mount.trix();
        await flush();
        return { text: node.textContent, computations: probe.stats.computations };
    });
    expect(result).toEqual({ text: 'before', computations: 0 });
});

test('moving a view out of a removed wrapper preserves its active bindings', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { reactiveProbe, cleanupProbe, tags: { DIV, P }, mount } = window.harness;
        const probe = reactiveProbe('before'), cleanup = cleanupProbe('child');
        let child;
        const wrapper = DIV(() => child = P({ cleanup: cleanup.callback }, probe.value));
        mount.trix(wrapper); mount.trix(child);
        probe.reset(); probe.set('after');
        return { text: child.textContent, cleanup: cleanup.stats.calls, computations: probe.stats.computations };
    });
    expect(result).toEqual({ text: 'after', cleanup: 0, computations: 1 });
});

test('owners created in a render survive when their view is retained on the next render', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { checkpoint, onCleanup, trax, reactiveProbe, tags: { DIV, P }, mount } = window.harness;
        const signal = trax('first'), probe = reactiveProbe('before'), log = [];
        let child;
        const node = DIV(signal, () => {
            if (!child) child = checkpoint(() => {
                onCleanup(() => log.push('nested checkpoint'));
                return P(probe.value);
            }).value;
            return child;
        });
        mount.trix(node); signal('second'); probe.reset(); probe.set('after');
        const active = { log: [...log], text: child.textContent, computations: probe.stats.computations };
        node.trix(); probe.reset(); probe.set('disposed');
        return { active, log, disposed: probe.stats.computations };
    });
    expect(result).toEqual({ active: { log: [], text: 'after', computations: 1 }, log: ['nested checkpoint'], disposed: 0 });
});

test('failed rendering releases newly constructed views and keeps prior content usable', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { reactiveProbe, tags: { DIV, P }, mount } = window.harness;
        const original = reactiveProbe('before'), temporary = reactiveProbe('temporary');
        const node = DIV(original.value); mount.trix(node);
        let failed = false;
        try {
            node.trix(() => {
                P(temporary.value);
                throw new Error('render failed');
            });
        } catch { failed = true; }
        temporary.reset(); temporary.set('unused');
        original.set('after');
        return { failed, temporary: temporary.stats.computations, text: node.textContent };
    });
    expect(result).toEqual({ failed: true, temporary: 0, text: 'after' });
});

test('recursive child expressions and missing insertion points fail descriptively', async ({ harnessPage: page }) => {
    const messages = await page.evaluate(() => {
        const { trix, tags: { DIV } } = window.harness, messages = [];
        const array = []; array.push(array);
        const fn = () => fn;
        for (const build of [() => DIV(array), () => DIV(fn), () => trix('#absent')]) {
            try { build(); } catch (error) { messages.push(error.message); }
        }
        return messages;
    });
    expect(messages).toEqual(['Trix recursive child expression', 'Trix recursive child expression', 'Trix insertion point not found: #absent']);
});

test('fragment arguments preserve their children across later reactive renders', async ({ harnessPage: page }) => {
    expect(await page.evaluate(() => {
        const { trax, tags: { DIV }, mount } = window.harness;
        const fragment = document.createDocumentFragment(), child = document.createElement('strong'), source = trax('before');
        child.textContent = 'strong'; fragment.append(child);
        const node = DIV(fragment, source); mount.trix(node); source('after');
        return node.firstChild === child && node.textContent === 'strongafter';
    })).toBe(true);
});

test('removing a checkpoint view releases its non-DOM resources', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { checkpoint, onCleanup, tags: { P }, mount } = window.harness, log = [];
        const owner = checkpoint(() => {
            onCleanup(() => log.push('resource'));
            return P({ cleanup: () => log.push('view') }, 'content');
        });
        mount.trix(owner.value); mount.trix(); owner.dispose();
        return { log, disposed: owner.disposed };
    });
    expect(result).toEqual({ log: ['view', 'resource'], disposed: true });
});

test('a multi-root checkpoint lives until its last view root is removed', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { checkpoint, onCleanup, tags: { P }, mount } = window.harness;
        let calls = 0;
        const owner = checkpoint(() => {
            onCleanup(() => calls++);
            return [P('a'), P('b')];
        });
        mount.trix(owner.value); mount.trix(owner.value[1]);
        const retained = { calls, disposed: owner.disposed };
        mount.trix();
        return { retained, calls, disposed: owner.disposed };
    });
    expect(result).toEqual({ retained: { calls: 0, disposed: false }, calls: 1, disposed: true });
});

test('a failed later checkpoint entry cleans up only its new acquisitions', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { checkpoint, onCleanup, reactiveProbe, tags: { P }, mount } = window.harness;
        const original = reactiveProbe('before'), temporary = reactiveProbe('temporary'), log = [];
        const owner = checkpoint(() => P(original.value)); mount.trix(owner.value);
        try {
            owner.run(() => {
                onCleanup(() => log.push('temporary'));
                P(temporary.value);
                throw new Error('later failure');
            });
        } catch {}
        original.reset(); temporary.reset(); original.set('after'); temporary.set('unused');
        return { text: owner.value.textContent, original: original.stats.computations, temporary: temporary.stats.computations, log };
    });
    expect(result).toEqual({ text: 'after', original: 1, temporary: 0, log: ['temporary'] });
});

test('shared dependency updates produce a single content render', async ({ harnessPage: page }) => {
    const result = await page.evaluate(() => {
        const { trax, tags: { DIV } } = window.harness;
        const source = trax(1), left = trax(source).fct(x => x * 2), right = trax(source).fct(x => x * 3);
        let renders = 0;
        const node = DIV(left, right, () => { renders++; return ''; });
        renders = 0; source(2);
        return { renders, text: node.textContent };
    });
    expect(result).toEqual({ renders: 1, text: '46' });
});

test('changing an event alias replaces its argument mapping even for the same callback', async ({ harnessPage: page }) => {
    const values = await page.evaluate(() => {
        const { tags: { INPUT } } = window.harness, values = [];
        const callback = value => values.push(value);
        const node = INPUT({ type: 'checkbox', value: 'value', checkbox: callback });
        values.length = 0; // The two-way binding calls its getter during construction.
        node.checked = true; node.dispatchEvent(new Event('change'));
        node.trix({ onchange: callback }); node.dispatchEvent(new Event('change'));
        return values;
    });
    expect(values).toEqual([true, 'value']);
});

test('function-valued properties are refreshed on explicit renders', async ({ harnessPage: page }) => {
    expect(await page.evaluate(() => {
        const { tags: { DIV } } = window.harness;
        let value = 'before';
        const props = { title: () => value }, node = DIV(props);
        value = 'after'; node.trix(props);
        return node.title;
    })).toBe('after');
});
