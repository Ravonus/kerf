import type { Flutter } from "./wind.js";
export declare function writeColumns(array: Float32Array, index: number, columns: readonly number[]): void;
export declare function writeOrigin(array: Float32Array, index: number, origin: readonly [number, number, number]): void;
/** Hides one instance far below the scene, scaled to nothing. */
export declare function clearSlot(array: Float32Array, index: number): void;
export type V3 = readonly [number, number, number];
/** A box's place: its origin, its size along each axis, and its turn about up. */
export interface BoxPlace {
    readonly at: V3;
    readonly size: V3;
    readonly yaw: number;
}
/** A box turned `yaw` about up, scaled by `size`. */
export declare function writeBox(array: Float32Array, index: number, box: BoxPlace): void;
/** A limb a slab lies on: its middle, the way it runs, and its radius. */
export interface Limb {
    readonly at: V3;
    readonly along: V3;
    readonly radius: number;
}
/** A slab's size: across the limb, through, and along it. */
export interface SlabSize {
    readonly width: number;
    readonly depth: number;
    readonly long: number;
}
/**
 * A slab `width` wide and `depth` thick lying on the top of a limb from its middle along (dx, dy, dz), which it follows
 * however it slopes.
 */
export declare function writeSlab(array: Float32Array, index: number, limb: Limb, slab: SlabSize): void;
/** A voxel's look: how wide it is, how it is turned, and how much it is flattened (1, the default, is a cube). */
export interface VoxelLook {
    readonly size: number;
    readonly yaw: number;
    readonly flat?: number;
}
/** A cube `size` wide, flattened by `flat`, turned `yaw`. */
export declare function writeVoxel(array: Float32Array, index: number, at: V3, voxel: VoxelLook): void;
/** One piece of wood: from `a` to `b`, `radius` thick. */
export interface WoodPiece {
    readonly a: V3;
    readonly b: V3;
    readonly radius: number;
}
/**
 * One wood piece from a to b, `radius` thick, overlapping its joints. Rotation is the shortest arc from up, so bark
 * never swims.
 */
export declare function writeSegment(array: Float32Array, index: number, piece: WoodPiece): void;
export declare const UP: readonly [number, number, number];
export declare const norm3: (x: number, y: number, z: number) => [number, number, number];
export declare const cross3: (a: V3, b: V3) => [number, number, number];
export declare const isZero: (v: V3) => boolean;
/** One leaf blade: its stalk `p`, the way it points `n`, its size, and `long` times longer than wide (1). */
export interface Blade {
    readonly p: V3;
    readonly n: V3;
    readonly size: number;
    readonly long?: number;
}
/**
 * One leaf blade at its stalk, pointing along `n`, drooped, twisted and nodded by `motion`; `long` draws it
 * that much longer than wide.
 */
export declare function writeBlade(array: Float32Array, index: number, blade: Blade, motion: Flutter): void;
