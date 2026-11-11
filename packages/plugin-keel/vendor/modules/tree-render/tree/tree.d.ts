import type { ColorLike, GeometryLike, InstancedLike, LitLike, NodeLike, OrnamentSpecLike, SlotsLike, TreeBloom, TreeColors, TreeFrameLike, TreeGround, TreeKindOrnaments, TreeModelLike, TreeSkin, TreeStrain, YearLike } from "../inputs.js";
import type { TreeFeature, TreeFeatures } from "../features.js";
import type { Offset } from "../wind.js";
import type { TreeShapes } from "./shapes.js";
import type { OrnamentLook } from "./bark.js";
import type { RootBreak } from "./roots.js";
import type { FrondLayout } from "./leaves.js";
export interface TreeLimits {
    readonly litter?: number;
    readonly flowerLitter?: number;
    readonly fruitLitter?: number;
    readonly falling?: number;
}
export interface TreeRenderOptions {
    readonly colors: TreeColors;
    readonly ground?: TreeGround;
    readonly features?: Partial<Record<TreeFeature, boolean>> | string;
    /** "smooth" draws round wood and leaf blades; "voxel" draws everything as blocks. */
    readonly form?: "smooth" | "voxel";
    /** Swap a shape (a skin's crystal leaves, coin leaves). Blades are any shape with vertex colours. */
    readonly shapes?: Partial<Pick<TreeShapes, "wood" | "leaf" | "blade" | "bud">>;
    readonly skin?: TreeSkin | null;
    readonly limits?: TreeLimits;
    readonly seed?: number;
    /**
     * Strains of a hybrid or chimera, by number; strain 0 is the tree's own colours and skin, so `strains[0]` is not
     * read.
     */
    readonly strains?: readonly TreeStrain[];
    /** Each internode's strain (tree-growth's `sectors`); its leaves, flowers, fruit and bark take that strain's look. */
    readonly strainOf?: ArrayLike<number>;
    /**
     * A mixed bloom: each blossom opens in one of these colours, by share (codominant flower colour). Left out, blossoms
     * take the strain's spring colours.
     */
    readonly blooms?: readonly TreeBloom[];
    /** Minor kinds' own flowers and fruit: cherry limbs on an oak blossom though the oak only hangs catkins. */
    readonly kinds?: readonly TreeKindOrnaments[];
}
/** What moves the tree this frame. `snow` 0..1 lies along the limbs; `snowed` hides litter under fresh snow. */
export interface TreeMotion {
    readonly elapsed: number;
    readonly delta?: number;
    readonly wind: number;
    /** The way the wind blows toward, in radians from +x toward +z (see `breezeAt`). */
    readonly windDir?: number;
    readonly dead?: boolean;
    readonly snow?: number;
    readonly snowed?: boolean;
    /**
     * How much the built-in sway field moves the wood, leaves and fruit (1, the
     * default). A host that moves the tree itself (keel/tree-mechanics) passes 0:
     * leaves still flutter and hanging fruit still swings on its stalk.
     */
    readonly field?: number;
    /**
     * Each strain's own year (tree-growth `yearState` for its species), so its
     * limbs leaf out, blossom and turn on their own calendar: an oak limb on a
     * cherry is still in bud while the cherry blooms. Strain 0, and any left
     * out, follow the tree's year.
     */
    readonly strainYears?: readonly (YearLike | undefined)[];
}
/** One frame's input: the grown frame, the year and what moves the tree. */
export interface Tick {
    readonly frame: TreeFrameLike;
    readonly year: YearLike;
    readonly motion: TreeMotion;
}
export interface TreeMeshes {
    readonly wood: InstancedLike;
    readonly leaves: InstancedLike | null;
    readonly flowers: InstancedLike | null;
    readonly fruit: InstancedLike | null;
    readonly leafLitter: InstancedLike | null;
    readonly litter: InstancedLike | null;
    readonly snow: InstancedLike | null;
    readonly falling: InstancedLike | null;
    readonly fallingLeaves: InstancedLike | null;
    /** Chunks of planter an old tree's roots broke loose (`rootBreak`, smooth form, on a planter). */
    readonly shards: InstancedLike | null;
}
export interface TreeRender {
    /** Add this to the scene once. */
    readonly group: unknown;
    readonly features: TreeFeatures;
    /** The instanced meshes, for a host that swaps materials (skins) or adds effects (night glow). Off parts are null. */
    readonly meshes: TreeMeshes;
    /** Minor kinds' own flowers and fruit, one mesh per set (see `TreeRenderOptions.kinds`). */
    readonly kinds: readonly InstancedLike[];
    /** Pose and, when the season or frame changed, repaint. Call every frame. */
    update(frame: TreeFrameLike, year: YearLike, motion: TreeMotion): void;
    /** Leaves, petals and fruit falling or lying where they landed, for a host's own drawing (a canvas fallback). */
    readonly fallers: readonly Readonly<Pick<Faller, "x" | "y" | "z" | "size" | "color" | "landed" | "kind">>[];
    /** The ripe fruit as of the last update, hanging on the tree or lying under it, for animals to eat. */
    fruit(): TreeFruit[];
    /**
     * Take a fruit (by its `TreeFruit.key`) off the tree or the ground until next year's crop. False when there was none.
     */
    eat(key: string): boolean;
    /** Repaint on the next update (after a material swap, say). */
    repaint(): void;
    dispose(): void;
}
/** A ripe fruit, where it hangs or lies. Its `key` holds while it ripens, falls and lies. */
export interface TreeFruit {
    readonly key: string;
    /** The ornament kind: "apple", "acorn", "cherry" and so on. */
    readonly kind: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** Its size across, in scene units. */
    readonly size: number;
    /** On the tree (true) or on the ground under it. */
    readonly hanging: boolean;
}
export interface OrnamentSet {
    readonly name: "flowers" | "fruit";
    /** A minor kind's set opens on this strain's year and ignores the tree's own bearing rules; -1 is the tree's own. */
    readonly strain: number;
    readonly spec: OrnamentSpecLike;
    readonly look: OrnamentLook;
    readonly slots: SlotsLike;
    readonly mesh: InstancedLike;
    readonly litterStart: number;
    readonly litterLimit: number;
    readonly stride: number;
    /** Drawn as sprays (the `sprays` look): every `thin`th slot draws, `grow` times its size, one tone per twig. */
    readonly spray: boolean;
    readonly thin: number;
    readonly grow: number;
}
/**
 * How a blossom set draws as sprays: a big crown keeps every other slot at twice the size (fewer, readable sprays); a
 * small one keeps all.
 */
