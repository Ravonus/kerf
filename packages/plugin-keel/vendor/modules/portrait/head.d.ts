import type { Node } from "./sdf.js";
/** What a seed decides of a face, each a share around 1. */
export interface Features {
    /** Half the distance between the eyes' centres, in metres. */
    readonly eyes: number;
    readonly nose: number;
    readonly lips: number;
    readonly jaw: number;
    readonly chin: number;
    readonly cheeks: number;
}
/** The eyeball's radius, and how far its centre sits in front of the head frame's origin. */
export declare const EYE = 0.0118;
export declare const EYE_Z = 0.005;
/** How far the open upper lid's edge plane sits below the eye's centre (the shader shares it). */
export declare const LID_DROP = 0.0018;
/** The head as one shape, in its own frame. */
export declare function headShape(p: Features): Node;
