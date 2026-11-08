// The How to use guide. It opens by itself on a reader's first plain visit
// only; not when the page was reached through a snapshot or board link,
// because that reader came to see something specific.

export const GUIDE_KEY = 'fishboneDiagram.guideSeen.v1';

function seen(storage) {
    try { return storage.getItem(GUIDE_KEY) === '1'; } catch (e) { return true; }
}

function remember(storage) {
    try { storage.setItem(GUIDE_KEY, '1'); } catch (e) { /* private window: ask again next time */ }
}

/** Wire the guide. arrivedByLink is true for a snapshot or board link. */
export function initGuide({ dialog, opener, storage, arrivedByLink }) {
    const open = () => {
        if (!dialog.open) dialog.showModal();
        remember(storage);
        const first = dialog.querySelector('[data-close]');
        if (first) first.focus();
    };
    opener.addEventListener('click', open);
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
    if (!arrivedByLink && !seen(storage)) open();
    return { open };
}
