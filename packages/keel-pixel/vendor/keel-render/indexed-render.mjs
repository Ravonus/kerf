import './pixel-raster.mjs';
import {
  cameraBasis,
} from './core-primitives.mjs';
import {
  FAR,
  FULLSCREEN_VS,
  MAX_BOXES,
  MAX_CAPS,
  MAX_RAMPS,
  MAX_WEDGES,
  SCREEN_TILE,
  fxUniforms,
  resolveFx,
  screenTile,
} from './effects-world.mjs';
import {
  BAKE_WORLD_FS,
  DEPTH_OUT_FS,
  HEIGHT_FS,
  INDEX_FS,
  RASTER_FLOATS,
  RASTER_FS,
  RASTER_VS,
  boxTemplate,
  capsuleTemplate,
  smoothDepthOutFs,
} from './pixel-raster.mjs';

var RESOLVE_FS = `#version 300 es
precision highp float;
uniform sampler2D uColour;
uniform int uSS;
out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * uSS;
  vec3 acc = vec3(0.0);
  for (int y = 0; y < 4; y++) {
    if (y >= uSS) break;
    for (int x = 0; x < 4; x++) {
      if (x >= uSS) break;
      vec3 c = texelFetch(uColour, p + ivec2(x, y), 0).rgb;
      acc += c * c;
    }
  }
  outColor = vec4(sqrt(acc / float(uSS * uSS)), 1.0);
}`;
function supersampleFor(width, height, asked = "auto", budget = 11e5) {
  if (asked !== "auto") return Math.max(1, Math.min(4, Math.round(asked)));
  for (const k of [3, 2]) if (width * height * k * k <= budget) return k;
  return 1;
}

// packages/render/src/link-program.ts
function linkProgram(gl, vertex, fragment, name = "Program") {
  const shaders = [];
  const attached = [];
  let program2 = null;
  let linked = false;
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error(`${name}: shader allocation failed`);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
    }
    program2 = gl.createProgram();
    if (!program2) throw new Error(`${name}: program allocation failed`);
    for (const shader of shaders) {
      gl.attachShader(program2, shader);
      attached.push(shader);
    }
    gl.linkProgram(program2);
    if (!gl.getProgramParameter(program2, gl.LINK_STATUS)) {
      const errors = [];
      for (const shader of shaders) {
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) errors.push(gl.getShaderInfoLog(shader) || "shader compile failed");
      }
      throw new Error(`${name}: ${errors.join("; ") || gl.getProgramInfoLog(program2) || "program link failed"}`);
    }
    linked = true;
    return program2;
  } finally {
    if (program2) for (const shader of attached) gl.detachShader(program2, shader);
    for (const shader of shaders) gl.deleteShader(shader);
    if (program2 && !linked) gl.deleteProgram(program2);
  }
}

// packages/render/src/program.ts
function program(gl, vs, fs) {
  const p = linkProgram(gl, vs, fs, "Pixel renderer");
  try {
    const loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i += 1) {
      const u = gl.getActiveUniform(p, i);
      if (u) loc[u.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, u.name);
    }
    return { p, loc };
  } catch (error) {
    gl.deleteProgram(p);
    throw error;
  }
}

