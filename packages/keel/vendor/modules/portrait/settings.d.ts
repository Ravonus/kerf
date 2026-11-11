import type { BustRecipe } from "./bust.js";
import type { Palette } from "./render.js";
export interface PortraitSettings {
    /** What decides the face and the hair, a whole number. */
    readonly seed: number;
    /** A frontal, eyes to camera; B turned 25° and looking down, the cap pulled lower. */
    readonly face: "A" | "B";
    readonly detail: "hero" | "mid" | "far";
    /** The card pinched between finger and thumb, or floating over a raised finger. */
    readonly hand: "pinch" | "point";
    /** The cap's, the hair's and the card's colours, #rrggbb. */
    readonly cap: string;
    readonly hair: string;
    readonly card: string;
}
export declare const DEFAULT_PORTRAIT_SETTINGS: PortraitSettings;
/**
 * Normalises untrusted settings, usually `KEEL_INPUTS.portrait`, into complete `PortraitSettings`.
 *
 * @param input Plain settings object, or undefined for all defaults.
 */
export declare function portraitSettings(input?: unknown): PortraitSettings;
/** The recipe and the palette a sitter's settings give. */
export declare function sitterOf(settings: PortraitSettings): {
    recipe: BustRecipe;
    palette: Palette;
};
