import { PERIODIC_TABLE } from './periodic-table.js';

const MAX_FORMULA_LENGTH = 500;
const MAX_DEPTH = 10;
const CHARGEABLE_MONATOMIC_ELEMENTS = new Set([
    'Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn',
    'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc',
    'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
    'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta',
    'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Fr', 'Ra', 'Ac',
    'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No',
    'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc',
    'Lv'
]);

function stripPhaseLabel(value) {
    return value.replace(/\s*\((?:s|l|g|aq)\)\s*$/i, '');
}

function isSingleChargeableElement(value) {
    return /^[A-Z][a-z]*$/.test(value) && CHARGEABLE_MONATOMIC_ELEMENTS.has(value);
}

function normalizeChargeText(value) {
    if (!value) return '';
    const signLast = /^(\d*)([+-])$/.exec(value);
    if (signLast) {
        return `${signLast[1] || ''}${signLast[2]}`;
    }

    const signFirst = /^([+-])(\d*)$/.exec(value);
    if (signFirst) {
        return `${signFirst[2] || ''}${signFirst[1]}`;
    }

    return value;
}

export function chargeTextToNumber(chargeText) {
    if (!chargeText) return 0;

    const match = /^(\d*)([+-])$/.exec(chargeText);
    if (!match) {
        throw new Error(`Invalid charge notation: ${chargeText}`);
    }

    const magnitude = match[1] ? parseInt(match[1], 10) : 1;
    return match[2] === '+' ? magnitude : -magnitude;
}

function splitTrailingSignedCharge(value) {
    const sign = value.slice(-1);
    const withoutSign = value.slice(0, -1);
    const digitSuffix = /^(.*?)(\d+)$/.exec(withoutSign);

    if (!digitSuffix) {
        return { formula: withoutSign, charge: sign };
    }

    const [, beforeDigits, digits] = digitSuffix;

    if (isSingleChargeableElement(beforeDigits) || /[\]}]$/.test(beforeDigits)) {
        return { formula: beforeDigits, charge: `${digits}${sign}` };
    }

    if (digits.length >= 2 && beforeDigits) {
        return {
            formula: `${beforeDigits}${digits.slice(0, -1)}`,
            charge: `${digits.slice(-1)}${sign}`
        };
    }

    return { formula: withoutSign, charge: sign };
}

export function splitFormulaCharge(formula) {
    let normalized = stripPhaseLabel(String(formula || '').trim());

    const caretCharge = /\^([0-9]*[+-]|[+-][0-9]*)$/.exec(normalized);
    if (caretCharge) {
        return {
            formula: stripPhaseLabel(normalized.slice(0, caretCharge.index)),
            charge: normalizeChargeText(caretCharge[1])
        };
    }

    const signFirstCharge = /([+-][0-9]+)$/.exec(normalized);
    if (signFirstCharge) {
        return {
            formula: stripPhaseLabel(normalized.slice(0, signFirstCharge.index)),
            charge: normalizeChargeText(signFirstCharge[1])
        };
    }

    if (/[+-]$/.test(normalized)) {
        const split = splitTrailingSignedCharge(normalized);
        return {
            formula: stripPhaseLabel(split.formula),
            charge: normalizeChargeText(split.charge)
        };
    }

    return { formula: normalized, charge: '' };
}

export function parseFormulaDetails(formula) {
    const split = splitFormulaCharge(formula);
    return {
        formula: split.formula,
        chargeText: split.charge,
        charge: chargeTextToNumber(split.charge),
        atoms: parseFormula(formula)
    };
}

