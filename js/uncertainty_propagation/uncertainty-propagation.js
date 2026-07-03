/* ============================================
   UNCERTAINTY / ERROR PROPAGATION CALCULATOR
   ============================================
   Self-contained vanilla-JS engine:
     - recursive-descent expression parser
     - symbolic differentiation (for the "show the math" panel)
     - numeric central-difference fallback for partials whose symbolic
       form cannot be evaluated at the given point
     - first-order Taylor variance propagation (independent variables)
     - Monte Carlo cross-check (Box-Muller normal / uniform sampling)

   No external dependencies. See uncertainty-propagation.html for the DOM.
   ============================================ */

// ============================================================
// AST node constructors
// ============================================================
const num = (v) => ({ type: 'num', value: v });
const vr  = (name) => ({ type: 'var', name });
const kst = (name) => ({ type: 'const', name });
const neg = (arg) => ({ type: 'neg', arg });
const call = (name, args) => ({ type: 'call', name, args });
const bin = (op, left, right) => ({ type: 'binary', op, left, right });
const add = (a, b) => bin('+', a, b);
const sub = (a, b) => bin('-', a, b);
const mul = (a, b) => bin('*', a, b);
const div = (a, b) => bin('/', a, b);
const pow = (a, b) => bin('^', a, b);

// Reserved constants and the function library
const CONSTANTS = { pi: Math.PI, e: Math.E };
const FUNCS = {
    exp: Math.exp,
    ln: Math.log,
    log10: Math.log10,
    log2: Math.log2,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    sign: Math.sign,
};

// ============================================================
// Tokenizer
// ============================================================
function tokenize(src) {
    const tokens = [];
    let i = 0;
    const isDigit = (c) => c >= '0' && c <= '9';
    const isIdStart = (c) => /[A-Za-z_]/.test(c);
    const isIdPart = (c) => /[A-Za-z0-9_]/.test(c);

    while (i < src.length) {
        const c = src[i];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

        if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
            let j = i + 1;
            // one decimal point per number; "1.2.3" must not parse as 1.2
            let seenDot = c === '.';
            while (j < src.length && (isDigit(src[j]) || (src[j] === '.' && !seenDot))) {
                if (src[j] === '.') seenDot = true;
                j++;
            }
            // scientific notation
            if (src[j] === 'e' || src[j] === 'E') {
                let k = j + 1;
                if (src[k] === '+' || src[k] === '-') k++;
                if (isDigit(src[k])) { j = k + 1; while (j < src.length && isDigit(src[j])) j++; }
            }
            const text = src.slice(i, j);
            const value = parseFloat(text);
            if (!isFinite(value)) throw new Error(`Invalid number "${text}"`);
            tokens.push({ type: 'num', value });
            i = j;
            continue;
        }

        if (isIdStart(c)) {
            let j = i + 1;
            while (j < src.length && isIdPart(src[j])) j++;
            tokens.push({ type: 'ident', name: src.slice(i, j) });
            i = j;
            continue;
        }

        if ('+-*/^(),'.includes(c)) {
            tokens.push({ type: 'op', value: c });
            i++;
            continue;
        }

        throw new Error(`Unexpected character "${c}"`);
    }
    tokens.push({ type: 'eof' });
    return tokens;
}

// ============================================================
// Parser (recursive descent)
//   expr   := term (('+'|'-') term)*
//   term   := factor (('*'|'/') factor)*
//   factor := ('-'|'+') factor | power
//   power  := primary ('^' factor)?          (right-associative)
//   primary:= num | const | ident | ident '(' args ')' | '(' expr ')'
// ============================================================
function parse(src) {
    const tokens = tokenize(src);
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const isOp = (v) => peek().type === 'op' && peek().value === v;
    const eat = (v) => {
        if (!isOp(v)) throw new Error(`Expected "${v}"`);
        pos++;
    };

    function parseExpr() {
        let node = parseTerm();
        while (isOp('+') || isOp('-')) {
            const op = next().value;
            node = bin(op, node, parseTerm());
        }
        return node;
    }
    function parseTerm() {
        let node = parseFactor();
        while (isOp('*') || isOp('/')) {
            const op = next().value;
            node = bin(op, node, parseFactor());
        }
        return node;
    }
    function parseFactor() {
        if (isOp('-')) { next(); return neg(parseFactor()); }
        if (isOp('+')) { next(); return parseFactor(); }
        return parsePower();
    }
    function parsePower() {
        const base = parsePrimary();
        if (isOp('^')) {
            next();
            return pow(base, parseFactor()); // right-assoc, allows x^-2
        }
        return base;
    }
    function parsePrimary() {
        const t = peek();
        if (t.type === 'num') { next(); return num(t.value); }
        if (isOp('(')) { next(); const e = parseExpr(); eat(')'); return e; }
        if (t.type === 'ident') {
            next();
            if (isOp('(')) {
                next();
                const args = [];
                if (!isOp(')')) {
                    args.push(parseExpr());
                    while (isOp(',')) { next(); args.push(parseExpr()); }
                }
                eat(')');
                return call(t.name, args);
            }
            if (Object.prototype.hasOwnProperty.call(CONSTANTS, t.name)) return kst(t.name);
            return vr(t.name);
        }
        throw new Error('Unexpected end of expression');
    }

    const node = parseExpr();
    if (peek().type !== 'eof') throw new Error('Unexpected trailing input');
    return node;
}

