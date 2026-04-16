import { parseFormula } from './formula-parser.js';

function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    return b === 0 ? a : gcd(b, a % b);
}

function lcm(a, b) {
    if (a === 0 || b === 0) return 0;
    return Math.abs((a * b) / gcd(a, b));
}

function frac(n, d = 1) {
    if (d === 0) throw new Error("Division by zero in fraction");
    let sign = (n < 0) ^ (d < 0) ? -1 : 1;
    n = Math.abs(Math.round(n));
    d = Math.abs(Math.round(d));
    let g = gcd(n, d);
    return { n: sign * (n / g), d: d / g };
}

function fAdd(a, b) { return frac(a.n * b.d + b.n * a.d, a.d * b.d); }
function fSub(a, b) { return frac(a.n * b.d - b.n * a.d, a.d * b.d); }
function fMul(a, b) { return frac(a.n * b.n, a.d * b.d); }
function fDiv(a, b) { return frac(a.n * b.d, a.d * b.n); }

const MAX_SPECIES = 20;
const MAX_ELEMENTS = 20;
const MAX_COEFFICIENT = 10000;

export function balanceEquation(equationStr) {
    // 1. Parse equation string
    const sides = equationStr.split(/\s*(?:->|=>|={1,2}|➔|→)\s*/);
    if (sides.length !== 2) throw new Error("Invalid equation format. Use 'Reactants -> Products' (e.g., H2 + O2 -> H2O).");
    
    const parseSide = (sideStr) => sideStr.split('+').map(s => s.trim()).filter(s => s.length > 0);
    
    const reactantStrs = parseSide(sides[0]).map(s => s.replace(/^[0-9\s]+/, ''));
    const productStrs = parseSide(sides[1]).map(s => s.replace(/^[0-9\s]+/, ''));
    
    if (reactantStrs.length === 0 || productStrs.length === 0) {
        throw new Error("Missing reactants or products. Ensure both sides of the arrow contain species.");
    }

    // Check for redundant species (same formula on both sides)
    for (const r of reactantStrs) {
        if (productStrs.includes(r)) {
            throw new Error(`Redundant species detected: '${r}' appears on both sides. Please simplify the equation before balancing.`);
        }
    }
    
    const speciesStrs = [...reactantStrs, ...productStrs];
    if (speciesStrs.length > MAX_SPECIES) throw new Error(`Reaction is too complex (max ${MAX_SPECIES} species allowed).`);

    const speciesParsed = speciesStrs.map(parseFormula);
    
    // 2. Build unique elements set
    const elements = new Set();
    speciesParsed.forEach(sp => {
        Object.keys(sp).forEach(el => elements.add(el));
    });
    const elementList = Array.from(elements);
    if (elementList.length > MAX_ELEMENTS) throw new Error(`Reaction contains too many unique elements (max ${MAX_ELEMENTS} allowed).`);
    
    // Check if an element is missing on one side
    const rElements = new Set();
    reactantStrs.map(parseFormula).forEach(sp => Object.keys(sp).forEach(el => rElements.add(el)));
    const pElements = new Set();
    productStrs.map(parseFormula).forEach(sp => Object.keys(sp).forEach(el => pElements.add(el)));
    
    for (let el of elementList) {
        if (!rElements.has(el) || !pElements.has(el)) {
            throw new Error(`Equation cannot be balanced. Element '${el}' is present on only one side of the reaction.`);
        }
    }
    
    // 3. Build Matrix (Rows = elements, Columns = species)
    let matrix = [];
    for (let i = 0; i < elementList.length; i++) {
        let row = [];
        let el = elementList[i];
        for (let j = 0; j < speciesParsed.length; j++) {
            let count = speciesParsed[j][el] || 0;
            // Products have negative coefficients in the conservation matrix
            if (j >= reactantStrs.length) count = -count;
            row.push(frac(count));
        }
        matrix.push(row);
    }
    
    // 4. Gaussian Elimination to Reduced Row Echelon Form (RREF)
    let rows = matrix.length;
    let cols = matrix[0].length;
    let lead = 0;
    
    for (let r = 0; r < rows; r++) {
        if (cols <= lead) break;
        let i = r;
        while (matrix[i][lead].n === 0) {
            i++;
            if (i === rows) {
                i = r;
                lead++;
                if (cols === lead) break;
            }
        }
        if (cols <= lead) break;
        
        // Swap rows i and r
        let temp = matrix[i];
        matrix[i] = matrix[r];
        matrix[r] = temp;
        
        // Normalize pivot row
        let val = matrix[r][lead];
        for (let j = 0; j < cols; j++) {
            matrix[r][j] = fDiv(matrix[r][j], val);
        }
        
        // Eliminate other rows
        for (let i = 0; i < rows; i++) {
            if (i === r) continue;
            let val = matrix[i][lead];
            for (let j = 0; j < cols; j++) {
                matrix[i][j] = fSub(matrix[i][j], fMul(val, matrix[r][j]));
            }
        }
        lead++;
    }
    
    // 5. Extract Null Space (coefficients)
    let pivotCols = [];
    let freeCols = [];
    for(let j = 0; j < cols; j++) {
        let isPivot = false;
        for(let i = 0; i < rows; i++) {
            if(matrix[i][j].n !== 0) {
                let isOnlyNonZero = true;
                for(let k = 0; k < rows; k++) {
                    if(k !== i && matrix[k][j].n !== 0) {
                        isOnlyNonZero = false;
                        break;
                    }
                }
                if(matrix[i][j].n === 1 && matrix[i][j].d === 1 && isOnlyNonZero) {
                    let isFirst = true;
                    for(let k = 0; k < j; k++) {
                        if(matrix[i][k].n !== 0) {
                            isFirst = false; break;
                        }
                    }
                    if(isFirst) {
                        isPivot = true;
                        pivotCols.push(j);
                        break;
                    }
                }
            }
        }
        if(!isPivot) freeCols.push(j);
    }
    
    if (freeCols.length === 0) {
        throw new Error("Equation cannot be balanced (only trivial solution). Check if the reaction is chemically possible.");
    }
    
    // Set free variables to 1
    let coefs = new Array(cols).fill(frac(0));
    for (let fCol of freeCols) {
        coefs[fCol] = frac(1);
    }
    
    // Back-substitute pivot variables
    for (let i = 0; i < rows; i++) {
        let pivotCol = -1;
        for (let j = 0; j < cols; j++) {
            if (matrix[i][j].n !== 0) {
                pivotCol = j;
                break;
            }
        }
        if (pivotCol !== -1 && !freeCols.includes(pivotCol)) {
            let sum = frac(0);
            for (let fCol of freeCols) {
                sum = fAdd(sum, matrix[i][fCol]);
            }
            coefs[pivotCol] = fSub(frac(0), sum);
        }
    }
    
    // 6. Scale to simplest integers
    let commonDenom = 1;
    for (let c of coefs) {
        commonDenom = lcm(commonDenom, c.d);
    }
    
    let intCoefs = coefs.map(c => (c.n * commonDenom) / c.d);
    
    if (intCoefs.some(c => c <= 0)) {
        throw new Error("Equation cannot be balanced with positive integers. This usually means the reaction is impossible or under-determined.");
    }
    
    let overallGcd = intCoefs[0];
    for (let i = 1; i < intCoefs.length; i++) {
        overallGcd = gcd(overallGcd, intCoefs[i]);
    }
    intCoefs = intCoefs.map(c => c / overallGcd);

    // Limit extreme coefficients
    if (intCoefs.some(c => c > MAX_COEFFICIENT)) {
        throw new Error(`Equation balancing resulted in extremely large coefficients (> ${MAX_COEFFICIENT}). The reaction stoichiometry may be non-standard or invalid.`);
    }
    
    return {
        equation: equationStr,
        reactants: reactantStrs,
        products: productStrs,
        coefficients: intCoefs,
        freeDimensions: freeCols.length
    };
}