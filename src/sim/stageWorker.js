import { layOutStage, transferables } from './stageData.js';

// Lays out stages off the main thread: asked for a stage by index, it answers with the laid-out data.
self.onmessage = ({ data }) => {
    try {
        const laid = layOutStage(data.index);
        self.postMessage(laid, transferables(laid));
    } catch (error) {
        self.postMessage({ index: data.index, error: String(error?.stack ?? error) });
    }
};
