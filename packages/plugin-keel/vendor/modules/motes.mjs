// motes@0.1.0 from keel-modules 884d31d (MIT). Generated: don't edit.
var x=`
uniform vec3 uDrift, uBoxMin, uBox;
uniform float uTurbulence;
vec3 motePath(vec4 mote, vec4 life, float t) {
  vec3 p = mote.xyz + uDrift * t - uBoxMin;
  p = uBoxMin + p - uBox * floor(p / uBox);
  float s = life.w * 61.0 + mote.w;
  vec3 a = vec3(0.37, 0.29, 0.23) * t + vec3(s, s * 1.7, s * 2.9);
  vec3 b = vec3(0.83, 0.71, 0.59) * t + vec3(s * 2.3, s * 3.1, s * 1.3);
  return p + uTurbulence * (sin(a) + 0.5 * sin(b)) / 1.5;
}
float moteFade(vec3 p) {
  vec3 f = fract((p - uBoxMin) / uBox);
  vec3 edge = clamp(min(f, 1.0 - f) * 16.0, 0.0, 1.0);
  vec3 moving = step(1e-6, abs(uDrift));
  vec3 fade = mix(vec3(1.0), edge, moving);
  return fade.x * fade.y * fade.z;
}
`,b=`
attribute vec4 aMote;
attribute vec4 aLife;
attribute vec3 aColor;
uniform float uTime, uBlink, uOpacity, uIntensity, uMinPixels;
uniform vec2 uPixel;
varying vec2 vUv;
varying vec4 vColor;
varying float vSparkle;
${x}
void main() {
  float t = uTime;
  vec3 p = motePath(aMote, aLife, t);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * view;
  // (A sparkle's rays reach past its core, so its quad is three times as wide.)
  float reach = mix(1.0, 3.0, aLife.z);
#ifdef ATTENUATE
  float pixels = aLife.y * projectionMatrix[1][1] / max(clip.w, 1e-4) / uPixel.y;
#else
  float pixels = aLife.y;
#endif
  float shown = max(pixels, uMinPixels);
  float dim = (pixels * pixels) / max(shown * shown, 1e-8);
  clip.xy += position.xy * reach * shown * uPixel * clip.w;
  gl_Position = clip;
  float wave = 0.5 + 0.5 * sin(6.2831853 * t / aLife.x + aMote.w);
  float alpha = uOpacity * mix(1.0, wave * wave, uBlink) * dim * moteFade(p);
  vUv = position.xy * 2.0;
  vColor = vec4(aColor * uIntensity, alpha);
  vSparkle = aLife.z;
}
`,f=`
varying vec2 vUv;
varying vec4 vColor;
varying float vSparkle;
void main() {
  // (A dot: a soft round sprite, nothing at the quad's edge. A sparkle: a core and four rays, on a quad 3x as wide.)
  float r2 = dot(vUv, vUv);
  float soft = max(0.0, 1.0 - r2);
  float dot2 = soft * soft;
  vec2 a = abs(vUv);
  float rays = max(0.0, 1.0 - a.x) * exp(-a.y * 48.0) + max(0.0, 1.0 - a.y) * exp(-a.x * 48.0);
  float star = exp(-r2 * 24.0) + rays * 0.7;
  float shape = mix(dot2, star, vSparkle);
  if (shape * vColor.a < 0.002) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * shape);
}
`;var p={count:300,seed:1,centre:[0,0,0],box:[3,3,4],size:.07,sizeSpread:.5,minPixels:1.5,colors:["#ffbe26"],opacity:.88,intensity:1,drift:[.014,.014,0],turbulence:.03,blinkPeriod:[2,5],blink:1,sparkle:0,attenuate:!0},g=6.283185307179586,w=4096,L=8,m=(n,e,o)=>Math.min(o,Math.max(e,n));function u(n,e,o){let t=Math.imul(n|0,2654435761)^Math.imul(e+1,2246822519)^Math.imul(o+1,3266489917);return t=Math.imul(t^t>>>16,2146121005),t=Math.imul(t^t>>>15,2221713035),t^=t>>>16,(t>>>0)/4294967296}function d(n={}){let e={...p,...n},o=Math.max(.05,Math.min(e.blinkPeriod[0],e.blinkPeriod[1]));return{...e,count:m(Math.floor(e.count),0,w),seed:e.seed|0,box:[Math.max(.001,e.box[0]),Math.max(.001,e.box[1]),Math.max(.001,e.box[2])],size:Math.max(0,e.size),sizeSpread:m(e.sizeSpread,0,1),minPixels:Math.max(0,e.minPixels),colors:e.colors.length>0?e.colors.slice(0,255):p.colors,opacity:m(e.opacity,0,1),intensity:Math.max(0,e.intensity),turbulence:Math.max(0,e.turbulence),blinkPeriod:[o,Math.max(o,e.blinkPeriod[0],e.blinkPeriod[1])],blink:m(e.blink,0,1),sparkle:m(e.sparkle,0,1)}}function v(n,e,o){let t=o*3;return[n.centre[0]+(u(n.seed,e,t)-.5)*n.box[0],n.centre[1]+(u(n.seed,e,t+1)-.5)*n.box[1],n.centre[2]+(u(n.seed,e,t+2)-.5)*n.box[2]]}function T(n,e,o){let t=v(n,e,0);if(!o)return t;for(let a=0;a<L;a+=1)if(t=v(n,e,a),u(n.seed,e,100+a)<o(t[0],t[1],t[2]))return t;return t}function y(n={},e){let o=d(n),t=new Float32Array(o.count*4),a=new Float32Array(o.count*4),l=new Uint8Array(o.count),[i,s]=o.blinkPeriod;for(let r=0;r<o.count;r+=1){let c=T(o,r,e);t.set([c[0],c[1],c[2],u(o.seed,r,40)*g],r*4);let M=o.size*(1+(u(o.seed,r,42)*2-1)*o.sizeSpread),h=u(o.seed,r,43)<o.sparkle?1:0,k=i+u(o.seed,r,41)*(s-i);a.set([k,M,h,u(o.seed,r,44)],r*4),l[r]=Math.floor(u(o.seed,r,45)*o.colors.length)}return{count:o.count,mote:t,life:a,color:l}}function A(n,e,o){let t=y(e,o),a=e.colors.map(i=>new n.Color(i)),l=new Float32Array(t.count*3);for(let i=0;i<t.count;i+=1){let s=a[t.color[i]??0]??{r:1,g:1,b:1};l.set([s.r,s.g,s.b],i*3)}return{aMote:new n.InstanceAttribute(t.mote,4),aLife:new n.InstanceAttribute(t.life,4),aColor:new n.InstanceAttribute(l,3)}}function P(n,e){let o=e.centre.map((t,a)=>t-(e.box[a]??1)/2);return{uTime:{value:0},uBlink:{value:e.blink},uOpacity:{value:e.opacity},uIntensity:{value:e.intensity},uMinPixels:{value:e.minPixels},uPixel:{value:new n.Vector2(2/1024,2/1024)},uDrift:{value:new n.Vector3(e.drift[0],e.drift[1],e.drift[2])},uBoxMin:{value:new n.Vector3(o[0],o[1],o[2])},uBox:{value:new n.Vector3(e.box[0],e.box[1],e.box[2])},uTurbulence:{value:e.turbulence}}}function O(n,e={},o){let t=d(e),a=n.plane(1,1);for(let[r,c]of Object.entries(A(n,t,o)))a.setAttribute(r,c);let l=P(n,t),i=new n.CustomMaterial({uniforms:l,vertexShader:b,fragmentShader:f,defines:t.attenuate?{ATTENUATE:""}:{},transparent:!0,depthWrite:!1,blending:"add"}),s=new n.Instances(a,i,t.count);return s.frustumCulled=!1,{mesh:s,get shown(){return s.count},set shown(r){s.count=Math.max(0,Math.min(t.count,Math.floor(r)))},resize(r,c){l.uPixel.value.set(2/Math.max(1,r),2/Math.max(1,c))},update(r){let c=r.still===!0;l.uTime.value=c?0:r.time,l.uBlink.value=c?0:t.blink,l.uOpacity.value=t.opacity*Math.max(0,Math.min(1,r.opacity??1))},dispose(){a.dispose(),i.dispose()}}}export{p as DEFAULT_MOTES,f as MOTE_FRAGMENT,x as MOTE_PATH_GLSL,b as MOTE_VERTEX,O as createMotes,u as moteHash,d as moteSettings,y as placeMotes};
