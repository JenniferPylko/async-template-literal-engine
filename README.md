# async-template-literal-engine

This module is an express-compatible template engine built on top of ES6's native template literals. I created it due to some security concerns I had with the `template-literal` module, and ended up implementing several additional features. Template files are automatically cached when loaded, and are reloaded if the file's last modified time is changed.


NOTE: While this module does execute each template in its own V8 context and restricts access to many variables normally available in Node, it is *not* meant to run untrusted code. See https://nodejs.org/api/vm.html#vm-executing-javascript for more information.

## Examples

### Views

views/html.template
```js
<!DOCTYPE html>
<html>
    <head>
        <title>async-template-literal example ${pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {margin: 20px;background: #e6e6ef;}
        </style>
        ${typeof head !== "undefined" ? head : ""}
    </head>
    <body>
        ${typeof body !== "undefined" ? body : ""}
    </body>
</html>
```

views/strings_english.template
```js
${export_var("part1", "Hello, ")}
${export_var("part2", "!")}
```

views/hello.template
```js
${set("strings", await import_vars(`strings_${lang}`))}
${await include("html", {
    pageTitle: "Hello",
    body: `${get("strings")["part1"]}${fname}${get("strings")["part2"]}`
})}
${log(`Here are the values of __template, __filename, and __dirname, respectively: ${__template}, ${__filename}, ${__dirname}`)}
```

views/error.template
```js
Let's throw an error!
${(() => {
    throw new Error("whoops :/")
})()}
```

### JavaScript

server.js
```js
const express = require("express")
const path = require("path")
const templateEngine = require("async-template-literal-engine")

const template = templateEngine({
    logger: (...args) => console.log(...args) ?? "",
    inject: {
        lang: "english"
    }
})

const app = express()

app.engine("template", template)
app.set("views", path.join(__dirname, "views"))
app.set("view engine", "template")

app.get("/", (req, res) => {
    res.render("hello", {
        fname: "Jennifer"
    })
})

app.get("/error", (req, res) => {
    res.render("error")
})

app.listen(3000)
```

Visiting `localhost:3000` should display a mostly blank html page with just the text "Hello, Jennifer!" visible and log some information to the console. Visiting `localhost:3000/error` should display an error trace in the browser and the console. Note that this is due to the error being correctly passed off to express, so you will likely want to use express' built in error handling features to prevent traces from being displayed in production. The error trace should look something like this:

```
Error: whoops :/
    at /srv/async-template-literal-engine/example/views/error.template:3:11
    at /srv/async-template-literal-engine/example/views/error.template:4:3
    at new Promise (<anonymous>)
```

## Initialization

The module exports a single function which can be used to set up an instance of the template engine. This function takes a parameters object and returns a renderer function.

### Parameters
```js
{
    logger, //logging function that takes a string, default no-op
    extension, //the file extension for template files, default "template"
    views, //the directory to look for template files, default is the location of the require.main module
    inject, //object containing key-value pairs that will be globally available as variables to every template rendered by this instance, default {}
    timeout, //timeout in milliseconds for template rendering, default 10000
    preload //array of template names to load during initialization
}
```

### Renderer

The returned renderer function takes 3 parameters: the express-compatible `(path, options, callback)`. If `callback` is omitted the function will return a promises that either resolves with the rendered output or rejects with a rendering error. When called with express' `res.render()` `options.settings["view engine"]` will be used for the file extension and `options.settings.views` will be used for the location of template files, if they are set.

## Template Globals

The following are available as globals in each template. Keep in mind that top-level `await` is available and in fact necessary to effectively use `include()` or `import_vars()`.

### `async include(template, options)` -> string
Renders the specified template with entries in `options` available as global variables.

### `set(key, value)` -> ""
Sets a variable for the current template file that can later be retrieved with `get()`. Returns an empty string so that it can be used anywhere in a template file without adding unwanted output.

### `get(key)` -> any
Retrieves a variable previously stored with `set()`.

### `export_var(key, value)` -> ""
Sets a variable that can be retrieved by another template with `import_vars()`. Returns an empty string so that it can be used anywhere in a template file without adding unwanted output.

### `async import_vars(template)` -> object
Retrieves all exported variables from the specified template and returns them as an object of key-value pairs.

### `log(...args)` -> any
This is the `logger` parameter specified during initialization of the template engine.

### __template
The name of the template being rendered.

### __filename
The full file path of the template being rendered.

### __dirname
The full path to the directory in which the template being rendered is located.

## Notes

* Top-level `await` is available in templates, and it's necessary for effective use of `include()` or `import_vars()`.
* Every template is executed in its own V8 context, even templates included in other templates. Because of this they will not pollute each other's globals.
* Even though every template is executed in its own context, the templates are still being directly executed by V8 so untrusted code should *not* be present in templates.
* Thanks to Node's vm.Script functionality any template errors, including syntax errors, are handled transparently and returned to the renderer's callback if specified, otherwise they are thrown. Template files will be referenced in error traces as any JavaScript file would.

## Differences compared to `template-literal`/`express-tl`

* Templates are executed in their own V8 context, rather than with new Function(), in order to provide additional sandboxing.
* Variables passed to the render function as entries in the `options` object appear as globals to the template, rather than as members of a single global variable (`d` in `template-literal`)
* Templates are re-loaded if they are changed in the filesystem. This module and `express-tl` both automatically cache templates.
* Top-level await is available in template files.
* Error traces reference template files exactly like any other JavaScript file.
* Additional features are present as globals (see the Template Globals section above).
* `express-tl` is *probably* higher performance, but I haven't tested the 2 to compare.
* If the size of your application is a concern, `express-tl` is *definitely* smaller.

## Compatibility

This module requires the following features:

* `Promise`
* `async`/`await`
* `const`
* CommonJS `module.exports`
* null-coalescing (`??`)
* template literals
* arrow functions

and the following modules:

* `fs/promises` (builtin)
* `path` (builtin)
* `vm` (builtin)
* `event-loop-mutex`