/* tslint:disable */
/* eslint-disable */

export function classify_points(data: Float32Array, n_rows: number, n_dims: number, eps: number, min_pts: number, missing_policy: number, standardize: boolean): any;

/**
 * Compute cluster quality metrics with selective computation.
 * 
 * # Arguments
 * * `data` - Flat array of points [x0,y0,z0, x1,y1,z1, ...]
 * * `n_rows` - Number of points
 * * `n_dims` - Dimensionality
 * * `labels` - Cluster labels (-1 = noise, -2 = unclassified, i32::MIN = dropped)
 * * `min_pts` - DBSCAN min_pts (used for DBCV core distances)
 * * `max_silhouette_samples` - Cap on sampled points for silhouette (recommend: 3000)
 * * `silhouette_sample_fraction` - Fraction to sample (recommend: 0.10)
 * * `max_dbcv_samples_per_cluster` - Cap on samples per cluster for DBCV (recommend: 1000)
 * * `metric_flags` - Bitmask of which metrics to compute (use METRIC_* constants)
 * 
 * # Returns
 * Object with computed metrics. Metrics not requested will be NaN.
 */
export function compute_cluster_metrics(data: Float32Array, n_rows: number, n_dims: number, labels: Int32Array, min_pts: number, max_silhouette_samples: number, silhouette_sample_fraction: number, max_dbcv_samples_per_cluster: number, metric_flags: number): any;

export function compute_kdist(data: Float32Array, n_rows: number, n_dims: number, k: number, missing_policy: number, standardize: boolean, max_sample: number): any;

export function dbscan_fit(data: Float32Array, n_rows: number, n_dims: number, eps: number, min_pts: number, missing_policy: number, standardize: boolean, trace_enable: boolean, trace_max_events: number, trace_max_neighbors: number): any;

export function metric_flags(): any;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly classify_points: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly compute_cluster_metrics: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
  readonly compute_kdist: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly dbscan_fit: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
  readonly metric_flags: () => any;
  readonly version: () => [number, number];
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
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
