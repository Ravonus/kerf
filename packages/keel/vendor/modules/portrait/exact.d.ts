import type { M3 } from "./sdf.js";
/** The sine of an angle of any size, within 5e-16 of Math.sin's. */
export declare function sine(x: number): number;
export declare function cosine(x: number): number;
/** Degrees to radians. */
export declare const deg: (d: number) => number;
/**
 * A rotation from turns about x (pitch, + tips the top forward so the front looks down), y (yaw, + turns the front
 * toward +x) and z (roll, + tips the top toward -x), applied z, then x, then y. Rows take a point into the frame.
 */
export declare function turn(pitch: number, yaw: number, roll: number): M3;
/** A 32-bit hash of whole numbers (integer only). */
export declare function hash32(...values: number[]): number;
/** A share in [0, 1) from whole numbers. */
export declare function unit(...values: number[]): number;
/** A number between `lo` and `hi`, decided by a seed and a name. */
export declare function pick(seed: number, slot: number, lo: number, hi: number): number;
