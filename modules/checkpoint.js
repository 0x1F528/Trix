// Synchronous ownership collection; lifetime ends only on explicit disposal.
let current = null;

export function throwErrors(errors, message = 'Checkpoint cleanup failed') {
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, message);
}

export class Checkpoint {
    constructor(parent = current) {
        if (parent?.disposed) throw new Error('Cannot create resources in a disposed checkpoint');
        this.parent = parent;
        this.children = new Set();
        this.resources = new Set();
        this.disposed = false;
        this.value = undefined;
        parent?.children.add(this);
    }

    run(build) {
        if (this.disposed) throw new Error('Cannot enter a disposed checkpoint');
        if (typeof build !== 'function' || build.constructor?.name === 'AsyncFunction') {
            throw new TypeError('Checkpoint construction must be a synchronous function');
        }
        const previous = current;
        const existingChildren = new Set(this.children);
        const existingResources = new Set(this.resources);
        current = this;
        try {
            const value = build();
            if (value && typeof value.then === 'function') {
                throw new TypeError('Checkpoint construction cannot return a promise');
            }
            return value;
        } catch (error) {
            // A failed later entry releases its acquisitions without destroying
            // resources that belonged to the checkpoint before this call.
            const errors = [error];
            for (const child of [...this.children]) {
                if (existingChildren.has(child)) continue;
                try { child.dispose(); } catch (cleanupError) { errors.push(cleanupError); }
            }
            for (const release of [...this.resources]) {
                if (existingResources.has(release)) continue;
                try { release(); } catch (cleanupError) { errors.push(cleanupError); }
            }
            throwErrors(errors, 'Checkpoint construction failed');
        } finally {
            current = previous;
        }
    }

    own(cleanup) {
        if (this.disposed) throw new Error('Cannot register cleanup in a disposed checkpoint');
        if (typeof cleanup !== 'function') throw new TypeError('Expected a cleanup function');
        let callback = cleanup;
        const release = () => {
            if (!callback) return;
            const execute = callback;
            callback = null;
            this.resources.delete(release);
            execute();
        };
        this.resources.add(release);
        return release;
    }

    adopt(child) {
        if (this.disposed || child.disposed) throw new Error('Cannot adopt a disposed checkpoint');
        for (let parent = this; parent; parent = parent.parent) {
            if (parent === child) throw new Error('Checkpoint ownership cycle');
        }
        child.parent?.children.delete(child);
        child.parent = this;
        this.children.add(child);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.parent?.children.delete(this);
        this.parent = null;
        const errors = [];
        for (const child of [...this.children]) {
            try { child.dispose(); } catch (error) { errors.push(error); }
        }
        this.children.clear();
        for (const release of [...this.resources]) {
            try { release(); } catch (error) { errors.push(error); }
        }
        this.resources.clear();
        throwErrors(errors);
    }
}

export function checkpoint(build) {
    const owner = new Checkpoint();
    try {
        owner.value = owner.run(build);
        return owner;
    } catch (error) {
        const errors = [error];
        try { owner.dispose(); } catch (cleanupError) { errors.push(cleanupError); }
        throwErrors(errors, 'Checkpoint construction failed');
    }
}

export function onCleanup(cleanup) {
    if (!current) throw new Error('onCleanup requires an active checkpoint');
    return current.own(cleanup);
}
