type Rgb = [number, number, number];
/** Reads a plan's uniforms by index. */
export type Uniforms = (index: number) => number;
type Surface = (u: Uniforms, x: number, y: number, c: Rgb) => number;
/** Each kind's painter, by its number in `KINDS`. */
export declare const FIELDS: readonly Surface[];
export {};
