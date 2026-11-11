import type { TreeColors, TreeFrameLike, TreeSkin, TreeStrain, YearLike } from "../inputs.js";
import type { RootShard } from "./roots.js";
import type { Tree, TreeMotion } from "./tree.js";
export declare function poseWood(tree: Tree, frame: TreeFrameLike, motion: TreeMotion): void;
/** A chunk turned to face out from the planter at its angle, tipped out by `tilt` and rolled about its outward axis. */
export declare function writeShard(array: Float32Array, index: number, shard: RootShard): void;
/** The colours an internode's strain wears (the tree's own for strain 0, or when there are no strains). */
export declare function strainColors(tree: Tree, node: number): TreeColors;
/** The strain an internode belongs to, if the tree has strains. */
export declare const strainAt: (tree: Tree, node: number) => TreeStrain | undefined;
/** How far a leaf hangs below its twig on a weeping strain: strands of uneven length. */
export declare function strainDrop(tree: Tree, node: number, index: number): number;
/** Does this leaf grow as a needle sprig? The tree's own habit, unless its strain is a broadleaf kind. */
export declare function needleLeaf(tree: Tree, node: number): boolean;
/** The skin an internode's strain wears: the tree's own unless its strain sets one or drops it. */
export declare function strainSkin(tree: Tree, node: number): TreeSkin | null;
/**
 * A stable number for the clump a twig belongs to: its parent shoot, so the
 * leaves and flowers of neighbouring twigs share a tone and the crown reads
 * as masses (the `clumps` and `sprays` looks), not a per-leaf speckle.
 */
export declare function clumpOf(tree: Pick<Tree, "model">, node: number): number;
/** The year an internode's limbs live by: its strain's own, or the tree's. */
export declare function strainYear(tree: Tree, node: number, year: YearLike): YearLike;
/** The bark colour of wood this thick: the trunk's, a limb's or a twig's. */
export declare function trunkTone(trunk: readonly string[], radius: number): string | undefined;
export declare function paintWood(tree: Tree, frame: TreeFrameLike, dead: boolean): void;
