/*:
 * @target MZ
 * @plugindesc [v1.1 Debug版] 粵語全語音 TTS 即時合成系統
 * @author 專業 RPG Maker MZ 開發員
 *
 * @help CantoneseTTS.js
 * * @param Language
 * @text 語音語言 (Language)
 * @default zh-HK
 *
 * @param Pitch
 * @text 語音音調 (Pitch)
 * @default 1.0
 *
 * @param Rate
 * @text 語音語速 (Rate)
 * @default 1.0
 *
 * @param Volume
 * @text 語音音量 (Volume)
 * @default 1.0
 */

(() => {
    'use strict';

    console.log("✅ [CantoneseTTS] 插件已成功載入！");

    const pluginName = 'CantoneseTTS';
    const parameters = PluginManager.parameters(pluginName);
    const ttsLang = String(parameters['Language'] || 'zh-HK');
    
    // 確認支援度
    const isTTSSupported = ('speechSynthesis' in window);
    if (!isTTSSupported) {
        console.error("❌ [CantoneseTTS] 你的系統或瀏覽器不支援 Web Speech API！");
    }

    const cleanMessageText = (text) => {
        if (!text) return '';
        let cleaned = text.replace(/[\\]/g, '\x1b');
        cleaned = cleaned.replace(/\x1b[a-zA-Z]+\[.*?\]/g, '');
        cleaned = cleaned.replace(/\x1b[a-zA-Z!\.\|><\^]/g, '');
        cleaned = cleaned.replace(/\n/g, '，');
        return cleaned;
    };

    const playTTS = (text) => {
        if (!isTTSSupported) return;
        window.speechSynthesis.cancel();

        console.log("🔊 [CantoneseTTS] 準備朗讀: ", text);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = ttsLang;
        utterance.pitch = Number(parameters['Pitch'] || 1.0);
        utterance.rate = Number(parameters['Rate'] || 1.0);
        utterance.volume = Number(parameters['Volume'] || 1.0);

        // 錯誤捕捉
        utterance.onerror = (event) => {
            console.error("❌ [CantoneseTTS] 播放失敗，原因: ", event.error);
        };

        window.speechSynthesis.speak(utterance);
    };

    const _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function() {
        _Window_Message_startMessage.call(this);
        
        const rawText = $gameMessage.allText();
        const speakText = cleanMessageText(rawText);
        
        if (speakText && speakText.trim().length > 0) {
            playTTS(speakText);
        }
    };

    const _Window_Message_terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function() {
        _Window_Message_terminateMessage.call(this);
        window.speechSynthesis.cancel();
    };

    const _Window_Message_newPage = Window_Message.prototype.newPage;
    Window_Message.prototype.newPage = function(textState) {
        _Window_Message_newPage.call(this, textState);
        window.speechSynthesis.cancel();
    };

})();