// packages/render/src/indexed-pass.ts
var norm2 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
function makeIndexedRender(env, gl, bakeMode, pass) {
  return function renderIndexed({ eye, target: look, fov = 1.2, time = 0, sun = [0.4, 0.8, 0.3], waterY = 0, fogNear = 25, fogFar = 110, gap = 0.56, split, ortho = 0 }) {
      const x = bakeMode();
      const { forward: fwd, right, up } = cameraBasis(eye, look);
      gl.bindFramebuffer(gl.FRAMEBUFFER, env.fbo);
      gl.viewport(0, 0, env.width, env.height);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.ALWAYS);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const BW = x.world.loc;
      gl.useProgram(x.world.p);
      gl.uniform2f(BW.uRes, env.width, env.height);
      gl.uniform3fv(BW.uEye, eye);
      gl.uniform3fv(BW.uFwd, fwd);
      gl.uniform3fv(BW.uRight, right);
      gl.uniform3fv(BW.uUp, up);
      gl.uniform1f(BW.uTan, Math.tan(fov / 2));
      gl.uniform1f(BW.uTime, time);
      gl.uniform1i(BW.uBoxes, env.counts.boxes);
      gl.uniform1i(BW.uWedges, env.counts.wedges);
      gl.uniform1i(BW.uCaps, env.counts.capsules);
      for (const blk of env.blocks) gl.bindBufferBase(gl.UNIFORM_BUFFER, blk.i, blk.buf);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, env.matTex);
      gl.uniform1i(BW.uMats, 1);
      gl.uniform3fv(BW.uSun, norm2(sun));
      gl.uniform1f(BW.uWaterY, waterY);
      gl.uniform1f(BW.uFogNear, fogNear);
      gl.uniform1f(BW.uFogFar, fogFar);
      gl.uniform4f(BW.uSplit, split?.[0] ?? 0, split?.[1] ?? 0, split?.[2] ?? 0, split ? 1 : 0);
      gl.uniform1f(BW.uOrthoH, ortho);
      gl.bindBuffer(gl.ARRAY_BUFFER, env.quad);
      const aw = gl.getAttribLocation(x.world.p, "aPos");
      gl.enableVertexAttribArray(aw);
      gl.vertexAttribPointer(aw, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(x.index.p);
      gl.uniform1f(x.index.loc.uGap, gap / FAR);
      pass(x.index.p, x.fb, [[env.dataTex, x.index.loc.uData], [env.data2Tex, x.index.loc.uData2], [env.depthTex, x.index.loc.uDepth]]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return x.fb;
    };
}

