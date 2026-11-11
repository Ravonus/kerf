import type { InstancedLike, MaterialLike } from "../inputs.js";
import type { CardRow, ForestLitLike, RendererLike, Vector4Like } from "./forest.js";
export declare const MAX_VARIANTS = 8;
export interface Cards {
    readonly mesh: InstancedLike;
    readonly material: MaterialLike;
    readonly uniforms: Record<string, {
        value: unknown;
    }>;
    readonly card: Float32Array;
    readonly target: InstanceType<ForestLitLike["RenderTarget"]>;
    readonly frames: number;
    readonly cell: number;
    /** The tree shapes the atlas is rendered from, kept while cards are drawn: the seasons re-render it. */
    readonly rows: readonly CardRow[];
    readonly capacity: number;
    key: string;
    idle: number;
}
/** How the cards are drawn: views round each tree, the pixel size of one, and the distance they take over at. */
export interface CardSheet {
    readonly frames?: number | undefined;
    readonly cell?: number | undefined;
    readonly lod: Vector4Like;
}
export declare function createCards(lit: ForestLitLike, baked: readonly CardRow[], count: number, sheet: CardSheet): Cards;
/** Renders every variant from `frames` angles round it into one atlas row each. */
export declare function bakeCards(lit: ForestLitLike, renderer: RendererLike, cards: Cards, baked: readonly CardRow[]): void;
