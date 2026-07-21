const fs = require("fs");
const assert = require("assert");

const components = fs.readFileSync("js/components.js", "utf8");
const app = fs.readFileSync("js/app.js", "utf8");

assert(components.includes('const [sMemN, setSMemN] = useState(os.memN != null ? os.memN : 6);'), "group offline settings must expose a memory count state");
assert(components.includes('min: 0, max: 20, step: 1, onChange: setSMemN'), "group offline memory slider must allow disabling recall");
assert(components.includes('maxTokens: sMax, minWords: sMinW, memN: sMemN, bg: sBg'), "group offline settings must persist memN");
assert(app.includes('osFor("g_" + group.id).memN'), "group offline recall must read its saved memory count");
assert(app.includes('pools.some(pool => rank < pool.length)'), "group offline recall must merge member pools instead of anchoring to the first member");
assert(!app.includes('const anchor = (group.memberIds || [])[0];'), "group offline recall must not depend on first-member ordering");
assert(app.includes('let charsLeft = 2400;'), "group offline memory prompt must have a total character budget");
assert(app.includes('Math.min(360, charsLeft)'), "group offline memory prompt must cap each imported memory");

console.log("group offline memory settings tests passed");
