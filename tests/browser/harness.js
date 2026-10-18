import { trix, checkpoint, onCleanup, dispose } from '/modules/trix.js';
import { trax, Trax } from '/vendor/trax.js';
import { checkpoints } from './checkpoint-adapter.js';

const mount = trix(document.getElementById('mount'));

function reactiveProbe(initial, sharedSource) {
    const source = sharedSource ?? trax(initial);
    const stats = { computations: 0, values: [] };
    const value = trax(source).fct(input => {
        stats.computations++;
        stats.values.push(input);
        return input;
    });
    return {
        source, value, stats,
        set(input) { source(input); },
        reset() { stats.computations = 0; stats.values.length = 0; }
    };
}

function cleanupProbe(label, log = []) {
    const stats = { calls: 0 };
    return {
        stats, log,
        callback() { stats.calls++; log.push(label); }
    };
}

customElements.define('connection-probe', class extends HTMLElement {
    connects = 0;
    disconnects = 0;
    connectedCallback() { this.connects++; }
    disconnectedCallback() { this.disconnects++; }
});

window.harness = {
    trix, trax, Trax, checkpoint, onCleanup, dispose, tags: trix(), mount, checkpoints,
    reactiveProbe, cleanupProbe,
    connectionProbe() { return document.createElement('connection-probe'); },
    async flush() { await new Promise(resolve => setTimeout(resolve, 0)); }
};
