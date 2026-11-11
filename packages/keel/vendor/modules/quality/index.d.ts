/**
 * One setting for how good a scene looks. A level says what to spend; where the
 * camera is says what is worth spending it on, so a view from the shore traces
 * the sand's shadows and a dive spends the same rays on light shafts. MIT.
 *
 *   const quality = createQuality({ level: "auto", tier: device.tier });
 *   quality.at({ under, depth, height, clearance })  -> what to draw this frame
 *   quality.frame(milliseconds)                      -> tell it how the last one went
 *   quality.levers                                   -> what a scrolled page's scenes may spend
 *
 * Pure: nothing here reads a clock or a GPU, so the caller hands it frame times
 * and any run can be replayed from them.
 */
export type Level = "low" | "medium" | "high" | "ultra";
export type Tier = "low" | "mid" | "high";
/** What a renderer may spend on one frame. */
export interface Settings {
    readonly level: Level;
    /** Pixels drawn, as a share of the screen's width and height. */
    readonly renderScale: number;
    /** Rebuild the full image from past frames. */
    readonly upscale: boolean;
    /** Steps a reflected ray takes through the ground; 0 reflects only the sky. */
    readonly reflectSteps: number;
    /** Steps a ray toward the sun takes; 0 casts no traced shadows. */
    readonly shadowSteps: number;
    /** How far a reflected ray runs, metres. */
    readonly traceFar: number;
    /** How far from the eye water is traced at all, metres. */
    readonly traceNear: number;
    /** How many simple shapes stand in for animals in the rays. */
    readonly casters: number;
    /** Steps through the water for light shafts. */
    readonly shafts: number;
    /** Shells of marine snow. */
    readonly snow: number;
    /** The share of the surf's spray drawn, from 0 to 1. */
    readonly spray: number;
}
/** What a scrolled page's scenes may spend: the levers a scene's `setQuality` takes, beside the settings above. */
export interface Levers {
    /** Pixels drawn, as a share of the screen's width and height: the governed scale. */
    readonly renderScale: number;
    /** Bloom, as a share of a scene's own: 0 turns it off. */
    readonly bloom: number;
    /** The share of a scene's motes and other particles drawn, 0 to 1. */
    readonly motes: number;
    /** The outgoing scene's scale during a hand-over between two scenes, as a share of `renderScale`. */
    readonly blendScale: number;
    /** Temporal antialiasing. */
    readonly taa: boolean;
    /** The share of a scene's detail (crowds, foliage, level of detail) drawn, 0 to 1. */
    readonly density: number;
}
/**
 * A level's page levers at a render scale.
 *
 * @param level The level in use.
 * @param scale The render scale, as the governor holds it.
 */
export declare function leversFor(level: Level, scale: number): Levers;
/** Where the camera is. */
export interface Place {
    readonly under: boolean;
    /** Metres under the water; 0 above it. */
    readonly depth: number;
    /** Metres above the water; 0 under it. */
    readonly height: number;
    /** Metres from the camera down to the ground, or to the sea floor. */
    readonly clearance: number;
}
/**
 * Spends a level by where the camera is.
 *
 * @param settings What the level allows.
 * @param place Where the camera is.
 * @returns What is worth drawing there.
 */
export declare function settingsAt(settings: Settings, place: Place): Settings;
export interface QualityInput {
    /** A level, or "auto" to take it from the device. */
    readonly level?: Level | "auto";
    /** `device-profile`'s tier, for "auto". */
    readonly tier?: Tier;
    /** The frame time to hold, milliseconds. 1000 / 60 by default. */
    readonly target?: number;
    /** The lowest render scale the governor may reach. */
    readonly floor?: number;
    /** Ray traced reflections and shadows, on by default where the level has them. */
    readonly tracing?: boolean;
    /** Rebuilding the image from past frames, on by default where the level has it. */
    readonly upscale?: boolean;
    /** Whether the surf throws spray. */
    readonly spray?: boolean;
}
/** What can be switched while running. */
export interface Switches {
    readonly tracing?: boolean;
    readonly upscale?: boolean;
    readonly spray?: boolean;
    readonly level?: Level;
}
export interface Quality {
    /** The level in use. */
    readonly level: Level;
    /** What to draw from this place, at the governed render scale. */
    at(place: Place): Settings;
    /** Reports how long the last frame took. */
    frame(milliseconds: number): void;
    /** The render scale the governor has settled on. */
    readonly scale: number;
    /** Whether rays are on. */
    readonly tracing: boolean;
    /** Whether upscaling is on. */
    readonly upscale: boolean;
    /** Whether the surf throws spray. */
    readonly spray: boolean;
    /** Turns tracing, upscaling or spray on or off, or changes level, at once. */
    set(switches: Switches): void;
    /** The page levers for the level in use, at the governed render scale. */
    readonly levers: Levers;
}
/**
 * Picks a level, and keeps it to the frame rate by lowering the render scale.
 * With upscaling on, scale is the cheapest thing to give up.
 *
 * @param input The level, the device's tier, and the frame time to hold.
 * @returns A quality to ask each frame.
 */
export declare function createQuality(input?: QualityInput): Quality;
