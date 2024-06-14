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

import { trax, Trax } from 'https://0x1f528.github.io/Trax/modules/trax.js'

let configProps = (node, props) => {                                    // pull attributes from an object and apply to the parent node
    //area, base, br, col, embed, hr, img, input, link, meta, source, track, wbr cannot have child nodes
    const attrMap = {                                                   // translations for convenience attributes
        "io" : { in: "value", out: "oninput"},
        "checkbox" : { in: "checked", out: "onchange"},
        "for" : { in: "htmlFor" }
    }
    let setAttribute = (attr) => {                                      // return method to detect attribute vs. property and set it (bit of a hack, but seems to work)
        return (val) => {
            if (node[attr] != undefined) {                              // test to see if attribute or property
                node[attr] = (val == null) ? '' : val;                  // set as property
            } else {
                node.setAttribute(attr, val);                           // set as attribute
            }
        }
    };
    for (const attribute in props) {                                    // for each object property
        let inAttr = (attrMap[attribute]) ? attrMap[attribute].in : (!attribute.startsWith('on')) ? attribute : undefined;  // get input attributes from convenience mapping or NOT starting with 'on'
        let outAttr = (attrMap[attribute]) ? attrMap[attribute].out : (attribute.startsWith('on')) ? attribute : undefined; // get output attributes from convenience mapping or starting with 'on'

        if (attribute === 'cleanup') {                                  // special handling for cleanup attribute
            node.trix.cleanUp = props[attribute];                       // add cleanup function to node; this will be called when the node is disposed of
            continue; // --> 
        }

        let arg = props[attribute];
        if (typeof arg === 'function') {                                // arg is trax or at least a function
            if (inAttr) {                                               // add the input attribute
                if (Trax.isTrax(arg)) {                              // if is a trax node, ...
                    let key = node.trix.id + "-" + inAttr;              // create a key to recognize this trax attribute
                    arg._subs.forEach( (sub) => {                       // see if this (trax) attribute has already been added by looping through the subscribers
                        if (sub.id() === key) 
                            key = undefined;                            // undefined to flag that the key already exists
                    });
                    if (key) {
                        let activatedArg = trax(arg).id(key);           // wrap the trax attribute with another trax instance
                        activatedArg.onChange(setAttribute(inAttr));    // so that we can detect changes and update the attribute auto-magically
                        node.trix.deps.push(activatedArg);
                    }
                }
                setAttribute(inAttr)(arg());                            // set the attribute
            } 
            if (outAttr) {                                              // add the output attribute
                node[outAttr] = (val) => {                              // output attributes are handled by attaching a function to the dom that will fire on event
                    switch(attribute) {                                 // different behaviors depending on attribute
                        case 'onkeyup':
                        case 'onkeydown':
                            arg(val.key);                               // set the val.key
                            break;
                        case 'checkbox':
                            arg(val.target.checked)                     // set the val.target.checked
                            break;
                        case 'onclick':
                            (Trax.isTrax(arg)) ? arg.fire() : arg(true);// fire the event
                            break;
                        default:
                            arg(val.target.value);                      // set the val.target.value
                    }
                };
            }
        } else {                                                        // else is a literal attribute value
            setAttribute(inAttr || outAttr)(arg);                       // set it
        }
    }
}

let getRawArg = (arg) => {                                              // evaluate trax nodes to get their underlying value
    if (typeof arg === 'function') {
        return getRawArg(arg());                                        //recursion
    } 
    return arg;
} 

let normalizeArgs = (args) => {                                         // evaluate trax nodes in args array and flatten to single array
    return args.reduce( (acc, arg) => {
        let rawArg = getRawArg(arg);
        if (Array.isArray(rawArg)) 
            acc.push(...normalizeArgs(rawArg));                         // recursion
        else if (rawArg != null)                                        // skip undefined or null
            acc.push(rawArg)
        return acc;
    }, []);
}

