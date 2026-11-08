// Milk Fat Calculator page. All arithmetic is in milk-fat-engine.js.

import { PRODUCTS, CFR_RANGES, UNITS, LABEL_UNITS, SOURCES } from './milk-fat-data.js';
import * as Engine from './milk-fat-engine.js';

window.MilkFat = { ...Engine, PRODUCTS, CFR_RANGES, UNITS, LABEL_UNITS };

const CUSTOM = 'custom';
let nextId = 1;

function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key in node) node[key] = value;
        else node.setAttribute(key, value);
    }
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return node;
}

function fmt(n, digits = 2) {
    return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function pct(n) {
    return `${n.toFixed(2)}%`;
}

function options(select, list, selected) {
    select.replaceChildren(...list.map((item) => el('option', { value: item.id, text: item.label, selected: item.id === selected })));
}

const WORD_UNITS = new Set(['cup', 'pint', 'quart', 'half gallon', 'gallon']);

// "1 cup", "2 cups"; abbreviations stay as they are.
function unitWord(amount, unitId) {
    const label = UNITS.find((u) => u.id === unitId).label;
    return WORD_UNITS.has(label) && fmt(amount) !== '1' ? `${label}s` : label;
}

function rangeText(range) {
    const span = range.below === null ? `at least ${fmt(range.min)}%` : `${fmt(range.min)} to under ${fmt(range.below)}%`;
    return `${span} (21 CFR ${range.section})`;
}

function cfrFor(productId) {
    const names = { whole: 'milk', halfhalf: 'half-and-half', light: 'light cream', lightwhip: 'light whipping cream', heavy: 'heavy cream' };
    return CFR_RANGES.find((r) => r.name === names[productId]) || null;
}

// One ingredient: product, optional amount and unit, and fat as a percent or from a label.
function createIngredient({ title, productId = 'whole', amount = 1, unitId = 'cup', removable = false, onChange, onRemove }) {
    const id = `ing${nextId++}`;
    const legend = el('legend', { text: title });
    const product = el('select', { id: `${id}-product` });
    product.append(
        ...PRODUCTS.map((p) => el('option', { value: p.id, text: p.name })),
        el('option', { value: CUSTOM, text: 'Other (enter fat)' }),
    );
    product.value = productId;

    const amountInput = el('input', { id: `${id}-amount`, type: 'number', min: '0', step: 'any', inputMode: 'decimal', value: String(amount) });
    const unit = el('select', { id: `${id}-unit` });
    options(unit, UNITS, unitId);
    const amountGroup = el('div', { class: 'field-grid' },
        el('div', { class: 'input-group' }, el('label', { htmlFor: amountInput.id, text: 'Amount' }), amountInput),
        el('div', { class: 'input-group' }, el('label', { htmlFor: unit.id, text: 'Unit' }), unit));

    const source = el('select', { id: `${id}-source` },
        el('option', { value: 'percent', text: 'Fat percent' }),
        el('option', { value: 'label', text: 'Nutrition label' }));
    const fatInput = el('input', { id: `${id}-fat`, type: 'number', min: '0', max: '100', step: 'any', inputMode: 'decimal' });
    const percentGroup = el('div', { class: 'input-group' }, el('label', { htmlFor: fatInput.id, text: 'Fat % (by weight)' }), fatInput);

    const labelFat = el('input', { id: `${id}-lfat`, type: 'number', min: '0', step: 'any', inputMode: 'decimal', value: '1' });
    const labelServing = el('input', { id: `${id}-lserv`, type: 'number', min: '0', step: 'any', inputMode: 'decimal', value: '2' });
    const labelUnit = el('select', { id: `${id}-lunit` });
    options(labelUnit, LABEL_UNITS, 'tbsp');
    const labelGroup = el('div', { class: 'field-grid three', hidden: true },
        el('div', { class: 'input-group' }, el('label', { htmlFor: labelFat.id, text: 'Total fat (g)' }), labelFat),
        el('div', { class: 'input-group' }, el('label', { htmlFor: labelServing.id, text: 'Per serving of' }), labelServing),
        el('div', { class: 'input-group' }, el('label', { htmlFor: labelUnit.id, text: 'Serving unit' }), labelUnit));

    const hint = el('p', { class: 'hint', id: `${id}-hint` });
    fatInput.setAttribute('aria-describedby', hint.id);

    const remove = removable
        ? el('button', { type: 'button', class: 'tool-btn small remove', text: 'Remove', 'aria-label': `Remove ${title}` })
        : null;

    const root = el('fieldset', { class: 'ingredient' },
        legend,
        el('div', { class: 'ingredient-head' },
            el('div', { class: 'input-group grow' }, el('label', { htmlFor: product.id, text: 'Product' }), product),
            remove),
        amountGroup,
        el('div', { class: 'input-group' }, el('label', { htmlFor: source.id, text: 'Fat from' }), source),
        percentGroup,
        labelGroup,
        hint);

    function fillPreset() {
        const p = PRODUCTS.find((x) => x.id === product.value);
        if (p) fatInput.value = String(p.fatPercent);
    }

    function presetHint() {
        const p = PRODUCTS.find((x) => x.id === product.value);
        if (!p) return 'Enter the fat percent from your carton or supplier.';
        const range = cfrFor(p.id);
        const usda = `USDA average ${fmt(p.fatPercent)}%.`;
        return range ? `${usda} Legal range ${rangeText(range)}.` : usda;
    }

    // Returns the ingredient's values, or throws a RangeError naming the field.
    function read() {
        const name = product.value === CUSTOM ? title : product.selectedOptions[0].textContent;
        let fatPercent;
        let labelRange = null;
        if (source.value === 'label') {
            const result = Engine.fatFromLabel({
                fatGrams: labelFat.valueAsNumber,
                servingAmount: labelServing.valueAsNumber,
                servingUnitId: labelUnit.value,
            });
            fatPercent = result.fatPercent;
            labelRange = result.range;
        } else {
            fatPercent = fatInput.valueAsNumber;
        }
        const phrase = product.value === CUSTOM ? `"${title}"` : name.toLowerCase();
        return { name, phrase, fatPercent, labelRange, amount: amountInput.valueAsNumber, unitId: unit.value };
    }

    function refreshHint() {
        if (source.value !== 'label') {
            hint.textContent = presetHint();
            return;
        }
        try {
            const r = Engine.fatFromLabel({ fatGrams: labelFat.valueAsNumber, servingAmount: labelServing.valueAsNumber, servingUnitId: labelUnit.value });
            hint.textContent = r.range
                ? `Label works out to ${pct(r.fatPercent)}. Its rounding allows ${pct(r.range.low)} to ${pct(r.range.high)}.`
                : `Label works out to ${pct(r.fatPercent)}. ${fmt(labelFat.valueAsNumber)} g is not a value a label prints, so no rounding range is shown.`;
        } catch (e) {
            hint.textContent = e.message;
        }
    }

    product.addEventListener('change', () => {
        fillPreset();
        refreshHint();
        onChange();
    });
    source.addEventListener('change', () => {
        const isLabel = source.value === 'label';
        percentGroup.hidden = isLabel;
        labelGroup.hidden = !isLabel;
        refreshHint();
        onChange();
    });
    for (const input of [amountInput, unit, fatInput, labelFat, labelServing, labelUnit]) {
        input.addEventListener('input', () => {
            refreshHint();
            onChange();
        });
    }
    if (remove) remove.addEventListener('click', () => onRemove(api));

    fillPreset();
    refreshHint();

    const api = {
        root,
        read,
        setAmountVisible(visible) { amountGroup.hidden = !visible; },
        setTitle(text) {
            legend.textContent = text;
            if (remove) remove.setAttribute('aria-label', `Remove ${text}`);
        },
        setLabel(fatGrams, servingAmount, servingUnitId) {
            source.value = 'label';
            labelFat.value = String(fatGrams);
            labelServing.value = String(servingAmount);
            labelUnit.value = servingUnitId;
            source.dispatchEvent(new Event('change'));
        },
    };
    return api;
}

// Mix section
const mixList = document.getElementById('mixList');
const mixResult = document.getElementById('mixResult');
let mixItems = [];

function addMixItem(opts = {}) {
    const item = createIngredient({
        title: `Ingredient ${mixItems.length + 1}`,
        removable: true,
        onChange: renderMix,
        onRemove: (api) => {
            mixItems = mixItems.filter((x) => x !== api);
            api.root.remove();
            mixItems.forEach((x, i) => x.setTitle(`Ingredient ${i + 1}`));
            renderMix();
        },
        ...opts,
    });
    mixItems.push(item);
    mixList.append(item.root);
    return item;
}

function setMix(list) {
    mixItems.forEach((x) => x.root.remove());
    mixItems = [];
    for (const opts of list) addMixItem(opts);
    renderMix();
}

function classLine(fatPercent) {
    const range = Engine.classify(fatPercent);
    if (!range) return `Below the 3.25% minimum for milk (21 CFR 131.110).`;
    return `Fat is in the ${range.name} range: ${rangeText(range)}. Fat only; other rules apply to the name.`;
}

function heldNote(parts) {
    const notes = [];
    if (parts.some((p) => p.densityHeld === 'above')) notes.push('Above 36.08% fat, heavy cream density is used.');
    if (parts.some((p) => p.densityHeld === 'below')) notes.push('Below 0.08% fat, skim milk density is used.');
    return notes;
}

function errorBox(message) {
    return el('p', { class: 'error', role: 'alert', text: message });
}

function renderMix() {
    let items;
    let result;
    try {
        items = mixItems.map((x) => x.read());
        result = Engine.mix(items);
    } catch (e) {
        mixResult.replaceChildren(errorBox(e.message));
        return;
    }
    if (result.fatPercent === null) {
        mixResult.replaceChildren(el('p', { class: 'hint', text: 'Enter an amount to see the fat percent.' }));
        return;
    }
    const notes = [classLine(result.fatPercent), ...heldNote(result.parts)];
    if (items.some((x) => x.labelRange)) {
        const low = Engine.mix(items.map((x) => (x.labelRange ? { ...x, fatPercent: x.labelRange.low } : x)));
        const high = Engine.mix(items.map((x) => (x.labelRange ? { ...x, fatPercent: x.labelRange.high } : x)));
        notes.push(`Label rounding allows ${pct(low.fatPercent)} to ${pct(high.fatPercent)}.`);
    }
    const cupGrams = result.ml > 0 ? (result.fatGrams / result.ml) * Engine.US_CUP_ML : 0;
    const rows = result.parts.map((p, i) => el('tr', {},
        el('th', { scope: 'row', text: p.name }),
        el('td', { text: amountText(items[i].amount, items[i].unitId) }),
        el('td', { text: pct(p.fatPercent) }),
        el('td', { text: `${fmt(p.grams, 1)} g` }),
        el('td', { text: `${fmt(p.fatGrams, 1)} g` })));
    mixResult.replaceChildren(
        el('p', { class: 'big-number', id: 'mixPercent' }, el('span', { text: pct(result.fatPercent) }), ' fat'),
        el('ul', { class: 'notes' }, ...notes.map((n) => el('li', { text: n }))),
        el('dl', { class: 'stats' },
            el('dt', { text: 'Total fat' }), el('dd', { text: `${fmt(result.fatGrams, 1)} g` }),
            el('dt', { text: 'Total weight' }), el('dd', { text: `${fmt(result.grams, 0)} g (${fmt(result.grams / 453.59237)} lb)` }),
            el('dt', { text: 'Total volume' }), el('dd', { text: `${fmt(result.ml / (3785.411784 / 128), 1)} fl oz (${fmt(result.ml, 0)} mL)` }),
            el('dt', { text: 'Fat per cup' }), el('dd', { text: `${fmt(cupGrams, 1)} g` })),
        el('div', { class: 'table-scroll' },
            el('table', {},
                el('caption', { class: 'visually-hidden', text: 'Each ingredient' }),
                el('thead', {}, el('tr', {},
                    ...['Ingredient', 'Amount', 'Fat', 'Weight', 'Fat weight'].map((h) => el('th', { scope: 'col', text: h })))),
                el('tbody', {}, ...rows))));
}

// Target section
const targetList = document.getElementById('targetList');
const targetResult = document.getElementById('targetResult');
const targetMode = document.getElementById('targetMode');
const targetPercent = document.getElementById('targetPercent');
const targetOutUnit = document.getElementById('targetOutUnit');
const batchFields = document.getElementById('batchFields');
const batchAmount = document.getElementById('batchAmount');
const batchUnit = document.getElementById('batchUnit');
options(targetOutUnit, UNITS, 'cup');
options(batchUnit, UNITS, 'quart');

const base = createIngredient({ title: 'What I have', productId: 'whole', amount: 1, unitId: 'gal', onChange: renderTarget });
const addIn = createIngredient({ title: 'What I will add', productId: 'heavy', onChange: renderTarget });
addIn.setAmountVisible(false);
targetList.append(base.root, addIn.root);

function amountText(amount, unitId) {
    return `${fmt(amount)} ${unitWord(amount, unitId)}`;
}

function totalText(total, unitId) {
    const unit = UNITS.find((u) => u.id === unitId);
    const size = unit.kind === 'mass' ? total.grams / unit.size : total.ml / unit.size;
    return `${amountText(size, unitId)} at ${pct(total.fatPercent)} fat (${fmt(total.grams, 0)} g)`;
}

function renderTarget() {
    const isBatch = targetMode.value === 'batch';
    batchFields.hidden = !isBatch;
    base.setAmountVisible(!isBatch);
    base.setTitle(isBatch ? 'First product' : 'What I have');
    addIn.setTitle(isBatch ? 'Second product' : 'What I will add');
    const out = targetOutUnit.value;
    try {
        const a = base.read();
        const b = addIn.read();
        const target = targetPercent.valueAsNumber;
        const r = isBatch
            ? Engine.solveBatch({ aFatPercent: a.fatPercent, bFatPercent: b.fatPercent, targetPercent: target, amount: batchAmount.valueAsNumber, unitId: batchUnit.value, outUnitId: out })
            : Engine.solveAddition({ base: a, addFatPercent: b.fatPercent, targetPercent: target, outUnitId: out });
        if (r.status === 'unreachable') {
            targetResult.replaceChildren(errorBox(`${pct(target)} is out of reach. Mixing these two gives ${pct(r.lo)} to ${pct(r.hi)} only.`));
            return;
        }
        if (r.status === 'never') {
            targetResult.replaceChildren(errorBox('The add-in is exactly at the target, so the mix only gets closer to it and never reaches it.'));
            return;
        }
        const lines = isBatch
            ? [el('p', { class: 'answer', id: 'targetAnswer', text: `Use ${amountText(r.aAmount, out)} of ${a.phrase} and ${amountText(r.bAmount, out)} of ${b.phrase}.` })]
            : [el('p', { class: 'answer', id: 'targetAnswer', text: `Add ${amountText(r.addAmount, out)} of ${b.phrase}.` })];
        lines.push(el('p', { class: 'hint', text: `Makes ${totalText(r.total, isBatch ? batchUnit.value : a.unitId)}.` }));
        lines.push(el('p', { class: 'hint', text: classLine(r.total.fatPercent) }));
        targetResult.replaceChildren(...lines);
    } catch (e) {
        targetResult.replaceChildren(errorBox(e.message));
    }
}

for (const input of [targetMode, targetPercent, targetOutUnit, batchAmount, batchUnit]) {
    input.addEventListener('input', renderTarget);
    input.addEventListener('change', renderTarget);
}

// Examples and page wiring
document.getElementById('addIngredient').addEventListener('click', () => {
    const item = addMixItem({ productId: 'whole', amount: 1, unitId: 'cup' });
    renderMix();
    item.root.querySelector('select').focus();
});
document.getElementById('exampleHalf').addEventListener('click', () => {
    setMix([
        { productId: 'halfhalf', amount: 16, unitId: 'floz' },
        { productId: 'whole', amount: 64, unitId: 'floz' },
    ]);
});
document.getElementById('exampleLabel').addEventListener('click', () => {
    setMix([
        { productId: 'heavy', amount: 1, unitId: 'cup' },
        { productId: 'whole', amount: 3, unitId: 'cup' },
    ]);
    mixItems[0].setLabel(5, 1, 'tbsp');
});
for (const link of document.querySelectorAll('.disclaimer-link')) {
    link.addEventListener('click', () => { document.getElementById('scopeDisclaimer').open = true; });
}
document.getElementById('sourceList').append(...SOURCES.map((s) => el('li', {},
    el('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.label }))));

setMix([
    { productId: 'halfhalf', amount: 16, unitId: 'floz' },
    { productId: 'whole', amount: 64, unitId: 'floz' },
]);
renderTarget();
