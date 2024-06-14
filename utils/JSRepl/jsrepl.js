import { trax, Trax } from 'https://0x1f528.github.io/Trax/modules/trax.js'
import { TOGGLE } from 'https://0x1f528.github.io/Trax/modules/trex.js'
import { trix } from 'https://0x1f528.github.io/Trix/modules/trix.js'

import CodeFlask from './codeflask/build/codeflask.module.js';

const {HEADER, SPAN, CODE, SAMP, IFRAME, DIV} = trix();
Trax.onChange(Trax.MODE.ASYNC);


/*
    Pass a DOM element (article in this example) with <header> and <code><pre> nodes.
    The <example> node will be the actual example code; the code before and after will be handled as context

    <article class="code-example">
        <header>Creating a <mark>Trax</mark> node</header>
        <code><pre>
            import { trax } from './trax.js'
            <example>
                var node = trax();
            </example>
        </pre></code>
    </article>
*/


let extractText = (node) => {
    let extracted = [];
    node.childNodes.forEach( (child) => {
        switch (child.nodeType) {
            case Node.TEXT_NODE:
                let lines = child.textContent.split(/\r?\n/);
                lines.pop(); // get rid of last empty line
                let contentLines = lines.filter( (l) => (!l.match(/^\s*$/)));
                let prefix = contentLines[0]?.match(/^\s*/)[0];
                lines = lines.map( (l) => l.replace(prefix, ''));
                lines = lines.map( (l) => l.replace(/^\s*$/, ''));
                extracted.push(lines.join('\n')+'\n');
                break;
            case Node.ELEMENT_NODE:
                extracted.push(...extractText(child));
                break;
        }
    });
    return extracted;
}

let updateCode = (node, flask, code) => {
    node.style.height = (1.4*(((code).match(/\n/g) || []).length + 3))+'em';
    flask.updateCode(code);    
}

let createRepl = (example) => {
    // pull the example data from the DOM
    let title = example.getElementsByTagName('header')[0];
    let defaultCode = example.getElementsByTagName('code')[0];
    let [preContext, exampleCode, postContext] = extractText(defaultCode);

    let displayContext = TOGGLE(true);
    let contextSwitch = trax(displayContext).fct( (c) => (c) ? "context-off" : "context-on");
    let executeCode = trax(false);
    trix(example).trix(
        HEADER(
            SPAN(
                {  
                    class:contextSwitch, 
                    onclick:displayContext,
                    title: 'Show/hide the full code context'
                }, 
                DIV(DIV())
            ),
            title,
            SPAN('&#9654;', { onclick: () => executeCode(true), title: 'Run the code (or CTRL-S in code window)' })
        ),
        (() => {
            let codeNode = CODE();
            codeNode.addEventListener('keydown', e => {
                if (e.ctrlKey && e.key === 's') {
                  // Prevent the Save dialog from opening
                  e.preventDefault();
                  executeCode(true);
                }
                if(e.key === "Escape") {
                    executeCode(false);
                }
              });

            let flask = new CodeFlask(codeNode, { language: 'js' });

            let displayText = trax(displayContext).fct( (d) => {
                updateCode(codeNode, flask, 
                (d) ? preContext+'\n/*------------ Start Example ------------*/\n\n'+exampleCode+'\n/*------------- END Example -------------*/\n\n'+postContext : exampleCode)
            }).onChange(true);
        
            let code = trax(displayContext, preContext, flask, postContext, executeCode)
                .fct( (dc, pre, flask, post, e) => { 
                    return (dc) ? flask.getCode() : pre+'\n'+flask.getCode()+'\n'+post;
                })
            let runner = trax(executeCode, code)
                .fct( (e, c) => {
                    if (e) {
                        let iframe = IFRAME( );
                        iframe.onload = function() { 
                            let contentDoc = iframe.contentWindow.document;
                            let htmlCode='<html><head><link rel="stylesheet" href="https://0x1f528.github.io/Trix/utils/JSRepl/example.css"/></head><body><app></app></body><html>';
                            let text=htmlCode+"<script type='module'>"+c+"</script>";
                            contentDoc.open();
                            contentDoc.write(text);
                            contentDoc.close();
                        };
                        return [SPAN('&#9949;', { onclick: () => executeCode(false), title: 'Close (or ESC in code window)' }),iframe];
                    } else {
                        return null;
                    }
                });

            return [codeNode,SAMP(runner)];
        })(),
    );
}

export  { createRepl }

