import './indexed-render.mjs';
import {
  adaptTargetPalette,
  cameraBasis,
  targetProfile,
} from './core-primitives.mjs';
import {
  FULLSCREEN_VS,
  MAX_BOXES,
  MAX_CAPS,
  MAX_COLOURS,
  MAX_MATERIALS,
  MAX_RAMPS,
  MAX_WEDGES,
  PALETTE_WIDTH,
  POINTS_FS,
  POINTS_VS,
  SCREEN_TILE,
  SKY_MAT,
  WORLD_FS,
  resolveFx,
  toggleFxList,
} from './effects-world.mjs';
import {
  DEPTH_FS,
  DIRECT_PIXEL_FS,
  PIXEL_FS,
  smoothPixelFs,
  unpackDepth,
} from './pixel-raster.mjs';
import {
  RESOLVE_FS,
  createIndexedPass,
  dot2,
  norm3,
  program,
  supersampleFor,
  uploadWorld,
} from './indexed-render.mjs';


function prepareRender(__state, __frame) {
  { const { world, pixel, points } = __state.colourPrograms(); __frame.world = world; __frame.pixel = pixel; __frame.points = points; }
  __frame.fx = __state.fxDirty || !__state.fxU ? __state.refreshFx() : __state.fxU;
  __frame.timing = false;
  if (__state.timer) {
          if (__state.query && __state.gl.getQueryParameter(__state.query, __state.gl.QUERY_RESULT_AVAILABLE)) {
            if (!__state.gl.getParameter(__state.timer.GPU_DISJOINT_EXT)) __state.gpuMs = __state.gl.getQueryParameter(__state.query, __state.gl.QUERY_RESULT) / 1e6;
            __state.gl.deleteQuery(__state.query);
            __state.query = null;
          }
          if (!__state.query) {
            __state.query = __state.gl.createQuery();
            __state.gl.beginQuery(__state.timer.TIME_ELAPSED_EXT, __state.query);
            __frame.timing = true;
          }
        }
  { const { forward: fwd, right, up } = cameraBasis(__frame.eye, __frame.look); __frame.fwd = fwd; __frame.right = right; __frame.up = up; }
  __frame.tanF = Math.tan(__frame.fov / 2);
  __frame.sunN = norm3(__frame.sun);
  __frame.k = __state.edges === "smooth" && __state.activeProfile.kind === "native" ? supersampleFor(__state.W2, __state.H, __state.supersample) : 1;
  __frame.F = __frame.k > 1 ? __state.fineBuffers(__frame.k) : null;
  __state.lastK = __frame.k;
  __state.RW = __frame.F ? __frame.F.w : __state.W2;
  __state.RH = __frame.F ? __frame.F.h : __state.H;
  __state.rfbo = __frame.F ? __frame.F.fbo : __state.fbo;
  __state.gl.bindFramebuffer(__state.gl.FRAMEBUFFER, __state.rfbo);
  __state.gl.viewport(0, 0, __state.RW, __state.RH);
  __state.gl.enable(__state.gl.DEPTH_TEST);
  __state.gl.depthFunc(__state.gl.ALWAYS);
  __state.gl.clear(__state.gl.COLOR_BUFFER_BIT | __state.gl.DEPTH_BUFFER_BIT);
  __frame.U = __frame.world.loc;
  __state.gl.useProgram(__frame.world.p);
  __state.gl.uniform2f(__frame.U.uRes, __state.RW, __state.RH);
  __state.gl.uniform3fv(__frame.U.uEye, __frame.eye);
  __state.gl.uniform3fv(__frame.U.uFwd, __frame.fwd);
  __state.gl.uniform3fv(__frame.U.uRight, __frame.right);
  __state.gl.uniform3fv(__frame.U.uUp, __frame.up);
  __state.gl.uniform1f(__frame.U.uTan, __frame.tanF);
  __state.gl.uniform1f(__frame.U.uTime, __frame.time);
  __state.gl.uniform1i(__frame.U.uBoxes, __state.nBoxes);
  __state.gl.uniform1i(__frame.U.uWedges, __state.nWedges);
  __state.gl.uniform1i(__frame.U.uCaps, __state.nCaps);
  for (const blk of __state.blocks) __state.gl.bindBufferBase(__state.gl.UNIFORM_BUFFER, blk.i, blk.buf);
  __state.gl.activeTexture(__state.gl.TEXTURE1);
  __state.gl.bindTexture(__state.gl.TEXTURE_2D, __state.matTex);
  __state.gl.uniform1i(__frame.U.uMats, 1);
  __state.gl.uniform3fv(__frame.U.uSun, __frame.sunN);
  __state.gl.uniform1f(__frame.U.uWaterY, __frame.waterY);
  __state.gl.uniform1f(__frame.U.uFogNear, __frame.fogNear);
  __state.gl.uniform1f(__frame.U.uFogFar, __frame.fogFar);
}

