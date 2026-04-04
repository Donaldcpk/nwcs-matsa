//=============================================================================
// main.js v1.10.0 (+ 修正：登入後動態載入時 load 已觸發導致卡轉圈)
//=============================================================================

const scriptUrls = [
    "js/libs/pixi.js",
    "js/libs/pako.min.js",
    "js/libs/localforage.min.js",
    "js/libs/effekseer.min.js",
    "js/libs/vorbisdecoder.js",
    "js/rmmz_core.js",
    "js/rmmz_managers.js",
    "js/rmmz_objects.js",
    "js/rmmz_scenes.js",
    "js/rmmz_sprites.js",
    "js/rmmz_windows.js",
    "js/plugins.js"
];
const effekseerWasmUrl = "js/libs/effekseer.wasm";

class Main {
    constructor() {
        this.xhrSucceeded = false;
        this.loadCount = 0;
        this.error = null;
        this._gameStarted = false;
        this._pluginsReady = false;
        this._startScheduled = false;
    }

    run() {
        this.showLoadingSpinner();
        this.testXhr();
        this.hookNwjsClose();
        this.loadMainScripts();
        window.addEventListener("error", this.onWindowError.bind(this));
    }

    showLoadingSpinner() {
        const loadingSpinner = document.createElement("div");
        const loadingSpinnerImage = document.createElement("div");
        loadingSpinner.id = "loadingSpinner";
        loadingSpinnerImage.id = "loadingSpinnerImage";
        loadingSpinner.appendChild(loadingSpinnerImage);
        document.body.appendChild(loadingSpinner);
    }

    eraseLoadingSpinner() {
        const loadingSpinner = document.getElementById("loadingSpinner");
        if (loadingSpinner) {
            document.body.removeChild(loadingSpinner);
        }
    }

    testXhr() {
        const cur = document.currentScript;
        const src = cur && cur.src;
        if (!src) {
            // 動態插入 main.js（例如 school-auth-gate 登入後）時 currentScript 常為 null
            this.xhrSucceeded = true;
            this.tryStartGame();
            return;
        }
        const xhr = new XMLHttpRequest();
        xhr.open("GET", src);
        xhr.onload = () => {
            this.xhrSucceeded = true;
            this.tryStartGame();
        };
        xhr.onerror = () => {
            this.xhrSucceeded = true;
            this.tryStartGame();
        };
        xhr.send();
    }

    hookNwjsClose() {
        if (typeof nw === "object") {
            nw.Window.get().on("close", () => nw.App.quit());
        }
    }

    loadMainScripts() {
        for (const url of scriptUrls) {
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = url;
            script.async = false;
            script.defer = true;
            script.onload = this.onScriptLoad.bind(this);
            script.onerror = this.onScriptError.bind(this);
            script._url = url;
            document.body.appendChild(script);
        }
        this.numScripts = scriptUrls.length;
    }

    onScriptLoad() {
        if (++this.loadCount === this.numScripts) {
            PluginManager.setup($plugins);
            this._pluginsReady = true;
            this.tryStartGame();
        }
    }

    onScriptError(e) {
        this.printError("Failed to load", e.target._url);
    }

    tryStartGame() {
        if (this._gameStarted) return;
        if (!this._pluginsReady || !this.xhrSucceeded) return;
        if (this._startScheduled) return;
        this._startScheduled = true;

        const start = () => {
            if (this._gameStarted) return;
            this._gameStarted = true;

            if (!this.xhrSucceeded) {
                this.printError("Error", "Your browser does not allow to read local files.");
                return;
            }
            if (this.isPathRandomized()) {
                this.printError("Error", "Please move the Game.app to a different folder.");
                return;
            }
            if (this.error) {
                this.printError(this.error.name, this.error.message);
                return;
            }
            this.initEffekseerRuntime();
        };

        // 登入後才載入 main.js 時，window「load」往往已經觸發過，不能再只聽 load
        if (document.readyState === "complete") {
            setTimeout(start, 0);
        } else {
            window.addEventListener("load", start, { once: true });
        }
    }

    printError(name, message) {
        this.eraseLoadingSpinner();
        if (!document.getElementById("errorPrinter")) {
            const errorPrinter = document.createElement("div");
            errorPrinter.id = "errorPrinter";
            errorPrinter.innerHTML = this.makeErrorHtml(name, message);
            document.body.appendChild(errorPrinter);
        }
    }

    makeErrorHtml(name, message) {
        const nameDiv = document.createElement("div");
        const messageDiv = document.createElement("div");
        nameDiv.id = "errorName";
        messageDiv.id = "errorMessage";
        nameDiv.innerHTML = name;
        messageDiv.innerHTML = message;
        return nameDiv.outerHTML + messageDiv.outerHTML;
    }

    onWindowError(event) {
        if (!this.error) {
            this.error = event.error;
        }
    }

    isPathRandomized() {
        return (
            typeof process === "object" &&
            process.mainModule.filename.startsWith("/private/var")
        );
    }

    initEffekseerRuntime() {
        const onLoad = this.onEffekseerLoad.bind(this);
        const onError = this.onEffekseerError.bind(this);
        effekseer.initRuntime(effekseerWasmUrl, onLoad, onError);
    }

    onEffekseerLoad() {
        this.eraseLoadingSpinner();
        SceneManager.run(Scene_Boot);
    }

    onEffekseerError() {
        this.printError("Failed to load", effekseerWasmUrl);
    }
}

const main = new Main();
main.run();

//-----------------------------------------------------------------------------