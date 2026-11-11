import type { Node, V3 } from "./sdf.js";
/** How each finger's three joints bend (degrees, index to little), and where the thumb's tip goes. */
export interface HandPose {
    readonly bend: readonly (readonly [number, number, number])[];
    readonly spread: readonly number[];
    /** The thumb's tip: a finger (0 index, 1 middle) and a share along its last bone, or null for the thumb's rest. */
    readonly thumbTo: readonly [number, number] | null;
}
/** Index raised, the thumb ringed with the middle finger, the others curled. */
export declare const POINT: HandPose;
/** Index and thumb pads together, as holding a card's edge; the others curled behind. */
export declare const PINCH: HandPose;
export interface Finger {
    /** Joints from the knuckle to the tip. */
    readonly joints: readonly V3[];
    readonly radius: number;
    /** The back of the last bone, a unit direction (where its nail is). */
    readonly back: V3;
}
/** A finger's joints: each bone turned toward the palm by the bend so far, and out by its spread. */
export declare function finger(i: number, pose: HandPose): Finger;
/** The thumb's joints: its base fixed, its two outer bones bent to reach the target. */
export declare function thumb(pose: HandPose, fingers: readonly Finger[]): Finger;
export interface HandShape {
    readonly node: Node;
    readonly fingers: readonly Finger[];
    readonly thumb: Finger;
}
/** The hand posed. Each finger melts into the palm on its own, then the hand is their union. */
export declare function handShape(pose: HandPose): HandShape;
