import type { Surface } from "./paint.js";
/** A 2D context, on the page or off it. */
export type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** A canvas the host makes at the size asked. */
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
/** The fields of a keel/lit texture these helpers set. */
export interface TextureLike {
    colorSpace: string;
    wrapS: string;
    wrapT: string;
    anisotropy: number;
    needsUpdate: boolean;
}
export interface DataTextureLike extends TextureLike {
    magFilter: string;
    minFilter: string;
    generateMipmaps: boolean;
    flipY: boolean;
}
/** The parts of keel/lit these helpers call. Pass the keel/lit namespace itself. */
export interface PrintLit<T extends TextureLike, D extends DataTextureLike> {
    readonly CanvasTexture: new (canvas: CanvasLike) => T;
    readonly DataTexture: new (data: Uint8Array, width: number, height: number) => D;
}
/** How a print is used: colour (sRGB) or data (roughness, metalness, a mask: no colour space). */
export interface PrintOptions {
    readonly data?: boolean;
    /** Repeat across the surface instead of clamping at the edges. */
    readonly repeat?: boolean;
}
/** Draws a print: the context, and the canvas's width and height in pixels. */
export type DrawPrint = (ctx: Context2D, width: number, height: number) => void;
/** `print(size, draw)`: a texture of what `draw` puts into a fresh canvas of that size. */
export type Print<T> = (size: number | readonly [number, number], draw: DrawPrint, options?: PrintOptions) => T;
/**
 * Makes `print(size, draw)`. Draw again later into `texture.image` and set `texture.needsUpdate` to refresh it.
 *
 * @param lit The keel/lit namespace.
 * @param canvasOf Makes a canvas of a size, e.g. `(w, h) => new OffscreenCanvas(w, h)`.
 * @returns The print function.
 */
export declare function createPrinter<T extends TextureLike, D extends DataTextureLike>(lit: PrintLit<T, D>, canvasOf: (width: number, height: number) => CanvasLike): Print<T>;
/** The colour that paints roughness and metalness into a data print: G roughness, B metalness, as lit reads them. */
export declare function pbr(roughness: number, metalness: number): string;
/**
 * A surface as two repeating, mipmapped lit textures: `map` (sRGB) and `normalMap` (its height in alpha).
 *
 * @param lit The keel/lit namespace.
 * @param surface From a painter.
 * @returns The textures; the image's top row is at the top of UV space.
 */
export declare function surfaceTextures<T extends TextureLike, D extends DataTextureLike>(lit: PrintLit<T, D>, surface: Surface): {
    map: D;
    normalMap: D;
};
