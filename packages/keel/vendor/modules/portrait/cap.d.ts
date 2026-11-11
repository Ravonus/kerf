import type { Node, V3 } from "./sdf.js";
/** The cap's measures: the plane of the cuff's lower edge (`normal`·p = `edge`), the cuff's height, its axis. */
export interface CapFrame {
    readonly normal: V3;
    readonly edge: number;
    readonly cuff: number;
    readonly centre: V3;
}
/** Where the cap sits: version B pulls it 1 cm lower, so its shadow falls over the eyes. */
export declare function capFrame(face: "A" | "B"): CapFrame;
/** The cap: its body above the cuff's edge, the folded cuff a little proud of it. */
export declare function capShape(frame: CapFrame): Node;
