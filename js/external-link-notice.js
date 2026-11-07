// Notice shown before the hub sends someone to one of the separate
// *.jesse-anderson.net apps. Those sites have no link back, so the notice
// says to use Back, and it opens them in this tab so Back works.

const SKIP_KEY = 'toolsHub.externalNotice.skip';

function skipNotice() {
    try { return localStorage.getItem(SKIP_KEY) === '1'; } catch { return false; }
}

function rememberSkip() {
    try { localStorage.setItem(SKIP_KEY, '1'); } catch { /* storage unavailable */ }
}

function buildDialog() {
    const dialog = document.createElement('dialog');
    dialog.className = 'external-notice';
    dialog.id = 'externalNotice';
    dialog.setAttribute('aria-labelledby', 'externalNoticeTitle');
    dialog.setAttribute('aria-describedby', 'externalNoticeBack');

    const title = document.createElement('h2');
    title.id = 'externalNoticeTitle';

    const back = document.createElement('p');
    back.id = 'externalNoticeBack';
    back.className = 'external-notice-lead';

    const terms = document.createElement('p');
    terms.className = 'external-notice-terms';
    terms.textContent = 'It is a separate site with its own terms, and this site\'s disclaimer does not cover it. It may load analytics or other third-party resources that Tools Hub pages do not.';

    const skipLabel = document.createElement('label');
    skipLabel.className = 'external-notice-skip';
    const skip = document.createElement('input');
    skip.type = 'checkbox';
    skip.id = 'externalNoticeSkip';
    skipLabel.append(skip, document.createTextNode(' Don\'t show this again'));

    const actions = document.createElement('div');
    actions.className = 'external-notice-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'external-notice-cancel';
    cancel.textContent = 'Stay here';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'external-notice-go';
    actions.append(cancel, go);

    dialog.append(title, back, terms, skipLabel, actions);
    document.body.appendChild(dialog);

    // A click on the backdrop lands on the dialog element itself.
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    cancel.addEventListener('click', () => dialog.close());
    go.addEventListener('click', () => {
        if (skip.checked) rememberSkip();
        const href = dialog.dataset.href;
        dialog.close();
        if (href) window.location.assign(href);
    });
    return { dialog, title, back, skip, go };
}

let parts = null;

function showNotice(card) {
    parts = parts || buildDialog();
    const url = new URL(card.href);
    const name = card.querySelector('.tool-name')?.firstChild?.textContent.trim() || url.host;
    parts.dialog.dataset.href = card.href;
    parts.title.textContent = `Leaving Tools Hub for ${name}`;
    parts.back.textContent = `${url.host} has no link back to Tools Hub. It opens in this tab: use your browser's Back button to return here.`;
    parts.go.textContent = `Continue to ${url.host}`;
    parts.skip.checked = false;
    parts.dialog.showModal();
    parts.go.focus();
}

document.addEventListener('click', (e) => {
    const card = e.target.closest('a.tool-card[data-external]');
    if (!card) return;
    // Modified clicks open a new tab, which keeps the hub open anyway.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (skipNotice()) return;
    e.preventDefault();
    showNotice(card);
});
