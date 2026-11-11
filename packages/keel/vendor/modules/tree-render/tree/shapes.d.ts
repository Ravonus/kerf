import type { GeometryLike, LitLike } from "../inputs.js";
/** A slim pointed leaf, stalk at the origin and tip up +Y, as [half-width, height] pairs. */
export declare const LEAF_OUTLINE: readonly (readonly [number, number])[];
/**
 * A leaf blade folded along a pale midrib with darker margins, so even a few
 * pixels read as a leaf and not a dot. Colours are baked as vertex colours.
 */
export declare function bladeGeometry(lit: LitLike, outline?: readonly (readonly [number, number])[], fold?: number, bend?: number): GeometryLike;
/** The broad leaf blade with a soft margin (the `clumps` look). */
export declare function softBladeGeometry(lit: LitLike): GeometryLike;
export interface TreeShapes {
    readonly wood: GeometryLike;
    readonly leaf: GeometryLike;
    readonly blade: GeometryLike;
    readonly bud: GeometryLike;
    readonly box: GeometryLike;
    /** The broad blade with a soft margin (the `clumps` look). */
    readonly softBlade: GeometryLike;
    /** A blossom spray: a few round flower heads in a puff, lit on top and rose in its own shade (the `sprays` look). */
    readonly spray: GeometryLike;
}
/**
 * A spray of blossom as one shape: a few flower heads bunched round the twig.
 * Vertex colours carry two tones so the spray reads at a few pixels: the tops
 * of the heads catch the light near white, the undersides sink to a deeper,
 * rosier shade of the petal colour (red holds, green and blue drop).
 */
export declare function sprayGeometry(lit: LitLike): GeometryLike;
/** A conifer's needle sprig. */
export type NeedleKind = "pine" | "spruce" | "redwood";
/**
 * A conifer sprig for the forest: the same shoot and the same sweep of needles,
 * each one flat and wider, so `count` of them hold the sprig's mass for a tenth
 * of its triangles.
 */
export declare function lightSprig(lit: LitLike, kind: string, count: number): GeometryLike;
/** The needles of one conifer sprig. */
export declare function needleGeometry(lit: LitLike, kind: NeedleKind): GeometryLike;
export declare const NEEDLE_KINDS: Readonly<Record<string, NeedleKind>>;
/** A palm leaflet: a long narrow strap, slim at its base, tapering to a point. */
export declare const PALM_LEAFLET: readonly (readonly [number, number])[];
/**
 * The blade a species grows: needles for the conifers, arched straps for a palm, the broad leaf for everything else.
 */
export declare function speciesBlade(lit: LitLike, speciesId: string): GeometryLike;
/**
 * The shared shapes, made once per keel/lit namespace: round wood, low-poly leaf lumps, blades, buds and a unit box.
 */
export declare function treeShapes(lit: LitLike): TreeShapes;
