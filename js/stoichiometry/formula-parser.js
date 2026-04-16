import { PERIODIC_TABLE } from './periodic-table.js';

const MAX_FORMULA_LENGTH = 500;
const MAX_DEPTH = 10;

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

    // Normalize brackets and hydrate symbols
    let normalized = formula.trim();
    
    // Strip phase labels (s, l, g, aq)
    normalized = normalized.replace(/\s*\((?:s|l|g|aq)\)\s*$/i, '');
    // Strip charges (+, -, 2+, 3-, ^2+, ^3-, +2, -3)
    normalized = normalized.replace(/\^?(?:[0-9]+[+-]|[+-][0-9]*|[+-])$/, '');
    // Strip phase labels again in case it was formatted like Na+(aq)
    normalized = normalized.replace(/\s*\((?:s|l|g|aq)\)\s*$/i, '');

    // Replace brackets with parens for uniform parsing
    normalized = normalized.replace(/\[|{/g, '(').replace(/\]|}/g, ')');
    // Normalize hydrate dots
    normalized = normalized.replace(/·|\*/g, '.');
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
                let multiplier = 1;
                if (pos < tokens.length && /^[0-9]+$/.test(tokens[pos])) {
                    multiplier = parseInt(tokens[pos], 10);
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
                pos++;
                // Handle hydrate (e.g., .3H2O or .H2O)
                let multiplier = 1;
                if (pos < tokens.length && /^[0-9]+$/.test(tokens[pos])) {
                    multiplier = parseInt(tokens[pos], 10);
                    pos++;
                }
                const hydrateCounts = parseGroup(depth + 1, false); // Parse remainder of formula
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
                    count = parseInt(tokens[pos], 10);
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