function drawRender(__state, __frame) {
  if (__frame.raster?.world === false) {
          __state.gl.clearBufferfv(__state.gl.COLOR, 0, [0.5, (__state.matRows[SKY_MAT * 4] ?? 0) / 255, SKY_MAT / 255, 1]);
          __state.gl.clearBufferfv(__state.gl.COLOR, 1, [0, 1, 0, 0]);
        } else {
          __state.gl.bindBuffer(__state.gl.ARRAY_BUFFER, __state.quad);
          const aw = __state.gl.getAttribLocation(__frame.world.p, "aPos");
          __state.gl.enableVertexAttribArray(aw);
          __state.gl.vertexAttribPointer(aw, 2, __state.gl.FLOAT, false, 0, 0);
          __state.gl.drawArrays(__state.gl.TRIANGLES, 0, 3);
        }
  if (__frame.particles.length) {
          __state.gl.depthFunc(__state.gl.LESS);
          const data = new Float32Array(__frame.particles.length * 7);
          __frame.particles.forEach((q, i) => data.set([q.p[0], q.p[1], q.p[2], q.size ?? 1, q.light ?? 0.8, (q.ramp === void 0 ? void 0 : __state.rampIndex.get(q.ramp)) ?? 0, q.glow ?? 0], i * 7));
          __state.gl.useProgram(__frame.points.p);
          const P = __frame.points.loc;
          __state.gl.uniform3fv(P.uEye, __frame.eye);
          __state.gl.uniform3fv(P.uFwd, __frame.fwd);
          __state.gl.uniform3fv(P.uRight, __frame.right);
          __state.gl.uniform3fv(P.uUp, __frame.up);
          __state.gl.uniform1f(P.uTan, __frame.tanF);
          __state.gl.uniform1f(P.uAspect, __state.RW / __state.RH);
          __state.gl.uniform1f(P.uH, __state.RH);
          __state.gl.bindBuffer(__state.gl.ARRAY_BUFFER, __state.pbuf);
          __state.gl.bufferData(__state.gl.ARRAY_BUFFER, data, __state.gl.DYNAMIC_DRAW);
          const a0 = __state.gl.getAttribLocation(__frame.points.p, "aPos");
          const a1 = __state.gl.getAttribLocation(__frame.points.p, "aLook");
          __state.gl.enableVertexAttribArray(a0);
          __state.gl.vertexAttribPointer(a0, 4, __state.gl.FLOAT, false, 28, 0);
          __state.gl.enableVertexAttribArray(a1);
          __state.gl.vertexAttribPointer(a1, 3, __state.gl.FLOAT, false, 28, 16);
          __state.gl.drawArrays(__state.gl.POINTS, 0, __frame.particles.length);
          __state.gl.disableVertexAttribArray(a1);
        }
  if (__frame.raster) __state.drawRaster(__frame.raster, __frame.eye, __frame.fwd, __frame.right, __frame.up, __frame.tanF, __frame.sunN, __frame.waterY, __frame.fogNear, __frame.fogFar, __frame.time);
  __state.gl.disable(__state.gl.DEPTH_TEST);
  __state.gl.bindFramebuffer(__state.gl.FRAMEBUFFER, __frame.F ? __frame.F.colourFbo : null);
  __state.gl.viewport(0, 0, __state.RW, __state.RH);
  __frame.pass2 = __frame.F ? __frame.raster?.draw ? __state.smoothDirectP ??= program(__state.gl, FULLSCREEN_VS, smoothPixelFs(DIRECT_PIXEL_FS)) : __state.smoothPixelP ??= program(__state.gl, FULLSCREEN_VS, smoothPixelFs(PIXEL_FS)) : __frame.raster?.draw ? __state.directPixelP ??= program(__state.gl, FULLSCREEN_VS, DIRECT_PIXEL_FS) : __frame.pixel;
  __state.gl.useProgram(__frame.pass2.p);
  __frame.X = __frame.pass2.loc;
  __frame.T = [[__frame.F ? __frame.F.data : __state.dataTex, "uData"], [__frame.F ? __frame.F.data2 : __state.data2Tex, "uData2"], [__frame.F ? __frame.F.depth : __state.depthTex, "uDepth"], [__state.palTex, "uPalette"], [__state.rampTex, "uRamps"], [__state.screenTex, "uScreenTex"]];
  __frame.T.forEach(([t, name], i) => {
          __state.gl.activeTexture(__state.gl.TEXTURE0 + i);
          __state.gl.bindTexture(__state.gl.TEXTURE_2D, t);
          __state.gl.uniform1i(__frame.X[name], i);
        });
  __frame.u = __frame.fx.u;
  __state.gl.uniform1i(__frame.X.uScreen, __frame.u.uScreen);
  __state.gl.uniform1f(__frame.X.uDither, __frame.u.uDither);
  __state.gl.uniform1f(__frame.X.uTime, __frame.time);
  __state.gl.uniform3fv(__frame.X.uOutline, __frame.u.uOutline);
  __state.gl.uniform1i(__frame.X.uOutlineInk, __frame.u.uOutlineInk);
}

