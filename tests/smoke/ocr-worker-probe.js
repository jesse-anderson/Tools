// Not part of the site. The test server sends this file under the same policy
// as the OCR tool's workers, so a spec can show what that policy stops.
self.onmessage = async (event) => {
    const outcome = {};
    for (const url of event.data) {
        try {
            await fetch(url, { mode: 'no-cors' });
            outcome[url] = 'sent';
        } catch (error) {
            outcome[url] = 'refused';
        }
    }
    self.postMessage(outcome);
};
