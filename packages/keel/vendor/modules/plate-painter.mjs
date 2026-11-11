// plate-painter@0.1.0 from keel-modules 53c36d0 (MIT). Generated: don't edit.
var Q={aspect:1.6,haze:"#b5bfbd",hazeStep:.25,sky:{top:"#5d8090",low:"#a9b9b6",corner:"#43606e",cloudLit:"#c9cec6",cloudShade:"#8a9fa6",band:[.08,.3],centre:.78,cover:.55},ranges:[{x:[.6,1.08],base:.47,peaks:[[.8,.335],[.93,.355],[.69,.39]],rough:.5,depth:2.3,lit:"#9a8aa2",shade:"#665c7a"},{x:[.12,.7],base:.475,peaks:[[.3,.37],[.45,.342],[.58,.385]],rough:.6,depth:1.2,lit:"#7fa0ad",shade:"#46677a"},{x:[-.1,1.1],base:.505,peaks:[[.22,.44],[.6,.452],[.86,.448]],rough:.4,depth:.7,lit:"#5b7566",shade:"#34504f"}],shore:{top:.5,y:.52,color:"#95937c",lit:"#bdb8a0"},water:{near:.72,far:"#7a9a9e",deep:"#3f6469",sheen:"#bfc6bc"},ground:{color:"#3b4b40",warm:"#574a37",dark:"#222d28"},trees:[{kind:"crown",x:[.27,.42],y:[.505,.54],count:26,height:[.018,.034],color:"#27352f",lit:"#46594a",depth:.7},{kind:"spire",x:[.35,.5],y:[.52,.522],count:8,height:[.035,.065],color:"#1f2b26",lit:"#3b4d43",depth:.6}],town:{x:[.855,1],y:.522,walls:7,towers:2,height:[.014,.03],tower:[.045,.06],lit:"#c9bfa8",shade:"#878372",rock:"#7d7766",depth:1.2},leaves:{lit:"#6b7859",mid:"#46553f",shadow:"#2a3a33",deep:"#141b17",bound:.3,branches:[{from:[-.02,.02],bend:[.17,0],to:[.27,.4],leaves:26,size:.14}],masses:[{x:[0,.29],y:[.42,1.02],leaves:96,size:.17}]},strokes:{sky:{angle:-.17,length:.04,width:.011,opacity:.3},ridges:{angle:-.5,length:.012,width:.003,opacity:.4},shore:{angle:0,length:.014,width:.0025,opacity:.5},water:{angle:0,length:.05,width:.006,opacity:.6},ground:{angle:-.12,length:.026,width:.009,opacity:.6}},weave:.001,vignette:.08};var b={blot:0,spire:1,crown:2,wall:3,leaf:4,stem:5},R=16;function l(e){let o=parseInt(e.slice(1,7),16);if(e.length!==7||!Number.isInteger(o))throw new TypeError(`plate-painter: "${e}" is not #rrggbb.`);return[(o>>16)/255,(o>>8&255)/255,(o&255)/255]}function P(e,o,t){return[e[0]+(o[0]-e[0])*t,e[1]+(o[1]-e[1])*t,e[2]+(o[2]-e[2])*t]}function D(e){let o=new Float32Array(e.length*R);return e.forEach((t,n)=>{o.set([t.x,t.y,t.len,t.wid,t.ax,t.ay,t.kind,t.seed,t.color[0],t.color[1],t.color[2],t.alpha,t.light,t.variant,t.water,t.depth],n*R)}),o}function v(e,o){let t=Math.imul(e^2654435769,2246822507)^Math.imul(o+1663821227,3266489909);return t=Math.imul(t^t>>>16,2146121005),t=Math.imul(t^t>>>15,2221713035),(t^t>>>16)>>>0}function x(e,o){let t=0,n=()=>(t+=1,v(v(e,o),t)/4294967296);return Object.assign(n,{within:(a,i)=>a+(i-a)*n()})}function ee(e){let o=e<0?0:Math.min(e,1);return o*o*(3-2*o)}function F(e,o){let t=Math.floor(o),n=ee(o-t),r=v(e,t)/4294967296,a=v(e,t+1)/4294967296;return r+(a-r)*n}function _(e,o,t){let n=1+t*t,r=(1-t*t)/n,a=2*t/n,i=e*r-o*a,s=e*a+o*r,c=Math.sqrt(i*i+s*s)||1;return[i/c,s/c]}function U(e){let o=2166136261,t=16777619;for(let n of e){let r=new Uint8Array(n.buffer,n.byteOffset,n.byteLength);for(let a of r)o=Math.imul(o^a,16777619),t=Math.imul(t^a,16777629)^o>>>7}return(o>>>0).toString(16).padStart(8,"0")+(t>>>0).toString(16).padStart(8,"0")}var C=(e,o)=>{let[t,n,r]=[e[0]??[0,0],e[1]??[0,0],e[2]??[0,0]],a=1-o;return[a*a*t[0]+2*a*o*n[0]+o*o*r[0],a*a*t[1]+2*a*o*n[1]+o*o*r[1]]},te=(e,o)=>{let[t,n,r]=[e[0]??[0,0],e[1]??[0,0],e[2]??[0,0]];return[2*(1-o)*(n[0]-t[0])+2*o*(r[0]-n[0]),2*(1-o)*(n[1]-t[1])+2*o*(r[1]-n[1])]},S=(e,o)=>{let t=Math.sqrt(e*e+o*o)||1;return[e/t,o/t]};function G(e,o){let t=Math.min(Math.max(o,0),1)*(e.length-1),n=Math.min(Math.floor(t),e.length-2);return P(e[n]??[0,0,0],e[n+1]??[0,0,0],t-n)}function z(e,o,t){let n=o()<.6?1:3+2*Math.floor(o()*2),r=t.length/2,a=r*(n===1?o.within(.42,.55):o.within(.8,.95)),[i,s]=t.axis,c=Math.abs(i)*r+Math.abs(s)*a,u=Math.min(t.base[0]+i*r,e.maxX-c),f=(-i-s)*.12,d=(t.deep?o.within(.05,.4):o.within(.35,.95))+f;return{x:u/e.aspect,y:t.base[1]+s*r,len:r,wid:a,ax:i,ay:s,kind:b.leaf,seed:o(),color:G(e.ramp,d*.92),alpha:1,light:Math.min(Math.max(d,0),.85),variant:n,water:0,depth:t.deep?.25:0}}function I(e,o,t){let n=[];for(let a=0;a<14;a+=1){let i=C(e,a/14),s=C(e,(a+1)/14),[c,u]=[s[0]-i[0],s[1]-i[1]],f=Math.sqrt(c*c+u*u)*.6,[d,m]=S(c,u);n.push({x:(i[0]+s[0])/2/o,y:(i[1]+s[1])/2,len:f,wid:t*(1-.7*a/14),ax:d,ay:m,kind:b.stem,seed:a/14,color:[.16,.16,.12],alpha:1,light:.4,variant:1,water:0,depth:0})}return n}function oe(e,o,t){let n=i=>[i[0]*e.aspect,i[1]],r=[n(o.from),n(o.bend),n(o.to)],a=[];for(let i=0;i<o.leaves;i+=1){let s=(i+t.within(0,.8))/o.leaves,[c,u]=S(...te(r,s)),f=i%2===0?1:-1,[d,m]=_(c,u,f*t.within(.35,.9)),w=S(d,m+t.within(.2,.9)),g=C(r,s),k=o.size*t.within(.6,1.25)*(1-.35*s);a.push(z(e,t,{base:g,axis:w,length:k,deep:t()<.35}))}return{stems:I(r,e.aspect,.006),leaves:a}}function re(e,o,t){let[n,r]=[o.x[0]*e.aspect,o.x[1]*e.aspect],[a,i]=o.y,s=[];for(let f=0;f<30;f+=1){let d=t.within(n,n+(r-n)*.5),m=t.within(.06,.12);s.push({x:d/e.aspect,y:t.within(a+.24,i),len:m,wid:m*t.within(.6,1),ax:1,ay:0,kind:b.blot,seed:t(),color:G(e.ramp,t.within(0,.12)),alpha:.95,light:0,variant:1,water:0,depth:0})}let c=[];for(let f=0;f<4;f+=1){let d=[t.within(n,n+(r-n)*.4),i+.02],m=[t.within(n+(r-n)*.4,r-.04),t.within(a,a+(i-a)*.5)];c.push(...I([d,[d[0]-.02,(d[1]+m[1])/2],m],e.aspect,.005))}let u=[];for(let f=0;f<o.leaves;f+=1)u.push(ne(e,o,t,[n,r,a,i]));return{blots:s,stems:c,leaves:u}}function ne(e,o,t,n){let[r=0,a=0,i=0,s=0]=n,c=t(),u=r+(a-r)*(.35*c+.65*c*c)*t.within(.85,1.12),f=t.within(i,s),[d,m]=S(u-(r-.1),f-(s+.1)),w=S(..._(d,m,t.within(-.5,.5))),g=(f-i)/(s-i),k=o.size*t.within(.65,1.2)*(.75+.45*g),J=t()<.3+.35*(1-(u-r)/(a-r));return z(e,t,{base:[u,f],axis:S(w[0],w[1]+.25),length:k,deep:J})}function O(e,o){let{leaves:t,aspect:n}={leaves:e.leaves,aspect:e.aspect},r={ramp:[l(t.deep),l(t.shadow),l(t.mid),l(t.lit)],maxX:t.bound*n,aspect:n},a=[],i=[],s=[];t.masses.forEach((f,d)=>{let m=re(r,f,x(o,400+d));a.push(...m.blots),i.push(...m.stems),s.push(...m.leaves)}),t.branches.forEach((f,d)=>{let m=oe(r,f,x(o,500+d));i.push(...m.stems),s.push(...m.leaves)});let c=s.filter(f=>f.depth>0),u=s.filter(f=>f.depth===0);return[...a,...i,...c,...u]}var W={ax:0,ay:-1};function ae(e,o){let t=o.within(e.x[0],e.x[1]),n=o.within(e.y[0],e.y[1]),r=o.within(e.height[0],e.height[1]),a=e.kind==="spire",i=a?r/2:r*.55,s=a?r*o.within(.1,.15):r*o.within(.42,.62),c={x:t,y:n-i*.92,len:i,wid:s,...W,kind:a?b.spire:b.crown,seed:o(),color:P(l(e.color),l(e.lit),o.within(0,.25)),alpha:1,light:o.within(.35,.7),variant:1,water:0,depth:e.depth};return{foot:n,dab:c}}function ie(e,o,t){let n=t.tower?e.tower:e.height,r=o.within(n[0],n[1]),a=t.tower?o.within(.006,.01):o.within(.012,.026);return{x:t.left+a/2,y:t.foot-r/2,len:r/2,wid:a*.8,...W,kind:b.wall,seed:o(),color:P(l(e.lit),l(e.shade),o.within(0,.3)),alpha:1,light:o.within(.55,.9),variant:o.within(.2,.45),water:0,depth:e.depth}}function se(e,o){let t=e.x[1]-e.x[0],n={x:e.x[0]+t/2,y:e.y-.004,len:t*.62,wid:.011,ax:1,ay:0,kind:b.blot,seed:o(),color:l(e.rock),alpha:1,light:.6,variant:1,water:0,depth:e.depth},r=[{foot:e.y-.001,dab:n}],a=new Set;for(;a.size<Math.min(e.towers,e.walls);)a.add(Math.floor(o()*e.walls));for(let i=0;i<e.walls;i+=1){let s=e.x[0]+t*(i+o.within(-.2,.2))/e.walls,c=e.y-.008+o.within(-.002,.003);r.push({foot:c,dab:ie(e,o,{left:s,foot:c,tower:a.has(i)})})}return r}function ce(e,o,t){return{...e,y:2*o-e.y,len:e.len*1.08,ay:-e.ay,color:P(e.color,l(t),.3),alpha:.62,water:o}}function B(e,o){let t=[];return e.trees.forEach((r,a)=>{let i=x(o,200+a);for(let s=0;s<r.count;s+=1)t.push(ae(r,i))}),e.town&&t.push(...se(e.town,x(o,300))),t.sort((r,a)=>r.foot-a.foot),[...t.filter(({foot:r})=>r<e.water.near-.02).map(({foot:r,dab:a})=>ce(a,Math.max(r,e.shore.y),e.water.deep)),...t.map(({dab:r})=>r)]}var N=1,y=512,p=4;function ue(e,o){let t=0;for(let[n,r,a]of e){let i=Math.abs(o-n)/a,s=.5/(1+3*i*i)+.5*Math.max(0,1-.8*i);t=Math.max(t,r*s)}return t}function fe(e,o,t){let n=x(o,100+t),r=e.peaks.map(([s,c])=>{let u=e.base-c+n.within(-.008,.008);return[s+n.within(-.02,.02),u,u*n.within(1.1,1.6)]}),a=r.reduce((s,c)=>s+c[1],0)/Math.max(r.length,1),i=2+Math.floor(n()*3);for(let s=0;s<i;s+=1){let c=a*n.within(.25,.55);r.push([n.within(e.x[0],e.x[1]),c,c*n.within(1.2,2)])}return r}function le(e,o,t){let n=fe(e,o,t),r=new Float32Array(y),a=v(o,900+t);for(let i=0;i<y;i+=1){let s=i/(y-1),c=Math.min(1,Math.max(0,(s-e.x[0])/.08),Math.max(0,(e.x[1]-s)/.08)),u=ue(n,s)*c*c*(3-2*c),f=(F(a,s*26)-.5)*.014+(F(a+1,s*97)-.5)*.005;u+=f*e.rough*Math.min(1,u*12),r[i]=u>5e-4?e.base-u:e.base+.004}return r}var h=(...e)=>new Float32Array(e.flatMap(o=>typeof o=="number"?[o]:[...o])),de=(e,o)=>[e.angle,e.length*o,e.width*o,e.opacity];function me(e,o){let t=new Float32Array(p*3),n=new Float32Array(p*3),r=new Float32Array(p*4);return e.ranges.forEach((a,i)=>{t.set(l(a.lit),i*3),n.set(l(a.shade),i*3);let s=a.depth*o;r.set([s,a.base,.0012+s*.0011,.05],i*4)}),[["uRangeLit",3,t],["uRangeShade",3,n],["uRangeInfo",4,r],["uRanges",1,h(e.ranges.length)]]}function he(e,o){let{sky:t,shore:n,water:r,ground:a,strokes:i}=e,s=o.seed,c=h(v(s,1)%997*.37,v(s,2)%991*.41),u=[i.sky,i.ridges,i.shore,i.water,i.ground];return[["uAspect",1,h(e.aspect)],["uSeedOff",2,c],["uHaze",3,h(l(e.haze))],["uHazeStep",1,h(e.hazeStep)],["uSkyTop",3,h(l(t.top))],["uSkyLow",3,h(l(t.low))],["uSkyCorner",3,h(l(t.corner))],["uCloudLit",3,h(l(t.cloudLit))],["uCloudShade",3,h(l(t.cloudShade))],["uCloud",4,h(t.band[0],t.band[1],t.centre,t.cover-o.clouds*.4)],...me(e,o.haze),["uShore",4,h(n.top,n.y,r.near,.6*o.haze)],["uShoreCol",3,h(l(n.color))],["uShoreLit",3,h(l(n.lit))],["uWaterFar",3,h(l(r.far))],["uWaterDeep",3,h(l(r.deep))],["uSheen",3,h(l(r.sheen))],["uGround",3,h(l(a.color))],["uGroundWarm",3,h(l(a.warm))],["uGroundDark",3,h(l(a.dark))],["uStroke",4,new Float32Array(u.flatMap(f=>de(f,e.aspect)))],["uFinish",4,h(e.weave*e.aspect,e.vignette,o.haze,0)]]}function be(e,o){let t=n=>{throw new RangeError(`plate-painter: ${n}`)};e.aspect>0||t("aspect must be above 0."),e.ranges.length>p&&t(`at most ${p} ranges.`),(!Number.isInteger(o.seed)||o.seed<0)&&t("seed must be a whole number from 0."),o.haze>=0&&o.haze<=2||t("haze must be within 0..2."),o.clouds>=-.5&&o.clouds<=.5||t("clouds must be within -0.5..0.5."),e.shore.y<e.water.near||t("the water's near edge must be below the shore.")}function pe(e,o={}){let t={seed:o.seed??0,haze:o.haze??1,clouds:o.clouds??0,foliage:o.foliage??!0};be(e,t);let n=new Float32Array(y*p).fill(1);e.ranges.forEach((u,f)=>{n.set(le(u,t.seed,f),f*y)});let r=he(e,t),a=D(B(e,t.seed)),i=D(t.foliage?O(e,t.seed):[]),s=new Float32Array(r.map(([u])=>u.length));return{digest:U([h(N),s,...r.map(([,,u])=>u),n,a,i]),aspect:e.aspect,uniforms:r,ridges:n,scene:a,foliage:i}}var T=`#version 300 es
precision highp float;
precision highp int;
uniform vec4 uView;
uniform vec2 uSize;
uniform float uAspect;
uniform vec2 uSeedOff;
uniform vec3 uHaze;
uniform float uHazeStep;
uint hashU(ivec2 p) {
  uvec2 q = uvec2(p) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  n ^= n >> 16; n *= 2246822519u; n ^= n >> 13;
  return n;
}
float rnd(vec2 c) { return float(hashU(ivec2(floor(c))) >> 8) / 16777216.0; }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(rnd(i), rnd(i + vec2(1, 0)), u.x), mix(rnd(i + vec2(0, 1)), rnd(i + 1.), u.x), u.y);
}
float fbm(vec2 p, int oct) {
  float s = 0.;
  float a = .5;
  float t = 0.;
  for (int k = 0; k < 6; k++) {
    if (k >= oct) break;
    s += a * vnoise(p); t += a;
    p = p * 2.03 + vec2(17.1, 9.3); a *= .5;
  }
  return s / t;
}
float hazeOf(float depth) { return 1. - pow(1. - uHazeStep, depth); }
vec2 plateUv() { return uView.xy + gl_FragCoord.xy / uSize * uView.zw; }
`,A=`#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}`,V=`${T}
uniform vec3 uSkyTop, uSkyLow, uSkyCorner, uCloudLit, uCloudShade;
uniform vec4 uCloud;
uniform highp sampler2D uRidge;
uniform float uRanges;
uniform vec3 uRangeLit[4];
uniform vec3 uRangeShade[4];
uniform vec4 uRangeInfo[4];
uniform vec4 uShore;
uniform vec3 uShoreCol, uShoreLit, uWaterFar, uWaterDeep, uSheen, uGround, uGroundWarm, uGroundDark;
out vec4 outColor;
float crest(int i, float u) {
  float x = clamp(u, 0., 1.) * 511.;
  int k = int(x);
  float a = texelFetch(uRidge, ivec2(k, i), 0).r;
  float b = texelFetch(uRidge, ivec2(min(k + 1, 511), i), 0).r;
  return mix(a, b, x - float(k));
}
vec3 sky(vec2 uv, int oct) {
  vec2 p = vec2(uv.x * uAspect, uv.y);
  float t = clamp(uv.y / uShore.x, 0., 1.);
  vec3 c = mix(uSkyTop, uSkyLow, smoothstep(0., 1., t));
  float corner = clamp((1. - uv.x * 1.5) * (1. - t * 1.3), 0., 1.);
  c = mix(c, uSkyCorner, corner * corner);
  c = mix(c, uSkyLow * 1.04, exp(-(uv.x - uCloud.z) * (uv.x - uCloud.z) * 4.84) * smoothstep(.05, .35, uv.y) * .35);
  vec2 cp = p * vec2(1.3, 2.6) + uSeedOff;
  vec2 warp = vec2(fbm(cp * .5, 3), fbm(cp * .5 + 7.3, 3));
  float n = fbm(cp + warp * 1.4, oct);
  float band = smoothstep(uCloud.x - .1, uCloud.x + .05, uv.y) * (1. - smoothstep(uCloud.y - .06, uCloud.y + .14, uv.y));
  float side = exp(-(uv.x - uCloud.z) * (uv.x - uCloud.z) * 3.24);
  float d = smoothstep(uCloud.w, uCloud.w + .3, n * (.55 + .45 * band) + band * side * .22);
  float toward = fbm(cp + warp * 1.4 + vec2(-.05, -.08), oct);
  float lit = clamp((n - toward) * 7. + .5, 0., 1.);
  c = mix(c, mix(uCloudShade, uCloudLit, lit), d * .88);
  float streak = fbm(vec2(p.x * 1.2, p.y * 26.) + uSeedOff * 1.7, 3);
  float low = smoothstep(uShore.x - .24, uShore.x - .14, uv.y) * (1. - smoothstep(uShore.x - .12, uShore.x - .04, uv.y));
  return mix(c, uCloudLit, smoothstep(.55, .75, streak) * low * .3);
}
vec3 ranges(vec2 uv, vec3 c, inout int code) {
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uRanges) break;
    vec4 info = uRangeInfo[i];
    float top = crest(i, uv.x);
    float dry = vnoise(vec2(uv.x * uAspect * 600., uv.y * 200.) + float(i) * 13.);
    float a = smoothstep(-info.z, info.z, uv.y - top + (dry - .5) * info.z * 1.6);
    if (a <= 0.) continue;
    float below = max(uv.y - top, 0.);
    float win = .014 + below * .9;
    float slope = (crest(i, uv.x + win) - crest(i, uv.x - win)) / (2. * win);
    float gx = uv.x + below * clamp(-slope, -1.2, 1.2) * .7;
    float spur = vnoise(vec2(gx * uAspect * 26., below * 5.) + uSeedOff + float(i) * 5.);
    float fine = vnoise(vec2(gx * uAspect * 90., below * 16.) + uSeedOff);
    float face = smoothstep(0., 1., .5 - slope * 1.1 + (spur - .5) * .5 + (fine - .5) * .16);
    face = mix(face, .42, smoothstep(.0, .09, below) * .25);
    vec3 col = mix(uRangeShade[i], uRangeLit[i], smoothstep(.1, .9, face));
    float wood = smoothstep(.45, .8, vnoise(vec2(uv.x * uAspect * 240., uv.y * 330.) + uSeedOff));
    col *= 1. - wood * .22 * (1. - smoothstep(.8, 1.6, info.x));
    col = mix(col, uHaze, hazeOf(info.x));
    float mist = smoothstep(info.y - info.w, info.y, uv.y);
    col = mix(col, mix(uHaze, uSkyLow, .4), mist * .5);
    c = mix(c, col, a);
    if (a > .5) code = 16 + (slope < 0. ? 0 : 1);
  }
  return c;
}
vec3 shore(vec2 uv, vec3 c, inout int code) {
  float top = uShore.x + (fbm(vec2(uv.x * uAspect * 7., 3.1) + uSeedOff, 3) - .5) * .016;
  float a = smoothstep(top - .0012, top + .0012, uv.y);
  if (a <= 0.) return c;
  float s = fbm(vec2(uv.x * uAspect * 26., uv.y * 260.) + uSeedOff, 3);
  float lit = smoothstep(.42, .72, s) * (1. - smoothstep(top, uShore.y, uv.y) * .7);
  vec3 col = mix(mix(uShoreCol, uGround, .25), uShoreLit, lit);
  col = mix(col, uHaze, hazeOf(uShore.w));
  if (a > .5) code = 32;
  return mix(c, col, a);
}
vec3 above(vec2 uv, int oct, inout int code) {
  return shore(uv, ranges(uv, sky(uv, oct), code), code);
}
vec3 water(vec2 uv) {
  float t = clamp((uv.y - uShore.y) / (uShore.z - uShore.y), 0., 1.);
  vec3 w = mix(uWaterFar, uWaterDeep, smoothstep(0., 1., t));
  float rip = vnoise(vec2(uv.x * uAspect * 8., uv.y * 240.) + uSeedOff) - .5;
  vec2 m = vec2(uv.x + rip * .014 * (.3 + t), 2. * uShore.y - uv.y + rip * .004);
  int ignore = 0;
  vec3 refl = (above(m, 2, ignore) + above(m + vec2(0., .008 + .02 * t), 1, ignore)) * .5;
  vec3 c = mix(w, refl * vec3(.88, .94, .95), mix(.72, .3, t));
  float sheen = exp(-(uv.y - uShore.y) / .014) * smoothstep(.3, .7, vnoise(vec2(uv.x * uAspect * 12., uv.y * 420.)));
  c = mix(c, uSheen, sheen * .55);
  float line = smoothstep(.64, .82, vnoise(vec2(uv.x * uAspect * 2.5, uv.y * 520.) + uSeedOff * 2.));
  return mix(c, mix(c, uSheen, .4), line * (1. - t) * .7);
}
vec3 ground(vec2 uv) {
  float t = clamp((uv.y - uShore.z) / (1. - uShore.z), 0., 1.);
  vec3 c = mix(uGround, uGroundDark, smoothstep(0., .6, t));
  c = mix(c, uGroundWarm, smoothstep(.5, 1., uv.x) * smoothstep(.15, .9, t) * .8);
  float grass = fbm(vec2(uv.x * uAspect * 9., uv.y * 70.) + uSeedOff, 4);
  c *= .84 + .3 * grass;
  vec2 bp = vec2(uv.x * uAspect * 6., uv.y * 11.) + uSeedOff * 1.3;
  float shrub = fbm(bp, 5) + t * .12;
  float toward = fbm(bp + vec2(-.12, -.18), 5) + t * .12;
  float m = smoothstep(.46, .6, shrub) * (1. - t * .5);
  float lit = clamp((shrub - toward) * 6. + .4, 0., 1.);
  vec3 bush = mix(uGroundDark * .8, uGround * 1.12, lit) * (.9 + .2 * grass);
  return mix(c, bush, m * .8);
}
void main() {
  vec2 uv = plateUv();
  int code = 0;
  vec3 c = above(uv, 5, code);
  float wa = smoothstep(uShore.y - .0008, uShore.y + .0008, uv.y);
  if (wa > 0.) {
    c = mix(c, water(uv), wa);
    if (wa > .5) code = 48;
    float edge = uShore.z + (fbm(vec2(uv.x * uAspect * 3., 8.7) + uSeedOff, 4) - .5) * .045;
    float ga = smoothstep(edge - .003, edge + .003, uv.y);
    c = mix(c, ground(uv), ga);
    if (ga > .5) code = 64;
  }
  outColor = vec4(c, float(code) / 255.);
}`,X=`${T}
uniform sampler2D uBase;
uniform vec4 uStroke[5];
out vec4 outColor;
vec2 toSt(vec2 q) { return (vec2(q.x / uAspect, q.y) - uView.xy) / uView.zw; }
void main() {
  vec2 st = gl_FragCoord.xy / uSize;
  vec4 b = texture(uBase, st);
  int code = int(b.a * 255. + .5);
  int region = min(code / 16, 4);
  vec4 S = uStroke[region];
  float ang = (code == 17) ? -S.x : S.x;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 across = vec2(-dir.y, dir.x);
  vec2 uv = plateUv();
  vec2 q = vec2(uv.x * uAspect, uv.y);
  vec2 r = vec2(dot(q, dir), dot(q, across));
  vec2 cell = S.yz;
  vec3 under = b.rgb;
  float wsum = 1.;
  for (int k = 1; k <= 3; k++) {
    for (int sgn = -1; sgn <= 1; sgn += 2) {
      vec3 s = texture(uBase, toSt(q + dir * float(k * sgn) * cell.x * .09)).rgb;
      float w = exp(-dot(s - b.rgb, s - b.rgb) * 400.);
      under += s * w; wsum += w;
    }
  }
  under /= wsum;
  vec2 c0 = floor(r / cell);
  float best = -1.;
  float cov = 0.;
  vec2 bd = vec2(0);
  vec2 bc = vec2(0);
  float bh = 0.;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = c0 + vec2(i, j);
      uint h = hashU(ivec2(id) + ivec2(code * 7919, code * 104729));
      vec4 hv = vec4(float(h & 255u), float((h >> 8) & 255u), float((h >> 16) & 255u), float(h >> 24)) / 255.;
      vec2 ctr = (id + .5 + (hv.xy - .5) * vec2(.9, .7)) * cell;
      vec2 hs = cell * vec2(.6 + .6 * hv.z, .5 + .35 * hv.w);
      vec2 d = (r - ctr) / hs;
      float taper = max(1. - .3 * d.x * d.x, .2);
      float m = 1. - smoothstep(.7, 1., length(vec2(d.x, d.y / taper)));
      float z = fract(hv.x * 7.13 + hv.w * 3.7);
      if (m > 0. && z > best) { best = z; cov = m; bd = d; bc = ctr; bh = hv.z; }
    }
  }
  vec3 col = under;
  if (cov > 0.) {
    vec4 sc = texture(uBase, toSt(bc.x * dir + bc.y * across));
    float own = (1. - smoothstep(.04, .12, length(sc.rgb - b.rgb))) * step(abs(sc.a - b.a), .001);
    vec3 paint = mix(under, sc.rgb, own);
    paint *= 1. + (bh - .5) * .07;
    paint += (fract(bh * 13.7) - .5) * vec3(.022, .004, -.02);
    float bristle = .72 + .28 * vnoise(vec2(bd.x * 1.3, bd.y * 6. + bh * 31.));
    col = mix(under, paint, cov * S.w * bristle);
  }
  outColor = vec4(col, b.a);
}`,q=`${T}
uniform sampler2D uPaint;
uniform vec4 uFinish;
out vec4 outColor;
void main() {
  vec3 c = texture(uPaint, gl_FragCoord.xy / uSize).rgb;
  vec2 uv = plateUv();
  vec2 q = vec2(uv.x * uAspect, uv.y);
  float g = fbm(q * 2.5 + uSeedOff * .3, 3) - .5;
  c = c * (1. + g * .07) + g * vec3(.012, 0., -.012);
  vec2 w = q / uFinish.x;
  float perPixel = uView.w / uSize.y / uFinish.x;
  vec2 cellW = floor(w);
  vec2 f = fract(w);
  float over = mod(cellW.x + cellW.y, 2.);
  float thread = mix(4. * f.y * (1. - f.y), 4. * f.x * (1. - f.x), over);
  float slub = rnd(over > .5 ? vec2(cellW.x, floor(cellW.y / 7.)) : vec2(floor(cellW.x / 7.), cellW.y) + 91.);
  float weave = (thread - .6) * (.6 + .8 * slub);
  float lum = dot(c, vec3(.3, .59, .11));
  c *= 1. + weave * .045 * smoothstep(.3, .7, lum) * (1. - smoothstep(.22, .34, perPixel));
  vec2 v = uv - .5;
  c *= 1. - uFinish.y * smoothstep(.12, .5, dot(v, v));
  c = vec3(.043, .055, .051) + c * (1. - vec3(.043, .055, .051));
  c = mix(c, c * vec3(1.025, 1., .965), smoothstep(.45, .9, lum));
  outColor = vec4(c, 1.);
}`,K=`#version 300 es
layout(location = 0) in vec4 aPos;
layout(location = 1) in vec4 aAxis;
layout(location = 2) in vec4 aCol;
layout(location = 3) in vec4 aMore;
uniform vec4 uView;
uniform float uAspect;
out vec2 vL;
out vec2 vUv;
flat out vec4 fPos;
flat out vec4 fAxis;
flat out vec4 fCol;
flat out vec4 fMore;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2. - 1.;
  vec2 ax = aAxis.xy;
  vec2 L = corner * 1.1;
  vec2 q = vec2(aPos.x * uAspect, aPos.y) + ax * L.x * aPos.z + vec2(-ax.y, ax.x) * L.y * aPos.w;
  vUv = vec2(q.x / uAspect, q.y);
  vL = L;
  fPos = aPos; fAxis = aAxis; fCol = aCol; fMore = aMore;
  gl_Position = vec4((vUv - uView.xy) / uView.zw * 2. - 1., 0., 1.);
}`,H=`${T}
in vec2 vL;
in vec2 vUv;
flat in vec4 fPos;
flat in vec4 fAxis;
flat in vec4 fCol;
flat in vec4 fMore;
out vec4 outColor;
vec2 leafSide(vec2 p, float seed, out float rib) {
  float x = p.x;
  float hw = fPos.w / fPos.z * .5 * 2.75 * x * (1. - x) * (1.5 - .5 * x) * smoothstep(1.02, .7, x * x);
  hw *= 1. - .035 * fract(x * 24. + seed * 7.);
  rib = abs(p.y);
  float d = max(abs(p.y) - hw, max(-x, x - 1.));
  float vein = abs(fract((x - abs(p.y) * 1.4) * 6. + seed) - .5);
  return vec2(d, smoothstep(.04, 0., vein - .44) * step(.03, abs(p.y)));
}
vec2 leafHand(vec2 p, float seed, float lobes, out float rib) {
  vec2 v = p - vec2(.36, 0.);
  float a = atan(v.y, v.x);
  float r = length(v);
  float R = .22;
  rib = 9.;
  for (int k = 0; k < 5; k++) {
    if (float(k) >= lobes) break;
    float side = (k % 2 == 1) ? 1. : -1.;
    float phi = side * float((k + 1) / 2) * (lobes > 3. ? .8 : .95);
    float len = .64 - .14 * float((k + 1) / 2);
    float t = abs(a - phi) / .74;
    R = max(R, len * pow(max(0., 1. - t), .55));
    rib = min(rib, r * abs(sin(a - phi)) + step(1.2, abs(a - phi)));
  }
  R *= 1. - .035 * fract(a * 13. + seed * 5.);
  return vec2(r - R, 0.);
}
vec4 leaf() {
  vec2 p = vec2((vL.x + 1.) * .5, vL.y * fPos.w / fPos.z * .5);
  float rib;
  vec2 s = fMore.y < 2. ? leafSide(p, fAxis.w, rib) : leafHand(p, fAxis.w, fMore.y, rib);
  float aa = fwidth(s.x) * .8;
  float alpha = 1. - smoothstep(-aa, aa, s.x);
  vec2 lightDir = normalize(vec2(-1., -1.3));
  float L = fMore.x;
  float fold = dot(vec2(-fAxis.y, fAxis.x), lightDir) * sign(p.y) * .5 + .5;
  float inner = clamp(-s.x / .07, 0., 1.);
  vec3 c = fCol.rgb * mix(.74, 1.12, fold * (.45 + .55 * L));
  c *= .86 + .28 * vnoise(vec2(p.x * 3., p.y * 6.) + fAxis.w * 60.);
  float streak = vnoise(vec2(p.x * 5., p.y * 42.) + fAxis.w * 30.);
  c *= .92 + .16 * streak;
  c += (vnoise(vec2(p.x * 2.5, p.y * 14.) + fAxis.w * 17.) - .5) * vec3(.05, .035, -.03);
  c += vec3(.05, .06, .045) * L * fold * inner * (1. - inner) * 4. * smoothstep(.15, .6, p.x);
  float line = (1. - smoothstep(.002, .009, rib)) * smoothstep(0., .06, p.x) * (1. - .7 * p.x);
  vec3 vein = mix(c * .66, c * 1.22 + .02, smoothstep(.2, .6, L));
  c = mix(c, vein, line * (fMore.y < 2. ? .7 : .4) + s.y * .2 * inner);
  c = mix(c, c * .8, (1. - smoothstep(0., .012, -s.x)) * (1. - L) * .6);
  return vec4(c, alpha);
}
vec4 spire() {
  float t = (vL.x + 1.) * .5;
  float w = (1. - t) * (.62 + 1.5 * t) * (.8 + .4 * vnoise(vec2(t * 16., vL.y * 2.) + fAxis.w * 40.));
  float d = max(abs(vL.y) - w, -vL.x - 1.);
  float aa = fwidth(d) * (1. + fMore.w * 2.5);
  float lit = smoothstep(.4, -.7, vL.y / max(w, .05)) * fMore.x;
  vec3 c = fCol.rgb * (.75 + .6 * lit) * (.85 + .3 * vnoise(vL * vec2(9., 3.) + fAxis.w * 30.));
  return vec4(c, 1. - smoothstep(-aa, aa, d));
}
vec4 crown() {
  float n = vnoise(vL * 2.4 + fAxis.w * 40.) * .65 + vnoise(vL * 6. + fAxis.w * 13.) * .35;
  float d = max(length(vL * vec2(1., 1.1)) - (.66 + .38 * n), -vL.x - .8);
  float aa = fwidth(d) * (1. + fMore.w * 2.5);
  float lit = clamp(.5 + .6 * dot(normalize(vL + .001), normalize(vec2(.7, -.7))), 0., 1.) * fMore.x;
  vec3 c = fCol.rgb * (.72 + .6 * lit) * (.85 + .3 * vnoise(vL * 7. + fAxis.w * 20.));
  return vec4(c, 1. - smoothstep(-aa, aa, d));
}
vec4 wall() {
  float d = max(abs(vL.x), abs(vL.y)) - 1.;
  float aa = fwidth(d) * (1. + fMore.w * 1.5);
  float side = smoothstep(1. - 2. * fMore.y - .08, 1. - 2. * fMore.y + .08, vL.y);
  vec3 c = fCol.rgb * mix(.8 + .15 * fMore.x, .72, side);
  c *= 1. - .25 * smoothstep(.7, .85, vL.x);
  c *= .95 + .1 * vnoise(vL * vec2(3., 5.) + fAxis.w * 20.);
  return vec4(c, 1. - smoothstep(-aa, aa, d));
}
vec4 blot() {
  float n = vnoise(vL * 2.2 + fAxis.w * 50.);
  float d = length(vL) + (n - .5) * .45;
  vec3 c = fCol.rgb * (.85 + .3 * vnoise(vL * 5. + fAxis.w * 9.));
  return vec4(c, 1. - smoothstep(.72, .95, d));
}
vec4 stem() {
  float d = abs(vL.y) - 1.;
  float aa = fwidth(d) * .9;
  vec3 c = fCol.rgb * (1. + .4 * smoothstep(.2, -.8, vL.y));
  return vec4(c, (1. - smoothstep(-aa, aa, d)) * smoothstep(1.1, .9, abs(vL.x)));
}
void main() {
  int kind = int(fAxis.z + .5);
  vec4 s = kind == 0 ? blot() : kind == 1 ? spire() : kind == 2 ? crown() : kind == 3 ? wall() : kind == 4 ? leaf() : stem();
  if (fMore.z > 0.) {
    if (vUv.y < fMore.z) discard;
    s.a *= .55 + .45 * smoothstep(.25, .6, vnoise(vec2(vUv.x * uAspect * 60., vUv.y * 900.)));
    s.a *= 1. - .6 * smoothstep(0., fPos.z * 2.4, vUv.y - fMore.z);
  }
  vec3 c = mix(s.rgb, uHaze, hazeOf(fMore.w));
  outColor = vec4(c, s.a * fCol.a);
}`,j=`#version 300 es
precision highp float;
uniform sampler2D uPlate;
uniform vec4 uCrop;
uniform vec4 uRect;
out vec4 outColor;
void main() {
  vec2 f = (gl_FragCoord.xy - uRect.xy) / uRect.zw;
  outColor = vec4(texture(uPlate, uCrop.xy + vec2(f.x, 1. - f.y) * uCrop.zw).rgb, 1.);
}`;function Y(e,o,t={}){let n=Math.max(t.zoom??1,1),r=(o>e?1:o/e)/n,a=(o>e?e/o:1)/n,[i,s]=t.focus??[.5,.5],[c,u]=t.shift??[0,0],f=(d,m)=>Math.min(Math.max(d,0),m);return[f(i-r/2+c*r,1-r),f(s-a/2+u*a,1-a),r,a]}function E(e,o,t){let n=e.createProgram();for(let[r,a]of[[e.VERTEX_SHADER,o],[e.FRAGMENT_SHADER,t]]){let i=e.createShader(r);if(!i)throw new Error("plate-painter: no shader.");e.shaderSource(i,a),e.compileShader(i),e.attachShader(n,i),e.deleteShader(i)}if(e.linkProgram(n),!e.getProgramParameter(n,e.LINK_STATUS)){let a=(e.getAttachedShaders(n)??[]).map(i=>e.getShaderInfoLog(i)??"").join(`
`);throw new Error(`plate-painter: a pass did not compile.
${e.getProgramInfoLog(n)??""}
${a}`)}return n}function ve(e,o,t){for(let[n,r,a]of t){let i=e.getUniformLocation(o,n)??e.getUniformLocation(o,`${n}[0]`);i&&(r===1?e.uniform1fv(i,a):r===2?e.uniform2fv(i,a):r===3?e.uniform3fv(i,a):e.uniform4fv(i,a))}}function Z(e,o,t){let n=e.createTexture();e.bindTexture(e.TEXTURE_2D,n);let r=t?e.NEAREST:e.LINEAR;return e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,r),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,r),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),t?(e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.texImage2D(e.TEXTURE_2D,0,e.R32F,o.width,o.height,0,e.RED,e.FLOAT,t)):e.texStorage2D(e.TEXTURE_2D,1,e.RGBA8,o.width,o.height),n}function $(e,o){let t=Z(e,o),n=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,n),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0),{texture:t,framebuffer:n}}function M(e){let o=e.getParameter(e.FRAMEBUFFER_BINDING),t=e.getParameter(e.VIEWPORT),n=e.getParameter(e.CURRENT_PROGRAM),r=e.getParameter(e.VERTEX_ARRAY_BINDING),a=e.getParameter(e.ACTIVE_TEXTURE),i=[e.BLEND,e.DEPTH_TEST,e.CULL_FACE,e.SCISSOR_TEST].map(u=>[u,e.isEnabled(u)]),s=e.getParameter(e.UNPACK_FLIP_Y_WEBGL);e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.activeTexture(e.TEXTURE0);let c=e.getParameter(e.TEXTURE_BINDING_2D);for(let[u]of i)e.disable(u);return()=>{e.bindTexture(e.TEXTURE_2D,c),e.activeTexture(a);for(let[u,f]of i)f?e.enable(u):e.disable(u);e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,s),e.bindFramebuffer(e.FRAMEBUFFER,o),e.viewport(t[0]??0,t[1]??0,t[2]??0,t[3]??0),e.useProgram(n),e.bindVertexArray(r)}}function xe(e,o){let t=o.length/R;if(t===0)return;let n=e.createVertexArray(),r=e.createBuffer();e.bindVertexArray(n),e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,o,e.STATIC_DRAW);for(let a=0;a<4;a+=1)e.enableVertexAttribArray(a),e.vertexAttribPointer(a,4,e.FLOAT,!1,R*4,a*16),e.vertexAttribDivisor(a,1);e.enable(e.BLEND),e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,t),e.disable(e.BLEND),e.bindVertexArray(null),e.deleteBuffer(r),e.deleteVertexArray(n)}function L(e,o,t,n){e.useProgram(o),ve(e,o,t);let r=e.getUniformLocation(o,"uBase")??e.getUniformLocation(o,"uPaint");r&&e.uniform1i(r,0);let a=e.getUniformLocation(o,"uRidge");a&&e.uniform1i(a,1),n?xe(e,n):e.drawArrays(e.TRIANGLES,0,3)}function ye(e,o,t,n){let r=Z(e,{width:y,height:p},t.ridges);e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,r),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,n.out.framebuffer),L(e,o.scene,n.uniforms),L(e,o.dab,n.uniforms,t.scene),e.bindFramebuffer(e.FRAMEBUFFER,n.work.framebuffer),e.bindTexture(e.TEXTURE_2D,n.out.texture),L(e,o.stroke,n.uniforms),L(e,o.dab,n.uniforms,t.foliage),e.bindFramebuffer(e.FRAMEBUFFER,n.out.framebuffer),e.bindTexture(e.TEXTURE_2D,n.work.texture),L(e,o.finish,n.uniforms),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.deleteTexture(r)}function we(e,o,t,n){let r=Y(t.width/t.height,n.width/n.height,n),[a,i]=[n.x??0,n.y??0];e.viewport(a,i,n.width,n.height),e.useProgram(o),e.uniform4f(e.getUniformLocation(o,"uCrop"),r[0],r[1],r[2],r[3]),e.uniform4f(e.getUniformLocation(o,"uRect"),a,i,n.width,n.height),e.uniform1i(e.getUniformLocation(o,"uPlate"),0),e.bindTexture(e.TEXTURE_2D,t.texture),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,3)}function Re(e){let o={scene:E(e,A,V),stroke:E(e,A,X),finish:E(e,A,q),dab:E(e,K,H),backdrop:E(e,A,j)},t=new Map,n=(r,a)=>[r,a.width,a.height,...a.view??[0,0,1,1]].join(",");return{paint(r,a){let i=n(r.digest,a),s=t.get(i);if(s)return s;let c=M(e),u=$(e,a),f=$(e,a),d=a.view??[0,0,1,1],m=[...r.uniforms,["uView",4,new Float32Array(d)],["uSize",2,new Float32Array([a.width,a.height])]];e.viewport(0,0,a.width,a.height),ye(e,o,r,{out:u,work:f,uniforms:m}),e.deleteFramebuffer(f.framebuffer),e.deleteTexture(f.texture),c();let w={texture:u.texture,framebuffer:u.framebuffer,width:a.width,height:a.height,digest:r.digest,view:d};return t.set(i,w),w},draw(r,a){let i=M(e);we(e,o.backdrop,r,a),i()},read(r){let a=[...t.values()].find(c=>c.texture===r.texture);if(!a)throw new Error("plate-painter: that plate was released or is not this painter's.");let i=new Uint8ClampedArray(r.width*r.height*4),s=M(e);return e.bindFramebuffer(e.FRAMEBUFFER,a.framebuffer),e.readPixels(0,0,r.width,r.height,e.RGBA,e.UNSIGNED_BYTE,i),s(),{width:r.width,height:r.height,data:i}},release(r){for(let[a,i]of t)i.texture===r.texture&&(e.deleteFramebuffer(i.framebuffer),e.deleteTexture(i.texture),t.delete(a))},dispose(){for(let r of[...t.values()])this.release(r);for(let r of Object.values(o))e.deleteProgram(r)}}}export{b as KIND,Q as LAKE_VALLEY,p as MAX_RANGES,N as PAINTER_VERSION,y as RIDGE_SAMPLES,R as STRIDE,Y as coverCrop,Re as createPlatePainter,pe as planPlate};
