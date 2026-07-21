const fs = require("fs");
const assert = require("assert");

const engine = fs.readFileSync("js/engine.js", "utf8");
assert(engine.includes('localStorage.getItem("x_groupOfflineNoCotModels")'), "group offline must remember models that return empty after explicit cot");
assert(engine.includes('/模型返回为空（停止原因：stop）/'), "fallback must only handle the narrow empty-stop case");
assert(engine.includes('system.replace(cotSystemBlock(cotT), "")'), "fallback retry must remove explicit cot instructions");
assert(engine.includes('localStorage.setItem("x_groupOfflineNoCotModels"'), "successful future calls must avoid repeatedly paying for the known-bad cot attempt");
console.log("group offline cot fallback tests passed");
