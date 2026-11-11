export type Vec3 = readonly [number, number, number];
/** A sphere no butterfly enters (a face, a product): one that would is pushed to its surface. */
export interface KeepOut {
    readonly centre: Vec3;
    readonly radius: number;
}
/** The three colours of a butterfly, as hex. */
export interface ButterflyColors {
    /** The wings' upper side, their underside, and the body. */
    readonly upper: string;
    readonly under: string;
    readonly body: string;
}
/** How a flock looks and flies. Every field has a default (`DEFAULT_BUTTERFLIES`). */
export interface ButterflySettings {
    /** How many, 0 to 50. */
    readonly count: number;
    /** Lays the flock: the same seed, the same flights. */
    readonly seed: number;
    /** The point they wander about, and how far along x, y and z they may go from it, world units. */
    readonly centre: Vec3;
    readonly radius: Vec3;
    /** Wingspan, world units. */
    readonly scale: number;
    /** The slowest wander's rate, radians a second; the faster sines run at about 2 and 4 times it. */
    readonly speed: number;
    /** Wingbeats a second. */
    readonly flapHz: number;
    readonly colors: ButterflyColors;
    /** Multiplies the white edge light: over about 1 it reaches a bloom threshold of 1, so the edges glow. */
    readonly glow: number;
    /** Multiplies the wing and body colours. */
    readonly light: number;
    readonly keepOut: readonly KeepOut[];
}
export declare const DEFAULT_BUTTERFLIES: ButterflySettings;
/** One butterfly's flight: three rates, amplitudes and phases an axis (x0 x1 x2 y0 ... z2), and its wingbeat phase. */
export interface Flight {
    readonly rate: readonly number[];
    readonly reach: readonly number[];
    readonly phase: readonly number[];
    readonly flap: number;
}
/** Where a butterfly is and the way it faces (a unit vector). */
export interface Pose {
    readonly at: Vec3;
    readonly front: Vec3;
}
/** A uniform number in [0, 1) for a seed, a butterfly and a channel: a 32-bit integer hash, exact everywhere. */
export declare function flightHash(seed: number, index: number, channel: number): number;
/** Settings with every missing or out-of-range field put right. */
export declare function butterflySettings(partial?: Partial<ButterflySettings>): ButterflySettings;
/**
 * Lays a flock's flights from its settings: the same seed gives the same numbers on every engine.
 *
 * @param partial Settings; anything missing takes `DEFAULT_BUTTERFLIES`.
 * @returns One flight a butterfly.
 */
export declare function planFlights(partial?: Partial<ButterflySettings>): Flight[];
/**
 * Where a butterfly is at a time, and the way it faces.
 *
 * @param flight One of `planFlights`'s flights.
 * @param time Seconds on the host's clock.
 * @param settings The flock's settings (its centre and keep-outs).
 * @returns The pose.
 */
export declare function flyAt(flight: Flight, time: number, settings?: Partial<ButterflySettings>): Pose;
