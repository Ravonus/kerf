// butterflies@0.1.0 from keel-modules 53c36d0 (MIT). Generated: don't edit.
var v=`
attribute vec2 aWing;
attribute float aFlap;
uniform float uTime, uFlapHz, uStill;
varying vec2 vWing;
varying float vShade;
void main() {
  float beat = sin(6.2831853 * uFlapHz * uTime + aFlap);
  // (Wings from 30 degrees under level to 70 over; still, open and a little raised.)
  float a = mix(0.35 + 0.87 * beat, 0.15, uStill);
  float b = a * 1.35;
  float span = position.x;
  float inner = min(span, 0.45);
  float outer = max(span - 0.45, 0.0);
  vec2 xy = inner * vec2(cos(a), sin(a)) + outer * vec2(cos(b), sin(b));
  float side = aWing.x;
  vec3 p = side == 0.0 ? position : vec3(xy.x * side, xy.y, position.z);
  // (The body rises as the wings come down.)
  p.y -= 0.06 * beat * (1.0 - uStill);
  vec3 n = side == 0.0 ? vec3(0.0, 1.0, 0.0) : vec3(-sin(a) * side, cos(a), 0.0);
  vec3 world = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
  vShade = 0.6 + 0.4 * abs(world.y);
  vWing = aWing;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
}
`,w=`
uniform vec3 uUpper, uUnder, uBody;
uniform float uGlow, uLight;
varying vec2 vWing;
varying float vShade;
void main() {
  vec3 wing = gl_FrontFacing ? uUpper : uUnder;
  vec3 base = mix(uBody, wing, abs(vWing.x));
  float rim = smoothstep(0.55, 1.0, vWing.y);
  vec3 c = base * uLight * vShade + rim * uGlow * mix(base, vec3(1.0), 0.65);
  gl_FragColor = vec4(c, 1.0);
}
`;var g={count:4,seed:1,centre:[0,0,0],radius:[1.2,.6,.6],scale:.06,speed:.3,flapHz:6,colors:{upper:"#2d5de0",under:"#7ea2ff",body:"#1b2f6e"},glow:1.5,light:1,keepOut:[]},T=6.283185307179586,U=50,z=[.6,.28,.12],C=[1,2.1,3.9];function b(e,n,t){let r=Math.imul(e|0,2654435761)^Math.imul(n+1,2246822519)^Math.imul(t+1,3266489917);return r=Math.imul(r^r>>>16,2146121005),r=Math.imul(r^r>>>15,2221713035),r^=r>>>16,(r>>>0)/4294967296}var O=(e,n,t)=>Math.min(t,Math.max(n,e));function x(e={}){let n={...g,...e};return{...n,count:O(Math.floor(n.count),0,U),seed:n.seed|0,radius:[Math.max(0,n.radius[0]),Math.max(0,n.radius[1]),Math.max(0,n.radius[2])],scale:Math.max(0,n.scale),speed:Math.max(0,n.speed),flapHz:Math.max(0,n.flapHz),colors:{...g.colors,...n.colors},glow:Math.max(0,n.glow),light:Math.max(0,n.light)}}function k(e={}){let n=x(e),t=[];for(let r=0;r<n.count;r+=1){let o=[],u=[],i=[];for(let s=0;s<3;s+=1)for(let a=0;a<3;a+=1){let l=s*3+a;o.push(n.speed*(C[a]??1)*(.7+.6*b(n.seed,r,l))),u.push((n.radius[s]??0)*(z[a]??0)),i.push(b(n.seed,r,10+l)*T)}t.push({rate:o,reach:u,phase:i,flap:b(n.seed,r,20)*T})}return t}function P(e,n){for(let t of n){let r=[e[0]-t.centre[0],e[1]-t.centre[1],e[2]-t.centre[2]],o=Math.hypot(r[0],r[1],r[2]);if(o>=t.radius)continue;let u=o>1e-9?[r[0]/o,r[1]/o,r[2]/o]:[0,1,0];for(let i=0;i<3;i+=1)e[i]=(t.centre[i]??0)+(u[i]??0)*t.radius}}function R(e){let n=e[0]??0,t=(e[1]??0)*.5,r=e[2]??0,o=Math.hypot(n,t,r);return o>1e-9?[n/o,t/o,r/o]:[0,0,1]}function L(e,n,t={}){let r=t.centre??g.centre,o=[r[0],r[1],r[2]],u=[0,0,0];for(let i=0;i<9;i+=1){let s=Math.floor(i/3),a=e.rate[i]??0,l=e.reach[i]??0,c=a*n+(e.phase[i]??0);o[s]=(o[s]??0)+l*Math.sin(c),u[s]=(u[s]??0)+l*a*Math.cos(c)}return P(o,t.keepOut??[]),{at:o,front:R(u)}}var f={x:.03,y:0},B=.72,W=.2,V=.3,I=-.42,h=.035;function M(e,n=8){e.moveTo(.03,.12),e.bezierCurveTo(.25,.45,.72,.64,.96,.52),e.bezierCurveTo(1.02,.32,.78,.1,.56,.03),e.bezierCurveTo(.82,-.15,.76,-.5,.5,-.56),e.bezierCurveTo(.3,-.62,.1,-.36,.03,-.12);let t=e.getPoints(n).map(u=>({x:u.x,y:u.y})),r=t[0],o=t[t.length-1];return r&&o&&t.length>1&&r.x===o.x&&r.y===o.y&&t.pop(),t}function A(e){let n=0;for(let t=0;t<e.length;t+=1){let r=e[t]??f,o=e[(t+1)%e.length]??f;n+=r.x*o.y-o.x*r.y}return n}function p(e,n,t){return e.position.push(n[0],n[1],n[2]),e.wing.push(t[0],t[1]),e.position.length/3-1}function S(e,n,t){let r=A(n)>0==t>0,o=(a,l,c)=>{e.index.push(...r?[a,c,l]:[a,l,c])},u=p(e,[f.x,0,f.y],[t,0]),i=[],s=[];for(let a of n){let l=f.x+(a.x-f.x)*B,c=f.y+(a.y-f.y)*B;i.push(p(e,[l,0,c],[t,W])),s.push(p(e,[a.x,0,a.y],[t,1]))}for(let a=0;a<n.length;a+=1){let l=(a+1)%n.length,[c,y,m,d]=[i[a]??u,i[l]??u,s[a]??u,s[l]??u];o(u,c,y),o(c,m,d),o(c,d,y)}}function G(e){let n=p(e,[0,0,V],[0,0]),t=p(e,[0,0,I],[0,0]);for(let r of[[h,0],[-h,0],[0,h],[0,-h]]){let o=p(e,[r[0],r[1],0],[0,0]);e.index.push(n,o,t)}}function F(e){let n={position:[],wing:[],index:[]};return S(n,e,1),S(n,e,-1),G(n),{position:new Float32Array(n.position),wing:new Float32Array(n.wing),index:n.index}}function N(e,n){let t=F(M(new e.Shape)),r=new e.Geometry;return r.setAttribute("position",new e.Attribute(t.position,3)),r.setAttribute("aWing",new e.Attribute(t.wing,2)),r.setAttribute("aFlap",new e.InstanceAttribute(new Float32Array(n.map(o=>o.flap)),1)),r.setIndex(t.index),r}function _(e,n){return{uTime:{value:0},uStill:{value:0},uFlapHz:{value:n.flapHz},uGlow:{value:n.glow},uLight:{value:n.light},uUpper:{value:new e.Vector3(1,1,1)},uUnder:{value:new e.Vector3(1,1,1)},uBody:{value:new e.Vector3(1,1,1)}}}function H(e,n,t,r){let[o,u,i]=t.front,s=Math.hypot(o,i),[a,l]=s>1e-6?[i/s,-o/s]:[1,0],[c,y,m]=[u*l,i*a-o*l,-u*a],d=r/2;e.set([a*d,0,l*d,0,c*d,y*d,m*d,0,o*d,u*d,i*d,0],n*16),e.set([t.at[0],t.at[1],t.at[2],1],n*16+12)}var j={upper:"uUpper",under:"uUnder",body:"uBody"};function Q(e,n={}){let t=x(n),r=k(t),o=N(e,r),u=_(e,t),i=new e.CustomMaterial({uniforms:u,vertexShader:v,fragmentShader:w,side:"both"}),s=new e.Instances(o,i,Math.max(1,r.length));s.count=r.length,s.frustumCulled=!1;let a={...t.colors},l={mesh:s,update(c){let y=c.still===!0,m=y?0:c.time;u.uTime.value=m,u.uStill.value=y?1:0,r.forEach((d,E)=>{H(s.instanceMatrix.array,E,L(d,m,t),t.scale)}),s.instanceMatrix.needsUpdate=!0},setColors(c){Object.assign(a,c);for(let y of["upper","under","body"]){let m=new e.Color(a[y]);u[j[y]].value.set(m.r,m.g,m.b)}},dispose(){o.dispose(),i.dispose()}};return l.setColors(a),l.update({time:0}),l}export{w as BUTTERFLY_FRAGMENT,v as BUTTERFLY_VERTEX,g as DEFAULT_BUTTERFLIES,x as butterflySettings,Q as createButterflies,b as flightHash,L as flyAt,k as planFlights,A as windingOf,F as wingMesh,M as wingOutline};