function composeRender(__state, __frame) {
  __state.gl.uniform4fv(__frame.X.uFog, __frame.u.uFog);
  __state.gl.uniform2fv(__frame.X.uFogLook, __frame.u.uFogLook);
  __state.gl.uniform4fv(__frame.X.uGlow, __frame.u.uGlow);
  __state.gl.uniform2fv(__frame.X.uGlowK, __frame.u.uGlowK);
  __state.gl.uniform4fv(__frame.X.uVig, __frame.u.uVig);
  __state.gl.uniform4fv(__frame.X.uScan, __frame.u.uScan);
  __state.gl.uniform4fv(__frame.X.uCrt, __frame.u.uCrt);
  __state.gl.uniform4fv(__frame.X.uRim, __frame.u.uRim);
  __frame.rd = __frame.u.uRimDir;
  if (!__frame.rd) {
          const sx = dot2(__frame.sunN, __frame.right);
          const sy = dot2(__frame.sunN, __frame.up);
          const l = Math.hypot(sx, sy);
          __frame.rd = l > 1e-3 ? [sx / l, sy / l] : [0, 1];
        }
  __state.gl.uniform2fv(__frame.X.uRimDir, __frame.rd);
  __state.gl.uniform4fv(__frame.X.uFlash, __frame.u.uFlash);
  __state.gl.uniform4iv(__frame.X.uFlashMats, __frame.u.uFlashMats);
  __state.gl.uniform2fv(__frame.X.uGrade, __frame.u.uGrade);
  __state.gl.uniform1i(__frame.X.uCycle, __frame.u.uCycle);
  if (__frame.F) __state.gl.uniform1i(__frame.X.uSS, __frame.k);
  __state.gl.bindBuffer(__state.gl.ARRAY_BUFFER, __state.quad);
  __frame.ap = __state.gl.getAttribLocation(__frame.pass2.p, "aPos");
  __state.gl.enableVertexAttribArray(__frame.ap);
  __state.gl.vertexAttribPointer(__frame.ap, 2, __state.gl.FLOAT, false, 0, 0);
  __state.gl.drawArrays(__state.gl.TRIANGLES, 0, 3);
  if (__frame.F) {
          const rp = __state.resolveP ??= program(__state.gl, FULLSCREEN_VS, RESOLVE_FS);
          __state.gl.bindFramebuffer(__state.gl.FRAMEBUFFER, null);
          __state.gl.viewport(0, 0, __state.W2, __state.H);
          __state.gl.useProgram(rp.p);
          __state.gl.activeTexture(__state.gl.TEXTURE0);
          __state.gl.bindTexture(__state.gl.TEXTURE_2D, __frame.F.colour);
          __state.gl.uniform1i(rp.loc.uColour, 0);
          __state.gl.uniform1i(rp.loc.uSS, __frame.k);
          const ar = __state.gl.getAttribLocation(rp.p, "aPos");
          __state.gl.enableVertexAttribArray(ar);
          __state.gl.vertexAttribPointer(ar, 2, __state.gl.FLOAT, false, 0, 0);
          __state.gl.drawArrays(__state.gl.TRIANGLES, 0, 3);
        }
  if (__frame.depthOut) __state.writeDepthOut(__frame.depthOut);
  if (__frame.timing && __state.timer) __state.gl.endQuery(__state.timer.TIME_ELAPSED_EXT);
}

