import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const QuizPictureFit = require("../js/plugins/quizPictureFit.js");

const boxW = 1280;
const boxH = 720;

function assertFits(label, imgW, imgH, choices) {
    const horizontal = QuizPictureFit.choicesAreShort(choices);
    const reserve = QuizPictureFit.bottomReserve(choices.length, horizontal);
    const layout = QuizPictureFit.layout(imgW, imgH, boxW, boxH, reserve);
    assert.ok(layout.drawW <= layout.maxW + 0.01, label + " width " + layout.drawW);
    assert.ok(layout.drawH <= layout.maxH + 0.01, label + " height " + layout.drawH);
    assert.ok(layout.x >= QuizPictureFit.MARGIN, label + " x");
    assert.ok(layout.x + layout.drawW <= boxW - QuizPictureFit.MARGIN + 0.5, label + " right");
    assert.ok(layout.y + layout.drawH <= boxH - reserve + 0.5, label + " bottom");
    return layout;
}

const wide = assertFits("S3 wide", 2339, 1063, ["A", "B", "C", "D"]);
assert.ok(wide.scalePercent < 100, "wide image must shrink");

const normal = assertFits("S2 normal", 650, 205, ["A", "B", "C", "D"]);
assert.ok(normal.scalePercent > 100 && normal.scalePercent <= 200, "spare space enlarges the picture");

const tiny = assertFits("tiny", 80, 80, ["A", "B", "C", "D"]);
assert.equal(tiny.scalePercent, 200, "enlargement stops at 2x");

assert.equal(QuizPictureFit.hasRecordedAnswer({ Q_T: 4, C_A: "B" }), true);
assert.equal(QuizPictureFit.hasRecordedAnswer({ Q_T: 4, C_A: "?" }), false);
assert.equal(QuizPictureFit.hasRecordedAnswer({ Q_T: 9, C_A: "true" }), true);
assert.equal(QuizPictureFit.hasRecordedAnswer({ Q_T: 9, C_A: "maybe" }), false);

assertFits("S1 wide", 1466, 326, ["A", "B", "C", "D"]);
assertFits("TSA tall", 980, 723, ["A", "B", "C", "D"]);
assertFits("true false", 800, 400, ["True", "False"]);

assert.equal(QuizPictureFit.choicesAreShort(["A", "B", "C", "D"]), true);
assert.equal(QuizPictureFit.choicesAreShort(["True", "False"]), true);
assert.equal(
    QuizPictureFit.choicesAreShort(["一個很長的選項文字", "B", "C", "D"]),
    false
);

const letterReserve = QuizPictureFit.bottomReserve(4, true);
const longReserve = QuizPictureFit.bottomReserve(4, false);
assert.ok(letterReserve < longReserve, "one-row answers leave more room for the picture");

console.log("quiz picture fit ok");
