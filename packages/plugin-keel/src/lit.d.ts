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
  clone(): LitVector3
  lerp(to: LitVector3, amount: number): LitVector3
  /** Into the camera's normalised device coordinates: x and y in -1..1 across the view. */
  project(camera: LitCamera): LitVector3
  /** Moves the point by a matrix: `new lit.Vector3(0, 0.13, 0.07).applyMatrix4(group.matrixWorld)`. */
  applyMatrix4(matrix: LitMatrix4): LitVector3
  toArray(): [number, number, number]
}

/** Anything in the scene graph. */
export interface LitNode {
  position: LitVector3
  rotation: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
  scale: LitVector3
  visible: boolean
  name: string
  readonly children: LitNode[]
  userData: Record<string, unknown>
  add(...children: unknown[]): LitNode
  remove(...children: unknown[]): LitNode
  lookAt(x: number | LitVector3, y?: number, z?: number): void
  rotateZ(angle: number): LitNode
  /** False draws it even when its bounds fall outside the camera's view: a full-frame backdrop, say. */
  frustumCulled: boolean
  /** Draw order among the scene's objects, lowest first; 0 by default. */
  renderOrder: number
  /** Where it is in the scene, after its parents': current once `updateMatrixWorld()` has run. */
  readonly matrixWorld: LitMatrix4
  updateMatrixWorld(force?: boolean): void
  /** Bakes a matrix into its position, rotation and scale. */
  applyMatrix4(matrix: LitMatrix4): LitNode
  /** Calls `fn` on this node and every node under it. */
  traverse(fn: (node: LitNode) => void): void
}

/** The root of a scene: `fog` and `background` live here. */
export interface LitStage extends LitNode {
  fog: { color: LitColor; near: number; far: number } | null
  background: LitColor | null
  /** Light from the room around the scene: an `Environment`. A metal reflects it; a rough surface takes its diffuse. */
  environment: LitEnvironment | null
  environmentIntensity: number
  /** Turns the room: `environmentRotation.y = Math.PI / 6`. */
  environmentRotation: {
    x: number
    y: number
    z: number
    set(x: number, y: number, z: number): void
  }
}

/** One soft box of a studio: where it hangs, how big, its linear colour and strength. */
export interface SoftBox {
  /** A direction from the subject. */
  readonly dir: readonly [number, number, number]
  /** Half its width and height, as tangents of the angle it spans. */
  readonly size: readonly [number, number]
  readonly colour: readonly [number, number, number]
  readonly intensity: number
  /** Edge softness, 0 crisp to 0.5 very soft. */
  readonly soft?: number
  /** Turn about its own axis, radians. */
  readonly roll?: number
}

/** A studio as data: a sky, horizon and ground gradient (linear) and its soft boxes. */
export interface Studio {
  readonly sky: readonly [number, number, number]
  readonly horizon: readonly [number, number, number]
  readonly ground: readonly [number, number, number]
  readonly boxes: readonly SoftBox[]
}

/** Options for `Environment`. */
export interface EnvironmentOptions {
  /** A face's size at the sharpest level: a power of two, 16 or more. Default 128. */
  size?: number
  /** GGX samples per texel at the first blurred level. Default 384. */
  samples?: number
}

