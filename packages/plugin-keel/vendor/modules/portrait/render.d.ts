import type { Bust } from "./bust.js";
import type { V3 } from "./sdf.js";
interface V3Like {
    set(x: number, y: number, z: number): unknown;
}
interface ColorLike {
    r: number;
    g: number;
    b: number;
}
interface NodeLike {
    add(...nodes: unknown[]): void;
    matrixAutoUpdate: boolean;
    matrixWorldNeedsUpdate: boolean;
    matrix: {
        copy(m: unknown): unknown;
    };
    frustumCulled: boolean;
    matrixWorld: {
        elements: ArrayLike<number>;
    };
    updateMatrixWorld(force?: boolean): void;
}
interface Disposable {
    dispose(): void;
}
interface GeometryLike extends Disposable {
    setAttribute(name: string, attribute: unknown): void;
    setIndex(attribute: unknown): void;
}
interface TargetLike extends Disposable {
    readonly texture: unknown;
}
interface CameraLike {
    position: V3Like;
    updateProjectionMatrix(): void;
    lookAt(x: number, y: number, z: number): void;
    updateMatrixWorld(force?: boolean): void;
    projectionMatrix: {
        elements: ArrayLike<number>;
    };
    matrixWorldInverse: {
        elements: ArrayLike<number>;
    };
}
interface RendererLike {
    setClearColor(color: number | ColorLike, alpha: number): void;
    getClearColor(target: ColorLike): ColorLike;
    getClearAlpha(): number;
    clear(color: boolean, depth: boolean, stencil: boolean): void;
    getRenderTarget(): unknown;
    setRenderTarget(target: unknown): void;
    render(scene: unknown, camera: unknown): void;
}
/** What this module uses of keel/lit. Pass the keel/lit namespace itself. */
export interface PortraitLit {
    readonly Group: new () => NodeLike;
    readonly Stage: new () => NodeLike;
    readonly Mesh: new (geometry: unknown, material: unknown) => NodeLike;
    readonly Geometry: new () => GeometryLike;
    readonly Attribute: new (array: Float32Array | Uint32Array, size: number) => unknown;
    readonly CustomMaterial: new (parameters: Readonly<Record<string, unknown>>) => Disposable;
    readonly Vector2: new (x?: number, y?: number) => {
        set(x: number, y: number): unknown;
    };
    readonly Vector3: new (x?: number, y?: number, z?: number) => V3Like;
    readonly Vector4: new (x?: number, y?: number, z?: number, w?: number) => unknown;
    readonly Matrix3: new () => {
        set(...n: number[]): unknown;
    };
    readonly Matrix4: new () => {
        set(...n: number[]): unknown;
        elements: number[];
    };
    readonly Color: new (value?: string) => ColorLike;
    readonly RenderTarget: new (w: number, h: number, options: Readonly<Record<string, unknown>>) => TargetLike;
    readonly OrthoCamera: new (l: number, r: number, t: number, b: number, n: number, f: number) => CameraLike;
}
/** The colours of a sitter, as hex. */
export interface Palette {
    readonly skin: string;
    readonly lip: string;
    readonly blush: string;
    readonly brow: string;
    readonly iris: string;
    readonly sclera: string;
    readonly cap: string;
    readonly hair: string;
    readonly dress: string;
    readonly chemise: string;
    readonly gown: string;
    readonly gold: string;
    readonly card: string;
}
export declare const PALETTE: Palette;
/** The light: the key's direction (toward it) and colour, the fill's sky and ground. */
export interface PortraitLight {
    readonly key: V3;
    readonly keyColor: string;
    readonly keyStrength: number;
    readonly sky: string;
    readonly ground: string;
    readonly fillStrength: number;
}
/** One soft warm key from the upper left (azimuth -40°, elevation 35°), a cool fill at half of it. */
export declare const LIGHT: PortraitLight;
export interface FaceState {
    /** How far the lids are down, 0 open to 1 shut. */
    readonly lid: number;
    /** Where the eyes look, in the world. */
    readonly at: V3;
}
export interface Portrait {
    /** Everything drawn, under one node: place, turn and scale it. */
    readonly group: NodeLike;
    light(light: PortraitLight): void;
    /** The lids and the gaze this frame. */
    face(state: FaceState): void;
    /** Draw the key's shadow map; call before each frame is drawn when the bust or the light has moved. */
    shadows(renderer: RendererLike): void;
    dispose(): void;
}
/** The bust as meshes for keel/lit, under one group. */
export declare function createPortrait(lit: PortraitLit, bust: Bust, palette?: Palette): Portrait;
export {};
