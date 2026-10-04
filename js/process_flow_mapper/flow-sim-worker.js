// Runs the lead time simulation off the page's thread, so a big map does not
// hold up typing. Same code and seed as a run on the page, so the same result.

import { simulate, summarise } from './flow-simulate.js';

self.addEventListener('message', (event) => {
    const { key, input, options, ranges } = event.data;
    self.postMessage({ key, spread: summarise(simulate(input, options), ranges) });
});