function parsePositiveInteger(token, context) {
    const value = parseInt(token, 10);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${context} must be a positive integer.`);
    }
    return value;
}

/**
 * Parses a chemical formula string into an atom count map.
 * @param {string} formula 
 * @returns {Object} Map of element symbols to counts
 */
export function parseFormula(formula) {
    if (typeof formula !== 'string') throw new Error("Invalid input type.");
    if (formula.length > MAX_FORMULA_LENGTH) {
        throw new Error(`Formula too long (max ${MAX_FORMULA_LENGTH} chars).`);
    }

    // Normalize phase labels, charges, brackets, and hydrate symbols.
    let normalized = splitFormulaCharge(formula).formula;

    // Replace brackets with parens for uniform parsing
    normalized = normalized.replace(/\[|{/g, '(').replace(/\]|}/g, ')');
    // Normalize hydrate dots
    normalized = normalized.replace(/[\u00B7\u2219\u2022*]/g, '.');
    // Remove whitespace
    normalized = normalized.replace(/\s+/g, '');

    // Tokenizer regex: matches Element, Number, Open Parens, Close Parens, Hydrate dot, and a catch-all for invalid characters
    const tokenRegex = /([A-Z][a-z]*)|([0-9]+)|(\()|(\))|(\.)|([^]+?)/g;
    let match;
    const tokens = [];
    while ((match = tokenRegex.exec(normalized)) !== null) {
        if (match[6]) {
            throw new Error(`Invalid character in formula: ${match[6]}`);
        }
        tokens.push(match[0]);
    }

    let pos = 0;

    function parseGroup(depth = 0, isSubGroup = false) {
        if (depth > MAX_DEPTH) {
            throw new Error(`Formula nesting too deep (max ${MAX_DEPTH} levels).`);
        }
        
        const counts = {};
        while (pos < tokens.length) {
            const token = tokens[pos];
            
            if (token === '(') {
                pos++;
                const subCounts = parseGroup(depth + 1, true);
                if (Object.keys(subCounts).length === 0) {
                    throw new Error("Malformed formula: empty parenthesis or bracket group.");
                }
                let multiplier = 1;
                if (pos < tokens.length && /^[0-9]+$/.test(tokens[pos])) {
                    multiplier = parsePositiveInteger(tokens[pos], "Group multiplier");
                    pos++;
                }
                for (const [el, count] of Object.entries(subCounts)) {
                    counts[el] = (counts[el] || 0) + count * multiplier;
                }
            } else if (token === ')') {
                if (!isSubGroup) throw new Error("Malformed formula: unexpected closing parenthesis.");
                pos++;
                return counts;
            } else if (token === '.') {
                if (Object.keys(counts).length === 0) {
                    throw new Error("Malformed formula: hydrate dot must follow a base formula.");
                }
                pos++;
                // Handle hydrate (e.g., .3H2O or .H2O)
                let multiplier = 1;
                if (pos < tokens.length && /^[0-9]+$/.test(tokens[pos])) {
                    multiplier = parsePositiveInteger(tokens[pos], "Hydrate multiplier");
                    pos++;
                }
                const hydrateCounts = parseGroup(depth + 1, false); // Parse remainder of formula
                if (Object.keys(hydrateCounts).length === 0) {
                    throw new Error("Malformed formula: hydrate dot must be followed by a formula.");
                }
                for (const [el, count] of Object.entries(hydrateCounts)) {
                    counts[el] = (counts[el] || 0) + count * multiplier;
                }
                return counts; // Hydrate is always at the end of its group
            } else if (/^[A-Z][a-z]*$/.test(token)) {
                if (!PERIODIC_TABLE[token]) {
                    throw new Error(`Unknown element: ${token}`);
                }
                pos++;
                let count = 1;
                if (pos < tokens.length && /^[0-9]+$/.test(tokens[pos])) {
                    count = parsePositiveInteger(tokens[pos], "Element count");
                    pos++;
                }
                counts[token] = (counts[token] || 0) + count;
            } else {
                throw new Error(`Unexpected token: ${token} at position ${pos}`);
            }
        }
        
        if (isSubGroup) {
            throw new Error("Malformed formula: unclosed parenthesis or bracket.");
        }
        
        return counts;
    }

    const result = parseGroup();
    
    // Check for leftover tokens
    if (pos < tokens.length) {
        throw new Error("Malformed formula: unbalanced parentheses or brackets.");
    }
    
    if (Object.keys(result).length === 0) {
        throw new Error("Invalid formula: " + formula);
    }
    return result;
}

/**
 * Calculates the molar mass of a formula string.
 * @param {string} formula 
 * @returns {number} Molar mass in g/mol
 */
export function calculateMass(formula) {
    const counts = parseFormula(formula);
    let totalMass = 0;
    for (const [el, count] of Object.entries(counts)) {
        totalMass += PERIODIC_TABLE[el].mass * count;
    }
    
    if (totalMass > 100000) {
        throw new Error("Extreme molar mass detected (> 100,000 g/mol). This tool is optimized for standard chemical species.");
    }
    
    return totalMass;
}
