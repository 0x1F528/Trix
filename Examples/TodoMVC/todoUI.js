/********************************************************************************************************************
    TODO application UI

********************************************************************************************************************/


import { trax, Trax } from 'https://0x1f528.github.io/Trax/modules/trax.js'
import { IF, NOT, APPLY, CHOOSE, FILTER } from 'https://0x1f528.github.io/Trax/modules/trex.js';
import { pipe, when, reconcileArrays } from 'https://0x1f528.github.io/Trax/modules/trux.js';
import {trix} from 'https://0x1f528.github.io/Trix/modules/trix.js'
import { todos, Todo, hasTodos, incompleteTodoCount, hasCompletedTodos } from './todos.js';

const { MAIN,H1,DIV,BUTTON,INPUT,LABEL,SPAN,HEADER,FOOTER,A,UL,LI,STRONG } = trix();
Trax.onChange(Trax.MODE.SYNC);


var urlHash = trax('');                                                 // represents the hash fragment of the URL
window.onhashchange = () => urlHash( document.location.hash.replace(/^#\//, "") );


var filteredTodos = FILTER(                                             // filter the...
    todos,                                                              // todos
    CHOOSE(                                                             // chose the filter function to apply based on...
        urlHash,                                                        // key
        {
            active: (todo) => !todo.completed(),                        // select active todo filter function
            complete: (todo) => todo.completed(),                       // select complete todo filter function
        },
        (todo) => true                                                  // otherwise don't filter out any todos
    )
);


var todoListItemsFromTodos = listItemCreator => (todos, todoLIs) => {   // create todoLIs for all the todos in the list
    return reconcileArrays(todos, todoLIs = [], (a,b) => a.id === b.id, listItemCreator);
}


trix(document.getElementById('todoapp')).trix(                          // find the todoapp node, instrument with trix and pass in children
    HEADER(
        H1('todos'),
        INPUT((() => {                                                          // create iife function to close around variables
                var newTodoTxt = trax('');
                var acceptNewTodo = () => todos.add( new Todo(newTodoTxt()) );  // fct to add a new todo
                var clearNewTodoTxt = () => newTodoTxt('');                     // fct to clear the new todo input field
                return {                                                        // these is the INPUT configuration
                    io: newTodoTxt, 
                    onkeyup: pipe(
                        when("Enter", pipe(acceptNewTodo, clearNewTodoTxt) ),   // when "Enter", accept new todo and then clear the new todo input field
                        when("Escape", clearNewTodoTxt )                        // when "Escape", clear the new todo input field
                    ),
                    type: 'text', 
                    class: 'new-todo', 
                    placeholder: "What needs to be done?", 
                    autofocus: true,
                    onfocus: (target) => target.focus({preventScroll:true})     // focus, but don't scroll
                }
            })()                                                                // and evaluate 
        )
    ),
    MAIN(
        { class:"main" },
        IF (hasTodos, [
            INPUT(
                {
                    id:'toggle-all', 
                    class:'toggle-all',
                    type:'checkbox',
                    onclick:() => todos.toggle()
                }
            ),
            LABEL(
                { for:'toggle-all' }, 
                'Mark all as complete'
            )
        ]),
        UL(
            { class:'todo-list' }, 
            trax(filteredTodos).fct(                                            // a bit of a hack here! using first 2 params of fct: the todos AND the current todoLIs value
                todoListItemsFromTodos(                                         // this function will make sure we have todo LIs for each of the filteredTodos
                    (todo) => {                                                 // this listItemCreator function defines how we want the todo LI to look
                        var editing = trax(false);
                        var liClass = trax(todo.completed, editing).fct( (x,y) =>  (x?'completed':'') + '' + (y?'editing':'')); 
                        var thisTodo = trax(todo.title);
                        var li;
                        return li = LI(
                        { 
                            class: liClass,
                            ondblclick:() => { editing(true);  li.querySelector('input.edit').focus()},
                            id: todo.id 
                        },
                        DIV(
                            { class:'view' },
                            INPUT(
                                {
                                    class:'toggle',
                                    type:'checkbox', 
                                    checkbox: todo.completed
                                }
                            ),
                            LABEL(todo.title),
                            BUTTON(
                                {
                                    class:'destroy',
                                    onclick:() => todos.del(todo.id)
                                }
                            )
                        ),
                        INPUT(
                            (() => {                                            // create iife function to close around variables
                                var acceptInput = () => { editing(false); todo.title(thisTodo()); };
                                var revertInput = () => { editing(false); thisTodo(todo.title); };
                                return {
                                    class: 'edit',
                                    onkeyup: pipe(
                                        when("Enter", acceptInput ),
                                        when("Escape", revertInput )
                                    ),
                                    onblur: revertInput,
                                    io: thisTodo
                                }
                            })()
                        )
                    )}
                )
            )
        )
    ),
    FOOTER(
        { class:IF( hasTodos, 'footer', '' ) },
        IF(hasTodos, 
            [
                SPAN(
                    { class: 'todo-count' },
                    STRONG(incompleteTodoCount),
                    IF(APPLY(incompleteTodoCount, (cnt) => cnt === 1), " item left", " items left")
                ),
                UL(
                    (() => {
                        var selectOn = (hash) => {
                            return {
                                class: trax(urlHash).fct( h => h === hash ? 'selected' : 'blank' ),
                                href:"#/"+hash
                            }
                        }
                        return [
                            { class: 'filters' },
                            LI( A(selectOn(''), "All") ),
                            LI( A(selectOn('active'), "Active") ),
                            LI( A(selectOn('complete'), "Completed") )
                        ]
                    })()
                ),
                BUTTON(
                    {
                        class: 'clear-completed', 
                        hidden: NOT(hasCompletedTodos), 
                        onclick: () => todos.clear()
                    },
                    "Clear completed"
                )
            ]
        )
    )
);







