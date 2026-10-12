//=============================================================================
// quizPictureFit.js
// 題圖縮放與答題列高度。給 MZQuizzer 用，也給 Node 測試用。
//=============================================================================
/*:
 * @target MZ
 * @plugindesc 計算題目圖片要縮到多大，才不會被畫面或答題按鈕切掉。
 * @author nwcs
 */
var QuizPictureFit = QuizPictureFit || {};

(function() {
    "use strict";

    var PADDING = 12;
    var LINE = 36;
    var CHOICE_ITEM = 44;
    var MARGIN = 8;

    QuizPictureFit.MARGIN = MARGIN;

    QuizPictureFit.choicesAreShort = function(choices) {
        if (!choices || choices.length < 2 || choices.length > 5) return false;
        for (var i = 0; i < choices.length; i++) {
            if (String(choices[i]).length > 8) return false;
        }
        return true;
    };

    QuizPictureFit.bottomReserve = function(choiceCount, horizontal) {
        var count = choiceCount > 0 ? choiceCount : 4;
        var messageH = LINE + PADDING * 2 + 8;
        var rows = horizontal ? 1 : count;
        var choiceH = rows * CHOICE_ITEM + PADDING * 2;
        return messageH + choiceH + MARGIN;
    };

    QuizPictureFit.layout = function(imgW, imgH, boxW, boxH, reserveBottom) {
        var maxW = Math.max(1, boxW - MARGIN * 2);
        var maxH = Math.max(1, boxH - reserveBottom - MARGIN);
        var scale = 1;
        if (imgW > 0 && imgH > 0) {
            scale = Math.min(maxW / imgW, maxH / imgH, 1);
        }
        var scalePercent = Math.floor(scale * 1000) / 10;
        if (!(scalePercent > 0)) scalePercent = 0.1;
        var drawW = imgW * scalePercent / 100;
        var drawH = imgH * scalePercent / 100;
        while ((drawW > maxW + 0.5 || drawH > maxH + 0.5) && scalePercent > 0.1) {
            scalePercent = Math.round((scalePercent - 0.1) * 10) / 10;
            drawW = imgW * scalePercent / 100;
            drawH = imgH * scalePercent / 100;
        }
        var x = Math.max(MARGIN, Math.round((boxW - drawW) / 2));
        var y = MARGIN;
        return {
            scalePercent: scalePercent,
            x: x,
            y: y,
            drawW: drawW,
            drawH: drawH,
            maxW: maxW,
            maxH: maxH
        };
    };
})();

if (typeof module !== "undefined" && module.exports) {
    module.exports = QuizPictureFit;
}
