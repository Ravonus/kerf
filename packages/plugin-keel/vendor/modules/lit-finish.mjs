// lit-finish@0.1.0 from keel-modules 884d31d (MIT). Generated: don't edit.
var g=["agx","neutral","aces"],L={exposure:1,tonemap:"agx",ao:.8,aoRadius:1.2,hazeDensity:.012,hazeStart:4,hazeGlow:.9,saturation:1.05,contrast:1.18,warmth:.25,vignette:.3,translucency:.8,variation:.5,mute:.2,bloom:.12,bloomThreshold:1,taa:!0,taaBlend:.1};function c(r,t,e,n){return typeof r=="number"&&Number.isFinite(r)?Math.min(e,Math.max(t,r)):n}function j(r,t,e){return typeof r=="string"&&t.includes(r)?r:e}function x(r){if(r===null||typeof r!="object")return L;let t=r,e=L;return{exposure:c(t.exposure,0,16,e.exposure),tonemap:j(t.tonemap,g,e.tonemap),ao:c(t.ao,0,1,e.ao),aoRadius:c(t.aoRadius,.05,8,e.aoRadius),hazeDensity:c(t.hazeDensity,0,.5,e.hazeDensity),hazeStart:c(t.hazeStart,0,1e4,e.hazeStart),hazeGlow:c(t.hazeGlow,0,2,e.hazeGlow),saturation:c(t.saturation,0,2,e.saturation),contrast:c(t.contrast,.5,2,e.contrast),warmth:c(t.warmth,0,1,e.warmth),vignette:c(t.vignette,0,1,e.vignette),translucency:c(t.translucency,0,2,e.translucency),variation:c(t.variation,0,1,e.variation),mute:c(t.mute,0,1,e.mute),bloom:c(t.bloom,0,1,e.bloom),bloomThreshold:c(t.bloomThreshold,0,8,e.bloomThreshold),taa:typeof t.taa=="boolean"?t.taa:e.taa,taaBlend:c(t.taaBlend,.02,1,e.taaBlend)}}var P=16;function w(r=P){let t=[];for(let e=0;e<r;e+=1){let n=(e+.5)/r,o=Math.sqrt(n),i=e*2.399963229728653,a=(e+1)/r,u=.1+.9*a*a;t.push(Math.cos(i)*o*u,Math.sin(i)*o*u,Math.sqrt(1-n)*u)}return t}function z(r,t){let[e=0,n=0,o=0]=r,i=f=>t[f]??0,a=[i(0)*e+i(4)*n+i(8)*o,i(1)*e+i(5)*n+i(9)*o,i(2)*e+i(6)*n+i(10)*o],u=Math.hypot(a[0],a[1],a[2]);return u>0?[a[0]/u,a[1]/u,a[2]/u]:[0,0,-1]}var O=/^#[0-9a-f]{6}$/iu,S=r=>r<=.04045?r/12.92:((r+.055)/1.055)**2.4;function y(r,t){if(typeof r=="string"&&O.test(r)){let e=Number.parseInt(r.slice(1),16);return[S((e>>16&255)/255),S((e>>8&255)/255),S((e&255)/255)]}if(Array.isArray(r)&&r.length>=3&&r.slice(0,3).every(e=>typeof e=="number"&&Number.isFinite(e))){let[e,n,o]=r;return[Math.max(0,e??0),Math.max(0,n??0),Math.max(0,o??0)]}return[t[0],t[1],t[2]]}function D(r,t){let e=new Array(16).fill(0);for(let n=0;n<4;n+=1)for(let o=0;o<4;o+=1){let i=0;for(let a=0;a<4;a+=1)i+=(r[a*4+o]??0)*(t[n*4+a]??0);e[n*4+o]=i}return e}function N(r,t){let e=1,n=0;for(let o=r;o>0;o=Math.floor(o/t))e/=t,n+=e*(o%t);return n}function T(r){let t=Math.floor(r)%8+1;return[N(t,2)-.5,N(t,3)-.5]}function R(r){let t=Math.floor(r)%16;return[t%4,Math.floor(t/4)]}var k=`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`,C=`
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
uniform float uOrtho;
uniform vec2 uProj;
// Distance in front of the eye for a window depth.
float viewDepth(float d) {
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  return uNear * uFar / (uFar - (uFar - uNear) * d);
}
vec3 viewAt(vec2 uv) {
  float z = viewDepth(texture2D(tDepth, uv).x);
  vec2 ndc = uv * 2.0 - 1.0;
  return uOrtho > 0.5 ? vec3(ndc / uProj, -z) : vec3(ndc * z / uProj, -z);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`,A=`
precision highp float;
${C}
uniform vec2 uTexel;
uniform vec2 uAoSize;
uniform float uRadius;
uniform vec3 uKernel[16];
// The surface's normal from its neighbours' depths, from the nearer side of each pair so edges stay clean.
vec3 normalAt(vec2 uv, vec3 p) {
  vec3 r = viewAt(uv + vec2(uTexel.x, 0.0)) - p;
  vec3 l = p - viewAt(uv - vec2(uTexel.x, 0.0));
  vec3 u = viewAt(uv + vec2(0.0, uTexel.y)) - p;
  vec3 d = p - viewAt(uv - vec2(0.0, uTexel.y));
  return normalize(cross(abs(r.z) < abs(l.z) ? r : l, abs(u.z) < abs(d.z) ? u : d));
}
void main() {
  vec2 uv = gl_FragCoord.xy / uAoSize;
  if (texture2D(tDepth, uv).x >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 p = viewAt(uv);
  vec3 n = normalAt(uv, p);
  float a = ign(gl_FragCoord.xy) * 6.2831853;
  vec3 spin = vec3(cos(a), sin(a), 0.0);
  vec3 t = normalize(spin - n * dot(spin, n));
  mat3 tbn = mat3(t, cross(n, t), n);
  float occluded = 0.0;
  for (int i = 0; i < 16; i++) {
    vec3 s = p + tbn * uKernel[i] * uRadius;
    vec2 ndc = uOrtho > 0.5 ? s.xy * uProj : s.xy * uProj / -s.z;
    vec2 at = ndc * 0.5 + 0.5;
    if (at.x < 0.0 || at.y < 0.0 || at.x > 1.0 || at.y > 1.0) continue;
    float surface = -viewDepth(texture2D(tDepth, at).x);
    float near = smoothstep(0.0, 1.0, uRadius / max(abs(p.z - surface), 1e-4));
    occluded += step(s.z + 0.03 * uRadius, surface) * near;
  }
  // (Squared: the open share of the hemisphere, as the eye reads contact shade.)
  float open = 1.0 - occluded / 16.0;
  gl_FragColor = vec4(vec3(open * open), 1.0);
}
`,U=`
// AgX (Troy Sobotka's, in Benjamin Wrensch's fit), back to linear display light.
vec3 agx(vec3 c) {
  const mat3 into = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051, 0.0784335999999992, 0.878468636469772, 0.0784336, 0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 back = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438, -0.0980208811401368, 1.15190312990417, -0.0980434501171241, -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  vec3 x = clamp(log2(max(into * c, vec3(1e-10))), -12.47393, 4.026069);
  x = (x + 12.47393) / 16.499999;
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  x = 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  return pow(max(back * x, vec3(0.0)), vec3(2.2));
}
// Khronos PBR Neutral.
vec3 neutral(vec3 c) {
  float x = min(c.r, min(c.g, c.b));
  c -= x < 0.08 ? x - 6.25 * x * x : 0.04;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < 0.76) return c;
  float top = 1.0 - 0.0576 / (peak - 0.52);
  c *= top / peak;
  return mix(c, vec3(top), 1.0 - 1.0 / (0.15 * (peak - top) + 1.0));
}
// ACES, Narkowicz's fit.
vec3 aces(vec3 c) {
  c *= 0.6;
  return clamp(c * (2.51 * c + 0.03) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
}
vec3 srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`,F=`
precision highp float;
${C}
uniform sampler2D tColor;
uniform sampler2D tAo;
uniform vec2 uSize;
uniform vec2 uAoSize;
uniform float uAo;
uniform float uExposure;
uniform vec3 uHaze;
uniform float uHazeDensity;
uniform float uHazeStart;
uniform float uHazeGlow;
uniform vec3 uSunDir;
uniform vec3 uSunColour;
uniform float uView;
// The half-size AO, blurred over 4x4 of its texels among those at the same depth, so its noise is gone and
// nothing bleeds across a silhouette.
float aoAt(vec2 uv, float z) {
  float sum = 0.0;
  float weight = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      vec2 at = uv + (vec2(float(x), float(y)) - 1.5) / uAoSize;
      float w = exp(-abs(viewDepth(texture2D(tDepth, at).x) - z) / (0.05 * z + 0.02));
      sum += texture2D(tAo, at).r * w;
      weight += w;
    }
  }
  return weight > 0.0 ? sum / weight : 1.0;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 c = texture2D(tColor, uv).rgb;
  bool sky = texture2D(tDepth, uv).x >= 0.99999;
  vec3 p = viewAt(uv);
  float occlusion = sky ? 1.0 : aoAt(uv, -p.z);
  if (uView > 0.5) { gl_FragColor = vec4(vec3(occlusion), 1.0); return; }
  c *= mix(1.0, occlusion, uAo);
  // Aerial haze: the air between the eye and the point, lit brighter toward the sun (Henyey-Greenstein, g 0.6,
  // 4pi-normalized: 10 toward the sun).
  float dist = sky ? 1e5 : length(p);
  float through = exp(-max(dist - uHazeStart, 0.0) * uHazeDensity);
  float mu = dot(normalize(p), uSunDir);
  float lobe = 0.64 / pow(1.36 - 1.2 * mu, 1.5);
  vec3 air = uHaze * (1.0 + uSunColour * uHazeGlow * lobe * 0.15);
  c = mix(air, c, uHazeDensity > 0.0 ? through : 1.0);
  gl_FragColor = vec4(c * uExposure, 1.0);
}
`,_=`
precision highp float;
${C}
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform vec2 uSize;
uniform mat4 uInvView;
uniform mat4 uPrevViewProj;
uniform float uBlend;
uniform float uReset;
// Weighted by 1/(1+luma), so one bright pixel does not ring over its neighbours.
vec3 tame(vec3 c) { return c / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
vec3 untame(vec3 c) { return c / max(1.0 - dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4); }
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 current = tame(texture2D(tCurrent, uv).rgb);
  vec3 low = current;
  vec3 high = current;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec3 n = tame(texture2D(tCurrent, uv + vec2(float(x), float(y)) / uSize).rgb);
      low = min(low, n);
      high = max(high, n);
    }
  }
  vec4 before = uPrevViewProj * (uInvView * vec4(viewAt(uv), 1.0));
  vec2 then = before.xy / before.w * 0.5 + 0.5;
  bool lost = uReset > 0.5 || then.x < 0.0 || then.y < 0.0 || then.x > 1.0 || then.y > 1.0;
  vec3 history = clamp(tame(texture2D(tHistory, then).rgb), low, high);
  gl_FragColor = vec4(untame(lost ? current : mix(history, current, uBlend)), 1.0);
}
`,M=`
precision highp float;
uniform sampler2D tResolved;
uniform vec2 uBloomSize;
uniform vec2 uSize;
uniform float uThreshold;
void main() {
  vec2 uv = gl_FragCoord.xy / uBloomSize;
  vec2 t = 1.0 / uSize;
  vec3 c = 0.25 * (texture2D(tResolved, uv + vec2(-t.x, -t.y)).rgb + texture2D(tResolved, uv + vec2(t.x, -t.y)).rgb
    + texture2D(tResolved, uv + vec2(-t.x, t.y)).rgb + texture2D(tResolved, uv + vec2(t.x, t.y)).rgb);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c * max(l - uThreshold, 0.0) / max(l, 1e-4), 1.0);
}
`,H=`
precision highp float;
uniform sampler2D tBlur;
uniform vec2 uBloomSize;
uniform vec2 uDir;
void main() {
  vec2 uv = gl_FragCoord.xy / uBloomSize;
  vec2 d = uDir / uBloomSize;
  vec3 c = texture2D(tBlur, uv).rgb * 0.2270270270;
  c += (texture2D(tBlur, uv + d * 1.3846153846).rgb + texture2D(tBlur, uv - d * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tBlur, uv + d * 3.2307692308).rgb + texture2D(tBlur, uv - d * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`,B=`
precision highp float;
${U}
uniform sampler2D tResolved;
uniform sampler2D tBloom;
uniform vec2 uSize;
uniform float uBloom;
uniform float uTone;
uniform float uSaturation;
uniform float uContrast;
uniform float uWarmth;
uniform float uVignette;
uniform float uView;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 c = texture2D(tResolved, uv).rgb;
  if (uView > 0.5) { gl_FragColor = vec4(srgb(clamp(c, 0.0, 1.0)), 1.0); return; }
  c += texture2D(tBloom, uv).rgb * uBloom;
  vec3 m = uTone < 0.5 ? agx(c) : (uTone < 1.5 ? neutral(c) : aces(c));
  float l = dot(m, vec3(0.2126, 0.7152, 0.0722));
  m = max(mix(vec3(l), m, uSaturation), 0.0);
  m = mix(m, m * vec3(0.92, 0.98, 1.1), uWarmth * (1.0 - clamp(l * 2.0, 0.0, 1.0)));
  m = mix(m, m * vec3(1.08, 1.0, 0.88), uWarmth * clamp(l * 1.5 - 0.3, 0.0, 1.0));
  vec3 s = srgb(clamp(m, 0.0, 1.0));
  s = clamp((s - 0.5) * uContrast + 0.5, 0.0, 1.0);
  vec2 q = uv - 0.5;
  s *= 1.0 - uVignette * dot(q, q) * 1.6;
  gl_FragColor = vec4(s + (ign(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
}
`;var I=`varying vec3 vFinishWorld;
`,W=`#include <project_vertex>
#ifdef USE_INSTANCING
  vFinishWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vFinishWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,q=`varying vec3 vFinishWorld;
uniform float uFinishTranslucency;
uniform float uFinishVariation;
uniform float uFinishMute;
float finishHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float finishNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(finishHash(i), finishHash(i + vec3(1, 0, 0)), f.x), mix(finishHash(i + vec3(0, 1, 0)), finishHash(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(finishHash(i + vec3(0, 0, 1)), finishHash(i + vec3(1, 0, 1)), f.x), mix(finishHash(i + vec3(0, 1, 1)), finishHash(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}
`,K=`#include <color_fragment>
  {
    vec3 finishC = diffuseColor.rgb;
    finishC = mix(finishC, vec3(dot(finishC, vec3(0.2126, 0.7152, 0.0722))), uFinishMute);
    float finishBig = finishNoise(vFinishWorld * 0.12);
    finishC *= mix(1.0, 0.72 + 0.56 * finishNoise(vFinishWorld * 1.3 + 7.3), uFinishVariation);
    finishC = mix(finishC, finishC * vec3(1.14, 1.06, 0.74), uFinishVariation * smoothstep(0.5, 0.85, finishBig));
    finishC = mix(finishC, finishC * vec3(0.84, 0.96, 1.06), uFinishVariation * smoothstep(0.5, 0.15, finishBig));
    diffuseColor.rgb = finishC;
  }`,X=`#if NUM_DIR_LIGHTS > 0
  {
    vec3 finishL = directionalLights[0].direction;
    vec3 finishSun = directionalLights[0].color;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      DirectionalLightShadow finishShadow = directionalLightShadows[0];
      finishSun *= receiveShadow ? getShadow(directionalShadowMap[0], finishShadow.shadowMapSize, finishShadow.shadowIntensity, finishShadow.shadowBias, finishShadow.shadowRadius, vDirectionalShadowCoord[0]) : 1.0;
    #endif
    float finishBack = pow(max(dot(-normalize(vViewPosition), finishL), 0.0), 4.0);
    float finishWrap = max(dot(-normal, finishL), 0.0);
    outgoingLight += diffuseColor.rgb * vec3(1.05, 1.1, 0.6) * finishSun * uFinishTranslucency * (0.35 * finishWrap + finishBack) * 0.5;
  }
#endif
#include <opaque_fragment>`;function $(r){return r.side==="both"||r.side===2||(r.alphaTest??0)>0}function J(r,t,e){let n=r.vertexShader,o=r.fragmentShader;if(!n.includes("#include <project_vertex>")||!o.includes("#include <color_fragment>"))return;Object.assign(r.uniforms,t),r.vertexShader=I+n.replace("#include <project_vertex>",W);let i=q+o.replace("#include <color_fragment>",K);e&&i.includes("#include <lights_fragment_begin>")&&(i=i.replace("#include <opaque_fragment>",X)),r.fragmentShader=i}function E(r,t){if(r.userData.litFinishDressed===!0)return;let e=r.onCompile,n=r.customProgramCacheKey,o=$(r);r.onCompile=(a,u)=>{e?.call(r,a,u),J(a,t,o)};let i=n?n.call(r):String(e??"");r.customProgramCacheKey=()=>`${i}|lit-finish${o?"-leaf":""}`,r.userData.litFinishDressed=!0,r.needsUpdate=!0}function b(r,t){r.traverse(e=>{if(e.isMesh!==!0||e.material===void 0)return;let n=Array.isArray(e.material)?e.material:[e.material];for(let o of n)E(o,t)})}var Q={ao:A,light:F,taa:_,bright:M,blur:H,grade:B};function Y(r,t,e,n){let o=new r.CustomMaterial({uniforms:e,vertexShader:k,fragmentShader:n,depthTest:!1,depthWrite:!1}),i=new r.Mesh(t,o);i.frustumCulled=!1;let a=new r.Stage;return a.add(i),{scene:a,material:o}}function Z(){let r=(o=1,i=1)=>({value:[o,i]}),t=(o,i,a)=>({value:[o,i,a]}),e=o=>({value:o}),n=()=>({value:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});return{tColor:e(0),tDepth:e(0),tAo:e(0),tCurrent:e(0),tHistory:e(0),tResolved:e(0),tBloom:e(0),tBlur:e(0),uNear:e(.1),uFar:e(100),uOrtho:e(0),uProj:r(),uSize:r(),uAoSize:r(),uBloomSize:r(),uTexel:r(),uRadius:e(.6),uKernel:{value:w()},uAo:e(.8),uExposure:e(1),uTone:e(0),uHaze:t(.6,.7,.85),uHazeDensity:e(0),uHazeStart:e(0),uHazeGlow:e(0),uSunDir:t(0,0,-1),uSunColour:t(1,.95,.85),uInvView:n(),uPrevViewProj:n(),uBlend:e(1),uReset:e(1),uThreshold:e(1),uBloom:e(0),uDir:r(1,0),uSaturation:e(1),uContrast:e(1),uWarmth:e(0),uVignette:e(0),uView:e(0)}}function s(r,t,e){let n=r[t];n!==void 0&&(n.value=e)}function G(r,t,e,n){let o=[["uAo",e.ao],["uRadius",e.aoRadius],["uExposure",e.exposure],["uTone",g.indexOf(e.tonemap)],["uHazeDensity",n.density??e.hazeDensity],["uHazeStart",n.start??e.hazeStart],["uHazeGlow",e.hazeGlow],["uSaturation",e.saturation],["uContrast",e.contrast],["uWarmth",e.warmth],["uVignette",e.vignette],["uBloom",e.bloom],["uThreshold",e.bloomThreshold],["uBlend",e.taa?e.taaBlend:1]];for(let[i,a]of o)s(r,i,a);s(t,"uFinishTranslucency",e.translucency),s(t,"uFinishVariation",e.variation),s(t,"uFinishMute",e.mute)}function ee(r){let t={minFilter:"linear",magFilter:"linear",generateMipmaps:!1},e={...t,type:"half",depthBuffer:!1},n=new r.DepthTexture(1,1),o=i=>new r.RenderTarget(1,1,i);return{world:o({...t,type:"half",samples:4,depthBuffer:!0,depthTexture:n}),ao:o({...t,depthBuffer:!1}),hdr:o(e),history:[o(e),o(e)],bloom:[o(e),o(e)]}}function re(r,t,e,n){let o=[Math.max(1,Math.ceil(e/2)),Math.max(1,Math.ceil(n/2))],i=[Math.max(1,Math.ceil(e/4)),Math.max(1,Math.ceil(n/4))];r.world.setSize(e,n),r.ao.setSize(o[0],o[1]);for(let a of[r.hdr,...r.history])a.setSize(e,n);for(let a of r.bloom)a.setSize(i[0],i[1]);s(t,"uSize",[e,n]),s(t,"uAoSize",[o[0],o[1]]),s(t,"uBloomSize",[i[0],i[1]]),s(t,"uTexel",[1/e,1/n]),s(t,"uReset",1)}function te(r,t,e,n){let o=e.projectionMatrix.elements,[i,a]=e.isOrthographicCamera===!0?[12,13]:[8,9],u=[o[i]??0,o[a]??0];n&&(o[i]=u[0]+n[0],o[a]=u[1]+n[1]),r.render(t,e),o[i]=u[0],o[a]=u[1]}function oe(r,t,e){let n=t.projectionMatrix.elements;return s(r,"uNear",t.near),s(r,"uFar",t.far),s(r,"uOrtho",t.isOrthographicCamera===!0?1:0),s(r,"uProj",[n[0]??1,n[5]??1]),s(r,"uSunDir",z(e,t.matrixWorldInverse.elements)),s(r,"uInvView",Array.from(t.matrixWorld.elements)),D(n,t.matrixWorldInverse.elements)}function h(r,t,e){r.renderer.setRenderTarget(e),r.renderer.render(r.passes[t].scene,r.quad)}function ne(r){let{targets:t,uniforms:e}=r;h(r,"bright",t.bloom[0]),s(e,"tBlur",t.bloom[0].texture),s(e,"uDir",[1,0]),h(r,"blur",t.bloom[1]),s(e,"tBlur",t.bloom[1].texture),s(e,"uDir",[0,1]),h(r,"blur",t.bloom[0])}function ie(r,t,e,n){let{targets:o,uniforms:i}=r;h(r,"ao",o.ao),h(r,"light",o.hdr);let a=o.hdr;if(e.taa){let u=o.history[t.flip];s(i,"tCurrent",o.hdr.texture),s(i,"tHistory",o.history[t.flip===0?1:0].texture),h(r,"taa",u),s(i,"uReset",0),a=u}else s(i,"uReset",1);s(i,"tResolved",a.texture),e.bloom>0&&ne(r),s(i,"tBloom",o.bloom[0].texture),h(r,"grade",n)}function ae(r){let t=r.targets;t.world.depthTexture?.dispose();for(let e of[t.world,t.ao,t.hdr,...t.history,...t.bloom])e.dispose();for(let e of Object.values(r.passes))e.material.dispose();r.geometry.dispose()}function se(r,t,e){let n=ee(r);s(e,"tColor",n.world.texture),s(e,"tDepth",n.world.depthTexture),s(e,"tAo",n.ao.texture);let o=r.plane(2,2),i=Object.fromEntries(Object.entries(Q).map(([a,u])=>[a,Y(r,o,e,u)]));return{renderer:t,passes:i,targets:n,uniforms:e,quad:new r.OrthoCamera(-1,1,1,-1,0,1),geometry:o}}function ue(r,t,e,n){let{renderer:o,uniforms:i}=r,a=o.getRenderTarget(),[u,f]=T(t.index);o.setRenderTarget(r.targets.world);let m=n.taa?[2*u/t.size[0],2*f/t.size[1]]:null;te(o,e.scene,e.camera,m);let l=oe(i,e.camera,e.sun);s(i,"uPrevViewProj",t.previous??l),ie(r,t,n,a),t.previous=l,t.flip=t.flip===0?1:0,t.index+=1}function le(r,t,e){let n=x(e),o={},i=[.4,.8,.3],a=Z(),u={uFinishTranslucency:{value:0},uFinishVariation:{value:0},uFinishMute:{value:0}},f=se(r,t,a),m={index:0,flip:0,previous:null,size:[1,1]};return G(a,u,n,o),{get settings(){return n},setSettings(l){return n=x(l),G(a,u,n,o),n},setSize(l,p,d){let v=V=>Math.max(1,Math.round(V*d));m.size=[v(l),v(p)],re(f.targets,a,m.size[0],m.size[1])},setSun(l,p){i=l;let d=y(p,[1,.95,.85]),v=Math.max(d[0],d[1],d[2],1e-6);s(a,"uSunColour",[d[0]/v,d[1]/v,d[2]/v])},setHaze(l){o=l,l.colour!==void 0&&s(a,"uHaze",y(l.colour,[.6,.7,.85])),G(a,u,n,o)},dress(l){b(l,u)},ditherOffset(){return n.taa?R(m.index):[0,0]},render(l,p){m.index%30===0&&b(l,u),ue(f,m,{scene:l,camera:p,sun:i},n)},setView(l){s(a,"uView",l==="ao"?1:0)},dispose(){ae(f)}}}export{A as AO_GLSL,P as AO_SAMPLES,H as BLUR_GLSL,M as BRIGHT_GLSL,L as DEFAULT_FINISH_SETTINGS,B as GRADE_GLSL,F as LIGHT_GLSL,_ as TAA_GLSL,g as TONEMAPS,k as VERTEX_GLSL,w as aoKernel,le as createLitFinish,z as directionInView,R as ditherShiftAt,E as dressMaterial,b as dressTree,x as finishSettings,T as jitterAt,y as linearColour,D as multiply4};
