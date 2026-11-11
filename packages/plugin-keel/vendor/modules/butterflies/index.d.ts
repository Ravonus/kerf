/**
 * butterflies: a small flock of glowing butterflies for keel/lit (see the README). keel/lit is passed in, so this
 * module imports nothing. The time comes from the host's clock, never a wall clock.
 */
import type { ButterflyColors, ButterflySettings } from "./flight.js";
import type { ShapeLike } from "./wing.js";
export { BUTTERFLY_FRAGMENT, BUTTERFLY_VERTEX } from "./butterflies.glsl.js";
export { DEFAULT_BUTTERFLIES, butterflySettings, flightHash, flyAt, planFlights } from "./flight.js";
export type { ButterflyColors, ButterflySettings, Flight, KeepOut, Pose, Vec3 } from "./flight.js";
export { wingMesh, wingOutline, windingOf } from "./wing.js";
export type { ShapeLike, WingMesh, WingPoint } from "./wing.js";
interface AttributeLike {
    readonly array: ArrayLike<number>;
    needsUpdate: boolean;
}
interface NodeLike {
    frustumCulled: boolean;
    visible: boolean;
}
interface InstancesLike extends NodeLike {
    count: number;
    readonly instanceMatrix: {
        readonly array: Float32Array;
        needsUpdate: boolean;
    };
}
interface GeometryLike {
    setAttribute(name: string, attribute: unknown): unknown;
    setIndex(index: readonly number[]): unknown;
    dispose(): void;
}
interface MaterialLike {
    dispose(): void;
}
interface ColorLike {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}
interface Vector3Like {
    set(x: number, y: number, z: number): unknown;
}
/** The parts of keel/lit this module calls. Pass the keel/lit namespace itself. */
export interface LitLike {
    readonly Instances: new (geometry: unknown, material: unknown, count: number) => InstancesLike;
    readonly Geometry: new () => GeometryLike;
    readonly Attribute: new (array: Float32Array, size: number) => AttributeLike;
    readonly InstanceAttribute: new (array: Float32Array, size: number) => AttributeLike;
    readonly CustomMaterial: new (parameters: Readonly<Record<string, unknown>>) => MaterialLike;
    readonly Color: new (value?: string) => ColorLike;
    readonly Vector3: new (x?: number, y?: number, z?: number) => Vector3Like;
    readonly Shape: new () => ShapeLike;
}
/** One frame: the host's clock. */
export interface ButterflyFrame {
    /** Seconds on the host's clock. Ignored when `still`. */
    readonly time: number;
    /** Reduced motion: the flock holds where it is at time 0, wings open, still glowing. */
    readonly still?: boolean;
}
/** A flock in the scene. */
export interface Butterflies {
    /** The instanced mesh: add it to the stage. */
    readonly mesh: NodeLike;
    /** Places the flock and beats its wings for the next draw. */
    update(frame: ButterflyFrame): void;
    /** Recolours the flock (a section's hue). */
    setColors(colors: Partial<ButterflyColors>): void;
    dispose(): void;
}
/**
 * Makes a flock of butterflies: one instanced mesh, two wings from a Shape and a body, the wings beating in the vertex
 * shader on the host's clock; the flock wanders as sums of sines, worked out on the CPU each update.
 *
 * @param lit The keel/lit namespace.
 * @param settings The flock's settings; anything missing takes `DEFAULT_BUTTERFLIES`.
 * @returns The flock: add `mesh` to the stage.
 */
export declare function createButterflies(lit: LitLike, settings?: Partial<ButterflySettings>): Butterflies;
