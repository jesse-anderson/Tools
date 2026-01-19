let wasm;

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
}

let WASM_VECTOR_LEN = 0;

/**
 * Performs the Anderson-Darling test for normality via WASM.
 *
 * The Anderson-Darling test checks whether the residuals are normally distributed
 * by comparing the empirical distribution to the expected normal distribution.
 * This test is particularly sensitive to deviations in the tails of the distribution.
 * A significant p-value suggests that the residuals deviate from normality.
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays
 *
 * # Returns
 *
 * JSON string containing the A² statistic, p-value, and interpretation.
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @returns {string}
 */
export function anderson_darling_test(y_json, x_vars_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.anderson_darling_test(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Performs the Breusch-Pagan test for heteroscedasticity via WASM.
 *
 * The Breusch-Pagan test checks whether the variance of residuals is constant
 * across the range of predicted values (homoscedasticity assumption).
 * A significant p-value suggests heteroscedasticity.
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays
 *
 * # Returns
 *
 * JSON string containing test statistic, p-value, and interpretation.
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @returns {string}
 */
export function breusch_pagan_test(y_json, x_vars_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.breusch_pagan_test(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Computes Cook's distance for identifying influential observations via WASM.
 *
 * Cook's distance measures how much each observation influences the regression
 * model by comparing coefficient estimates with and without that observation.
 * Unlike hypothesis tests, this is an influence measure - not a test with p-values.
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays
 *
 * # Returns
 *
 * JSON string containing:
 * - Vector of Cook's distances (one per observation)
 * - Thresholds for identifying influential observations
 * - Indices of potentially influential observations
 * - Interpretation and guidance
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @returns {string}
 */
export function cooks_distance_test(y_json, x_vars_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.cooks_distance_test(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Performs the Durbin-Watson test for autocorrelation via WASM.
 *
 * The Durbin-Watson test checks for autocorrelation in the residuals.
 * Values near 2 indicate no autocorrelation, values near 0 suggest positive
 * autocorrelation, and values near 4 suggest negative autocorrelation.
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays
 *
 * # Returns
 *
 * JSON string containing the DW statistic and interpretation.
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @returns {string}
 */
export function durbin_watson_test(y_json, x_vars_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.durbin_watson_test(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Computes the inverse of the standard normal CDF (probit function).
 *
 * Returns the z-score such that P(Z ≤ z) = p for a standard normal distribution.
 *
 * # Arguments
 *
 * * `p` - Probability (0 < p < 1)
 *
 * # Returns
 *
 * The z-score, or `NaN` if domain check fails.
 * @param {number} p
 * @returns {number}
 */
export function get_normal_inverse(p) {
    const ret = wasm.get_normal_inverse(p);
    return ret;
}

/**
 * Computes the Student's t-distribution cumulative distribution function.
 *
 * Returns P(T ≤ t) for a t-distribution with the given degrees of freedom.
 *
 * # Arguments
 *
 * * `t` - t-statistic value
 * * `df` - Degrees of freedom
 *
 * # Returns
 *
 * The CDF value, or `NaN` if domain check fails.
 * @param {number} t
 * @param {number} df
 * @returns {number}
 */
export function get_t_cdf(t, df) {
    const ret = wasm.get_t_cdf(t, df);
    return ret;
}

/**
 * Computes the critical t-value for a given significance level.
 *
 * Returns the t-value such that the area under the t-distribution curve
 * to the right equals alpha/2 (two-tailed test).
 *
 * # Arguments
 *
 * * `alpha` - Significance level (typically 0.05 for 95% confidence)
 * * `df` - Degrees of freedom
 *
 * # Returns
 *
 * The critical t-value, or `NaN` if domain check fails.
 * @param {number} alpha
 * @param {number} df
 * @returns {number}
 */
export function get_t_critical(alpha, df) {
    const ret = wasm.get_t_critical(alpha, df);
    return ret;
}

/**
 * Returns the current version of the library.
 *
 * Returns the Cargo package version as a string (e.g., "0.1.0").
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 * @returns {string}
 */
export function get_version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.get_version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Performs the Harvey-Collier test for linearity via WASM.
 *
 * The Harvey-Collier test checks whether the residuals exhibit a linear trend,
 * which would indicate that the model's functional form is misspecified.
 * A significant p-value suggests non-linearity.
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays
 *
 * # Returns
 *
 * JSON string containing test statistic, p-value, and interpretation.
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @returns {string}
 */
export function harvey_collier_test(y_json, x_vars_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.harvey_collier_test(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Performs the Jarque-Bera test for normality via WASM.
 *
 * The Jarque-Bera test checks whether the residuals are normally distributed
 * by examining skewness and kurtosis. A significant p-value suggests that
 * the residuals deviate from normality.
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays
 *
 * # Returns
 *
 * JSON string containing test statistic, p-value, and interpretation.
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @returns {string}
 */
export function jarque_bera_test(y_json, x_vars_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.jarque_bera_test(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Performs OLS regression via WASM.
 *
 * All parameters and return values are JSON-encoded strings for JavaScript
 * interoperability. Returns regression output including coefficients,
 * standard errors, diagnostic statistics, and VIF analysis.
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values: `[1.0, 2.0, 3.0]`
 * * `x_vars_json` - JSON array of predictor arrays: `[[1.0, 2.0], [0.5, 1.0]]`
 * * `variable_names` - JSON array of variable names: `["Intercept", "X1", "X2"]`
 *
 * # Returns
 *
 * JSON string containing the complete regression output with coefficients,
 * standard errors, t-statistics, p-values, R², F-statistic, residuals, leverage, VIF, etc.
 *
 * # Errors
 *
 * Returns a JSON error object if:
 * - JSON parsing fails
 * - Insufficient data (n ≤ k + 1)
 * - Matrix is singular
 * - Domain check fails
 * @param {string} y_json
 * @param {string} x_vars_json
 * @param {string} variable_names
 * @returns {string}
 */
export function ols_regression(y_json, x_vars_json, variable_names) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(variable_names, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.ols_regression(ptr0, len0, ptr1, len1, ptr2, len2);
        deferred4_0 = ret[0];
        deferred4_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Parses CSV data and returns it as a JSON string.
 *
 * Parses the CSV content and identifies numeric columns. Returns a JSON object
 * with headers, data rows, and a list of numeric column names.
 *
 * # Arguments
 *
 * * `content` - CSV content as a string
 *
 * # Returns
 *
 * JSON string with structure:
 * ```json
 * {
 *   "headers": ["col1", "col2", ...],
 *   "data": [{"col1": 1.0, "col2": "text"}, ...],
 *   "numeric_columns": ["col1", ...]
 * }
 * ```
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} content
 * @returns {string}
 */
export function parse_csv(content) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.parse_csv(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Performs the Python method White test for heteroscedasticity via WASM.
 *
 * This implementation matches Python's `statsmodels.stats.diagnostic.het_white()` function.
 * Uses the LINPACK QR decomposition with column pivoting and the Python-specific
 * auxiliary matrix structure (intercept, X, X², and cross-products).
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays (each array is a column)
 *
 * # Returns
 *
 * JSON string containing test statistic, p-value, and interpretation.
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @returns {string}
 */
export function python_white_test(y_json, x_vars_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.python_white_test(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Performs the R method White test for heteroscedasticity via WASM.
 *
 * This implementation matches R's `skedastic::white()` function behavior.
 * Uses the standard QR decomposition and the R-specific auxiliary matrix
 * structure (intercept, X, X² only - no cross-products).
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays (each array is a column)
 *
 * # Returns
 *
 * JSON string containing test statistic, p-value, and interpretation.
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @returns {string}
 */
export function r_white_test(y_json, x_vars_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.r_white_test(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Performs the Rainbow test for linearity via WASM.
 *
 * The Rainbow test checks whether the relationship between predictors and response
 * is linear. A significant p-value suggests non-linearity.
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays
 * * `fraction` - Fraction of data to use in the central subset (0.0 to 1.0, typically 0.5)
 * * `method` - Method to use: "r", "python", or "both" (case-insensitive, defaults to "r")
 *
 * # Returns
 *
 * JSON string containing test statistic, p-value, and interpretation.
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @param {number} fraction
 * @param {string} method
 * @returns {string}
 */
export function rainbow_test(y_json, x_vars_json, fraction, method) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(method, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.rainbow_test(ptr0, len0, ptr1, len1, fraction, ptr2, len2);
        deferred4_0 = ret[0];
        deferred4_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Performs the Shapiro-Wilk test for normality via WASM.
 *
 * The Shapiro-Wilk test is a powerful tests for normality,
 * especially for small to moderate sample sizes (3 ≤ n ≤ 5000). It tests
 * the null hypothesis that the residuals are normally distributed.
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays
 *
 * # Returns
 *
 * JSON string containing the W statistic (ranges from 0 to 1), p-value,
 * and interpretation.
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @returns {string}
 */
export function shapiro_wilk_test(y_json, x_vars_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.shapiro_wilk_test(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Simple test function to verify WASM is working.
 *
 * Returns a success message confirming the WASM module loaded correctly.
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 * @returns {string}
 */
export function test() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.test();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Test function for confidence interval computation.
 *
 * Returns JSON with the computed confidence interval for a coefficient.
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 * @param {number} coef
 * @param {number} se
 * @param {number} df
 * @param {number} alpha
 * @returns {string}
 */
export function test_ci(coef, se, df, alpha) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.test_ci(coef, se, df, alpha);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Test function for regression validation against R reference values.
 *
 * Runs a regression on a housing dataset and compares results against R's lm() output.
 * Returns JSON with status "PASS" or "FAIL" with details.
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 * @returns {string}
 */
export function test_housing_regression() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.test_housing_regression();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Test function for R accuracy validation.
 *
 * Returns JSON comparing our statistical functions against R reference values.
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 * @returns {string}
 */
export function test_r_accuracy() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.test_r_accuracy();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Test function for t-critical value computation.
 *
 * Returns JSON with the computed t-critical value for the given parameters.
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 * @param {number} df
 * @param {number} alpha
 * @returns {string}
 */
export function test_t_critical(df, alpha) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.test_t_critical(df, alpha);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Performs the White test for heteroscedasticity via WASM.
 *
 * The White test is a more general test for heteroscedasticity that does not
 * assume a specific form of heteroscedasticity. A significant p-value suggests
 * that the error variance is not constant.
 *
 * # Arguments
 *
 * * `y_json` - JSON array of response variable values
 * * `x_vars_json` - JSON array of predictor arrays
 * * `method` - Method to use: "r", "python", or "both" (case-insensitive, defaults to "r")
 *
 * # Returns
 *
 * JSON string containing test statistic, p-value, and interpretation.
 *
 * # Errors
 *
 * Returns a JSON error object if parsing fails or domain check fails.
 * @param {string} y_json
 * @param {string} x_vars_json
 * @param {string} method
 * @returns {string}
 */
export function white_test(y_json, x_vars_json, method) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(y_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(x_vars_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(method, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.white_test(ptr0, len0, ptr1, len1, ptr2, len2);
        deferred4_0 = ret[0];
        deferred4_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('linreg_core_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