// ============================================================
// Evaluation
// ============================================================
function evaluate(node, scope) {
    switch (node.type) {
        case 'num': return node.value;
        case 'const': return CONSTANTS[node.name];
        case 'var': {
            const v = scope[node.name];
            if (v === undefined) throw new Error(`Unknown variable "${node.name}"`);
            return v;
        }
        case 'neg': return -evaluate(node.arg, scope);
        case 'binary': {
            const a = evaluate(node.left, scope);
            const b = evaluate(node.right, scope);
            switch (node.op) {
                case '+': return a + b;
                case '-': return a - b;
                case '*': return a * b;
                case '/': return a / b;
                case '^': return Math.pow(a, b);
            }
            break;
        }
        case 'call': {
            const fn = FUNCS[node.name];
            if (!fn) throw new Error(`Unknown function "${node.name}()"`);
            return fn(...node.args.map((a) => evaluate(a, scope)));
        }
    }
    throw new Error('Cannot evaluate expression');
}

// ============================================================
// Variable extraction
// ============================================================
function collectVars(node, out = []) {
    switch (node.type) {
        case 'var': if (!out.includes(node.name)) out.push(node.name); break;
        case 'neg': collectVars(node.arg, out); break;
        case 'binary': collectVars(node.left, out); collectVars(node.right, out); break;
        case 'call': node.args.forEach((a) => collectVars(a, out)); break;
    }
    return out;
}

function dependsOn(node, name) {
    switch (node.type) {
        case 'var': return node.name === name;
        case 'neg': return dependsOn(node.arg, name);
        case 'binary': return dependsOn(node.left, name) || dependsOn(node.right, name);
        case 'call': return node.args.some((a) => dependsOn(a, name));
        default: return false;
    }
}

// ============================================================
// Symbolic differentiation
// ============================================================
function differentiate(node, x) {
    switch (node.type) {
        case 'num':
        case 'const':
            return num(0);
        case 'var':
            return num(node.name === x ? 1 : 0);
        case 'neg':
            return neg(differentiate(node.arg, x));
        case 'binary': {
            const { op, left: a, right: b } = node;
            const da = differentiate(a, x);
            const db = differentiate(b, x);
            if (op === '+') return add(da, db);
            if (op === '-') return sub(da, db);
            if (op === '*') return add(mul(da, b), mul(a, db)); // product rule
            if (op === '/') return div(sub(mul(da, b), mul(a, db)), pow(b, num(2))); // quotient rule
            if (op === '^') {
                const bDep = dependsOn(a, x);
                const pDep = dependsOn(b, x);
                if (!bDep && !pDep) return num(0);
                if (bDep && !pDep) {
                    // u^n : n * u^(n-1) * u'
                    return mul(mul(b, pow(a, sub(b, num(1)))), da);
                }
                if (!bDep && pDep) {
                    // a^u : a^u * ln(a) * u'
                    return mul(mul(pow(a, b), call('ln', [a])), db);
                }
                // f^g : f^g * (g' * ln(f) + g * f'/f)
                return mul(pow(a, b), add(mul(db, call('ln', [a])), mul(b, div(da, a))));
            }
            break;
        }
        case 'call': {
            const u = node.args[0];
            const du = differentiate(u, x);
            const rule = CHAIN[node.name];
            if (!rule) throw new Error(`No symbolic rule for ${node.name}()`);
            return mul(rule(u), du); // chain rule
        }
    }
    throw new Error('Cannot differentiate expression');
}