let nodesAreEqual = (src,dst) => {                                      // consider nodes equal if same dom element or same text content
    return (src === dst) || (typeof src === 'string' && dst.nodeType == Node.TEXT_NODE && src === dst.textContent);
}

let deregister = (nodes) => {                                           // cleanup: deregister list of nodes
    for (const node of nodes) {
        if (typeof node === 'string' || node.nodeType == Node.TEXT_NODE || node.nodeType == Node.COMMENT_NODE || !node.trix) continue;
        deregister(node.children);                                      // recursive: deregister child nodes
        for (const traxInstance of node.trix.deps) {
            traxInstance.deregister();                                  // deregister any trax nodes created for this trix node
        }
        if (typeof node.trix?.cleanUp === 'function') node.trix?.cleanUp();   // call the cleanUp function if one has been provided
    }
}

function decodeHtml(html) {                                             // from https://stackoverflow.com/a/7394787
    var txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
}

let mergeOntoNode = (node, args) => {                                   // new list of child nodes; let's do a merge and keep what we can; reshuffling might be required 
    var srcNodes = normalizeArgs(args);                                 // this is the new list of children we want to inject into the dom
    var destNodes = [...node.childNodes];                               // these is the current list of child nodes
    node.replaceChildren();                                             // empty the parent node
    for (var s = 0; s < srcNodes.length; s++) {                         // add the new child nodes
        if (Object.getPrototypeOf(srcNodes[s]) === Object.prototype) {  // oh, this is not actually a dom node :-)
            configProps(node, srcNodes[s]);                             // but in fact attributes to apply to the parent node; let's do that
            continue;
        }    
        for (var d = 0; d < destNodes.length; d++) {
            if (nodesAreEqual(srcNodes[s], destNodes[d])) {             // do we already have this child node?
                node.appendChild(destNodes[d]);                         // then let's use it instead of using a new node
                destNodes.splice( d, 1 );                               // remove from list
                d = -1;                                                 // flag that element found
                break;                                                  // we're done with this element; break out of this inner loop
            }
        }
        if (d >= 0) {                                                   // not in destination array
            let nodeVal = (srcNodes[s] instanceof Element) ? srcNodes[s] : document.createTextNode(decodeHtml(String(srcNodes[s]))); // create text node if child argument is string
            node.appendChild(nodeVal);                                  // append new child node
        }
    }
    deregister(destNodes);                                              // clean up any remaining nodes
}

let generateTag = (tag, ...args) => {                                   // generate a new dom element
    if (typeof tag === 'string') {
        // is tag
        var newNode;
        if (tag === 'text') {
            newNode = document.createTextNode('')                       // text element
        } else {
            newNode = document.createElement(tag)                       // dom element
        }
        return trix(newNode).trix(...args);                             // make this element trix enabled; this way we can simply provide a list of child nodes for them to be injected
    } 
}

let instrumentNode = (node) => {                                        // add the trix() function to this dom element
    var track = trax()                                                  // trax node to capture the list of args passed to this trix() function
        .fct( (...a) => a.slice(0,a.length-2) )                         // remove value and 'this' from the trax arguments and capture the child nodes as an array
        .onChange( (args) => mergeOntoNode(node, args) );               // whenever the list of trix arguments changes we will refresh the child nodes
    node['trix'] = (...args) => {                                       // the args are the child nodes for the instrumented node
        track(...args.flat(Infinity) );                                 // flatten nested arrays to single array of child nodes
        return node;
    }
    node['trix'].id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER); // unique trix id
    node['trix'].deps = [];
    return node;
}

let trix = (node) => {                                                  // main entry point
    if (node === undefined) {                                           // either generate a new DOM element by tag
        return new Proxy(generateTag, {get: (tag, name) => tag.bind(undefined, name)});
    } else {
        return instrumentNode(node);                                    // or use this node as the insertion point
    }
}


export  { trix }

