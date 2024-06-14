/********************************************************************************************************************
    TODO definition and todo state management
    
********************************************************************************************************************/

import { trax } from 'https://0x1f528.github.io/Trax/modules/trax.js';
import { ARRAYLENGTH, APPLY, FILTER } from 'https://0x1f528.github.io/Trax/modules/trex.js';

export class Todo {                                                     // this is a todo
    constructor(txt) {
        this.id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + ""; // id is a random numeric string
        this.title = trax(txt);                                         // the todo text (title)
        this.completed = trax(false).onChange(() => todos.fire());      // has this todo been completed?
    };
}

export var todos = trax([]);                                            // the list of todos wrapped in a trax instance
todos.add = (todo) => {                                                 // add the 'add(todo)'  functionality
    todos().push(todo);                                                 // append the new todo to the end of the list and ...
    todos.fire();                                                       // fire an update notification
};
todos.del = (id) => {                                                   // add the 'del(id)' functionality
    var index = todos().findIndex((todo) => { return todo.id === id; });// find the todo we want to delete
    todos().splice(index, 1);                                           // remove it and...
    todos.fire();                                                       // fire an update notification
};
todos.toggle = () => {                                                  // add the 'toggle()' functionality
    var toggle = todos().every((todo) => todo.completed());             // only if every todo is complete
    for (var todo of todos()) {
        todo.completed(!toggle);                                        // clear all todos; else set them all as complete
    }
};
todos.clear = () => {                                                   // add the 'clear()' functionality
    todos(todos().filter((todo) => !todo.completed()));                 // set the list of todos to all those that are not completed; i.e. remove all todos that are completed
};

export var todoCount = ARRAYLENGTH(todos);                              // create trax instance to count how many todos?
export var hasTodos = APPLY(todoCount, (c) => c > 0);                   // create trax instance that knows if at least one todo
export var completedTodos = FILTER(todos, todo => todo.completed() );   // create trax instance to capture only completed todos
export var completedTodoCount = ARRAYLENGTH(completedTodos);            // create trax instance to count how many completed todos?
export var hasCompletedTodos = APPLY(completedTodoCount, (c) => c > 0); // create trax instance that knows if at least one completed todo

export var incompleteTodoCount = trax(todoCount, completedTodoCount).fct(
    (todoCnt, completedCnt) => todoCnt - completedCnt                   // trax instance that does the math to count the incomplete todos
);
