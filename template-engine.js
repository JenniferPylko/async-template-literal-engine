const fs = require("fs/promises")
const path = require("path")
const vm = require("vm")

const Mutex = require("event-loop-mutex")

let context_index = 0

module.exports = (params = {}) => {
    const log = params.logger ?? (() => void 0)
    const extension = params.extension ?? "template"
    const views = params.views ?? path.dirname(require.main.path)
    const always_inject = params.inject ?? {}
    const timeout = params.timeout ?? 10000
    const file_cache = {}

    const load_template = async (filepath) => {
        const unlock = await new Mutex(filepath).lock()
        try {
            const {mtime} = await fs.stat(filepath)
            const new_template = typeof file_cache[filepath] === "undefined"
            if (new_template || mtime.valueOf() !== file_cache[filepath].mtime.valueOf()) {
                const content = (await fs.readFile(filepath)).toString()
                delete file_cache[filepath]
                file_cache[filepath] = {
                    mtime,
                    script: new vm.Script(
                        `const export_var = (key, val) => {__exports[key] = val; return ""}
                        async () => \`
                        ${content}
                        \``, {
                            filename:   filepath,
                            lineOffset: -2
                        })
                }
                log(`${new_template ? "Loaded" : "Reloaded"} template ${filepath}`)
            }
        } finally {
            unlock()
        }
    }

    if (Array.isArray(params.preload)) {
        for (const filename of params.preload) {
            const filepath = path.resolve(views, filename.endsWith(extension) ? filename : `${filename}.${extension}`)
            load_template(filepath)
        }
    }

    const include = async (filename, options = {}, callback = null) => {
        try {
            const settings = typeof options.settings === "undefined" ? {extension, views} : {extension: options.settings["view engine"], views: options.settings.views}
            const filepath = path.resolve(settings.views, filename.endsWith(settings.extension) ? filename : `${filename}.${settings.extension}`)
            const locals = {}
            const context = {
                ...always_inject, ...options,
                include: (include_filename, include_options = {}) =>
                    include(include_filename, {...options, ...include_options}),
                set: (key, val) => {
                    locals[key] = val
                    return ""
                },
                get:         (key) => locals[key],
                import_vars: async (template) => {
                    const __exports = {}
                    await include(template, {...options, __exports})
                    return __exports
                },
                log,
                __template: path.basename(filepath, `.${settings.extension}`),
                __filename: filepath,
                __dirname:  path.dirname(filepath)
            }
            await load_template(filepath)
            const result = await new Promise((resolve, reject) => {
                setTimeout(() => reject(new Error(`Rendering ${filepath} timed out`)), timeout)
                file_cache[filepath].script.runInNewContext(context, {
                    timeout,
                    contextName:           `Template Renderer ${filename} ${++context_index}`,
                    contextCodeGeneration: {
                        strings: false,
                        wasm:    false
                    }
                }).call().then(resolve).catch(reject)
            })
            if (callback !== null) {
                return callback(null, result)
            }
            return result
        } catch (error) {
            error.stack = error.stack.split("\n").filter(
                (line, index) => index === 0 ||
                (!line.toLowerCase().includes(path.basename(__filename))
                && !line.includes("Script.runInContext")
                && !line.includes("Script.runInNewContext"))
            ).join("\n")
            if (callback !== null) {
                return callback(error)
            }
            throw error
        }
    }
    return include
}