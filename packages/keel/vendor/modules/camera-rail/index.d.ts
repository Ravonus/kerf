/**
 * camera-rail: a camera on keyed tracks, scrubbed by position. MIT.
 *
 * `at(position, frame)` samples the camera's eye, target, fov and roll from
 * its tracks through the `tracks` module's sampler (passed in), turns the
 * view by the pointer's pan and tilt, and returns the view. A baked flight
 * rides a Catmull-Rom path by a keyed `along`. `applyView` puts a view on a
 * keel/lit camera, which is injected: the maths never touches a renderer.
 */
/** An [x, y, z] in world units. */
export type Vec3 = readonly [number, number, number];
/** What a sampled property holds: the `tracks` module's Value. */
export type Value = number | readonly number[] | string;
/** The `tracks` module's `sampleTracks`, or anything of its shape: values by target, then property. */
export type Sampler<T> = (tracks: T, position: number, time?: number) => Readonly<Record<string, Readonly<Record<string, Value>>>>;
/** A Catmull-Rom path the eye, and the target when given, ride by the keyed `along` (0..1). */
export interface RailPath {
    readonly eye: readonly Vec3[];
    readonly target?: readonly Vec3[];
}
/** How a rail is set up. */
export interface RailOptions<T> {
    /** The tracks, in the `tracks` module's format. */
    readonly tracks: T;
    /** The target name the camera's tracks use. Defaults to "camera". */
    readonly name?: string;
    /** The pointer's pan scale: the pointer at a side edge turns the view by 0.1 rad times this. Defaults to 0. */
    readonly pan?: number;
    /** The pointer's tilt scale, the same for the top and bottom edges. Defaults to 0. */
    readonly tilt?: number;
    /** The fov in degrees when no track keys one. Defaults to 30. */
    readonly fov?: number;
    /** A path for a baked flight, ridden by the keyed `along`. */
    readonly path?: RailPath;
}
/** What the page knows this frame. */
export interface Frame {
    /** The pointer, each axis in -1..1 with y up; null or left out when it is away. */
    readonly pointer?: {
        readonly x: number;
        readonly y: number;
    } | null;
    /** Scroll velocity, 0 at rest. See {@link pointerStrength}. */
    readonly velocity?: number;
    /** The clock, for tracks driven by time. */
    readonly time?: number;
}
/** The camera this frame: eye and target in world units, fov in degrees, roll in radians round the view axis. */
export interface View {
    readonly eye: Vec3;
    readonly target: Vec3;
    readonly fov: number;
    readonly roll: number;
}
/** A rail: {@link createCameraRail}. */
export interface CameraRail {
    /** The view at `position`. Call once a frame: the pointer's smoothing steps on each call. */
    at(position: number, frame?: Frame): View;
}
/** The parts of a keel/lit camera {@link applyView} touches. Pass the stage's PerspectiveCamera. */
export interface RailCamera {
    readonly position: {
        set(x: number, y: number, z: number): unknown;
    };
    lookAt(x: number, y: number, z: number): unknown;
    rotateZ(angle: number): unknown;
    fov: number;
    updateProjectionMatrix(): unknown;
}
/**
 * The pointer's hold on the view: 1 at rest, `0.05 + max(0, 0.2 - |v| * 10)` while scrolling, so it
 * floors at 0.05 from |v| = 0.02 up.
 *
 * @param velocity The scroll velocity, 0 at rest.
 * @returns The strength, 0.05..1.
 */
export declare function pointerStrength(velocity: number): number;
/**
 * A point along a Catmull-Rom spline through `points`, the ends held.
 *
 * @param points The points the spline passes through, in order.
 * @param u How far along, 0 at the first point and 1 at the last; clamped.
 * @returns The point there.
 */
export declare function catmullRom(points: readonly Vec3[], u: number): Vec3;
/**
 * Turns the view from `eye` to `target`: `pan` radians round the up axis, positive to the right,
 * then `tilt` round the view's right axis, positive upward. The distance to the target is kept.
 *
 * @param eye Where the camera stands.
 * @param target What it looks at before the turn.
 * @param pan The turn round the up axis, radians.
 * @param tilt The turn up or down, radians.
 * @returns What it looks at after the turn.
 */
export declare function turnView(eye: Vec3, target: Vec3, pan: number, tilt: number): Vec3;
/**
 * Puts a view on a keel/lit camera: stands it at the eye, aims it at the target, rolls it, and sets
 * the fov when it changed.
 *
 * @param camera The camera, injected.
 * @param view The view to apply.
 */
export declare function applyView(camera: RailCamera, view: View): void;
/**
 * Builds a rail on keyed tracks. The camera's tracks key `eye`, `target` (vectors), `fov` (degrees),
 * `roll` (radians) and `along` (0..1 on the path); each is optional.
 *
 * @param sample The `tracks` module's `sampleTracks`.
 * @param options The tracks, the pointer scales, the default fov and the path.
 * @returns The rail.
 */
export declare function createCameraRail<T>(sample: Sampler<T>, options: RailOptions<T>): CameraRail;
