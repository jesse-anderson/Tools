// Info popovers beside a field: open on hover or focus, pinned open by a click
// or tap, closed by Escape or a click elsewhere. Content is built as DOM nodes.

import { REFERENCE } from './wfh-data.js';

function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
}

function buildTable(block) {
    const wrap = el('div', 'info-table-wrap');
    const table = el('table', 'info-table');
    const thead = el('thead');
    const hr = el('tr');
    for (const h of block.head) {
        const th = el('th', '', h);
        th.scope = 'col';
        hr.appendChild(th);
    }
    thead.appendChild(hr);
    const tbody = el('tbody');
    for (const row of block.rows) {
        const tr = el('tr');
        row.forEach((cell, i) => {
            const c = el(i === 0 ? 'th' : 'td', '', cell);
            if (i === 0) c.scope = 'row';
            tr.appendChild(c);
        });
        tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    wrap.appendChild(table);
    return wrap;
}

// Fills a <span class="info-tip" data-info="key"> with its button and popover.
export function renderInfoTip(span, idPrefix) {
    const ref = REFERENCE[span.dataset.info];
    if (!ref) return;
    span.textContent = '';
    const popId = `${idPrefix}-info-${span.dataset.info}`;

    const btn = el('button', 'info-btn', 'i');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', popId);
    btn.setAttribute('aria-label', `${ref.title} (reference)`);

    const pop = el('div', 'info-pop');
    pop.id = popId;
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', ref.title);
    const card = el('div', 'info-card');
    card.appendChild(el('p', 'info-title', ref.title));
    for (const b of ref.blocks) card.appendChild(b.head ? buildTable(b) : el('p', '', b.p));
    const src = el('ul', 'info-sources');
    for (const s of ref.sources) {
        const li = el('li');
        const a = el('a', '', s.label);
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener';
        li.appendChild(a);
        src.appendChild(li);
    }
    card.appendChild(el('p', 'info-sources-label', 'Sources'));
    card.appendChild(src);
    pop.appendChild(card);
    span.append(btn, pop);
}

function setOpen(tip, open) {
    tip.classList.toggle('open', open);
    const btn = tip.querySelector('.info-btn');
    if (btn) btn.setAttribute('aria-expanded', String(open));
}

// One set of listeners on the document covers tips added later by buildJobs.
export function wireInfoTips() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.info-btn');
        const inside = e.target.closest('.info-tip');
        document.querySelectorAll('.info-tip.open').forEach((t) => { if (t !== inside) setOpen(t, false); });
        if (btn) {
            const tip = btn.closest('.info-tip');
            tip.classList.remove('suppressed');
            setOpen(tip, !tip.classList.contains('open'));
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.info-tip').forEach((t) => {
            if (t.classList.contains('open') || t.matches(':hover, :focus-within')) {
                setOpen(t, false);
                t.classList.add('suppressed');
            }
        });
    });
    const unsuppress = (e) => {
        const tip = e.target.closest && e.target.closest('.info-tip');
        if (tip && !tip.contains(e.relatedTarget)) tip.classList.remove('suppressed');
    };
    document.addEventListener('mouseout', unsuppress);
    document.addEventListener('focusout', unsuppress);
}