// outer-derivative (f'(u)) for each supported function
const CHAIN = {
    exp: (u) => call('exp', [u]),
    ln: (u) => div(num(1), u),
    log10: (u) => div(num(1), mul(u, num(Math.LN10))),
    log2: (u) => div(num(1), mul(u, num(Math.LN2))),
    sqrt: (u) => div(num(1), mul(num(2), call('sqrt', [u]))),
    cbrt: (u) => div(num(1), mul(num(3), pow(call('cbrt', [u]), num(2)))),
    sin: (u) => call('cos', [u]),
    cos: (u) => neg(call('sin', [u])),
    tan: (u) => div(num(1), pow(call('cos', [u]), num(2))),
    asin: (u) => div(num(1), call('sqrt', [sub(num(1), pow(u, num(2)))])),
    acos: (u) => neg(div(num(1), call('sqrt', [sub(num(1), pow(u, num(2)))]))),
    atan: (u) => div(num(1), add(num(1), pow(u, num(2)))),
    sinh: (u) => call('cosh', [u]),
    cosh: (u) => call('sinh', [u]),
    tanh: (u) => div(num(1), pow(call('cosh', [u]), num(2))),
    abs: (u) => call('sign', [u]),
    sign: () => num(0),
};

// ============================================================
// Simplification
// ============================================================
function structEqual(a, b) {
    if (a.type !== b.type) return false;
    switch (a.type) {
        case 'num': return a.value === b.value;
        case 'var':
        case 'const': return a.name === b.name;
        case 'neg': return structEqual(a.arg, b.arg);
        case 'binary': return a.op === b.op && structEqual(a.left, b.left) && structEqual(a.right, b.right);
        case 'call': return a.name === b.name && a.args.length === b.args.length &&
            a.args.every((x, i) => structEqual(x, b.args[i]));
        default: return false;
    }
}
const isNum = (n, v) => n.type === 'num' && (v === undefined || n.value === v);

function simplifyOnce(node) {
    if (node.type === 'neg') {
        const a = simplifyOnce(node.arg);
        if (isNum(a)) return num(-a.value);
        if (a.type === 'neg') return a.arg;
        return neg(a);
    }
    if (node.type === 'call') {
        return call(node.name, node.args.map(simplifyOnce));
    }
    if (node.type !== 'binary') return node;

    const op = node.op;
    const a = simplifyOnce(node.left);
    const b = simplifyOnce(node.right);

    // constant folding
    if (isNum(a) && isNum(b)) {
        const v = { '+': a.value + b.value, '-': a.value - b.value, '*': a.value * b.value,
            '/': a.value / b.value, '^': Math.pow(a.value, b.value) }[op];
        if (isFinite(v)) return num(v);
    }

    if (op === '+') {
        if (isNum(a, 0)) return b;
        if (isNum(b, 0)) return a;
    }
    if (op === '-') {
        if (isNum(b, 0)) return a;
        if (isNum(a, 0)) return simplifyOnce(neg(b));
    }
    if (op === '*') {
        if (isNum(a, 0) || isNum(b, 0)) return num(0);
        if (isNum(a, 1)) return b;
        if (isNum(b, 1)) return a;
        if (isNum(a, -1)) return simplifyOnce(neg(b));
        if (isNum(b, -1)) return simplifyOnce(neg(a));
        // c * (1/z) -> c/z  (avoids printing a redundant "* 1")
        if (b.type === 'binary' && b.op === '/' && isNum(b.left, 1)) return simplifyOnce(div(a, b.right));
        if (a.type === 'binary' && a.op === '/' && isNum(a.left, 1)) return simplifyOnce(div(b, a.right));
        // like-base combine: base^m * base^n -> base^(m+n)
        const pa = powParts(a), pb = powParts(b);
        if (structEqual(pa.base, pb.base) && !isNum(pa.base)) {
            return simplifyOnce(pow(pa.base, add(pa.exp, pb.exp)));
        }
    }
    if (op === '/') {
        if (isNum(a, 0)) return num(0);
        if (isNum(b, 1)) return a;
        if (structEqual(a, b)) return num(1);
        // like-base combine: base^m / base^n -> base^(m-n)
        const pa = powParts(a), pb = powParts(b);
        if (structEqual(pa.base, pb.base) && !isNum(pa.base)) {
            return simplifyOnce(pow(pa.base, sub(pa.exp, pb.exp)));
        }
    }
    if (op === '^') {
        if (isNum(b, 1)) return a;
        if (isNum(b, 0)) return num(1);
        if (isNum(a, 1)) return num(1);
        if (isNum(a, 0)) return num(0);
        // negative numeric exponent -> reciprocal (prints as 1 / base^|n|)
        if (isNum(b) && b.value < 0) {
            return simplifyOnce(div(num(1), pow(a, num(-b.value))));
        }
    }
    return bin(op, a, b);
}
// decompose a node into { base, exp } treating bare nodes as base^1
function powParts(n) {
    if (n.type === 'binary' && n.op === '^') return { base: n.left, exp: n.right };
    return { base: n, exp: num(1) };
}

