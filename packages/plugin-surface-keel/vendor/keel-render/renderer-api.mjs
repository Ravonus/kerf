import './render-passes.mjs';
import {
  ALL_FX,
  MAX_BOXES,
  MAX_CAPS,
  MAX_COLOURS,
  MAX_MATERIALS,
  MAX_RAMPS,
  MAX_WEDGES,
} from './effects-world.mjs';
import {
  drawRasterImpl,
  fineBuffersImpl,
  rasterModeImpl,
  refreshFxImpl,
  targetImpl,
  uploadRampsImpl,
  writeDepthOutImpl,
} from './indexed-render.mjs';
import {
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
} from './render-passes.mjs';


function createRendererApi(__state) {
 return {
  gl: __state.gl,
  get width() {
      return __state.W2;
    },
  get height() {
      return __state.H;
    },
  limits: {
      boxes: MAX_BOXES,
      wedges: MAX_WEDGES,
      capsules: MAX_CAPS,
      ramps: MAX_RAMPS,
      materials: MAX_MATERIALS,
      colours: MAX_COLOURS,
      fragmentUniformVectors: __state.gl.getParameter(__state.gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      maxTexture: __state.gl.getParameter(__state.gl.MAX_TEXTURE_SIZE)
    },
  setTarget: makeSetTarget(__state),
  get profile() {
      return __state.activeProfile;
    },
  setProfile: makeSetProfile(__state),
  setPalette: makeSetPalette(__state),
  get palette() {
      return __state.palette;
    },
  ramp: (name) => __state.rampIndex.get(name) ?? 0,
  setMaterials: makeSetMaterials(__state),
  setStyle: makeSetStyle(__state),
  setWorld: makeSetWorld(__state),
  setFx: makeSetFx(__state),
  toggleFx: makeToggleFx(__state),
  get fx() {
      return __state.fxList.map((e) => ({ ...e }));
    },
  get fxResolved() {
      if (__state.fxDirty) __state.refreshFx();
      return __state.fxResolved;
    },
  allFx: ALL_FX,
  get gpuMs() {
      return __state.gpuMs;
    },
  get supersample() {
      return __state.lastK;
    },
  render: makeRender(__state),
  read: makeRead(__state),
  readData: makeReadData(__state),
  renderIndexed: __state.indexed.renderIndexed,
  readIndexed: __state.indexed.readIndexed,
  renderIndexedHeights: __state.indexed.renderIndexedHeights,
  setMesh: makeSetMesh(__state),
  get rasterStats() {
      return { ...__state.rasterStats };
    },
  offPalette: makeOffPalette(__state),
 };
}

function createPixelRenderer(canvas, { width = 128, height = 128, bakeOnly = false, profile: profile2 } = {}) {
  const __state = { canvas, width, height, bakeOnly, profile2 };
  __state.target = (...args) => targetImpl(__state, ...args);
  __state.uploadRamps = (...args) => uploadRampsImpl(__state, ...args);
  __state.refreshFx = (...args) => refreshFxImpl(__state, ...args);
  __state.fineBuffers = (...args) => fineBuffersImpl(__state, ...args);
  __state.rasterMode = (...args) => rasterModeImpl(__state, ...args);
  __state.drawRaster = (...args) => drawRasterImpl(__state, ...args);
  __state.writeDepthOut = (...args) => writeDepthOutImpl(__state, ...args);
  initializeGraphics(__state);
  initializePaletteAndEffects(__state);
  initializeIndexedBuffers(__state);
  __state.api = createRendererApi(__state);
  if (profile2 !== void 0) __state.api.setProfile(profile2);
  return __state.api;
}

export {
  createPixelRenderer,
};