function initializeGraphics(__state) {
  __state.ctx = __state.canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!__state.ctx) throw new Error("WebGL2 is not available");
  __state.gl = __state.ctx;
  __state.worldP = null;
  __state.pixelP = null;
  __state.pointsP = null;
  __state.directPixelP = null;
  __state.colourPrograms = () => {
      if (!__state.worldP) {
        const w = program(__state.gl, FULLSCREEN_VS, WORLD_FS);
        if (__state.bakeOnly) ["Boxes", "Wedges", "Capsules"].forEach((name, i) => __state.gl.uniformBlockBinding(w.p, __state.gl.getUniformBlockIndex(w.p, name), i));
        __state.worldP = w;
        __state.pixelP = program(__state.gl, FULLSCREEN_VS, PIXEL_FS);
        __state.pointsP = program(__state.gl, POINTS_VS, POINTS_FS);
      }
      return { world: __state.worldP, pixel: __state.pixelP, points: __state.pointsP };
    };
  if (!__state.bakeOnly) __state.colourPrograms();
  __state.quad = __state.gl.createBuffer();
  __state.gl.bindBuffer(__state.gl.ARRAY_BUFFER, __state.quad);
  __state.gl.bufferData(__state.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), __state.gl.STATIC_DRAW);
  __state.pbuf = __state.gl.createBuffer();
  __state.nearest = () => {
      for (const [k, v] of [[__state.gl.TEXTURE_MIN_FILTER, __state.gl.NEAREST], [__state.gl.TEXTURE_MAG_FILTER, __state.gl.NEAREST], [__state.gl.TEXTURE_WRAP_S, __state.gl.CLAMP_TO_EDGE], [__state.gl.TEXTURE_WRAP_T, __state.gl.CLAMP_TO_EDGE]]) __state.gl.texParameteri(__state.gl.TEXTURE_2D, k, v);
    };
  __state.floatTex = (w, h, data = null) => {
      const t = __state.gl.createTexture();
      __state.gl.bindTexture(__state.gl.TEXTURE_2D, t);
      __state.gl.texImage2D(__state.gl.TEXTURE_2D, 0, __state.gl.RGBA32F, w, h, 0, __state.gl.RGBA, __state.gl.FLOAT, data);
      __state.nearest();
      return t;
    };
  __state.W2 = __state.width;
  __state.H = __state.height;
  __state.fbo = null;
  __state.dataTex = null;
  __state.data2Tex = null;
  __state.depthTex = null;
  __state.blocks = [["Boxes", 2 * MAX_BOXES], ["Wedges", 3 * MAX_WEDGES], ["Capsules", 2 * MAX_CAPS]].map(([name, vecs], i) => {
      const data = new Float32Array(vecs * 4);
      const buf = __state.gl.createBuffer();
      __state.gl.bindBuffer(__state.gl.UNIFORM_BUFFER, buf);
      __state.gl.bufferData(__state.gl.UNIFORM_BUFFER, data.byteLength, __state.gl.DYNAMIC_DRAW);
      if (__state.worldP) __state.gl.uniformBlockBinding(__state.worldP.p, __state.gl.getUniformBlockIndex(__state.worldP.p, name), i);
      return { data, buf, i };
    });
  { const [boxBlock, wedgeBlock, capBlock] = __state.blocks; __state.boxBlock = boxBlock; __state.wedgeBlock = wedgeBlock; __state.capBlock = capBlock; }
  __state.rampRows = new Float32Array(MAX_RAMPS * 2 * 4);
  __state.rampTex = __state.floatTex(MAX_RAMPS, 2, __state.rampRows);
  __state.matRows = new Float32Array(256 * 4);
  __state.matTex = __state.floatTex(256, 1, __state.matRows);
  __state.screenTex = __state.gl.createTexture();
  __state.gl.bindTexture(__state.gl.TEXTURE_2D, __state.screenTex);
  __state.gl.texImage2D(__state.gl.TEXTURE_2D, 0, __state.gl.R8, SCREEN_TILE, SCREEN_TILE, 0, __state.gl.RED, __state.gl.UNSIGNED_BYTE, new Uint8Array(SCREEN_TILE * SCREEN_TILE));
  __state.nearest();
}

