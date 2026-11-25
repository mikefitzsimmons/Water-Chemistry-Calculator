import { solveRecipe } from './solver.js';

self.addEventListener('message', event => {
  try {
    self.postMessage({ result: solveRecipe(event.data) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
});
