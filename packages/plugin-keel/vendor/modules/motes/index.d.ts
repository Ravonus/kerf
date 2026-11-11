/**
 * motes: dust, light motes and sparkles for keel/lit, as one instanced quad (see the README). keel/lit is passed in,
 * so this module imports nothing. The time comes from the host's clock, never a wall clock: a paused clock is a still
 * field, and any frame can be drawn on its own.
 */
import type { MoteDensity, MoteSettings } from "./place.js";
export { MOTE_FRAGMENT, MOTE_PATH_GLSL, MOTE_VERTEX } from "./motes.glsl.js";
export { DEFAULT_MOTES, moteHash, moteSettings, placeMotes } from "./place.js";
export type { MoteDensity, MoteField, MoteSettings, Vec3 } from "./place.js";
interface Uniform {
    value: unknown;
}
interface AttributeLike {
    readonly array: ArrayLike<number>;
}
interface NodeLike {
    frustumCulled: boolean;
    renderOrder: number;
    visible: boolean;
}
interface InstancesLike extends NodeLike {
    count: number;
}
interface GeometryLike {
    setAttribute(name: string, attribute: unknown): unknown;
    dispose(): void;
}
interface MaterialLike {
    readonly uniforms: Record<string, Uniform>;
    dispose(): void;
}
interface ColorLike {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}
interface Vector2Like {
    set(x: number, y: number): unknown;
}
interface Vector3Like {
    set(x: number, y: number, z: number): unknown;
}
/** The parts of keel/lit this module calls. Pass the keel/lit namespace itself. */
export interface LitLike {
    readonly Instances: new (geometry: unknown, material: unknown, count: number) => InstancesLike;
    readonly InstanceAttribute: new (array: Float32Array, size: number) => AttributeLike;
    readonly CustomMaterial: new (parameters: Readonly<Record<string, unknown>>) => MaterialLike;
    readonly Color: new (value?: string) => ColorLike;
    readonly Vector2: new (x?: number, y?: number) => Vector2Like;
    readonly Vector3: new (x?: number, y?: number, z?: number) => Vector3Like;
    plane(width: number, height: number): GeometryLike;
}
/** One frame: the host's clock, and the keyed field values. */
export interface MoteFrame {
    /** Seconds on the host's clock. Ignored when `still`. */
    readonly time: number;
    /** Multiplies every mote's opacity, 0 to 1 (a keyed fade). Default 1. */
    readonly opacity?: number;
    /** Reduced motion: the field holds at time 0, with no blink. */
    readonly still?: boolean;
}
/** A field of motes in the scene. */
export interface Motes {
    /** The instanced quad: add it to the stage; move or rotate it to move the whole field. */
    readonly mesh: NodeLike;
    /** How many motes are drawn, up to the settings' count (a quality lever). */
    shown: number;
    /** The drawing buffer's size in pixels, for pixel sizes and the smallest size. Call on resize. */
    resize(width: number, height: number): void;
    /** Sets the clock and the keyed values for the next draw. */
    update(frame: MoteFrame): void;
    dispose(): void;
}
/**
 * Makes a field of motes: one instanced quad, every mote's drift, turbulence and blink worked out in the vertex shader
 * from the time `update` hands in. Additive, unlit, and drawn after the opaque scene without writing depth.
 *
 * @param lit The keel/lit namespace.
 * @param settings The field's settings; anything missing takes `DEFAULT_MOTES`.
 * @param density Optional: where motes are welcome, 0 to 1, to thin the field in places.
 * @returns The field: add `mesh` to the stage.
 */
export declare function createMotes(lit: LitLike, settings?: Partial<MoteSettings>, density?: MoteDensity): Motes;
