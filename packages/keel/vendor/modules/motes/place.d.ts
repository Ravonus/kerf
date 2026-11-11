export type Vec3 = readonly [number, number, number];
/** How a field of motes looks and moves. Every field has a default (`DEFAULT_MOTES`). */
export interface MoteSettings {
    /** How many motes, 0 to 4096. */
    readonly count: number;
    /** Lays the field: the same seed, the same field. */
    readonly seed: number;
    /** The box the motes live in: its centre and its size along x, y and z, in world units. */
    readonly centre: Vec3;
    readonly box: Vec3;
    /** A mote's size in world units, and how far it may differ, as a share either way (0.5: 0.5 to 1.5 times). */
    readonly size: number;
    readonly sizeSpread: number;
    /** The smallest a mote is drawn, in drawing-buffer pixels: a smaller one is drawn this big and dimmer. */
    readonly minPixels: number;
    /** Hex colours; each mote takes one, seeded. */
    readonly colors: readonly string[];
    /** Opacity at full blink, 0 to 1, and a multiplier on the colour (over 1 reaches a bloom threshold). */
    readonly opacity: number;
    readonly intensity: number;
    /** World units a second the whole field drifts; the box wraps, so the field never empties. */
    readonly drift: Vec3;
    /** How far, in world units, each mote wanders about its drifting place. */
    readonly turbulence: number;
    /** The shortest and longest blink period, seconds; each mote takes one between, seeded. */
    readonly blinkPeriod: readonly [number, number];
    /** How deep the blink goes: 0 a steady light, 1 out to nothing at the trough. */
    readonly blink: number;
    /** The share of motes drawn as four-pointed sparkles, 0 to 1. */
    readonly sparkle: number;
    /** True: `size` is in world units and shrinks with distance. False: `size` is in drawing-buffer pixels. */
    readonly attenuate: boolean;
}
export declare const DEFAULT_MOTES: MoteSettings;
/** Where motes are welcome, 0 (never) to 1 (always), at a point in world units; the field is thinned by it. */
export type MoteDensity = (x: number, y: number, z: number) => number;
/**
 * The field laid out, one entry a mote. `mote` is four numbers a mote: x, y, z and the blink phase in radians. `life`
 * is four: the blink period in seconds, the size, 1 for a sparkle or 0 for a dot, and a seed from 0 to 1 for the
 * turbulence. `color` is each mote's index into the colours.
 */
export interface MoteField {
    readonly count: number;
    readonly mote: Float32Array;
    readonly life: Float32Array;
    readonly color: Uint8Array;
}
/** A uniform number in [0, 1) for a seed, a mote and a channel: a 32-bit integer hash, exact everywhere. */
export declare function moteHash(seed: number, index: number, channel: number): number;
/** Settings with every missing or out-of-range field put right. */
export declare function moteSettings(partial?: Partial<MoteSettings>): MoteSettings;
/**
 * Lays a field of motes from its settings: the same settings and seed give the same numbers on every engine.
 *
 * @param partial Settings; anything missing takes `DEFAULT_MOTES`.
 * @param density Optional: where motes are welcome, to make a field denser in some places than others.
 * @returns The field, ready to upload as instance attributes.
 */
export declare function placeMotes(partial?: Partial<MoteSettings>, density?: MoteDensity): MoteField;
