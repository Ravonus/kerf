import type { Uniform } from "./lit.js";
interface ShaderLike {
    readonly uniforms: Record<string, Uniform>;
    vertexShader: string;
    fragmentShader: string;
}
export interface DressMaterialLike {
    onCompile?: ((shader: ShaderLike, renderer: unknown) => void) | undefined;
    customProgramCacheKey?: (() => string) | undefined;
    readonly side?: unknown;
    readonly alphaTest?: number;
    needsUpdate: boolean;
    readonly userData: Record<string, unknown>;
}
export interface DressNodeLike {
    readonly isMesh?: boolean;
    readonly material?: DressMaterialLike | readonly DressMaterialLike[];
    traverse(visit: (node: DressNodeLike) => void): void;
}
/**
 * Dresses one material once: its own onCompile runs first, then the finish's; its program key keeps its own.
 *
 * @param material A keel/lit material.
 * @param uniforms The finish's shared uniforms (uFinishTranslucency, uFinishVariation, uFinishMute).
 */
export declare function dressMaterial(material: DressMaterialLike, uniforms: Record<string, Uniform>): void;
/**
 * Dresses every mesh's materials under a root; a material already dressed is left alone.
 *
 * @param root A stage or part of one.
 * @param uniforms The finish's shared uniforms.
 */
export declare function dressTree(root: DressNodeLike, uniforms: Record<string, Uniform>): void;
export {};
