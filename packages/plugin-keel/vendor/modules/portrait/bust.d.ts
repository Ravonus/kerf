import { capFrame } from "./cap.js";
import { type Part } from "./parts.js";
import type { Features } from "./head.js";
import type { M3, V3 } from "./sdf.js";
export { type Part } from "./parts.js";
/** Which material a part draws with. */
export declare const PARTS: {
    skin: number;
    hand: number;
    eye: number;
    cap: number;
    hair: number;
    dress: number;
    chemise: number;
    gown: number;
    gold: number;
    card: number;
};
/** How a part sits: a rotation (rows take a point in) and where its origin is. */
export interface Pose {
    readonly turn: M3;
    readonly at: V3;
}
export interface Detail {
    /** Cell sizes in metres: the face, the rest of the skin, the hand, cloth and the cap. */
    readonly face: number;
    readonly body: number;
    readonly hand: number;
    readonly cloth: number;
    /** Rings of an eye; locks of hair, and each lock's segments and sides. */
    readonly eye: number;
    readonly locks: number;
    readonly segments: number;
    readonly sides: number;
}
export declare const DETAIL: Readonly<Record<"hero" | "mid" | "far", Detail>>;
/** Where the head's frame sits for each face version: A frontal, B turned and pitched down about the skull. */
export declare function headPose(face: "A" | "B"): Pose;
export interface BustRecipe {
    readonly seed: number;
    readonly face: "A" | "B";
    readonly detail: Detail;
    /** The hand: index raised with the card floating above it, or the card pinched. */
    readonly hand: "point" | "pinch";
}
export interface Bust {
    readonly parts: readonly Part[];
    readonly pose: Pose;
    readonly eyes: readonly [V3, V3];
    readonly cap: ReturnType<typeof capFrame>;
    /** Where the card is, in the bust's frame. */
    readonly card: Pose;
    readonly nails: readonly Nail[];
}
/** What a seed decides of the face, each a small share either side of the mean. */
export declare function featuresOf(seed: number): Features;
/** The last bone of each finger and the thumb, in the hand's frame: its two ends, its radius and its back. */
export interface Nail {
    readonly from: V3;
    readonly to: V3;
    readonly radius: number;
    readonly back: V3;
}
/** The recipe's digest: what the cache is keyed by. */
export declare function digestOf(recipe: BustRecipe): string;
/** The bust for a recipe, meshed once and then taken from the cache. */
export declare function buildBust(recipe: BustRecipe): Bust;