export declare function sprayPlan(tree: Pick<Tree, "features" | "smooth">, spec: OrnamentSpecLike, slots: SlotsLike, own: boolean): {
    spray: boolean;
    thin: number;
    grow: number;
};
export interface Faller {
    readonly key: string;
    readonly kind: "leaf" | "flowers" | "fruit";
    x: number;
    y: number;
    z: number;
    vx: number;
    vz: number;
    readonly phase: number;
    readonly size: readonly [number, number, number];
    readonly color: string;
    readonly speed: number;
    landed: boolean;
}
export interface Tree {
    readonly lit: LitLike;
    readonly model: TreeModelLike;
    readonly colors: TreeColors;
    readonly ground: TreeGround;
    readonly features: TreeFeatures;
    readonly smooth: boolean;
    readonly blades: boolean;
    /** Conifer needles: each sprig lies along its twig, stiff, instead of hanging off it like a leaf. */
    readonly needles: boolean;
    /** A palm's leaflets, laid out in two rows down each frond. */
    readonly fronds: FrondLayout | null;
    readonly skin: TreeSkin | null;
    readonly strains: readonly TreeStrain[];
    readonly strainOf: ArrayLike<number> | null;
    readonly blooms: readonly TreeBloom[];
    strainYears: readonly (YearLike | undefined)[];
    readonly group: NodeLike;
    readonly meshes: TreeMeshes;
    readonly flowers: OrnamentSet | null;
    readonly fruits: OrnamentSet | null;
    readonly kinds: readonly OrnamentSet[];
    readonly limits: Required<TreeLimits>;
    readonly leafStride: number;
    readonly hidden: Map<string, {
        readonly rank: number;
        readonly kind: Faller["kind"];
        readonly index: number;
    }>;
    /**
     * The same slots by kind, for the per-slot test in every pose pass (a number lookup, not a string built per slot per
     * frame).
     */
    readonly hiddenSlots: Readonly<Record<Faller["kind"], Set<number>>>;
    /** Fruit animals have eaten this year, by set ("fruit", or "kind<n>" for a minor kind's) and slot. */
    readonly eaten: Map<string, Set<number>>;
    lastYear: YearLike | null;
    lastMotion: TreeMotion | null;
    readonly fallers: Faller[];
    readonly random: () => number;
    readonly a: ColorLike;
    readonly b: ColorLike;
    readonly c: ColorLike;
    readonly offset: Offset;
    spawnClock: number;
    paintKey: string;
    lastFrame: TreeFrameLike | null;
    /** The host moves the tree itself this frame (`field: 0`): no sway field at all. */
    still: boolean;
    readonly seed: number;
    /** The roots' break plans (`rootBreak`) and the trunk radius they were made for. */
    readonly breaks: {
        trunk: number;
        plans: readonly RootBreak[];
    };
}
/**
 * How a part's mesh is lit: its roughness, whether it casts shadows, and whether it is a sheet seen from both
 * sides.
 */
export interface MeshLook {
    readonly roughness: number;
    readonly shadows: boolean;
    readonly sheet?: boolean;
}
export declare function makeMesh(tree: Pick<Tree, "lit" | "group">, geometry: GeometryLike, count: number, look: MeshLook): InstancedLike;
export declare const ornamentState: (set: OrnamentSet, year: YearLike) => {
    open: number;
    fallen: number;
};
/** How far in from the tips foliage reaches: needles clothe a conifer's limbs most of the way in; other evergreens keep
 * leaves near the tips, and everything else only at them. */
export declare function tipLimitOf(needles: boolean, evergreen: boolean): number;
export declare const leafTipLimit: (tree: Tree) => number;
/** Is node a living, leafy twig right now? Outer twigs carry the foliage. */
export declare function leafyNode(frame: TreeFrameLike, node: number, tipLimit: number): boolean;
/**
 * Does this node bear a set's flowers or fruit right now? A minor kind's own set (strain 0 or more) ignores whether
 * the node's strain bears.
 */
export declare function bearingNode(tree: Tree, frame: TreeFrameLike, set: Pick<OrnamentSet, "spec" | "strain">, node: number): boolean;
/** One grown tree as live instanced meshes. Build once per model; call `update` every frame. */
export declare function createTreeRender(lit: LitLike, model: TreeModelLike, options: TreeRenderOptions): TreeRender;