function simplify(node) {
    let cur = node;
    for (let i = 0; i < 60; i++) {
        const next = simplifyOnce(cur);
        if (structEqual(next, cur)) return next;
        cur = next;
    }
    return cur;
}

// ============================================================
// Pretty printer (precedence-aware)
// ============================================================
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
function numStr(v) {
    if (!isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    if (Math.abs(v) !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-4)) return v.toExponential(4).replace(/\.?0+e/, 'e');
    return parseFloat(v.toPrecision(6)).toString();
}
function nodePrec(n) {
    if (n.type === 'binary') return PREC[n.op];
    if (n.type === 'neg') return 3;
    return 5;
}
function printNode(n, parentPrec) {
    let s;
    switch (n.type) {
        case 'num': s = numStr(n.value); break;
        case 'var': s = n.name; break;
        case 'const': s = n.name; break;
        case 'call': s = `${n.name}(${n.args.map((a) => printNode(a, 0)).join(', ')})`; break;
        case 'neg': s = '-' + printNode(n.arg, 3); break;
        case 'binary': {
            const { op } = n;
            const sides = {
                '+': [1, 1], '-': [1, 2], '*': [2, 2], '/': [2, 3], '^': [5, 4],
            }[op];
            s = `${printNode(n.left, sides[0])} ${op} ${printNode(n.right, sides[1])}`;
            break;
        }
        default: s = '?';
    }
    return nodePrec(n) < parentPrec ? `(${s})` : s;
}
const toStr = (n) => printNode(n, 0);

// ============================================================
// Propagation
// ============================================================
function numericPartial(node, scope, name) {
    const x0 = scope[name];
    const h = Math.max(1e-8, Math.abs(x0) * 1e-6);
    scope[name] = x0 + h;
    const f1 = evaluate(node, scope);
    scope[name] = x0 - h;
    const f2 = evaluate(node, scope);
    scope[name] = x0;
    return (f1 - f2) / (2 * h);
}

/**
 * @param {object} ast parsed expression
 * @param {Array<{name,value,sigma}>} vars  variables with absolute sigma
 * @returns propagation result
 */
function propagate(ast, vars) {
    const scope = {};
    vars.forEach((v) => { scope[v.name] = v.value; });
    const nominal = evaluate(ast, scope);

    const terms = vars.map((v) => {
        // The symbolic derivative is exact wherever it evaluates to a finite
        // number, so it always wins. The central difference is only a fallback:
        // for badly scaled formulas (e.g. x + 1e12) it cancels to garbage, so it
        // must never override a finite symbolic value.
        let derivStr, partial, method;
        try {
            const d = simplify(differentiate(ast, v.name));
            const symVal = evaluate(d, scope);
            if (isFinite(symVal)) {
                partial = symVal; derivStr = toStr(d); method = 'symbolic';
            } else {
                partial = numericPartial(ast, scope, v.name);
                derivStr = toStr(d) + '   [numeric value used]'; method = 'numeric';
            }
        } catch (e) {
            partial = numericPartial(ast, scope, v.name);
            derivStr = '(numeric derivative)'; method = 'numeric';
        }
        const contrib = partial * v.sigma; // ∂f/∂x · σ
        return {
            name: v.name, value: v.value, sigma: v.sigma,
            derivStr, partial, method,
            contrib, contribSq: contrib * contrib,
        };
    });

    const variance = terms.reduce((s, t) => s + t.contribSq, 0);
    const sigma = Math.sqrt(variance);
    terms.forEach((t) => { t.percent = variance > 0 ? (t.contribSq / variance) * 100 : 0; });
    terms.sort((a, b) => b.contribSq - a.contribSq);

    return { nominal, sigma, variance, terms };
}

