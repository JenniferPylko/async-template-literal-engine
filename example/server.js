const express = require("express")
const path = require("path")
const templateEngine = require("../template-engine.js")

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