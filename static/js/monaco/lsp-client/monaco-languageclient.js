// Minimal Monaco Language Client bridge
export class MonacoLanguageClient {
    constructor(options) {
        this.worker = options.worker;
        this.languageId = options.languageId;

        this.worker.onmessage = (e) => {
            if (this.onMessageCallback) this.onMessageCallback(e.data);
        };
    }

    send(msg) {
        this.worker.postMessage(msg);
    }

    onMessage(callback) {
        this.onMessageCallback = callback;
    }
}