// ============================================================
// Monte Carlo cross-check
// ============================================================
function gaussian() {
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function sampleVar(v, dist) {
    if (v.sigma === 0) return v.value;
    if (dist === 'uniform') {
        // uniform with matching standard deviation: half-width = sqrt(3)*sigma
        const hw = Math.sqrt(3) * v.sigma;
        return v.value + (Math.random() * 2 - 1) * hw;
    }
    return v.value + v.sigma * gaussian();
}
function monteCarlo(ast, vars, n, dist) {
    const scope = {};
    // Welford running variance: the naive (sumSq - n*mean^2) form cancels
    // catastrophically when |mean| >> sigma.
    let kept = 0, mean = 0, m2 = 0;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) {
        for (const v of vars) scope[v.name] = sampleVar(v, dist);
        const y = evaluate(ast, scope);
        if (!isFinite(y)) continue;
        kept++;
        const delta = y - mean;
        mean += delta / kept;
        m2 += delta * (y - mean);
        if (y < min) min = y;
        if (y > max) max = y;
    }
    if (kept < 2) return null;
    const variance = m2 / (kept - 1);
    return { mean, sigma: Math.sqrt(Math.max(0, variance)), kept, discarded: n - kept, min, max };
}

// ============================================================
// Display formatting
// ============================================================
function roundToSig(x, sig) {
    if (x === 0 || !isFinite(x)) return x;
    const d = Math.ceil(Math.log10(Math.abs(x)));
    const power = sig - d;
    const mag = Math.pow(10, power);
    return Math.round(x * mag) / mag;
}
// format value & uncertainty so value matches uncertainty's last significant place
function formatMeasurement(value, unc) {
    if (!isFinite(value)) return { value: String(value), unc: '--', decimals: 0 };
    if (!(unc > 0) || !isFinite(unc)) {
        return { value: fmtNum(value), unc: '0', decimals: 0 };
    }
    const uncR = roundToSig(unc, 2);
    // decimal places implied by 2 sig figs of the uncertainty
    const exp = Math.floor(Math.log10(Math.abs(uncR)));
    const decimals = Math.max(0, 1 - exp);
    if (Math.abs(value) >= 1e6 || (Math.abs(value) < 1e-4 && value !== 0)) {
        return { value: value.toExponential(3), unc: uncR.toExponential(1), decimals };
    }
    return {
        value: value.toFixed(decimals),
        unc: uncR.toFixed(decimals),
        decimals,
    };
}
function fmtNum(x) {
    if (!isFinite(x)) return String(x);
    if (x === 0) return '0';
    if (Math.abs(x) >= 1e6 || Math.abs(x) < 1e-4) return x.toExponential(4);
    return parseFloat(x.toPrecision(6)).toString();
}

// ============================================================
// Examples
// ============================================================
const EXAMPLES = {
    density: {
        label: 'Density  ρ = m / V',
        formula: 'm / V',
        vars: { m: [250, 0.5, 'abs'], V: [100, 0.3, 'abs'] },
        note: 'Mass in g and volume in mL give density in g/mL.',
    },
    idealgas: {
        label: 'Ideal gas moles  n = P·V / (R·T)',
        formula: 'P * V / (R * T)',
        vars: { P: [101325, 150, 'abs'], V: [0.0224, 0.0001, 'abs'], R: [8.314, 0, 'exact'], T: [298.15, 0.5, 'abs'] },
        note: 'R is entered as an exact constant (σ = 0) so it adds no error.',
    },
    reynolds: {
        label: 'Reynolds number  Re = ρvD / μ',
        formula: 'rho * v * D / mu',
        vars: { rho: [998, 1, 'abs'], v: [1.5, 3, '%'], D: [0.05, 0.0005, 'abs'], mu: [0.001, 2, '%'] },
        note: 'Velocity and viscosity given as relative (%) uncertainties.',
    },
    arrhenius: {
        label: 'Arrhenius rate  k = A·exp(-Ea/RT)',
        formula: 'A * exp(-Ea / (R * T))',
        vars: { A: [1e13, 0, 'exact'], Ea: [75000, 2000, 'abs'], R: [8.314, 0, 'exact'], T: [350, 1, 'abs'] },
        note: 'Highly nonlinear, so a good case to compare Taylor against Monte Carlo.',
    },
    power: {
        label: 'Power dissipation  P = I²·R',
        formula: 'I^2 * R',
        vars: { I: [2.0, 0.05, 'abs'], R: [100, 1, 'abs'] },
        note: 'Squared term makes current the dominant error source.',
    },
    yield: {
        label: 'Percent yield  Y = (m_out / m_in)·100',
        formula: '(m_out / m_in) * 100',
        vars: { m_out: [8.2, 0.1, 'abs'], m_in: [10.0, 0.1, 'abs'] },
        note: 'Underscores are allowed in variable names.',
    },
};

// ============================================================
// UI wiring
// ============================================================
const state = {
    varMeta: new Map(), // name -> { value, unc, mode }
};

