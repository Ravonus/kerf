/** Texels along a side of the noise texture. */
export declare const NOISE_SIZE = 256;
/** A lattice point and a seed to a share in [0, 1), by 32-bit integer mixing. */
export declare function latticeHash(x: number, y: number, seed: number): number;
/**
 * The noise texture's texels, RGBA, `size` a side (a power of two). R: fine fractal noise (16 cells a side and up),
 * the threshold the panel dissolves by and its paper's mottle. G: broad fractal noise (4 cells and up), the torn
 * edge's shape. B: white noise, the grain. A: 255. R and G are stretched to the full range. The same seed gives the
 * same bytes everywhere.
 *
 * @param seed An integer seed.
 * @param size Texels a side, a power of two from 32; 256 by default.
 */
export declare function noiseTexels(seed?: number, size?: number): Uint8Array;
