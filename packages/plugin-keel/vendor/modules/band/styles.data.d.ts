/** The band's styles and scales, as data. A style is a row: change a row, or add one, and the band plays it. MIT. */
export type Part = "kick" | "snare" | "hat" | "bass" | "chord" | "lead";
export type Timbre = "soft" | "keys" | "pluck" | "pad" | "bell" | "saw" | "square" | "sub";
export type ModeName = "major" | "minor" | "dorian" | "mixolydian" | "lydian" | "phrygian";
/** How the chord part plays its chord: held, stabbed, pulsed in eighths, or broken into single notes. */
export type Comp = "pad" | "stab" | "pulse" | "arp";
/** Semitones of each scale degree above the key note. */
export declare const MODES: Readonly<Record<ModeName, readonly number[]>>;
/**
 * One style. Drum rows are sixteen steps: `x` a hit, `o` a soft hit, `.` a rest. The bass row reads `r` root,
 * `5` fifth, `o` octave, `.` rest. Progressions are scale degrees from 0, one per bar.
 */
export interface Style {
    readonly tempo: readonly [number, number];
    /** How late the off sixteenths fall, as a share of a step. */
    readonly swing: number;
    readonly modes: readonly ModeName[];
    readonly progressions: readonly (readonly number[])[];
    /** Chance a chord takes a seventh. */
    readonly sevenths: number;
    readonly kick: readonly string[];
    readonly snare: readonly string[];
    readonly hat: readonly string[];
    readonly bass: readonly string[];
    readonly comp: Comp;
    /** Share of eighth notes the lead plays. */
    readonly lead: number;
    readonly voices: Readonly<Record<"chord" | "bass" | "lead", Timbre>>;
    /** Reverb and echo sends, 0 to 1. */
    readonly space: number;
    readonly echo: number;
    /** The order parts join in as energy rises. */
    readonly layers: readonly Part[];
}
export type StyleName = "ambient" | "lofi" | "synthwave" | "chiptune" | "house" | "cinematic" | "folk" | "dream";
export declare const STYLES: Readonly<Record<StyleName, Style>>;
export declare const STYLE_NAMES: StyleName[];