function initializePaletteAndEffects(__state) {
  __state.screenLoaded = null;
  __state.timer = __state.gl.getExtension("EXT_disjoint_timer_query_webgl2");
  __state.query = null;
  __state.gpuMs = null;
  __state.palTex = null;
  __state.palette = [];
  __state.rampIndex = new Map();
  __state.rampList = [];
  __state.nBoxes = 0;
  __state.nWedges = 0;
  __state.nCaps = 0;
  __state.style = { screen: 4, dither: 0.9, outline: 1 };
  __state.activeProfile = targetProfile("native");
  __state.authoredSize = [__state.width, __state.height];
  __state.authoredStyle = { ...__state.style };
  __state.authoredPalette = [];
  __state.authoredRamps = {};
  __state.fxList = [];
  __state.fxResolved = [];
  __state.fxU = null;
  __state.fxDirty = true;
  __state.target(__state.W2, __state.H);
  __state.edges = "smooth";
  __state.supersample = "auto";
  __state.lastK = 1;
  __state.fine = null;
  __state.smoothPixelP = null;
  __state.smoothDirectP = null;
  __state.resolveP = null;
  __state.smoothDepthOutP = null;
  __state.RW = __state.W2;
  __state.RH = __state.H;
  __state.rfbo = null;
}

function initializeIndexedBuffers(__state) {
  __state.indexed = createIndexedPass({
      gl: __state.gl,
      quad: __state.quad,
      matTex: __state.matTex,
      blocks: __state.blocks,
      get width() {
        return __state.W2;
      },
      get height() {
        return __state.H;
      },
      get fbo() {
        return __state.fbo;
      },
      get dataTex() {
        return __state.dataTex;
      },
      get data2Tex() {
        return __state.data2Tex;
      },
      get depthTex() {
        return __state.depthTex;
      },
      counts: { get boxes() {
        return __state.nBoxes;
      }, get wedges() {
        return __state.nWedges;
      }, get capsules() {
        return __state.nCaps;
      } }
    }, () => program(__state.gl, FULLSCREEN_VS, DEPTH_FS));
  { const { mode: bakeMode, pass, readTarget } = __state.indexed; __state.bakeMode = bakeMode; __state.pass = pass; __state.readTarget = readTarget; }
  __state.rasterState = null;
  __state.rasterStats = { meshes: 0, triangles: 0, instances: 0, meshBytes: 0 };
}

function makeSetTarget(__state) {
  return function setTarget(w, h) {
      if (__state.activeProfile.kind === "hardware" && (w !== __state.activeProfile.width || h !== __state.activeProfile.height)) throw new RangeError(`${__state.activeProfile.label} preview requires ${__state.activeProfile.width} \xD7 ${__state.activeProfile.height}`);
      __state.target(Math.max(8, w | 0), Math.max(8, h | 0));
      if (__state.activeProfile.kind === "native") __state.authoredSize = [__state.W2, __state.H];
    };
}

function makeSetProfile(__state) {
  return function setProfile(input) {
      const next = targetProfile(input);
      __state.activeProfile = next;
      if (next.kind === "native") {
        __state.target(__state.authoredSize[0], __state.authoredSize[1]);
        __state.style = { ...__state.authoredStyle };
      } else {
        __state.target(next.width, next.height);
        __state.style = { ...__state.authoredStyle, screen: next.screen, dither: next.dither };
      }
      if (__state.authoredPalette.length) __state.api.setPalette(__state.authoredPalette, __state.authoredRamps);
      __state.fxDirty = true;
    };
}

