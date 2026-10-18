# Trix browser harness

Tests run in fresh, isolated Chromium pages against the local Trix and Trax modules.
All checkpoint contracts are now enabled. Regression tests remain ordinary assertions.

## Run

From the Trix root:

```powershell
npm ci
npm run test:install
npm run test:compat
npm run test:regressions
npm run test:contracts
npm test
```

- Compatibility preserves tag construction, fluent rendering, property mappings,
  reactive content, two-way input, event arguments, identity and cleanup.
- Regressions cover the original content leaks, binding replacement,
  reinstrumentation, clearing, nested reactivity, focus, connection lifecycle,
  native nodes, fragments, wrapper traversal and cleanup error handling.
- Checkpoints includes the original nine ownership contracts and additional
  boundary tests in ownership.spec.js: moved and retained views, resource cleanup,
  rollback, shared sources, queued updates and multi-root lifetime.

Any failed assertion gives a nonzero exit code. No expected-failure annotations
or skipped checkpoint contracts hide defects.

## Fixture and local dependency

The loopback server binds to 127.0.0.1:4179 and serves an explicit allowlist of
fixture files and production modules. It rewrites Trix's remote Trax import in
the served copy to /vendor/trax.js, preserving class identity with the fixture.
Production imports are not edited or downloaded.

By default Trax is ../Trax. Set TRAX_ROOT to another Trax project directory if
needed. An unexpected production import change deliberately fails the mapping.
Playwright starts and stops the server; external browser requests are blocked.

## Probes and artifacts

window.harness exposes trix, trax, Trax, checkpoint, onCleanup, dispose, tags and mount.

- reactiveProbe(initial, sharedSource?) records computations of a passive derived
  value. Reset after mounting, mutate the source, and assert both DOM behavior and
  computation counts. This establishes that removed bindings actually stop work.
- cleanupProbe(label, log?) records cleanup count and order.
- connectionProbe() records native connect/disconnect callbacks.
- flush() advances a timer turn for ASYNC tests.

Tests retain native DOM references to check identity, focus, selection and
detached views. They avoid private Trax fields and garbage-collection timing.

Failure screenshots and traces are retained in ignored test-results/.
npm run test:report opens the HTML report in playwright-report/.

## Checkpoint adapter

checkpoint-adapter.js maps the test-only interface to the public implementation:

- run(build) delegates to checkpoint(build) and returns its lifetime handle.
- onCleanup(callback) registers with the current checkpoint.

This keeps the original contracts independent of public API syntax. The
production checkpoint.js module can also be used without the DOM; the trix.js
wrapper adds returned-view-root lifetime integration.

The tests currently cover Chromium. Additional browser projects can be added
when checking browser compatibility, particularly native state-preserving moves.
