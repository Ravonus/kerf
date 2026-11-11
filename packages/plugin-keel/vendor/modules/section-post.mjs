// section-post@0.1.0 from keel-modules a830285 (MIT). Generated: don't edit.
var T={seed:1,colour:"#f7f7ee",tear:0,fibre:.8,paper:.4,shadow:.35,grain:.02,noiseScale:1,depth:!1},A=/^#[0-9a-f]{6}$/iu;function d(r,e,o,t){return typeof r=="number"&&Number.isFinite(r)?Math.min(t,Math.max(o,r)):e}function h(r){if(r==null||typeof r!="object")return T;let e=r,o=T;return{seed:Math.trunc(d(e.seed,o.seed,0,2147483647)),colour:typeof e.colour=="string"&&A.test(e.colour)?e.colour.toLowerCase():o.colour,tear:d(e.tear,o.tear,0,1),fibre:d(e.fibre,o.fibre,0,1),paper:d(e.paper,o.paper,0,1),shadow:d(e.shadow,o.shadow,0,1),grain:d(e.grain,o.grain,0,.2),noiseScale:d(e.noiseScale,o.noiseScale,.25,8),depth:typeof e.depth=="boolean"?e.depth:o.depth}}function _(r){let e=Number.parseInt(r.slice(1),16);return[(e>>16&255)/255,(e>>8&255)/255,(e&255)/255]}function w(r,e){let o=r.colour?.length===3&&r.colour.every(Number.isFinite)?[...r.colour]:_(e.colour);return{progress:d(r.progress,0,0,2),position:d(r.position,0,-1,1),colour:o,tear:d(r.tear,e.tear,0,1),fibre:d(r.fibre,e.fibre,0,1),shadow:d(r.shadow,e.shadow,0,1),grain:d(r.grain,e.grain,0,.2),darken:d(r.darken,0,0,1),blur:d(r.blur,0,0,1)}}var S=.016,G=.03,v=4;function x(r){return r.progress<=1?[-v,r.progress+r.position]:[r.progress-1+r.position,v]}function M(r){let[e,o]=x(r),t=r.tear*S+G;return r.progress>0&&r.progress<2&&o>-t&&e<1+t}function L(r){return!M(r)&&r.darken===0&&r.blur===0&&r.grain===0}function P(r,e){return r*.05*Math.max(1,Math.ceil(e/2))}var y=256;function k(r,e,o){let t=Math.imul(r|0,521288629)^Math.imul(e|0,1597334677)^(o|0);return t=Math.imul(t^t>>>15,739982445),t=Math.imul(t^t>>>12,695872825),((t^t>>>15)>>>0)/4294967296}var N=r=>r*r*(3-2*r);function U(r,e,o,t){let a=r*o,s=e*o,u=Math.floor(a),n=Math.floor(s),i=N(a-u),m=N(s-n),l=(b,g)=>k(b%o,g%o,t),c=l(u,n)+(l(u+1,n)-l(u,n))*i,f=l(u,n+1)+(l(u+1,n+1)-l(u,n+1))*i;return c+(f-c)*m}function D(r,e,o,t){let a=0,s=1;for(let u=0;u<4;u+=1)a+=U(r,e,o<<u,t+u)*s,s/=2;return a/1.875}function B(r){let e=1/0,o=-1/0;for(let a of r)e=Math.min(e,a),o=Math.max(o,a);let t=o>e?o-e:1;return Uint8Array.from(r,a=>Math.round((a-e)/t*255))}function R(r=0,e=256){let o=e*e,t=new Float64Array(o),a=new Float64Array(o);for(let i=0;i<e;i+=1)for(let m=0;m<e;m+=1)t[i*e+m]=D(m/e,i/e,16,r),a[i*e+m]=D(m/e,i/e,4,r+101);let s=B(t),u=B(a),n=new Uint8Array(o*4);for(let i=0;i<o;i+=1)n[i*4]=s[i]??0,n[i*4+1]=u[i]??0,n[i*4+2]=Math.floor(k(i%e,Math.floor(i/e),r+7)*256),n[i*4+3]=255;return n}var E=`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`,F=`
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tBlurred;
uniform sampler2D tNoise;
uniform vec2 uSize;
uniform float uNoiseScale;
uniform float uBottom;
uniform float uTop;
uniform vec3 uColour;
uniform float uTear;
uniform float uTearReach;
uniform float uFibre;
uniform float uShadow;
uniform float uPaper;
uniform float uGrain;
uniform float uDarken;
uniform float uBlur;
// How far an edge strays from its line at x (frame heights): a slow wander, a ragged middle and fine jags on it.
float stray(float x, float row) {
  float wander = texture2D(tNoise, vec2(x * 0.9, row)).g - 0.5;
  float ragged = texture2D(tNoise, vec2(x * 2.5, row + 0.13)).r - 0.5;
  float jag = texture2D(tNoise, vec2(x * 0.7, row + 0.31)).b - 0.5;
  return (wander + ragged * 0.6 + jag * 0.35) * uTearReach * uTear;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 c = texture2D(tColor, uv).rgb;
  if (uBlur > 0.0) c = mix(c, texture2D(tBlurred, uv).rgb, smoothstep(0.0, 0.02, uBlur));
  c *= 1.0 - uDarken;
  float x = uv.x * uSize.x / uSize.y;
  float px = 1.0 / uSize.y;
  float top = uTop + stray(x, 0.21);
  float bottom = uBottom + stray(x, 0.68);
  // Signed distance into the panel from its nearer edge, frame heights: positive inside.
  float depth = min(uv.y - bottom, top - uv.y);
  float inside = smoothstep(-px, px, depth);
  float past = max(-depth, 0.0);
  c *= 1.0 - uShadow * 0.6 * (1.0 - smoothstep(0.0, 0.025, past)) * (1.0 - inside);
  float band = (1.5 + 2.5 * uTear) * px;
  float fibres = (1.0 - smoothstep(band * 0.5, band, past)) * (1.0 - inside);
  float hairs = step(0.985, texture2D(tNoise, vec2(x * 70.0, 0.83)).b) * uTear;
  fibres = max(fibres, hairs * (1.0 - smoothstep(0.0, band * 5.0, past)) * (1.0 - inside));
  vec3 paper = uColour * (1.0 - uPaper * 0.06 * (texture2D(tNoise, vec2(x, uv.y) * 6.0 * uNoiseScale).r - 0.5));
  c = mix(c, paper, inside);
  c = mix(c, mix(uColour, vec3(1.0), 0.6), uFibre * fibres);
  float grain = texture2D(tNoise, gl_FragCoord.xy / 256.0).b - 0.5;
  gl_FragColor = vec4(clamp(c + grain * uGrain, 0.0, 1.0), 1.0);
}
`;function p(r,e,o){let t=r[e];t!==void 0&&(t.value=o)}function C(r,e,o,t){let a=new r.CustomMaterial({uniforms:o,vertexShader:E,fragmentShader:t,depthTest:!1,depthWrite:!1}),s=new r.Mesh(e,a);s.frustumCulled=!1;let u=new r.Stage;return u.add(s),{scene:u,material:a}}function O(r,e){let o=new r.DataTexture(R(e),256,256,"rgba");return o.wrapS="repeat",o.wrapT="repeat",o.minFilter="linear",o.magFilter="linear",o.needsUpdate=!0,o}function I(r,e,o){let t={minFilter:"linear",magFilter:"linear",generateMipmaps:!1,depthBuffer:!1},a=new r.RenderTarget(1,1,{...t,depthBuffer:o.depth}),s=[new r.RenderTarget(1,1,t),new r.RenderTarget(1,1,t)],u=r.plane(2,2),n=c=>({value:c}),i=C(r,u,{tColor:n(a.texture),tBlurred:n(s[1].texture),tNoise:n(O(r,o.seed)),uSize:n([1,1]),uNoiseScale:n(1),uBottom:n(-4),uTop:n(-4),uColour:n([1,1,1]),uTear:n(0),uTearReach:n(S),uFibre:n(0),uShadow:n(0),uPaper:n(0),uGrain:n(0),uDarken:n(0),uBlur:n(0)},F),m={tBlur:n(null),uBloomSize:n([1,1]),uDir:n([1,0])},l=C(r,u,m,e.BLUR_GLSL);return{frame:a,blurred:s,post:i,blur:l,camera:new r.OrthoCamera(-1,1,1,-1,0,1),geometry:u}}function j(r,e,o){let[t,a]=x(e),s=[["uBottom",t],["uTop",a],["uColour",e.colour],["uTear",e.tear],["uFibre",e.fibre],["uShadow",e.shadow],["uGrain",e.grain],["uDarken",e.darken],["uBlur",e.blur],["uPaper",o.paper],["uNoiseScale",o.noiseScale]];for(let[u,n]of s)p(r,u,n)}function H(r,e,o){let t=e.blur.material.uniforms;p(t,"tBlur",e.frame.texture),p(t,"uDir",[o,0]),r.setRenderTarget(e.blurred[0]),r.render(e.blur.scene,e.camera),p(t,"tBlur",e.blurred[0].texture),p(t,"uDir",[0,o]),r.setRenderTarget(e.blurred[1]),r.render(e.blur.scene,e.camera)}function V(r,e,o,t){let a=h(t),s=I(r,o,a),u=s.post.material.uniforms,n=1;return{get settings(){return a},setSettings(i){let m=a.seed;if(a=h(i),a.seed!==m){let l=u.tNoise?.value;p(u,"tNoise",O(r,a.seed)),l.dispose()}return a},setSize(i,m,l){let c=g=>Math.max(1,Math.round(g*l)),f=[c(i),c(m)],b=[Math.max(1,Math.ceil(f[0]/2)),Math.max(1,Math.ceil(f[1]/2))];s.frame.setSize(f[0],f[1]);for(let g of s.blurred)g.setSize(b[0],b[1]);p(u,"uSize",f),p(s.blur.material.uniforms,"uBloomSize",b),n=f[1]},render(i,m={}){let l=w(m,a);if(L(l)){i();return}let c=e.getRenderTarget();e.setRenderTarget(s.frame),i(),l.blur>0&&H(e,s,P(l.blur,n)),j(u,l,a),e.setRenderTarget(c),e.render(s.post.scene,s.camera)},dispose(){for(let i of[s.frame,...s.blurred])i.dispose();(u.tNoise?.value).dispose(),s.post.material.dispose(),s.blur.material.dispose(),s.geometry.dispose()}}}export{T as DEFAULT_POST_SETTINGS,y as NOISE_SIZE,F as POST_GLSL,E as POST_VERTEX_GLSL,S as TEAR_REACH,P as blurStep,V as createSectionPost,_ as displayColour,w as frameOf,L as idle,k as latticeHash,R as noiseTexels,x as panelEdges,M as panelShows,h as postSettings};
