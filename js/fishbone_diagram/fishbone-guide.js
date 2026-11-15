// The How to use guide. A first plain visit shows a one-line hint pointing at
// it rather than opening it over the page; a snapshot or board link shows
// neither, because that reader came to see something specific.

export const GUIDE_KEY = 'fishboneDiagram.guideSeen.v1';

function seen(storage) {
    try { return storage.getItem(GUIDE_KEY) === '1'; } catch (e) { return true; }
}

function remember(storage) {
    try { storage.setItem(GUIDE_KEY, '1'); } catch (e) { /* private window: ask again next time */ }
}

/** Wire the guide. hint is { box, open, dismiss }; arrivedByLink is true for a snapshot or board link. */
export function initGuide({ dialog, opener, hint, storage, arrivedByLink }) {
    const hideHint = () => {
        hint.box.hidden = true;
        remember(storage);
    };
    const open = () => {
        if (!dialog.open) dialog.showModal();
        hideHint();
        const first = dialog.querySelector('[data-close]');
        if (first) first.focus();
    };
    opener.addEventListener('click', open);
    hint.open.addEventListener('click', open);
    hint.dismiss.addEventListener('click', () => {
        hideHint();
        opener.focus();
    });
    // Contents links scroll within the dialog instead of changing the page's hash.
    dialog.addEventListener('click', (event) => {
        const link = event.target.closest('a[href^="#guide-"]');
        if (!link) return;
        event.preventDefault();
        const target = dialog.querySelector(link.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ block: 'start' });
            const heading = target.querySelector('h3');
            if (heading) { heading.tabIndex = -1; heading.focus(); }
        }
    });
    dialog.addEventListener('close', () => opener.focus());
    hint.box.hidden = arrivedByLink || seen(storage);
    return { open };
}
