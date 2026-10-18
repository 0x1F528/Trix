/********************************************************************************************************************
    Trix UI SPA framework

    Quick:  const { DIV, H1, P } = trix();          // <div>, <h1>, and <p> DOM node generator functions
            let txt = trax("This is more content")  // create a trax instance to hold some content
            let content = DIV(                      // <div
                { class: 'chapter' },               //    class='chapter'>
                H1("This is a header"),             //    <h1>This is a header</h1>
                P("This is some paragraph content"),//    <p>This is some paragraph content</p>
                P(txt)                              //    <p>This is some more content</p>
            );                                      // </div>
            let app = document.getElementById('app')// get insertion point DOM node
            trix(app);                              // instrument the app DOM node with trix capabilities
            app.trix(content);                      // inject our content into the app DOM node
            txt("This is new content");             // The second <p> will now display "This is new content"
            app.trix(DIV("Hello World"));           // The previous content is now replaced with a single <div>Hello World</div>
            
********************************************************************************************************************/

import { trax, Trax } from 'https://0x1f528.github.io/Trax/modules/trax.js';
import { Checkpoint, checkpoint as createCheckpoint, onCleanup, throwErrors } from './checkpoint.js';

const states = new WeakMap();
const renderOwners = new WeakMap();
const rootGroups = new WeakMap();
const mappings = { io: ['value', 'oninput'], checkbox: ['checked', 'onchange'], for: ['htmlFor'] };
let nextId = 0;

function isNode(value) {
    const NodeClass = value?.ownerDocument?.defaultView?.Node ?? globalThis.Node;
    return typeof NodeClass === 'function' && value instanceof NodeClass;
}