function makeSetPalette(__state) {
  return function setPalette(colours, ramps) {
      if (colours.length > MAX_COLOURS) throw new RangeError(`${colours.length} colours: at most ${MAX_COLOURS}`);
      const sourceColours = colours.map((c) => [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]);
      if (__state.activeProfile.kind !== "native") colours = adaptTargetPalette(sourceColours, __state.activeProfile.id);
      __state.palette = colours.map((c) => [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]);
      const rows = Math.max(1, Math.ceil(colours.length / PALETTE_WIDTH));
      const bytes = new Uint8Array(PALETTE_WIDTH * rows * 4);
      colours.forEach((c, i) => {
        bytes[i * 4] = c[0] ?? 0;
        bytes[i * 4 + 1] = c[1] ?? 0;
        bytes[i * 4 + 2] = c[2] ?? 0;
        bytes[i * 4 + 3] = 255;
      });
      if (__state.palTex) __state.gl.deleteTexture(__state.palTex);
      __state.palTex = __state.gl.createTexture();
      __state.gl.bindTexture(__state.gl.TEXTURE_2D, __state.palTex);
      __state.gl.pixelStorei(__state.gl.UNPACK_ALIGNMENT, 4);
      __state.gl.texImage2D(__state.gl.TEXTURE_2D, 0, __state.gl.RGBA8, PALETTE_WIDTH, rows, 0, __state.gl.RGBA, __state.gl.UNSIGNED_BYTE, bytes);
      __state.nearest();
      const entries = Object.entries(ramps);
      if (entries.length > MAX_RAMPS) throw new RangeError(`${entries.length} ramps: at most ${MAX_RAMPS}`);
      __state.authoredPalette = sourceColours;
      __state.authoredRamps = Object.fromEntries(entries.map(([name, slot]) => [name, [...slot]]));
      __state.rampIndex = /* @__PURE__ */ new Map();
      __state.rampList = entries.map(([name, [base, len2]], i) => {
        __state.rampIndex.set(name, i);
        return [base, len2];
      });
      __state.fxDirty = true;
    };
}

function makeSetMaterials(__state) {
  return function setMaterials(list) {
      if (list.length > MAX_MATERIALS) throw new RangeError(`${list.length} materials: at most ${MAX_MATERIALS}`);
      __state.matRows.fill(0);
      list.forEach((m, i) => {
        __state.matRows.set([__state.rampIndex.get(m.ramp) ?? 0, m.light ?? 1, m.pattern ?? 0, m.glow ?? 0], i * 4);
      });
      __state.gl.bindTexture(__state.gl.TEXTURE_2D, __state.matTex);
      __state.gl.texSubImage2D(__state.gl.TEXTURE_2D, 0, 0, 0, 256, 1, __state.gl.RGBA, __state.gl.FLOAT, __state.matRows);
    };
}

function makeSetStyle(__state) {
  return function setStyle({ screen: s = __state.style.screen, dither: d = __state.style.dither, outline: o = __state.style.outline, edges: e = __state.edges, supersample: k = __state.supersample } = {}) {
      __state.style = { screen: s, dither: d, outline: o ? 1 : 0 };
      __state.edges = e;
      __state.supersample = k;
      __state.authoredStyle = { ...__state.style };
      __state.fxDirty = true;
    };
}

function makeSetWorld(__state) {
  return function setWorld(world) {
      const counts = uploadWorld(__state.gl, __state.blocks, world);
      __state.nBoxes = counts.boxes;
      __state.nWedges = counts.wedges;
      __state.nCaps = counts.capsules;
      return counts;
    };
}

function makeSetFx(__state) {
  return function setFx(list = []) {
      __state.fxList = list.map((e) => ({ ...e }));
      resolveFx(__state.fxList, { width: __state.W2, height: __state.H });
      __state.fxDirty = true;
    };
}

function makeToggleFx(__state) {
  return function toggleFx(name, on) {
      __state.fxList = toggleFxList(__state.fxList, name, on);
      __state.fxDirty = true;
    };
}

function makeRender(__state) {
  return function render({ eye, target: look, fov = 1.2, time = 0, sun = [0.4, 0.8, 0.3], waterY = 0, fogNear = 25, fogFar = 110, particles = [], raster, depthOut }) {
    const __frame = { eye, look, fov, time, sun, waterY, fogNear, fogFar, particles, raster, depthOut };
    prepareRender(__state, __frame);
    drawRender(__state, __frame);
    composeRender(__state, __frame);
  };
}

