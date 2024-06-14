import { trax, Trax } from 'https://0x1f528.github.io/Trax/modules/trax.js'
import { diffMapper } from 'https://0x1f528.github.io/Trax/modules/trux.js'
import { trix } from 'https://0x1f528.github.io/Trix/modules/trix.js'

const {DIV,BUTTON,SECTION,ARTICLE,LEGEND,INPUT,LABEL,HR,OPTION,SELECT} = trix();
Trax.onChange(Trax.MODE.ASYNC);

let lengthTable = new Map([['in',25.4],['ft',304.8],['mi',1609344],['hr',null],['mm',1],['cm',10],['dm',100],['m',1000],['km',1000000]]);
let volumeTable = new Map([['tsp',4.92892],['tbsp',14.7868],['oz',29.5735],['cup',240],['oz',29.5735],['cup',240],['pint',473.176],['quart',946.353],['gal',3785.41],['hr',null],['ml',1],['cl',10],['dl',100],['liter',1000],['m3',1000000]]);
let weightTable = new Map([['oz',28349.5],['lb',453592],['stone',6350000],['US ton',907142857.185642],['Imperial ton',1016000000.047919035],['hr',null],['mg',1],['g',1000],['kg',1000000],['Tonne',1000000000]]);

let asNumericString = (x) => {                                          // reformat the input string as a valid number removing anything else
    return x
        .replace(/[^\d\.\,\-]/g, '')                                    // filter out any non-digit characters
        .replace(/([\.\,]\d{0,5})[\d\.\,]*/g, '$1')                     // get rid of second periods and limit to 5 positions after the period
        .replace(/(.)\-/g, '$1')                                        // remove minus if not at first position
        .replace(/^(\-?)0(\d)/g, '$1$2')                                // remove leading zeros
        .replace(/^(\-?)[\.\,]/g, '$10.')                               // swap leading period with 0.
}
let asFloat = (x) => {                                                  // string as float with zero if not considered a valid number
    let res = Number.parseFloat(x.replace(/\,/,'.'));
    return (isNaN(res)) ? 0 : res;
}
let roundTo = (num, precision) => {                                     // rounding function with precision
    const factor = Math.pow(10, precision)
    return (Math.round(num * factor) / factor).toString();
}

let base = trax(1000);                                                  // this is the number (in mm, ml, or mg) that will be converted to the requested measure)

let CONVERTOR = (base, dimensions) => {                                 // this is a single conversion line (measure + unit); dimensions is a table of valid units
    let unit = trax(1000);                                              // selecting initial unit
    let val = trax(base, unit).fct( (x,y) => roundTo(x / y, 5) );       // take the value from base and convert to unit requested
    let inp = trax( val() ).fct( (x) => asNumericString(x))             // strip any illegal characters from the input
                    .onChange( (v) => base(asFloat(v) * unit()) );      // update the base with the input value

    let diff = trax(inp,val,diffMapper()).fct( (i,v,d) => d([i,v]) );   // which has changed? the input or the base value?

    let valDisplay = trax(inp, val, diff).fct( (i,v,d) => {             // this is what will actually be displayed in the input (measure) field
            let index = d.findIndex( x => x );                          // find the change (x is true)
            return (index === 0) ? i : v;                               // priority goes to any input changes; otherwise return the base value
        }
    );

    let options = [];                                                   // these are the options that will be displayed in the select drop down box
    for (var [name, ratio] of dimensions) {
        options.push( (name === 'hr') ? 
            HR() : OPTION(name,{value:ratio}) );                        // HR or actual OPTION; the value of the option is the ratio to apply to the base
    }

    return DIV(
        INPUT(                                                          // measure
            {
                oninput:inp,                                            // separate input vs ...
                value:valDisplay,                                       // output so that we can clean up the numeric input
                cleanup:() => {                                         // cleanup function will be called by trix when the dom node goes out of scope
                    valDisplay.prune();                                 // unhook the valDisplay from base so that they can be garbage collected
                    inp.prune();                                        // unhook the inp from base so that they can be garbage collected
                }
            }),
        SELECT(options,                                                 // unit options
            {
                io:unit,                                                // it important to set the io:unit value AFTER creating the options!
                name:'convertor',
                cleanup:() => {                                         // cleanup function will be called by trix when the dom node goes out of scope
                    unit.prune();                                       // unhook the unit from base so that they can be garbage collected
                }
            }
        )
    )
}

let CONVERSIONS = (base, dimensions) => {                               // conversion section
    let convertors = trax([                                             // start with two convertors
        CONVERTOR(base, dimensions),
        CONVERTOR(base, dimensions)
    ]);
    convertors.min = trax(convertors).fct( (c) => c.length <= 2 );      // can we still remove converters
    convertors.inc = () => {                                            // but can add as many as you want
        convertors().push(CONVERTOR(base, dimensions));                 // add a new convertor
        convertors.fire();                                              // explicitly refresh because trax handles changes to its list of dependencies, but not changes to the underlying objects
    }
    convertors.dec = () => {                                            // or remove them 
        if (convertors.min()) return;                                   // (unless we've reached the minimum number of converters to display)
        convertors().pop();                                             // get rid of the bottom convertor
        convertors.fire();                                              // explicitly refresh because trax handles changes to its list of dependencies, but not changes to the underlying objects
    }
    return [                                                            // array of DOM elements
        convertors,
        BUTTON('+', { onclick:convertors.inc }),                        // add convertor
        BUTTON('-', { onclick:convertors.dec, disabled:convertors.min}) // remove convertor
    ]
    
}
  
let ACCORDION = (label, id, selected, content) => SECTION(              // create an accordion entry; radio button determines if the content section is displayed or not
    {class:'accordion'},
    [                                                                   // the actual accordion DOM elements
        INPUT({type:'radio',name:'convertor',id:id,value:id, checked:selected}, label),
        LABEL({for:id}, label),
        ARTICLE({class:'panel'}, content)
    ]
)

trix(document.getElementById('unit-conversion')).trix(                  // attach to unit-conversion
    LEGEND('Unit conversion utility written in TRIX and TRAX'),         // list of dom elements that get injected
    //         label     id  open?  content
    ACCORDION('Length', 'l', true,  CONVERSIONS(base, lengthTable)),    // length conversions
    ACCORDION('Volume', 'v', false, CONVERSIONS(base, volumeTable)),    // volume conversions
    ACCORDION('Weight', 'w', false, CONVERSIONS(base, weightTable))     // weight conversions
);
