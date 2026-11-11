// voxel-dither@0.1.0 from keel-modules d76f6b1 (MIT). Generated: don't edit.
var w=["none","bayer2","bayer4","bayer8","halftone","lines","diagonal","hatch","ign","stipple","checker"],se=["#000000","#1d2b53","#7e2553","#008751","#ab5236","#5f574f","#c2c3c7","#fff1e8","#ff004d","#ffa300","#ffec27","#00e436","#29adff","#83769c","#ff77a8","#ffccaa"],ce=["#000000","#222034","#45283c","#663931","#8f563b","#df7126","#d9a066","#eec39a","#fbf236","#99e550","#6abe30","#37946e","#4b692f","#524b24","#323c39","#3f3f74","#306082","#5b6ee1","#639bff","#5fcde4","#cbdbfc","#ffffff","#9badb7","#847e87","#696a6a","#595652","#76428a","#ac3232","#d95763","#d77bba","#8f974a","#8a6f30"],ue=["#f3ead6","#1e1c2a","#2f8fc4","#e2477d","#f4c542","#d9503f","#3c9a63","#3e4597","#f4a8c6","#a8cde4"],de=["#1b1726","#3a2d45","#5c4363","#8a5a78","#c77d97","#f0a8bd","#ffd9e2","#fff6ef","#2e4a3c","#4f7a52","#8fb36a","#d6e59a","#6b4a3a","#a0705a","#7fa7c9","#cfe3ef"],B={pixel:{label:"3D pixel art",screen:"bayer4",pixel:4,levels:5,snap:.45,lift:.07,clump:.6,ramp:.6,color:"luma",shading:"cel",bands:3,outline:1,crease:.3,contrast:1.25,saturation:1.45},smart:{label:"Smart voxel",screen:"auto",pixel:0,levels:6,lift:.03,clump:.5,ramp:.35,color:"luma",shading:"cel",bands:4,outline:.9,crease:.35,contrast:1.05,saturation:1.1},bayer:{label:"Bayer 32",screen:"bayer4",pixel:4,palette:ce,lift:.04,shading:"cel",bands:3,outline:.85,crease:.25,contrast:1.1,saturation:1.25},soft:{label:"Soft ordered",screen:"bayer8",pixel:3,levels:5,lift:.12,clump:.4,ramp:.3,color:"luma",shading:"smooth",outline:.5,crease:.2,contrast:.92,saturation:.95},halftone:{label:"Riso print",screen:"halftone",pixel:2,palette:ue,shading:"smooth",outline:.7,outlineColor:"#3e4597",crease:0,contrast:1.15,saturation:1.3},engraving:{label:"Engraving",screen:"hatch",pixel:2,levels:3,color:"luma",shading:"smooth",outline:1,outlineColor:"#1d1a24",crease:.3,saturation:.55,rays:1.3},chunky:{label:"Chunky 8-bit",screen:"bayer2",pixel:6,palette:se,amount:.4,skySaturation:2,clump:.85,shading:"cel",bands:3,outline:1,crease:.4,contrast:1.15,saturation:1.3},grain:{label:"Film grain",screen:"ign",pixel:2,levels:6,lift:.14,ramp:1,color:"luma",shading:"smooth",outline:.4,crease:.1,contrast:1.2,saturation:.8},blossom:{label:"Blossom 16",screen:"bayer4",pixel:3,palette:de,shading:"cel",bands:4,outline:.9,crease:.3},pocket:{label:"Pocket green",screen:"bayer4",pixel:4,palette:["#0f2a1d","#2f5a35","#7a9a4a","#cddc8a"],accent:["#e8a6b8","#a85a76"],shading:"cel",bands:3,outline:0,crease:0,saturation:1,rays:.6},clean:{label:"Clean cel",screen:"none",pixel:3,levels:5,clump:1,lift:.05,color:"luma",shading:"cel",bands:3,outline:1,outlineColor:"#241a2e",crease:.5,contrast:1.15,saturation:1.35},crt:{label:"CRT painted",screen:"bayer8",pixel:2,levels:7,snap:.75,color:"luma",shading:"smooth",outline:1,outlineColor:"#0b0d22",crease:.15,contrast:1.3,saturation:1.55,scanlines:.55,chroma:.5}},K=Object.keys(B),k={style:"smart",screen:"auto",pixel:0,detail:0,levels:6,color:"luma",palette:[],accent:[],skySaturation:1,amount:1,snap:0,lift:0,clump:0,ramp:0,shading:"cel",bands:4,outline:.9,outlineColor:null,crease:.35,contrast:1.05,saturation:1.1,depthBands:[18,30],rays:1,skyDistance:0,scanlines:0,chroma:0,glitch:0},D=/^#[0-9a-f]{6}$/iu;function c(e,t,a,r){return typeof e=="number"&&Number.isFinite(e)?Math.min(a,Math.max(t,e)):r}function L(e,t,a){return typeof e=="string"&&t.includes(e)?e:a}function fe(e,t){return e===null?null:typeof e=="string"&&D.test(e)?e.toLowerCase():t}function X(e,t){return Array.isArray(e)?e.filter(a=>typeof a=="string"&&D.test(a)).slice(0,32).map(a=>a.toLowerCase()):t}function E(e,t){if(!Array.isArray(e)||e.length!==2)return t;let a=c(e[0],.1,1e3,t[0]);return[a,c(e[1],a,1e3,Math.max(a,t[1]))]}function me(e){let t=Object.fromEntries(Object.entries(B[e]).filter(([a])=>a!=="label"));return{...k,...t,style:e}}function he(e,t){return{levels:Math.round(c(e.levels,2,16,t.levels)),color:L(e.color,["rgb","luma"],t.color),palette:X(e.palette,t.palette),accent:X(e.accent,t.accent).slice(0,4),skySaturation:c(e.skySaturation,0,3,t.skySaturation),amount:c(e.amount,0,1,t.amount),snap:c(e.snap,0,.9,t.snap),lift:c(e.lift,0,.3,t.lift),clump:c(e.clump,0,1,t.clump),ramp:c(e.ramp,0,1,t.ramp),contrast:c(e.contrast,.5,2,t.contrast),saturation:c(e.saturation,0,2,t.saturation)}}function pe(e,t){return{scanlines:c(e.scanlines,0,1,t.scanlines),chroma:c(e.chroma,0,1,t.chroma),glitch:c(e.glitch,0,1,t.glitch)}}function ge(e,t){return{screen:L(e.screen,["auto",...w],t.screen),pixel:Math.round(c(e.pixel,0,12,t.pixel)*2)/2,detail:Math.round(c(e.detail,0,12,t.detail)*2)/2,shading:L(e.shading,["cel","smooth"],t.shading),bands:Math.round(c(e.bands,2,8,t.bands)),outline:c(e.outline,0,1,t.outline),outlineColor:fe(e.outlineColor,t.outlineColor),crease:c(e.crease,0,1,t.crease),depthBands:E(e.depthBands,t.depthBands),rays:c(e.rays,0,2,t.rays),skyDistance:c(e.skyDistance,0,1e5,t.skyDistance)}}function T(e){if(e===null||typeof e!="object")return k;let t=e,a=me(L(t.style,K,k.style)),r={...a,...he(t,a),...ge(t,a),...pe(t,a)};return ye(r,t.limit)}function ye(e,t){if(t===null||typeof t!="object")return e;let a=Math.round(c(t.levels,0,16,0)),r=Math.round(c(t.colours,0,1<<24,0));return{...e,levels:a>=2?Math.min(e.levels,a):e.levels,palette:r>=2?e.palette.slice(0,r):e.palette}}var be=4;function ve(e,t,a){if(t<=0)return 1;let r=Math.max(1,Math.round(t*a)),o=1;for(let n=2;n<=be;n+=1)e%n===0&&e/n>=r&&(o=n);return o}function W(e,t){let a=Math.max(1,Math.min(e,t));return Math.min(6,Math.max(2,Math.round(a/210)))}function I(e,t,a,r){let o=c(a,.5,4,1),n=r.pixel===0?W(e,t):r.pixel,l=Math.max(1,Math.round(n*o)),i=Math.max(1,Math.floor(e*o)),s=Math.max(1,Math.floor(t*o)),m=Math.ceil(i/l),h=Math.ceil(s/l);return{width:m,height:h,pixel:l,originX:Math.floor((i-m*l)/2),originY:Math.floor((s-h*l)/2),detail:ve(l,r.detail,o)}}function z(e,t){let a=e.amount;if(e.screen!=="auto"){let r=e.screen;return{near:{screen:r,scale:1,amount:a},mid:{screen:r,scale:1,amount:a*.85},far:{screen:r,scale:1,amount:a*.6}}}return t<128?{near:{screen:"bayer2",scale:1,amount:a},mid:{screen:"bayer2",scale:1,amount:a*.8},far:{screen:"checker",scale:1,amount:a*.5}}:t<260?{near:{screen:"bayer4",scale:1,amount:a},mid:{screen:"bayer8",scale:1,amount:a*.8},far:{screen:"bayer8",scale:1,amount:a*.5}}:{near:{screen:"bayer8",scale:1,amount:a},mid:{screen:"bayer8",scale:1,amount:a*.8},far:{screen:"ign",scale:1,amount:a*.45}}}var v=e=>e-Math.floor(e),R=(e,t)=>Math.abs(v(e/t)*2-1);function A(e,t){let a=Math.floor(e),r=Math.floor(t);return v(a*.5+r*r*.75)}var x=(e,t)=>A(e*.5,t*.5)*.25+A(e,t),xe=(e,t)=>x(e*.5,t*.5)*.25+A(e,t);function Se(e,t){let a=v((e+t+1)*.1767767)-.5,r=v((e-t)*.1767767)-.5;return Math.min(.999,Math.hypot(a,r)*1.41421356)}function ke(e,t){let a=Math.imul(Math.floor(e)>>>0,1973)+Math.imul(Math.floor(t)>>>0,9277)|1;return a^=a>>>16,a=Math.imul(a,2146121005),a^=a>>>15,a=Math.imul(a,2221713035),a^=a>>>16,(a&65535)/65536}var Le={none:()=>.5,bayer2:A,bayer4:x,bayer8:xe,halftone:Se,lines:(e,t)=>R(t+.5,4)*.7+x(e,t)*.3,diagonal:(e,t)=>R(e+t+.5,4)*.7+x(e,t)*.3,hatch:(e,t)=>Math.min(R(e+t+.5,4),.5+.5*R(e-t+.5,4))*.75+x(e,t)*.25,ign:(e,t)=>v(52.9829189*v(.06711056*Math.floor(e)+.00583715*Math.floor(t))),stipple:ke,checker:(e,t)=>(Math.floor(e)+Math.floor(t)&1)*.5+.25};function we(e,t,a){return Le[e](t,a)}function De(e,t,a=1,r=0){let{levels:o,threshold:n}=t,l=Math.max(1,o-1),i=.5+(n-.5)*Math.min(1,Math.max(0,a)),s=Math.min(1,Math.max(0,e))*l,m=Math.floor(s),h=Math.min(1,Math.max(0,(s-m-.5)/Math.max(1-Math.min(.9,Math.max(0,r)),.001)+.5));return Math.min(l,Math.max(0,m+(h>=1-i?1:0)))/l}function _(e){let t=Math.round(c(e,2,8,4)),a=new Uint8Array(t);for(let r=0;r<t;r+=1)a[r]=Math.round(255*(.3+.7*(r/(t-1))**1.2));return a}function M(e){let t=Number.parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]}function $(e){let[t,a,r]=e.map(i=>i<=.04045?i/12.92:((i+.055)/1.055)**2.4),o=Math.cbrt(.4122*t+.5363*a+.0514*r),n=Math.cbrt(.2119*t+.6807*a+.1074*r),l=Math.cbrt(.0883*t+.2817*a+.63*r);return[.2105*o+.7936*n-.0041*l,1.978*o-2.4286*n+.4506*l,.0259*o+.7828*n-.8087*l]}function F(e){let t=new Float32Array(96),a=new Float32Array(96),r=e.slice(0,32);return r.forEach((o,n)=>{let l=M(o);t.set(l,n*3),a.set($(l),n*3)}),{data:t,lab:a,size:r.length}}var Te=`
float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float tri(float v, float p) { return abs(fract(v / p) * 2.0 - 1.0); }
float halftone(vec2 a) {
  vec2 f = fract(vec2(a.x + a.y + 1.0, a.x - a.y) * 0.1767767) - 0.5;
  return min(0.999, length(f) * 1.41421356);
}
float stipple(vec2 a) {
  uint h = (uint(a.x) * 1973u + uint(a.y) * 9277u) | 1u;
  h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
  return float(h & 0xffffu) / 65536.0;
}
float screenAt(float id, vec2 a) {
  int s = int(id + 0.5);
  if (s == 1) return bayer2(a);
  if (s == 2) return bayer4(a);
  if (s == 3) return bayer8(a);
  if (s == 4) return halftone(a);
  if (s == 5) return tri(a.y + 0.5, 4.0) * 0.7 + bayer4(a) * 0.3;
  if (s == 6) return tri(a.x + a.y + 0.5, 4.0) * 0.7 + bayer4(a) * 0.3;
  if (s == 7) return min(tri(a.x + a.y + 0.5, 4.0), 0.5 + 0.5 * tri(a.x - a.y + 0.5, 4.0)) * 0.75 + bayer4(a) * 0.25;
  if (s == 8) return fract(52.9829189 * fract(0.06711056 * a.x + 0.00583715 * a.y));
  if (s == 9) return stipple(a);
  if (s == 10) return mod(a.x + a.y, 2.0) * 0.5 + 0.25;
  return 0.5;
}
`,U=`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`,N=`
precision highp float;
precision highp int;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uGrid;
// The detail parts' own colour and depth, uFine texels to an art pixel's side,
// and (on the detail pass) the world's finished look to fill in around them.
uniform sampler2D tDetail;
uniform sampler2D tDetailDepth;
uniform sampler2D tCoarse;
uniform float uFine;
uniform float uPass;
uniform float uNear;
uniform float uFar;
uniform float uOrtho;
uniform vec3 uScreen;
uniform vec3 uScale;
uniform vec3 uAmount;
uniform vec2 uBands;
uniform float uLevels;
uniform float uSnap;
uniform float uLift;
uniform float uClump;
uniform float uRamp;
uniform float uLuma;
uniform int uPaletteSize;
uniform int uAccentSize;
uniform vec3 uAccent[4];
uniform vec3 uAccentLab[4];
uniform float uSkySaturation;
uniform vec3 uPalette[32];
uniform vec3 uPaletteLab[32];
uniform float uOutline;
uniform vec4 uOutlineColor;
uniform float uCrease;
uniform float uContrast;
uniform float uSaturation;
uniform float uSkyFrom;
uniform vec2 uRaySource;
uniform vec3 uRayColor;
uniform float uRayStrength;
uniform float uRayDecay;
uniform float uRayDensity;
uniform float uScanlines;
uniform float uChroma;
uniform float uGlitch;
uniform float uTime;
// Per-part signals: x scanlines, y chroma, z glitch, for the parts tagged 1, 2 and 3.
uniform vec3 uSignal[3];
// Per-part filters: x the filter's number in SIGNAL_FILTERS, y its amount.
uniform vec2 uFilter[3];
${Te}
// The pass's cells: art pixels (gF 1), or detail pixels (gF uFine) on the detail pass.
vec2 gGrid;
float gF;
vec2 worldUv(vec2 cell) { return (floor(clamp(cell, vec2(0.0), gGrid - 1.0) / gF) + 0.5) / uGrid; }
vec2 detailUv(vec2 cell) { return (clamp(cell, vec2(0.0), gGrid - 1.0) + 0.5) / gGrid; }
// The world is drawn once per art pixel and the detail parts per detail pixel; a cell shows the nearer.
bool onDetail(vec2 cell) { return gF > 1.5 && texture2D(tDetailDepth, detailUv(cell)).x < texture2D(tDepth, worldUv(cell)).x; }
vec4 colorAt(vec2 cell) { return onDetail(cell) ? texture2D(tDetail, detailUv(cell)) : texture2D(tColor, worldUv(cell)); }
float distanceAt(vec2 cell) {
  float d = texture2D(tDepth, worldUv(cell)).x;
  if (gF > 1.5) d = min(d, texture2D(tDetailDepth, detailUv(cell)).x);
  if (d >= 0.99999) return uFar;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  return (uNear * uFar) / (uFar - d * (uFar - uNear));
}
// God rays: walk from the pixel toward the light, gathering the open sky the
// walk crosses. Trees and terrain block it, so shafts fall between them. The
// result is added in continuous light and only then stepped, so the shafts
// come out as dithered bands.
vec3 godRays(vec2 cell) {
  if (uRayStrength <= 0.001) return vec3(0.0);
  vec2 uv = (cell + 0.5) / gGrid;
  vec2 step = (uv - uRaySource) * uRayDensity / 40.0;
  vec2 aspect = vec2(gGrid.x / gGrid.y, 1.0);
  vec2 p = uv;
  float weight = 1.0;
  float sum = 0.0;
  for (int i = 0; i < 40; i++) {
    p -= step;
    float open = distanceAt(floor(clamp(p, 0.0, 0.9999) * gGrid)) >= uSkyFrom ? 1.0 : 0.0;
    float near = 0.3 + 0.7 * exp(-3.5 * length((p - uRaySource) * aspect));
    sum += open * near * weight;
    weight *= uRayDecay;
  }
  return uRayColor * (sum / 40.0) * uRayStrength;
}
vec3 toSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
// One step: the share past the lower tone, squeezed by uSnap so most of it
// snaps flat and only the middle of the step dithers.
float snapStep(float value, float t) {
  float base = floor(value);
  float share = clamp((value - base - 0.5) / max(1.0 - uSnap, 0.001) + 0.5, 0.0, 1.0);
  return base + step(1.0 - t, share);
}
vec3 stepTones(vec3 c, float t) {
  float steps = max(1.0, uLevels - 1.0);
  if (uLuma < 0.5) {
    // Dither between two step colours only, never off-hue confetti.
    vec3 q = floor(c * steps + 0.5);
    vec3 e = c * steps - q;
    vec3 a = abs(e);
    vec3 lean = step(0.5 * max(a.x, max(a.y, a.z)) + 0.001, a);
    float share = dot(a, lean) / max(1.0, dot(lean, vec3(1.0)));
    share = clamp((share - 0.5) / max(1.0 - uSnap, 0.001) + 0.5, 0.0, 1.0);
    return clamp((q + sign(e) * lean * step(1.0 - t, share)) / steps, 0.0, 1.0);
  }
  // YCoCg: lightness gets twice the steps of colour, so shading reads as ramps.
  float y = dot(c, vec3(0.25, 0.5, 0.25));
  float co = 0.5 * (c.r - c.b);
  float cg = -0.25 * c.r + 0.5 * c.g - 0.25 * c.b;
  // Colour dithers gently; warm-cool steps finely, so a pale sky or night navy keeps its hue. Grey stays grey.
  float ys = steps * 2.0;
  float cs = steps * 2.0 + 2.0;
  float tc = 0.5 + (t - 0.5) * 0.35;
  y = snapStep(y * ys, t) / ys;
  co = snapStep(co * cs * 2.0, tc) / (cs * 2.0);
  cg = snapStep(cg * cs, tc) / cs;
  return clamp(vec3(y + co - cg, y + cg, y - co - cg), 0.0, 1.0);
}
// OKLab, so the nearest palette entry is the one that looks nearest.
vec3 okLab(vec3 c) {
  c = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  vec3 lms = pow(max(mat3(0.4122, 0.2119, 0.0883, 0.5363, 0.6807, 0.2817, 0.0514, 0.1074, 0.63) * c, 0.0), vec3(1.0 / 3.0));
  return mat3(0.2105, 1.978, 0.0259, 0.7936, -2.4286, 0.7828, -0.0041, 0.4506, -0.8087) * lms;
}
vec3 stepPalette(vec3 c, float t, bool spot, float hueWeight) {
  vec3 best = c; vec3 next = c; vec3 bl = c; vec3 nl = c;
  float bd = 1e9; float nd = 1e9;
  vec3 lab = okLab(c);
  // Spot inks: taken only by a pixel already clearly of the ink's hue, dithering between the inks alone.
  if (spot && uAccentSize > 0 && length(lab.yz) > 0.028) {
    float hue = atan(lab.z, lab.y);
    for (int i = 0; i < 4; i++) {
      if (i >= uAccentSize) break;
      vec3 al = uAccentLab[i];
      if (abs(mod(atan(al.z, al.y) - hue + 3.14159, 6.28318) - 3.14159) > 0.35) continue;
      vec3 e = (al - lab) * vec3(1.0, 1.6, 1.6);
      float d = dot(e, e);
      if (d < bd) { nd = bd; next = best; bd = d; best = uAccent[i]; }
      else if (d < nd) { nd = d; next = uAccent[i]; }
    }
    if (bd < 1e8) return t < sqrt(bd) / max(1e-5, sqrt(bd) + sqrt(nd)) && nd < 1e8 ? next : best;
  }
  for (int i = 0; i < 32; i++) {
    if (i >= uPaletteSize) break;
    // Hue outweighs lightness: a pale sky picks a pale blue, not a grey.
    vec3 e = (uPaletteLab[i] - lab) * vec3(1.0, hueWeight, hueWeight);
    float d = dot(e, e);
    if (d < bd) { nd = bd; next = best; nl = bl; bd = d; best = uPalette[i]; bl = uPaletteLab[i]; }
    else if (d < nd) { nd = d; next = uPalette[i]; nl = uPaletteLab[i]; }
  }
  // Only neighbours on a ramp dither; far-apart entries meet in a clean edge.
  float m = sqrt(bd) / max(1e-5, sqrt(bd) + sqrt(nd)) * clamp(1.6 - 3.0 * length(bl - nl), 0.0, 1.0);
  return t < m ? next : best;
}
float signalHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// The part a pixel belongs to, from the alpha its material wrote (see tagSignal):
// 0 untagged, else 1 to 3.
int partAt(vec2 cell) {
  float a = colorAt(cell).a;
  return a < 0.375 ? 1 : a < 0.625 ? 2 : a < 0.875 ? 3 : 0;
}
vec3 signalOf(int part) {
  vec3 own = part == 1 ? uSignal[0] : part == 2 ? uSignal[1] : part == 3 ? uSignal[2] : vec3(0.0);
  return max(own, vec3(uScanlines, uChroma, uGlitch));
}
// A burst lasts one eighth of a second; each part keeps its own timing, and how
// many of its slots burst grows with its glitch strength.
float burstOf(float strength, float part) {
  if (strength <= 0.0) return 0.0;
  return step(1.0 - strength * 0.16, signalHash(vec2(floor(uTime * 8.0), 1.7 + part * 13.1)));
}
// Where a bursting part reads from: bands of rows slide sideways (carrying the
// part's silhouette out over its neighbours), and one block of the part shows
// what sits above it, so sky tears into it.
vec2 tornCell(vec2 cell, float strength, float part) {
  float slot = floor(uTime * 8.0) + part * 31.0;
  float rows = floor(cell.y / (2.0 + floor(signalHash(vec2(slot, 3.1)) * 6.0)));
  if (signalHash(vec2(rows, slot)) > 1.0 - 0.5 * strength) cell.x += floor((signalHash(vec2(rows, slot + 9.0)) - 0.5) * gGrid.x * 0.12 * strength);
  return clamp(cell, vec2(0.0), gGrid - 1.0);
}
bool inTearBlock(vec2 cell, float part) {
  float slot = floor(uTime * 8.0) + part * 31.0;
  vec2 size = gGrid * vec2(0.12 + 0.2 * signalHash(vec2(slot, 5.0)), 0.02 + 0.035 * signalHash(vec2(slot, 6.0)));
  vec2 origin = vec2(signalHash(vec2(slot, 7.0)), signalHash(vec2(slot, 8.0))) * gGrid;
  return all(greaterThan(cell, origin)) && all(lessThan(cell, origin + size));
}
vec2 glitchCell(vec2 cell, int part) {
  for (int k = 1; k <= 3; k++) {
    float strength = signalOf(k).z;
    if (burstOf(strength, float(k)) < 0.5) continue;
    vec2 source = tornCell(cell, strength, float(k));
    if (part == k && inTearBlock(cell, float(k))) return clamp(source + vec2(0.0, floor(gGrid.y * 0.06)), vec2(0.0), gGrid - 1.0);
    if (part == k || partAt(source) == k) return source;
  }
  return cell;
}
vec2 filterOf(int part) { return part == 1 ? uFilter[0] : part == 2 ? uFilter[1] : part == 3 ? uFilter[2] : vec2(0.0); }
bool isFilter(vec2 f, float id) { return f.y > 0.0 && abs(f.x - id) < 0.5; }
vec3 rgbAt(vec2 cell) { return toSrgb(colorAt(cell).rgb); }
float lumaOf(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 hueOf(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
// Filters that move pixels: where a filtered part reads from. Every offset is a
// whole art pixel, so a filter never smears the grid.
vec2 filterCell(vec2 cell, vec2 f, int part) {
  float a = f.y;
  // mosaic: the part is drawn in blocks of 2 to 4 art pixels
  if (isFilter(f, 3.0)) { float k = 2.0 + floor(a * 2.0); cell = floor(cell / k) * k + floor(k * 0.5); }
  // vhs: rows wobble, and a band of tracking noise rolls up the frame
  if (isFilter(f, 7.0)) {
    float band = 1.0 - smoothstep(0.0, 5.0, abs(cell.y - fract(uTime * 0.06) * gGrid.y));
    cell.x += floor(sin(cell.y * 0.37 + uTime * 2.7) * a * 1.4 + band * a * 7.0 * (signalHash(vec2(cell.y, floor(uTime * 12.0))) - 0.5));
  }
  // wave: heat haze, rows sway on a slow sine
  if (isFilter(f, 9.0)) cell.x += floor(sin(cell.y * 0.22 + uTime * 2.1) * (1.0 + 2.5 * a) + 0.5);
  // slitscan: each row shows the part at its own moment, so the part shears and unshears
  if (isFilter(f, 15.0)) cell.x += floor(sin(cell.y * 0.045 - uTime * 0.9) * gGrid.x * 0.035 * a + 0.5);
  // datamosh: blocks of the part jump and stick for half a second
  if (isFilter(f, 17.0)) {
    vec2 block = floor(cell / 6.0);
    float slot = floor(uTime * 2.0);
    if (signalHash(block + slot * 7.31) > 1.0 - 0.32 * a) cell += floor((vec2(signalHash(block + slot), signalHash(block - slot + 3.0)) - 0.5) * 14.0 * a);
  }
  // pixel sort: bright runs of the part drip down over darker pixels below them
  if (isFilter(f, 16.0)) {
    vec2 pick = cell;
    float best = 0.42;
    for (int k = 1; k <= 14; k++) {
      if (float(k) > 14.0 * a) break;
      vec2 p = clamp(cell + vec2(0.0, float(k)), vec2(0.0), gGrid - 1.0);
      if (partAt(p) != part) break;
      float l = lumaOf(rgbAt(p));
      if (l > best + 0.03) { best = l; pick = p; }
    }
    cell = pick;
  }
  return clamp(cell, vec2(0.0), gGrid - 1.0);
}
// Filters that change colour, applied before the tones are stepped, so a
// filtered part is still dithered pixel art.
vec3 filterColor(vec3 c, vec2 cell, vec2 f, float edge) {
  if (f.y <= 0.0) return c;
  float a = clamp(f.y, 0.0, 1.0);
  float l = lumaOf(c);
  float frame = floor(uTime * 12.0);
  vec3 o = c;
  // snow: static speckles
  if (isFilter(f, 1.0)) o = mix(c, vec3(signalHash(cell + frame * 1.37)), step(1.0 - 0.22 * a, signalHash(cell * 1.31 + frame)));
  // film: sepia, a little grain, and the gate's flicker
  if (isFilter(f, 2.0)) o = vec3(l * 1.07 + 0.05, l * 0.9 + 0.03, l * 0.68) * (0.93 + 0.07 * signalHash(vec2(frame, 2.0))) + (signalHash(cell + frame) - 0.5) * 0.08;
  // cga: the four-colour 1981 palette
  if (isFilter(f, 4.0)) o = l < 0.2 ? vec3(0.0) : l < 0.5 ? vec3(0.33, 1.0, 1.0) * (0.55 + l) : l < 0.78 ? vec3(1.0, 0.33, 1.0) : vec3(1.0);
  // negative
  if (isFilter(f, 5.0)) o = 1.0 - c;
  // glow: bright pixels bloom into their neighbours
  if (isFilter(f, 6.0) || isFilter(f, 13.0)) {
    vec3 sum = vec3(0.0);
    for (int k = 0; k < 8; k++) {
      float t = float(k) * 0.785398;
      vec3 s = rgbAt(cell + floor(vec2(cos(t), sin(t)) * 2.5 + 0.5));
      sum += s * smoothstep(0.45, 0.9, lumaOf(s));
    }
    o = c + sum * 0.22;
    // neon: dark bodies, glowing rims in a cycling hue
    if (isFilter(f, 13.0)) o = edge > 0.5 ? hueOf(fract(cell.y * 0.01 + uTime * 0.12)) * 1.2 : c * 0.22 + sum * 0.12;
  }
  // bleed: colour smears to the right of where it belongs, as on a worn tape
  if (isFilter(f, 8.0)) {
    vec3 smear = (rgbAt(cell - vec2(1.0, 0.0)) + rgbAt(cell - vec2(2.0, 0.0)) + rgbAt(cell - vec2(3.0, 0.0))) / 3.0;
    o = vec3(l) + (smear - vec3(lumaOf(smear))) * 1.3;
  }
  // night vision: green phosphor and noise
  if (isFilter(f, 10.0)) o = vec3(0.12, 1.0, 0.28) * (l * 1.35 + 0.06) + (signalHash(cell + frame) - 0.5) * 0.12;
  // sparkle: bright pixels twinkle white
  if (isFilter(f, 11.0)) o = c + step(0.5, l) * step(1.0 - 0.07 * a, signalHash(cell + floor(uTime * 6.0) * 2.17)) * vec3(0.9);
  // thermal: black, blue, magenta, red, yellow, white by brightness
  if (isFilter(f, 12.0)) {
    float h = clamp(l * 1.15, 0.0, 1.0);
    o = h < 0.25 ? mix(vec3(0.02, 0.0, 0.1), vec3(0.15, 0.1, 0.9), h * 4.0) : h < 0.5 ? mix(vec3(0.15, 0.1, 0.9), vec3(0.9, 0.1, 0.7), h * 4.0 - 1.0) : h < 0.75 ? mix(vec3(0.9, 0.1, 0.7), vec3(1.0, 0.55, 0.0), h * 4.0 - 2.0) : mix(vec3(1.0, 0.55, 0.0), vec3(1.0, 1.0, 0.85), h * 4.0 - 3.0);
  }
  // rainbow: colours cycle through the hues
  if (isFilter(f, 14.0)) o = hueOf(fract(l * 1.4 + cell.y * 0.008 + uTime * 0.18)) * (0.35 + 0.85 * l);
  // holo: iridescent foil that shifts across the part, with a sweeping sheen
  if (isFilter(f, 18.0)) {
    float sheen = smoothstep(0.92, 1.0, fract((cell.x + cell.y) * 0.02 - uTime * 0.35));
    o = mix(c, hueOf(fract(cell.x * 0.018 + cell.y * 0.012 + uTime * 0.2 + l * 0.6)) * (0.55 + 0.6 * l), 0.65) + sheen * 0.5;
  }
  return mix(c, clamp(o, 0.0, 1.0), isFilter(f, 1.0) || isFilter(f, 11.0) ? 1.0 : a);
}
// Clump: a smooth Kuwahara filter gathers speckle into masses; what lies behind never bleeds in.
vec3 clumpAt(vec2 cell, vec3 c, float d0, float gap) {
  vec3 s[9];
  for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
    vec2 at = cell + vec2(float(i) - 1.0, float(j) - 1.0);
    s[j * 3 + i] = (i == 1 && j == 1) || distanceAt(at) - d0 > gap ? c : rgbAt(at);
  }
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int q = 0; q < 4; q++) {
    int ox = q - (q / 2) * 2;
    int oy = q / 2;
    vec3 a = s[oy * 3 + ox]; vec3 b = s[oy * 3 + ox + 1]; vec3 d = s[oy * 3 + ox + 3]; vec3 e = s[oy * 3 + ox + 4];
    vec3 mean = (a + b + d + e) * 0.25;
    vec3 va = a - mean; vec3 vb = b - mean; vec3 vd = d - mean; vec3 ve = e - mean;
    float w = 1.0 / (0.004 + dot(va, va) + dot(vb, vb) + dot(vd, vd) + dot(ve, ve));
    sum += mean * w * w;
    total += w * w;
  }
  return sum / total;
}
void main() {
  gF = 1.0;
  gGrid = uGrid;
  vec2 at = floor(gl_FragCoord.xy);
  // The detail pass redraws only the detail parts' own pixels; the rest is the world's look.
  if (uPass > 0.5) {
    gF = uFine;
    gGrid = uGrid * uFine;
    if (!onDetail(at)) {
      gl_FragColor = texture2D(tCoarse, (floor(at / uFine) + 0.5) / uGrid);
      return;
    }
  }
  // Clump would gather a small animal's eye and muzzle into its coat.
  float clump = gF > 1.5 ? 0.0 : uClump;
  vec2 home = clamp(at, vec2(0.0), gGrid - 1.0);
  int part = partAt(home);
  vec3 signal = signalOf(part);
  vec2 partFilter = filterOf(part);
  vec2 cell = filterCell(glitchCell(home, part), partFilter, part);
  vec3 c = toSrgb(colorAt(cell).rgb);
  // Red and blue drift apart by whole art pixels around a fringed part, and
  // further while it bursts.
  float fringe = max(signal.y, max(signalOf(partAt(home + vec2(2.0, 0.0))).y, signalOf(partAt(home - vec2(2.0, 0.0))).y));
  float split = floor(fringe * 1.6) + burstOf(signal.z, float(part));
  if (split >= 1.0) {
    c.r = toSrgb(colorAt(cell + vec2(split, 0.0)).rgb).r;
    c.b = toSrgb(colorAt(cell - vec2(split, 0.0)).rgb).b;
  }
  float d0 = distanceAt(cell);
  bool sky = d0 >= uSkyFrom;
  float dl = distanceAt(cell - vec2(1.0, 0.0));
  float dr = distanceAt(cell + vec2(1.0, 0.0));
  float dd = distanceAt(cell - vec2(0.0, 1.0));
  float du = distanceAt(cell + vec2(0.0, 1.0));
  float gap = 0.06 * d0 + 0.08;
  float edge = (!sky && max(max(dl, dr), max(du, dd)) - d0 > gap) ? 1.0 : 0.0;
  // Clumped, a leaf among leaves is not a silhouette.
  if (clump > 0.0 && d0 - min(min(dl, dr), min(du, dd)) > gap) edge = 0.0;
  float lap = abs(dl + dr - 2.0 * d0) + abs(du + dd - 2.0 * d0);
  float crease = (!sky && edge < 0.5 && lap > 0.012 * d0 + 0.02) ? 1.0 : 0.0;
  if (clump > 0.0 && !sky && split < 1.0) c = mix(c, clumpAt(cell, c, d0, gap), clump);
  c = filterColor(c, cell, partFilter, edge);

  float jitter = (bayer8(cell + 3.0) - 0.5) * 0.18;
  float far = d0 * (1.0 + jitter);
  int band = sky || far > uBands.y ? 2 : far > uBands.x ? 1 : 0;
  float screen = band == 0 ? uScreen.x : band == 1 ? uScreen.y : uScreen.z;
  float scale = band == 0 ? uScale.x : band == 1 ? uScale.y : uScale.z;
  float amount = band == 0 ? uAmount.x : band == 1 ? uAmount.y : uAmount.z;

  c += godRays(cell) * (sky ? 0.6 : 1.0);
  // Soft knee into black; lift the darkest toward cool blue; ramps lean lights warm, shadows cool.
  c = (c - 0.5) * uContrast + 0.5;
  c = mix(0.1 * exp(c * 10.0 - 1.0), c, step(0.1, c));
  float lo = 1.0 - clamp(lumaOf(c), 0.0, 1.0);
  c += uLift * lo * lo * lo * vec3(0.8, 0.9, 1.3) + (sky ? 0.0 : uRamp) * 0.09 * (0.55 - lo) * vec3(1.0, 0.3, -0.9);
  // Only a light far band is pushed: a night or blue-hour sky keeps its depth.
  float farPush = band == 2 ? mix(1.0, uSkySaturation, smoothstep(0.3, 0.6, lumaOf(c))) : 1.0;
  c = mix(vec3(lumaOf(c)), c, uSaturation * farPush);
  // Outlines thin out with distance, so a far skyline is a soft edge, not a wire.
  float outline = uOutline * (band == 0 ? 1.0 : band == 1 ? 0.7 : 0.3);
  vec3 ink = uOutlineColor.a > 0.5 ? uOutlineColor.rgb : c * vec3(0.36, 0.33, 0.46);
  c = mix(c, ink, edge * outline);
  c = mix(c, c * vec3(0.74, 0.72, 0.8), crease * uCrease);
  c = clamp(c, 0.0, 1.0);

  // A silhouette is a solid run of tone, never broken speckle.
  // A dark sky bands, never a grid of dots.
  if (sky) amount *= smoothstep(0.03, 0.2, lumaOf(c));
  // On a fixed palette the sky keeps its hue and settles into bands rather than a checker of far-apart inks.
  if (sky && uPaletteSize > 0) amount *= 0.35;
  float t = 0.5 + (screenAt(screen, floor(cell / scale)) - 0.5) * amount * (1.0 - edge * outline);
  // Alpha carries this pixel's scanline strength to the blit.
  gl_FragColor = vec4(uPaletteSize > 0 ? stepPalette(c, t, !sky, 1.6 * farPush) : stepTones(c, t), signal.x);
}
`,H=`
precision highp float;
uniform sampler2D tLook;
uniform vec2 uGrid;
uniform float uPixel;
uniform vec2 uOrigin;
uniform float uScanlines;
uniform float uTime;
uniform float uFine;
void main() {
  vec2 frame = (gl_FragCoord.xy - uOrigin) / uPixel;
  // The look target holds uFine detail pixels to an art pixel's side.
  vec2 grid = uGrid * uFine;
  vec2 cell = clamp(floor(frame * uFine), vec2(0.0), grid - 1.0);
  vec4 look = texture2D(tLook, (cell + 0.5) / grid);
  vec3 c = look.rgb;
  // Each pixel's scanline strength came from the look pass (whole frame or its part);
  // none show when an art pixel is too few device pixels tall.
  float scan = uPixel >= 2.0 ? look.a : 0.0;
  // Scanlines: the lower part of every art-pixel row is dimmed, and a faint
  // brighter band rolls slowly down the frame, as on a tube screen.
  // Dark gaps between lines, with the lit rows lifted to keep the frame's brightness.
  float line = (1.0 + scan * 0.22) * (1.0 - scan * 0.5 * step(fract(frame.y), 0.4));
  float roll = 1.0 + scan * 0.07 * sin((frame.y / uGrid.y + uTime * 0.12) * 6.2832);
  gl_FragColor = vec4(c * line * roll, 1.0);
}
`,Re={vertex:U,fragment:N,blit:H};function j(e,t,a){let r=(p,P)=>p[P]??0,[o,n,l]=a,i=r(e,0)*o+r(e,4)*n+r(e,8)*l,s=r(e,1)*o+r(e,5)*n+r(e,9)*l,m=r(e,2)*o+r(e,6)*n+r(e,10)*l,h=r(t,0)*i+r(t,4)*s+r(t,8)*m,y=r(t,1)*i+r(t,5)*s+r(t,9)*m,u=r(t,3)*i+r(t,7)*s+r(t,11)*m,f=Math.hypot(i,s,m)||1,d=Math.max(0,-m/f);return u<=1e-4?{x:.5,y:.5,facing:0}:{x:Math.max(-2,Math.min(3,h/u*.5+.5)),y:Math.max(-2,Math.min(3,y/u*.5+.5)),facing:d}}function J(e,t){e.color!==void 0&&t.color!==void 0&&t.color.copy(e.color),t.opacity=e.opacity,t.transparent=e.transparent,t.visible=e.visible}var Ae=["map","emissive","emissiveIntensity","transparent","opacity","depthWrite","depthTest","side","alphaTest","vertexColors","flatShading","name"];function Me(e,t){let a=e,r={gradientMap:t};e.color!==void 0&&(r.color=e.color);for(let o of Ae)a[o]!==void 0&&a[o]!==null&&(r[o]=a[o]);return r}function Q(e,t){let a=new Map,r=n=>{let l=_(n),i=new e.DataTexture(l,l.length,1,"red");return i.minFilter="nearest",i.magFilter="nearest",i.generateMipmaps=!1,i.needsUpdate=!0,i},o=r(t);return{setBands(n){o.dispose(),o=r(n);for(let l of a.values())l.gradientMap=o,l.needsUpdate=!0},swap(n,l){let i=n.userData.voxelDitherSource;if(l==="smooth")return i===void 0?n:(J(n,i),i);if(i!==void 0||n.isLitMaterial!==!0||n.userData.voxelDitherKeep===!0)return n;let s=a.get(n);return s===void 0&&(s=new e.ToonMaterial(Me(n,o)),s.userData.voxelDitherSource=n,a.set(n,s)),J(n,s),s},dispose(){o.dispose();for(let n of a.values())n.dispose();a.clear()}}}var Z=["none","snow","film","mosaic","cga","negative","glow","vhs","bleed","wave","nightvision","sparkle","thermal","neon","rainbow","slitscan","pixelsort","datamosh","holo"],ee={1:.25,2:.5,3:.75};function q(e){let t=new Float32Array(9);for(let a=0;a<3;a+=1){let r=e[a];r!=null&&(t[a*3]=c(r.scanlines,0,1,0),t[a*3+1]=c(r.chroma,0,1,0),t[a*3+2]=c(r.glitch,0,1,0))}return t}function Y(e){let t=new Float32Array(6);for(let a=0;a<3;a+=1){let r=e[a],o=r?.filter===void 0?-1:Z.indexOf(r.filter);r==null||o<=0||(t[a*2]=o,t[a*2+1]=c(r.amount,0,1,1))}return t}function Fe(e,t){if(e.transparent||e.userData.voxelDitherSignal===t)return;let a=e.userData.voxelDitherSignalBase??{compile:e.onCompile,key:e.customProgramCacheKey};e.userData.voxelDitherSignalBase=a,e.userData.voxelDitherSignal=t;let r=ee[t].toFixed(2);e.onCompile=(o,n)=>{a.compile?.call(e,o,n);let l=o.fragmentShader.lastIndexOf("}");o.fragmentShader=`${o.fragmentShader.slice(0,l)}  gl_FragColor.a = ${r};
}
`},e.customProgramCacheKey=()=>`${a.key?.call(e)??""}|voxel-dither-signal-${String(t)}`,e.needsUpdate=!0}function te(e,t){e.traverse(a=>{if(!(a.isMesh!==!0||a.material===void 0))for(let r of Array.isArray(a.material)?a.material:[a.material])Fe(r,t)})}var ae=30,C=1<<ae>>>0;function Ce(e){return e.material===void 0?[]:Array.isArray(e.material)?e.material:[e.material]}function re(e,t){for(let a of e)a.traverse(r=>{r.isMesh!==!0||r.layers===void 0||Ce(r).every(o=>o.colorWrite===!1)||(r.layers.mask=t?C:1)})}function Oe(){return{tColor:{value:null},tDepth:{value:null},uGrid:{value:[1,1]},uPixel:{value:1},uOrigin:{value:[0,0]},uScreen:{value:[2,3,8]},uScale:{value:[1,1,1]},uAmount:{value:[1,1,1]},uBands:{value:[18,30]},uLevels:{value:6},uSnap:{value:0},uLift:{value:0},uClump:{value:0},uRamp:{value:0},uLuma:{value:1},uPaletteSize:{value:0},uAccentSize:{value:0},uAccent:{value:new Float32Array(12)},uAccentLab:{value:new Float32Array(12)},uSkySaturation:{value:1},uPalette:{value:new Float32Array(96)},uPaletteLab:{value:new Float32Array(96)},uOutline:{value:.9},uOutlineColor:{value:[0,0,0,0]},uCrease:{value:.35},uContrast:{value:1},uSaturation:{value:1},uSkyFrom:{value:100},uRaySource:{value:[.5,.5]},uRayColor:{value:[1,1,1]},uRayStrength:{value:0},uRayDecay:{value:.95},uRayDensity:{value:.8},tLook:{value:null},uScanlines:{value:0},uChroma:{value:0},uGlitch:{value:0},uTime:{value:0},uSignal:{value:new Float32Array(9)},uFilter:{value:new Float32Array(6)},tDetail:{value:null},tDetailDepth:{value:null},tCoarse:{value:null},uFine:{value:1},uPass:{value:0}}}function Pe(e,t,a){let r=z(t,Math.min(a.width,a.height)),o=[r.near,r.mid,r.far],n=(l,i)=>{g(e,l,i)};n("uScreen",o.map(l=>w.indexOf(l.screen))),n("uScale",o.map(l=>l.scale)),n("uAmount",o.map(l=>l.amount)),n("uBands",[...t.depthBands]),n("uLevels",t.levels),n("uSnap",t.snap),n("uLift",t.lift),n("uClump",t.clump),n("uRamp",t.ramp),n("uLuma",t.color==="luma"?1:0)}function Ge(e,t){let a=F(t.palette),r=(n,l)=>{g(e,n,l)};r("uPalette",a.data),r("uPaletteLab",a.lab),r("uPaletteSize",a.size);let o=F(t.accent);r("uAccent",o.data.subarray(0,12)),r("uAccentLab",o.lab.subarray(0,12)),r("uAccentSize",o.size)}function Be(e,t,a){let r=(o,n)=>{g(e,o,n)};r("uSkySaturation",t.skySaturation),r("uOutline",t.outline),r("uOutlineColor",t.outlineColor===null?[0,0,0,0]:[...M(t.outlineColor),1]),r("uCrease",t.crease),r("uContrast",t.contrast),r("uSaturation",t.saturation),r("uScanlines",t.scanlines),r("uChroma",t.chroma),r("uGlitch",t.glitch),r("uGrid",[a.width,a.height]),r("uPixel",a.pixel),r("uOrigin",[a.originX,a.originY])}function ne(e,t,a){Pe(e,t,a),Ge(e,t),Be(e,t,a)}function O(e,t){let a={minFilter:"nearest",magFilter:"nearest",generateMipmaps:!1};return t?new e.RenderTarget(1,1,{...a,type:"half",depthBuffer:!0,depthTexture:new e.DepthTexture(1,1)}):new e.RenderTarget(1,1,{...a,depthBuffer:!1})}function oe(e,t,a,r){let o=new e.CustomMaterial({uniforms:a,vertexShader:U,fragmentShader:r,depthTest:!1,depthWrite:!1}),n=new e.Mesh(t,o);n.frustumCulled=!1;let l=new e.Stage;return l.add(n),{scene:l,material:o}}function Ee(e,t,a,r){let o=e.uRayStrength;if(o===void 0)return;if(t===null||a.matrixWorldInverse===void 0||a.projectionMatrix===void 0){o.value=0;return}let n=j(a.matrixWorldInverse.elements,a.projectionMatrix.elements,t.direction);o.value=Math.max(0,t.strength)*r*Math.min(1,n.facing*2.5),Object.assign(e.uRaySource??{},{value:[n.x,n.y]}),Object.assign(e.uRayColor??{},{value:[...M(D.test(t.color)?t.color:"#ffffff")]}),Object.assign(e.uRayDecay??{},{value:c(t.decay,.85,.995,.95)}),Object.assign(e.uRayDensity??{},{value:c(t.density,.2,1,.8)})}function g(e,t,a){let r=e[t];r!==void 0&&(r.value=a)}function le(e,t,a,r){let o=a.layers,n=o?.mask??1;o&&(o.mask=r),e.render(t,a),o&&(o.mask=n)}function Ie(e,t,a){let{renderer:r,scene:o,view:n}=e,l=n.layers?.mask??1;r.setRenderTarget(t.world),le(r,o,n,a?l&~C:l),a&&(r.setRenderTarget(t.detail),le(r,o,n,C))}function ze(e,t,a){let{post:r,quad:o,uniforms:n,targets:l}=t;return g(n,"uFine",a),g(n,"uPass",0),g(n,"tCoarse",l.detailLook.texture),e.setRenderTarget(l.look),e.render(r.scene,o),a<=1?l.look:(g(n,"uPass",1),g(n,"tCoarse",l.look.texture),e.setRenderTarget(l.detailLook),e.render(r.scene,o),l.detailLook)}function _e(e,t){let a={world:O(e,!0),look:O(e,!1),detail:O(e,!0),detailLook:O(e,!1)},{world:r,look:o,detail:n,detailLook:l}=a,i=1,s={near:{value:.1},far:{value:100},ortho:{value:0},sky:{value:100}};Object.assign(t,{tColor:{value:r.texture},tDepth:{value:r.depthTexture},tLook:{value:o.texture},tDetail:{value:n.texture},tDetailDepth:{value:n.depthTexture},tCoarse:{value:l.texture},uNear:s.near,uFar:s.far,uOrtho:s.ortho,uSkyFrom:s.sky});let m=e.plane(2,2),h=oe(e,m,t,N),y=oe(e,m,t,H),u=new e.OrthoCamera(-1,1,1,-1,0,1),f={post:h,quad:u,uniforms:t,targets:a};return{resize(d){i=d.detail,r.setSize(d.width,d.height),o.setSize(d.width,d.height);let p=i>1?i:1;n.setSize(d.width*p,d.height*p),l.setSize(d.width*p,d.height*p)},draw(d,p,P,V){let{renderer:S,view:b}=d,ie=S.getRenderTarget(),G=i>1&&V.size>0;re(V,G),Ie(d,a,G),s.near.value=b.near,s.far.value=b.far,s.ortho.value=b.isOrthographicCamera===!0?1:0,s.sky.value=p.skyDistance>0?Math.min(p.skyDistance,b.far*.999):b.far*.999,Ee(t,P,b,p.rays),g(t,"tLook",ze(S,f,G?i:1).texture),S.setRenderTarget(ie),S.render(y.scene,u)},dispose(){r.depthTexture?.dispose(),r.dispose(),o.dispose(),n.depthTexture?.dispose(),n.dispose(),l.dispose(),h.material.dispose(),y.material.dispose(),m.dispose()}}}function Ue(e,t,a){let r=T(a),o={width:1,height:1,pixel:1,originX:0,originY:0,detail:1},n={width:1,height:1,ratio:1},l=null,i=new Set,s=Oe(),m=_e(e,s),h=Q(e,r.bands);ne(s,r,o);let y={get settings(){return r},get grid(){return o},setSettings(u){let f=r;return r=T(u),r.bands!==f.bands&&h.setBands(r.bands),y.setSize(n.width,n.height,n.ratio),r},setDepthBands(u,f){let[d,p]=E([u,f],r.depthBands);(d!==r.depthBands[0]||p!==r.depthBands[1])&&(r={...r,depthBands:[d,p]}),Object.assign(s.uBands?.value??[],[d,p])},setSize(u,f,d){return n={width:u,height:f,ratio:d},o=I(u,f,d,r),m.resize(o),ne(s,r,o),o},shade(u){u.traverse(f=>{f.isMesh!==!0||f.material===void 0||(f.material=Array.isArray(f.material)?f.material.map(d=>h.swap(d,r.shading)):h.swap(f.material,r.shading))})},setRays(u){l=u},setTime(u){g(s,"uTime",Number.isFinite(u)?u%3600:0)},tagSignal(u,f){te(u,f)},setSignals(u){Object.assign(s.uSignal??{},{value:q(u)}),Object.assign(s.uFilter??{},{value:Y(u)})},tagDetail(u){i.add(u)},render(u,f){m.draw({renderer:t,scene:u,view:f},r,l,i)},dispose(){m.dispose(),h.dispose()}};return y}export{k as DEFAULT_DITHER_SETTINGS,ae as DETAIL_LAYER,B as DITHER_STYLES,w as SCREENS,Z as SIGNAL_FILTERS,ee as SIGNAL_TAG_ALPHA,K as STYLE_IDS,Re as VOXEL_DITHER_GLSL,W as autoPixel,z as bandScreens,_ as celRamp,Ue as createVoxelDither,T as ditherSettings,Y as filterUniform,$ as okLab,F as paletteUniform,De as quantizeTone,I as resolveGrid,j as screenLight,q as signalUniform,we as thresholdAt};
