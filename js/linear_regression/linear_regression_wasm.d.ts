/* tslint:disable */
/* eslint-disable */

export function get_normal_inverse(p: number): number;

export function get_t_cdf(t: number, df: number): number;

export function get_t_critical(alpha: number, df: number): number;

export function get_version(): string;

export function ols_regression(y_json: string, x_vars_json: string, variable_names: string): string;

export function parse_csv(content: string): string;

export function test(): string;

export function test_ci(coef: number, se: number, df: number, alpha: number): string;

export function test_housing_regression(): string;

export function test_r_accuracy(): string;

export function test_t_critical(df: number, alpha: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly get_version: () => [number, number];
  readonly ols_regression: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
  readonly parse_csv: (a: number, b: number) => [number, number];
  readonly test: () => [number, number];
  readonly test_ci: (a: number, b: number, c: number, d: number) => [number, number];
  readonly test_housing_regression: () => [number, number];
  readonly test_r_accuracy: () => [number, number];
  readonly test_t_critical: (a: number, b: number) => [number, number];
  readonly get_normal_inverse: (a: number) => number;
  readonly get_t_cdf: (a: number, b: number) => number;
  readonly get_t_critical: (a: number, b: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
