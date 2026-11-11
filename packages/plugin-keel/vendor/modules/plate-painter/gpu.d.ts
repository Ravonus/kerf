import { type PlatePlan } from "./plan.js";
/** A rectangle of the plate in plate fractions: left, top, width, height. */
export type PlateView = readonly [number, number, number, number];
/** The size of a painted plate in pixels, and the part of the plate it holds (all of it unless said). */
export interface PlateSize {
    readonly width: number;
    readonly height: number;
    readonly view?: PlateView;
}
/** A painted plate: a texture whose row 0 is the plate's top. */
export interface Plate {
    readonly texture: WebGLTexture;
    readonly width: number;
    readonly height: number;
    readonly digest: string;
    readonly view: PlateView;
}
/** Where and how the backdrop is drawn. */
export interface BackdropView {
    /** The target rectangle in pixels; x and y from the bottom left as WebGL counts. */
    readonly width: number;
    readonly height: number;
    readonly x?: number;
    readonly y?: number;
    /** 1 fits the plate to cover the target; above 1 leaves room to move. */
    readonly zoom?: number;
    /** The point of the plate kept in view, 0..1 each way. */
    readonly focus?: readonly [number, number];
    /** The parallax hook: a move in crop widths and heights (small, ±0.05), held inside the plate. */
    readonly shift?: readonly [number, number];
}
/** Pixels of a plate, rows from the top, RGBA: what `new ImageData(data, width, height)` takes. */
export interface PlateStill {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
}
export interface PlatePainter {
    /** Paints a plan, or returns the plate already painted for the same digest, size and view. */
    paint(plan: PlatePlan, size: PlateSize): Plate;
    /** Draws a plate over the bound framebuffer as a screen-locked backdrop. */
    draw(plate: Plate, view: BackdropView): void;
    /** Reads a plate back, for a still. */
    read(plate: Plate): PlateStill;
    /** Frees one plate and forgets it. */
    release(plate: Plate): void;
    /** Frees every plate and the programs. */
    dispose(): void;
}
/**
 * The part of a source to show so it covers a target: left, top, width, height in source fractions.
 *
 * @param source The source's width over height.
 * @param target The target's width over height.
 * @param view Zoom, focus and shift, as for `draw`.
 * @returns The crop, always inside the source.
 */
export declare function coverCrop(source: number, target: number, view?: Omit<BackdropView, "width" | "height">): PlateView;
/**
 * A painter on a WebGL2 context. Programs compile here, once; plates are cached by digest, size and view.
 *
 * @param gl The host's context. The painter restores the state it changes.
 * @returns paint, draw, read, release and dispose.
 */
export declare function createPlatePainter(gl: WebGL2RenderingContext): PlatePainter;
