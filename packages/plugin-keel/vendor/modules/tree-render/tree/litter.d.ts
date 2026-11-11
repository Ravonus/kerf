import type { InstancedLike, SlotsLike, TreeFrameLike, YearLike } from "../inputs.js";
import type { OrnamentSet, Tick, Tree, TreeMotion } from "./tree.js";
/** Which slot of which set fell, and how far its kind scatters (fruit drops close; leaves and petals blow about). */
export interface Fallen {
    readonly slots: SlotsLike;
    readonly index: number;
    readonly scale: number;
}
/** Where a fallen leaf from `index` lies: under its twig, scattered by the drop, kept on the ground. */
export declare function litterSpot(tree: Tree, frame: TreeFrameLike, fallen: Fallen): {
    x: number;
    z: number;
};
export declare function ornamentsLying(set: OrnamentSet, year: YearLike, motion: TreeMotion): boolean;
export declare function soundBearer(set: OrnamentSet, frame: TreeFrameLike, index: number): boolean;
export declare function poseLitter(tree: Tree, tick: Tick): void;
export declare function paintLitter(tree: Tree, year: YearLike): void;
/** Snow settles in a thin slab along the top of every limb that is not too steep, sloping as the limb does. */
export declare function poseSnow(tree: Tree, mesh: InstancedLike, frame: TreeFrameLike, motion: TreeMotion): void;
export declare function spawnFallers(tree: Tree, frame: TreeFrameLike, year: YearLike, motion: TreeMotion): void;
export declare function drawFallers(tree: Tree, falling: InstancedLike, fallingLeaves: InstancedLike, motion: TreeMotion): void;
