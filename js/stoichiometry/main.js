import { balanceEquation } from './equation-balancer.js';
import { calculateMass, parseFormula } from './formula-parser.js';
import { ReactionState } from './stoichiometry-core.js';
import { PERIODIC_TABLE } from './periodic-table.js';

const CONFIG = {
    ELEMENT_COLORS: {
        'H': '#ffffff', 'He': '#d9ffff', 'Li': '#cc80ff', 'Be': '#c2ff00', 'B': '#ffb5b5',
        'C': '#909090', 'N': '#3050f8', 'O': '#ff0d0d', 'F': '#90e050', 'Ne': '#b3e3f5',
        'Na': '#ab5cf2', 'Mg': '#8aff00', 'Al': '#bfa6a6', 'Si': '#f0c8a0', 'P': '#ff8000',
        'S': '#ffff30', 'Cl': '#1ff01f', 'Ar': '#80d1e3', 'K': '#8f40d4', 'Ca': '#3dff00',
        'Fe': '#e06633', 'Cu': '#c88033', 'Zn': '#7d80b0', 'Br': '#a62929', 'I': '#940094'
    },
    MODES: {
        LAB: "Laboratory Mix Mode",
        TARGET: "Target Yield Mode"
    },
    AVOGADRO: 6.02214076e23
};

