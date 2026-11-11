import type { NodeLike } from "./lit.js";
/** One of three scene parts a host can tag (say platform, tree, background) to give it its own signal. */
export type SignalPart = 1 | 2 | 3;
/**
 * The filters a part can wear on top of its signal, in the shader's numbering. Some move pixels
 * (mosaic, vhs, wave, slitscan, pixelsort, datamosh), the rest change colour before the tones are
 * stepped, so a filtered part is still dithered pixel art.
 */
export declare const SIGNAL_FILTERS: readonly ["none", "snow", "film", "mosaic", "cga", "negative", "glow", "vhs", "bleed", "wave", "nightvision", "sparkle", "thermal", "neon", "rainbow", "slitscan", "pixelsort", "datamosh", "holo"];
export type SignalFilter = (typeof SIGNAL_FILTERS)[number];
/**
 * A part's own scanlines, colour fringe and glitch, each 0 to 1, and an optional filter at `amount` (0 to 1, default
 * 1).
 */
export interface SignalSpec {
    readonly scanlines?: number;
    readonly chroma?: number;
    readonly glitch?: number;
    readonly filter?: SignalFilter;
    readonly amount?: number;
}
/** The alpha a tagged material writes into the scene target; untagged pixels keep 1. */
export declare const SIGNAL_TAG_ALPHA: Readonly<Record<SignalPart, number>>;
/** Packs up to three part signals into the shader's uniform, in part order. */
export declare function signalUniform(parts: readonly (SignalSpec | null | undefined)[]): Float32Array;
/** Packs up to three part filters into the shader's uniform: each filter's number and amount, in part order. */
export declare function filterUniform(parts: readonly (SignalSpec | null | undefined)[]): Float32Array;
export declare function tagTree(root: NodeLike, part: SignalPart): void;
/**
 * The layer detail parts are drawn on. The world pass leaves it out and the
 * detail pass sees nothing else; a host's camera should not use it.
 */
export declare const DETAIL_LAYER = 30;
export declare const DETAIL_MASK: number;
export declare function layerDetail(roots: ReadonlySet<NodeLike>, split: boolean): void;