let els = {};
// Two independent debounce timers. A "rebuild" (formula changed → variable set
// may change) is structural and always recomputes at the end; a "compute" (only
// a value/uncertainty changed) is data-only. They must not share one timer, or a
// value edit can cancel a queued rebuild and leave the variable rows out of sync
// with the formula.
let rebuildTimer = null;
let computeTimer = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
    els = {
        formula: document.getElementById('formula'),
        formulaError: document.getElementById('formulaError'),
        varsBody: document.getElementById('varsBody'),
        varsEmpty: document.getElementById('varsEmpty'),
        examples: document.getElementById('examples'),
        exampleNote: document.getElementById('exampleNote'),
        coverage: document.getElementById('coverage'),
        mcToggle: document.getElementById('mcToggle'),
        mcSamples: document.getElementById('mcSamples'),
        mcDist: document.getElementById('mcDist'),
        resultHero: document.getElementById('resultHero'),
        resultValue: document.getElementById('resultValue'),
        resultUnc: document.getElementById('resultUnc'),
        resultRel: document.getElementById('resultRel'),
        resultExpanded: document.getElementById('resultExpanded'),
        dominant: document.getElementById('dominant'),
        copyBtn: document.getElementById('copyBtn'),
        copyFeedback: document.getElementById('copyFeedback'),
        steps: document.getElementById('steps'),
    };

    // populate examples dropdown
    Object.entries(EXAMPLES).forEach(([key, ex]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = ex.label;
        els.examples.appendChild(opt);
    });

    els.formula.addEventListener('input', () => {
        els.examples.value = '';   // manual typing deselects the loaded example
        els.exampleNote.textContent = '';
        scheduleRebuild();
    });
    els.examples.addEventListener('change', () => loadExample(els.examples.value));
    els.varsBody.addEventListener('input', () => scheduleCompute());
    els.varsBody.addEventListener('change', () => scheduleCompute());
    [els.coverage, els.mcToggle, els.mcSamples, els.mcDist].forEach((el) =>
        el.addEventListener('change', () => compute()));
    els.copyBtn.addEventListener('click', copyResult);

    loadExample('density');
}

function scheduleRebuild() {
    // A rebuild re-reads the current field values (readVarMeta) and computes at
    // the end, so any queued value-only compute is redundant — drop it.
    clearTimeout(computeTimer);
    computeTimer = null;
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
        rebuildTimer = null;
        rebuildVars();
    }, 250);
}
function scheduleCompute() {
    // If a structural rebuild is already queued, let it handle the recompute:
    // rebuildVars() reads the latest DOM values first, so this edit is preserved
    // and we never compute against a stale variable set.
    if (rebuildTimer) return;
    clearTimeout(computeTimer);
    computeTimer = setTimeout(() => {
        computeTimer = null;
        readVarMeta();
        compute();
    }, 200);
}

function loadExample(key) {
    const ex = EXAMPLES[key];
    if (!ex) return;
    els.formula.value = ex.formula;
    state.varMeta.clear();
    Object.entries(ex.vars).forEach(([name, [value, unc, mode]]) => {
        state.varMeta.set(name, { value, unc, mode });
    });
    els.exampleNote.textContent = ex.note || '';
    els.examples.value = key;
    rebuildVars();
}

// read current DOM inputs back into state so values survive a re-parse
function readVarMeta() {
    els.varsBody.querySelectorAll('.var-row').forEach((row) => {
        const name = row.dataset.name;
        const value = parseFloat(row.querySelector('.var-value').value);
        const unc = parseFloat(row.querySelector('.var-unc').value);
        const mode = row.querySelector('.var-mode').value;
        state.varMeta.set(name, {
            value: isFinite(value) ? value : 0,
            unc: isFinite(unc) ? unc : 0,
            mode,
        });
    });
}

function rebuildVars() {
    if (els.varsBody.querySelector('.var-row')) readVarMeta();
    const src = els.formula.value.trim();
    els.formulaError.textContent = '';

    if (!src) {
        els.varsBody.innerHTML = '';
        els.varsEmpty.hidden = false;
        clearResult();
        return;
    }

    let ast;
    try {
        ast = parse(src);
    } catch (e) {
        els.formulaError.textContent = 'Parse error: ' + e.message;
        clearResult();
        return;
    }

    const names = collectVars(ast);
    if (names.length === 0) {
        els.varsBody.innerHTML = '';
        els.varsEmpty.hidden = false;
        els.varsEmpty.textContent = 'No variables found. This expression is a constant.';
        compute();
        return;
    }
    els.varsEmpty.hidden = true;

    els.varsBody.innerHTML = '';
    names.forEach((name) => {
        const meta = state.varMeta.get(name) || { value: 1, unc: 0, mode: 'abs' };
        els.varsBody.appendChild(buildVarRow(name, meta));
    });
    compute();
}

