// surfaces@0.1.0 from keel-modules 53c36d0 (MIT). Generated: don't edit.
var U=["veins","cracks","motif"],ne={kind:"paper",tone:"#dcdcd0",fleck:"#6f6d60",flecks:.14,stain:"#cfc8b2",stains:.35,cells:72,fibres:.5,mottle:.06,mottleScale:6,laid:0,chain:0,lines:.15,depth:.004},oe={kind:"knit",base:"#ff2f78",shadow:"#d91a5e",light:"#ff85ad",ribs:8,courses:18,knit:.62,twist:2.5,fuzz:.45,jitter:.35,depth:.025},ae={kind:"painted",ground:"#3f6b64",variation:.09,glaze:"#5a6a3c",glazeAmount:.16,brush:{axis:[1,-.35],length:14,amount:.1},jitter:.015,depth:.002,masses:[{at:[.1,.32],size:[.52,.2],axis:[.35,1],colour:"#a9a996",light:"#e8e6da",soft:.07,warp:.32,streak:.35,point:.3},{at:[.2,.06],size:[.34,.16],axis:[1,.3],colour:"#b4b3a0",light:"#e8e6da",soft:.07,warp:.28,streak:.35,point:.3},{at:[.04,.8],size:[.42,.08],axis:[.2,1],colour:"#2a4431",light:"#6f7f4a",soft:.07,warp:.12,streak:.3,point:1},{at:[.86,.1],size:[.34,.3],axis:[1,.25],colour:"#4a1d38",light:"#a83d6e",soft:.07,warp:.24,streak:.3,ring:!0},{at:[.65,.05],size:[.12,.09],axis:[1,.5],colour:"#6a2a4e",light:"#a83d6e",soft:.07,warp:.24,streak:.3,ring:!0},{at:[.82,.8],size:[.42,.12],axis:[1,-.55],colour:"#2a4431",light:"#7d8a4a",soft:.07,warp:.12,streak:.3,point:1},{at:[.42,.84],size:[.34,.06],axis:[1,-.8],colour:"#2a4431",light:"#6f7f4a",soft:.07,warp:.12,streak:.3,point:1},{at:[.66,.66],size:[.15,.06],axis:[.7,-1],colour:"#9a7a22",light:"#c9a233",soft:.07,warp:.24,streak:.35,point:.8},{at:[.3,.6],size:[.11,.05],axis:[.7,-1],colour:"#b7b39a",light:"#e8e6da",soft:.07,warp:.2,streak:.3,point:.7},{at:[.47,.98],size:[.11,.09],axis:[1,.2],colour:"#5e1520",light:"#8b1e2a",soft:.07,warp:.24,streak:.3,ring:!0}]},se={kind:"painted",ground:"#0e2b1d",variation:.06,glaze:"#14301f",glazeAmount:.2,brush:{axis:[1,.6],length:3,amount:.05},jitter:0,depth:.003,masses:[],folds:{axis:[1,.55],count:2.2,warp:.8,deep:"#0e2b1d",mid:"#2f5a3c",light:"#5c8a63",sheen:.5}};function A(e,r){let t=Math.imul(e^2654435769,2246822507)^Math.imul(r+1663821227,3266489909);return t=Math.imul(t^t>>>16,2146121005),t=Math.imul(t^t>>>15,2221713035),(t^t>>>16)>>>0}function V(e,r){let t=0;return(n,o)=>(t+=1,n+(o-n)*A(A(e,r),t)/4294967296)}function q(e,r,t=0){let n=1+t*t,o=(1-t*t)/n,a=2*t/n,u=e*o-r*a,i=e*a+r*o,s=Math.sqrt(u*u+i*i)||1;return[u/s,i/s]}function K(e){let r=2166136261,t=16777619;for(let n of e)for(let o of new Uint8Array(n.buffer,n.byteOffset,n.byteLength))r=Math.imul(r^o,16777619),t=Math.imul(t^o,16777629)^r>>>7;return(r>>>0).toString(16).padStart(8,"0")+(t>>>0).toString(16).padStart(8,"0")}var $=1,O=10,W=232,L={paper:0,knit:1,painted:2};function h(e,r,t,n){if(typeof e!="number"||!(e>=t&&e<=n))throw new RangeError(`surfaces: ${r} must be within ${t}..${n}.`);return e}function M(e,r,t,n){if(!Number.isInteger(e))throw new RangeError(`surfaces: ${r} must be a whole number within ${t}..${n}.`);return h(e,r,t,n)}function y(e,r,t){e.set(t,r)}function k(e){if(typeof e!="string"||!/^#[0-9a-f]{6}$/iu.test(e))throw new TypeError(`surfaces: ${JSON.stringify(e)} is not #rrggbb.`);let r=Number.parseInt(e.slice(1),16);return[(r>>16)/255,(r>>8&255)/255,(r&255)/255]}function j(e,r,t=0){let[n,o]=[h(e[0],r,-64,64),h(e[1],r,-64,64)];if(n===0&&o===0)throw new RangeError(`surfaces: ${r} must not be [0, 0].`);return q(n,o,t)}function ie(e,r){y(r,0,k(e.tone)),y(r,4,[...k(e.fleck),h(e.flecks,"flecks",0,1)]),y(r,8,[...k(e.stain),h(e.stains,"stains",0,1)]),y(r,12,[M(e.cells,"cells",4,512),h(e.fibres,"fibres",0,1),h(e.mottle,"mottle",0,1),M(e.mottleScale,"mottleScale",1,64)]),y(r,16,[M(e.laid,"laid",0,512),M(e.chain,"chain",0,64),h(e.lines,"lines",0,1)])}function ue(e,r){y(r,0,k(e.base)),y(r,4,[...k(e.shadow),M(e.ribs,"ribs",1,256)]),y(r,8,[...k(e.light),M(e.courses,"courses",1,256)]),y(r,12,[h(e.knit,"knit",.3,.9),h(e.twist,"twist",0,8),h(e.fuzz,"fuzz",0,1),h(e.jitter,"jitter",0,1)])}function ce(e,r,t,n){let o=V(n.seed,100+t),[a,u]=[h(e.at[0],"mass at",-.5,1.5),h(e.at[1],"mass at",-.5,1.5)],i=n.jitter;y(r,t,[(a+o(-i,i))*n.aspect,u+o(-i,i),h(e.size[0],"mass size",.005,2),h(e.size[1],"mass size",.005,2)]),y(r,t+4,[...j(e.axis,"mass axis",o(-i,i)*4),h(e.soft,"soft",.01,1),e.ring===!0?1:0]),y(r,t+8,[...k(e.colour),h(e.warp,"warp",0,2)]),y(r,t+12,[...k(e.light),h(e.streak,"streak",0,1)]),r[t+16]=h(e.point??0,"point",0,1)}function fe(e,r,t){if(e.masses.length>O)throw new RangeError(`surfaces: at most ${O} masses.`);y(r,0,k(e.ground)),y(r,4,[...k(e.glaze),h(e.glazeAmount,"glazeAmount",0,1)]),y(r,8,[...j(e.brush.axis,"brush axis"),h(e.brush.length,"brush length",1,64),h(e.brush.amount,"brush amount",0,1)]),y(r,12,[t.aspect,e.masses.length,h(e.variation,"variation",0,1)]);let n=e.folds;n&&(y(r,16,[...k(n.deep),h(n.count,"fold count",.5,16)]),y(r,20,[...k(n.mid),h(n.warp,"fold warp",0,2)]),y(r,24,[...k(n.light),h(n.sheen,"sheen",0,1)]),y(r,28,j(n.axis,"fold axis")));let o={...t,jitter:h(e.jitter,"jitter",0,.2)};e.masses.forEach((a,u)=>{ce(a,r,32+u*20,o)})}var me=e=>e.kind in L;function F(e,r={}){let t=e.kind;if(U.includes(t))throw new RangeError(`surfaces: ${t} is planned, not built yet.`);if(!me(e))throw new RangeError(`surfaces: no painter for ${JSON.stringify(t)}.`);let n=M(r.seed??0,"seed",0,2147483647),o=M(r.width??1024,"width",1,4096),a=M(r.height??o,"height",1,4096),u=h(e.depth,"depth",0,4),i=new Float32Array(W);i[3]=A(n,L[e.kind])>>>12,e.kind==="paper"?ie(e,i):e.kind==="knit"?ue(e,i):fe(e,i,{aspect:o/a,seed:n});let s=Float32Array.of(L[e.kind],o,a,u,$);return{kind:e.kind,width:o,height:a,depth:u,uniforms:i,digest:K([i,s])}}var N=e=>e-Math.floor(e),z=(e,r=0,t=1)=>Math.min(Math.max(e,r),t),S=(e,r,t)=>e+(r-e)*t;function R(e,r,t){let n=z((t-e)/(r-e));return n*n*(3-2*n)}var I=(e,r,t,n)=>(e+t)%t+((r+n)%n<<12),C=(e,r,t,n)=>A(I(e,r,t,t),n)/4294967296;function _(e,r,t,n){let o=Math.floor(e),a=Math.floor(r),[u,i]=[e-o,r-a],[s,f]=[u*u*(3-2*u),i*i*(3-2*i)],c=C(o,a,t,n),m=C(o+1,a,t,n),d=C(o,a+1,t,n),l=C(o+1,a+1,t,n),p=c+(m-c)*s;return p+(d+(l-d)*s-p)*f}function T(e,r,t,n){let[o,a,u,i,s,f]=[0,.5,0,e,r,t];for(let c=0;c<n.n;c+=1)o+=a*_(i,s,f,n.s+c),u+=a,[i,s,f,a]=[i*2,s*2,f*2,a*.5];return o/u}function B(e,r,t,n){let[o,a]=[e*t,r*t],[u,i]=[Math.floor(o),Math.floor(a)],s=[0,0];for(let f=-1;f<=1;f+=1)for(let c=-1;c<=1;c+=1){let m=I(u+c,i+f,t,t),[d,l]=[A(m,n.s),A(m,n.s+1)],[p,x]=[(l>>>16)/65536-.5,(l&65535)/65536-.5],b=Math.max(Math.sqrt(p*p+x*x),1e-4);[p,x]=[p/b,x/b];let[g,v]=[o-(u+c+(d>>>16)/65536),a-(i+f+(d&65535)/65536)],E=z(g*p+v*x,-n.len,n.len),w=1-R(n.wid*.5,n.wid,Math.hypot(g-p*E,v-x*E));w>s[0]&&(s=[w,(l&255)/255])}return s}var X=(e,r)=>1-R(0,r,Math.abs(N(e)-.5));function de(e,r,t,n){let[o,a]=[e*t,r*t],[u,i]=[Math.floor(o),Math.floor(a)],s=A(I(u,i,t,t),n.s);if((s&1023)/1024>=n.density)return 0;let[f,c]=[u+.3+.4*(s>>>22&1023)/1024,i+.3+.4*(s>>>12&1023)/1024],m=.04+.06*(s>>>10&3);return 1-R(m*.5,m,Math.hypot(o-f,a-c))}var le=(e,r,t,n)=>{let o=e(3),[a,u,i,s,f]=[e(12),e(15),e(13),e(14),e(18)],c=T(r*u,t*u,u,{s:o,n:4}),m=_(r*a*4,t*a*4,a*4,o+5),d=B(r,t,a,{s:o+10,len:.9,wid:.1}),l=B(r,t,a*2,{s:o+20,len:.8,wid:.12}),p=(e(16)>0?.6*X(t*e(16),.12):0)+(e(17)>0?X(r*e(17),.03):0),x=.5*c+.15*m+i*(.6*d[0]+.4*l[0])+f*p,b=(1+s*((c-.5)*2+(m-.5)*.6))*(1+i*(d[0]*(.03-.6*R(.95,.99,d[1]))+.03*l[0]))*(1+f*.08*p),g=T(r*3,t*3,3,{s:o+30,n:4}),v=R(.6,.66,g),E=e(11)*(.35*v+.5*v*(1-R(.66,.7,g))),w=de(r,t,a*3,{s:o+40,density:e(7)});for(let P=0;P<3;P+=1)n[P]=S(S(e(P)*b,e(8+P),E),e(4+P),w);return x};function be(e,r,t,n){let[o,a,u,i]=r,[s,f]=[u-o,i-a],c=z(((e[0]-o)*s+(e[1]-a)*f)/(s*s+f*f)),[m,d]=[e[0]-o-s*c,e[1]-a-f*c],l=Math.hypot(m,d)/t,p=(m*f-d*s)/(Math.hypot(s,f)*t),x=Math.abs(N(c*n+p*.35)-.5)*2;return[Math.sqrt(Math.max(0,1-l*l))*(.8+.8*c*(1-c)),x]}function pe(e,r,t){let[n,o,a]=[e(7),e(11),e(15)],u=o/n,i=e(12)*.5*u,[s,f]=[r*n,t*o],c=Math.floor(s),m=(s-c-.5)*u,d=[0,.5,.5];for(let g=-1;g<=1;g+=1){let v=Math.floor(f)+g,E=A(I(c,v,n,o),e(3)),w=a*((E&255)/255-.5);for(let P of[-1,1]){let te=[P*i*.72,-.18,P*i*.06,1.08],[G,re]=be([m+w*.06*u,f-v],te,i*.46,e(13));G*(1+.3*w)>d[0]&&(d=[G*(1+.3*w),re,(E>>>24)/255])}}let l=Math.max(.5*u-i,.001),[p,x]=[(.5*u-Math.abs(m))/l,(N(f)-.5)/.32],b=.4*Math.sqrt(Math.max(0,1-p*p-x*x));return[Math.max(d[0],b)+.12*(d[1]-.5)*d[0],d[1],d[2]]}var he=(e,r,t,n)=>{let[o,a,u]=[e(3),e(7),e(14)],[i,,s]=pe(e,r,t),f=T(r*a*16,t*a*16,a*16,{s:o+30,n:2}),c=B(r,t,a*12,{s:o+40,len:.6,wid:.08})[0],m=i*(1-.1*u)+u*(.1*f+.2*c),d=z(m);for(let l=0;l<3;l+=1){let[p,x,b]=[e(l),e(4+l),e(8+l)],g=S(S(x,p,R(.08,.6,d)),b,.6*R(.62,1,d))*(.96+.08*s);n[l]=S(g,b,u*.3*c)}return m};function xe(e,r,t,n){let[o,a]=[e(28),e(29)],[u,i]=[0,0];for(let c=0;c<3;c+=1){let m=1/(1+1.6*c),[d,l]=[o-a*(c-1)*.35,a+o*(c-1)*.35],p=Math.hypot(d,l),x=e(23)*T(r[0]*(1.5+c),r[1]*(1.5+c),1024,{s:t+10+c*4,n:3}),b=N((r[0]*d+r[1]*l)/p*e(19)*(1+.45*c)+x);u+=Math.cos(3.1415927*b)*m,i=Math.max(i,Math.sin(3.1415927*b)*m)}let s=z(.5+.3*u),f=R(.7,1,s)*i;for(let c=0;c<3;c+=1){let[m,d,l]=[e(16+c),e(20+c),e(24+c)];n[c]=S(S(m,d,R(.15,.6,s)),l,R(.6,.95,s))+e(27)*f*f*l}}function ye(e,r,t,n){let o=32+r*20,a=w=>e(o+w),[u,i,s,f,c,m]=[a(0),a(1),a(2),a(3),a(4),a(5)],[d,l]=[t.p[0]-u,t.p[1]-i],p=(d*c+l*m)/s,x=(l*c-d*m)/f/Math.max(S(1,Math.sqrt(Math.max(1-p*p,0)),a(16)),.05);if(Math.hypot(p,x)>1+.5*a(11))return[0,0];let b=Math.hypot(p,x)+a(11)*(T(t.p[0]*9,t.p[1]*9,1024,{s:t.s+60+r,n:4})-.5),g=1-R(1-a(6),1,b),v=a(7)>0?N(b*2.6+1.1*T((Math.atan2(x,p)/6.2831853+.5)*6,b,6,{s:t.s+80+r,n:2})):.6*T(p*2+r*7,x*4,1024,{s:t.s+80,n:2})+.4*_(p*3,x*14,1024,t.s+90),E=z(.5-.4*x+a(15)*(v-.5)*2);for(let w=0;w<3;w+=1){let P=S(a(8+w),a(12+w),R(.2,.9,E))*(.85+.15*(1-b*b));n[w]=S(n[w]??0,P,g)}return[v,g]}var we=(e,r,t,n)=>{let o=e(3),a=[r*e(12),t],[u,i,s,f]=[e(8),e(9),e(10),e(11)],c=T((a[0]*u+a[1]*i)*s,(a[1]*u-a[0]*i)*s*4,1024,{s:o,n:3}),m=_(a[0]*240,a[1]*240,1024,o+7)-.5,d=1+e(14)*(T(a[0]*3,a[1]*3,1024,{s:o+1,n:3})-.5)*2;for(let b=0;b<3;b+=1)n[b]=e(b)*d;e(19)>0&&xe(e,a,o,n);let l=0;for(let b=0;b<e(13);b+=1){let[g,v]=ye(e,b,{p:a,s:o},n);l=S(l,g,v)}let p=e(7)*T(a[0]*1.5,a[1]*1.5,1024,{s:o+3,n:3}),x=1+f*((c-.5)*1.2+m*.5);for(let b=0;b<3;b+=1)n[b]=S((n[b]??0)*x,e(4+b),p);return .5+f*(c-.5)+.15*l},H=[le,he,we];var D=e=>Math.round(Math.min(Math.max(e,0),1)*255);function ge(e,r){let{width:t,height:n}=r,o=new ArrayBuffer(t*n*4),a=new Uint8Array(o),u=.5*r.depth*n,i=(s,f)=>e[(f+n)%n*t+(s+t)%t]??0;for(let s=0;s<n;s+=1)for(let f=0;f<t;f+=1){let c=(i(f-1,s)-i(f+1,s))*u,m=(i(f,s+1)-i(f,s-1))*u,d=Math.sqrt(c*c+m*m+1);a.set([D(c/d/2+.5),D(m/d/2+.5),D(1/d/2+.5),D(i(f,s))],(s*t+f)*4)}return o}function Y(e){let r=H[L[e.kind]];if(!r)throw new RangeError(`surfaces: no painter for ${e.kind}.`);let{width:t,height:n,uniforms:o}=e,a=new ArrayBuffer(t*n*4),u=new Uint8Array(a),i=new Float32Array(t*n),s=[0,0,0],f=c=>o[c]??0;for(let c=0;c<n;c+=1)for(let m=0;m<t;m+=1)i[c*t+m]=r(f,(m+.5)/t,(c+.5)/n,s),u.set([D(s[0]),D(s[1]),D(s[2]),255],(c*t+m)*4);return{digest:e.digest,width:t,height:n,buffers:[a,ge(i,e)]}}function ve(e,r){return Y(F(e,r))}var J=`#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,ke=`#version 300 es
precision highp float;
precision highp int;
uniform vec4 u[58];
uniform vec3 uView;
layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oRelief;

uint hh(uint a, uint b) {
  uint h = ((a ^ 0x9e3779b9u) * 0x85ebca6bu) ^ ((b + 0x632be5abu) * 0xc2b2ae35u);
  h = (h ^ (h >> 16u)) * 0x7feb352du;
  h = (h ^ (h >> 15u)) * 0x846ca68bu;
  return h ^ (h >> 16u);
}
uint cell(vec2 i, vec2 p) {
  uvec2 m = uvec2(ivec2(i) + ivec2(p)) % uvec2(p);
  return m.x + (m.y << 12u);
}
float rn(vec2 i, float p, uint s) { return float(hh(cell(i, vec2(p)), s)) / 4294967296.0; }
float vn(vec2 q, float p, uint s) {
  vec2 i = floor(q), f = q - i, w = f * f * (3.0 - 2.0 * f);
  float a = rn(i, p, s), b = rn(i + vec2(1, 0), p, s), c = rn(i + vec2(0, 1), p, s), d = rn(i + 1.0, p, s);
  float top = a + (b - a) * w.x, bottom = c + (d - c) * w.x;
  return top + (bottom - top) * w.y;
}
float fbm(vec2 q, float p, uint s, int n) {
  float t = 0.0, a = 0.5, w = 0.0;
  for (int k = 0; k < n; k++) { t += a * vn(q, p, s + uint(k)); w += a; q *= 2.0; p *= 2.0; a *= 0.5; }
  return t / w;
}
vec2 fib(vec2 uv, float n, uint s, float len, float wid) {
  vec2 g = uv * n, c = floor(g), r = vec2(0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 i = c + vec2(x, y);
    uint k = cell(i, vec2(n)), h1 = hh(k, s), h2 = hh(k, s + 1u);
    vec2 o = i + vec2(h1 >> 16u, h1 & 65535u) / 65536.0;
    vec2 d = vec2(h2 >> 16u, h2 & 65535u) / 65536.0 - 0.5;
    d /= max(length(d), 1e-4);
    vec2 q = g - o;
    float t = clamp(dot(q, d), -len, len), e = 1.0 - smoothstep(wid * 0.5, wid, length(q - d * t));
    if (e > r.x) r = vec2(e, float(h2 & 255u) / 255.0);
  }
  return r;
}
float band(float t, float w) { return 1.0 - smoothstep(0.0, w, abs(fract(t) - 0.5)); }
`,Re=`
float fleck(vec2 uv, float m, uint s, float density) {
  vec2 g = uv * m, i = floor(g);
  uint h = hh(cell(i, vec2(m)), s);
  if (float(h & 1023u) / 1024.0 >= density) return 0.0;
  vec2 o = i + 0.3 + 0.4 * vec2((h >> 22u) & 1023u, (h >> 12u) & 1023u) / 1024.0;
  float r = 0.04 + 0.06 * float((h >> 10u) & 3u);
  return 1.0 - smoothstep(r * 0.5, r, length(g - o));
}
void surface(vec2 uv, out float h, out vec3 c) {
  uint s = uint(u[0].w);
  float n = u[3].x, p = u[3].w;
  float m = fbm(uv * p, p, s, 4), tooth = vn(uv * n * 4.0, n * 4.0, s + 5u);
  vec2 a = fib(uv, n, s + 10u, 0.9, 0.1), b = fib(uv, n * 2.0, s + 20u, 0.8, 0.12);
  float lines = (u[4].x > 0.0 ? 0.6 * band(uv.y * u[4].x, 0.12) : 0.0) + (u[4].y > 0.0 ? band(uv.x * u[4].y, 0.03) : 0.0);
  float fibre = 0.6 * a.x + 0.4 * b.x;
  h = 0.5 * m + 0.15 * tooth + u[3].y * fibre + u[4].z * lines;
  c = u[0].rgb * (1.0 + u[3].z * ((m - 0.5) * 2.0 + (tooth - 0.5) * 0.6));
  c *= 1.0 + u[3].y * (a.x * (0.03 - 0.6 * smoothstep(0.95, 0.99, a.y)) + 0.03 * b.x);
  c *= 1.0 + u[4].z * 0.08 * lines;
  float st = fbm(uv * 3.0, 3.0, s + 30u, 4), area = smoothstep(0.6, 0.66, st), rim = area * (1.0 - smoothstep(0.66, 0.7, st));
  c = mix(c, u[2].rgb, u[2].w * (0.35 * area + 0.5 * rim));
  c = mix(c, u[1].rgb, fleck(uv, n * 3.0, s + 40u, u[1].w));
}
`,Se=`
float leg(vec2 q, vec2 a, vec2 b, float r, out float ply) {
  vec2 ab = b - a;
  float t = clamp(dot(q - a, ab) / dot(ab, ab), 0.0, 1.0);
  vec2 e = q - a - ab * t;
  float d = length(e) / r, side = (e.x * ab.y - e.y * ab.x) / (length(ab) * r);
  ply = abs(fract(t * u[3].y + side * 0.35) - 0.5) * 2.0;
  return sqrt(max(0.0, 1.0 - d * d)) * (0.8 + 0.8 * t * (1.0 - t));
}
void surface(vec2 uv, out float h, out vec3 c) {
  uint s = uint(u[0].w);
  float ribs = u[1].w, rows = u[2].w, a = rows / ribs, hw = u[3].x * 0.5 * a;
  float x = uv.x * ribs, y = uv.y * rows, col = floor(x), fx = (x - col - 0.5) * a;
  float best = 0.0, ply = 0.5, tone = 0.5;
  for (int k = -1; k <= 1; k++) {
    float row = floor(y) + float(k);
    uint hs = hh(cell(vec2(col, row), vec2(ribs, rows)), s);
    float j = u[3].w * (float(hs & 255u) / 255.0 - 0.5);
    for (int side = -1; side <= 1; side += 2) {
      float sd = float(side), pl;
      float e = leg(vec2(fx + j * 0.06 * a, y - row), vec2(sd * hw * 0.72, -0.18), vec2(sd * hw * 0.06, 1.08), hw * 0.46, pl);
      e *= 1.0 + 0.3 * j;
      if (e > best) { best = e; ply = pl; tone = float(hs >> 24u) / 255.0; }
    }
  }
  float gw = max(0.5 * a - hw, 1e-3), gd = (0.5 * a - abs(fx)) / gw, gy = (fract(y) - 0.5) / 0.32;
  float purl = 0.4 * sqrt(max(0.0, 1.0 - gd * gd - gy * gy));
  float fuzz = u[3].z, n = fbm(uv * ribs * 16.0, ribs * 16.0, s + 30u, 2), hair = fib(uv, ribs * 12.0, s + 40u, 0.6, 0.08).x;
  h = max(best, purl) + 0.12 * (ply - 0.5) * best;
  h = h * (1.0 - 0.1 * fuzz) + fuzz * (0.1 * n + 0.2 * hair);
  float k = clamp(h, 0.0, 1.0);
  c = mix(u[1].rgb, u[0].rgb, smoothstep(0.08, 0.6, k));
  c = mix(c, u[2].rgb, 0.6 * smoothstep(0.62, 1.0, k));
  c *= 0.96 + 0.08 * tone;
  c = mix(c, u[2].rgb, fuzz * 0.3 * hair);
}
`,Pe=`
vec3 folds(vec2 p, uint s) {
  vec2 d = u[7].xy;
  float slope = 0.0, crest = 0.0;
  for (int k = 0; k < 3; k++) {
    float f = float(k), wt = 1.0 / (1.0 + 1.6 * f);
    vec2 e = normalize(d + vec2(-d.y, d.x) * (f - 1.0) * 0.35);
    float ph = fract(dot(p, e) * u[4].w * (1.0 + 0.45 * f) + u[5].w * fbm(p * (1.5 + f), 1024.0, s + 10u + uint(k) * 4u, 3));
    slope += cos(3.1415927 * ph) * wt;
    crest = max(crest, sin(3.1415927 * ph) * wt);
  }
  float sh = clamp(0.5 + 0.3 * slope, 0.0, 1.0), gloss = smoothstep(0.7, 1.0, sh) * crest;
  vec3 c = mix(u[4].rgb, u[5].rgb, smoothstep(0.15, 0.6, sh));
  return mix(c, u[6].rgb, smoothstep(0.6, 0.95, sh)) + u[6].w * gloss * gloss * u[6].rgb;
}
void surface(vec2 uv, out float h, out vec3 c) {
  uint s = uint(u[0].w);
  vec2 p = vec2(uv.x * u[3].x, uv.y), bd = u[2].xy;
  float len = u[2].z, b = fbm(vec2(dot(p, bd) * len, dot(p, vec2(-bd.y, bd.x)) * len * 4.0), 1024.0, s, 3);
  c = u[0].rgb * (1.0 + u[3].z * (fbm(p * 3.0, 1024.0, s + 1u, 3) - 0.5) * 2.0);
  if (u[4].w > 0.0) c = folds(p, s);
  float top = 0.0;
  int count = int(u[3].y);
  for (int i = 0; i < 10; i++) {
    if (i >= count) break;
    int o = 8 + i * 5;
    vec4 at = u[o], ax = u[o + 1], dark = u[o + 2], lit = u[o + 3];
    vec2 d = p - at.xy, l = vec2(dot(d, ax.xy) / at.z, dot(d, vec2(-ax.y, ax.x)) / at.w);
    l.y /= max(mix(1.0, sqrt(max(1.0 - l.x * l.x, 0.0)), u[o + 4].x), 0.05);
    float r = length(l);
    if (r > 1.0 + 0.5 * dark.w) continue;
    r += dark.w * (fbm(p * 9.0, 1024.0, s + 60u + uint(i), 4) - 0.5);
    float mask = 1.0 - smoothstep(1.0 - ax.z, 1.0, r);
    float n = ax.w > 0.0
      ? fract(r * 2.6 + 1.1 * fbm(vec2((atan(l.y, l.x) / 6.2831853 + 0.5) * 6.0, r), 6.0, s + 80u + uint(i), 2))
      : 0.6 * fbm(vec2(l.x * 2.0 + float(i) * 7.0, l.y * 4.0), 1024.0, s + 80u, 2) + 0.4 * vn(vec2(l.x * 3.0, l.y * 14.0), 1024.0, s + 90u);
    float lt = clamp(0.5 - 0.4 * l.y + lit.w * (n - 0.5) * 2.0, 0.0, 1.0);
    vec3 m = mix(dark.rgb, lit.rgb, smoothstep(0.2, 0.9, lt)) * (0.85 + 0.15 * (1.0 - r * r));
    c = mix(c, m, mask);
    top = mix(top, n, mask);
  }
  c *= 1.0 + u[2].w * ((b - 0.5) * 1.2 + (vn(p * 240.0, 1024.0, s + 7u) - 0.5) * 0.5);
  c = mix(c, u[1].rgb, u[1].w * fbm(p * 1.5, 1024.0, s + 3u, 3));
  h = 0.5 + u[2].w * (b - 0.5) + 0.15 * top;
}
`,Ae=`
void main() {
  vec2 px = 1.0 / uView.xy, uv = gl_FragCoord.xy * px, dx = vec2(px.x, 0.0), dy = vec2(0.0, px.y);
  float h, l, r, t, b;
  vec3 c, z;
  surface(uv, h, c);
  surface(uv - dx, l, z);
  surface(uv + dx, r, z);
  surface(uv - dy, t, z);
  surface(uv + dy, b, z);
  float k = 0.5 * uView.z * uView.y;
  oAlbedo = vec4(clamp(c, 0.0, 1.0), 1.0);
  oRelief = vec4(normalize(vec3((l - r) * k, (b - t) * k, 1.0)) * 0.5 + 0.5, clamp(h, 0.0, 1.0));
}`,Q=[Re,Se,Pe].map(e=>ke+e+Ae);function Te(e,r){let t=e.createProgram();for(let[n,o]of[[e.VERTEX_SHADER,J],[e.FRAGMENT_SHADER,r]]){let a=e.createShader(n);if(!a)throw new Error("surfaces: no shader.");e.shaderSource(a,o),e.compileShader(a),e.attachShader(t,a),e.deleteShader(a)}if(e.linkProgram(t),!e.getProgramParameter(t,e.LINK_STATUS)){let n=(e.getAttachedShaders(t)??[]).map(o=>e.getShaderInfoLog(o)??"").join(`
`);throw new Error(`surfaces: a painter did not compile.
${e.getProgramInfoLog(t)??""}
${n}`)}return t}function Ee(e){let r=e.getParameter(e.FRAMEBUFFER_BINDING),t=e.getParameter(e.VIEWPORT),n=e.getParameter(e.CURRENT_PROGRAM),o=e.getParameter(e.VERTEX_ARRAY_BINDING),a=e.getParameter(e.TEXTURE_BINDING_2D),u=e.getParameter(e.PIXEL_PACK_BUFFER_BINDING),i=[e.BLEND,e.DEPTH_TEST,e.CULL_FACE,e.SCISSOR_TEST,e.STENCIL_TEST].map(s=>[s,e.isEnabled(s)]);for(let[s]of i)e.disable(s);return e.bindBuffer(e.PIXEL_PACK_BUFFER,null),()=>{for(let[s,f]of i)f&&e.enable(s);e.bindBuffer(e.PIXEL_PACK_BUFFER,u),e.bindTexture(e.TEXTURE_2D,a),e.bindFramebuffer(e.FRAMEBUFFER,r),e.viewport(t[0]??0,t[1]??0,t[2]??0,t[3]??0),e.useProgram(n),e.bindVertexArray(o)}}function Me(e,r){return[0,1].map(t=>{let n=e.createTexture();return e.bindTexture(e.TEXTURE_2D,n),e.texStorage2D(e.TEXTURE_2D,1,e.RGBA8,r.width,r.height),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,n,0),n})}function Z(e,r,t){let n=new ArrayBuffer(r.width*r.height*4);return e.readBuffer(t),e.readPixels(0,0,r.width,r.height,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array(n)),n}function Le(e){let r=new Map,t=o=>{let a=r.get(o);if(a)return a;let u=Te(e,Q[o]??"");return r.set(o,u),u},n=o=>{let a=t(L[o.kind]),u=Ee(e),i=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,i);let s=Me(e,o);e.drawBuffers([e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1]),e.viewport(0,0,o.width,o.height),e.useProgram(a),e.uniform4fv(e.getUniformLocation(a,"u"),o.uniforms),e.uniform3f(e.getUniformLocation(a,"uView"),o.width,o.height,o.depth),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,3);let f=[Z(e,o,e.COLOR_ATTACHMENT0),Z(e,o,e.COLOR_ATTACHMENT1)];e.deleteFramebuffer(i);for(let c of s)e.deleteTexture(c);return u(),{digest:o.digest,width:o.width,height:o.height,buffers:f}};return{paint:(o,a)=>n(F(o,a)),paintPlan:n,dispose(){for(let o of r.values())e.deleteProgram(o);r.clear()}}}function ee(e,r){e.colorSpace=r.data===!0?"":"srgb",e.wrapS=r.repeat===!0?"repeat":"clamp",e.wrapT=e.wrapS,e.anisotropy=8,e.needsUpdate=!0}function De(e,r){return(t,n,o={})=>{let[a,u]=typeof t=="number"?[t,t]:t,i=r(a,u),s=i.getContext("2d");if(!s)throw new Error("surfaces: no 2D context for a print.");n(s,a,u);let f=new e.CanvasTexture(i);return ee(f,o),f}}function ze(e,r){let t=n=>Math.round(Math.min(Math.max(n,0),1)*255);return`rgb(255 ${t(e)} ${t(r)})`}function Fe(e,r){let[t,n]=r.buffers.map((o,a)=>{let u=new e.DataTexture(new Uint8Array(o),r.width,r.height);return ee(u,{data:a===1,repeat:!0}),u.magFilter="linear",u.minFilter="linear-mipmap-linear",u.generateMipmaps=!0,u.flipY=!0,u});return{map:t,normalMap:n}}export{L as KINDS,oe as KNIT,O as MAX_MASSES,se as PAINTED_CLOTH,ae as PAINTED_FLORAL,$ as PAINTER_VERSION,ne as PAPER,U as PLANNED,W as UNIFORMS,De as createPrinter,Le as createSurfacePainter,Y as paintPlan,ve as paintSurface,ze as pbr,F as planSurface,Fe as surfaceTextures};
