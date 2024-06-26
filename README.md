# Trix

Trix is a minimal yet powerful javascript _only_ UI framework.

## Features
- **Javascript Only**: No JSX, no HTML templates. Use the full power of a turing complete language.

- **Reactive**: Integrates with the companion reactive framework [Trax](https://github.com/0x1F528/Trax) to provide full reactivity of all DOM elements and attributes.

- **Minimal complexity**: with only 3 APIs (all called trix) you have complete control over the DOM and events.

- **Selectively applicable**: Add trix capabilities to a single node (similar to a Single Page App), or selectively add it to only those DOM nodes that require reactivity.

## Usage

```javascript
// Example usage of Trix
import { trix } from 'https://0x1f528.github.io/Trix/modules/trix.js'

// Get selected DOM element generators
const {H1, P, DIV, SPAN} = trix();

// Add trix capabilities to a DOM node (a tag called <app>, in this case)
const appNode = document.getElementsByTagName('app')[0];
trix(appNode);  // this adds a trix method to the DOM element

// Set/add children to this DOM element
appNode.trix(
    H1('This is an application'),
    P('This application is being generated by Trix.'),
    DIV('I am inside a ', 
        EM('pink'), 
        ' div', 
        { style: 'background-color:pink'}
    )
);

// Programmatically change the list of child nodes
appNode.trix(
    H1('This is an application'),
    P('This text has changed and the div is now gone')
);

// Any of the DOM elements and attributes can be made reactive using the companion Trax framework
import { trax } from 'https://0x1f528.github.io/Trax/modules/trax.js'

let text = trax('First, a few words');  // create an initialized trax instance

appNode.trix(
    H1('This is an application'),
    P(text)                             // use the trax instance as content
);

setTimeout(
    () => text('now something else'),   // update the trax content
    2000
)

// The paragraph text will automatically update to the new text after 2 seconds

// Several complete demo applications are under the examples directory.

```

## Documentation

The complete documentation can be found under https://0x1f528.github.io/Trix/index.html

