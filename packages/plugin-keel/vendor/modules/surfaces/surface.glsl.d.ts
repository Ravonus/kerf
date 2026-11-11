/** A triangle that covers the target. */
export declare const VERT = "#version 300 es\nvoid main() {\n  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n}";
/** Each kind's fragment shader, by its number in `KINDS`. */
export declare const FRAGMENTS: string[];