function isProps(value) {
    if (!value || typeof value !== 'object' || isNode(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function decode(value, document) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value);
    return textarea.value;
}

function setProperty(node, name, value) {
    if (name in node) node[name] = value ?? '';
    else if (value == null) node.removeAttribute(name);
    else node.setAttribute(name, String(value));
}

function watch(source, owner, callback) {
    const subscriber = trax(source);
    owner.own(() => subscriber.onChange(false).deregister());
    subscriber.onChange(callback);
    return subscriber;
}

function binding(state, key, value, create, variant) {
    const previous = state.bindings.get(key);
    if (previous && !previous.owner.disposed && Object.is(previous.value, value) && previous.variant === variant) return false;
    previous?.owner.dispose();
    const owner = new Checkpoint(state.owner);
    state.bindings.set(key, { value, owner, variant });
    try { create(owner); }
    catch (error) {
        state.bindings.delete(key);
        const errors = [error];
        try { owner.dispose(); } catch (cleanupError) { errors.push(cleanupError); }
        throwErrors(errors, 'Trix binding failed');
    }
    return true;
}

function eventHandler(node, attribute, callback) {
    return event => {
        let value;
        switch (attribute) {
            case 'onkeyup': case 'onkeydown': value = event.key; break;
            case 'checkbox': value = event.target.checked; break;
            case 'onclick':
                if (Trax.isTrax(callback)) { callback.fire(); return; }
                value = true; break;
            case 'onfocus': value = event.target; break;
            default: value = event.target.value;
        }
        if (Trax.isTrax(callback)) callback(value);
        else callback.call(node, value, event);
    };
}

function configProps(state, props) {
    const { node } = state;
    for (const [attribute, value] of Object.entries(props)) {
        if (attribute === 'cleanup') {
            if (value != null && typeof value !== 'function') throw new TypeError('cleanup must be a function');
            state.cleanup = value;
            continue;
        }
        const mapping = Object.hasOwn(mappings, attribute) ? mappings[attribute] :
            attribute.startsWith('on') ? [undefined, attribute] : [attribute];
        const [input, output] = mapping;
        if (input) {
            const created = binding(state, 'property:' + input, value, owner => {
                const write = next => { if (!owner.disposed) setProperty(node, input, next); };
                if (Trax.isTrax(value)) watch(value, owner, write);
                write(typeof value === 'function' ? value() : value);
            });
            if (!created) setProperty(node, input, typeof value === 'function' ? value() : value);
        }
        if (output) binding(state, 'event:' + output, value, owner => {
            const handler = typeof value === 'function' ? eventHandler(node, attribute, value) : value;
            node[output] = handler;
            owner.own(() => { if (node[output] === handler) node[output] = null; });
        }, attribute);
    }
}

function normalize(state) {
    const content = [], props = [], dependencies = new Set(), path = new Set();
    function visit(value, depth = 0) {
        if (depth > 256) throw new Error('Trix child normalization exceeded its nesting limit');
        if (value == null) return;
        if (Array.isArray(value) || typeof value === 'function') {
            if (path.has(value)) throw new Error('Trix recursive child expression');
            path.add(value);
            try {
                if (typeof value === 'function') {
                    if (Trax.isTrax(value)) dependencies.add(value);
                    visit(value(), depth + 1);
                } else for (const child of value) visit(child, depth + 1);
            } finally { path.delete(value); }
        } else if (isNode(value)) {
            if (value.nodeType === 11) {
                // A fragment is consumed by insertion. Preserve its initial children
                // for later reactive renders of the same argument.
                if (!state.fragments.has(value)) state.fragments.set(value, [...value.childNodes]);
                for (const child of state.fragments.get(value)) visit(child, depth + 1);
            } else if ([1, 3, 8].includes(value.nodeType)) content.push(value);
            else throw new TypeError('Unsupported DOM child node type: ' + value.nodeType);
        } else if (isProps(value)) props.push(value);
        else if (['string', 'number', 'boolean', 'bigint', 'symbol'].includes(typeof value)) content.push(value);
        else throw new TypeError('Unsupported Trix child: ' + Object.prototype.toString.call(value));
    }
    visit(state.args);
    return { content, props, dependencies };
}

function syncDependencies(state, dependencies) {
    if (dependencies.size === state.dependencies.size &&
        [...dependencies].every(source => state.dependencies.has(source))) return;
    // One observer subscribes to the discovered dependency set. Temporarily
    // deactivate it while rewiring so refresh does not recursively render.
    state.tracker.onChange(false);
    state.tracker.register([...dependencies]);
    state.tracker.onChange(state.changed);
    state.dependencies = dependencies;
}

function disposeTree(node, errors) {
    const state = states.get(node);
    if (state) {
        try { state.owner.dispose(); } catch (error) { errors.push(error); }
    } else {
        for (const child of [...node.childNodes]) disposeTree(child, errors);
        releaseGroups(node, errors);
    }
}

function releaseGroups(node, errors) {
    const groups = rootGroups.get(node);
    if (!groups) return;
    rootGroups.delete(node);
    for (const group of groups) {
        group.roots.delete(node);
        if (!group.roots.size) {
            try { group.owner.dispose(); } catch (error) { errors.push(error); }
        }
    }
}

function releaseNode(state) {
    const errors = [];
    for (const child of [...state.node.childNodes]) disposeTree(child, errors);
    state.args = [];
    state.dependencies.clear();
    state.bindings.clear();
    state.renderOwner = null;
    const cleanup = state.cleanup;
    state.cleanup = undefined;
    if (cleanup) {
        try { cleanup.call(state.node); } catch (error) { errors.push(error); }
    }
    releaseGroups(state.node, errors);
    throwErrors(errors, 'Trix cleanup failed');
}

function preserveOwners(newOwner, nodes) {
    const retained = new Set();
    function collect(node) {
        retained.add(node);
        for (const child of node.childNodes) collect(child);
    }
    for (const node of nodes) collect(node);
    for (const node of retained) {
        let owner = states.get(node)?.owner;
        while (owner?.parent && !renderOwners.has(owner.parent)) owner = owner.parent;
        const previousRender = owner?.parent;
        // Preserve explicit construction ownership. Only transfer groups acquired
        // during a render whose generating container is no longer retained.
        if (previousRender && previousRender !== newOwner &&
            renderOwners.has(previousRender) && !retained.has(renderOwners.get(previousRender).node)) {
            newOwner.adopt(owner);
        }
    }
}

function desiredChildren(state, content) {
    const available = [...state.node.childNodes].filter(node => node.nodeType === 3);
    const desired = content.map(value => {
        if (isNode(value)) return value;
        const text = decode(value, state.node.ownerDocument);
        const index = available.findIndex(node => node.textContent === text);
        return index < 0 ? state.node.ownerDocument.createTextNode(text) : available.splice(index, 1)[0];
    });
    const unique = new Set();
    for (const child of desired) {
        if (unique.has(child)) throw new Error('A DOM node cannot appear twice in a Trix child list');
        if (child === state.node || child.contains(state.node)) throw new Error('Trix DOM ownership cycle');
        unique.add(child);
    }
    return desired;
}

function reconcile(state, desired) {
    const { node } = state;
    let cursor = node.firstChild;
    for (const child of desired) {
        if (child === cursor) cursor = cursor.nextSibling;
        else if (typeof node.moveBefore === 'function' && child.parentNode &&
            child.ownerDocument === node.ownerDocument && child.isConnected && node.isConnected) {
            node.moveBefore(child, cursor);
        } else node.insertBefore(child, cursor);
    }
    const retained = new Set(desired), errors = [];
    for (const child of [...node.childNodes]) {
        if (retained.has(child)) continue;
        node.removeChild(child);
        disposeTree(child, errors);
    }
    return errors;
}

function renderOnce(state) {
    const owner = new Checkpoint(state.owner);
    renderOwners.set(owner, state);
    let committed = false;
    try {
        const normalized = owner.run(() => normalize(state));
        const characterData = state.node.nodeType === 3 || state.node.nodeType === 8;
        if (characterData && (normalized.props.length || normalized.content.some(isNode))) {
            throw new TypeError('Text and comment nodes accept only text content');
        }
        const desired = characterData ? [] : desiredChildren(state, normalized.content);
        for (const props of normalized.props) configProps(state, props);
        syncDependencies(state, normalized.dependencies);
        const previous = state.renderOwner;
        preserveOwners(owner, desired);
        state.renderOwner = owner;
        committed = true;
        const errors = characterData ? [] : reconcile(state, desired);
        if (characterData) state.node.data = normalized.content.map(value => decode(value, state.node.ownerDocument)).join('');
        try { previous?.dispose(); } catch (error) { errors.push(error); }
        throwErrors(errors, 'Trix render cleanup failed');
    } catch (error) {
        if (committed) throw error;
        const errors = [error];
        try { owner.dispose(); } catch (cleanupError) { errors.push(cleanupError); }
        throwErrors(errors, 'Trix render failed');
    }
}

function requestRender(state) {
    if (state.owner.disposed) return;
    state.pending = true;
    if (state.rendering) return;
    state.rendering = true;
    try {
        while (state.pending && !state.owner.disposed) {
            state.pending = false;
            renderOnce(state);
        }
    } finally { state.rendering = false; }
}

function instrumentNode(node) {
    const previous = states.get(node);
    if (previous && !previous.owner.disposed) return node;
    if (!isNode(node) || ![1, 3, 8, 11].includes(node.nodeType)) {
        throw new TypeError('Trix requires an element, text node, comment or fragment');
    }
    const state = {
        node, owner: new Checkpoint(), args: [], dependencies: new Set(),
        bindings: new Map(), fragments: new WeakMap(), rendering: false,
        pending: false, cleanup: undefined, renderOwner: null
    };
    states.set(node, state);
    state.tracker = trax().fct(() => true);
    state.changed = () => requestRender(state);
    const contentOwner = new Checkpoint(state.owner);
    contentOwner.own(() => state.tracker.onChange(false).deregister());
    state.owner.own(() => releaseNode(state));
    const render = (...args) => {
        if (state.owner.disposed) throw new Error('Cannot render a disposed Trix node; instrument it again first');
        const previousArgs = state.args;
        const previousOwner = state.renderOwner;
        state.args = args;
        try { requestRender(state); }
        catch (error) {
            if (state.renderOwner === previousOwner) state.args = previousArgs;
            throw error;
        }
        return node;
    };
    render.id = ++nextId;
    render.checkpoint = state.owner;
    render.dispose = () => dispose(node);
    Object.defineProperty(render, 'cleanUp', {
        get: () => state.cleanup,
        set: value => { state.cleanup = value; }
    });
    node.trix = render;
    return node;
}

function generateTag(tag, ...args) {
    const node = tag === 'text' ? document.createTextNode('') : document.createElement(tag);
    instrumentNode(node);
    try { return node.trix(...args); }
    catch (error) {
        const errors = [error];
        try { dispose(node); } catch (cleanupError) { errors.push(cleanupError); }
        throwErrors(errors, 'Trix construction failed');
    }
}

function trix(node, index = 0) {
    if (node === undefined) return new Proxy(generateTag, {
        get: (factory, name) => typeof name === 'string' && name !== 'then' ? factory.bind(undefined, name) : undefined
    });
    if (typeof node === 'string') {
        const selector = node;
        if (!selector || !Number.isInteger(index) || index < 0) throw new TypeError('Invalid Trix insertion point');
        node = selector.startsWith('#') ? document.getElementById(selector.slice(1)) :
            selector.startsWith('.') ? document.getElementsByClassName(selector.slice(1))[index] :
            document.getElementsByTagName(selector)[index];
        if (!node) throw new Error('Trix insertion point not found: ' + selector);
    }
    return instrumentNode(node);
}

function dispose(node) {
    if (!isNode(node)) throw new TypeError('Expected a DOM node to dispose');
    const errors = [];
    disposeTree(node, errors);
    throwErrors(errors, 'Trix cleanup failed');
    return node;
}

function checkpoint(build) {
    const owner = createCheckpoint(build);
    const roots = new Set();
    function ownsView(node) {
        for (let scope = states.get(node)?.owner; scope; scope = scope.parent) {
            if (scope === owner) return true;
        }
        return [...node.childNodes].some(ownsView);
    }
    const pending = [owner.value], visited = new Set();
    while (pending.length) {
        const value = pending.pop();
        if (Array.isArray(value)) {
            if (visited.has(value)) continue;
            visited.add(value);
            pending.push(...value);
        } else if (isNode(value) && ownsView(value)) roots.add(value);
    }
    if (roots.size) {
        const group = { owner, roots };
        for (const node of roots) {
            if (!rootGroups.has(node)) rootGroups.set(node, new Set());
            rootGroups.get(node).add(group);
        }
        owner.own(() => {
            for (const node of roots) rootGroups.get(node)?.delete(group);
            roots.clear();
        });
    }
    return owner;
}

export { trix, checkpoint, onCleanup, dispose };
