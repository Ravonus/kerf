/**
 * One look recipe for every keel/lit stage: the dithered pixel look or the lit,
 * full-colour realism look, picked and capped per target. MIT.
 *
 * The recipe is keel-engine core's `keel-look@1`, and `resolveLook` is its twin:
 * both are held to the same shared cases (test/look-cases.json, written by the
 * engine), so a game drawing meshes through keel/bake and a grove drawing a
 * keel/lit stage wear the same recipe the same way.
 *
 *   const look = resolveLook(recipe, LOOK_TARGETS.lit);
 *   const stage = stageOfLook(look);
 *   if (stage.dither) createVoxelDither(lit, renderer, stage.dither);   // the pixel look, or realism's grade
 *   renderer.toneMapping = stage.toneMapping ?? renderer.toneMapping;
 *   createTreeRender(lit, { ...stage.trees, model, frame });
 *   createForest(lit, { variants, places, maxLeaves: 1600 * stage.density });
 *   createPlantField({ detail: detail * stage.density, ... });
 *
 * The pixel look is voxel-dither's own settings (a style id and overrides, by
 * its names), so `stage.dither` goes straight to it, with the target's `limit`
 * beside them for voxel-dither to cap the style's levels and palette.
 *
 * Pure: no renderer, no globals.
 */
export declare const LOOK_RECIPE_FORMAT = "keel-look@1";
/** voxel-dither's screens, by its ids. */
export declare const LOOK_SCREENS: readonly ["auto", "bayer2", "bayer4", "bayer8", "halftone", "lines", "diagonal", "hatch", "ign", "stipple", "checker", "none"];
export type LookScreen = (typeof LOOK_SCREENS)[number];
/** The dithered look: a voxel-dither style and overrides, in its own names and ranges. */
export interface PixelLook {
    readonly style?: string;
    readonly screen?: LookScreen;
    readonly pixel?: number;
    readonly levels?: number;
    /** A small target keeps the first entries, so list them most needed first. */
    readonly palette?: readonly string[];
    readonly amount?: number;
    readonly shading?: "smooth" | "cel";
    readonly bands?: number;
    readonly outline?: number;
    readonly crease?: number;
    readonly contrast?: number;
    readonly saturation?: number;
}
/** The lit, full-colour look. */
export interface RealismLook {
    readonly exposure?: number;
    readonly tonemap?: "neutral" | "agx" | "aces";
    /** Ambient occlusion strength, 0 to 1. */
    readonly ao?: number;
    /** How much denser than the pixel look generators build, 1 to 4. */
    readonly density?: number;
    /** A pixel grade over the lit picture, or none. */
    readonly grade?: PixelLook | null;
}
export interface LookRecipe {
    readonly format: typeof LOOK_RECIPE_FORMAT;
    readonly pixel?: PixelLook;
    readonly realism?: RealismLook;
    readonly prefer?: "pixel" | "realism";
}
/** What a target can draw: whether it lights, its most colours (0: no limit) and its largest screen (0: any). */
export interface LookTarget {
    readonly lit: boolean;
    readonly paletteLimit: number;
    readonly screen: 0 | 2 | 4 | 8;
}
/** keel-engine core's targets, as lookTarget gives them (`lit` is native on a GPU that can light). */
export declare const LOOK_TARGETS: Readonly<Record<"lit" | "native" | "16-bit" | "8-bit" | "game-boy", LookTarget>>;
export interface ResolvedRealism {
    readonly exposure: number;
    readonly tonemap: "neutral" | "agx" | "aces";
    readonly ao: number;
    readonly density: number;
    readonly grade: PixelLook | null;
}
export type ResolvedLook = {
    readonly kind: "pixel";
    readonly pixel: PixelLook;
    readonly limit: {
        readonly levels: number;
        readonly colours: number;
    };
} | {
    readonly kind: "realism";
    readonly realism: ResolvedRealism;
};
export declare const REALISM_DEFAULTS: {
    readonly exposure: 1;
    readonly tonemap: "neutral";
    readonly ao: 0.7;
    readonly density: 2;
};
/**
 * Throws on anything that isn't a keel-look@1 recipe.
 *
 * @param recipe Untrusted input.
 * @returns The same recipe.
 */
export declare function checkLookRecipe(recipe: unknown): LookRecipe;
/**
 * The most tone steps per channel a target holds: levels cubed colours at most, under its palette limit.
 *
 * @param t The target.
 * @returns Tone steps, or 0 for no limit.
 */
export declare function maxLevels(t: LookTarget): number;
/**
 * The look a target draws from a recipe: realism where the target lights and the recipe prefers it (or has nothing
 * else), otherwise the pixel look narrowed to the target.
 *
 * @param recipe A keel-look@1 recipe.
 * @param target What the target can draw.
 * @returns The look, with every realism field settled, or the pixel look and the target's limits.
 */
export declare function resolveLook(recipe: LookRecipe, target: LookTarget): ResolvedLook;
/**
 * tree-render's options for one tree (`createTreeRender`): realism draws real blades and bark, without the looks made
 * for a few pixels per leaf. The pixel look leaves the host's own.
 */
export interface TreeLook {
    readonly form?: "smooth";
    readonly features?: {
        readonly sprays: false;
        readonly clumps: false;
        readonly rootSink: false;
    };
}
/** How a keel/lit stage draws a resolved look. */
export interface LitStageLook {
    readonly kind: "pixel" | "realism";
    /** voxel-dither's input (the pixel look, or realism's grade), or null to draw the lit picture straight. */
    readonly dither: (PixelLook & {
        readonly limit?: {
            readonly levels: number;
            readonly colours: number;
        };
    }) | null;
    /** keel/lit's tone mapping for a host without lit-finish, or null to keep the host's. */
    readonly toneMapping: "neutral" | "agx" | "aces-filmic" | null;
    readonly exposure: number;
    /** Ambient occlusion strength for a post that draws it (0 off). */
    readonly ao: number;
    /** Multiplies the generators' detail (plant fields, a forest's baked leaves, ground cover). */
    readonly density: number;
    readonly trees: TreeLook;
    /** lit-finish's input (`createLitFinish`: AO, haze, tone map, grade), or null for the pixel look. */
    readonly finish: {
        readonly exposure: number;
        readonly tonemap: ResolvedRealism["tonemap"];
        readonly ao: number;
    } | null;
}
/**
 * What a keel/lit stage sets for a resolved look.
 *
 * @param look From resolveLook.
 * @returns The dither input, tone mapping, exposure, AO, density, tree switches and lit-finish's input.
 */
export declare function stageOfLook(look: ResolvedLook): LitStageLook;