function buildVarRow(name, meta) {
    const row = document.createElement('div');
    row.className = 'var-row';
    row.dataset.name = name;
    row.innerHTML = `
        <div class="var-name mono">${escapeHtml(name)}</div>
        <input class="main-input var-value" type="number" step="any" value="${meta.value}" aria-label="Value of ${escapeHtml(name)}">
        <div class="var-unc-wrap">
            <span class="pm">±</span>
            <input class="main-input var-unc" type="number" step="any" min="0" value="${meta.unc}" aria-label="Uncertainty of ${escapeHtml(name)}" ${meta.mode === 'exact' ? 'disabled' : ''}>
        </div>
        <select class="main-select var-mode" aria-label="Uncertainty mode for ${escapeHtml(name)}">
            <option value="abs" ${meta.mode === 'abs' ? 'selected' : ''}>absolute</option>
            <option value="%" ${meta.mode === '%' ? 'selected' : ''}>percent (%)</option>
            <option value="exact" ${meta.mode === 'exact' ? 'selected' : ''}>exact</option>
        </select>`;
    // enable/disable uncertainty field when switching to/from exact
    row.querySelector('.var-mode').addEventListener('change', (e) => {
        row.querySelector('.var-unc').disabled = e.target.value === 'exact';
    });
    return row;
}

function absSigma(meta) {
    if (meta.mode === 'exact') return 0;
    if (meta.mode === '%') return Math.abs(meta.value) * (meta.unc / 100);
    return Math.abs(meta.unc);
}

function compute() {
    const src = els.formula.value.trim();
    if (!src) { clearResult(); return; }
    let ast;
    try {
        ast = parse(src);
    } catch (e) {
        els.formulaError.textContent = 'Parse error: ' + e.message;
        clearResult();
        return;
    }
    els.formulaError.textContent = '';

    // gather variable data from DOM
    const rows = [...els.varsBody.querySelectorAll('.var-row')];
    const vars = rows.map((row) => {
        const name = row.dataset.name;
        const value = parseFloat(row.querySelector('.var-value').value);
        const uncRaw = parseFloat(row.querySelector('.var-unc').value);
        const mode = row.querySelector('.var-mode').value;
        const meta = { value: isFinite(value) ? value : 0, unc: isFinite(uncRaw) ? uncRaw : 0, mode };
        state.varMeta.set(name, meta);
        return { name, value: meta.value, sigma: absSigma(meta) };
    });

    let result;
    try {
        result = propagate(ast, vars);
    } catch (e) {
        els.formulaError.textContent = 'Evaluation error: ' + e.message;
        clearResult();
        return;
    }

    if (!isFinite(result.nominal)) {
        els.formulaError.textContent = 'Result is not finite at these values (check for divide-by-zero or domain errors).';
    }

    const k = parseFloat(els.coverage.value);
    let mc = null;
    if (els.mcToggle.checked && vars.length > 0) {
        const n = Math.max(1000, Math.min(2_000_000, parseInt(els.mcSamples.value, 10) || 100000));
        mc = monteCarlo(ast, vars, n, els.mcDist.value);
    }

    renderResult(result, k, mc);
    renderSteps(src, result, k, mc);
}

function renderResult(result, k, mc) {
    const m = formatMeasurement(result.nominal, result.sigma);
    els.resultValue.textContent = m.value;
    els.resultUnc.textContent = '± ' + m.unc;
    const rel = result.nominal !== 0 ? (result.sigma / Math.abs(result.nominal)) * 100 : Infinity;
    els.resultRel.textContent = isFinite(rel) ? `${rel.toPrecision(3)}% relative (1σ)` : 'relative undefined';

    const U = k * result.sigma;
    const mE = formatMeasurement(result.nominal, U);
    const pct = coverageLabel(k);
    els.resultExpanded.textContent = `Expanded (k=${k}, ${pct}): ${mE.value} ± ${mE.unc}`;

    if (result.terms.length > 0 && result.sigma > 0) {
        const top = result.terms[0];
        els.dominant.hidden = false;
        els.dominant.innerHTML = `<strong>${escapeHtml(top.name)}</strong> dominates the uncertainty ` +
            `(${top.percent.toFixed(1)}% of the variance).`;
    } else {
        els.dominant.hidden = true;
    }
    els.resultHero.classList.remove('empty');
    state.lastResult = { result, k, mc };
}

