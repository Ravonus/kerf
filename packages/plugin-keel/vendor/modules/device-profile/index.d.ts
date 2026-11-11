/**
 * device-profile: what kind of device this is, and how much to draw on it.
 *
 * The signals are read once (`readSignals`) and judged by a pure function
 * (`profileOf`), so any device can be replayed from a record of its signals.
 */
export type DeviceClass = "phone" | "tablet" | "desktop";
export type DeviceTier = "low" | "mid" | "high";
/** What a browser and its GPU say of themselves; any may be missing. */
export interface DeviceSignals {
    readonly userAgent: string;
    /** `navigator.userAgentData.mobile`, where a browser has it. */
    readonly mobile?: boolean;
    readonly touchPoints: number;
    /** The screen's short side, in CSS pixels. */
    readonly shortSide: number;
    readonly pixelRatio: number;
    /** Device memory, in GiB, and logical cores. */
    readonly memory?: number;
    readonly cores?: number;
    /** `MAX_FRAGMENT_UNIFORM_VECTORS`, 0 with no WebGL2. */
    readonly uniforms: number;
    /** The unmasked GPU name, where a browser gives it. */
    readonly gpu?: string;
}
export interface DeviceProfile {
    readonly class: DeviceClass;
    readonly tier: DeviceTier;
    readonly uniforms: number;
    /** The most parts a body should have here: what is worth the pixels, before what the GPU can hold. */
    readonly parts: number;
    /** The pixel ratio to draw at. */
    readonly pixelRatio: number;
}
export interface ProfileOptions {
    readonly force?: DeviceClass;
}
/** A phone, a tablet or a desktop. (An iPad's Safari calls itself a Mac: only its touch points give it away.) */
export declare function classOf(s: DeviceSignals): DeviceClass;
/**
 * How much it can draw: a software GPU or little memory is low whatever it is, a handheld mid at most, the rest high.
 */
export declare function tierOf(s: DeviceSignals, cls: DeviceClass): DeviceTier;
/** A device's profile, from its signals. */
export declare function profileOf(s: DeviceSignals, options?: ProfileOptions): DeviceProfile;
/** This browser's signals. */
export declare function readSignals(): DeviceSignals;