function makeRead(__state) {
  return function read() {
      const out = new Uint8Array(__state.W2 * __state.H * 4);
      __state.gl.readPixels(0, 0, __state.W2, __state.H, __state.gl.RGBA, __state.gl.UNSIGNED_BYTE, out);
      return out;
    };
}

function makeReadData(__state) {
  return function readData() {
      const x = __state.bakeMode();
      const data = __state.readTarget(__state.fbo, __state.gl.COLOR_ATTACHMENT0);
      const data2 = __state.readTarget(__state.fbo, __state.gl.COLOR_ATTACHMENT1);
      __state.gl.disable(__state.gl.DEPTH_TEST);
      __state.pass(x.depth.p, x.fb, [[__state.depthTex, x.depth.loc.uDepth]]);
      const packed = __state.readTarget(x.fb, __state.gl.COLOR_ATTACHMENT0);
      const depth = new Float32Array(__state.W2 * __state.H);
      for (let i = 0; i < depth.length; i += 1) depth[i] = unpackDepth(packed[i * 4], packed[i * 4 + 1], packed[i * 4 + 2]);
      return { width: __state.W2, height: __state.H, data, data2, depth };
    };
}

function makeSetMesh(__state) {
  return function setMesh(key2, mesh) {
      const R = __state.rasterMode();
      const old = R.meshes.get(key2);
      if (old) {
        for (const b of old.bufs) __state.gl.deleteBuffer(b);
        __state.gl.deleteVertexArray(old.vao);
        R.meshes.delete(key2);
        __state.rasterStats.meshBytes -= old.bytes;
      }
      if (!mesh) return;
      const vao = __state.gl.createVertexArray();
      __state.gl.bindVertexArray(vao);
      const bufs = [];
      const attr = (loc, data, size) => {
        const b = __state.gl.createBuffer();
        bufs.push(b);
        __state.gl.bindBuffer(__state.gl.ARRAY_BUFFER, b);
        __state.gl.bufferData(__state.gl.ARRAY_BUFFER, data, __state.gl.STATIC_DRAW);
        __state.gl.enableVertexAttribArray(loc);
        __state.gl.vertexAttribPointer(loc, size, __state.gl.FLOAT, false, 0, 0);
      };
      attr(0, mesh.positions, 3);
      attr(1, mesh.normals, 3);
      attr(2, mesh.looks, 4);
      for (let k = 3; k < 6; k += 1) {
        __state.gl.disableVertexAttribArray(k);
        __state.gl.vertexAttrib4f(k, 0, 0, 0, 0);
      }
      let bytes = mesh.positions.byteLength + mesh.normals.byteLength + mesh.looks.byteLength;
      if (mesh.indices) {
        const b = __state.gl.createBuffer();
        bufs.push(b);
        __state.gl.bindBuffer(__state.gl.ELEMENT_ARRAY_BUFFER, b);
        __state.gl.bufferData(__state.gl.ELEMENT_ARRAY_BUFFER, mesh.indices, __state.gl.STATIC_DRAW);
        bytes += mesh.indices.byteLength;
      }
      __state.gl.bindVertexArray(null);
      R.meshes.set(key2, { vao, bufs, count: mesh.indices ? mesh.indices.length : mesh.positions.length / 3, indexed: !!mesh.indices, bytes });
      __state.rasterStats.meshBytes += bytes;
    };
}

function makeOffPalette(__state) {
  return function offPalette(pixels = __state.api.read()) {
      const set = new Set(__state.palette.map((c) => c[0] << 16 | c[1] << 8 | c[2]));
      let off = 0;
      for (let i = 0; i < pixels.length; i += 4) if (!set.has((pixels[i] ?? 0) << 16 | (pixels[i + 1] ?? 0) << 8 | (pixels[i + 2] ?? 0))) off += 1;
      return off;
    };
}

export {
  initializeGraphics,
  initializeIndexedBuffers,
  initializePaletteAndEffects,
  makeOffPalette,
  makeRead,
  makeReadData,
  makeRender,
  makeSetFx,
  makeSetMaterials,
  makeSetMesh,
  makeSetPalette,
  makeSetProfile,
  makeSetStyle,
  makeSetTarget,
  makeSetWorld,
  makeToggleFx,
};
