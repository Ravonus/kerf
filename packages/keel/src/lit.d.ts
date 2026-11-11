// keel/lit's surface, loosely typed: the parts a scene touches. The engine's own types aren't shipped yet.

/** An RGB colour with Three-style setters. */
export interface LitColor {
  r: number
  g: number
  b: number
  set(value: string | number | LitColor): LitColor
  clone(): LitColor
  lerp(to: LitColor, amount: number): LitColor
  add(other: LitColor): LitColor
  multiplyScalar(amount: number): LitColor
  toArray(): [number, number, number]
}

/** A point or direction. */
export interface LitVector3 {
  x: number
  y: number
  z: number
  set(x: number, y: number, z: number): LitVector3
  copy(from: LitVector3): LitVector3
  toArray(): [number, number, number]
}

/** Anything in the scene graph. */
export interface LitNode {
  position: LitVector3
  rotation: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
  scale: LitVector3
  visible: boolean
  add(...children: unknown[]): LitNode
  remove(...children: unknown[]): LitNode
  lookAt(x: number | LitVector3, y?: number, z?: number): void
}

/** The root of a scene: `fog` and `background` live here. */
export interface LitStage extends LitNode {
  fog: { color: LitColor; near: number; far: number } | null
  background: LitColor | null
}

/** A perspective camera. Call `updateProjectionMatrix()` after changing `fov` or `aspect`. */
export interface LitCamera extends LitNode {
  fov: number
  aspect: number
  near: number
  far: number
  updateProjectionMatrix(): void
}

/** A light. `SunLight` adds `target`, `castShadow` and `shadow`; `SkyLight` adds `groundColor`. */
export interface LitLight extends LitNode {
  color: LitColor
  groundColor: LitColor
  intensity: number
  castShadow: boolean
  target: LitNode
  shadow: {
    bias: number
    mapSize: { set(width: number, height: number): void }
    camera: {
      left: number
      right: number
      top: number
      bottom: number
      near: number
      far: number
      updateProjectionMatrix(): void
    }
  }
}

/** The renderer bound to a canvas. */
export interface LitRenderer {
  domElement: HTMLCanvasElement
  outputColorSpace: string
  toneMapping: string
  toneMappingExposure: number
  autoClear: boolean
  shadowMap: { enabled: boolean; type: string }
  info: { render: { calls: number; triangles: number } }
  getPixelRatio(): number
  setPixelRatio(value: number): void
  setSize(width: number, height: number, updateStyle?: boolean): void
  render(scene: unknown, camera: unknown): void
  dispose(): void
  forceContextLoss(): void
}

/** Options for `createLitRenderer`. */
export interface LitRendererOptions {
  canvas?: HTMLCanvasElement
  antialias?: boolean
  alpha?: boolean
  powerPreference?: 'default' | 'high-performance' | 'low-power'
  preserveDrawingBuffer?: boolean
}

/** Makes a renderer. Throws where WebGL2 is missing. */
export declare function createLitRenderer(options?: LitRendererOptions): LitRenderer
/** The root of a scene. */
export declare const Stage: new () => LitStage
/** A node that only holds others. */
export declare const Group: new () => LitNode
/** A camera with perspective: field of view in degrees, aspect, near and far. */
export declare const PerspectiveCamera: new (
  fov: number,
  aspect: number,
  near: number,
  far: number,
) => LitCamera
/** A directional light that can throw shadows: the sun or the moon. */
export declare const SunLight: new (color: string, intensity: number) => LitLight
/** Light from the whole sky above and the ground below. */
export declare const SkyLight: new (sky: string, ground: string, intensity: number) => LitLight
/** A colour from a CSS hex string or a number. */
export declare const Color: new (value?: string | number) => LitColor
/** A point or direction. */
export declare const Vector3: new (x?: number, y?: number, z?: number) => LitVector3
/** Linear fog between two distances. */
export declare const Fog: new (
  color: string,
  near: number,
  far: number,
) => NonNullable<LitStage['fog']>
/** A geometry drawn with a material. */
export declare const Mesh: new (
  geometry: unknown,
  material: unknown,
) => LitNode & {
  castShadow: boolean
  receiveShadow: boolean
}
/** The physically based material: `color`, `roughness`, `metalness`, maps. */
export declare const LitMaterial: new (options?: Record<string, unknown>) => unknown
/** A flat rectangle in the XY plane. */
export declare function plane(
  width: number,
  height: number,
  across?: number,
  down?: number,
): unknown
