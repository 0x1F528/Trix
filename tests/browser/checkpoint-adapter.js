import { checkpoint, onCleanup } from '/modules/trix.js';

// Test-only interface keeps ownership contracts independent of public syntax.
export const checkpoints = { run: checkpoint, onCleanup };