function coverageLabel(k) {
    if (Math.abs(k - 1) < 1e-9) return '≈68%';
    if (Math.abs(k - 2) < 1e-9) return '≈95%';
    if (Math.abs(k - 1.96) < 1e-9) return '95%';
    if (Math.abs(k - 3) < 1e-9) return '≈99.7%';
    return '';
}

function renderSteps(src, result, k, mc) {
    const rows = result.terms.map((t) => {
        const term = Math.abs(t.contrib);
        return `<tr>
            <td class="mono">${escapeHtml(t.name)}</td>
            <td class="mono deriv">∂f/∂${escapeHtml(t.name)} = ${escapeHtml(t.derivStr)}</td>
            <td class="mono num">${fmtNum(t.partial)}</td>
            <td class="mono num">${fmtNum(t.sigma)}</td>
            <td class="mono num">${fmtNum(term)}</td>
            <td class="num">
                <div class="bar-wrap"><span class="bar" style="width:${t.percent.toFixed(1)}%"></span></div>
                <span class="pct">${t.percent.toFixed(1)}%</span>
            </td>
        </tr>`;
    }).join('');

    let mcHtml = '';
    if (mc) {
        const agree = result.sigma > 0 ? Math.abs(mc.sigma - result.sigma) / result.sigma * 100 : 0;
        mcHtml = `
        <div class="mc-summary">
            <h4>Monte Carlo cross-check</h4>
            <p>${mc.kept.toLocaleString()} samples${mc.discarded ? ` (${mc.discarded.toLocaleString()} non-finite discarded)` : ''},
            ${els.mcDist.value} sampling.</p>
            <ul>
                <li>Mean: <span class="mono">${fmtNum(mc.mean)}</span></li>
                <li>Std dev (1σ): <span class="mono">${fmtNum(mc.sigma)}</span></li>
                <li>Range: <span class="mono">${fmtNum(mc.min)}</span> to <span class="mono">${fmtNum(mc.max)}</span></li>
                <li>Agreement with Taylor 1σ: <span class="mono">${isFinite(agree) ? agree.toFixed(1) + '%' : '--'}</span> difference</li>
            </ul>
            <p class="mc-note">Large disagreement means the linear (first-order) approximation is weak here, so trust the Monte Carlo spread.</p>
        </div>`;
    }

    els.steps.innerHTML = `
        <div class="steps-inner">
            <p class="steps-formula">General first-order (Taylor) propagation for independent variables:</p>
            <p class="steps-eq mono">σ_f = √( Σ (∂f/∂xᵢ · σᵢ)² )</p>
            <div class="steps-table-wrap">
            <table class="steps-table">
                <thead><tr>
                    <th>Var</th><th>Partial derivative</th><th>∂f/∂x</th><th>σ</th><th>|∂f/∂x·σ|</th><th>Contribution</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            </div>
            <p class="steps-sum mono">Σ variance = ${fmtNum(result.variance)}  →  σ_f = √(Σ) = ${fmtNum(result.sigma)}</p>
            ${mcHtml}
            <p class="steps-caveat">Assumes variables are independent (uncorrelated) and that errors are small enough
            that the function is roughly linear across ±σ. Partial derivatives are evaluated symbolically; a numeric
            central difference is used only where the symbolic form cannot be evaluated.</p>
        </div>`;
}

function clearResult() {
    els.resultValue.textContent = '--';
    els.resultUnc.textContent = '';
    els.resultRel.textContent = '';
    els.resultExpanded.textContent = '';
    els.dominant.hidden = true;
    els.steps.innerHTML = '';
    els.resultHero.classList.add('empty');
}

function copyResult() {
    const lr = state.lastResult;
    if (!lr) return;
    const m = formatMeasurement(lr.result.nominal, lr.result.sigma);
    const text = `${m.value} ± ${m.unc}`;
    if (window.ToolsHub && window.ToolsHub.Clipboard) {
        window.ToolsHub.Clipboard.copy(text, els.copyFeedback);
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
        els.copyFeedback.textContent = 'Copied!';
        setTimeout(() => { els.copyFeedback.textContent = ''; }, 1500);
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// expose engine for quick console testing / possible future unit tests
window.UncertaintyEngine = { parse, evaluate, differentiate, simplify, toStr, propagate, monteCarlo, collectVars };
