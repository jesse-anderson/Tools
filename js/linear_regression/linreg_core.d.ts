/* tslint:disable */
/* eslint-disable */

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
 */
export function anderson_darling_test(y_json: string, x_vars_json: string): string;

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
 */
export function breusch_pagan_test(y_json: string, x_vars_json: string): string;

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
 */
export function cooks_distance_test(y_json: string, x_vars_json: string): string;

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
 */
export function durbin_watson_test(y_json: string, x_vars_json: string): string;

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
 */
export function get_normal_inverse(p: number): number;

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
 */
export function get_t_cdf(t: number, df: number): number;

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
 */
export function get_t_critical(alpha: number, df: number): number;

/**
 * Returns the current version of the library.
 *
 * Returns the Cargo package version as a string (e.g., "0.1.0").
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 */
export function get_version(): string;

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
 */
export function harvey_collier_test(y_json: string, x_vars_json: string): string;

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
 */
export function jarque_bera_test(y_json: string, x_vars_json: string): string;

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
 */
export function ols_regression(y_json: string, x_vars_json: string, variable_names: string): string;

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
 */
export function parse_csv(content: string): string;

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
 */
export function python_white_test(y_json: string, x_vars_json: string): string;

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
 */
export function r_white_test(y_json: string, x_vars_json: string): string;

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
 */
export function rainbow_test(y_json: string, x_vars_json: string, fraction: number, method: string): string;

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
 */
export function shapiro_wilk_test(y_json: string, x_vars_json: string): string;

/**
 * Simple test function to verify WASM is working.
 *
 * Returns a success message confirming the WASM module loaded correctly.
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 */
export function test(): string;

/**
 * Test function for confidence interval computation.
 *
 * Returns JSON with the computed confidence interval for a coefficient.
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 */
export function test_ci(coef: number, se: number, df: number, alpha: number): string;

/**
 * Test function for regression validation against R reference values.
 *
 * Runs a regression on a housing dataset and compares results against R's lm() output.
 * Returns JSON with status "PASS" or "FAIL" with details.
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 */
export function test_housing_regression(): string;

/**
 * Test function for R accuracy validation.
 *
 * Returns JSON comparing our statistical functions against R reference values.
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 */
export function test_r_accuracy(): string;

/**
 * Test function for t-critical value computation.
 *
 * Returns JSON with the computed t-critical value for the given parameters.
 *
 * # Errors
 *
 * Returns a JSON error object if domain check fails.
 */
export function test_t_critical(df: number, alpha: number): string;

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
 */
export function white_test(y_json: string, x_vars_json: string, method: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly anderson_darling_test: (a: number, b: number, c: number, d: number) => [number, number];
  readonly breusch_pagan_test: (a: number, b: number, c: number, d: number) => [number, number];
  readonly cooks_distance_test: (a: number, b: number, c: number, d: number) => [number, number];
  readonly durbin_watson_test: (a: number, b: number, c: number, d: number) => [number, number];
  readonly get_version: () => [number, number];
  readonly harvey_collier_test: (a: number, b: number, c: number, d: number) => [number, number];
  readonly jarque_bera_test: (a: number, b: number, c: number, d: number) => [number, number];
  readonly ols_regression: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
  readonly parse_csv: (a: number, b: number) => [number, number];
  readonly python_white_test: (a: number, b: number, c: number, d: number) => [number, number];
  readonly r_white_test: (a: number, b: number, c: number, d: number) => [number, number];
  readonly rainbow_test: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly shapiro_wilk_test: (a: number, b: number, c: number, d: number) => [number, number];
  readonly test: () => [number, number];
  readonly test_ci: (a: number, b: number, c: number, d: number) => [number, number];
  readonly test_housing_regression: () => [number, number];
  readonly test_r_accuracy: () => [number, number];
  readonly test_t_critical: (a: number, b: number) => [number, number];
  readonly white_test: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
  readonly get_t_critical: (a: number, b: number) => number;
  readonly get_t_cdf: (a: number, b: number) => number;
  readonly get_normal_inverse: (a: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