document.addEventListener('DOMContentLoaded', () => {
    const UI = {
        equationInput: document.getElementById('equationInput'),
        balanceBtn: document.getElementById('balanceBtn'),
        equationError: document.getElementById('equationError'),
        resultsPanel: document.getElementById('resultsPanel'),
        sidebarPanel: document.getElementById('sidebarPanel'),
        balancedEquationDisplay: document.getElementById('balancedEquationDisplay'),
        stoichTableBody: document.getElementById('stoichTableBody'),
        equationStatus: document.getElementById('equationStatus'),
        limitingReactantDisplay: document.getElementById('limitingReactantDisplay'),
        totalMassDisplay: document.getElementById('totalMassDisplay'),
        compositionLegend: document.getElementById('compositionLegend'),
        liveTokenPreview: document.getElementById('liveTokenPreview'),
        copyBtn: document.getElementById('copyBtn'),
        activeModeBadge: document.getElementById('activeModeBadge'),
        conservationStatus: document.getElementById('conservationStatus'),
        totalAtomCount: document.getElementById('totalAtomCount'),
        exampleBtns: document.querySelectorAll('[data-example]')
    };

    let currentState = null;

    function getNonNegativeInputValue(input) {
        const parsed = parseFloat(input.value);
        if (!Number.isFinite(parsed)) {
            return 0;
        }

        if (parsed < 0) {
            input.value = '0';
            return 0;
        }

        return parsed;
    }

    function getElementColor(symbol) {
        return CONFIG.ELEMENT_COLORS[symbol] || '#cccccc';
    }

    UI.equationInput.addEventListener('input', () => {
        const val = UI.equationInput.value.trim();
        UI.liveTokenPreview.textContent = '';
        if (!val) return;

        try {
            const symbols = val.match(/[A-Z][a-z]*/g) || [];
            const uniqueSymbols = Array.from(new Set(symbols));
            
            uniqueSymbols.forEach(sym => {
                if (PERIODIC_TABLE[sym]) {
                    const chip = document.createElement('span');
                    chip.className = 'token-chip';
                    
                    const symSpan = document.createElement('span');
                    symSpan.style.color = getElementColor(sym);
                    symSpan.textContent = sym;
                    
                    const nameText = document.createTextNode(`: ${PERIODIC_TABLE[sym].name}`);
                    
                    chip.append(symSpan, nameText);
                    UI.liveTokenPreview.appendChild(chip);
                }
            });
        } catch (e) {}
    });

    UI.exampleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            UI.equationInput.value = btn.dataset.example;
            UI.equationInput.dispatchEvent(new Event('input'));
            UI.balanceBtn.click();
        });
    });

    UI.copyBtn.addEventListener('click', () => {
        const text = UI.balancedEquationDisplay.innerText;
        navigator.clipboard.writeText(text).then(() => {
            const originalContent = UI.copyBtn.innerHTML;
            UI.copyBtn.textContent = 'COPIED';
            setTimeout(() => UI.copyBtn.innerHTML = originalContent, 2000);
        });
    });

    function formatSubscripts(formula) {
        return formula.replace(/(?<=[A-Za-z)\]])\d+/g, match => {
            return match.split('').map(digit => {
                const code = digit.charCodeAt(0);
                return (code >= 48 && code <= 57) ? String.fromCharCode(code + 8272) : digit;
            }).join('');
        });
    }

    function createCompositionBar(formula) {
        try {
            const counts = parseFormula(formula);
            const mass = calculateMass(formula);
            const container = document.createElement('div');
            container.className = 'composition-container';

            Object.keys(counts).forEach(el => {
                const elMass = PERIODIC_TABLE[el].mass * counts[el];
                const percentage = (elMass / mass) * 100;
                
                const segment = document.createElement('div');
                segment.className = 'comp-segment';
                segment.style.width = `${percentage}%`;
                segment.style.backgroundColor = getElementColor(el);
                segment.title = `${el}: ${percentage.toFixed(1)}%`;
                container.appendChild(segment);
            });

            return container;
        } catch (e) {
            return document.createElement('div');
        }
    }

    function updateLegend(speciesArray) {
        const elementsInReaction = new Set();
        speciesArray.forEach(s => {
            try {
                const counts = parseFormula(s.formula);
                Object.keys(counts).forEach(el => elementsInReaction.add(el));
            } catch(e) {}
        });

        UI.compositionLegend.innerHTML = '';
        Array.from(elementsInReaction).sort().forEach(el => {
            if (!PERIODIC_TABLE[el]) return;
            const item = document.createElement('div');
            item.className = 'legend-item';

            const swatch = document.createElement('div');
            swatch.className = 'legend-swatch';
            swatch.style.backgroundColor = getElementColor(el);

            const nameSpan = document.createElement('span');
            nameSpan.textContent = `${el} - ${PERIODIC_TABLE[el].name}`;

            item.append(swatch, nameSpan);
            UI.compositionLegend.appendChild(item);
        });
    }

    function safeFixed(val, digits) {
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return '';
        return val.toFixed(digits);
    }

    function buildTable(species) {
        try {
            UI.stoichTableBody.innerHTML = '';
            species.forEach((s, index) => {
                if (!s) return;
                const tr = document.createElement('tr');
                tr.className = 'row-item';
                
                const tdFormula = document.createElement('td');
                const label = document.createElement('div');
                label.className = `formula-label ${s.isReactant ? 'reactant' : 'product'}`;
                label.textContent = formatSubscripts(s.formula || '');
                tdFormula.appendChild(label);
                
                const barWrapper = document.createElement('div');
                barWrapper.className = 'comp-bar-wrapper';
                if (s.formula) barWrapper.appendChild(createCompositionBar(s.formula));
                tdFormula.appendChild(barWrapper);

                const tdCoef = document.createElement('td');
                tdCoef.textContent = s.coef || 0;

                const tdMassVal = document.createElement('td');
                tdMassVal.className = 'td-mono';
                tdMassVal.textContent = safeFixed(s.molarMass, 4);

                const tdMoles = document.createElement('td');
                const moleInput = document.createElement('input');
                moleInput.type = 'number';
                moleInput.className = 'main-input input-moles';
                moleInput.dataset.index = index;
                moleInput.step = 'any';
                moleInput.min = '0';
                moleInput.placeholder = '0';
                moleInput.setAttribute('aria-label', `Moles of ${s.formula}`);
                tdMoles.appendChild(moleInput);

                const tdMass = document.createElement('td');
                const massInput = document.createElement('input');
                massInput.type = 'number';
                massInput.className = 'main-input input-mass';
                massInput.dataset.index = index;
                massInput.step = 'any';
                massInput.min = '0';
                massInput.placeholder = '0';
                massInput.setAttribute('aria-label', `Mass in grams of ${s.formula}`);
                tdMass.appendChild(massInput);

                const tdExcess = document.createElement('td');
                tdExcess.className = 'excess-cell excess-cell--idle';
                tdExcess.textContent = '--';

                tr.append(tdFormula, tdCoef, tdMassVal, tdMoles, tdMass, tdExcess);
                UI.stoichTableBody.appendChild(tr);
            });

            document.querySelectorAll('.input-moles').forEach(input => {
                input.addEventListener('input', (e) => {
                    if (e.isTrusted && currentState) {
                        const idx = parseInt(e.target.dataset.index, 10);
                        const val = getNonNegativeInputValue(e.target);
                        currentState.updateMoles(idx, val);
                    }
                });
            });

            document.querySelectorAll('.input-mass').forEach(input => {
                input.addEventListener('input', (e) => {
                    if (e.isTrusted && currentState) {
                        const idx = parseInt(e.target.dataset.index, 10);
                        const val = getNonNegativeInputValue(e.target);
                        currentState.updateMass(idx, val);
                    }
                });
            });
            
            updateTable(species);
        } catch (err) {
            console.error('[Stoichiometry] buildTable Error:', err);
            showError("UI Error: Failed to render analysis table.");
        }
    }

    function updateTable(species) {
        try {
            const moleInputs = document.querySelectorAll('.input-moles');
            const massInputs = document.querySelectorAll('.input-mass');
            const excessCells = document.querySelectorAll('.excess-cell');
            const rows = document.querySelectorAll('.row-item');
            
            if (!moleInputs.length || !massInputs.length || moleInputs.length !== species.length) return;

            let limitingIdx = -1;
            let totalMassReactants = 0;
            let totalMassProducts = 0;
            let currentTotalAtoms = 0;

            species.forEach((s, index) => {
                if (!s || !moleInputs[index] || !massInputs[index]) return;

                if (s.isLimiting) limitingIdx = index;

                const displayMoles = s.isReactant ? s.inputMoles : s.resultMoles;
                const displayMass = s.isReactant ? s.inputMass : s.resultMass;

                if (document.activeElement !== moleInputs[index]) {
                    moleInputs[index].value = (displayMoles && displayMoles !== 0) ? safeFixed(displayMoles, 4) : '';
                }
                if (document.activeElement !== massInputs[index]) {
                    massInputs[index].value = (displayMass && displayMass !== 0) ? safeFixed(displayMass, 4) : '';
                }

                if (s.isReactant) totalMassReactants += (s.inputMass || 0);
                else totalMassProducts += (s.resultMass || 0);

                if (s.inputMoles > 0) {
                    try {
                        const counts = parseFormula(s.formula);
                        const sumAtoms = Object.values(counts).reduce((a,b)=>a+b, 0);
                        currentTotalAtoms += sumAtoms * s.inputMoles * CONFIG.AVOGADRO;
                    } catch(e) {}
                }

                if (s.isReactant && s.inputMoles > 0) {
                    if (s.isLimiting) {
                        excessCells[index].textContent = "LIMITING";
                        excessCells[index].className = 'excess-cell excess-cell--limiting';
                    } else if (s.excessMoles > 0.00001) {
                        excessCells[index].textContent = `+${safeFixed(s.excessMoles * s.molarMass, 2)} g`;
                        excessCells[index].className = 'excess-cell excess-cell--excess';
                    } else {
                        excessCells[index].textContent = "CONSUMED";
                        excessCells[index].className = 'excess-cell excess-cell--consumed';
                    }
                } else {
                    excessCells[index].textContent = "--";
                    excessCells[index].className = 'excess-cell excess-cell--idle';
                }

                if (rows[index]) {
                    rows[index].style.borderLeft = s.isLimiting ? '4px solid var(--accent-warning)' : 'none';
                    rows[index].classList.toggle('limiting-row', s.isLimiting);
                }
            });

            if (limitingIdx !== -1 && species[limitingIdx]) {
                UI.limitingReactantDisplay.textContent = formatSubscripts(species[limitingIdx].formula || '');
                UI.limitingReactantDisplay.style.color = 'var(--accent-warning)';
                UI.limitingReactantDisplay.style.cursor = 'pointer';
                UI.limitingReactantDisplay.onclick = () => {
                    rows[limitingIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    rows[limitingIdx]?.classList.add('animate-pulse');
                    setTimeout(() => rows[limitingIdx]?.classList.remove('animate-pulse'), 2000);
                };
            } else {
                UI.limitingReactantDisplay.textContent = '--';
                UI.limitingReactantDisplay.style.color = 'var(--text-muted)';
                UI.limitingReactantDisplay.onclick = null;
            }

            UI.totalMassDisplay.textContent = totalMassProducts > 0 ? safeFixed(totalMassProducts, 2) + ' g' : '--';
            UI.totalAtomCount.textContent = currentTotalAtoms > 0 ? currentTotalAtoms.toExponential(2) : '--';

            if (totalMassReactants > 0) {
                const totalExcessMass = species
                    .filter(s => s.isReactant)
                    .reduce((acc, s) => acc + (s.excessMoles * s.molarMass), 0);

                const massOut = totalMassProducts + totalExcessMass;
                const massDiff = Math.abs(totalMassReactants - massOut);
                const relDiff = totalMassReactants > 0 ? massDiff / totalMassReactants : massDiff;

                if (relDiff < 1e-6) {
                    UI.conservationStatus.textContent = 'VALIDATED';
                    UI.conservationStatus.className = 'status-badge ok';
                    UI.conservationStatus.title = `Mass In: ${totalMassReactants.toFixed(4)}g, Mass Out: ${massOut.toFixed(4)}g`;
                } else {
                    UI.conservationStatus.textContent = 'MISMATCH';
                    UI.conservationStatus.className = 'status-badge err';
                    UI.conservationStatus.title = `Mass In: ${totalMassReactants.toFixed(4)}g, Mass Out: ${massOut.toFixed(4)}g (Diff: ${massDiff.toFixed(4)}g)`;
                }
            } else {
                UI.conservationStatus.textContent = '--';
                UI.conservationStatus.className = 'status-badge';
                UI.conservationStatus.title = '';
            }

            const isTargetMode = Array.from(moleInputs).some((input, i) => document.activeElement === input && !species[i].isReactant) ||
                                 Array.from(massInputs).some((input, i) => document.activeElement === input && !species[i].isReactant);
            
            UI.activeModeBadge.textContent = isTargetMode ? CONFIG.MODES.TARGET : CONFIG.MODES.LAB;

        } catch (err) {
            console.error('[Stoichiometry] updateTable Error:', err);
        }
    }

    function setStatus(status, text) {
        if (UI.equationStatus) {
            const badge = document.createElement('span');
            badge.className = `status-badge ${status}`;
            badge.textContent = text;
            UI.equationStatus.textContent = '';
            UI.equationStatus.appendChild(badge);
        }
    }

    function showError(msg) {
        UI.equationError.textContent = msg;
        UI.equationError.classList.remove('hidden');
        UI.resultsPanel.classList.add('hidden');
        UI.sidebarPanel.classList.add('hidden');
        setStatus('err', 'ERROR');
    }

    UI.balanceBtn.addEventListener('click', () => {
        const input = UI.equationInput.value.trim();
        if (!input) return;

        try {
            UI.equationError.classList.add('hidden');
            
            let speciesArray = [];
            let headerReactants = '';
            let headerProducts = '';

            const isEquation = /->|=>|={1,2}|➔|→/.test(input);

            if (isEquation) {
                const result = balanceEquation(input);
                if (!result || !result.coefficients) throw new Error("Solver failed.");

                setStatus('ok', 'BALANCED');

                result.reactants.forEach((formula, idx) => {
                    speciesArray.push({
                        formula,
                        coef: result.coefficients[idx],
                        molarMass: calculateMass(formula),
                        isReactant: true
                    });
                });

                result.products.forEach((formula, idx) => {
                    speciesArray.push({
                        formula,
                        coef: result.coefficients[result.reactants.length + idx],
                        molarMass: calculateMass(formula),
                        isReactant: false
                    });
                });

                headerReactants = result.reactants.map((f, i) => `${result.coefficients[i] === 1 ? '' : result.coefficients[i] + ' '}${formatSubscripts(f)}`).join(' + ');
                headerProducts = result.products.map((f, i) => `${result.coefficients[result.reactants.length + i] === 1 ? '' : result.coefficients[result.reactants.length + i] + ' '}${formatSubscripts(f)}`).join(' + ');

                UI.balancedEquationDisplay.textContent = '';
                const reactantSpan = document.createElement('span');
                reactantSpan.style.color = 'var(--accent-success)';
                reactantSpan.textContent = headerReactants;

                const arrowSpan = document.createElement('span');
                arrowSpan.style.color = 'var(--text-muted)';
                arrowSpan.textContent = ' \u27A4 ';

                const productSpan = document.createElement('span');
                productSpan.style.color = 'var(--accent-it)';
                productSpan.textContent = headerProducts;

                UI.balancedEquationDisplay.append(reactantSpan, arrowSpan, productSpan);

                const warningEl = document.getElementById('underDeterminedWarning');
                if (warningEl) {
                    if (result.freeDimensions && result.freeDimensions > 1) {
                        warningEl.classList.remove('hidden');
                    } else {
                        warningEl.classList.add('hidden');
                    }
                }
            } else {
                setStatus('ok', 'FORMULA ANALYZED');
                speciesArray.push({
                    formula: input,
                    coef: 1,
                    molarMass: calculateMass(input),
                    isReactant: true
                });
                UI.balancedEquationDisplay.textContent = '';
                const formulaSpan = document.createElement('span');
                formulaSpan.style.color = 'var(--text-primary)';
                formulaSpan.textContent = formatSubscripts(input);
                UI.balancedEquationDisplay.appendChild(formulaSpan);

                const warningEl = document.getElementById('underDeterminedWarning');
                if (warningEl) warningEl.classList.add('hidden');
            }
            
            currentState = new ReactionState(speciesArray);
            updateLegend(speciesArray);
            buildTable(speciesArray);
            currentState.subscribe(updateTable);
            
            UI.resultsPanel.classList.remove('hidden');
            UI.sidebarPanel.classList.remove('hidden');

        } catch (err) {
            showError(err.message);
        }
    });

    UI.equationInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') UI.balanceBtn.click();
    });

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('help-chip')) {
            const isVisible = e.target.getAttribute('aria-expanded') === 'true';
            // Close all others
            document.querySelectorAll('.help-chip').forEach(c => c.setAttribute('aria-expanded', 'false'));
            e.target.setAttribute('aria-expanded', !isVisible);
        } else {
            document.querySelectorAll('.help-chip').forEach(c => c.setAttribute('aria-expanded', 'false'));
        }
    });
});
