/** An sRGB colour, 0..1 a channel. */
export type Rgb = readonly [number, number, number];
/** The shapes a dab can take. The numbers are the shader's. */
export declare const KIND: {
    readonly blot: 0;
    readonly spire: 1;
    readonly crown: 2;
    readonly wall: 3;
    readonly leaf: 4;
    readonly stem: 5;
};
/** Floats per dab in the instance buffer. */
export declare const STRIDE = 16;
/** One dab. Position in plate fractions; sizes and axis in plate heights (x scaled by the aspect). */
export interface Dab {
    /** Centre, x across and y down, 0..1. */
    readonly x: number;
    readonly y: number;
    /** Half its length along the axis and half its width across it. */
    readonly len: number;
    readonly wid: number;
    /** A unit vector from its foot or stalk toward its tip. */
    readonly ax: number;
    readonly ay: number;
    readonly kind: number;
    /** 0..1, varies the shape's detail. */
    readonly seed: number;
    readonly color: Rgb;
    readonly alpha: number;
    /** How much light falls on it, 0..1. */
    readonly light: number;
    /** Lobes for a leaf (1, 3 or 5); the shaded side's share for a wall. */
    readonly variant: number;
    /** For a reflection: the waterline y it is clipped to. 0 is no reflection. */
    readonly water: number;
    /** Depth steps toward the haze. */
    readonly depth: number;
}
/** `#rrggbb` to 0..1 channels. */
export declare function rgb(hex: string): Rgb;
/** The colour `t` of the way from `a` to `b`. */
export declare function mix(a: Rgb, b: Rgb, t: number): Rgb;
/** Dabs as an instance buffer, in the order given (back first). */
export declare function packDabs(dabs: readonly Dab[]): Float32Array;
