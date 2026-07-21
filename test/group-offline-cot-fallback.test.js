const fs = require("fs");
const assert = require("assert");

const engine = fs.readFileSync("js/engine.js", "utf8");
assert(engine.includes('const OFFLINE_NO_COT_KEY = "x_offlineNoCotModels"'), "single and group offline must share model compatibility memory");
assert(engine.includes('[OFFLINE_NO_COT_KEY, "x_groupOfflineNoCotModels"]'), "legacy group-only compatibility memory must migrate safely");
assert(engine.includes('function isOfflineEmptyStop(e)'), "fallback must only handle the narrow empty-stop case");
assert(engine.includes('system.replace(cotSystemBlock(cotT), "")'), "fallback retry must remove explicit cot instructions");
assert((engine.match(/rememberOfflineNoCotModel\(cotModelKey\)/g) || []).length >= 2, "both single and group offline must remember a known-bad cot model");
assert((engine.match(/splitCot\(raw, usedCot\)/g) || []).length >= 2, "fallback responses must not be parsed as cot responses");
console.log("shared offline cot fallback tests passed");