function makeIndexedHeights(env, gl, bakeMode, pass) {
  return function renderIndexedHeights({ eye, target: look, fov = 1.2, pixelsPerMetre, eps = 0, ortho = 0 }) {
      const x = bakeMode();
      if (!x.height) {
        x.height = program(gl, FULLSCREEN_VS, HEIGHT_FS);
        ["Boxes", "Wedges", "Capsules"].forEach((name, i) => gl.uniformBlockBinding(x.height.p, gl.getUniformBlockIndex(x.height.p, name), i));
      }
      const hp = x.height;
      const { forward: fwd, right, up } = cameraBasis(eye, look);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(hp.p);
      const L = hp.loc;
      gl.uniform2f(L.uRes, env.width, env.height);
      gl.uniform3fv(L.uEye, eye);
      gl.uniform3fv(L.uFwd, fwd);
      gl.uniform3fv(L.uRight, right);
      gl.uniform3fv(L.uUp, up);
      gl.uniform1f(L.uTan, Math.tan(fov / 2));
      gl.uniform1f(L.uScale, pixelsPerMetre);
      gl.uniform1f(L.uEps, eps);
      gl.uniform1f(L.uOrthoH, ortho);
      gl.uniform1i(L.uBoxes, env.counts.boxes);
      gl.uniform1i(L.uWedges, env.counts.wedges);
      gl.uniform1i(L.uCaps, env.counts.capsules);
      for (const blk of env.blocks) gl.bindBufferBase(gl.UNIFORM_BUFFER, blk.i, blk.buf);
      pass(hp.p, x.fb, [[env.dataTex, L.uData], [env.depthTex, L.uDepth]]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return x.fb;
    };
}

function createIndexedPass(env, createDepth) {
  const gl = env.gl;
  const nearest = () => {
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  };
  let extra = null;
  function bakeMode() {
    if (!extra) {
      const bw = program(gl, FULLSCREEN_VS, BAKE_WORLD_FS);
      ["Boxes", "Wedges", "Capsules"].forEach((name, i) => gl.uniformBlockBinding(bw.p, gl.getUniformBlockIndex(bw.p, name), i));
      extra = { world: bw, index: program(gl, FULLSCREEN_VS, INDEX_FS), depth: createDepth?.() ?? null, height: null, fb: gl.createFramebuffer(), tex: gl.createTexture(), w: 0, h: 0 };
    }
    if (extra.w !== env.width || extra.h !== env.height) {
      gl.bindTexture(gl.TEXTURE_2D, extra.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, env.width, env.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      nearest();
      gl.bindFramebuffer(gl.FRAMEBUFFER, extra.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, extra.tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      extra.w = env.width;
      extra.h = env.height;
    }
    return extra;
  }
  function pass(prog, fb, textures) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, env.width, env.height);
    gl.useProgram(prog);
    textures.forEach(([t, loc], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(loc, i);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, env.quad);
    const a = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function readTarget(fb, attachment) {
    const out = new Uint8Array(env.width * env.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    if (fb) gl.readBuffer(attachment);
    gl.readPixels(0, 0, env.width, env.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    if (fb) gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }
  const api = {
    renderIndexed: makeIndexedRender(env, gl, bakeMode, pass),
    readIndexed() {
      return readTarget(bakeMode().fb, gl.COLOR_ATTACHMENT0);
    },
    renderIndexedHeights: makeIndexedHeights(env, gl, bakeMode, pass)
  };
  return {
    ...api,
    mode: bakeMode,
    pass,
    readTarget,
    dispose() {
      if (!extra) return;
      for (const p of [extra.world, extra.index, extra.depth, extra.height]) if (p) gl.deleteProgram(p.p);
      gl.deleteTexture(extra.tex);
      gl.deleteFramebuffer(extra.fb);
      extra = null;
    }
  };
}

// packages/render/src/world-buffers.ts
function uploadWorld(gl, blocks, { boxes = [], wedges = [], capsules = [] }) {
  const [boxBlock, wedgeBlock, capBlock] = blocks;
  let nBoxes = 0, nWedges = 0, nCaps = 0;
  const bx = [];
  const wd = [...wedges];
  for (const b of boxes) (b.kind === "wedge" ? wd : bx).push(b);
  nBoxes = Math.min(MAX_BOXES, bx.length);
  for (let i = 0; i < nBoxes; i += 1) {
    const b = bx[i];
    boxBlock.data.set([b.c[0], b.c[1], b.c[2], b.mat ?? 0, b.h[0], b.h[1], b.h[2], b.yaw ?? 0], i * 8);
  }
  nWedges = Math.min(MAX_WEDGES, wd.length);
  for (let i = 0; i < nWedges; i += 1) {
    const w = wd[i];
    wedgeBlock.data.set([w.c[0], w.c[1], w.c[2], w.mat ?? 0, w.h[0], w.h[1], w.h[2], w.yaw ?? 0, Math.max(0, Math.min(0.98, w.lo ?? 0)), Math.max(0, w.skin ?? 0), Math.max(-1, Math.min(1, w.top?.[0] ?? -1)), Math.max(-1, Math.min(1, w.top?.[1] ?? 1))], i * 12);
  }
  nCaps = Math.min(MAX_CAPS, capsules.length);
  for (let i = 0; i < nCaps; i += 1) {
    const c = capsules[i];
    capBlock.data.set([c.a[0], c.a[1], c.a[2], c.r, c.b[0], c.b[1], c.b[2], c.mat ?? 0], i * 8);
  }
  for (const [blk, n] of [[boxBlock, nBoxes * 8], [wedgeBlock, nWedges * 12], [capBlock, nCaps * 8]]) {
    gl.bindBuffer(gl.UNIFORM_BUFFER, blk.buf);
    if (n) gl.bufferSubData(gl.UNIFORM_BUFFER, 0, blk.data, 0, n);
  }
  return { boxes: nBoxes, wedges: nWedges, capsules: nCaps, dropped: bx.length - nBoxes + wd.length - nWedges + capsules.length - nCaps };
}

// packages/render/src/pixel-renderer.ts
var norm3 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
var dot2 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function targetImpl(__state, w, h) {
    __state.W2 = w;
    __state.H = h;
    __state.canvas.width = __state.W2;
    __state.canvas.height = __state.H;
    for (const t of [__state.dataTex, __state.data2Tex, __state.depthTex]) if (t) __state.gl.deleteTexture(t);
    if (__state.fbo) __state.gl.deleteFramebuffer(__state.fbo);
    const rgba8 = () => {
      const t = __state.gl.createTexture();
      __state.gl.bindTexture(__state.gl.TEXTURE_2D, t);
      __state.gl.texImage2D(__state.gl.TEXTURE_2D, 0, __state.gl.RGBA8, __state.W2, __state.H, 0, __state.gl.RGBA, __state.gl.UNSIGNED_BYTE, null);
      __state.nearest();
      return t;
    };
    __state.dataTex = rgba8();
    __state.data2Tex = rgba8();
    __state.depthTex = __state.gl.createTexture();
    __state.gl.bindTexture(__state.gl.TEXTURE_2D, __state.depthTex);
    __state.gl.texImage2D(__state.gl.TEXTURE_2D, 0, __state.gl.DEPTH_COMPONENT24, __state.W2, __state.H, 0, __state.gl.DEPTH_COMPONENT, __state.gl.UNSIGNED_INT, null);
    __state.nearest();
    __state.fbo = __state.gl.createFramebuffer();
    __state.gl.bindFramebuffer(__state.gl.FRAMEBUFFER, __state.fbo);
    __state.gl.framebufferTexture2D(__state.gl.FRAMEBUFFER, __state.gl.COLOR_ATTACHMENT0, __state.gl.TEXTURE_2D, __state.dataTex, 0);
    __state.gl.framebufferTexture2D(__state.gl.FRAMEBUFFER, __state.gl.COLOR_ATTACHMENT1, __state.gl.TEXTURE_2D, __state.data2Tex, 0);
    __state.gl.framebufferTexture2D(__state.gl.FRAMEBUFFER, __state.gl.DEPTH_ATTACHMENT, __state.gl.TEXTURE_2D, __state.depthTex, 0);
    __state.gl.drawBuffers([__state.gl.COLOR_ATTACHMENT0, __state.gl.COLOR_ATTACHMENT1]);
    __state.fxDirty = true;
  }

function uploadRampsImpl(__state) {
    __state.rampRows.fill(0);
    __state.rampList.forEach(([base, len2], i) => {
      __state.rampRows.set([base, len2, 0, 0], i * 4);
    });
    for (let i = 0; i < MAX_RAMPS; i += 1) __state.rampRows[(MAX_RAMPS + i) * 4] = -1;
    if (__state.fxU) {
      for (const [r, from, speed] of __state.fxU.ramps.cycle) {
        __state.rampRows[r * 4 + 2] = from;
        __state.rampRows[r * 4 + 3] = speed;
      }
      for (const [r, to] of __state.fxU.ramps.grade) __state.rampRows[(MAX_RAMPS + r) * 4] = to;
    }
    __state.gl.bindTexture(__state.gl.TEXTURE_2D, __state.rampTex);
    __state.gl.texSubImage2D(__state.gl.TEXTURE_2D, 0, 0, 0, MAX_RAMPS, 2, __state.gl.RGBA, __state.gl.FLOAT, __state.rampRows);
  }

function refreshFxImpl(__state) {
    __state.fxResolved = resolveFx(__state.fxList, { width: __state.W2, height: __state.H });
    const u = fxUniforms(__state.fxResolved, { ramp: (n) => __state.rampIndex.get(n) ?? -1, rampOf: (i) => __state.rampList[i] ?? [0, 1], style: __state.style, far: FAR });
    __state.fxU = u;
    if (u.screen && u.screen !== __state.screenLoaded) {
      __state.gl.bindTexture(__state.gl.TEXTURE_2D, __state.screenTex);
      __state.gl.pixelStorei(__state.gl.UNPACK_ALIGNMENT, 1);
      __state.gl.texSubImage2D(__state.gl.TEXTURE_2D, 0, 0, 0, SCREEN_TILE, SCREEN_TILE, __state.gl.RED, __state.gl.UNSIGNED_BYTE, screenTile(u.screen, SCREEN_TILE));
      __state.screenLoaded = u.screen;
    }
    __state.uploadRamps();
    __state.fxDirty = false;
    return u;
  }

function fineBuffersImpl(__state, k) {
    if (__state.fine && __state.fine.k === k && __state.fine.w === __state.W2 * k && __state.fine.h === __state.H * k) return __state.fine;
    if (__state.fine) {
      for (const t of [__state.fine.data, __state.fine.data2, __state.fine.depth, __state.fine.colour]) __state.gl.deleteTexture(t);
      __state.gl.deleteFramebuffer(__state.fine.fbo);
      __state.gl.deleteFramebuffer(__state.fine.colourFbo);
    }
    const w = __state.W2 * k, h = __state.H * k;
    const tex = (internal, format, type) => {
      const t = __state.gl.createTexture();
      __state.gl.bindTexture(__state.gl.TEXTURE_2D, t);
      __state.gl.texImage2D(__state.gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
      __state.nearest();
      return t;
    };
    const data = tex(__state.gl.RGBA8, __state.gl.RGBA, __state.gl.UNSIGNED_BYTE), data2 = tex(__state.gl.RGBA8, __state.gl.RGBA, __state.gl.UNSIGNED_BYTE), depth = tex(__state.gl.DEPTH_COMPONENT24, __state.gl.DEPTH_COMPONENT, __state.gl.UNSIGNED_INT);
    const fb = __state.gl.createFramebuffer();
    __state.gl.bindFramebuffer(__state.gl.FRAMEBUFFER, fb);
    __state.gl.framebufferTexture2D(__state.gl.FRAMEBUFFER, __state.gl.COLOR_ATTACHMENT0, __state.gl.TEXTURE_2D, data, 0);
    __state.gl.framebufferTexture2D(__state.gl.FRAMEBUFFER, __state.gl.COLOR_ATTACHMENT1, __state.gl.TEXTURE_2D, data2, 0);
    __state.gl.framebufferTexture2D(__state.gl.FRAMEBUFFER, __state.gl.DEPTH_ATTACHMENT, __state.gl.TEXTURE_2D, depth, 0);
    __state.gl.drawBuffers([__state.gl.COLOR_ATTACHMENT0, __state.gl.COLOR_ATTACHMENT1]);
    const colour2 = tex(__state.gl.RGBA8, __state.gl.RGBA, __state.gl.UNSIGNED_BYTE), colourFbo = __state.gl.createFramebuffer();
    __state.gl.bindFramebuffer(__state.gl.FRAMEBUFFER, colourFbo);
    __state.gl.framebufferTexture2D(__state.gl.FRAMEBUFFER, __state.gl.COLOR_ATTACHMENT0, __state.gl.TEXTURE_2D, colour2, 0);
    __state.fine = { k, w, h, fbo: fb, data, data2, depth, colourFbo, colour: colour2 };
    return __state.fine;
  }

function rasterModeImpl(__state) {
    if (__state.rasterState) return __state.rasterState;
    const prog = program(__state.gl, RASTER_VS, RASTER_FS);
    const depthOut = program(__state.gl, FULLSCREEN_VS, DEPTH_OUT_FS);
    const kind = (t) => {
      const vao = __state.gl.createVertexArray();
      __state.gl.bindVertexArray(vao);
      const vb = __state.gl.createBuffer();
      __state.gl.bindBuffer(__state.gl.ARRAY_BUFFER, vb);
      __state.gl.bufferData(__state.gl.ARRAY_BUFFER, t.verts, __state.gl.STATIC_DRAW);
      __state.gl.enableVertexAttribArray(0);
      __state.gl.vertexAttribPointer(0, 3, __state.gl.FLOAT, false, 0, 0);
      const nb = __state.gl.createBuffer();
      __state.gl.bindBuffer(__state.gl.ARRAY_BUFFER, nb);
      __state.gl.bufferData(__state.gl.ARRAY_BUFFER, t.norms, __state.gl.STATIC_DRAW);
      __state.gl.enableVertexAttribArray(1);
      __state.gl.vertexAttribPointer(1, 3, __state.gl.FLOAT, false, 0, 0);
      const ib = __state.gl.createBuffer();
      __state.gl.bindBuffer(__state.gl.ELEMENT_ARRAY_BUFFER, ib);
      __state.gl.bufferData(__state.gl.ELEMENT_ARRAY_BUFFER, t.index, __state.gl.STATIC_DRAW);
      const inst = __state.gl.createBuffer();
      __state.gl.bindBuffer(__state.gl.ARRAY_BUFFER, inst);
      __state.gl.bufferData(__state.gl.ARRAY_BUFFER, 1024 * RASTER_FLOATS * 4, __state.gl.DYNAMIC_DRAW);
      for (let k = 0; k < 4; k += 1) {
        __state.gl.enableVertexAttribArray(2 + k);
        __state.gl.vertexAttribPointer(2 + k, 4, __state.gl.FLOAT, false, RASTER_FLOATS * 4, k * 16);
        __state.gl.vertexAttribDivisor(2 + k, 1);
      }
      __state.gl.bindVertexArray(null);
      return { vao, inst, cap: 1024, count: t.index.length };
    };
    const box2 = kind(boxTemplate());
    __state.rasterState = { prog, depthOut, box: box2, wedge: kind(boxTemplate()), capsule: kind(capsuleTemplate(8, 2)), meshes: /* @__PURE__ */ new Map() };
    return __state.rasterState;
  }

function drawRasterImpl(__state, frame, eye, fwd, right, up, tanF, sunN, waterY, fogNear, fogFar, time) {
    const R = __state.rasterMode();
    const RU = R.prog.loc;
    __state.gl.enable(__state.gl.DEPTH_TEST);
    __state.gl.depthFunc(__state.gl.LESS);
    __state.gl.depthMask(true);
    __state.gl.useProgram(R.prog.p);
    __state.gl.uniform3fv(RU.uEye, eye);
    __state.gl.uniform3fv(RU.uFwd, fwd);
    __state.gl.uniform3fv(RU.uRight, right);
    __state.gl.uniform3fv(RU.uUp, up);
    __state.gl.uniform1f(RU.uTan, tanF);
    __state.gl.uniform1f(RU.uAspect, __state.RW / __state.RH);
    __state.gl.activeTexture(__state.gl.TEXTURE1);
    __state.gl.bindTexture(__state.gl.TEXTURE_2D, __state.matTex);
    __state.gl.uniform1i(RU.uMats, 1);
    __state.gl.uniform3fv(RU.uSun, sunN);
    __state.gl.uniform1f(RU.uWaterY, frame.waterY ?? waterY);
    __state.gl.uniform1f(RU.uFogNear, fogNear);
    __state.gl.uniform1f(RU.uFogFar, fogFar);
    __state.gl.uniform2f(RU.uRes, __state.RW, __state.RH);
    __state.gl.uniform1f(RU.uTime, time);
    let tris = 0, insts = 0, meshes = 0;
    for (const key2 of frame.meshes ?? []) {
      const m = R.meshes.get(key2);
      if (!m || !m.count) continue;
      __state.gl.uniform1i(RU.uKind, 0);
      __state.gl.bindVertexArray(m.vao);
      if (m.indexed) __state.gl.drawElements(__state.gl.TRIANGLES, m.count, __state.gl.UNSIGNED_INT, 0);
      else __state.gl.drawArrays(__state.gl.TRIANGLES, 0, m.count);
      tris += m.count / 3;
      meshes += 1;
    }
    const solids = frame.solids;
    if (solids) {
      for (const [k, buf, id] of [[R.box, solids.boxes, 1], [R.wedge, solids.wedges, 2], [R.capsule, solids.capsules, 3]]) {
        if (!buf.count) continue;
        __state.gl.bindVertexArray(k.vao);
        __state.gl.bindBuffer(__state.gl.ARRAY_BUFFER, k.inst);
        if (buf.count > k.cap) {
          k.cap = Math.max(buf.count, k.cap * 2);
          __state.gl.bufferData(__state.gl.ARRAY_BUFFER, k.cap * RASTER_FLOATS * 4, __state.gl.DYNAMIC_DRAW);
        }
        __state.gl.bufferSubData(__state.gl.ARRAY_BUFFER, 0, buf.data, 0, buf.count * RASTER_FLOATS);
        __state.gl.uniform1i(RU.uKind, id);
        __state.gl.drawElementsInstanced(__state.gl.TRIANGLES, k.count, __state.gl.UNSIGNED_SHORT, 0, buf.count);
        tris += k.count / 3 * buf.count;
        insts += buf.count;
      }
    }
    __state.gl.bindVertexArray(null);
    __state.rasterStats.meshes = meshes;
    __state.rasterStats.triangles = tris;
    __state.rasterStats.instances = insts;
    if (frame.draw) {
      frame.draw({ gl: __state.gl, eye: [eye[0], eye[1], eye[2]], forward: fwd, right, up, tan: tanF, width: __state.RW, height: __state.RH, far: FAR, time, sun: sunN });
      __state.gl.bindFramebuffer(__state.gl.FRAMEBUFFER, __state.rfbo);
      __state.gl.viewport(0, 0, __state.RW, __state.RH);
      __state.gl.drawBuffers([__state.gl.COLOR_ATTACHMENT0, __state.gl.COLOR_ATTACHMENT1]);
      __state.gl.enable(__state.gl.DEPTH_TEST);
      __state.gl.depthFunc(__state.gl.LESS);
      __state.gl.depthMask(true);
    }
  }

function writeDepthOutImpl(__state, map) {
    const R = __state.rasterMode();
    const scale2 = map === true ? 1 : map.scale ?? 1, bias = map === true ? 0 : map.bias ?? 0;
    __state.gl.enable(__state.gl.DEPTH_TEST);
    __state.gl.depthFunc(__state.gl.ALWAYS);
    __state.gl.depthMask(true);
    __state.gl.colorMask(false, false, false, false);
    const D = __state.lastK > 1 ? __state.smoothDepthOutP ??= program(__state.gl, FULLSCREEN_VS, smoothDepthOutFs(DEPTH_OUT_FS)) : R.depthOut;
    __state.gl.useProgram(D.p);
    __state.gl.uniform2f(D.loc.uMap, scale2, bias);
    if (__state.lastK > 1) __state.gl.uniform1i(D.loc.uSS, __state.lastK);
    __state.pass(D.p, null, [[__state.lastK > 1 ? __state.fine.depth : __state.depthTex, D.loc.uDepth]]);
    __state.gl.colorMask(true, true, true, true);
    __state.gl.disable(__state.gl.DEPTH_TEST);
  }

export {
  RESOLVE_FS,
  createIndexedPass,
  dot2,
  drawRasterImpl,
  fineBuffersImpl,
  norm3,
  program,
  rasterModeImpl,
  refreshFxImpl,
  supersampleFor,
  targetImpl,
  uploadRampsImpl,
  uploadWorld,
  writeDepthOutImpl,
};
