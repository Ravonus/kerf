import type { ColorLike, GeometryLike, TreeKindOrnaments, YearLike } from "../inputs.js";
import type { OrnamentSet, Tick, Tree, TreeFruit, TreeMotion } from "./tree.js";
import type { V3 } from "../instances.js";
type SetHost = Pick<Tree, "lit" | "group" | "model" | "features" | "smooth">;
/** What a set draws as: its shape, and the spray shape a blossom set may take instead (the `sprays` look). */
export interface SetShape {
    readonly shape: GeometryLike;
    readonly spray?: GeometryLike | null;
}
/** The tree's own set also owns a run of slots in the litter mesh. */
export interface SetLitter extends SetShape {
    readonly litterStart: number;
    readonly litterLimit: number;
}
export declare function ornamentSet(tree: SetHost, name: OrnamentSet["name"], draw: SetLitter): OrnamentSet | null;
/** A minor kind's flowers or fruit as a set of their own (no litter: they fall with the tree's own). */
export declare function kindSet(tree: SetHost, kind: TreeKindOrnaments, name: OrnamentSet["name"], draw: SetShape): OrnamentSet | null;
/** The year a set keeps: a minor kind's own calendar, else the tree's. */
export declare const kindYear: (tree: Tree, set: OrnamentSet, year: YearLike) => YearLike;
export declare const eatenSlot: (tree: Tree, set: OrnamentSet, index: number) => boolean;
/** A new crop starts clean: once a set has no fruit open, last year's eaten slots are forgotten. */
export declare function forgetEaten(tree: Tree, year: YearLike): void;
export declare function ripeFruit(tree: Tree): TreeFruit[];
export declare function eatFruit(tree: Tree, key: string): boolean;
/** The air a pass poses in: the frame's motion, the wind the sway field uses and the tree's height. */
export interface Air {
    readonly motion: TreeMotion;
    readonly wind: number;
    readonly height: number;
}
/** The sway field's offset into `tree.offset`, or none when the host moves the tree itself. */
export declare function stillOrSway(tree: Tree, p: V3, air: Air, wind?: number): void;
export declare function poseOrnaments(tree: Tree, set: OrnamentSet, tick: Tick): void;
export declare function ornamentColor(tree: Tree, set: OrnamentSet, index: number, year: YearLike): ColorLike;
export declare function paintOrnaments(tree: Tree, set: OrnamentSet, year: YearLike): void;
export {};
