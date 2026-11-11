import type { Species } from "./species.js";
import type { Vec } from "./math.js";
import type { LightGrid } from "./light.js";
/** Growing tree state, as parallel arrays so the graph stays flat and ordered. */
export interface Sim {
    readonly species: Species;
    readonly random: () => number;
    readonly grid: LightGrid;
    readonly maxNodes: number;
    readonly pos: Vec[];
    readonly dir: Vec[];
    readonly parent: number[];
    readonly order: number[];
    readonly birth: number[];
    readonly span: number[];
    readonly main: number[];
    readonly deadAt: number[];
    readonly shedAt: number[];
    readonly weak: number[];
    readonly children: number[][];
    readonly buds: Bud[];
    readonly nodeBuds: number[][];
    height: number;
}
interface Bud {
    readonly node: number;
    readonly dir: Vec;
    readonly terminal: boolean;
    alive: boolean;
    light: number;
    vigor: number;
}
/** A fresh internode: where it ends, which way it heads, its order, when it grows and whether it carries the axis. */
export interface NewNode {
    readonly pos: Vec;
    readonly dir: Vec;
    readonly order: number;
    readonly birth: number;
    readonly span: number;
    readonly main: boolean;
}
export declare function addNode(sim: Sim, parent: number, node: NewNode): number;
export declare function addBud(sim: Sim, node: number, dir: Vec, terminal: boolean): void;
/** What a cycle has to grow with: how vigour is scaled, the shade a branch starves under, and the wood allowed. */
export interface CycleBudget {
    readonly vigorScale: number;
    readonly shed: number;
    readonly allowed: number;
}
/**
 * One cycle of growth. `allowed` is how many internodes the growth curve
 * grants this cycle; when the buds want more, every shoot is trimmed by the
 * same share (rounded at random), so no part of the crown is favoured.
 */
export declare function growCycle(sim: Sim, cycle: number, budget: CycleBudget): void;
/** Old age: vigor fades, the top dies back, then limb after limb, until the tree stands dead. */
export declare function declineCycle(sim: Sim, cycle: number, decline: number): void;
export {};
