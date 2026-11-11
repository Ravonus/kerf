/** The band's instruments, on plain Web Audio: a few oscillators, a filter and an envelope each. MIT. */
import type { Timbre } from "./styles.data.js";
/** One sounding note: when it starts, its pitch, how long it is held and how loud (0 to 1). */
export interface Hit {
    readonly time: number;
    readonly frequency: number;
    readonly seconds: number;
    readonly gain: number;
}
/**
 * Plays one note of a timbre into `out`.
 *
 * @param ctx The audio context, live or offline.
 * @param out Where the note goes.
 * @param timbre Which instrument.
 * @param hit When, what pitch, how long and how loud.
 */
export declare function strike(ctx: BaseAudioContext, out: AudioNode, timbre: Timbre, hit: Hit): void;
/** What a drum needs: the context, where it goes and the noise it is cut from. */
export interface DrumRig {
    readonly ctx: BaseAudioContext;
    readonly out: AudioNode;
    readonly noise: AudioBuffer;
}
/**
 * Plays one drum hit.
 *
 * @param rig The context, the output and a buffer of white noise.
 * @param part Which drum.
 * @param time When it lands.
 * @param gain How hard, 0 to 1.
 */
export declare function drum(rig: DrumRig, part: "kick" | "snare" | "hat", time: number, gain: number): void;
