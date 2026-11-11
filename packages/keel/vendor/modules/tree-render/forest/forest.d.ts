import type { ColorLike, GeometryLike, LitLike, MaterialLike, NodeLike, TreeColors, TreeFrameLike, TreeModelLike, Vector3Like, YearLike } from "../inputs.js";
import type { Box } from "./bake.js";
export type { Vector4Like } from "./bake.js";
/** One kind of background tree: a grown model posed once, in its species' colours. */
export interface ForestVariant {
    readonly model: TreeModelLike;
    readonly frame: TreeFrameLike;
    readonly colors: TreeColors;
}
/** Where one background tree stands, which variant it is, and a brightness tint (1 as is). */
export interface ForestPlace {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly scale: number;
    readonly variant: number;
    readonly tint: number;
}
export interface ForestPlacesInput {
    readonly seed: number;
    readonly count: number;
    readonly inner: number;
    readonly outer: number;
    readonly variants: number;
    /** Ground height at (x, z), or null where no tree may stand (water, a road). */
    readonly height: (x: number, z: number) => number | null;
    /** Least room between two trees. */
    readonly gap?: number;
    readonly scale?: readonly [number, number];
    /** 0 spreads trees evenly; 1 gathers them into groves with clearings between. */
    readonly clump?: number;
}
/**
 * Scatters trees over a ring by dart throwing: no two closer than `gap`,
 * thinned into groves and clearings by a low-frequency field, each with its
 * own variant, turn, size and shade.
 */
export declare function forestPlaces(input: ForestPlacesInput): ForestPlace[];
export interface ForestOptions {
    readonly variants: readonly ForestVariant[];
    readonly places: readonly ForestPlace[];
    /** Beyond this distance from the camera a tree is an impostor card. */
    readonly near?: number;
    /** Dither band where geometry and card cross-fade. */
    readonly band?: number;
    /** Most leaves baked into one variant; the rest are skipped and the kept ones drawn larger. */
    readonly maxLeaves?: number;
    /** Twigs thinner than this are left out of the baked wood. */
    readonly minRadius?: number;
    /** Views round each variant on its impostor card (the sprite ladder). */
    readonly frames?: number;
    /** Pixel size of one impostor view. */
    readonly cell?: number;
    /** Near-lens dissolve: gone at [0], solid from [1] (view depth, world units). */
    readonly fade?: readonly [number, number];
    /** Updates a level may sit unused before it is freed. */
    readonly keep?: number;
}
/** The light and air the forest sits in, from the host's scene. */
export interface ForestUpdate {
    readonly camera: {
        readonly position: {
            readonly x: number;
            readonly y: number;
            readonly z: number;
        };
    };
    /** Needed to bake impostors; without it every tree stays geometry. */
    readonly renderer?: RendererLike | null;
    readonly year: YearLike | ((variant: number) => YearLike);
    readonly elapsed: number;
    readonly wind: number;
    /** Brightness of the baked cards (the scene's light colour, roughly ambient + sun). */
    readonly light?: readonly [number, number, number];
    readonly fog?: {
        readonly color: readonly [number, number, number];
        readonly near: number;
        readonly far: number;
    } | null;
    /** Whole pixels to move the fades' dither by this frame (lit-finish's `ditherOffset()`); default still. */
    readonly dither?: readonly [number, number];
}
export interface Forest {
    readonly group: unknown;
    /** Trees drawn at each level from the current view, the levels held, and the triangles drawn. */
    readonly levels: {
        readonly close: number;
        readonly full: number;
        readonly layered: number;
        readonly cards: number;
        readonly built: number;
        readonly triangles: number;
    };
    update(input: ForestUpdate): void;
    /** Moves, adds or removes trees without rebuilding anything already built. */
    setPlaces(places: readonly ForestPlace[]): void;
    dispose(): void;
}
/** The renderer calls the impostor bake makes. Pass the WebGLRenderer itself. */
export interface RendererLike {
    getRenderTarget(): unknown;
    setRenderTarget(target: unknown): void;
    getClearColor(target: ColorLike): ColorLike;
    getClearAlpha(): number;
    setClearColor(color: ColorLike, alpha: number): void;
    clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
    render(scene: unknown, camera: unknown): void;
    autoClear: boolean;
}
/** keel/lit parts the forest needs beyond the tree's. */
export interface ForestLitLike extends LitLike {
    readonly Stage: new () => NodeLike;
    readonly OrthoCamera: new (left: number, right: number, top: number, bottom: number, near: number, far: number) => NodeLike & {
        lookAt(x: number, y: number, z: number): void;
        updateProjectionMatrix(): void;
    };
    readonly RenderTarget: new (width: number, height: number, options?: Readonly<Record<string, unknown>>) => {
        readonly texture: unknown;
        viewport: {
            set(x: number, y: number, w: number, h: number): void;
        };
        scissor: {
            set(x: number, y: number, w: number, h: number): void;
        };
        scissorTest: boolean;
        dispose(): void;
    };
    readonly SkyLight: new (sky: string, ground: string, intensity: number) => NodeLike;
    readonly SunLight: new (color: string, intensity: number) => NodeLike;
    readonly Matrix4: new () => {
        readonly elements: number[];
        makeRotationY(angle: number): unknown;
        compose(position: unknown, quaternion: unknown, scale: unknown): unknown;
    };
    readonly Quaternion: new () => {
        setFromAxisAngle(axis: Vector3Like, angle: number): unknown;
    };
}
export interface CardRow {
    readonly geometry: GeometryLike;
    readonly material: MaterialLike;
    readonly box: Box;
}
/**
 * Many trees, cheaply, at any distance. Every level is cut from the real tree
 * and nobody asks for one: the richest (all its wood, its leaves filled out)
 * near the eye, the plain bake to `near`, then its big wood and real crown
 * masses under a few big leaves, then an impostor card from an atlas of baked
 * views. Each level is one instanced mesh shared by every tree that needs it,
 * built the first time a tree comes within its distance, crossed to and from on a
 * dither, and freed again once nothing has used it for a while; two forests of the
 * same tree share one shape. A forest seen only from afar never builds its
 * near levels, and one seen only close never builds cards. Nothing is drawn right at the lens.
 */
export declare function createForest(lit: ForestLitLike, options: ForestOptions): Forest;
