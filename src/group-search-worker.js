import { suggestGrouping } from "./group-suggestions.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage(suggestGrouping(data.dataset, data.view));
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
