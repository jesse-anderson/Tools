/* tslint:disable */
/* eslint-disable */

/**
 * Computes 2D FFT of image data
 *
 * # Arguments
 * * `input` - Float32Array of image data (flattened 2D array, row-major)
 * * `width` - Image width in pixels
 * * `height` - Image height in pixels
 *
 * # Returns
 * * Float32Array of magnitude spectrum (same size as input)
 *
 * # Performance
 * - O(n² log n) for n×n image
 * - Supports non-square dimensions
 * - Uses rustfft's optimized algorithms (including SIMD)
 */
export function compute_fft_2d(input: Float32Array, width: number, height: number): Float32Array;

/**
 * Computes 2D FFT with center-shifted output (DC component in center)
 *
 * Same as compute_fft_2d but rearranges output so the zero-frequency
 * component is in the center of the array (standard for visualization).
 */
export function compute_fft_2d_centered(input: Float32Array, width: number, height: number): Float32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly compute_fft_2d: (a: any, b: number, c: number) => any;
    readonly compute_fft_2d_centered: (a: any, b: number, c: number) => any;
    readonly __wbindgen_externrefs: WebAssembly.Table;
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
