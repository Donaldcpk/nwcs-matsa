import fs from "fs";
import vm from "vm";
import assert from "assert";

const code = fs.readFileSync(new URL("../js/plugins/KidTowerGuide.js", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(code, sandbox);
const { kidGuideStep, kidGuideDoorAllowed, kidGuideArrowPlacement } = sandbox.module.exports;

const lobby = {
    mapId: 18,
    goldX: 9,
    goldY: 13,
    crownX: 11,
    crownY: 6,
    px: 11,
    py: 23,
    floor: 0
};

const bothClosed = kidGuideStep({ ...lobby, goldOpen: false, crownOpen: false });
assert.strictEqual(bothClosed.eventId, 26);
assert.strictEqual(bothClosed.lines[0], "走到寶箱，拿獎勵");

const nearCrown = kidGuideStep({ ...lobby, px: 11, py: 7, goldOpen: false, crownOpen: false });
assert.strictEqual(nearCrown.eventId, 17);

const crownLeft = kidGuideStep({ ...lobby, goldOpen: true, crownOpen: false });
assert.strictEqual(crownLeft.eventId, 17);
assert.strictEqual(crownLeft.lines[0], "還有一個寶箱，走過去拿");

const door = kidGuideStep({ ...lobby, goldOpen: true, crownOpen: true, enteredTower: false });
assert.strictEqual(door.eventId, 25);
assert.strictEqual(door.lines[0], "走到右邊的門");

const back = kidGuideStep({ ...lobby, goldOpen: true, crownOpen: true, enteredTower: true });
assert.strictEqual(back.eventId, 25);
assert.strictEqual(back.lines[0], "回去打機械人");
assert.ok(!back.lines[0].includes("右邊的門"));

const floor3 = kidGuideStep({ mapId: 65, floor: 3, goldOpen: true, crownOpen: true, px: 0, py: 0 });
assert.strictEqual(floor3.eventId, 25);
assert.ok(floor3.lines[0].includes("打這隻機械人"));
assert.ok(floor3.lines[0].includes("自己去下一層"));
assert.strictEqual(floor3.lines[1], "第 3 層 / 100");

const floor0 = kidGuideStep({ mapId: 65, floor: 0, goldOpen: true, crownOpen: true, px: 0, py: 0 });
assert.strictEqual(floor0.lines[1], "第 1 層 / 100");

const done = kidGuideStep({ mapId: 65, floor: 101, goldOpen: true, crownOpen: true, px: 0, py: 0 });
assert.strictEqual(done.eventId, 0);
assert.strictEqual(done.lines[0], "你打完 100 層了！");

const reward = kidGuideStep({ mapId: 20, floor: 6, goldOpen: true, crownOpen: true, px: 0, py: 0 });
assert.strictEqual(reward.eventId, 39);
assert.ok(reward.lines.join("").includes("領獎"));

assert.strictEqual(kidGuideStep({ mapId: 4, floor: 1, goldOpen: false, crownOpen: false, px: 0, py: 0 }), null);

assert.strictEqual(kidGuideDoorAllowed(false, false), false);
assert.strictEqual(kidGuideDoorAllowed(true, false), false);
assert.strictEqual(kidGuideDoorAllowed(false, true), false);
assert.strictEqual(kidGuideDoorAllowed(true, true), true);

const onScreen = kidGuideArrowPlacement(400, 300, 1280, 720, 56);
assert.strictEqual(onScreen.onScreen, true);
assert.strictEqual(onScreen.rotation, 0);

const above = kidGuideArrowPlacement(640, -200, 1280, 720, 56);
assert.strictEqual(above.onScreen, false);
assert.ok(above.y <= 56 + 1);
assert.ok(Math.abs(above.rotation - Math.PI) < 0.2);

const map18 = fs.readFileSync(new URL("../data/Map018.json", import.meta.url), "utf8");
assert.ok(map18.includes("先去拿寶箱。"));
assert.ok(map18.includes("這扇門還沒開。"));
assert.ok(!map18.includes("走右邊的門"));
assert.ok(!map18.includes("再到右邊的門"));
const map65 = JSON.parse(fs.readFileSync(new URL("../data/Map065.json", import.meta.url), "utf8"));
const robot = map65.events.find((event) => event && event.id === 25);
assert.strictEqual(robot.pages[0].trigger, 1);
assert.deepStrictEqual(robot.pages[0].list.find((command) => command.code === 102).parameters[0], ["打", "先不要"]);
const floorDoor = map65.events.find((event) => event && event.id === 24);
const doorText = floorDoor.pages[0].list.filter((command) => command.code === 401).map((command) => command.parameters[0]).join("");
assert.ok(doorText.includes("不用走這扇門"));
assert.ok(!doorText.includes("應戰"));

console.log("kid tower guide tests passed");