/** A studio prefiltered for lit shading on the GPU the first frame that reads it. No file. */
export interface LitEnvironment extends LitTexture {
  studio: Studio
  readonly size: number
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

/** Vertices and their attributes. `dispose()` frees its GPU buffers. */
export interface LitGeometry {
  dispose(): void
}

/** What every material shares. `dispose()` frees its programs. */
export interface LitMaterialNode {
  transparent: boolean
  opacity: number
  depthWrite: boolean
  needsUpdate: boolean
  dispose(): void
}

/** The physically based material's own fields. */
export interface LitSurfaceMaterial extends LitMaterialNode {
  color: LitColor
  roughness: number
  metalness: number
  /** Its share of the stage's environment light. Default 1. */
  envMapIntensity: number
}

/** A uniform the shader reads: set `value` and the next frame uploads it. */
export interface LitUniform<T = unknown> {
  value: T
}

/** Options for `CustomMaterial`. */
export interface CustomMaterialOptions {
  uniforms?: Record<string, LitUniform>
  vertexShader: string
  fragmentShader: string
  transparent?: boolean
  depthWrite?: boolean
  depthTest?: boolean
}

/** A material from GLSL. */
export interface LitCustomMaterial extends LitMaterialNode {
  uniforms: Record<string, LitUniform>
  vertexShader: string
  fragmentShader: string
}

/** A mesh: geometry and material, and whether it throws and takes shadows. */
export interface LitMesh extends LitNode {
  geometry: LitGeometry
  material: LitMaterialNode | LitMaterialNode[]
  castShadow: boolean
  receiveShadow: boolean
}

/** A 4×4 transform. */
export interface LitMatrix4 {
  identity(): LitMatrix4
  makeTranslation(x: number, y: number, z: number): LitMatrix4
  compose(position: LitVector3, rotation: LitQuaternion, scale: LitVector3): LitMatrix4
}

/** A rotation. */
export interface LitQuaternion {
  setFromAxisAngle(axis: LitVector3, angle: number): LitQuaternion
}

/** A mesh drawn many times. Set `instanceMatrix.needsUpdate` after `setMatrixAt`. */
export interface LitInstances extends LitMesh {
  count: number
  instanceMatrix: { needsUpdate: boolean }
  setMatrixAt(index: number, matrix: LitMatrix4): void
  setColorAt(index: number, color: LitColor): void
}

/** An image the GPU samples. */
export interface LitTexture {
  needsUpdate: boolean
  colorSpace: string
  wrapS: string
  wrapT: string
  magFilter: string
  minFilter: string
  dispose(): void
}

/** Options for `RenderTarget`. */
export interface LitRenderTargetOptions {
  /** Multisampling: 0 is off. */
  samples?: number
  depthBuffer?: boolean
  /** The texel type, such as `half` for half floats. */
  type?: string
  colorSpace?: string
}

/** An offscreen image to draw into. */
export interface LitRenderTarget {
  readonly width: number
  readonly height: number
  readonly texture: LitTexture
  setSize(width: number, height: number): void
  dispose(): void
}

/** A camera without perspective. */
export interface LitOrthoCamera extends LitNode {
  left: number
  right: number
  top: number
  bottom: number
  near: number
  far: number
  updateProjectionMatrix(): void
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
  getContext(): WebGL2RenderingContext
  /** Where the next `render` draws: a target, or null for the canvas. */
  setRenderTarget(target: LitRenderTarget | null): void
  getRenderTarget(): LitRenderTarget | null
  setClearColor(color: string | number | LitColor, alpha?: number): void
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void
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
/** The house studio: a big key upper left, two strips for the edges, a soft top, a low fill. */
export declare const STUDIO: Studio
/** A generated environment for `stage.environment`: `new Environment(STUDIO, { size: 128 })`. */
export declare const Environment: new (
  studio?: Studio,
  options?: EnvironmentOptions,
) => LitEnvironment
/** A geometry drawn with a material. */
export declare const Mesh: new (geometry: unknown, material: unknown) => LitMesh
/** The physically based material: `color`, `roughness`, `metalness`, `envMapIntensity`, maps. */
export declare const LitMaterial: new (options?: Record<string, unknown>) => LitSurfaceMaterial
/** Unlit colour or texture. */
export declare const FlatMaterial: new (options?: Record<string, unknown>) => LitMaterialNode
/** A material from GLSL: `uniforms`, `vertexShader`, `fragmentShader`, `transparent`, `depthWrite`. */
export declare const CustomMaterial: new (options: CustomMaterialOptions) => LitCustomMaterial
/** One geometry drawn `count` times, each with its own matrix and colour. */
export declare const Instances: new (
  geometry: unknown,
  material: unknown,
  count: number,
) => LitInstances
/** An offscreen image to draw into: `renderer.setRenderTarget(target)`, then sample `target.texture`. */
export declare const RenderTarget: new (
  width: number,
  height: number,
  options?: LitRenderTargetOptions,
) => LitRenderTarget
/** A camera without perspective: left, right, top, bottom, near and far. */
export declare const OrthoCamera: new (
  left?: number,
  right?: number,
  top?: number,
  bottom?: number,
  near?: number,
  far?: number,
) => LitOrthoCamera
/** A texture from raw texels, such as a seeded noise field. */
export declare const DataTexture: new (
  data: ArrayBufferView,
  width: number,
  height: number,
) => LitTexture
/** A texture drawn with a 2D canvas. Set `needsUpdate` after drawing again. */
export declare const CanvasTexture: new (canvas: HTMLCanvasElement | OffscreenCanvas) => LitTexture
/** A 4×4 transform. */
export declare const Matrix4: new () => LitMatrix4
/** A rotation. */
export declare const Quaternion: new () => LitQuaternion
/** A box: width, height and depth. */
export declare function box(width?: number, height?: number, depth?: number): LitGeometry
/** A sphere: radius, then segments round and down. */
export declare function sphere(radius?: number, across?: number, down?: number): LitGeometry
/** A torus: radius, tube radius, then segments round the tube and along it. */
export declare function torus(
  radius?: number,
  tube?: number,
  radial?: number,
  tubular?: number,
): LitGeometry
/** An icosahedron: radius and subdivisions. */
export declare function icosahedron(radius?: number, detail?: number): LitGeometry
/** A flat rectangle in the XY plane. */
export declare function plane(
  width: number,
  height: number,
  across?: number,
  down?: number,
): LitGeometry
