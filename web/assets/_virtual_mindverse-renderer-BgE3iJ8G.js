import{c as e}from"./api-vGgttR-j.js";import{A as t,C as n,D as r,E as i,M as a,N as o,O as s,S as c,T as l,_ as u,a as d,b as f,c as p,d as m,f as h,g,h as _,i as v,j as y,k as b,l as ee,m as te,n as ne,o as x,p as S,r as re,s as ie,t as ae,u as oe,v as C,w as se,x as ce,y as le}from"./babylon-1ftxpNB8.js";import{a as w,i as ue,r as de}from"./Universe-CLeV2NZb.js";var fe=[`basalt`,`strata`,`cloud`,`archive`],pe=Math.log1p(30),me=.35,he=4294967296;function ge(e){return Number.isFinite(e)?Math.min(1,Math.max(0,e)):0}function _e(e){return typeof e==`number`&&Number.isFinite(e)&&e>0}function ve(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}function ye(e){let t=1/0,n=-1/0;for(let r of e)for(let e of[r.publishedAt,r.updatedAt])_e(e)&&(t=Math.min(t,e),n=Math.max(n,e));return Object.freeze(!Number.isFinite(t)||!Number.isFinite(n)?{earliest:null,latest:null,duration:0}:{earliest:t,latest:n,duration:Math.max(0,n-t)})}function be(e,t){let n=ve(e.question.id),r=[],i=[],a=!1,o=!1;for(let t of e.answers){_e(t.publishedAt)&&(i.push(t.publishedAt),r.push(t.publishedAt)),_e(t.updatedAt)&&r.push(t.updatedAt);for(let e of t.bindings)e.relation===`created`&&(a=!0),e.relation===`collected`&&(o=!0)}let s=r.length>0?Math.max(...r):null,c=s===null||t.earliest===null||t.latest===null?me:t.duration===0?.5:ge((s-t.earliest)/t.duration),l=null;if(i.length>=2){let e=Math.max(...i)-Math.min(...i);l=Number.isFinite(e)?Math.min(2**53-1,Math.max(0,e)):2**53-1}let u=Math.log1p(e.question.answerIds.length)/pe;return Object.freeze({seed:n/he,family:fe[n%fe.length],answerDensity:ge(u),timeSpan:l,freshness:c,divergence:null,created:a,collected:o})}var xe=.085;function Se(e){return xe+.115*(Number.isFinite(e)?Math.min(1,Math.max(0,e)):0)}var Ce=.38;function we(e){return e===`planet-focus`||e===`strata`?0:e===`approach`||e===`star-focus`?Ce:1}function Te(e){if(e.reducedMotion)return 0;let t=e.frozenAtMs;return t!==null&&Number.isFinite(t)?t:Number.isFinite(e.elapsedMs)?e.elapsedMs:0}function Ee(e){return Object.freeze({frameTimeMs:Te({...e,frozenAtMs:null}),orbitTimeMs:Te(e)})}var De=`
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDirection;
void main(void) {
  // 球体只平移，因此局部方向就是世界方向，避免远离原点时的位置相减误差。
  vDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`,Oe=`
precision highp float;
uniform vec3 uUp;
uniform vec3 uSunDirection;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;
uniform float uDim;
varying vec3 vDirection;

vec3 safeDirection(vec3 value) {
  // 零向量也必须保持有限，不能依赖驱动对 normalize(0) 的处理。
  return value / max(length(value), 0.0001);
}
void main(void) {
  vec3 ray = safeDirection(vDirection);
  vec3 up = safeDirection(uUp);
  vec3 sun = safeDirection(uSunDirection);
  float elevation = clamp(dot(ray, up), -1.0, 1.0);
  float zenith = smoothstep(0.0, 1.0, max(elevation, 0.0));
  vec3 color = mix(uHorizonColor, uZenithColor, zenith);
  float mu = clamp(dot(ray, sun), -1.0, 1.0);
  // 固定各向异性系数并限制分母，避免正对太阳时 Mie 项发散。
  float mieBase = max(1.64 - 1.6 * mu, 0.04);
  float mie = 0.36 / max(pow(mieBase, 1.5), 0.008);
  float daylight = smoothstep(-0.15, 0.1, dot(sun, up));
  color += uSunColor * clamp(mie * 0.06, 0.0, 1.0) * daylight;
  // 白天整体亮起来，夜面回落到深色 —— 天的亮度跟着太阳高度走。
  color *= 0.35 + 0.65 * daylight;
  float alpha = clamp(uDim, 0.0, 1.0);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
}
`,ke=[`worldViewProjection`,`uUp`,`uSunDirection`,`uZenithColor`,`uHorizonColor`,`uSunColor`,`uDim`],Ae={magma:0,desert:0,rock:1,tundra:0,ice:0},je={magma:[.9,.24,.08],desert:[.76,.42,.1],rock:[.31,.34,.4],tundra:[.2,.46,.39],ice:[.42,.7,.96]},Me=e=>Number.isFinite(e)?Math.min(1,Math.max(0,e)):0;function Ne(e){let t=Object.keys(je),n=t.map(t=>Me(e[t])),r=n.reduce((e,t)=>e+t,0),i=[0,0,0];return t.forEach((e,t)=>{let a=r>1e-8?n[t]/r:Number(e===`rock`);i[0]+=je[e][0]*a,i[1]+=je[e][1]*a,i[2]+=je[e][2]*a}),i}function Pe(e){let t=Ne(e);return[t[0]*.78+.06,t[1]*.74+.05,t[2]*.66+.04]}function Fe(e){let t=Math.max(...e.map(Math.abs));return!e.every(Number.isFinite)||t<1e-12?y.Up():new y(e[0]/t,e[1]/t,e[2]/t).normalize()}var Ie=class{mesh;material;scene;drawObserver;radius;disposed=!1;dim=1;sun=y.Up();up=y.Up();zenith=y.Zero();horizon=y.Zero();sunColor=y.One();constructor(e,t,n={}){this.scene=e,this.radius=Number.isFinite(n.radius)&&n.radius>0?Math.min(1e6,Math.max(.01,n.radius)):100,this.mesh=ee(`planet-sky`,{diameter:2,segments:32,sideOrientation:C.BACKSIDE},e),this.mesh.isPickable=!1,this.mesh.infiniteDistance=!0,this.mesh.applyFog=!1,this.material=new m(`planet-sky-material`,e,{vertexSource:De,fragmentSource:Oe},{attributes:[`position`],uniforms:[...ke],needAlphaBlending:!0}),this.material.disableDepthWrite=!0,this.material.backFaceCulling=!0,this.mesh.material=this.material,this.setSun([0,1,0]),this.material.setVector3(`uUp`,this.up),this.setThermal(n.thermal??Ae),this.setDim(n.dim??1),this.drawObserver=e.onBeforeDrawPhaseObservable.add(()=>{let n=e.activeCamera;if(this.disposed||!n||!this.mesh.isVisible||!t.isEnabled())return;this.mesh.position.setAll(0);let r=t.getAbsolutePosition(),i=n.globalPosition.subtract(r);this.up=Fe([i.x,i.y,i.z]),this.material.setVector3(`uUp`,this.up);let a=Math.max(.001,n.minZ),o=n.maxZ>a?n.maxZ:Math.max(this.radius*2,a*4);this.mesh.scaling.setAll(Math.min(o*.9,Math.max(a*2,this.radius)))})}setSun(e){this.disposed||(this.sun=Fe(e),this.material.setVector3(`uSunDirection`,this.sun))}setThermal(e){if(this.disposed)return;let t=Object.keys(je),n=t.map(t=>Me(e[t])),r=n.reduce((e,t)=>e+t,0);this.horizon=y.Zero(),t.forEach((e,t)=>{let i=r>1e-8?n[t]/Math.max(r,1e-8):Number(e===`rock`);this.horizon.addInPlace(y.FromArray(je[e]).scale(i))}),this.zenith=this.horizon.multiply(new y(.5,.62,.86)),this.sunColor=y.Lerp(this.horizon,y.One(),.65),this.material.setVector3(`uZenithColor`,this.zenith),this.material.setVector3(`uHorizonColor`,this.horizon),this.material.setVector3(`uSunColor`,this.sunColor)}setDim(e){this.disposed||(this.dim=Me(e),this.mesh.isVisible=this.dim>0,this.material.setFloat(`uDim`,this.dim))}diagnostics(){return{disposed:this.disposed,visible:!this.disposed&&this.mesh.isVisible,dim:this.dim,sun:this.sun.asArray(),up:this.up.asArray(),zenith:this.zenith.asArray(),horizon:this.horizon.asArray(),sunColor:this.sunColor.asArray(),uniforms:[...ke]}}dispose(){this.disposed||(this.disposed=!0,this.scene.onBeforeDrawPhaseObservable.remove(this.drawObserver),this.mesh.dispose(),this.material.dispose())}},Le=`
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  // 地表根节点只平移不缩放不旋转，法线可以直接用 3x3 部分变换。
  vWorldNormal = mat3(world) * normal;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`,Re=`
precision highp float;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform vec3 uPlanetCenter;
uniform float uPlanetRadius;
uniform vec3 uBaseColor;
uniform vec3 uAccentColor;
uniform vec3 uRockColor;
uniform vec3 uHorizonColor;
uniform float uSeed;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

vec3 safeDirection(vec3 value) {
  return value / max(length(value), 0.0001);
}
// 只调制外观的哈希噪声：几何在 CPU 上，这里的数值不需要跨端一致。
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3) + uSeed);
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  float x00 = mix(n000, n100, u.x);
  float x10 = mix(n010, n110, u.x);
  float x01 = mix(n001, n101, u.x);
  float x11 = mix(n011, n111, u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}
float fbm(vec3 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave += 1) {
    total += valueNoise(p) * amplitude;
    p = p * 2.03 + vec3(11.7, 5.3, 2.9);
    amplitude *= 0.5;
  }
  return total;
}
void main(void) {
  vec3 local = vWorldPosition - uPlanetCenter;
  vec3 up = safeDirection(local);
  vec3 surfaceNormal = safeDirection(vWorldNormal);
  vec3 sun = safeDirection(uSunDirection);
  float radius = max(uPlanetRadius, 0.0001);
  // 以行星半径为单位取样：换一颗大小不同的行星，岩理密度看起来一致。
  vec3 probe = local * (48.0 / radius);
  float grain = fbm(probe);
  float fine = valueNoise(probe * 7.0) * 0.7 + valueNoise(probe * 29.0) * 0.3;
  float patches = fbm(probe * 0.11);
  // 坡向露岩：越陡越露出深色岩石；噪声让边界不规则。
  float slope = 1.0 - clamp(dot(surfaceNormal, up), 0.0, 1.0);
  float rocky = smoothstep(0.05, 0.28, slope + (grain - 0.5) * 0.18);
  vec3 albedo = mix(uBaseColor, uAccentColor, smoothstep(0.35, 0.72, patches + (grain - 0.5) * 0.4));
  albedo = mix(albedo, uRockColor, rocky);
  albedo *= 0.8 + 0.4 * fine;
  // 光照：太阳的朗伯项 + 半球天光（朝天亮、朝地暗）。
  float daylight = clamp(dot(surfaceNormal, sun), 0.0, 1.0);
  float skyLight = 0.5 + 0.5 * dot(surfaceNormal, up);
  vec3 lit = albedo * (daylight * 1.25 + skyLight * uHorizonColor * 0.9 + 0.04);
  // 远处融进地平线的空气：距离按行星半径计。
  float eyeDistance = length(vWorldPosition - uCameraPosition);
  float haze = 1.0 - exp(-eyeDistance / (radius * 0.55));
  vec3 color = mix(lit, uHorizonColor * (0.55 + 0.45 * clamp(dot(up, sun), 0.0, 1.0)), haze * 0.6);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`,ze=[`worldViewProjection`,`world`,`uSunDirection`,`uCameraPosition`,`uPlanetCenter`,`uPlanetRadius`,`uBaseColor`,`uAccentColor`,`uRockColor`,`uHorizonColor`,`uSeed`],Be=e=>Number.isFinite(e)?Math.min(1,Math.max(0,e)):0,T=(e,t)=>Number.isFinite(e)?e:t;function Ve(e){let t=Math.max(...e.map(e=>Math.abs(T(e,0))));return!e.every(Number.isFinite)||t<1e-12?y.Up():new y(e[0]/t,e[1]/t,e[2]/t).normalize()}var He=e=>new y(Be(e[0]),Be(e[1]),Be(e[2])),Ue=class{material;base=[.3,.3,.3];accent=[.4,.4,.4];rock=[.2,.2,.2];disposed=!1;constructor(e,t){this.material=new m(`planet-ground:material`,e,{vertexSource:Le,fragmentSource:Re},{attributes:[`position`,`normal`],uniforms:[...ze]}),this.material.backFaceCulling=!0,this.material.setFloat(`uSeed`,T(t.seed??0,0)%1e3),this.setThermal(t.thermal),this.setSun([0,1,0]),this.setCamera([0,0,0],[0,0,0],t.radius)}setSun(e){this.disposed||this.material.setVector3(`uSunDirection`,Ve(e))}setCamera(e,t,n){this.disposed||(this.material.setVector3(`uCameraPosition`,new y(T(e[0],0),T(e[1],0),T(e[2],0))),this.material.setVector3(`uPlanetCenter`,new y(T(t[0],0),T(t[1],0),T(t[2],0))),this.material.setFloat(`uPlanetRadius`,Number.isFinite(n)&&n>0?n:1))}setThermal(e){if(this.disposed)return;let t=Pe(e),n=Ne(e);this.base=t,this.accent=[t[0]*1.22+.06,t[1]*1.2+.05,t[2]*1.16+.04],this.rock=[t[0]*.5+.02,t[1]*.5+.02,t[2]*.52+.03],this.material.setVector3(`uBaseColor`,He(this.base)),this.material.setVector3(`uAccentColor`,He(this.accent)),this.material.setVector3(`uRockColor`,He(this.rock)),this.material.setVector3(`uHorizonColor`,He(n))}diagnostics(){return{base:[...this.base],accent:[...this.accent],rock:[...this.rock],disposed:this.disposed}}dispose(){this.disposed||(this.disposed=!0,this.material.dispose())}},We=Object.freeze([{axis:[1,0,0],right:[0,0,-1],up:[0,1,0]},{axis:[-1,0,0],right:[0,0,1],up:[0,1,0]},{axis:[0,1,0],right:[1,0,0],up:[0,0,-1]},{axis:[0,-1,0],right:[1,0,0],up:[0,0,1]},{axis:[0,0,1],right:[1,0,0],up:[0,1,0]},{axis:[0,0,-1],right:[-1,0,0],up:[0,1,0]}]),Ge=Object.freeze([0,1,2,3,4,5]),Ke=Math.PI/4,qe=e=>Number.isFinite(e)?Math.min(1,Math.max(-1,e)):0;function Je(e,t,n){let{axis:r,right:i,up:a}=We[e],o=Math.tan(qe(t)*Ke),s=Math.tan(qe(n)*Ke),c=r[0]+i[0]*o+a[0]*s,l=r[1]+i[1]*o+a[1]*s,u=r[2]+i[2]*o+a[2]*s,d=Math.hypot(c,l,u)||1;return[c/d,l/d,u/d]}function Ye(e,t,n,r){let i=Je(e,t-r,n-r),a=Je(e,t+r,n+r),o=Math.min(1,Math.max(-1,i[0]*a[0]+i[1]*a[1]+i[2]*a[2]));return Math.acos(o)}var Xe=e=>{let t=Math.hypot(e[0],e[1],e[2]);return t>0&&Number.isFinite(t)?[e[0]/t,e[1]/t,e[2]/t]:[0,1,0]};function Ze(e,t,n){let r=Je(e.face,e.u,e.v),i=r[0]-t[0]*n,a=r[1]-t[1]*n,o=r[2]-t[2]*n;return Math.hypot(i,a,o)}function Qe(e){let t=Xe(e.cameraDirection),n=Number.isFinite(e.cameraRadius)&&e.cameraRadius>0?e.cameraRadius:1,r=Math.max(0,Math.min(8,Math.round(e.maxDepth))),i=Number.isFinite(e.detailAngle)&&e.detailAngle>0?e.detailAngle:.35,a=Math.max(6,Math.round(e.budget)),o=Ge.map(e=>({face:e,u:0,v:0,halfSize:1,depth:0})),s=[];for(;o.length>0;){let e=[];for(let c of o){let l=Ye(c.face,c.u,c.v,c.halfSize)/Math.max(1e-4,Ze(c,t,n)),u=s.length+e.length+o.length+3<=a;if(c.depth<r&&l>i&&u){let t=c.halfSize/2;for(let[n,r]of[[-1,-1],[1,-1],[-1,1],[1,1]])e.push({face:c.face,u:c.u+n*t,v:c.v+r*t,halfSize:t,depth:c.depth+1})}else s.push(c)}o=e}return Object.freeze(s)}var $e=e=>Math.max(1,Math.min(64,Number.isFinite(e)?Math.round(e):8));function et(e){let t=$e(e.resolution),n=t+1,r=Number.isFinite(e.radius)&&e.radius>0?e.radius:1,i=Number.isFinite(e.displacement)?e.displacement:0,a=Number.isFinite(e.skirtDepth)&&e.skirtDepth>0?e.skirtDepth:0,{chunk:o,field:s}=e,c=n*n,l=a>0?4*t:0,u=new Float32Array((c+l)*3),d=new Float32Array((c+l)*3),f=Array(c),p=new Float64Array(c);for(let e=0;e<n;e+=1)for(let a=0;a<n;a+=1){let c=e*n+a,l=o.u+(a/t*2-1)*o.halfSize,m=o.v+(e/t*2-1)*o.halfSize,h=Je(o.face,l,m),g=s.height(h);f[c]=[h[0],h[1],h[2]],p[c]=g;let _=r*(1+g*i);u[c*3]=h[0]*_,u[c*3+1]=h[1]*_,u[c*3+2]=h[2]*_;let v=s.normal(h,Math.max(1e-4,o.halfSize/t),i);d[c*3]=v[0],d[c*3+1]=v[1],d[c*3+2]=v[2]}let m=[],h=(e,t,n)=>{let r=u[e*3]-u[t*3],i=u[e*3+1]-u[t*3+1],a=u[e*3+2]-u[t*3+2],o=u[n*3]-u[t*3],s=u[n*3+1]-u[t*3+1],c=u[n*3+2]-u[t*3+2],l=i*c-a*s,f=a*o-r*c,p=r*s-i*o,h=d[e*3]+d[t*3]+d[n*3],g=d[e*3+1]+d[t*3+1]+d[n*3+1],_=d[e*3+2]+d[t*3+2]+d[n*3+2];l*h+f*g+p*_>=0?m.push(e,t,n):m.push(e,n,t)};for(let e=0;e<t;e+=1)for(let r=0;r<t;r+=1){let t=e*n+r,i=t+1,a=t+n,o=a+1;h(t,a,i),h(i,a,o)}if(a>0){let e=r*a,o=c,s=(t,n)=>{let a=f[t],s=r*(1+p[t]*i)-e;u[o*3]=a[0]*s,u[o*3+1]=a[1]*s,u[o*3+2]=a[2]*s,d[o*3]=d[t*3],d[o*3+1]=d[t*3+1],d[o*3+2]=d[t*3+2],n>=0&&(h(n,o-1,t),h(t,o-1,o)),o+=1},l=e=>{let n=-1;for(let r=0;r<=t;r+=1){let i=e(r);if(r===t)break;s(i,n),n=i}};l(e=>e),l(e=>e*n+t),l(e=>t*n+(t-e)),l(e=>(t-e)*n)}return Object.freeze({positions:u,normals:d,indices:Uint32Array.from(m),surfaceVertexCount:c})}var tt=e=>`planet-surface:face=${e.face}:u=${e.u}:v=${e.v}:depth=${e.depth}`,nt=class{chunks=new Map;scene;parent;options;material;builtThisUpdate=0;disposedThisUpdate=0;disposed=!1;constructor(e,t,n){if(this.scene=e,this.parent=t,this.options={...n},n.material)this.material=n.material;else{let t=new p(`planet-surface:material`,e),i=n.albedo??[.34,.33,.31];t.diffuseColor=new r(i[0],i[1],i[2]),t.specularColor=new r(.03,.03,.03),this.material=t}}update(e,t){if(this.builtThisUpdate=0,this.disposedThisUpdate=0,this.disposed)return;let n=Qe({...this.options,cameraDirection:e,cameraRadius:t}),r=new Set(n.map(tt));for(let[e,t]of this.chunks)r.has(e)||(this.release(t),this.chunks.delete(e),this.disposedThisUpdate+=1);for(let e of n){let t=tt(e);if(this.chunks.has(t))continue;let n=et({...this.options,chunk:e}),r=new f(`${t}:geometry`,this.scene);r.setVerticesData(`position`,n.positions,!1,3),r.setVerticesData(`normal`,n.normals,!1,3),r.setIndices(n.indices);let i=new C(t,this.scene);i.parent=this.parent,i.material=this.material,r.applyToMesh(i),this.chunks.set(t,{mesh:i,geometry:r,vertexCount:n.positions.length/3}),this.builtThisUpdate+=1}}diagnostics(){let e=0;for(let t of this.chunks.values())e+=t.vertexCount;return Object.freeze({chunkCount:this.chunks.size,meshCount:this.chunks.size,builtThisUpdate:this.builtThisUpdate,disposedThisUpdate:this.disposedThisUpdate,vertexCount:e})}dispose(){if(!this.disposed){this.disposed=!0;for(let e of this.chunks.values())this.release(e);this.chunks.clear(),this.material.dispose(),this.builtThisUpdate=0,this.disposedThisUpdate=0}}release(e){e.mesh.dispose(!1,!1),e.geometry.dispose()}},rt=8,it=40,at=Object.freeze({low:3,medium:5,high:6});function ot(e,t){let n=lt(e.craterCount,0,48),r=Math.min(n,Math.min(rt,Math.max(2,Math.round(n*.16)))),i=ct(e.seed),a=Object.freeze(Array.from({length:r},()=>st(i))),o=t===`low`?0:n-r;return Object.freeze({octaves:at[t],warpStrength:ut(e.detailDensity),ridgeStrength:ut(e.faultStrength),largeCraters:a,smallCraterBudget:o,smallCraterThreshold:t===`low`?0:ut(o/it)})}function st(e){let t=e()*2-1,n=e()*Math.PI*2,r=Math.sqrt(Math.max(0,1-t*t));return Object.freeze({direction:Object.freeze([r*Math.cos(n),t,r*Math.sin(n)]),radius:.07+e()*.11,depth:.025+e()*.055,rim:.012+e()*.028})}function ct(e){let t=e>>>0||2654435769;return()=>(t^=t<<13,t^=t>>>17,t^=t<<5,t>>>=0,t/4294967296)}function lt(e,t,n){return Math.round(Math.min(n,Math.max(t,Number.isFinite(e)?e:t)))}function ut(e){return Math.min(1,Math.max(0,Number.isFinite(e)?e:0))}var E=e=>e-Math.floor(e),D=(e,t,n)=>{if(!(t>e))return n<e?0:1;let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)},O=(e,t,n)=>e+(t-e)*n,k=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],A=e=>{let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]};function dt(e){let t=Number.isFinite(e.seed)?e.seed:0,n=Math.min(6,Math.max(1,Math.round(e.octaves))),r=e=>A([E(Math.sin(k(e,[127.1,311.7,74.7])+t*71e-6)*43758.5453123)*2-1,E(Math.sin(k(e,[269.5,183.3,246.1])+t*71e-6)*43758.5453123)*2-1,E(Math.sin(k(e,[113.5,271.9,124.6])+t*71e-6)*43758.5453123)*2-1]),i=e=>[E(Math.sin(k(e,[157.1,319.7,83.3])+t*113e-6)*43758.5453123),E(Math.sin(k(e,[221.7,137.9,301.3])+t*113e-6)*43758.5453123),E(Math.sin(k(e,[97.7,251.3,199.1])+t*113e-6)*43758.5453123)],a=e=>E(Math.sin(k(e,[41.7,289.1,173.3])+t*193e-6)*24634.6345),o=e=>{let t=Math.floor(e[0]),n=Math.floor(e[1]),i=Math.floor(e[2]),a=e[0]-t,o=e[1]-n,s=e[2]-i,c=a*a*(3-2*a),l=o*o*(3-2*o),u=s*s*(3-2*s),d=(e,c,l)=>k(r([t+e,n+c,i+l]),[a-e,o-c,s-l]),f=O(d(0,0,0),d(1,0,0),c),p=O(d(0,1,0),d(1,1,0),c),m=O(d(0,0,1),d(1,0,1),c),h=O(d(0,1,1),d(1,1,1),c);return O(O(f,p,l),O(m,h,l),u)*.9+.5},s=(e,t)=>{let n=0,r=.53,i=0,a=e;for(let e=0;e<Math.min(6,t);e+=1)n+=o(a)*r,i+=r,a=[a[0]*2.03+17.13,a[1]*2.03+9.71,a[2]*2.03+13.57],r*=.5;return n/Math.max(i,1e-4)},c=e=>[s([e[0]+11.7,e[1]+3.1,e[2]+7.9],3)*2-1,s([e[0]+5.3,e[1]+19.1,e[2]+2.7],3)*2-1,s([e[0]+13.1,e[1]+8.3,e[2]+23.7],3)*2-1],l=(e,t)=>{let n=0,r=.56,i=0,a=e;for(let e=0;e<Math.min(6,t);e+=1){let e=1-Math.abs(o(a)*2-1);n+=e*e*r,i+=r,a=[a[0]*2.11+7.1,a[1]*2.11+13.7,a[2]*2.11+5.9],r*=.48}return n/Math.max(i,1e-4)},u=(e,t,n,r)=>{let i=e/Math.max(t,1e-4),a=1-D(0,.72,i),o=D(.42,.82,i)*(1-D(.82,1,i)),s=1-D(0,.18,Math.abs(i-1));return-n*a*a+n*.18*o+r*s},d=(e,t)=>Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]),f=t=>{let n=0,r=0;for(let i of e.largeCraters.slice(0,8)){if(!(i.radius>0))continue;let e=d(t,A(i.direction));n+=u(e,i.radius,i.depth,i.rim),r=Math.max(r,1-D(i.radius*.35,i.radius*1.18,e))}return[n,r]},p=(t,n)=>{let r=[t[0]*n,t[1]*n,t[2]*n],o=[Math.floor(r[0]),Math.floor(r[1]),Math.floor(r[2])],s=0,c=0;for(let r=-1;r<=1;r+=1)for(let l=-1;l<=1;l+=1)for(let f=-1;f<=1;f+=1){let p=[o[0]+r,o[1]+l,o[2]+f];if(+(a(p)>=e.smallCraterThreshold)==0)continue;let m=i(p),h=A([p[0]+m[0],p[1]+m[1],p[2]+m[2]]),g=O(.34,.58,i([p[0]+5.17,p[1]+5.17,p[2]+5.17])[0])/n,_=d(t,h);c=Math.max(c,1-D(g*.35,g*1.2,_)),s+=u(_,g,g*.12,g*.045)}return[s,c]},m=t=>{if(e.qualityLevel<=0)return[0,0];let n=p(t,O(18,28,e.detailDensity));if(e.qualityLevel<2)return n;let r=p(t,O(37,53,e.detailDensity));return[n[0]+r[0],Math.max(n[1],r[1])]},h=t=>{let r=A(t),i=c([r[0]*1.7,r[1]*1.7,r[2]*1.7]),a=[r[0]+i[0]*e.warpStrength,r[1]+i[1]*e.warpStrength,r[2]+i[2]*e.warpStrength],u=s([a[0]*2.1,a[1]*2.1,a[2]*2.1],n),d=D(.48,.72,u),p=l([a[0]*5.4,a[1]*5.4,a[2]*5.4],n)*d*e.faultStrength,h=O(11,23,e.detailDensity),g=(o([a[0]*h,a[1]*h,a[2]*h])-.5)*O(.028,.085,e.detailDensity),_=f(r),v=m(r);return Object.freeze({height:(u-.48)*.72+p*.28+g+_[0]+v[0],relief:p*d,largeCraterMask:_[1],smallCraterMask:v[1]})},g=e=>h(e).height;return Object.freeze({sample:h,height:g,normal:(e,t=.0025,n=1)=>{let r=A(e),i=Math.abs(r[1])<.95?[0,1,0]:[1,0,0],a=A([r[1]*i[2]-r[2]*i[1],r[2]*i[0]-r[0]*i[2],r[0]*i[1]-r[1]*i[0]]),o=A([r[1]*a[2]-r[2]*a[1],r[2]*a[0]-r[0]*a[2],r[0]*a[1]-r[1]*a[0]]),s=Math.max(t,1e-4),c=(e,t)=>A([r[0]+e[0]*s*t,r[1]+e[1]*s*t,r[2]+e[2]*s*t]),l=e=>{let t=1+g(e)*n;return[e[0]*t,e[1]*t,e[2]*t]},u=l(c(a,1)),d=l(c(a,-1)),f=l(c(o,1)),p=l(c(o,-1)),m=[u[0]-d[0],u[1]-d[1],u[2]-d[2]],h=[f[0]-p[0],f[1]-p[1],f[2]-p[2]];return A([m[1]*h[2]-m[2]*h[1],m[2]*h[0]-m[0]*h[2],m[0]*h[1]-m[1]*h[0]])}})}var ft=Object.freeze({low:0,medium:1,high:2});function pt(e,t){let n=ot(e,t);return Object.freeze({field:dt({...n,seed:e.seed,detailDensity:e.detailDensity,faultStrength:e.faultStrength,qualityLevel:ft[t]}),displacement:.045+e.detailDensity*.08})}var mt=Object.freeze({phase:`idle`,token:0,questionId:null,landing:null,descent:0}),ht=e=>Number.isFinite(e)?Math.min(1,Math.max(0,e)):0,gt=e=>{let t=Math.hypot(e[0],e[1],e[2]);return t>0&&Number.isFinite(t)?[e[0]/t,e[1]/t,e[2]/t]:[0,1,0]};function j(e,t){switch(t.kind){case`enter`:return t.questionId?Object.freeze({phase:`descending`,token:e.token+1,questionId:t.questionId,landing:gt(t.landing),descent:0}):e;case`descend`:{if(t.token!==e.token||e.phase!==`descending`)return e;let n=ht(t.progress);return n===e.descent?e:Object.freeze({...e,descent:n})}case`landed`:return t.token!==e.token||e.phase!==`descending`?e:Object.freeze({...e,phase:`walking`,descent:1});case`dig`:return t.token!==e.token||e.phase!==`walking`?e:Object.freeze({...e,phase:`digging`});case`surfaced`:return t.token!==e.token||e.phase!==`digging`?e:Object.freeze({...e,phase:`walking`});case`exit`:return e.phase===`idle`?e:mt;default:return e}}function _t(e){return e.phase===`descending`||e.phase===`walking`}function vt(e){return e.phase===`descending`||e.phase===`walking`}function M(e){return e.phase===`descending`||e.phase===`walking`}function yt(e){return e.phase===`walking`}var bt=Math.PI*4/9,N=e=>{let t=Math.hypot(e[0],e[1],e[2]);return t>0&&Number.isFinite(t)?[e[0]/t,e[1]/t,e[2]/t]:[0,1,0]},xt=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],St=(e,t,n)=>[e[0]+t[0]*n,e[1]+t[1]*n,e[2]+t[2]*n];function Ct(e){let t=N(e),n=N(xt(Math.abs(t[1])<.95?[0,1,0]:[1,0,0],t)),r=N(xt(t,n));return Object.freeze({up:t,north:r,east:n})}var wt=e=>Number.isFinite(e)?Math.min(bt,Math.max(-bt,e)):0;function Tt(e,t){let n=N(e),r=t[0]*n[0]+t[1]*n[1]+t[2]*n[2],i=[t[0]-n[0]*r,t[1]-n[1]*r,t[2]-n[2]*r],a=Math.hypot(i[0],i[1],i[2]);return Object.freeze({up:n,facing:a>1e-9?N(i):Ct(n).north})}function Et(e,t,n){let r=Math.cos(n),i=Math.sin(n);return[[e[0]*r+t[0]*i,e[1]*r+t[1]*i,e[2]*r+t[2]*i],[-e[0]*i+t[0]*r,-e[1]*i+t[1]*r,-e[2]*i+t[2]*r]]}function Dt(e,t){let n=Tt(e.direction,e.facing),r=n.up,i=n.facing,a=Number.isFinite(t.turn)?t.turn:0;if(a!==0){let e=N(xt(i,r)),t=Math.cos(a),n=Math.sin(a);i=N([i[0]*t+e[0]*n,i[1]*t+e[1]*n,i[2]*t+e[2]*n])}let o=Number.isFinite(t.forward)?t.forward:0;if(o!==0){let[e,t]=Et(r,i,o);r=N(e),i=N(t)}let s=Number.isFinite(t.strafe)?t.strafe:0;if(s!==0){let e=N(xt(i,r)),[t,n]=Et(r,e,s);r=N(t),i=N(xt(r,N(n)))}let c=Tt(r,i);return Object.freeze({direction:c.up,facing:c.facing,pitch:wt(e.pitch+(Number.isFinite(t.tilt)?t.tilt:0)),eyeHeight:e.eyeHeight})}function Ot(e,t,n,r){let{up:i,facing:a}=Tt(e.direction,e.facing),o=Number.isFinite(n)&&n>0?n:1,s=Number.isFinite(r)?r:0,c=o*(1+t.height(i)*s),l=Math.max(0,Number.isFinite(e.eyeHeight)?e.eyeHeight:0),u=[i[0]*(c+l),i[1]*(c+l),i[2]*(c+l)],d=wt(e.pitch),f=N(St([a[0]*Math.cos(d),a[1]*Math.cos(d),a[2]*Math.cos(d)],i,Math.sin(d)));return Object.freeze({position:u,target:St(u,f,o*.5),up:i,groundRadius:c})}function kt(e,t){let{up:n,north:r}=Ct(e);return Object.freeze({direction:n,facing:r,pitch:0,eyeHeight:t})}function At(e){return Math.max(1e-6,(Number.isFinite(e)&&e>0?e:.001)*.2)}var jt=.45;function Mt(e,t){let n=N(e),r=N(t),i=n[0]*r[0]+n[1]*r[1]+n[2]*r[2];if(i>=jt)return n;let a=N(St(n,r,-i)),o=Math.hypot(...a)>.5&&Number.isFinite(a[0])?a:N(xt(r,Math.abs(r[1])<.95?[0,1,0]:[1,0,0])),s=Math.acos(jt);return N(St([r[0]*Math.cos(s),r[1]*Math.cos(s),r[2]*Math.cos(s)],o,Math.sin(s)))}var Nt=.6,Pt=e=>Number.isFinite(e)&&e>0;function Ft(e,t){if(!Pt(t))return 1;if(!Number.isFinite(e))return+(e>0);let n=e/t;if(n<=.6)return 0;if(n>=1)return 1;let r=(n-Nt)/.4;return r*r*(3-2*r)}function It(e){let t=[Math.sin(e*1.7+.4),Math.cos(e*2.3)+.55,Math.sin(e*3.1+1.2)],n=Math.hypot(t[0],t[1],t[2])||1;return[t[0]/n,t[1]/n,t[2]/n]}function Lt(e,t){let n=Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]);return n<.35?0:Math.min(20+1.9*n**1.5,120)}function Rt(e,t,n,r=44){let i=Math.abs(t[1])<.9?[0,1,0]:[1,0,0],a=[t[1]*i[2]-t[2]*i[1],t[2]*i[0]-t[0]*i[2],t[0]*i[1]-t[1]*i[0]],o=Math.hypot(a[0],a[1],a[2])||1;a[0]/=o,a[1]/=o,a[2]/=o;let s=[t[1]*a[2]-t[2]*a[1],t[2]*a[0]-t[0]*a[2],t[0]*a[1]-t[1]*a[0]],c=[];for(let t=0;t<r;t++){let i=t/r*Math.PI*2,o=Math.cos(i)*n,l=Math.sin(i)*n;c.push([e[0]+a[0]*o+s[0]*l,e[1]+a[1]*o+s[1]*l,e[2]+a[2]*o+s[2]*l])}return c}var zt=6400,Bt=1.92;function Vt(e,t){let n=Math.max(0,t);return e<125?-Math.min(1,n/68):Math.min(1,n/62)}function Ht(e,t){return zt*Bt**+Vt(e,t)}function Ut(e){let t=Kt(e,1e3,4e4)/100,n=t<=66?255:329.698727446*(t-60)**-.1332047592,r=t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*(t-60)**-.0755148492,i=t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307,a=[Gt(Kt(n,0,255)/255),Gt(Kt(r,0,255)/255),Gt(Kt(i,0,255)/255)],o=Math.max(a[0],a[1],a[2])||1;return[a[0]/o,a[1]/o,a[2]/o]}function Wt(e,t){return Ut(Ht(e,t))}function Gt(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function Kt(e,t,n){return e<t?t:e>n?n:e}var qt=5200;function Jt(e,t,n,r){let i=e.p[0]-e.center[0],a=e.p[1]-e.center[1],o=e.p[2]-e.center[2],s=e.period===0?0:Math.PI*2/e.period*(t/1e3),c=Math.cos(s),l=Math.sin(s),u=e.axis[0]*i+e.axis[1]*a+e.axis[2]*o,d=e.axis[1]*o-e.axis[2]*a,f=e.axis[2]*i-e.axis[0]*o,p=e.axis[0]*a-e.axis[1]*i,m=Math.sin(t/(6400+e.seed*311%5200)+e.seed)*n;return r.set(e.center[0]+i*c+d*l+e.axis[0]*(u*(1-c)+m),e.center[1]+a*c+f*l+e.axis[1]*(u*(1-c)+m),e.center[2]+o*c+p*l+e.axis[2]*(u*(1-c)+m))}function Yt(e){let t=e.stars,n=Math.max(1,...t.map(e=>e.n)),r=new Map,i=new Map;for(let t of e.clusters)r.set(t.g,t.c),i.set(t.g,It(t.g));let a=new Map;[...t].sort((e,t)=>t.pe*Math.log(1+t.n)-e.pe*Math.log(1+e.n)).forEach((e,t)=>a.set(w(e),qt+t*62));let o=$t(97);return t.map(e=>{let t=r.get(e.g)??[0,0,0],s=i.get(e.g)??[0,1,0],c=e.n/n,l=Xt(e.c),[u,d]=Zt(l);return{s:e,p:[e.p[0],e.p[1],e.p[2]],center:t,axis:s,period:Lt(e.p,t),start:Qt(o),ignite:a.get(w(e))??0,pointSize:3.4+11*c**.55,bodyR:.3+.95*c**.55,bright:.3+.7*e.pe,burst:e.bu,seed:e.n,rot:o()*Math.PI,color:Wt(e.hue,e.sat),kelvin:Ht(e.hue,e.sat),sysAxis:l,sysU:u,sysV:d}})}function Xt(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);let n=$t(t>>>0),r=[(n()-.5)*1.3,.75+n()*.5,(n()-.5)*1.3],i=Math.hypot(r[0],r[1],r[2])||1;return[r[0]/i,r[1]/i,r[2]/i]}function Zt(e){let t=Math.abs(e[1])<.9?[0,1,0]:[1,0,0],n=[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],r=Math.hypot(n[0],n[1],n[2])||1;return n[0]/=r,n[1]/=r,n[2]/=r,[n,[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]]]}function Qt(e){let t=e()*Math.PI*2,n=Math.acos(2*e()-1),r=2+e()*5;return[r*Math.sin(n)*Math.cos(t),r*Math.sin(n)*Math.sin(t),r*Math.cos(n)]}function $t(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}function en(e,t,n,r){switch(t){case`dark`:return n.dark.some(t=>t.c===e.c)?1:.08;case`nebula`:return n.nebula.some(t=>t.c===e.c)?1:.1;case`worm`:{let t=n.wormholes[r];return t&&(e.g===t.a||e.g===t.b)?1:.11}case`me`:return n.meta.own===0||e.o>0?1:.1;case`solo`:return .12;default:return 1}}function tn(e,t,n,r){let i=en(e,t,n,r);return n.dark.some(t=>t.c===e.c)?Math.min(i,.3):i}function nn(e,t,n,r){return en(e,t,n,r)>=.4}function rn(e,t,n,r,i){let a=e.find(({s:e})=>w(e)===t)??null;return a&&nn(a.s,n,r,i)?a:null}var P=.12;function an(e,t){return!t||e?1:P}function on(e,t){return an(e===t,t!==null)}var sn=2.1,cn=1.15,ln=137.508,un=31.7,dn=.22;function fn(e){return Number.isFinite(e)&&e>0?Math.floor(e):0}function pn(e){return sn+fn(e)*cn}function mn(e){return 7+2.4*(Number.isFinite(e)&&e>0?e:sn)**1.5}function hn(e,t){let n=Number.isFinite(t)?t:0;return(fn(e)*ln+n*un)*Math.PI/180}function gn(e,t,n,r){let i=(fn(e)*2654435761%1e3/1e3-.5)*dn,a=Math.cos(i),o=Math.sin(i),s=[t[0]*a+r[0]*o,t[1]*a+r[1]*o,t[2]*a+r[2]*o],c=Math.hypot(s[0],s[1],s[2])||1;return s[0]/=c,s[1]/=c,s[2]/=c,Object.freeze({u:Object.freeze(s),v:Object.freeze([n[0],n[1],n[2]])})}function _n(e){if(e)return`low`;let t=navigator.hardwareConcurrency||4,n=navigator.deviceMemory??4;return t<6||n<4?`medium`:`high`}var vn=class extends Error{code=`webgl2_required`;constructor(){super(`当前设备不支持 WebGL2，无法启动 3D 宇宙。`),this.name=`BabylonWebGL2RequiredError`}},yn=class{cleanups=[];ports;callbacks;running=!1;requested=!1;suspended=!1;destroyed=!1;readyReported=!1;fatalReported=!1;listenerCount=0;lastRenderAt=null;lastAnimating=null;actualRenders=0;lastRenderCostMs=0;maxRenderCostMs=0;constructor(e,t={}){this.ports=e,this.callbacks=t,e.releaseContext&&this.cleanups.push(e.releaseContext),this.cleanups.push(()=>e.engine.dispose()),this.cleanups.push(()=>e.scene.dispose());try{if(e.engine.webGLVersion<2)throw new vn;this.listen(`webglcontextlost`,this.onContextLost),this.listen(`webglcontextrestored`,this.onContextRestored)}catch(e){throw this.destroyed=!0,this.disposeAll(),e}}start(){this.destroyed||this.fatalReported||(this.requested=!0,this.startRequestedLoop())}stop(){this.requested=!1,this.stopActiveLoop()}suspend(){this.destroyed||this.suspended||(this.suspended=!0)}resume(){this.destroyed||!this.suspended||(this.suspended=!1,this.startRequestedLoop())}resize(){this.destroyed||this.ports.engine.resize()}destroy(){this.destroyed||(this.destroyed=!0,this.requested=!1,this.stopActiveLoop(),this.disposeAll())}resetRenderCostPeak(){this.maxRenderCostMs=0}diagnostics(){return Object.freeze({renderLoops:+!!this.running,listeners:this.listenerCount,actualRenders:this.actualRenders,lastRenderCostMs:this.lastRenderCostMs,maxRenderCostMs:this.maxRenderCostMs})}frame=()=>{if(this.destroyed||this.fatalReported||this.suspended||this.ports.isPageHidden?.())return;let e=this.callbacks.isAnimating?.()??!1,t=this.ports.now?.()??performance.now();this.lastAnimating!==e&&(this.lastAnimating=e,this.lastRenderAt=null);let n=1e3/(e?60:30);if(!(this.lastRenderAt!==null&&t-this.lastRenderAt<n))try{this.ports.scene.render();let e=this.ports.now?.()??performance.now(),n=Number.isFinite(e)?Math.max(0,e-t):0;this.lastRenderCostMs=n,this.maxRenderCostMs=Math.max(this.maxRenderCostMs,n),this.lastRenderAt=t,this.actualRenders+=1,this.readyReported||(this.readyReported=!0,this.callbacks.onReady?.())}catch(e){this.reportFatal(e)}};onContextLost=e=>{e.preventDefault();let t=Error(`WebGL context lost`);t.name=`WebGLContextLostError`,this.reportFatal(t)};onContextRestored=()=>{!this.destroyed&&!this.fatalReported&&this.resize()};listen(e,t){this.ports.canvas.addEventListener(e,t),this.listenerCount+=1,this.cleanups.push(()=>{this.ports.canvas.removeEventListener(e,t),--this.listenerCount})}startRequestedLoop(){this.running||!this.requested||this.suspended||this.destroyed||this.fatalReported||(this.ports.engine.runRenderLoop(this.frame),this.running=!0)}stopActiveLoop(){this.running&&(this.running=!1,this.ports.engine.stopRenderLoop(this.frame))}reportFatal(e){this.destroyed||this.fatalReported||(this.fatalReported=!0,this.requested=!1,this.stopActiveLoop(),this.callbacks.onError?.(e instanceof Error?e:Error(String(e))))}disposeAll(){for(let e=this.cleanups.length-1;e>=0;--e)try{this.cleanups[e]()}catch{}this.cleanups.length=0}},bn=Object.freeze({high:Object.freeze({bloomThreshold:.68,bloomWeight:.72,bloomScale:.5,bloomKernel:64,multisampling:4,fxaa:!1,maxDevicePixelRatio:2,mobileDevicePixelRatio:1.5,nebulaBake:256,shellGain:Object.freeze([.1,.075,.035]),coreGain:.38,dustDensity:1}),medium:Object.freeze({bloomThreshold:.68,bloomWeight:.62,bloomScale:.5,bloomKernel:48,multisampling:1,fxaa:!0,maxDevicePixelRatio:1.75,mobileDevicePixelRatio:1.25,nebulaBake:192,shellGain:Object.freeze([.085,.055,.025]),coreGain:.3,dustDensity:.75}),low:Object.freeze({bloomThreshold:.68,bloomWeight:.48,bloomScale:.4,bloomKernel:32,multisampling:1,fxaa:!0,maxDevicePixelRatio:1.5,mobileDevicePixelRatio:1,nebulaBake:128,shellGain:Object.freeze([.06,.035,.015]),coreGain:.22,dustDensity:.5})}),xn=Object.freeze({panorama:.5,"star-focus":1,"planet-focus":1,strata:.75});function Sn(e){return bn[e]}function Cn(e,t){let n=bn[t];return Object.freeze({enabled:!0,kernel:Math.round(n.bloomKernel*xn[e])})}function wn(e,t,n){let r=bn[n],i=t?r.mobileDevicePixelRatio:r.maxDevicePixelRatio;return Math.min(i,Math.max(1,Number.isFinite(e)&&e>0?e:1))}var Tn=(e,t,n)=>Math.min(n,Math.max(t,e)),En=(e,t,n)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n];function Dn(e){return e[0]*.2126+e[1]*.7152+e[2]*.0722}var On=.74,kn=Object.freeze([1,.34,.2]),An=.5;function jn(e){return e*On}function Mn(e){let t=Ut(jn(e)),n=En(t,kn,An),r=Dn(t)/Math.max(Dn(n),1e-6);return Object.freeze([n[0]*r,n[1]*r,n[2]*r])}function Nn(e){return Tn(.72+Math.log1p(Math.max(0,e)*4),.72,2.4)}var Pn=Nn(.85);function Fn(e,t){let n=ue(t);return[e[0]+n.panX,e[1]+n.panY,e[2]]}function In(e,t){let n=ue(t),r=Fn(e,n),i=Math.cos(n.pitch),a=[r[0]+Math.sin(n.yaw)*i*n.distance,r[1]-Math.sin(n.pitch)*n.distance,r[2]+Math.cos(n.yaw)*i*n.distance];return Object.freeze({position:a,lookAt:r})}function Ln(e,t=520){return!Number.isFinite(e)||e<=0?0:Math.min(1,e/(Number.isFinite(t)&&t>0?t:520))}var Rn=`
vec3 orbitAround(vec3 p, vec3 c, vec3 axis, float period, float t) {
  vec3 o = p - c;
  float r = length(o);
  if (r < 0.35 || period <= 0.0) return p;
  float th = 6.28318530718 / period * t;
  float ct = cos(th);
  float st = sin(th);
  return c + o * ct + cross(axis, o) * st + axis * dot(axis, o) * (1.0 - ct);
}
`,zn=`
float depthFade(float viewZ, float near, float far) {
  float d = clamp((far - viewZ) / max(1e-3, far - near), 0.0, 1.0);
  return d * d;
}
`,Bn=`
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`,Vn=`
float fbm(vec3 p) {
  float f = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    f += a * snoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return f;
}

float warpedFbm(vec3 p, float warp) {
  vec3 q = vec3(fbm(p), fbm(p + vec3(5.2, 1.3, 7.1)), fbm(p + vec3(1.7, 9.2, 3.4)));
  return fbm(p + warp * q);
}
`,Hn=Object.freeze([Object.freeze({r:1,freq:3.4,warp:1.1,low:.1,high:.62,flat:1.45,dust:.55,spin:.0042}),Object.freeze({r:1.62,freq:2.3,warp:.85,low:.16,high:.7,flat:1.05,dust:.38,spin:.0026}),Object.freeze({r:2.45,freq:1.5,warp:.55,low:.24,high:.8,flat:.72,dust:.2,spin:.0015})]),Un=2.25,Wn=.78,Gn=`
precision highp float;
${Bn}
${Vn}
uniform float face;
uniform float uFreq, uWarp, uLow, uHigh, uFlat, uDust, uSeed;
uniform vec3 uColA, uColB, uColC;
varying vec2 vUV;

/** 立方体贴图取样方向的逆映射，与 GL 的面序一致，跨面连续无缝。 */
vec3 faceDirection(float index, vec2 uv) {
  float u = uv.x * 2.0 - 1.0;
  float v = uv.y * 2.0 - 1.0;
  if (index < 0.5) return vec3(1.0, -v, -u);
  if (index < 1.5) return vec3(-1.0, -v, u);
  if (index < 2.5) return vec3(u, 1.0, v);
  if (index < 3.5) return vec3(u, -1.0, -v);
  if (index < 4.5) return vec3(u, -v, 1.0);
  return vec3(-u, -v, -1.0);
}

void main(void) {
  vec3 d = normalize(faceDirection(face, vUV));
  vec3 q = d * uFreq + uSeed;

  float n = warpedFbm(q, uWarp);
  float m = smoothstep(uLow, uHigh, n);

  // 两条独立的噪声通道决定色相，否则整片星云只有一个颜色
  float c1 = clamp(fbm(q * 1.63 + 7.0) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uColA, uColB, c1);
  col = mix(col, uColC, smoothstep(0.34, 0.95, n));

  // 尘埃带：真星系都有的暗痕，靠减法而不是画一条黑条
  float dust = smoothstep(0.15, 0.75, fbm(q * 2.6 - 13.0));
  m *= 1.0 - uDust * dust;

  // 盘是扁的：赤道浓、两极稀
  float band = exp(-pow(d.y * uFlat, 2.0));
  m *= mix(0.18, 1.0, band);

  gl_FragColor = vec4(col * m, 1.0);
}
`,Kn=`
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
  vDir = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`,qn=`
precision highp float;
uniform samplerCube uMap;
uniform float uGain;
varying vec3 vDir;
void main(void) {
  gl_FragColor = vec4(textureCube(uMap, normalize(vDir)).rgb * uGain, 1.0);
}
`,Jn=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUv;
void main(void) {
  vUv = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`,Yn=`
precision highp float;
uniform vec3 uTint;
uniform float uGain;
varying vec2 vUv;
void main(void) {
  // 扁的：星系核心是个透视中的盘，不是球
  vec2 p = (vUv - 0.5) * vec2(2.0, 5.2);
  float d = length(p);
  float halo = exp(-d * 2.6) * 0.16 + exp(-d * 7.5) * 0.40;
  gl_FragColor = vec4(mix(uTint, vec3(1.0), 0.45) * halo * uGain, 1.0);
}
`,Xn=class{shells;core;coreMaterial;coreBaseGain;bakeSize;dim=1;disposed=!1;constructor(e,t){let{radius:n,palette:r,environment:i,parent:a}=t;this.bakeSize=i.nebulaBake,this.coreBaseGain=i.coreGain*Wn;let o=e=>r[e]??r[0]??[.6,.7,1];this.shells=Hn.map((t,r)=>{let s=new d(`nebula:shell:${r}:bake`,i.nebulaBake,{fragmentSource:Gn},e,null,!1,!0);s.setFloat(`uFreq`,t.freq),s.setFloat(`uWarp`,t.warp),s.setFloat(`uLow`,t.low),s.setFloat(`uHigh`,t.high),s.setFloat(`uFlat`,t.flat),s.setFloat(`uDust`,t.dust),s.setFloat(`uSeed`,3.7+r*17.3),s.setColor3(`uColA`,Zn(o(0))),s.setColor3(`uColB`,Zn(o(1))),s.setColor3(`uColC`,Zn(o(2))),s.refreshRate=0;let c=new m(`nebula:shell:${r}:material`,e,{vertexSource:Kn,fragmentSource:qn},{attributes:[`position`],uniforms:[`worldViewProjection`,`uGain`],samplers:[`uMap`],needAlphaBlending:!0});c.setTexture(`uMap`,s),c.setFloat(`uGain`,(i.shellGain[r]??0)*Wn),c.alphaMode=x.ALPHA_ADD,c.backFaceCulling=!0,c.sideOrientation=C.BACKSIDE,c.disableDepthWrite=!0,c.forceDepthWrite=!1;let l=v(`nebula:shell:${r}`,{size:1,sideOrientation:C.BACKSIDE},e);return l.parent=a??null,l.material=c,l.isPickable=!1,l.infiniteDistance=!1,l.alwaysSelectAsActiveMesh=!0,l.scaling.setAll(n*t.r*22),l.renderingGroupId=0,l.rotation.set(r*1.31,r*2.17,r*.73),Object.freeze({mesh:l,material:c,texture:s,spin:t.spin,index:r,baseGain:(i.shellGain[r]??0)*Wn})}),this.coreMaterial=new m(`nebula:core:material`,e,{vertexSource:Jn,fragmentSource:Yn},{attributes:[`position`,`uv`],uniforms:[`worldViewProjection`,`uTint`,`uGain`],needAlphaBlending:!0}),this.coreMaterial.setColor3(`uTint`,Zn(o(1))),this.coreMaterial.setFloat(`uGain`,this.coreBaseGain),this.coreMaterial.alphaMode=x.ALPHA_ADD,this.coreMaterial.backFaceCulling=!1,this.coreMaterial.disableDepthWrite=!0;let s=n*Un;this.core=re(`nebula:core`,{size:s},e),this.core.parent=a??null,this.core.material=this.coreMaterial,this.core.isPickable=!1,this.core.alwaysSelectAsActiveMesh=!0,this.core.billboardMode=C.BILLBOARDMODE_ALL}update(e){if(this.disposed)return;let t=Number.isFinite(e)?e:0;for(let e of this.shells)e.mesh.rotation.set(e.index*1.31,e.index*2.17+t*e.spin,e.index*.73)}setDim(e){if(!this.disposed){this.dim=Number.isFinite(e)?Math.max(0,e):1;for(let e of this.shells)e.material.setFloat(`uGain`,e.baseGain*this.dim);this.coreMaterial.setFloat(`uGain`,this.coreBaseGain*this.dim)}}diagnostics(){return Object.freeze({shellCount:this.shells.length,coreCount:+!this.disposed,meshCount:this.shells.length+ +!this.disposed,shellRadii:this.shells.map(({mesh:e})=>e.scaling.x),shellRotations:this.shells.map(({mesh:e})=>Object.freeze([e.rotation.x,e.rotation.y,e.rotation.z])),bakedTextureCount:this.shells.length,refreshRates:this.shells.map(({texture:e})=>e.refreshRate),perFrameNoise:this.shells.some(({texture:e})=>e.refreshRate>0),bakeSize:this.bakeSize,gains:[...this.shells.map(({baseGain:e})=>e*this.dim),this.coreBaseGain*this.dim],shellBackFaceCulling:this.shells.map(({material:e})=>e.backFaceCulling),shellSideOrientation:this.shells.map(({material:e})=>e.sideOrientation??C.BACKSIDE),disposed:this.disposed})}dispose(){if(!this.disposed){this.disposed=!0;for(let e of this.shells)e.mesh.dispose(!1,!1),e.material.dispose(),e.texture.dispose();this.core.dispose(!1,!1),this.coreMaterial.dispose()}}};function Zn(e){return new r(e[0],e[1],e[2])}var Qn=60*Math.PI/180,$n=1.62,er=4.6,tr=.62,nr=4.5,rr=1.2,ir=Math.atan(8/16)/(Qn/2),ar=.85,or=.9;function sr(e){let t=Math.hypot(e[0],e[1],e[2]);return Number.isFinite(t)?t:0}function cr(e,t){let n=0;for(let t of e)n=Math.max(n,sr(t.p));for(let e of t)n=Math.max(n,sr(e.c));return Math.max(60,n)}function lr(e){return(Number.isFinite(e)&&e>0?e:60)*$n}function ur(e,t){let n=(Number.isFinite(e)&&e>0?e:0)/Math.tan((Number.isFinite(t)&&t>0&&t<Math.PI?t:Qn)/2*ir);return Math.max(nr,16,Number.isFinite(n)?n:nr)}function dr(e){return Math.min(6,Math.max(2.8,(Number.isFinite(e)&&e>0?e:0)*.8))}function fr(e,t){let n=Number.isFinite(t.sceneRadius)&&t.sceneRadius>0?t.sceneRadius:60,r=e===`planet-focus`?rr:e===`star-focus`?nr:n*tr;return Object.freeze({low:r,high:n*er})}function pr(e,t){return e===`planet-focus`?(Number.isFinite(t.systemDistance)&&t.systemDistance>0?t.systemDistance:ur(8,Qn))*ar:e===`star-focus`?(Number.isFinite(t.sceneRadius)&&t.sceneRadius>0?t.sceneRadius:60)*or:null}var mr=.5,hr=-.2;function gr(e,t){let n=Number.isFinite(e)?e:mr,r=Number.isFinite(t)?t:hr,i=Math.sin(n)*Math.cos(r),a=-Math.sin(r),o=Math.cos(n)*Math.cos(r);return Object.freeze({alpha:Math.atan2(o,i),beta:Math.acos(Math.min(1,Math.max(-1,a)))})}var _r=`
precision highp float;
${Rn}
${zn}

attribute vec3 position;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute vec3 aColor;
attribute float aPeriod;
attribute float aSize;
attribute float aDim;
attribute float aSeed;

uniform mat4 worldView;
uniform mat4 projection;
uniform float uT;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
uniform float uTwinkle;

varying vec3 vColor;
varying float vAlpha;

void main(void) {
  vec3 p = orbitAround(position, aCenter, aAxis, aPeriod, uT * 0.001);
  vec4 mv = worldView * vec4(p, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projection * mv;

  float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uT / (1100.0 + mod(aSeed * 91.0, 1700.0)) + aSeed));
  vColor = aColor;
  vAlpha = aDim * tw * depthFade(viewZ, uNear, uFar);
  // 必须封顶。尘埃是一条内容，飞进恒星系时它按 1/z 能涨到上百像素，
  // 整个背景会糊成一团棉花。
  gl_PointSize = clamp(aSize * (uProjScale / viewZ), 1.0, 9.0);
}
`,vr=`
precision highp float;
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main(void) {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(offset, offset);
  if (d2 > 1.0) discard;
  float energy = exp(-d2 * 3.4) * vAlpha;
  if (energy <= 0.0006) discard;
  gl_FragColor = vec4(vColor * energy * uGain, energy);
}
`,yr=[`position`,`aCenter`,`aAxis`,`aColor`,`aPeriod`,`aSize`,`aDim`,`aSeed`],br=[`worldView`,`projection`,`uT`,`uProjScale`,`uNear`,`uFar`,`uTwinkle`,`uGain`],xr=.3,Sr=.85;function Cr(e,t){return e===`all`?1:e===`worm`?t?.9:.07:.12}function wr(e){return e===`solo`?1:e===`all`?.34:.08}function Tr(e,t){if(e<=0)return[];let n=Math.max(1,Math.round(e*(Number.isFinite(t)?Math.min(1,Math.max(0,t)):1)));if(n>=e)return Array.from({length:e},(e,t)=>t);let r=e/n;return Array.from({length:n},(t,n)=>Math.min(e-1,Math.floor(n*r)))}var Er=class{dust;solo;dustGroups;dim=1;disposed=!1;ownSizeValue=0;otherSizeValue=0;constructor(e,t,n){let{environment:r,reducedMotion:i,parent:a}=n,o=new Map,s=new Map,c=new Map;for(let e of t.clusters??[])o.set(e.g,e.c),s.set(e.g,It(e.g)),c.set(e.g,[e.hue,e.sat]);let l=t.particles??[],u=Tr(l.length,r.dustDensity);this.dustGroups=Int32Array.from(u,e=>l[e][3]??0),this.dust=u.length>0?this.createBatch(e,`dust`,u.length,xr,0,a,(e,t)=>{let n=l[u[e]],r=n[3]??0,[i,a]=c.get(r)??[218,0],d=+!!n[4];t.position=[n[0],n[1],n[2]],t.center=o.get(r)??[0,0,0],t.axis=s.get(r)??[0,1,0],t.period=Lt(t.position,t.center),t.color=Wt(i,d?Math.max(a,24):a),t.size=d?1.9:1.35,t.seed=u[e]*.618,d?this.ownSizeValue=t.size:this.otherSizeValue=t.size}):null;let d=t.solo??[],f=Tr(d.length,r.dustDensity);this.solo=f.length>0?this.createBatch(e,`solo`,f.length,Sr,i?0:.55,a,(e,t)=>{let n=d[f[e]];t.position=[n.p[0],n.p[1],n.p[2]],t.center=t.position,t.axis=[0,1,0],t.period=0,t.color=[.72,.8,1],t.size=2.2,t.seed=f[e]*1.37+5}):null}setUniform(e,t){if(!this.disposed)for(let n of this.batches())n.material.setFloat(e,t)}setMode(e,t,n){if(this.disposed)return;let r=t.wormholes?.[n];if(this.dust){for(let t=0;t<this.dust.dimensions.length;t+=1){let n=this.dustGroups[t],i=!!r&&(n===r.a||n===r.b);this.dust.dimensions[t]=Cr(e,i)}this.dust.geometry.updateVerticesData(`aDim`,this.dust.dimensions,!1)}this.solo&&(this.solo.dimensions.fill(wr(e)),this.solo.geometry.updateVerticesData(`aDim`,this.solo.dimensions,!1))}setDim(e){if(!this.disposed){this.dim=Number.isFinite(e)?Math.max(0,e):1;for(let e of this.batches())e.material.setFloat(`uGain`,e.baseGain*this.dim)}}diagnostics(){return Object.freeze({dustCount:this.dust?.dimensions.length??0,soloCount:this.solo?.dimensions.length??0,batchCount:this.disposed?0:this.batches().length,geometryCount:this.disposed?0:this.batches().length,ownSize:this.ownSizeValue,otherSize:this.otherSizeValue,gains:this.batches().map(({baseGain:e})=>e*this.dim),soloDimensions:Array.from(this.solo?.dimensions??[]),dustDimensions:Array.from(this.dust?.dimensions??[]),disposed:this.disposed})}dispose(){if(!this.disposed){this.disposed=!0;for(let e of[this.dust,this.solo])e&&(e.mesh.dispose(!1,!1),e.material.dispose(),e.geometry.dispose())}}batches(){return[this.dust,this.solo].filter(e=>e!==null)}createBatch(e,t,n,r,i,a,o){let s=new Float32Array(n*3),c=new Float32Array(n*3),l=new Float32Array(n*3),u=new Float32Array(n*3),d=new Float32Array(n),p=new Float32Array(n),h=new Float32Array(n).fill(1),g=new Float32Array(n),_={position:[0,0,0],center:[0,0,0],axis:[0,1,0],color:[1,1,1],period:0,size:1,seed:0};for(let e=0;e<n;e+=1)o(e,_),s.set(_.position,e*3),c.set(_.center,e*3),l.set(_.axis,e*3),u.set(_.color,e*3),d[e]=_.period,p[e]=_.size,g[e]=_.seed;let v=new f(`dust:${t}:geometry`,e);v.setVerticesData(`position`,s,!1,3),v.setVerticesData(`aCenter`,c,!1,3),v.setVerticesData(`aAxis`,l,!1,3),v.setVerticesData(`aColor`,u,!1,3),v.setVerticesData(`aPeriod`,d,!1,1),v.setVerticesData(`aSize`,p,!1,1),v.setVerticesData(`aDim`,h,!0,1),v.setVerticesData(`aSeed`,g,!1,1);let y=new C(`dust:${t}`,e);y.parent=a??null,y.isPickable=!1,y.isUnIndexed=!0,y.alwaysSelectAsActiveMesh=!0,v.applyToMesh(y);let b=new m(`dust:${t}:material`,e,{vertexSource:_r,fragmentSource:vr},{attributes:yr,uniforms:br,needAlphaBlending:!0});return b.fillMode=x.MATERIAL_PointFillMode,b.alphaMode=x.ALPHA_ADD,b.disableDepthWrite=!0,b.setFloat(`uT`,0),b.setFloat(`uProjScale`,500),b.setFloat(`uNear`,1),b.setFloat(`uFar`,4e3),b.setFloat(`uTwinkle`,i),b.setFloat(`uGain`,r),y.material=b,Object.freeze({mesh:y,material:b,geometry:v,dimensions:h,baseGain:r})}};Object.freeze([`starfield`,`starSpots`,`starGranulation`,`starProminences`,`coronaStreamers`,`starDiffraction`,`planetClouds`,`planetNightSide`,`planetAtmosphere`,`probeAccentLights`,`probeThruster`,`strataLaminations`,`strataGuideLight`,`spaceFog`]);var Dr=Object.freeze({high:Object.freeze({starfieldCount:2400,starfieldStrata:3,starfieldPeakAlpha:.82,granulationOctaves:4,starSpotCount:5,starProminenceCount:4,coronaStreamerCount:7,diffractionSpikeCount:6,planetCloudOctaves:4,planetNightDensity:1,atmosphereScatteringLevel:2,probeAccentLights:3,probeThrusterSegments:5,strataLaminationBands:3,strataGuideIntensity:1,spaceFogDensity:1}),medium:Object.freeze({starfieldCount:1500,starfieldStrata:3,starfieldPeakAlpha:.78,granulationOctaves:3,starSpotCount:4,starProminenceCount:3,coronaStreamerCount:5,diffractionSpikeCount:4,planetCloudOctaves:3,planetNightDensity:.78,atmosphereScatteringLevel:2,probeAccentLights:2,probeThrusterSegments:4,strataLaminationBands:3,strataGuideIntensity:.86,spaceFogDensity:.82}),low:Object.freeze({starfieldCount:820,starfieldStrata:3,starfieldPeakAlpha:.72,granulationOctaves:2,starSpotCount:3,starProminenceCount:2,coronaStreamerCount:4,diffractionSpikeCount:4,planetCloudOctaves:2,planetNightDensity:.6,atmosphereScatteringLevel:1,probeAccentLights:1,probeThrusterSegments:3,strataLaminationBands:2,strataGuideIntensity:.7,spaceFogDensity:.62})});function F(e){return Dr[e]}var Or=`
precision highp float;
attribute vec3 position;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
uniform mat4 worldView;
uniform mat4 projection;
uniform float uTime;
uniform float uTwinkle;
uniform float uProjScale;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main(void) {
  vec4 mv = worldView * vec4(position, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projection * mv;
  // 闪烁是大气视宁度，不是恒星本身。它幅度小、周期各不相同，
  // 于是整片星场不会同呼吸 —— 那会读成一次曝光抖动。
  float twinkle = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime / (900.0 + mod(aSeed * 137.0, 2300.0)) + aSeed));
  vColor = aColor;
  vAlpha = twinkle * uOpacity;
  gl_PointSize = clamp(aSize * (uProjScale / viewZ), 1.0, 3.4);
}
`,kr=`
precision highp float;
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main(void) {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(offset, offset);
  if (d2 > 1.0) discard;
  float energy = exp(-d2 * 3.9) * vAlpha;
  if (energy <= 0.0008) discard;
  gl_FragColor = vec4(vColor * energy * uGain, energy);
}
`,Ar=[`position`,`aColor`,`aSize`,`aSeed`],jr=[`worldView`,`projection`,`uTime`,`uTwinkle`,`uProjScale`,`uOpacity`,`uGain`],Mr=.18,Nr=.22,Pr=Object.freeze([1.55,2.35,3.6]),Fr=Object.freeze([.18,.31,.51]),Ir=Object.freeze([.82,.54,.3]),Lr=Object.freeze([2.6,1.9,1.3]);function Rr(e,t){let n=Math.max(1,Number.isFinite(t)?t:1),r=Math.max(3,Math.round(e.starfieldCount)),i=Fr.map(e=>Math.max(1,Math.round(r*e))),a=r-i.reduce((e,t)=>e+t,0);return i[i.length-1]=Math.max(1,i.at(-1)+a),Object.freeze(Pr.map((t,r)=>Object.freeze({radius:n*t,count:i[r],alpha:Math.min(e.starfieldPeakAlpha,Ir[r]),size:Lr[r]})))}var zr=Object.freeze([Object.freeze({kelvin:3100,share:.62}),Object.freeze({kelvin:4600,share:.2}),Object.freeze({kelvin:5900,share:.1}),Object.freeze({kelvin:7600,share:.05}),Object.freeze({kelvin:11500,share:.03})]),Br=class{batches;pointCount;colourSpread;checksum;twinkle;phaseOpacity=1;disposed=!1;constructor(e,t){let n=Rr(F(t.quality),t.radius);this.twinkle=t.reducedMotion?0:Mr;let r=0,i=0,a=[];this.batches=n.map((n,o)=>{let s=Ur(1592590337+o*40503),c=new Float32Array(n.count*3),l=new Float32Array(n.count*3),u=new Float32Array(n.count),d=new Float32Array(n.count);for(let e=0;e<n.count;e+=1){let t=s()*2-1,r=s()*Math.PI*2,o=Math.sqrt(Math.max(0,1-t*t)),f=n.radius*(.86+s()*.28);c[e*3]=f*o*Math.cos(r),c[e*3+1]=f*t,c[e*3+2]=f*o*Math.sin(r);let p=Vr(s()),[m,h,g]=Ut(p);l[e*3]=m,l[e*3+1]=h,l[e*3+2]=g,a.push(m-g),u[e]=n.size*(.7+s()*.6),d[e]=s()*100,i=(i+Math.round(f*13+p))%4294967295}return r+=n.count,this.createBatch(e,o,n,c,l,u,d,t.parent)}),this.pointCount=r,this.colourSpread=Hr(a),this.checksum=i}setPhaseOpacity(e){if(this.disposed)return;let t=Number.isFinite(e)?e:1;this.phaseOpacity=Math.min(1,Math.max(Nr,t));for(let{material:e}of this.batches)e.setFloat(`uOpacity`,this.phaseOpacity)}setReducedMotion(e){if(!this.disposed){this.twinkle=e?0:Mr;for(let{material:e}of this.batches)e.setFloat(`uTwinkle`,this.twinkle)}}update(e,t){if(this.disposed)return;let n=Number.isFinite(e)&&e>0?e:0,r=Number.isFinite(t)&&t>0?t:500;for(let{material:e}of this.batches)e.setFloat(`uTime`,this.twinkle===0?0:n),e.setFloat(`uProjScale`,r)}diagnostics(){return Object.freeze({batchCount:this.batches.length,pointCount:this.pointCount,colourSpread:this.colourSpread,twinkle:this.twinkle,phaseOpacity:this.phaseOpacity,checksum:this.checksum,disposed:this.disposed})}dispose(){if(!this.disposed){this.disposed=!0;for(let{mesh:e,material:t,geometry:n}of this.batches)e.dispose(!1,!1),t.dispose(),n.dispose()}}createBatch(e,t,n,r,i,a,o,s){let c=new C(`starfield:shell-${t}`,e);c.parent=s??null,c.isPickable=!1,c.isUnIndexed=!0,c.alwaysSelectAsActiveMesh=!0,c.infiniteDistance=!1;let l=new ce;l.positions=r,l.applyToMesh(c,!1);let u=new f(`starfield:shell-${t}:geometry`,e,l,!1,c);u.setVerticesData(`aColor`,i,!1,3),u.setVerticesData(`aSize`,a,!1,1),u.setVerticesData(`aSeed`,o,!1,1);let d=new m(`starfield:shell-${t}:material`,e,{vertexSource:Or,fragmentSource:kr},{attributes:Ar,uniforms:jr,needAlphaBlending:!0});return d.fillMode=x.MATERIAL_PointFillMode,d.alphaMode=x.ALPHA_ADD,d.disableDepthWrite=!0,d.backFaceCulling=!1,d.setFloat(`uTime`,0),d.setFloat(`uTwinkle`,this.twinkle),d.setFloat(`uProjScale`,500),d.setFloat(`uOpacity`,1),d.setFloat(`uGain`,n.alpha),c.material=d,{mesh:c,material:d,geometry:u,alpha:n.alpha}}};function Vr(e){let t=0;for(let{kelvin:n,share:r}of zr)if(t+=r,e<=t)return n;return zr.at(-1).kelvin}function Hr(e){return e.length===0?0:Math.max(...e)-Math.min(...e)}function Ur(e){let t=e>>>0||2654435769;return()=>(t^=t<<13,t^=t>>>17,t^=t<<5,t>>>=0,t/4294967296)}var Wr=Object.freeze([.42,.78,1]),I=Object.freeze([.03,.052,.07]),Gr=Object.freeze([.008,.012,.02]),Kr=.022;function qr(e,t){let n=Number.isFinite(t)&&t>0?t:1,r=Math.min(1,(Number.isFinite(e)?Math.max(0,e):0)/n);return Object.freeze({color:Object.freeze([I[0]+(Gr[0]-I[0])*r,I[1]+(Gr[1]-I[1])*r,I[2]+(Gr[2]-I[2])*r]),density:Kr+.024*r})}var Jr=3.4;function Yr(e,t){return Object.freeze({y:-((Number.isFinite(e)?Math.max(0,e):0)-Jr),intensity:1.15*Math.max(.05,t.strataGuideIntensity),range:22,color:Wr})}var Xr=Object.freeze([1,.62,.24]),Zr=Object.freeze([.3,.68,1]),Qr=Object.freeze([.52,.7,.82]);function $r(e){let t=Number.isFinite(e.scale)?Math.max(.05,e.scale):1,n=e.created?Xr:e.collected?Zr:Qr,r=e.created?.95:e.collected?.68:.34;return Object.freeze({radius:t*2.15,intensity:r,color:n})}var ei=Object.freeze([.016,.024,.048]),ti=Object.freeze({high:Object.freeze({vignetteWeight:1.65,vignetteColor:ei,grainIntensity:4.2,chromaticAberration:2.4,shadowsCoolness:-14,highlightsWarmth:12,globalSaturation:6}),medium:Object.freeze({vignetteWeight:1.45,vignetteColor:ei,grainIntensity:3.4,chromaticAberration:1.4,shadowsCoolness:-12,highlightsWarmth:10,globalSaturation:5}),low:Object.freeze({vignetteWeight:1.2,vignetteColor:ei,grainIntensity:2.6,chromaticAberration:0,shadowsCoolness:-10,highlightsWarmth:8,globalSaturation:4})});function ni(e){return Object.freeze({...ti[e],exposure:.92,bloomThreshold:Sn(e).bloomThreshold})}function ri(e,t,n){let r=Number.isFinite(e)&&e>0?e:1,i=Number.isFinite(t)&&t>0?t:r,a=Math.min(1,Math.max(0,n.spaceFogDensity)),o=Math.max(1,i-r*1.15),s=1.75-a*.45;return Object.freeze({near:o,far:Math.max(o+1,i+r*s)})}var ii=.012;function ai(e){return Object.freeze(e?{inertia:.55,panningInertia:.42,angularSensibility:1400,wheelDeltaPercentage:ii}:{inertia:.88,panningInertia:.8,angularSensibility:1100,wheelDeltaPercentage:ii})}var L=Object.freeze([1,.78,.42]),oi=Object.freeze([.34,.78,1.15]);function si(e,t){let n=ci(e),r=ci(t),i=Math.min(.42,n*.14+r*.26);if(i<=0)return Object.freeze({intensity:0,color:L});let a=r*.26/Math.max(i,1e-6);return Object.freeze({intensity:i,color:Object.freeze([L[0]+(oi[0]-L[0])*a,L[1]+(oi[1]-L[1])*a,L[2]+(oi[2]-L[2])*a])})}function ci(e){return Math.min(1,Math.max(0,Number.isFinite(e)?e:0))}var li=Object.freeze([Object.freeze([.12,.19,.66]),Object.freeze([.54,.16,.6]),Object.freeze([.04,.42,.48])]),ui=(e,t,n)=>Object.freeze([e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n]),di=Object.freeze([1,1,1]);function fi(e){let t=[...e].sort((e,t)=>t.n-e.n).slice(0,3);if(t.length===0)return li;let n=e=>{let n=t[e]??t[0];return Object.freeze(Wt(n.hue,n.sat))},r=ui(n(2),di,.62);return Object.freeze([ui(li[0],n(0),.26),ui(li[1],n(1),.3),ui(li[2],r,.26)])}Object.freeze([`all`,`worm`,`dark`,`nebula`,`solo`,`me`]);var R=.14;function pi(e){return Object.freeze({clusterRings:R,wormholes:0,darkMatter:R,dust:R,soloParticles:R,nebulaStars:R,ownStars:R,...e})}var mi=Object.freeze({all:pi({clusterRings:1,dust:1,darkMatter:R,soloParticles:.34}),worm:pi({wormholes:1,clusterRings:1,dust:.9}),dark:pi({darkMatter:1}),nebula:pi({nebulaStars:1}),solo:pi({soloParticles:1}),me:pi({ownStars:1})});function hi(e,t){if(e===`dark`)return(t.dark??[]).map(({c:e})=>e);if(e===`nebula`)return(t.nebula??[]).map(({c:e})=>e);if(e===`solo`)return(t.solo??[]).map(({c:e})=>e);if(e===`me`){let e=(t.stars??[]).filter(({o:e})=>e>0).map(({c:e})=>e);return t.meta?.own===0?[]:e}return[]}function gi(e,t,n){let r=e===`worm`?(t.wormholes??[])[n]:void 0;return Object.freeze({mode:e,layers:mi[e]??mi.all,wormholeClusters:Object.freeze(r?[r.a,r.b]:[]),highlightedConcepts:Object.freeze(hi(e,t))})}var _i=96,vi=.24,yi=`
precision highp float;
${zn}
attribute vec3 position;
attribute vec3 aColor;
attribute float aDim;
uniform mat4 worldView;
uniform mat4 projection;
uniform float uNear;
uniform float uFar;
varying vec3 vColor;
varying float vAlpha;
void main(void) {
  vec4 mv = worldView * vec4(position, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projection * mv;
  vColor = aColor;
  vAlpha = aDim * depthFade(viewZ, uNear, uFar);
}
`,bi=`
precision highp float;
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main(void) {
  if (vAlpha <= 0.002) discard;
  gl_FragColor = vec4(vColor * vAlpha * uGain, vAlpha);
}
`;function xi(e,t){let n=new Set;for(let r of e.mem??[]){let i=t.find(e=>e.c===r);if(!i)continue;let a=Math.hypot(i.p[0]-e.c[0],i.p[1]-e.c[1],i.p[2]-e.c[2]);a>1.5&&n.add(Math.round(a))}return[...n].sort((e,t)=>e-t)}var Si=class{mesh=null;material=null;geometry=null;groups;modeDimensions;gainValue=vi;dimensions;ringCountValue;focusedCluster=null;disposed=!1;constructor(e,t,n){let r=[],i=[],a=[],o=0;for(let e of t.clusters??[]){let n=It(e.g),s=Wt(e.hue,e.sat);for(let c of xi(e,t.stars??[])){o+=1;let t=Rt(e.c,n,c,_i);for(let n=0;n<t.length;n+=1){let o=t[n],c=t[(n+1)%t.length];r.push(o[0],o[1],o[2],c[0],c[1],c[2]),i.push(s[0],s[1],s[2],s[0],s[1],s[2]),a.push(e.g,e.g)}}}this.ringCountValue=o,this.groups=Int32Array.from(a),this.modeDimensions=new Float32Array(a.length).fill(1),this.dimensions=new Float32Array(a.length).fill(1),a.length!==0&&(this.geometry=new f(`cluster-rings:geometry`,e),this.geometry.setVerticesData(`position`,Float32Array.from(r),!1,3),this.geometry.setVerticesData(`aColor`,Float32Array.from(i),!1,3),this.geometry.setVerticesData(`aDim`,this.dimensions,!0,1),this.mesh=new C(`cluster-rings`,e),this.mesh.parent=n??null,this.mesh.isPickable=!1,this.mesh.isUnIndexed=!0,this.mesh.alwaysSelectAsActiveMesh=!0,this.geometry.applyToMesh(this.mesh),this.material=new m(`cluster-rings:material`,e,{vertexSource:yi,fragmentSource:bi},{attributes:[`position`,`aColor`,`aDim`],uniforms:[`worldView`,`projection`,`uNear`,`uFar`,`uGain`],needAlphaBlending:!0}),this.material.fillMode=x.MATERIAL_LineListDrawMode,this.material.alphaMode=x.ALPHA_ADD,this.material.disableDepthWrite=!0,this.material.setFloat(`uNear`,1),this.material.setFloat(`uFar`,4e3),this.material.setFloat(`uGain`,vi),this.mesh.material=this.material)}setUniform(e,t){this.disposed||(this.material?.setFloat(e,t),e===`uGain`&&(this.gainValue=t))}setMode(e,t,n){if(this.disposed)return;let r=gi(e,t,n),i=new Set(r.wormholeClusters);for(let t=0;t<this.modeDimensions.length;t+=1)this.modeDimensions[t]=e===`worm`&&i.has(this.groups[t])?1:r.layers.clusterRings;this.applyDimensions()}setFocus(e){this.disposed||(this.focusedCluster=e,this.applyDimensions())}diagnostics(){return Object.freeze({ringCount:this.ringCountValue,gain:this.gainValue,batchCount:this.disposed||!this.mesh?0:1,vertexCount:this.groups.length,dimensions:Array.from(this.dimensions),disposed:this.disposed})}dispose(){this.disposed||(this.disposed=!0,this.mesh?.dispose(!1,!1),this.material?.dispose(),this.geometry?.dispose())}applyDimensions(){for(let e=0;e<this.dimensions.length;e+=1)this.dimensions[e]=this.modeDimensions[e]*on(this.groups[e],this.focusedCluster);this.geometry?.updateVerticesData(`aDim`,this.dimensions,!1)}},Ci=[1,.62,.24],wi=2.6,Ti=Object.freeze({high:1,medium:.7,low:.45}),Ei=`
precision highp float;
${zn}
attribute vec3 position;
attribute float aT;
attribute float aWorm;
attribute float aFocus;
uniform mat4 worldView;
uniform mat4 projection;
uniform float uT;
uniform float uActive;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
varying float vAlpha;
void main(void) {
  vec4 mv = worldView * vec4(position, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projection * mv;

  float on = step(abs(aWorm - uActive), 0.5);
  // 三道脉冲沿曲线跑；尾部拖长，头部收紧
  float phase = fract(aT * 3.0 - uT * 0.00042);
  float pulse = pow(1.0 - phase, 5.0);
  float base = 0.16 + 0.84 * pulse;

  vAlpha = on * base * aFocus * depthFade(viewZ, uNear, uFar);
  gl_PointSize = clamp((1.6 + 4.6 * pulse) * (uProjScale / viewZ) * 0.55, 1.0, 10.0);
}
`,Di=`
precision highp float;
uniform vec3 uColor;
uniform float uGain;
varying float vAlpha;
void main(void) {
  if (vAlpha <= 0.003) discard;
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(offset, offset);
  if (d2 > 1.0) discard;
  float energy = exp(-d2 * 3.0) * vAlpha;
  gl_FragColor = vec4(uColor * energy * uGain, energy);
}
`,Oi=`
precision highp float;
${Rn}
${zn}
attribute vec3 position;
attribute vec2 aCorner;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute float aPeriod;
attribute float aRadius;
attribute float aSeed;
attribute float aFocus;
uniform mat4 worldView;
uniform mat4 projection;
uniform float uT;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main(void) {
  vec3 orbited = orbitAround(position, aCenter, aAxis, aPeriod, uT * 0.001);
  vec4 mv = worldView * vec4(orbited, 1.0);
  float viewZ = max(1.0, -mv.z);
  mv.xy += aCorner * aRadius;
  gl_Position = projection * mv;
  vUv = aCorner;
  vSeed = aSeed;
  vAlpha = aFocus * depthFade(viewZ, uNear, uFar);
}
`,ki=`
precision highp float;
uniform float uT;
uniform float uEmphasis;
uniform vec3 uColor;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main(void) {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);
  float pulse = 0.85 + 0.15 * sin(uT * 0.00038 + vSeed);

  // 外圈：透镜的作用半径
  float halo = exp(-pow((r - 0.92) / 0.045, 2.0)) * 0.28;

  // 爱因斯坦环：两段相对的弧，中间是空的
  float arc = exp(-pow((r - 0.62) / 0.055, 2.0));
  float lobes = pow(max(0.0, abs(cos(ang))), 5.0);

  float a = (halo * 0.9 + arc * lobes * 1.5) * pulse * vAlpha * uEmphasis;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(mix(uColor, vec3(0.86, 0.90, 1.0), arc * lobes) * a, a);
}
`;function Ai(e,t){let n=[t[0]-e[0],t[1]-e[1],t[2]-e[2]],r=Math.hypot(n[0],n[1],n[2])||1,i=[n[0]/r,n[1]/r,n[2]/r],a=i[1],o=[-i[0]*a,1-i[1]*a,-i[2]*a],s=Math.hypot(o[0],o[1],o[2]);s<1e-4&&(o=[1-i[0]*i[0],-i[1]*i[0],-i[2]*i[0]],s=Math.hypot(o[0],o[1],o[2])||1);let c=r*.3;return[(e[0]+t[0])/2+o[0]/s*c,(e[1]+t[1])/2+o[1]/s*c,(e[2]+t[2])/2+o[2]/s*c]}function ji(e,t,n){let r=Ai(e,t),i=1-n,a=i*i,o=2*i*n,s=n*n;return[e[0]*a+r[0]*o+t[0]*s,e[1]*a+r[1]*o+t[1]*s,e[2]*a+r[2]*o+t[2]*s]}var Mi=class{worm=null;dark=null;wormOwners;wormFocus;darkOwners;darkFocusValues;samplesPerWormhole;activeWormhole=0;darkEmphasisValue=.14;disposed=!1;constructor(e,t,n){let{quality:r,parent:i}=n,a=new Map;for(let e of t.clusters??[])a.set(e.g,e.c);this.samplesPerWormhole=Math.max(8,Math.round(190*(Ti[r]??1)));let o=[],s=[],c=[],l=[];if((t.wormholes??[]).forEach((e,t)=>{let n=a.get(e.a),r=a.get(e.b);if(!(!n||!r))for(let i=0;i<this.samplesPerWormhole;i+=1){let a=i/Math.max(1,this.samplesPerWormhole-1),u=ji(n,r,a);o.push(u[0],u[1],u[2]),s.push(a),c.push(t),l.push(a<.5?e.a:e.b)}}),this.wormOwners=Int32Array.from(l),this.wormFocus=new Float32Array(l.length).fill(1),l.length>0){let t=new f(`overlay:wormhole:geometry`,e);t.setVerticesData(`position`,Float32Array.from(o),!1,3),t.setVerticesData(`aT`,Float32Array.from(s),!1,1),t.setVerticesData(`aWorm`,Float32Array.from(c),!1,1),t.setVerticesData(`aFocus`,this.wormFocus,!0,1);let n=new C(`overlay:wormhole`,e);n.parent=i??null,n.isPickable=!1,n.isUnIndexed=!0,n.alwaysSelectAsActiveMesh=!0,n.setEnabled(!1),t.applyToMesh(n);let r=new m(`overlay:wormhole:material`,e,{vertexSource:Ei,fragmentSource:Di},{attributes:[`position`,`aT`,`aWorm`,`aFocus`],uniforms:[`worldView`,`projection`,`uT`,`uActive`,`uProjScale`,`uNear`,`uFar`,`uColor`,`uGain`],needAlphaBlending:!0});r.fillMode=x.MATERIAL_PointFillMode,r.alphaMode=x.ALPHA_ADD,r.disableDepthWrite=!0,r.setFloat(`uT`,0),r.setFloat(`uActive`,0),r.setFloat(`uProjScale`,500),r.setFloat(`uNear`,1),r.setFloat(`uFar`,4e3),r.setColor3Array?.(`unused`,[]),r.setFloat(`uGain`,wi),r.setVector3?.(`uColor`,{x:Ci[0],y:Ci[1],z:Ci[2]}),n.material=r,this.worm=Object.freeze({mesh:n,material:r,geometry:t})}let u=(t.dark??[]).flatMap(e=>{let n=(t.stars??[]).find(t=>t.c===e.c);return n?[{entry:e,star:n}]:[]});if(this.darkOwners=u.flatMap(({star:e})=>Array.from({length:6},()=>e.c)),this.darkFocusValues=new Float32Array(this.darkOwners.length).fill(1),u.length>0){let n=[[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]],r=[],a=[],o=[],s=[],c=[],l=[],d=[];u.forEach(({entry:e,star:i},u)=>{let f=(t.clusters??[]).find(e=>e.g===i.g),p=f?f.c:i.p,m=It(i.g),h=f?Lt(i.p,p):0,g=34+e.f*2.2;for(let[t,f]of n)r.push(i.p[0],i.p[1],i.p[2]),a.push(t,f),o.push(p[0],p[1],p[2]),s.push(m[0],m[1],m[2]),c.push(h),l.push(g),d.push(u*1.7+e.f)});let p=new f(`overlay:dark:geometry`,e);p.setVerticesData(`position`,Float32Array.from(r),!1,3),p.setVerticesData(`aCorner`,Float32Array.from(a),!1,2),p.setVerticesData(`aCenter`,Float32Array.from(o),!1,3),p.setVerticesData(`aAxis`,Float32Array.from(s),!1,3),p.setVerticesData(`aPeriod`,Float32Array.from(c),!1,1),p.setVerticesData(`aRadius`,Float32Array.from(l),!1,1),p.setVerticesData(`aSeed`,Float32Array.from(d),!1,1),p.setVerticesData(`aFocus`,this.darkFocusValues,!0,1);let h=new C(`overlay:dark`,e);h.parent=i??null,h.isPickable=!1,h.isUnIndexed=!0,h.alwaysSelectAsActiveMesh=!0,p.applyToMesh(h);let g=new m(`overlay:dark:material`,e,{vertexSource:Oi,fragmentSource:ki},{attributes:[`position`,`aCorner`,`aCenter`,`aAxis`,`aPeriod`,`aRadius`,`aSeed`,`aFocus`],uniforms:[`worldView`,`projection`,`uT`,`uNear`,`uFar`,`uEmphasis`,`uColor`],needAlphaBlending:!0});g.alphaMode=x.ALPHA_ADD,g.backFaceCulling=!1,g.disableDepthWrite=!0,g.setFloat(`uT`,0),g.setFloat(`uNear`,1),g.setFloat(`uFar`,4e3),g.setFloat(`uEmphasis`,this.darkEmphasisValue),g.setVector3?.(`uColor`,{x:Ci[0],y:Ci[1],z:Ci[2]}),h.material=g,this.dark=Object.freeze({mesh:h,material:g,geometry:p})}}setUniform(e,t){if(!this.disposed)for(let n of this.batches())n.material.setFloat(e,t)}setMode(e,t,n){if(this.disposed)return;let r=gi(e,t,n);this.activeWormhole=n,this.worm?.material.setFloat(`uActive`,n),this.darkEmphasisValue=r.layers.darkMatter,this.dark?.material.setFloat(`uEmphasis`,this.darkEmphasisValue),this.worm?.mesh.setEnabled(r.layers.wormholes>0)}setFocus(e){if(this.disposed)return;let t=e&&`g`in e?e.g:null;for(let e=0;e<this.wormFocus.length;e+=1)this.wormFocus[e]=on(this.wormOwners[e],t);this.worm?.geometry.updateVerticesData(`aFocus`,this.wormFocus,!1);let n=e&&`c`in e?e.c:null;for(let e=0;e<this.darkFocusValues.length;e+=1)this.darkFocusValues[e]=on(this.darkOwners[e],n);this.dark?.geometry.updateVerticesData(`aFocus`,this.darkFocusValues,!1)}diagnostics(){return Object.freeze({wormholePointCount:this.wormOwners.length,darkLensCount:this.darkOwners.length/6,batchCount:this.disposed?0:this.batches().length,wormholeVisible:!this.disposed&&this.worm?.mesh.isEnabled(!1)===!0,darkVisible:!this.disposed&&this.dark!==null,activeWormhole:this.activeWormhole,darkEmphasis:this.darkEmphasisValue,wormholeFocus:Array.from(this.wormFocus),darkFocus:Array.from(this.darkFocusValues),disposed:this.disposed})}dispose(){if(!this.disposed){this.disposed=!0;for(let e of[this.worm,this.dark])e&&(e.mesh.dispose(!1,!1),e.material.dispose(),e.geometry.dispose())}}batches(){return[this.worm,this.dark].filter(e=>e!==null)}};function Ni(e,t){return t===null?e.map((e,t)=>({cluster:e,index:t})).sort((e,t)=>t.cluster.n-e.cluster.n||e.index-t.index).map(({cluster:e})=>e):e.filter(e=>e.g===t)}function Pi(e){return Math.min(1,Math.max(0,(e-18)/24))}function Fi(e,t){if(!t)return[];let n=w(t.s);return e.filter(e=>e.s.g===t.s.g).map(e=>({star:e,opacity:on(w(e.s),n)}))}var Ii=class{sourceClusters;sourceStars;clusterLabels;starLabels=[];revision=0;focusStarIdentity=null;constructor(e,t){this.sourceClusters=e,this.sourceStars=t,this.clusterLabels=Ni(e,null)}setFocus(e){let t=e?w(e.s):null;t!==this.focusStarIdentity&&(this.focusStarIdentity=t,this.clusterLabels=Ni(this.sourceClusters,e?.s.g??null),this.starLabels=Fi(this.sourceStars,e),this.revision+=1)}},Li=`600 13px "Noto Sans SC", -apple-system, "PingFang SC", sans-serif`;function Ri(e,t,n){e.clearRect(0,0,t.width,t.height),e.font=Li,e.textAlign=`center`,e.textBaseline=`alphabetic`,e.lineJoin=`round`,e.miterLimit=2;let r=[],i=0;for(let a of n){let n=Math.min(1,Math.max(0,a.opacity));if(n<=.004||a.x<-80||a.x>t.width+80||a.y<-40||a.y>t.height+40)continue;let o=e.measureText(a.text).width,s=[a.x-o/2-7,a.y-14,a.x+o/2+7,a.y+6];if(r.some(e=>s[0]<e[2]&&s[2]>e[0]&&s[1]<e[3]&&s[3]>e[1]))continue;r.push(s);let c=e=>Math.min(255,Math.round(226+29*e));e.lineWidth=3.5,e.strokeStyle=`rgba(3,5,12,${(n*.92).toFixed(3)})`,e.strokeText(a.text,a.x,a.y),e.fillStyle=`rgba(${c(a.tint[0])},${c(a.tint[1])},${c(a.tint[2])},${n.toFixed(3)})`,e.fillText(a.text,a.x,a.y),i+=1}return i}var zi=class{canvas;context;width=0;height=0;disposed=!1;constructor(e){this.canvas=e;let t=e.getContext(`2d`);if(!t)throw Error(`2D label canvas is unavailable`);this.context=t}resize(e,t,n){this.disposed||(this.width=Math.max(1,e),this.height=Math.max(1,t),this.canvas.width=Math.round(this.width*n),this.canvas.height=Math.round(this.height*n),this.context.setTransform(n,0,0,n,0,0))}draw(e){if(this.disposed)return 0;let t=[];for(let n of e.clusters){let r=e.project(n.c);if(r.depth<=0||r.depth>=1||r.distance<e.tooClose)continue;let i=Math.max(.001,e.far-e.near),a=Math.min(1,Math.max(0,(e.far-r.distance)/i)),o=Wt(n.hue,n.sat);t.push({text:n.name,x:r.x,y:r.y-15,opacity:Math.min(1,.96*(.5+.5*a*a)),tint:[o[0],o[1],o[2]]})}for(let{star:n,opacity:r}of e.stars){let i=e.projectStar(n);if(i.depth<=0||i.depth>=1)continue;let a=Pi(i.radiusPx)*r;a<=0||t.push({text:n.s.c,x:i.x,y:i.y-12,opacity:a,tint:[.48,.62,1]})}return Ri(this.context,{width:this.width,height:this.height},t)}dispose(){this.disposed||(this.disposed=!0,this.context.clearRect(0,0,this.width,this.height))}},Bi=Object.freeze([Object.freeze({role:`key`,position:Object.freeze([.42,.34,.46]),color:Object.freeze([1,.82,.58]),intensity:1.35,range:3.2}),Object.freeze({role:`fill`,position:Object.freeze([-.46,-.12,.28]),color:Object.freeze([.46,.68,1]),intensity:.72,range:3}),Object.freeze({role:`rim`,position:Object.freeze([-.08,.3,-.58]),color:Object.freeze([.72,.88,1]),intensity:.95,range:2.6})]);function Vi(e){let t=Math.max(1,Math.min(Bi.length,Math.round(e.probeAccentLights)));return Object.freeze(Bi.slice(0,t))}var Hi=.28;function Ui(e){let t=Ki(e.throttle),n=e.reducedMotion||!Number.isFinite(e.elapsedMs)?0:Math.max(0,e.elapsedMs),r=e.reducedMotion?1:1+.16*Math.sin(n*.021)+.09*Math.sin(n*.0537+1.7),i=Hi+t*.92;return Object.freeze({length:.1+t*.46,intensity:i*r,coreColor:Object.freeze([1,.86,.62]),edgeColor:Object.freeze([.32,.56,1])})}var Wi=.55;function Gi(e){return Object.freeze(!Number.isFinite(e)||e<0||e>1?{position:-.55,opacity:0}:{position:(e*2-1)*Wi,opacity:Math.sin(e*Math.PI)*.85})}function Ki(e){return Math.min(1,Math.max(0,Number.isFinite(e)?e:0))}var qi=.34,z=e=>Object.freeze([(e>>16&255)/255,(e>>8&255)/255,(e&255)/255]),Ji=Object.freeze({hull:Object.freeze({color:z(5464435),metallic:.72,roughness:.36}),panel:Object.freeze({color:z(2439513),metallic:.56,roughness:.28}),amber:Object.freeze({color:z(16753722),metallic:.1,roughness:.28,emissive:z(16742424),emissiveIntensity:1.8}),metal:Object.freeze({color:z(9608875),metallic:.84,roughness:.24}),lens:Object.freeze({color:z(7585256),metallic:.25,roughness:.12,emissive:z(1192780),emissiveIntensity:.8}),light:Object.freeze({color:z(16757068),metallic:.1,roughness:.22,emissive:z(16743193),emissiveIntensity:2.1}),etching:Object.freeze({color:z(12964316),metallic:.66,roughness:.3,emissive:z(1385265),emissiveIntensity:.25,doubleSided:!0})}),B=Math.PI/2;function V(e,t,n,r,i=[0,0,0],a=[0,0,0]){return Object.freeze({part:e,material:t,lod:n,kind:r.kind,shape:r,offset:i,rotation:a})}var Yi=Object.freeze([V(`hull`,`hull`,`far`,{kind:`cylinder`,diameterTop:.36,diameterBottom:.36,height:.52,tessellation:6},[0,0,0],[0,0,B]),V(`left-wing`,`panel`,`far`,{kind:`box`,width:.34,height:.025,depth:.24},[0,0,-.31]),V(`right-wing`,`panel`,`far`,{kind:`box`,width:.34,height:.025,depth:.24},[0,0,.31]),V(`beacon`,`amber`,`far`,{kind:`sphere`,diameter:.11,segments:8},[0,.22,0]),V(`antenna`,`metal`,`medium`,{kind:`cylinder`,diameterTop:.024,diameterBottom:.024,height:.28,tessellation:6},[.05,.25,0]),V(`thruster`,`metal`,`medium`,{kind:`cone`,diameter:.2,height:.18,tessellation:8},[-.34,0,0],[0,0,B]),V(`left-hinge`,`metal`,`medium`,{kind:`cylinder`,diameterTop:.07,diameterBottom:.07,height:.17,tessellation:8},[0,0,-.2],[B,0,0]),V(`right-hinge`,`metal`,`medium`,{kind:`cylinder`,diameterTop:.07,diameterBottom:.07,height:.17,tessellation:8},[0,0,.2],[B,0,0]),V(`seam`,`metal`,`near`,{kind:`torus`,diameter:.362,thickness:.016,tessellation:16},[.05,0,0],[0,B,0]),V(`scanner-lens`,`lens`,`near`,{kind:`cylinder`,diameterTop:.14,diameterBottom:.18,height:.08,tessellation:12},[.12,0,.2],[B,0,0]),V(`light-strip-inner`,`light`,`near`,{kind:`box`,width:.28,height:.012,depth:.018},[.03,-.17,0]),V(`etching`,`etching`,`near`,{kind:`disc`,radius:.075,tessellation:4},[.08,.01,-.185],[B,0,0])]),Xi=Object.freeze([`far`,`medium`,`near`]);function Zi(e){let t=Xi.indexOf(e);return Yi.filter(e=>Xi.indexOf(e.lod)<=t)}function Qi(e,t){let n=Number.isFinite(t)?Math.max(0,t):0;return e===`far`?n>=28?`medium`:`far`:e===`medium`?n<=14?`far`:n>=92?`near`:`medium`:n<=76?`medium`:`near`}var $i=1.35,ea=.42,ta=.055;function na(e){let t=Math.abs(e[1])<.9?[0,1,0]:[1,0,0],n=[t[1]*e[2]-t[2]*e[1],t[2]*e[0]-t[0]*e[2],t[0]*e[1]-t[1]*e[0]],r=Math.hypot(n[0],n[1],n[2])||1;n[0]/=r,n[1]/=r,n[2]/=r;let i=[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]];return{u:Object.freeze(n),v:Object.freeze(i)}}function ra(e,t){let n=[];for(let r of t){let t=r.s;if(!t.id||!t.probeIds?.length)continue;let i=It(t.g??0),a=na(i),o=new Set,s=0;for(let c of t.probeIds)o.has(c)||!e.probesById.has(c)||(o.add(c),n.push(Object.freeze({probeId:c,starId:t.id,slot:s,phase:s*2.399963%(Math.PI*2),radius:$i+s*ea+(r.bodyR??.3),axis:i,u:a.u,v:a.v,speed:ta/(1+s*.18)})),s+=1)}return Object.freeze(n)}function ia(e,t,n){return n.kind===`box`?v(t,{width:n.width,height:n.height,depth:n.depth},e):n.kind===`sphere`?ee(t,{diameter:n.diameter,segments:n.segments},e):n.kind===`cone`?S(t,{diameterTop:0,diameterBottom:n.diameter,height:n.height,tessellation:n.tessellation},e):n.kind===`torus`?ae(t,{diameter:n.diameter,thickness:n.thickness,tessellation:n.tessellation},e):n.kind===`disc`?ne(t,{radius:n.radius,tessellation:n.tessellation},e):S(t,{diameterTop:n.diameterTop,diameterBottom:n.diameterBottom,height:n.height,tessellation:n.tessellation},e)}function aa(e){let t=Ji[e],n=t.emissiveIntensity??1;return Object.freeze({diffuseScale:1-t.metallic*.62,specularScale:.18+t.metallic*.72,specularPower:Math.max(4,160*(1-t.roughness)**2),emissive:Object.freeze((t.emissive??[0,0,0]).map(e=>e*n))})}function oa(e,t,n){let i=Ji[t],a=aa(t),o=new p(`probe:${t}:${n}`,e);return o.diffuseColor=new r(i.color[0]*a.diffuseScale,i.color[1]*a.diffuseScale,i.color[2]*a.diffuseScale),o.specularColor=new r((.25+i.color[0]*.75)*a.specularScale,(.25+i.color[1]*.75)*a.specularScale,(.25+i.color[2]*.75)*a.specularScale),o.specularPower=a.specularPower,o.emissiveColor=new r(...a.emissive),o.ambientColor=new r(i.color[0]*.2,i.color[1]*.2,i.color[2]*.2),o.backFaceCulling=!i.doubleSided,o.alphaMode=x.ALPHA_COMBINE,o}var sa=900,ca=.1,la=class{scene;records;batches;materials=[];lodByProbe=new Map;positions=new Map;parent;reducedMotion;inspected=null;inspectedParts=[];inspectionRoot=null;scanningValue=!1;highlighted=null;headings=new Map;lights=[];accents=[];uplift;thrusterMeshes=[];scanSweepMesh=null;scanStartedAt=null;lastElapsedMs=0;nearOpacityValue=0;ambientInstances=0;disposed=!1;constructor(e,t,n,i){this.scene=e,this.parent=i.parent,this.reducedMotion=i.reducedMotion,this.uplift=F(i.quality??`high`),this.records=ra(t,n);for(let e of this.records)this.lodByProbe.set(e.probeId,`far`);let a=[];for(let t of[`far`,`medium`,`near`])for(let n of Zi(t)){let r=ia(e,`probe:${t}:${n.part}`,n.shape);r.parent=i.parent??null,r.isPickable=!1,r.alwaysSelectAsActiveMesh=!0,r.setEnabled(!1);let o=oa(e,n.material,t);this.materials.push(o),r.material=o,a.push({lod:t,definition:n,mesh:r})}this.batches=Object.freeze(a);let o=new _(`probe:fill`,new y(0,1,0),e);o.diffuse=new r(185/255,212/255,1),o.groundColor=new r(16/255,21/255,34/255),o.intensity=1.25;let s=new g(`probe:key`,new y(-2,-3,-4).normalize(),e);s.diffuse=new r(1,215/255,160/255),s.intensity=2.1,this.lights.push(o,s),this.retargetLights()}retargetLights(){let e=[...this.batches.map(({mesh:e})=>e),...this.inspectedParts.map(({mesh:e})=>e)];for(let t of this.lights)t.includedOnlyMeshes=e;let t=this.inspectedParts.map(({mesh:e})=>e);for(let e of this.accents)e.includedOnlyMeshes=t}update(e){if(this.disposed)return;this.lastElapsedMs=Number.isFinite(e.elapsedMs)?e.elapsedMs:this.lastElapsedMs,this.applyThruster(this.lastElapsedMs),this.applyScanSweep(this.lastElapsedMs);let n=this.reducedMotion?0:e.elapsedMs,r=new Map,i=0;for(let a of this.records){let o=e.starPositions.get(a.starId),s=e.starOpacities.get(a.starId)??0;if(!o||s<=.001)continue;let c=a.phase+a.speed*(n/1e3),l=Math.cos(c),u=Math.sin(c),d=this.positions.get(a.probeId)??new y;d.set(o.x+(a.u[0]*l+a.v[0]*u)*a.radius,o.y+(a.u[1]*l+a.v[1]*u)*a.radius,o.z+(a.u[2]*l+a.v[2]*u)*a.radius),this.positions.set(a.probeId,d);let f=this.scene.activeCamera,p=f?Math.max(.001,y.Distance(f.globalPosition,d)):1,m=qi*e.projectionScale/p,h=Qi(this.lodByProbe.get(a.probeId)??`far`,m);this.lodByProbe.set(a.probeId,h);let g=this.headings.get(a.probeId)??new y;g.set(-a.u[0]*u+a.v[0]*l,-a.u[1]*u+a.v[1]*l,-a.u[2]*u+a.v[2]*l),g.normalize(),this.headings.set(a.probeId,g);let _=t.FromUnitVectorsToRef(y.RightReadOnly,g,new t);if(a.probeId===this.inspected){i=Math.max(i,s);continue}let v=r.get(h)??new Map;r.set(h,v);for(let e of Zi(h)){let n=b.Compose(y.OneReadOnly,t.FromEulerAngles(e.rotation[0],e.rotation[1],e.rotation[2]),new y(e.offset[0],e.offset[1],e.offset[2])).multiply(b.Compose(y.OneReadOnly,_,d)),r=v.get(e.part)??[];v.set(e.part,r);for(let e of n.m)r.push(e)}}this.nearOpacityValue=i,this.ambientInstances=0;for(let e of this.batches){let t=r.get(e.lod)?.get(e.definition.part);if(!t||t.length===0){e.mesh.setEnabled(!1);continue}e.mesh.setEnabled(!0),e.mesh.thinInstanceSetBuffer(`matrix`,Float32Array.from(t),16,!0),this.ambientInstances+=t.length/16}if(this.inspectionRoot&&this.inspected){let e=this.positions.get(this.inspected);e&&this.inspectionRoot.position.copyFrom(e);let n=this.headings.get(this.inspected);n&&(this.inspectionRoot.rotationQuaternion??=new t,t.FromUnitVectorsToRef(y.RightReadOnly,n,this.inspectionRoot.rotationQuaternion))}}inspect(e){if(this.disposed||this.inspected===e)return;if(this.releaseInspection(),this.inspected=e,!e||!this.records.some(t=>t.probeId===e)){this.inspected=null;return}let t=new le(`probe:inspect:${e}`,this.scene);t.parent=this.parent??null,this.inspectionRoot=t;for(let n of Zi(`near`)){let r=ia(this.scene,`probe:inspect:${e}:${n.part}`,n.shape);r.parent=t,r.position.set(n.offset[0],n.offset[1],n.offset[2]),r.rotation.set(n.rotation[0],n.rotation[1],n.rotation[2]),r.isPickable=!0,r.alwaysSelectAsActiveMesh=!0;let i=oa(this.scene,n.material,`inspect:${n.part}`);this.materials.push(i),r.material=i,this.inspectedParts.push({part:n.part,mesh:r})}this.buildInspectionCinematics(t),this.applyHighlight(),this.retargetLights()}buildInspectionCinematics(e){for(let t of Vi(this.uplift)){let n=new te(`probe:accent:${t.role}`,new y(t.position[0],t.position[1],t.position[2]),this.scene);n.parent=e,n.diffuse=new r(t.color[0],t.color[1],t.color[2]),n.specular=new r(t.color[0],t.color[1],t.color[2]),n.intensity=t.intensity,n.range=t.range,this.accents.push(n)}let t=Math.max(1,Math.round(this.uplift.probeThrusterSegments));this.thrusterMeshes=Array.from({length:t},(n,r)=>{let i=(r+1)/t,a=S(`probe:thruster:${r}`,{diameterTop:qi*.26*(1-i*.72),diameterBottom:qi*.3*(1-i*.5),height:ca/t,tessellation:10},this.scene);a.parent=e,a.isPickable=!1,a.rotation.z=Math.PI/2;let o=new p(`probe:thruster:${r}:material`,this.scene);return o.disableLighting=!0,o.backFaceCulling=!1,o.alphaMode=x.ALPHA_ADD,o.alpha=.62*(1-i*.6),this.materials.push(o),a.material=o,a});let n=ne(`probe:scan:sweep`,{radius:qi*1.15,tessellation:32},this.scene);n.parent=e,n.isPickable=!1,n.rotation.y=Math.PI/2,n.position.x=-Wi;let i=new p(`probe:scan:sweep:material`,this.scene);i.disableLighting=!0,i.backFaceCulling=!1,i.alphaMode=x.ALPHA_ADD,i.emissiveColor=new r(.42,.82,1),i.alpha=0,this.materials.push(i),n.material=i,n.setEnabled(!1),this.scanSweepMesh=n,this.applyThruster(0)}applyThruster(e){if(this.thrusterMeshes.length===0)return;let t=Ui({elapsedMs:e,throttle:this.scanningValue?.85:.12,reducedMotion:this.reducedMotion}),n=this.thrusterMeshes.length;for(let[e,i]of this.thrusterMeshes.entries()){let a=(e+1)/n,o=i.material;if(!o)continue;let s=t.coreColor,c=t.edgeColor;o.emissiveColor=new r((s[0]+(c[0]-s[0])*a)*t.intensity,(s[1]+(c[1]-s[1])*a)*t.intensity,(s[2]+(c[2]-s[2])*a)*t.intensity),o.alpha=Math.min(.9,.62*(1-a*.6)*t.intensity);let l=t.length/ca;i.scaling.y=Math.max(.25,l),i.position.x=-qi*.62-t.length*(a-.5/n)}}applyScanSweep(e){let t=this.scanSweepMesh;if(!t)return;if(!this.scanningValue||this.scanStartedAt===null){t.setEnabled(!1);return}let n=Gi((e-this.scanStartedAt)/sa),r=t.material;t.position.x=n.position,r&&(r.alpha=n.opacity),t.setEnabled(n.opacity>.002)}setScanning(e){this.disposed||(this.scanningValue!==e&&(this.scanStartedAt=e?this.lastElapsedMs:null),this.scanningValue=e,this.applyHighlight(),this.applyThruster(this.lastElapsedMs),this.applyScanSweep(this.lastElapsedMs))}setPartHighlight(e){this.disposed||(this.highlighted=e,this.applyHighlight())}inspectionTarget(e){if(this.disposed||!this.inspected)return!1;let t=this.positions.get(this.inspected);return t?(e.copyFrom(t),!0):!1}pickPart(e){return this.disposed||!e?null:this.inspectedParts.find(t=>t.mesh.uniqueId===e.uniqueId)?.part??null}hasProbe(e){return this.records.some(t=>t.probeId===e)}diagnostics(){return Object.freeze({probeCount:this.records.length,batchCount:this.disposed?0:this.batches.length,lods:this.records.map(e=>this.lodByProbe.get(e.probeId)??`far`),inspectedProbeId:this.inspected,inspectedPartCount:this.inspectedParts.length,scanning:this.scanningValue,highlightedPart:this.highlighted,inspectionHeading:this.inspectedHeading(),nearOpacity:this.nearOpacityValue,ambientInstanceCount:this.ambientInstances,disposed:this.disposed})}dispose(){if(!this.disposed){this.disposed=!0,this.releaseInspection();for(let e of this.batches)e.mesh.dispose(!1,!1);for(let e of this.materials)e.dispose();this.materials.length=0;for(let e of this.lights)e.dispose();this.lights.length=0;for(let e of this.accents)e.dispose();this.accents.length=0}}applyHighlight(){for(let e of this.inspectedParts){let t=e.mesh.material;if(!t)continue;let n=Ji[Zi(`near`).find(t=>t.part===e.part).material],i=n.emissive??[.05,.07,.1],a=n.emissiveIntensity??.4,o=this.scanningValue?.55:0,s=this.highlighted===e.part?1.35:0,c=a+o+s;t.emissiveColor=new r(i[0]*c,i[1]*c,i[2]*c)}}inspectedHeading(){let e=this.inspected?this.headings.get(this.inspected):null;return Object.freeze(e?[e.x,e.y,e.z]:[1,0,0])}releaseInspection(){for(let e of this.inspectedParts){let t=e.mesh.material;if(e.mesh.dispose(!1,!1),t){t.dispose();let e=this.materials.indexOf(t);e>=0&&this.materials.splice(e,1)}}this.inspectedParts=[];for(let e of this.accents)e.dispose();this.accents.length=0;for(let e of this.thrusterMeshes){let t=e.material;if(e.dispose(!1,!1),t){t.dispose();let e=this.materials.indexOf(t);e>=0&&this.materials.splice(e,1)}}this.thrusterMeshes=[];let e=this.scanSweepMesh?.material;if(this.scanSweepMesh?.dispose(!1,!1),e){e.dispose();let t=this.materials.indexOf(e);t>=0&&this.materials.splice(t,1)}this.scanSweepMesh=null,this.scanStartedAt=null,this.disposed||this.retargetLights(),this.inspectionRoot?.dispose(!1,!0),this.inspectionRoot=null,this.inspected=null}},ua=Object.freeze([Object.freeze([.4,.26,.17]),Object.freeze([.2,.28,.32]),Object.freeze([.44,.35,.21]),Object.freeze([.17,.22,.31])]),da=.62,fa=.3,pa=Object.freeze([.14,.62,.72]),ma=.26;function ha(e){return ua[(Number.isFinite(e)?Math.abs(Math.floor(e)):0)%ua.length]}function ga(e){let t=ha(e),n=(Number.isFinite(e)?Math.abs(Math.floor(e)):0)%2==0?da:fa;return Object.freeze([t[0]*n,t[1]*n,t[2]*n])}var _a=1.5,va=1.05,ya=8,ba=96;function xa(e=256){let t=Math.max(2,Math.floor(e)),n=new Float32Array(t);for(let e=0;e<t;e+=1){let r=e/t,i=.5+.5*Math.sin(r*Math.PI*2*8),a=.5+.5*Math.sin(r*Math.PI*2*3+1.1),o=.5+.5*Math.sin(r*Math.PI*2+2.4);n[e]=Math.min(1,Math.max(0,.42+.3*i+.2*a+.08*o))}return n}function Sa(e){let t=Math.round((Number.isFinite(e)&&e>0?e:va)/va*3);return Math.min(ba,Math.max(ya,t))}function Ca(e){let t=xa(),n=Number.isFinite(e)?(e%1+1)%1:0;return t[Math.min(t.length-1,Math.floor(n*t.length))]}function wa(e,t){let r=e.getVerticesData(n.PositionKind);if(!r||r.length===0)return!1;let i=Number.isFinite(t)&&t>0?t:va,a=new Float32Array(r.length/3*4);for(let e=0;e<r.length/3;e+=1){let t=r[e*3+1],n=Ca((i/2-t)/va);a.set([n,n,n,1],e*4)}return e.setVerticesData(n.ColorKind,a,!1,4),e.hasVertexAlpha=!1,!0}var Ta=1e-6,Ea=Math.log1p(30),Da=Math.log1p(3650),Oa=Object.freeze([[`magma`,1.4],[`desert`,.8],[`rock`,.42],[`tundra`,.2],[`ice`,.06]]);function ka(e,t){let n=Number.isFinite(e)?Math.max(0,e):0,r=Number.isFinite(t)?Math.abs(t):0,i=n/Math.max(r*r,Ta);return Number.isFinite(i)?i:Number.MAX_VALUE}function Aa(e){let t=Number.isFinite(e)?Math.max(0,e):0,n={magma:0,desert:0,rock:0,tundra:0,ice:0};if(t>=Oa[0][1])return n.magma=1,Object.freeze(n);if(t<=Oa.at(-1)[1])return n.ice=1,Object.freeze(n);for(let e=0;e<Oa.length-1;e+=1){let[r,i]=Oa[e],[a,o]=Oa[e+1];if(t>i||t<o)continue;let s=(t-o)/(i-o),c=s*s*(3-2*s);return n[r]=c,n[a]=1-c,Object.freeze(n)}return n.rock=1,Object.freeze(n)}function ja(e){let t=Fa(Math.log1p(Math.max(0,Na(e.answerCount)))/Ea),n=e.timeSpan===null?0:Math.max(0,Na(e.timeSpan))/86400,r=e.timeSpan===null?0:Fa(Math.log1p(n)/Da),i=ka(e.normalizedStarEnergy,e.normalizedOrbitDistance);return Object.freeze({metadata:Object.freeze({questionId:e.questionId,starId:e.starId}),seed:Ma(e.questionId,e.starId),radius:Pa(.55+.45*t,.55,1),craterCount:Math.round(Pa(5+43*t,5,48)),detailDensity:Fa(t),faultStrength:Fa(r),atmosphere:Fa(e.freshness),createdGlow:+!!e.created,collectedMarker:+!!e.collected,incident:Pa(i,0,Number.MAX_VALUE),thermal:Aa(i)})}function Ma(e,t){let n=2166136261;for(let r of`${e}\u0000${t}`)n^=r.codePointAt(0)??0,n=Math.imul(n,16777619);return n>>>0}var Na=e=>Number.isFinite(e)?e:0,Pa=(e,t,n)=>Math.min(n,Math.max(t,Na(e))),Fa=e=>Pa(e,0,1);function Ia(e,t,n,r,i){if(![e,t,n,r,i].every(Number.isFinite)||e<=0||t<=e||n<=0||n>=Math.PI||r<=0||i<=0)return 0;let a=Math.asin(Math.min(1,e/t)),o=Math.tan(a)*i/Math.tan(n*.5);return Math.min(1,Math.max(0,o/Math.min(r,i)))}function La(e,t,n,r,i){return Ia(e,t,n,r,i)*Math.min(r,i)}function Ra(e,t){let n=Number.isFinite(t)?Math.max(0,t):0;return e===`low`?n>=18?`medium`:`low`:e===`high`?n<=72?`medium`:`high`:n<12?`low`:n>=84?`high`:`medium`}function za(e,t,n){return n?`high`:Ra(e,t)}var H=e=>Math.min(1,Math.max(0,Number.isFinite(e)?e:0)),Ba=.08,Va=.06;function Ha(e){let{thermal:t}=e,n=Number.isFinite(e.incident)?Math.max(0,e.incident):0,r=H(e.detailDensity),i=H(e.faultStrength),a=H(e.atmosphere),o=H(t.magma)*.78,s=H(t.ice)*.46,c=Math.max(Va,H(a*(1-o)*(1-s))),l=.25+Math.min(n,8)**.25*.55,u=Math.max(Ba,H(r*.94)),d=H(1-Math.exp(-Math.min(n,6)*1.15)),f=Math.min(d,1-.5800000000000001*H(t.ice)),p=H(t.magma)*H(.18+i*.82),m=H(t.ice*.82+t.tundra*.24),h=H(.35+r*.45-c*.22);return Object.freeze({cloudCoverage:c,cloudSpeed:l,nightLightDensity:u,snowLine:f,lavaGlow:p,iceFracture:m,craterVisibility:h})}var Ua=`
precision highp float;

uniform vec3 uPlanetCenter;
uniform vec3 uCameraPosition;
uniform vec3 uLightDirection;
uniform vec3 uRayleighColor;
uniform float uShellRadius;
uniform float uDensity;
uniform float uReveal;
uniform int uQualityLevel;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

const float PI = 3.14159265359;

float raySpherePath(vec3 rayOrigin, vec3 rayDirection, vec3 sphereCenter, float sphereRadius) {
  vec3 relativeOrigin = rayOrigin - sphereCenter;
  float projected = dot(relativeOrigin, rayDirection);
  float discriminant = projected * projected - dot(relativeOrigin, relativeOrigin)
    + sphereRadius * sphereRadius;
  return 2.0 * sqrt(max(discriminant, 0.0));
}

float rayleighPhase(float cosine) {
  return 3.0 * (1.0 + cosine * cosine) / (16.0 * PI);
}

float miePhase(float cosine, float anisotropy) {
  float anisotropySquared = anisotropy * anisotropy;
  float denominator = pow(max(1.0 + anisotropySquared - 2.0 * anisotropy * cosine, 0.001), 1.5);
  return (1.0 - anisotropySquared) / (4.0 * PI * denominator);
}

void main(void) {
  vec3 viewDirection = normalize(vWorldPosition - uCameraPosition);
  vec3 lightDirection = normalize(uLightDirection);
  vec3 shellNormal = normalize(vWorldNormal);
  float pathLength = raySpherePath(uCameraPosition, viewDirection, uPlanetCenter, uShellRadius);
  float normalizedPath = clamp(pathLength / max(uShellRadius * 2.0, 0.0001), 0.0, 1.0);
  float viewLightCosine = dot(-viewDirection, lightDirection);
  float nightShadow = smoothstep(-0.18, 0.12, dot(shellNormal, lightDirection));
  float limb = 1.0 - smoothstep(0.04, 0.72, abs(dot(shellNormal, -viewDirection)));
  float rayleigh = rayleighPhase(viewLightCosine);
  vec3 scattering = uRayleighColor * rayleigh * (0.32 + limb * 1.68);
  if (uQualityLevel == 0) {
    scattering = uRayleighColor * (0.18 + limb * 0.82);
  } else {
    float mie = miePhase(viewLightCosine, 0.72);
    scattering += vec3(1.0, 0.72, 0.48) * mie * 0.34;
  }
  float alpha = uDensity * pathLength * normalizedPath * nightShadow * uReveal
    / max(uShellRadius, 0.0001);
  alpha = clamp(alpha * (0.18 + limb * 0.82), 0.0, 0.72);
  gl_FragColor = vec4(min(scattering * nightShadow * 1.35, vec3(1.15)), alpha);
}
`,Wa=`
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`,Ga=`
precision highp float;

uniform vec4 uThermal;
uniform float uThermalIce;
uniform float uFreshness;
uniform float uCreated;
uniform float uCollected;
uniform float uSelected;
uniform float uTime;
uniform float uSeed;
uniform float uCraterDensity;
uniform float uIncident;
uniform float uReveal;
uniform float uCloudCoverage;
uniform float uCloudSpeed;
uniform float uNightLights;
uniform float uSnowLine;
uniform float uLavaGlow;
uniform float uIceFracture;
uniform float uCraterVisibility;
uniform int uCloudOctaves;
uniform float uHovered;
uniform float uInteractionRim;
uniform vec3 uInteractionColor;
uniform vec3 uLightDirection;
uniform vec3 uCameraPosition;

varying vec3 vLocal;
varying vec3 vWorldPosition;
varying vec3 vRadial;
varying vec3 vWorldRadial;
varying vec3 vNormal;
varying float vHeight;
varying float vRelief;
varying float vRidgeMask;
varying float vCraterMask;

const float PI = 3.14159265359;
const vec3 DIELECTRIC_F0 = vec3(0.04);

float distributionGGX(vec3 normalDirection, vec3 halfwayDirection, float roughness) {
  float alpha = roughness * roughness;
  float alphaSquared = alpha * alpha;
  float NoH = max(dot(normalDirection, halfwayDirection), 0.0);
  float denominator = NoH * NoH * (alphaSquared - 1.0) + 1.0;
  return alphaSquared / max(PI * denominator * denominator, 0.0001);
}

float geometrySchlickGGX(float NoX, float roughness) {
  float r = roughness + 1.0;
  float k = r * r * 0.125;
  return NoX / max(NoX * (1.0 - k) + k, 0.0001);
}

float geometrySmith(vec3 normalDirection, vec3 viewDirection, vec3 lightDirection, float roughness) {
  float NoV = max(dot(normalDirection, viewDirection), 0.0);
  float NoL = max(dot(normalDirection, lightDirection), 0.0);
  return geometrySchlickGGX(NoV, roughness) * geometrySchlickGGX(NoL, roughness);
}

vec3 fresnelSchlick(float cosine, vec3 reflectanceAtNormal) {
  return reflectanceAtNormal + (1.0 - reflectanceAtNormal) * pow(1.0 - cosine, 5.0);
}

float materialHash(vec3 cell) {
  return fract(sin(dot(cell, vec3(127.1, 311.7, 74.7)) + uSeed * 0.000071) * 43758.5453);
}

float materialFbm(vec3 point, int octaveCount);

float materialNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  vec3 fade = local * local * (3.0 - 2.0 * local);
  float x00 = mix(materialHash(cell), materialHash(cell + vec3(1.0, 0.0, 0.0)), fade.x);
  float x10 = mix(materialHash(cell + vec3(0.0, 1.0, 0.0)), materialHash(cell + vec3(1.0, 1.0, 0.0)), fade.x);
  float x01 = mix(materialHash(cell + vec3(0.0, 0.0, 1.0)), materialHash(cell + vec3(1.0, 0.0, 1.0)), fade.x);
  float x11 = mix(materialHash(cell + vec3(0.0, 1.0, 1.0)), materialHash(cell + vec3(1.0, 1.0, 1.0)), fade.x);
  return mix(mix(x00, x10, fade.y), mix(x01, x11, fade.y), fade.z);
}

float materialFbm(vec3 point, int octaveCount) {
  float sum = 0.0;
  float amplitude = 0.55;
  float normalization = 0.0;
  for (int octave = 0; octave < 4; octave++) {
    if (octave >= octaveCount) break;
    sum += materialNoise(point) * amplitude;
    normalization += amplitude;
    point = point * 2.11 + vec3(9.7, 3.3, 15.1);
    amplitude *= 0.52;
  }
  return sum / max(normalization, 0.0001);
}

// 云层。
//
// 它是一层**独立于地形**的场：跟着自己的角速度转，所以近景里能看出
// 「地在下、云在上」。域扭曲让云带成涡而不是斑点，纬向拉伸让它成带
// —— 行星的科里奥利力把云挤成带状，这是行星读起来像行星的关键之一。
float cloudField(vec3 direction, float phase) {
  vec3 drift = vec3(sin(phase) * 0.42, 0.0, cos(phase) * 0.42);
  vec3 banded = vec3(direction.x, direction.y * 2.6, direction.z);
  vec3 warp = vec3(
    materialFbm(banded * 1.9 + drift, 2),
    materialFbm(banded * 1.9 + drift + vec3(5.1, 1.7, 9.3), 2),
    materialFbm(banded * 1.9 + drift - vec3(3.7, 8.1, 2.3), 2)
  ) * 2.0 - 1.0;
  float base = materialFbm(banded * 2.7 + warp * 0.85 + drift, uCloudOctaves);
  // 覆盖度直接抬高低频场再切阈值：覆盖度低时只剩几条卷云，
  // 高时连成整片，中间是有洞的云海 —— 一个参数走完三种天气。
  float threshold = mix(0.72, 0.26, uCloudCoverage);
  return smoothstep(threshold, threshold + 0.20, base);
}

void main(void) {
  vec3 magma = vec3(0.78, 0.075, 0.012);
  vec3 desert = vec3(0.76, 0.42, 0.10);
  vec3 rock = vec3(0.31, 0.34, 0.40);
  vec3 tundra = vec3(0.20, 0.46, 0.39);
  vec3 ice = vec3(0.42, 0.70, 0.96);

  float latitude = abs(normalize(vRadial).y);
  // 雪线由入射能量与冰权重一起算出来（planetAppearance.snowLine）：星越远，
  // 冰盖越往赤道压。海拔也算数 —— 高原上的雪线更低，那是山才有的读感。
  //
  // 上缘必须由下缘推出来。两个边各自独立算的时候，冰行星会得到
  // edge0 = 0.42 > edge1 ≈ 0.287 —— GLSL 规定 smoothstep 在 edge0 >= edge1
  // 时未定义，实测是极冠整个翻转（冰盖长在赤道、两极裸露）。
  float snowStart = clamp(uSnowLine - max(vHeight, 0.0) * 0.55, 0.05, 0.99);
  float polarMask = smoothstep(snowStart, min(0.995, snowStart + 0.22), latitude);
  float highlandMask = smoothstep(0.10, 0.42, vHeight);
  float basinMask = 1.0 - smoothstep(-0.30, 0.08, vHeight);
  float hotZone = uThermal.x * (1.0 - polarMask) * smoothstep(-0.08, 0.24, vHeight);
  float thermalTotal = dot(uThermal, vec4(1.0)) + uThermalIce;
  vec3 thermalBase = (magma * uThermal.x + desert * uThermal.y + rock * uThermal.z
    + tundra * uThermal.w + ice * uThermalIce) / max(thermalTotal, 0.0001);
  float exposedRock = clamp((highlandMask * 0.18 + basinMask * 0.06 + vCraterMask * 0.12)
    * (1.0 - uThermalIce * 0.72) * (1.0 - uThermal.x * 0.55), 0.0, 0.28);
  float iceCoverage = clamp(uThermalIce * (0.74 + polarMask * 0.24)
    + uThermal.w * polarMask * 0.24, 0.0, 0.98);
  vec3 baseColor = mix(thermalBase, rock, exposedRock);
  baseColor = mix(baseColor, ice, iceCoverage);
  baseColor *= 0.82 + highlandMask * 0.18 + basinMask * 0.06;
  float geologicalTone = clamp(1.0 + vHeight * 0.24 + vRidgeMask * 0.10
    - vCraterMask * (0.12 + uCraterVisibility * 0.34), 0.62, 1.18);
  float microTone = clamp(1.0 + vRelief * 0.16, 0.90, 1.10);
  baseColor *= geologicalTone * microTone;

  // Thermal materials share geometry but not a generic painted texture.
  // These masks alter albedo only, preserving the smooth radial terminator.
  vec3 materialDirection = normalize(vRadial);
  float coarseMaterial = materialNoise(materialDirection * 5.5);
  float fineMaterial = materialNoise(materialDirection * 13.0 + vec3(7.3, 3.1, 11.7));
  float duneStrata = pow(0.5 + 0.5 * sin((materialDirection.y * 18.0
    + materialDirection.x * 4.0 + coarseMaterial * 3.2) * PI), 2.0);
  float rockMottle = smoothstep(0.34, 0.72, coarseMaterial * 0.62 + fineMaterial * 0.38);
  float tundraPatches = smoothstep(0.43, 0.67,
    materialNoise(materialDirection * 7.5 + vec3(19.0, 2.0, 5.0)));
  float rockDarkMask = max(rockMottle, vCraterMask * 0.85);
  float rockLightMask = (1.0 - rockMottle) * smoothstep(0.56, 0.78, fineMaterial);
  float tundraDarkMask = max(tundraPatches, vRidgeMask * 0.85);
  float tundraRidgeMask = (1.0 - tundraPatches) * smoothstep(0.58, 0.80, fineMaterial);
  float iceFractures = pow(1.0 - abs(materialNoise(materialDirection * 19.0
    + vec3(3.0, 17.0, 9.0)) * 2.0 - 1.0), 8.0);
  baseColor = mix(baseColor, vec3(0.28, 0.035, 0.012), uThermal.x * rockMottle * 0.12);
  baseColor = mix(baseColor, vec3(0.42, 0.20, 0.035), uThermal.y * duneStrata * 0.32);
  baseColor = mix(baseColor, vec3(0.075, 0.09, 0.12), uThermal.z * rockDarkMask * 0.62);
  baseColor = mix(baseColor, vec3(0.46, 0.49, 0.56), uThermal.z * rockLightMask * 0.28);
  baseColor = mix(baseColor, vec3(0.025, 0.18, 0.14), uThermal.w * tundraDarkMask * 0.58);
  baseColor = mix(baseColor, vec3(0.34, 0.60, 0.47), uThermal.w * tundraRidgeMask * 0.30);
  baseColor = mix(baseColor, vec3(0.10, 0.26, 0.42),
    clamp(uIceFracture, 0.0, 1.0) * iceFractures * 0.62);
  baseColor = mix(baseColor, vec3(0.66, 0.84, 1.0), uThermalIce * (1.0 - iceFractures) * fineMaterial * 0.14);
  float roughness = clamp(uThermal.x * 0.58 + uThermal.y * 0.88 + uThermal.z * 0.82
    + uThermal.w * 0.74 + uThermalIce * 0.32 - vRidgeMask * 0.07, 0.24, 0.94);

  // Keep the day/night boundary spherical and continuous. The displaced
  // normal contributes restrained local relief instead of faceting the light.
  vec3 normalDirection = normalize(mix(vWorldRadial, vNormal, 0.18));
  vec3 lightDirection = normalize(uLightDirection);
  vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
  vec3 halfwayDirection = normalize(lightDirection + viewDirection);
  float NoL = max(dot(normalDirection, lightDirection), 0.0);
  float NoV = max(dot(normalDirection, viewDirection), 0.0);
  float VoH = max(dot(viewDirection, halfwayDirection), 0.0);
  float ndf = distributionGGX(normalDirection, halfwayDirection, roughness);
  float visibility = geometrySmith(normalDirection, viewDirection, lightDirection, roughness);
  vec3 fresnel = fresnelSchlick(VoH, DIELECTRIC_F0);
  vec3 specular = ndf * visibility * fresnel / max(4.0 * NoV * NoL, 0.0001);
  vec3 diffuse = (vec3(1.0) - fresnel) * baseColor / PI;
  float irradiance = min(1.70, 1.12 + sqrt(max(uIncident, 0.0)) * 0.32);
  vec3 directLight = (diffuse + specular) * NoL * irradiance * PI;
  vec3 nightAmbient = baseColor * (0.014 + uFreshness * 0.008) * (1.0 - NoL);
  vec3 surfaceColor = min(directLight + nightAmbient, vec3(0.98));

  float fissure = vRidgeMask * (1.0 - smoothstep(0.08, 0.34, abs(vHeight)))
    + vCraterMask * 0.32;
  vec3 emissive = vec3(1.35, 0.16, 0.018) * hotZone * fissure * 1.45;
  // 熔岩裂谷：热 × 年代跨度。裂缝网络用脊线噪声的**倒数**取，
  // 于是熔岩只出现在裂开的那几条线上，不是糊满整个热半球。
  float riftNetwork = pow(1.0 - abs(materialNoise(materialDirection * 8.5
    + vec3(21.0, 4.0, 13.0)) * 2.0 - 1.0), 6.0);
  float rift = riftNetwork * (0.35 + fissure * 0.65);
  emissive += vec3(1.55, 0.38, 0.06) * clamp(uLavaGlow, 0.0, 1.0) * rift * 1.25;
  float createdInnerLight = uCreated * pow(max(0.0, vHeight + 0.28), 3.0) * 0.34;
  emissive += vec3(1.10, 0.38, 0.07) * createdInnerLight;

  // 夜侧灯火：一条回答就是一盏灯。它们聚在低海拔的平原上（人住在平原），
  // 避开冰盖，并且只在背光面出现 —— 白天看不见灯，这是夜侧存在的全部理由。
  float nightMask = 1.0 - smoothstep(-0.06, 0.22, NoL);
  float settlement = smoothstep(0.62, 0.88,
    materialNoise(materialDirection * 26.0 + vec3(31.0, 7.0, 19.0)));
  float habitable = (1.0 - iceCoverage) * (1.0 - clamp(uThermal.x, 0.0, 1.0) * 0.7)
    * (1.0 - smoothstep(0.05, 0.40, abs(vHeight)));
  emissive += vec3(1.0, 0.78, 0.42) * settlement * habitable * nightMask
    * clamp(uNightLights, 0.0, 1.0) * 0.30;

  float markerBand = 1.0 - smoothstep(0.018, 0.04, abs(vRadial.y));
  float markerDash = step(0.54, fract(atan(vRadial.z, vRadial.x) * 3.82 + uSeed * 0.00017));
  vec3 marker = vec3(0.20, 0.46, 0.62) * markerBand * markerDash * uCollected * 0.24;
  // 悬停/选中轮廓。旧值是 0.02 —— 写了，但在 bloom 与色调映射之后等于没写，
  // 用户点下去看不到「我点中了」。强度与颜色都由 interactionFeedback 给：
  // 悬停暖、选中冷，两个状态在画面上分得开。
  float selectionRim = pow(1.0 - NoV, 4.0);
  vec3 selectionFeedback = uInteractionColor * selectionRim * uInteractionRim;

  // 云：叠在地表之上，跟着自己的相位漂移。它有自己的散射与投影 ——
  // 没有投影的云是一张贴纸，有投影才是「云在地上面」。
  float cloudPhase = uTime * 0.00004 * uCloudSpeed;
  float cloud = cloudField(materialDirection, cloudPhase);
  float cloudShadow = cloudField(materialDirection + lightDirection * 0.045, cloudPhase);
  vec3 litSurface = surfaceColor * (1.0 - cloudShadow * 0.34 * NoL);
  // 云顶更亮、更白，并且在晨昏线上带一层暖边（前向散射）。
  float forward = pow(max(dot(viewDirection, -lightDirection), 0.0), 3.0);
  vec3 cloudColor = mix(vec3(0.88, 0.90, 0.94), vec3(1.0, 0.84, 0.66), forward * 0.55);
  vec3 cloudLit = cloudColor * (NoL * 0.92 + 0.05) * irradiance;
  vec3 composed = mix(litSurface, cloudLit, clamp(cloud * 0.86, 0.0, 0.9));
  gl_FragColor = vec4(composed + emissive + marker + selectionFeedback, uReveal);
}
`,Ka=`
precision highp float;

attribute vec3 position;
attribute vec3 normal;
// CPU height, material grain, ridge mask and crater mask.
attribute vec4 terrainData;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vLocal;
varying vec3 vWorldPosition;
varying vec3 vRadial;
varying vec3 vWorldRadial;
varying vec3 vNormal;
varying float vHeight;
varying float vRelief;
varying float vRidgeMask;
varying float vCraterMask;

void main(void) {
  vec3 radial = normalize(position);
  vec4 worldPosition = world * vec4(position, 1.0);
  vLocal = position;
  vWorldPosition = worldPosition.xyz;
  vRadial = radial;
  vWorldRadial = normalize(mat3(world) * radial);
  vNormal = normalize(mat3(world) * normal);
  vHeight = terrainData.x;
  vRelief = terrainData.y;
  vRidgeMask = terrainData.z;
  vCraterMask = terrainData.w;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`,qa=`world.worldViewProjection.uTime.uSeed.uThermal.uThermalIce.uFreshness.uCreated.uCollected.uSelected.uCraterDensity.uIncident.uReveal.uCloudCoverage.uCloudSpeed.uNightLights.uSnowLine.uLavaGlow.uIceFracture.uCraterVisibility.uCloudOctaves.uHovered.uInteractionRim.uInteractionColor.uLightDirection.uCameraPosition`.split(`.`),Ja=[`world`,`worldViewProjection`,`uPlanetCenter`,`uCameraPosition`,`uLightDirection`,`uRayleighColor`,`uShellRadius`,`uDensity`,`uReveal`,`uQualityLevel`],Ya=Object.freeze({low:0,medium:1,high:2}),Xa=class{descriptor;appearance;radius;orbitMesh;atmosphereMesh;atmosphereMaterial;focusMesh=null;scene;parent;onError;onMeshesChanged;compileSurface;compileAtmosphere;orbitMaterial;focusMaterial=null;focusAtmosphereMesh=null;focusAtmosphereMaterial=null;orbitGeometryLevel=null;level;focusBlend=0;reveal=0;visible=!0;selected=!1;hovered=!1;atmosphereFallback=!1;highUnavailable=!1;disposed=!1;compilationAbort=new AbortController;lightScratch=new y;uplift;constructor(e){this.scene=e.scene,this.parent=e.parent,this.descriptor=e.descriptor,this.appearance=Ha(e.descriptor),this.uplift=F(e.quality??`high`),this.radius=Se(e.descriptor.detailDensity)*(e.radiusScale??1),this.onError=e.onError,this.onMeshesChanged=e.onMeshesChanged,this.compileSurface=e.compileSurface??((e,t,n)=>e.forceCompilationAsync(n)),this.compileAtmosphere=e.compileAtmosphere??((e,t)=>e.forceCompilationAsync(t)),this.level=e.initialLod??`medium`,this.orbitMesh=this.createSurfaceMesh(`orbit`,this.level),this.orbitMaterial=this.orbitMesh.material;let t=this.createAtmosphere(`orbit`);this.atmosphereMesh=t.mesh,this.atmosphereMaterial=t.material,this.applyPresentation()}get activeMesh(){return this.focusMesh&&this.focusBlend>=.5?this.focusMesh:this.orbitMesh}get minimumFocusRadiusMultiplier(){return this.highUnavailable?4.2:2.2}get surfaceMaterial(){return this.activeMesh.material}get meshes(){return[this.orbitMesh,this.atmosphereMesh,this.focusMesh,this.focusAtmosphereMesh].filter(e=>e!==null)}setPosition(e){for(let t of this.meshes)t.position.copyFrom(e)}focusTarget(){let e=this.activeMesh.position;return{x:e.x,y:e.y,z:e.z}}setVisible(e){this.visible=e,this.applyPresentation()}setReveal(e){this.reveal=Qa(e),this.applyReveal()}setSelected(e){this.selected=e,this.level!==`lambert`&&this.orbitMaterial.setFloat(`uSelected`,+!!e),this.focusMaterial?.setFloat(`uSelected`,+!!e),this.applyInteractionRim()}setHovered(e){this.disposed||this.hovered===e||(this.hovered=e,this.level!==`lambert`&&this.orbitMaterial.setFloat(`uHovered`,+!!e),this.focusMaterial?.setFloat(`uHovered`,+!!e),this.applyInteractionRim())}applyInteractionRim(){let e=si(+!!this.hovered,+!!this.selected),t=new r(e.color[0],e.color[1],e.color[2]);for(let n of[this.orbitMaterial,this.focusMaterial])!n||this.level===`lambert`||(n.setFloat(`uInteractionRim`,e.intensity),n.setColor3(`uInteractionColor`,t))}setFocusBlend(e){this.focusBlend=Qa(e),this.applyPresentation()}setLod(e){this.disposed||this.level!==`lambert`&&(e===`high`?(this.ensureFocusResources(),this.level=`high`):(this.level=e,this.orbitGeometryLevel!==e&&(this.configureSurfaceGeometry(this.orbitMesh,e),this.orbitGeometryLevel=e),this.configureSurfaceMaterial(this.orbitMaterial,e),this.disposeFocusResources()),this.applyPresentation(),this.onMeshesChanged?.(this))}async ensureLod(e){if(this.disposed)return;let t=e===`high`&&this.highUnavailable?`medium`:e,n=t===`high`?[`high`,`medium`,`low`]:t===`medium`?[`medium`,`low`]:[`low`];for(let e of n){if(this.disposed)return;try{if(this.setLod(e),this.disposed)return;let t=e===`high`?this.focusMesh:this.orbitMesh;if(!t?.material)throw Error(`Planet ${e} surface was not created`);if(await this.compileSurface(t.material,e,t,this.compilationAbort.signal),this.disposed)return;if(e===`high`&&this.focusAtmosphereMesh?.material&&!this.atmosphereFallback)try{if(await this.compileAtmosphere(this.focusAtmosphereMesh.material,this.focusAtmosphereMesh,this.compilationAbort.signal),this.disposed)return}catch(e){if(this.disposed)return;this.atmosphereFallback=!0,this.atmosphereMesh.setEnabled(!1),this.focusAtmosphereMesh.setEnabled(!1),this.report(e)}return}catch(t){if(this.disposed)return;e===`high`&&(this.highUnavailable=!0),this.report(t)}}this.disposed||this.installLambertFallback()}async ensureAtmosphere(){if(!this.disposed)try{if(await this.compileAtmosphere(this.atmosphereMaterial,this.atmosphereMesh,this.compilationAbort.signal),this.disposed)return}catch(e){if(this.disposed)return;this.atmosphereFallback=!0,this.atmosphereMesh.setEnabled(!1),this.focusAtmosphereMesh?.setEnabled(!1),this.report(e)}}update(e){if(!this.visible||!this.activeMesh.isEnabled()||this.disposed||this.scene.frustumPlanes.length>0&&!this.activeMesh.isInFrustum(this.scene.frustumPlanes))return!1;let t=e.focused,n=this.level===`lambert`?`lambert`:za(this.level,e.projectedRadiusPx,t);n!==`lambert`&&n!==this.level&&this.ensureLod(n),this.lightScratch.copyFrom(e.starPosition).subtractInPlace(this.activeMesh.position),this.lightScratch.lengthSquared()<1e-8?this.lightScratch.set(0,1,0):this.lightScratch.normalize();let r=this.level===`lambert`?[]:[this.orbitMaterial,this.focusMaterial];for(let t of r)t?.setFloat(`uTime`,Za(e.elapsedMs)),t?.setVector3(`uLightDirection`,this.lightScratch),t?.setVector3(`uCameraPosition`,e.cameraPosition);for(let t of[this.atmosphereMaterial,this.focusAtmosphereMaterial])t?.setVector3(`uPlanetCenter`,this.activeMesh.position),t?.setVector3(`uLightDirection`,this.lightScratch),t?.setVector3(`uCameraPosition`,e.cameraPosition);return!0}rotate(e,n){if(!Number.isFinite(e)||!Number.isFinite(n))return;let r=t.RotationAxis(y.Up(),e),i=t.RotationAxis(y.Right(),n);for(let e of this.meshes)e.rotationQuaternion||=t.FromEulerAngles(e.rotation.x,e.rotation.y,e.rotation.z),e.rotationQuaternion=r.multiply(i).multiply(e.rotationQuaternion)}diagnostics(){let e=this.activeMesh.rotationQuaternion??t.Identity();return Object.freeze({surfaceLevel:this.level,surfaceFallback:this.level===`lambert`,atmosphereFallback:this.atmosphereFallback,rotation:Object.freeze([e.x,e.y,e.z,e.w]),thermalDominant:Object.entries(this.descriptor.thermal).reduce((e,t)=>t[1]>e[1]?t:e)[0],highFrequencyDetail:this.level===`high`&&this.focusMesh?.isEnabled()===!0&&this.focusMaterial?.isReady(this.focusMesh)===!0})}dispose(){this.disposed||(this.disposed=!0,this.compilationAbort.abort(),this.disposeFocusResources(),this.orbitMesh.dispose(!1,!0),this.atmosphereMesh.dispose(!1,!0))}createSurfaceMesh(e,t){let n=new C(`planet:${this.descriptor.metadata.questionId}:${e}`,this.scene);return this.configureSurfaceGeometry(n,t),e===`orbit`&&(this.orbitGeometryLevel=t),n.parent=this.parent??null,n.scaling.setAll(this.radius),n.isPickable=!0,n.metadata={...this.descriptor.metadata},n.material=this.createSurfaceMaterial(`${n.name}:material`,t),n}configureSurfaceGeometry(e,t){let n=ce.CreateIcoSphere({radius:1,subdivisions:t===`high`?12:t===`medium`?6:3,flat:!1}),{field:r,displacement:i}=pt(this.descriptor,t),a=n.positions,o=n.normals,s=new Float32Array(a.length/3*4),c=new Map;for(let e=0;e<a.length;e+=3){let n=Math.hypot(a[e],a[e+1],a[e+2]),l=[a[e]/n,a[e+1]/n,a[e+2]/n],u=l.map(e=>e.toFixed(12)).join(`,`),d=c.get(u);if(!d){let e=r.sample(l);d={height:r.height(l),normal:r.normal(l,t===`high`?.006:.012,i),signals:[e.height,$a(l,this.descriptor),Qa(e.relief),Qa(Math.max(e.largeCraterMask,e.smallCraterMask))]},c.set(u,d)}for(let t=0;t<3;t+=1)a[e+t]=l[t]*(1+d.height*i),o[e+t]=d.normal[t];s.set(d.signals,e/3*4)}n.applyToMesh(e),e.setVerticesData(`terrainData`,s,!1,4),e.refreshBoundingInfo()}createSurfaceMaterial(e,t){let n=new m(e,this.scene,{vertexSource:Ka,fragmentSource:Ga},{attributes:[`position`,`normal`,`terrainData`],uniforms:[...qa],needAlphaBlending:!0});return n.backFaceCulling=!0,this.configureSurfaceMaterial(n,t),n}configureSurfaceMaterial(e,t){e.setFloat(`uTime`,0),e.setVector4(`uThermal`,new a(this.descriptor.thermal.magma,this.descriptor.thermal.desert,this.descriptor.thermal.rock,this.descriptor.thermal.tundra)),e.setFloat(`uThermalIce`,this.descriptor.thermal.ice),e.setFloat(`uFreshness`,this.descriptor.atmosphere),e.setFloat(`uCreated`,this.descriptor.createdGlow),e.setFloat(`uCollected`,this.descriptor.collectedMarker),e.setFloat(`uSelected`,+!!this.selected),e.setFloat(`uHovered`,+!!this.hovered);let n=si(+!!this.hovered,+!!this.selected);e.setFloat(`uInteractionRim`,n.intensity),e.setColor3(`uInteractionColor`,new r(n.color[0],n.color[1],n.color[2])),e.setFloat(`uSeed`,this.descriptor.seed),e.setFloat(`uCraterDensity`,this.descriptor.craterCount/48),e.setFloat(`uIncident`,this.descriptor.incident),e.setFloat(`uReveal`,0);let i=this.appearance;e.setFloat(`uCloudCoverage`,i.cloudCoverage),e.setFloat(`uCloudSpeed`,i.cloudSpeed),e.setFloat(`uNightLights`,i.nightLightDensity),e.setFloat(`uSnowLine`,i.snowLine),e.setFloat(`uLavaGlow`,i.lavaGlow),e.setFloat(`uIceFracture`,i.iceFracture),e.setFloat(`uCraterVisibility`,i.craterVisibility),e.setInt(`uCloudOctaves`,t===`high`?this.uplift.planetCloudOctaves:Math.max(1,this.uplift.planetCloudOctaves-1))}createAtmosphere(e){let t=h(`planet:${this.descriptor.metadata.questionId}:${e}:atmosphere`,{radius:1,subdivisions:e===`focus`?5:3,flat:!1},this.scene);t.parent=this.parent??null;let n=this.radius*(1.095+this.descriptor.atmosphere*.025);t.scaling.setAll(n),t.isPickable=!1,t.metadata={...this.descriptor.metadata};let i=new m(`${t.name}:material`,this.scene,{vertexSource:Wa,fragmentSource:Ua},{attributes:[`position`,`normal`],uniforms:[...Ja],needAlphaBlending:!0});return i.backFaceCulling=!1,i.disableDepthWrite=!0,i.setColor3(`uRayleighColor`,new r(.24,.48,.82)),i.setFloat(`uShellRadius`,n),i.setFloat(`uDensity`,.2+this.descriptor.atmosphere*.22),i.setFloat(`uReveal`,0),i.setInt(`uQualityLevel`,e===`focus`?2:Ya[this.level===`lambert`?`low`:this.level]),t.material=i,{mesh:t,material:i}}ensureFocusResources(){if(this.focusMesh)return;this.focusMesh=this.createSurfaceMesh(`focus`,`high`),this.focusMesh.position.copyFrom(this.orbitMesh.position),this.focusMaterial=this.focusMesh.material;let e=this.createAtmosphere(`focus`);this.focusAtmosphereMesh=e.mesh,this.focusAtmosphereMesh.position.copyFrom(this.orbitMesh.position),this.focusAtmosphereMaterial=e.material,this.onMeshesChanged?.(this)}disposeFocusResources(){this.focusMesh?.dispose(!1,!0),this.focusAtmosphereMesh?.dispose(!1,!0),this.focusMesh=null,this.focusMaterial=null,this.focusAtmosphereMesh=null,this.focusAtmosphereMaterial=null}installLambertFallback(){this.disposeFocusResources();let e=new p(`planet:${this.descriptor.metadata.questionId}:lambert`,this.scene),t=this.descriptor.thermal;e.diffuseColor=new r(t.magma*.48+t.desert*.62+t.rock*.22+t.tundra*.24+t.ice*.52,t.magma*.045+t.desert*.29+t.rock*.25+t.tundra*.34+t.ice*.72,t.magma*.008+t.desert*.075+t.rock*.28+t.tundra*.37+t.ice*.86),e.specularColor=r.Black(),this.orbitMesh.material?.dispose(),this.orbitMesh.material=e,this.level=`lambert`,this.applyPresentation()}applyPresentation(){let e=this.visible&&!!this.focusMesh&&this.focusBlend>0,t=this.visible&&(!this.focusMesh||this.focusBlend<1);this.orbitMesh.setEnabled(t),this.orbitMesh.isPickable=t,this.atmosphereMesh.setEnabled(t&&!this.atmosphereFallback),this.focusMesh&&(this.focusMesh.setEnabled(e),this.focusMesh.isPickable=e),this.focusAtmosphereMesh?.setEnabled(e&&!this.atmosphereFallback),this.applyReveal()}applyReveal(){this.level!==`lambert`&&this.orbitMaterial.setFloat(`uReveal`,this.reveal*(1-this.focusBlend)),this.atmosphereMaterial.setFloat(`uReveal`,this.reveal*(1-this.focusBlend)),this.focusMaterial?.setFloat(`uReveal`,this.reveal*this.focusBlend),this.focusAtmosphereMaterial?.setFloat(`uReveal`,this.reveal*this.focusBlend)}report(e){this.onError?.(e instanceof Error?e:Error(String(e)))}},Za=e=>Number.isFinite(e)?e:0,Qa=e=>Math.min(1,Math.max(0,Za(e)));function $a(e,t){let n=e.map(e=>e*(14+10*t.detailDensity)),r=n.map(Math.floor),i=n.map((e,t)=>e-r[t]),a=i.map(e=>e*e*(3-2*e)),o=(e,n,a)=>{let o=[r[0]+e,r[1]+n,r[2]+a],s=[[127.1,311.7,74.7],[269.5,183.3,246.1],[113.5,271.9,124.6]].map(e=>{let n=Math.sin(o.reduce((t,n,r)=>t+n*e[r],0)+t.seed*71e-6)*43758.5453123;return(n-Math.floor(n))*2-1}),c=Math.hypot(...s)||1;return(s[0]*(i[0]-e)+s[1]*(i[1]-n)+s[2]*(i[2]-a))/c},s=(e,t,n)=>e+(t-e)*n;return s(s(s(o(0,0,0),o(1,0,0),a[0]),s(o(0,1,0),o(1,1,0),a[0]),a[1]),s(s(o(0,0,1),o(1,0,1),a[0]),s(o(0,1,1),o(1,1,1),a[0]),a[1]),a[2])*.9}var eo=e=>({target:{...e.target},radius:e.radius}),to=(e,t,n)=>e+(t-e)*n,no=(e,t,n)=>({target:{x:to(e.target.x,t.target.x,n),y:to(e.target.y,t.target.y,n),z:to(e.target.z,t.target.z,n)},radius:to(e.radius,t.radius,n)}),ro=class{state=`idle`;camera;onExit;visual=null;returnPose=null;radiusRange=null;transitionFrom=null;transitionTo=null;transitionElapsed=0;blendFrom=0;blendTo=0;blend=0;reducedMotion;exitNotified=!1;yawVelocity=0;pitchVelocity=0;transitionMs;focusRadiusMultiplier;minRadiusMultiplier;maxRadiusMultiplier;pointerRadiansPerPixel;keyboardStep;wheelSensitivity;constructor(e,t,n={}){this.camera=e,this.onExit=t,this.reducedMotion=n.reducedMotion??!1,this.transitionMs=Math.max(1,n.transitionMs??420),this.focusRadiusMultiplier=n.focusRadiusMultiplier??4,this.minRadiusMultiplier=n.minRadiusMultiplier??2.2,this.maxRadiusMultiplier=n.maxRadiusMultiplier??8,this.pointerRadiansPerPixel=n.pointerRadiansPerPixel??.005,this.keyboardStep=n.keyboardStep??.08,this.wheelSensitivity=n.wheelSensitivity??.001}enter(e,t,n){this.state===`idle`&&(this.returnPose=eo(this.camera.readPose())),this.visual=e,this.exitNotified=!1,this.clearRotationInertia(),this.radiusRange=n&&Number.isFinite(n.low)&&Number.isFinite(n.high)&&n.low>0&&n.high>=n.low?n:null;let r=Number.isFinite(t)&&t>0?this.radiusRange?Math.min(this.radiusRange.high,Math.max(this.radiusRange.low,t)):t:this.clampRadius(e.radius*this.focusRadiusMultiplier);this.beginTransition(`entering`,{target:{...e.focusTarget()},radius:r},1)}exit(){this.state===`idle`||!this.visual||!this.returnPose||(this.clearRotationInertia(),this.radiusRange=null,this.beginTransition(`exiting`,this.returnPose,0))}suspend(e=!0){this.state!==`idle`&&(this.clearRotationInertia(),e&&this.returnPose&&this.camera.writePose(eo(this.returnPose)),this.visual&&this.visual.setFocusBlend(0),this.finishExit())}setReducedMotion(e){this.reducedMotion=e,this.camera.stopInertia(),this.clearRotationInertia(),e&&(this.state===`entering`||this.state===`exiting`)&&this.finishTransition()}update(e){if((this.state===`entering`||this.state===`exiting`)&&Number.isFinite(e)&&e>0){this.transitionElapsed+=e;let t=Math.min(1,this.transitionElapsed/this.transitionMs);this.applyTransition(t),t>=1&&this.finishTransition()}if(this.state===`focused`&&!this.reducedMotion&&this.visual&&(Math.abs(this.yawVelocity)>1e-4||Math.abs(this.pitchVelocity)>1e-4)){let t=Math.max(0,Math.min(4,e/16));this.visual.rotate(this.yawVelocity*t,this.pitchVelocity*t);let n=.84**t;this.yawVelocity*=n,this.pitchVelocity*=n}}drag(e,t){if(this.state!==`focused`||!this.visual||!Number.isFinite(e)||!Number.isFinite(t))return!1;let n=-e*this.pointerRadiansPerPixel,r=-t*this.pointerRadiansPerPixel;return this.visual.rotate(n,r),this.reducedMotion||(this.yawVelocity=n,this.pitchVelocity=r),!0}wheel(e){if(this.state!==`focused`||!Number.isFinite(e))return!1;let t=this.camera.readPose(),n=this.clampRadius(t.radius*Math.exp(e*this.wheelSensitivity));return e>0&&n<=t.radius+1e-6?!1:(this.camera.writePose({...t,radius:n}),!0)}pinch(e){if(this.state!==`focused`||!Number.isFinite(e)||e<=0)return!1;let t=this.camera.readPose();return this.camera.writePose({...t,radius:this.clampRadius(t.radius/e)}),!0}keyDown(e){if(e===`Escape`)return this.state!==`idle`&&(this.exitNotified||(this.exitNotified=!0,this.exit(),this.onExit()),!0);if(this.state!==`focused`||!this.visual)return!1;let t=e.toLowerCase(),n={arrowleft:[-this.keyboardStep,0],a:[-this.keyboardStep,0],arrowright:[this.keyboardStep,0],d:[this.keyboardStep,0],arrowup:[0,this.keyboardStep],w:[0,this.keyboardStep],arrowdown:[0,-this.keyboardStep],s:[0,-this.keyboardStep]}[t];return n?(this.visual.rotate(n[0],n[1]),!0):!1}beginTransition(e,t,n){this.state=e,this.transitionFrom=eo(this.camera.readPose()),this.transitionTo=eo(t),this.transitionElapsed=0,this.blendFrom=this.blend,this.blendTo=n,this.reducedMotion&&this.finishTransition()}applyTransition(e){!this.transitionFrom||!this.transitionTo||!this.visual||(this.camera.writePose(no(this.transitionFrom,this.transitionTo,e)),this.blend=to(this.blendFrom,this.blendTo,e),this.visual.setFocusBlend(this.blend))}finishTransition(){if(this.applyTransition(1),this.state===`entering`){this.state=`focused`;return}this.state===`exiting`&&this.finishExit()}finishExit(){this.state=`idle`,this.visual=null,this.returnPose=null,this.transitionFrom=null,this.transitionTo=null,this.transitionElapsed=0,this.blend=0}clampRadius(e){if(this.radiusRange)return Math.min(this.radiusRange.high,Math.max(this.radiusRange.low,e));let t=Number.isFinite(this.visual?.radius)&&this.visual.radius>0?this.visual.radius:1,n=this.visual?.minimumFocusRadiusMultiplier,r=Number.isFinite(n)&&n>0?Math.max(this.minRadiusMultiplier,n):this.minRadiusMultiplier;return Math.min(t*this.maxRadiusMultiplier,Math.max(t*r,e))}clearRotationInertia(){this.yawVelocity=0,this.pitchVelocity=0,this.camera.stopInertia()}},io=5,ao=4.8,oo=.9,so=1.8,co=1.15,lo=.82,uo=Math.PI*.18000000000000005;function fo(e){let t=Math.hypot(e.x,e.z)||1;return Object.freeze({wallArc:lo,wallRotationY:0,openingDirection:Object.freeze({x:W(Math.cos(uo)),z:W(Math.sin(uo))}),tunnelDirection:Object.freeze({x:W(e.x/t),z:W(e.z/t)})})}function po(e,t){let n=G(t);if(e.evidenceLevel===`surface-only`)return Object.freeze({evidenceLevel:e.evidenceLevel,entryPose:n,bounds:Object.freeze({minDepth:0,maxDepth:io,radius:ao}),layers:Object.freeze([]),specimens:Object.freeze(e.surfaceSpecimens.map((t,n)=>vo(t,n,e.surfaceSpecimens.length,2.35,`surface`))),undatedRoom:null,blockedDepth:!0});let r=Math.max(2.4,Math.min(e.bounds.bottom-1,e.bounds.bottom*.58)),i=Math.PI/2-uo,a=6.949999999999999,o=e.undated.length>0?Object.freeze({centerDepth:r,angle:i,x:W(Math.sin(i)*a),z:W(Math.cos(i)*a),radius:2.2,openArc:.72}):null,s=e.strata.map((e,t)=>Object.freeze({id:e.id,centerDepth:e.centerDepth,thickness:e.thickness,colorIndex:t%4,openingAngle:o&&Math.abs(e.centerDepth-o.centerDepth)<=e.thickness/2?o.angle:null})),c=e.strata.flatMap(e=>e.specimens.map((t,n)=>vo(t,n,e.specimens.length,yo(t,e),`main`))),l=e.undated.map((t,n)=>vo(t,n,e.undated.length,r,`undated`,o));return Object.freeze({evidenceLevel:e.evidenceLevel,entryPose:n,bounds:Object.freeze({minDepth:e.bounds.top,maxDepth:e.bounds.bottom,radius:ao}),layers:Object.freeze(s),specimens:Object.freeze([...c,...l]),undatedRoom:o,blockedDepth:!1})}function mo(e,t,n,r){let i=U(n,0,.1),a=U(t.forward,-1,1),o=U(t.yaw,-1,1),s=U(t.pitch,-1,1),c=e.snapId?7:11;return ho({depth:U(e.depth+a*c*i,r.bounds.minDepth,r.bounds.maxDepth),yaw:xo(e.yaw+o*1.8*i),pitch:U(e.pitch+s*1.4*i,-1.15,co),snapId:e.snapId},r)}function ho(e,t){if(t.evidenceLevel!==`retrospective`||t.layers.length===0)return G({...e,snapId:null});if(e.snapId){let n=t.layers.find(({id:t})=>t===e.snapId);if(n&&Math.abs(e.depth-n.centerDepth)<=so)return G({...e,snapId:n.id})}let n=t.layers.reduce((t,n)=>t?Math.abs(n.centerDepth-e.depth)<Math.abs(t.centerDepth-e.depth)?n:t:n,null);return n&&Math.abs(n.centerDepth-e.depth)<=oo?G({...e,depth:n.centerDepth,snapId:n.id}):G({...e,snapId:null})}function go(e,t){return Object.freeze({answerId:t.answerId,savedPose:G(e),pose:G({depth:t.depth,yaw:xo(Math.atan2(t.x,t.z)-.28),pitch:U((t.depth-e.depth)*.045,-.35,.35),snapId:e.snapId})})}function _o(e){return e?G(e.savedPose):null}function vo(e,t,n,r,i,a=null){let o=So(e.answerId),s=(n<=1?0:t/n*Math.PI*2)+(i===`undated`?Math.PI*.38:0)+((o&255)/255-.5)*.26,c=i===`undated`?.85:3.85+(o>>>8&255)/255*.4,l=i===`undated`?a?.x??0:0,u=i===`undated`?a?.z??0:0;return Object.freeze({answerId:e.answerId,depth:W(i===`main`?r:r+((o>>>16&255)/255-.5)*.72),x:W(l+Math.sin(s)*c),z:W(u+Math.cos(s)*c),scale:W(.22+(o>>>24&255)/255*.18),room:i,relations:e.relations})}function yo(e,t){let n=Math.max(1,t.endPublishedAt-t.startPublishedAt),r=U(((e.publishedAt??t.startPublishedAt)-t.startPublishedAt)/n,0,1),i=Math.min(.6,t.thickness*.12),a=Math.max(.5,t.thickness-i*2);return W(t.centerDepth+a/2-r*a)}function bo(e,t){return e===null||!Number.isFinite(e)||!Number.isFinite(t)?1/60:U((t-e)/1e3,1/240,.1)}var U=(e,t,n)=>Math.min(n,Math.max(t,Number.isFinite(e)?e:0)),W=e=>Math.round(e*1e6)/1e6;function xo(e){let t=(e+Math.PI)%(Math.PI*2);return(t<0?t+Math.PI*2:t)-Math.PI}function G(e){return Object.freeze({depth:e.depth,yaw:e.yaw,pitch:e.pitch,snapId:e.snapId})}function So(e){let t=2166136261;for(let n=0;n<e.length;n+=1)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}var Co=class{port;callbacks;active=null;cancelAnimation=null;nextGeneration=1;constructor(e,t={}){this.port=e,this.callbacks=t}get layout(){return this.active?.layout??null}get pose(){return this.active?To(this.active.pose):null}get token(){return this.active?.request.token??null}get questionId(){return this.active?.request.questionId??null}get phase(){return this.active?.phase??null}enter(e){if(this.active?.request.token===e.token)return;let t=this.active?.layout.entryPose??null;this.cancelCurrentAnimation(),t&&(this.port.setUniverseVisible(!0),this.port.applyPose(t));let n=this.nextGeneration++,r=t??this.port.capturePose(),i=po(e.scene,r),a=To({depth:i.bounds.minDepth,yaw:r.yaw,pitch:r.pitch,snapId:null});this.active={request:e,layout:i,pose:a,focus:null,phase:`surface-approach`,generation:n},this.emitPhase(`surface-approach`),this.runAnimation(`surface-approach`,n,()=>this.beginCrossing(n))}move(e,t){let n=this.active;if(!n||n.phase!==`strata-free`&&n.phase!==`strata-snapped`||n.focus)return;let r=n.pose.snapId;n.pose=mo(n.pose,e,t,n.layout),this.port.applyPose(n.pose),n.pose.snapId!==r&&(n.phase=n.pose.snapId?`strata-snapped`:`strata-free`,this.emitPhase(n.phase)),this.emitPose()}focusAnswer(e){let t=this.active;if(!t||t.phase!==`strata-free`&&t.phase!==`strata-snapped`||t.focus)return;let n=t.layout.specimens.find(t=>t.answerId===e);if(!n){this.emitError(wo(`答案标本不存在：${e}`),`operation`);return}t.focus=go(t.pose,n),t.pose=t.focus.pose,this.port.applyPose(t.pose),this.callbacks.onAnswerSpecimenFocus?.({token:t.request.token,questionId:t.request.questionId,answerId:e,pose:To(t.focus.savedPose)})}closeAnswer(){let e=this.active;if(!e)return;let t=_o(e.focus);t&&(e.focus=null,e.pose=t,this.port.applyPose(t),this.emitPose())}exit(e){let t=this.active;if(!t||t.request.token!==e||t.phase===`exit`)return;this.cancelCurrentAnimation(),t.phase=`exit`,t.focus=null;let n=t.generation;this.runAnimation(`exit`,n,()=>{let e=this.current(n);if(!e)return;this.port.setUniverseVisible(!0),this.port.applyPose(e.layout.entryPose);let t={token:e.request.token,questionId:e.request.questionId};this.active=null,this.cancelAnimation=null,this.callbacks.onStrataExited?.(t)})}destroy(){this.cancelCurrentAnimation(),this.active=null,this.nextGeneration+=1}beginCrossing(e){let t=this.current(e);t&&(t.phase=`surface-crossing`,this.emitPhase(`surface-crossing`),this.runAnimation(`surface-crossing`,e,()=>this.finishEntry(e)))}finishEntry(e){let t=this.current(e);if(!t)return;this.port.setUniverseVisible(!1),t.phase=`strata-free`,t.pose=To({depth:Math.min(1.2,t.layout.bounds.maxDepth),yaw:0,pitch:-.18,snapId:null}),this.port.applyPose(t.pose);let n={token:t.request.token,questionId:t.request.questionId};this.callbacks.onStrataEntered?.(n),this.emitPhase(`strata-free`),this.emitPose()}runAnimation(e,t,n){let r=this.current(t);if(!r)return;let i=r.request.token;this.cancelAnimation=this.port.animate(e,i,()=>{this.current(t)&&(this.cancelAnimation=null,n())},e=>{let n=this.current(t);n&&(this.cancelAnimation=null,this.emitError(e,`transition`),this.port.setUniverseVisible(!0),this.port.applyPose(n.layout.entryPose),this.active=null)})}current(e){return this.active?.generation===e?this.active:null}cancelCurrentAnimation(){this.cancelAnimation?.(),this.cancelAnimation=null}emitPhase(e){let t=this.active;t&&this.callbacks.onStrataPhase?.(e===`strata-snapped`?{token:t.request.token,questionId:t.request.questionId,phase:e,snapId:t.pose.snapId}:{token:t.request.token,questionId:t.request.questionId,phase:e})}emitPose(){let e=this.active;e&&this.callbacks.onStrataPose?.({questionId:e.request.questionId,pose:To(e.pose)})}emitError(e,t){let n=this.active;n&&this.callbacks.onStrataError?.({token:n.request.token,questionId:n.request.questionId,scope:t,cause:e})}};function wo(e){let t=Error(e);return t.name=`StrataOperationError`,t}function To(e){return Object.freeze({depth:e.depth,yaw:e.yaw,pitch:e.pitch,snapId:e.snapId})}function Eo(e){let t=q(K(e.bright,.5),0,2),n=q(K(e.burst,0),0,1),r=q(2+Math.log1p(t*3)*2.15,2,7);return Object.freeze({color:Do(e.color),luminance:q(.72+Math.log1p(t*4),.72,2.4),panoramaCorePx:r,panoramaHaloPx:q(r*(2.5+n*1.5),6,28),coronaScale:2.5+n*1.5,surfaceActivity:n,seed:Math.abs(Math.trunc(K(e.seed,1)))})}function Do(e){return Object.freeze([q(K(e[0],1),0,1),q(K(e[1],1),0,1),q(K(e[2],1),0,1)])}function K(e,t){return Number.isFinite(e)?e:t}function q(e,t,n){return Math.min(n,Math.max(t,e))}function Oo(e,t){if(e.capturedByHigherPriority)return null;let n=e.inputKind===`mouse`,r=n?10:22,i=n?28:36,a=null,o=1/0;for(let n=0;n<t.length;n+=1){let s=t[n];if(!s||!jo(s,e.viewport.width,e.viewport.height))continue;let c=s.solid?Math.max(0,s.visualRadiusPx)+r:Io(s.visualRadiusPx,r,i),l=e.x-s.x,u=e.y-s.y,d=l*l+u*u;d>c*c||(!a||d<o||d===o&&ko(s,a))&&(a=s,o=d)}return a}function ko(e,t){return e.depth===t.depth?Ao(e.starKey,t.starKey)<0:e.depth<t.depth}function Ao(e,t){return e<t?-1:+(e>t)}function jo(e,t,n){return e.visible&&Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.depth)&&Number.isFinite(e.visualRadiusPx)&&e.x>=0&&e.x<=t&&e.y>=0&&e.y<=n&&e.depth>=0&&e.depth<=1}var Mo=class{prepared;candidates;world=No();constructor(e){this.prepared=e.map(e=>({datum:e,starKey:w(e.s),visual:Eo(e)})),this.candidates=this.prepared.map(({starKey:e,visual:t})=>({starKey:e,x:0,y:0,depth:0,visualRadiusPx:t.panoramaHaloPx,visible:!1}))}update(e,t,n){for(let r=0;r<this.prepared.length;r+=1){let i=this.prepared[r],a=this.candidates[r];if(!i||!a)continue;Jt(i.datum,e,t,this.world);let o=n(this.world,i.datum,i.visual);a.x=o.x,a.y=o.y,a.depth=o.depth,a.visible=o.visible}return this.candidates}};function No(){return{x:0,y:0,z:0,set(e,t,n){return this.x=e,this.y=t,this.z=n,this}}}var Po={activePointerId:null,inputKind:null,origin:null,lastPoint:null,accumulatedMovement:0,pressedStarKey:null,cancelled:!1,multiPointerInvalidated:!1},Fo=class{state=Po;downPointerIds=new Set;snapshot(){return this.state}pointerDown(e){if(this.downPointerIds.has(e.pointerId))return;if(this.downPointerIds.size>0){this.downPointerIds.add(e.pointerId),this.invalidateForMultiplePointers();return}this.downPointerIds.add(e.pointerId);let t={x:e.x,y:e.y};this.state={activePointerId:e.pointerId,inputKind:e.inputKind,origin:t,lastPoint:t,accumulatedMovement:0,pressedStarKey:e.starKey,cancelled:!1,multiPointerInvalidated:!1}}pointerMove(e){e.pointerId!==this.state.activePointerId||!this.state.lastPoint||this.addMovement(e)}pointerUp(e){if(!this.downPointerIds.has(e.pointerId))return null;let t=null;return e.pointerId===this.state.activePointerId&&this.state.lastPoint&&(this.addMovement(e),t=this.downPointerIds.size===1&&!this.state.cancelled&&!this.state.multiPointerInvalidated&&this.state.accumulatedMovement<6&&this.state.pressedStarKey!==null&&e.starKey===this.state.pressedStarKey?this.state.pressedStarKey:null),this.finishPointer(e.pointerId),t}pointerCancel(e){this.cancel(e)}lostPointerCapture(e){this.cancel(e)}addMovement(e){let t=this.state.lastPoint;t&&(this.state={...this.state,lastPoint:{x:e.x,y:e.y},accumulatedMovement:this.state.accumulatedMovement+Math.abs(e.x-t.x)+Math.abs(e.y-t.y)})}cancel(e){this.downPointerIds.has(e)&&this.finishPointer(e)}invalidateForMultiplePointers(){this.state={...this.state,pressedStarKey:null,cancelled:!0,multiPointerInvalidated:!0}}finishPointer(e){let t=e===this.state.activePointerId;if(this.downPointerIds.delete(e),this.downPointerIds.size===0){this.reset();return}this.state={...this.state,activePointerId:t?null:this.state.activePointerId,inputKind:t?null:this.state.inputKind,origin:t?null:this.state.origin,lastPoint:t?null:this.state.lastPoint,pressedStarKey:null,cancelled:!0,multiPointerInvalidated:!0}}reset(){this.state=Po}};function Io(e,t,n){return Math.min(n,Math.max(t,e))}function Lo(e,t){e.alpha=t,e.setEnabled(t>0)}function Ro(e){return e.phase===`panorama`||e.phase===`strata`||e.phase===`planet-focus`||e.ownerKey!==e.focusedOwnerKey?0:e.phase===`approach`?.34*Bo(e.systemReveal):.34}function zo(e){let t=e.phase===`panorama`||e.phase===`strata`||e.ownerKey!==e.focusedOwnerKey?0:e.phase===`approach`?Bo(e.systemReveal):1;return Object.freeze({reveal:t,visible:t>0,pickable:t>=.05})}function Bo(e){return Number.isFinite(e)?Math.min(1,Math.max(0,e)):0}var Vo=Object.freeze({hoverStarKey:null,pressedStarKey:null,cursor:``}),Ho=class{gesture=new Fo;feedback=Vo;snapshot(){return this.feedback}gestureSnapshot(){return this.gesture.snapshot()}pointerDown(e){this.gesture.pointerDown(e),this.feedback=Object.freeze({hoverStarKey:null,pressedStarKey:Uo(this.gesture.snapshot().pressedStarKey),cursor:``})}pointerMove(e){this.gesture.pointerMove(e);let t=this.gesture.snapshot();if(t.activePointerId!==null||t.multiPointerInvalidated){this.feedback=Object.freeze({hoverStarKey:null,pressedStarKey:Uo(t.pressedStarKey),cursor:``});return}this.feedback=Object.freeze({hoverStarKey:Uo(e.starKey),pressedStarKey:null,cursor:e.starKey?`pointer`:``})}pointerUp(e){let t=this.gesture.pointerUp(e);return this.feedback=Vo,t}pointerCancel(e){this.gesture.pointerCancel(e),this.feedback=Vo}lostPointerCapture(e){this.gesture.lostPointerCapture(e),this.feedback=Vo}pointerLeave(){let e=this.gesture.snapshot();e.activePointerId!==null||e.multiPointerInvalidated||(this.feedback=Vo)}clear(){this.gesture=new Fo,this.feedback=Vo}};function Uo(e){return e?.startsWith(`star:`)?e.slice(5):null}function Wo(e,t){return Number.isFinite(e)&&e>0?e:t}function Go(e,t,n,r){let i=Wo(e,.3),a=Wo(t,2.5),o=Wo(n,1),s=Wo(r,1),c=520*o/(2*i*s);return Math.max(.001,Math.min(a,c))}var Ko=`
precision highp float;
varying vec3 vColor;
varying float vAlpha;
varying float vBright;
void main(void) {
  if (vAlpha <= 0.001) discard;
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(uv, uv);
  if (d2 > 1.0) discard;
  vec3 hot = mix(vColor, vec3(1.0), 0.74);
  float energy = min(4.8, (1.4 + vBright * 2.1) * exp(-d2 * 7.5));
  float alpha = clamp(vAlpha * (1.0 - smoothstep(0.42, 1.0, d2)), 0.0, 1.0);
  gl_FragColor = vec4(hot * energy, alpha);
}
`,qo=`
precision highp float;
uniform vec3 uColor;
uniform vec3 uChromosphere;
uniform float uActivity;
uniform float uSeed;
uniform float uRot;
uniform float uTime;
uniform float uCoronaAlpha;
uniform float uCoronaIntensity;
uniform float uCoronaLayers;
uniform float uStreamerCount;
uniform float uProminenceCount;
varying vec2 vUV;

const float TAU = 6.2831853;

float hash11(float value) {
  return fract(sin(value * 78.233 + uSeed * 0.017) * 43758.5453123);
}

// 日冕流苏（helmet streamer）：从冕洞之间伸出去的长条状等离子体。
// 它们让日冕有「结构」而不是一圈均匀的毛边 —— 均匀的毛边正是廉价光晕的样子。
float streamers(float angle, float radius) {
  float total = 0.0;
  for (int index = 0; index < 8; ++index) {
    if (float(index) >= uStreamerCount) break;
    float slot = float(index) + 1.0;
    float axis = hash11(slot * 3.13) * TAU + uRot * 0.35;
    float width = mix(0.22, 0.075, hash11(slot * 7.71));
    float reach = mix(0.62, 1.0, hash11(slot * 11.37));
    float delta = abs(mod(angle - axis + 3.14159265, TAU) - 3.14159265);
    float lobe = exp(-delta * delta / max(width * width, 1e-5));
    float fade = smoothstep(reach, 0.30, radius);
    total += lobe * fade;
  }
  return total;
}

// 日珥 / 喷发弧：贴着临边升起的环状等离子体，按墙钟缓慢起伏。
// 活动性高的恒星才喷得高 —— 这是「恒星是活的」在画面上的证据。
float prominences(float angle, float radius) {
  float total = 0.0;
  for (int index = 0; index < 6; ++index) {
    if (float(index) >= uProminenceCount) break;
    float slot = float(index) + 1.0;
    float axis = hash11(slot * 5.19) * TAU + uRot;
    float phase = hash11(slot * 13.7) * TAU;
    // 每一个日珥有自己的呼吸周期，于是它们不会整齐地一起鼓一起消。
    float breath = 0.55 + 0.45 * sin(uTime * 0.00042 * (0.6 + hash11(slot * 2.3)) + phase);
    float height = mix(0.055, 0.185, hash11(slot * 17.9)) * (0.35 + uActivity * 0.65) * breath;
    float width = mix(0.16, 0.055, hash11(slot * 23.1));
    float delta = abs(mod(angle - axis + 3.14159265, TAU) - 3.14159265);
    float arc = exp(-delta * delta / max(width * width, 1e-5));
    // 拱形：底部贴着 0.30 的临边，顶部按 height 拱出去。
    float foot = 0.30;
    float ridge = 1.0 - smoothstep(0.0, height, abs(radius - foot - height * 0.55));
    total += arc * ridge * ridge;
  }
  return clamp(total, 0.0, 1.6);
}

void main(void) {
  vec2 centered = vUV * 2.0 - 1.0;
  float radius = length(centered);
  if (radius > 1.0) discard;
  float angle = atan(centered.y, centered.x);
  float cutout = smoothstep(0.27, 0.37, radius);
  float ring = exp(-abs(radius - 0.40) * 12.0);
  float outer = pow(max(0.0, 1.0 - radius), 2.2);
  float ray = 0.72 + 0.28 * sin(angle * (7.0 + uCoronaLayers * 2.0) + uRot + uSeed + uTime * 0.0001);
  float streamer = streamers(angle, radius) * (0.28 + uActivity * 0.20);
  float corona = cutout * (ring * 0.50 + outer * ray * (0.34 + uActivity * 0.22) + outer * streamer);

  float prominence = prominences(angle, radius) * smoothstep(0.26, 0.32, radius);
  // 日珥是色球的物质，所以它带色球的红，不是日冕的白。
  vec3 tint = mix(uColor, uChromosphere, clamp(prominence * 0.85, 0.0, 0.78));
  float alpha = clamp((corona + prominence * 0.62) * uCoronaAlpha, 0.0, 0.82);
  gl_FragColor = vec4(tint * (0.72 + uCoronaIntensity * 0.38), alpha);
}
`,Jo=`
precision highp float;
uniform vec3 uColor;
uniform float uSpikeCount;
uniform float uDiffractionAlpha;
uniform float uRot;
uniform float uTime;
uniform float uActivity;
varying vec2 vUV;

const float TAU = 6.2831853;

// 聚焦恒星的衍射星芒。
//
// 全景里点精灵已有星芒（starFlare.fragment.fx），但一旦飞近、恒星改由球体渲染，
// 星芒就整个消失了 —— 于是「越靠近越不像恒星」。这一层把它补回来，并且用的是
// **光阑衍射**的形状（叶片数决定芒的条数），不是随手叠一个十字。
//
// 条数由画质分档给（high 6 条、medium/low 4 条），亮度由活动性调制，
// 长度按半径衰减。它是叠加混合的，所以永远不会把中心压暗。
void main(void) {
  vec2 centered = vUV * 2.0 - 1.0;
  float radius = length(centered);
  if (radius > 1.0) discard;
  // atan(0, 0) 在 GLSL 里是未定义的，而公告板正中心恰好可能落在某个像素中心上。
  // 那一个像素会把 NaN 一路带到 alpha，clamp(NaN) 同样未定义。给一个不改变
  // 任何其他像素取值的方向兜底。
  vec2 direction = radius < 1e-6 ? vec2(1.0, 0.0) : centered;
  float angle = atan(direction.y, direction.x) + uRot * 0.08;
  float blades = max(uSpikeCount, 2.0);
  // 叶片衍射：n 片光阑给出 n 条（n 为偶数）或 2n 条（n 为奇数）芒。
  // 这里直接用角向余弦的高次幂近似那组芒，代价是一次 cos。
  float lobe = pow(abs(cos(angle * blades * 0.5)), 220.0);
  // 芒身：中心密、外缘散，末端软收。指数取得陡，是因为它必须细 ——
  // 粗的星芒不是电影感，是廉价滤镜。
  float shaft = exp(-radius * 7.4) * (1.0 - smoothstep(0.40, 0.92, radius));
  float glint = exp(-radius * radius * 240.0);
  // 极缓慢的呼吸，避免星芒像贴纸一样钉死在画面上。Reduced Motion 时
  // uTime 不推进，这一项自然退化成常数。
  float breath = 0.86 + 0.14 * sin(uTime * 0.00031 + uRot);
  float energy = (lobe * shaft * 1.10 + glint * 0.30) * breath * (0.55 + uActivity * 0.45);
  float alpha = clamp(energy * uDiffractionAlpha, 0.0, 0.34);
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.58) * (0.9 + energy), alpha);
}
`,Yo=`
precision highp float;
uniform float uFlareThreshold;
uniform float uFlareAlpha;
varying vec3 vColor;
varying float vAlpha;
varying float vBright;
varying float vRot;
void main(void) {
  float gate = smoothstep(uFlareThreshold, uFlareThreshold + 0.14, vBright);
  if (gate <= 0.001) discard;
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float radius = length(uv);
  if (radius > 1.0) discard;
  float cosine = cos(vRot);
  float sine = sin(vRot);
  vec2 rotated = mat2(cosine, -sine, sine, cosine) * uv;
  float primary = exp(-abs(rotated.x) * 2.4) * exp(-abs(rotated.y) * 150.0)
    + exp(-abs(rotated.y) * 2.4) * exp(-abs(rotated.x) * 150.0);
  vec2 secondaryAxis = vec2(rotated.x + rotated.y, rotated.x - rotated.y) * 0.70710678;
  float secondary = exp(-abs(secondaryAxis.x) * 3.6) * exp(-abs(secondaryAxis.y) * 230.0)
    + exp(-abs(secondaryAxis.y) * 3.6) * exp(-abs(secondaryAxis.x) * 230.0);
  float spikes = (primary + secondary * 0.42) * smoothstep(1.0, 0.12, radius);
  vec3 color = mix(vColor, vec3(1.0), 0.62);
  gl_FragColor = vec4(color * min(2.2, 0.8 + vBright), clamp(spikes * gate * vAlpha * uFlareAlpha, 0.0, 0.9));
}
`,Xo=`
precision highp float;
uniform float uHaloAlpha;
varying vec3 vColor;
varying float vAlpha;
varying float vBright;
void main(void) {
  float radius = length(gl_PointCoord * 2.0 - 1.0);
  if (radius > 1.0) discard;
  float innerSlope = exp(-radius * 4.6) * 0.62;
  float outerSlope = pow(1.0 - radius, 3.0) * 0.42;
  float alpha = clamp((innerSlope + outerSlope) * vAlpha * uHaloAlpha * (0.5 + vBright * 0.5), 0.0, 0.86);
  gl_FragColor = vec4(vColor * (0.72 + vBright * 0.28), alpha);
}
`,Zo=`
precision highp float;

attribute vec3 position;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute vec3 aColor;
attribute float aPeriod;
attribute float aCoreSize;
attribute float aHaloSize;
attribute float aBright;
attribute float aBurst;
attribute float aSeed;
attribute float aRot;
attribute float aBodyR;
attribute float aDim;
attribute float aCoreDim;
attribute float aHaloDim;
attribute vec3 aInteraction;

uniform mat4 worldView;
uniform mat4 projection;
uniform float uTime;
uniform float uBobAmplitude;
uniform float uRenderHeight;
uniform float uDevicePixelRatio;
uniform float uProjectionScale;
uniform float uLayer;
uniform float uCoreScale;
uniform float uCoreBrightness;
uniform float uHaloIntensity;
uniform float uPanoramaAlpha;

varying vec3 vColor;
varying float vAlpha;
varying float vBright;
varying float vRot;

vec3 starWorldPosition(vec3 source) {
  vec3 offset = source - aCenter;
  float theta = aPeriod == 0.0 ? 0.0 : 6.28318530718 / aPeriod * (uTime * 0.001);
  float cosine = cos(theta);
  float sine = sin(theta);
  float along = dot(aAxis, offset);
  vec3 orbit = offset * cosine + cross(aAxis, offset) * sine
    + aAxis * along * (1.0 - cosine);
  float bob = sin(uTime / (6400.0 + mod(aSeed * 311.0, 5200.0)) + aSeed) * uBobAmplitude;
  return aCenter + orbit + aAxis * bob;
}

void main(void) {
  vec3 worldPosition = starWorldPosition(position);
  vec4 view = worldView * vec4(worldPosition, 1.0);
  gl_Position = projection * view;

  float twinkle = 1.0 - (0.09 + 0.26 * aBurst)
    * (0.5 + 0.5 * sin(uTime / (760.0 + mod(aSeed * 53.0, 900.0)) + aSeed * 1.7));
  float coreCss = aCoreSize * uCoreScale * aInteraction.x;
  float haloCss = aHaloSize * mix(uHaloIntensity * aInteraction.z, 1.7, step(1.5, uLayer));
  float requestedCss = mix(coreCss, haloCss, step(0.5, uLayer));
  // Panorama sprites stay screen-space bounded. Near-field scale belongs to the
  // separately rendered focused sphere/corona pair after a star is selected.
  float cssSize = clamp(requestedCss, 1.0, 36.0);
  float physicalSize = cssSize * max(1.0, uDevicePixelRatio);
  gl_PointSize = physicalSize;

  vColor = aColor;
  vBright = aBright;
  vRot = aRot;
  float effectiveDim = mix(aCoreDim, aHaloDim, step(0.5, uLayer));
  vAlpha = min(aDim, effectiveDim) * uPanoramaAlpha * twinkle
    * mix(uCoreBrightness * aInteraction.y, 1.0, step(0.5, uLayer));
}
`,Qo=`
precision highp float;
#ifndef STAR_NOISE_OCTAVES
#define STAR_NOISE_OCTAVES 4
#endif
uniform vec3 uColor;
uniform vec3 uLimbColor;
uniform vec3 uCoreColor;
uniform vec3 cameraPosition;
uniform float uKelvin;
uniform float uSeed;
uniform float uRot;
uniform float uActivity;
uniform float uTime;
uniform float uSurfaceAlpha;
uniform float uHdrGain;
uniform float uSpotCount;
uniform float uSpotStrength;
uniform float uSupergranulation;
varying vec3 vLocal;
varying vec3 vWorldNormal;
varying vec3 vViewDirection;

float hash31(vec3 point) {
  return fract(sin(dot(point, vec3(127.1, 311.7, 74.7)) + uSeed * 17.17) * 43758.5453123);
}
float valueNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 blend = fract(point);
  blend = blend * blend * (3.0 - 2.0 * blend);
  float low = mix(mix(hash31(cell), hash31(cell + vec3(1.0, 0.0, 0.0)), blend.x),
    mix(hash31(cell + vec3(0.0, 1.0, 0.0)), hash31(cell + vec3(1.0, 1.0, 0.0)), blend.x), blend.y);
  float high = mix(mix(hash31(cell + vec3(0.0, 0.0, 1.0)), hash31(cell + vec3(1.0, 0.0, 1.0)), blend.x),
    mix(hash31(cell + vec3(0.0, 1.0, 1.0)), hash31(cell + vec3(1.0)), blend.x), blend.y);
  return mix(low, high, blend.z);
}
float warpedGranulation(vec3 point) {
  vec3 warp = vec3(valueNoise(point * 2.1), valueNoise(point * 2.1 + 9.7), valueNoise(point * 2.1 - 5.3));
  float result = 0.0;
  float weight = 0.54;
  for (int i = 0; i < 4; ++i) {
    #if STAR_NOISE_OCTAVES == 2
      if (i >= 2) break;
    #elif STAR_NOISE_OCTAVES == 3
      if (i >= 3) break;
    #endif
    result += valueNoise(point + warp * 1.7) * weight;
    point *= 2.17;
    weight *= 0.52;
  }
  return result;
}

// 星斑场。
//
// 每一个斑是一个方向上的余弦帽：本影（深）套在半影（浅）里，边界不锐利。
// 数量由画质分档给，强度由恒星活动性给 —— 活跃的星长斑，宁静的星几乎不长。
// 这是整颗恒星「有实体」的主要来源：暗特征是唯一穿得过 bloom 的结构。
float starSpotField(vec3 direction) {
  float coverage = 0.0;
  for (int index = 0; index < 6; ++index) {
    if (float(index) >= uSpotCount) break;
    float slot = float(index) + 1.0;
    // 斑的位置由种子决定，缓慢随自转漂移。
    float phi = hash31(vec3(slot, 3.7, 1.3)) * 6.2831853 + uRot;
    float cosTheta = hash31(vec3(slot, 9.1, 5.7)) * 1.5 - 0.75;
    float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    vec3 center = vec3(sinTheta * cos(phi), cosTheta, sinTheta * sin(phi));
    float angular = dot(normalize(direction), center);
    // 活动性调制的是斑**多大**，不是斑**多深**。深度是物理常数
    // （本影约是宁静光球的两成），把它当强度旋钮拧小，斑就退化成
    // 一块看不见的灰 —— 那正是提升前的样子。
    float extent = mix(0.014, 0.085, uSpotStrength) * mix(0.6, 1.0, hash31(vec3(slot, 17.3, 2.9)));
    float radius = 1.0 - extent;
    // 本影 + 半影：两段 smoothstep 拼出一个有边缘结构的斑，而不是一个模糊点。
    float penumbra = smoothstep(radius - extent * 0.85, radius + extent * 0.30, angular);
    float umbra = smoothstep(radius + extent * 0.10, radius + extent * 0.62, angular);
    coverage = max(coverage, penumbra * 0.42 + umbra * 0.58);
  }
  return clamp(coverage, 0.0, 1.0);
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  float facing = clamp(dot(normal, normalize(vViewDirection)), 0.0, 1.0);
  float animatedTime = uTime * 0.00008;
  vec3 direction = normalize(vLocal);

  // 两个尺度的对流：超米粒（大而慢）与米粒（小而快）。
  // 只有一个尺度时表面读起来是噪声贴图，有两个才读起来是在沸腾。
  float supergranulation = warpedGranulation(vLocal * 2.4
    + vec3(uRot * 0.35, animatedTime * 0.4, -animatedTime * 0.4));
  float granulation = warpedGranulation(vLocal * 10.5 + vec3(uRot, animatedTime, -animatedTime));
  granulation = mix(granulation, supergranulation, uSupergranulation);
  float cellular = abs(valueNoise(vLocal * 31.0 + uSeed) * 2.0 - 1.0);
  // 米粒间道：对流下沉的冷通道。它窄、暗，并且是唯一在 bloom 之后
  // 还能把「一颗球」和「一团光」区分开的高频线索。
  float lane = 1.0 - smoothstep(0.30, 0.62, abs(supergranulation - 0.5) * 2.0);

  float limb = 0.30 + 0.70 * pow(facing, 0.58);
  float heat = clamp((uKelvin - 2800.0) / 7000.0, 0.0, 1.0);
  vec3 hotCenter = mix(uColor, vec3(1.0, 0.92, 0.76), 0.42 + heat * 0.24);
  // 分层色温：视线越斜，看到的光球层越高越冷，并露出色球的暖边。
  vec3 stratified = mix(uLimbColor, hotCenter, pow(facing, 0.42));
  stratified = mix(stratified, uCoreColor, pow(facing, 6.0) * 0.32);

  float spot = starSpotField(direction);
  float spotFactor = 1.0 - 0.84 * spot;
  // 光斑：斑的外围热壁，只在临边露出来（正对视线时它是侧面，看不到）。
  float facula = clamp(spot * (1.0 - facing) * 1.4 * uSpotStrength, 0.0, 1.0);

  // 米粒对比曲线：围绕均值 0.89 取幂。均值处恒等（恢复门禁逐位不变），
  // 两侧被拉开 —— 恢复批次的跨度全部落在 KHR Neutral 的压缩段里，
  // 加再多细节观众也只看到同一块白。
  float detail = 0.34 + granulation * 0.86 + cellular * 0.24 - lane * 0.30;
  detail = 0.89 * pow(max(detail, 0.02) / 0.89, 1.85);
  // 局部色温：暗的地方是下沉的冷等离子体，亮的地方是上涌的热柱。
  // 少了这一项，暗纹只是同一个色相被调暗 —— 画面读起来是月面的灰斑，
  // 不是恒星的对流。色温跟着亮度走，它才读成「在沸腾」。
  vec3 localTint = mix(uLimbColor, stratified, smoothstep(0.10, 1.05, detail));
  vec3 detailed = localTint * max(detail, 0.04);
  float flare = uActivity * pow(max(0.0, granulation - 0.62), 3.0) * 2.4;
  // HDR: the surface has to clear the bloom threshold or the star reads as rock.
  vec3 color = (detailed * limb * spotFactor * (1.0 + facula * 0.62)
    + mix(uColor, vec3(1.0, 0.48, 0.16), 0.5) * flare) * uHdrGain;
  gl_FragColor = vec4(min(color, vec3(6.0)), clamp(uSurfaceAlpha, 0.0, 1.0));
}
`,$o=`
precision highp float;
#ifndef STAR_NOISE_OCTAVES
#define STAR_NOISE_OCTAVES 4
#endif
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform vec3 cameraPosition;
uniform float uSeed;
uniform float uActivity;
uniform float uTime;
varying vec3 vLocal;
varying vec3 vWorldNormal;
varying vec3 vViewDirection;

float surfaceHash(vec3 point) {
  return fract(sin(dot(point, vec3(127.1, 311.7, 74.7)) + uSeed * 13.31) * 43758.5453123);
}

float surfaceNoise(vec3 point) {
  float signal = 0.0;
  float amplitude = 0.54;
  for (int i = 0; i < 4; ++i) {
    #if STAR_NOISE_OCTAVES == 2
      if (i >= 2) break;
    #elif STAR_NOISE_OCTAVES == 3
      if (i >= 3) break;
    #endif
    signal += surfaceHash(floor(point)) * amplitude;
    point = point * 2.07 + vec3(1.7, -2.3, 0.9);
    amplitude *= 0.5;
  }
  return signal;
}

float surfaceHeight(vec3 direction) {
  float frozenDetail = surfaceNoise(direction * 5.2 + vec3(uSeed * 0.07));
  float rollingDetail = surfaceNoise(direction * 9.1 + vec3(uTime * 0.00007, 0.0, -uTime * 0.00005));
  return (mix(frozenDetail, rollingDetail, 0.35 + uActivity * 0.45) - 0.50)
    * (0.018 + uActivity * 0.042);
}

void main(void) {
  vec3 radial = normalize(position);
  float baseRadius = length(position);
  vec3 displacedPosition = radial * (baseRadius + surfaceHeight(radial));

  vec3 helper = abs(radial.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(helper, radial));
  vec3 bitangent = normalize(cross(radial, tangent));
  float epsilon = 0.012;
  vec3 tangentDirection = normalize(radial + tangent * epsilon);
  vec3 bitangentDirection = normalize(radial + bitangent * epsilon);
  vec3 tangentPoint = tangentDirection * (baseRadius + surfaceHeight(tangentDirection));
  vec3 bitangentPoint = bitangentDirection * (baseRadius + surfaceHeight(bitangentDirection));
  vec3 displacedNormal = normalize(cross(
    tangentPoint - displacedPosition,
    bitangentPoint - displacedPosition
  ));

  vLocal = normalize(displacedPosition);
  vWorldNormal = normalize(mat3(world) * displacedNormal);
  vec3 worldPosition = (world * vec4(displacedPosition, 1.0)).xyz;
  vViewDirection = cameraPosition - worldPosition;
  gl_Position = worldViewProjection * vec4(displacedPosition, 1.0);
}
`,es=Object.freeze({high:Object.freeze({sphereSegments:48,noiseOctaves:4,coronaLayers:2}),medium:Object.freeze({sphereSegments:32,noiseOctaves:3,coronaLayers:2}),low:Object.freeze({sphereSegments:20,noiseOctaves:2,coronaLayers:1})}),ts=new r(kn[0],kn[1],kn[2]),ns=.28,rs=.42,is=3.1,as=.3,os=[`position`,`aCenter`,`aAxis`,`aColor`,`aPeriod`,`aCoreSize`,`aHaloSize`,`aBright`,`aBurst`,`aSeed`,`aRot`,`aBodyR`,`aDim`,`aCoreDim`,`aHaloDim`,`aInteraction`],ss=[`worldView`,`projection`,`uTime`,`uBobAmplitude`,`uRenderHeight`,`uDevicePixelRatio`,`uProjectionScale`,`uLayer`,`uCoreScale`,`uCoreBrightness`,`uHaloIntensity`,`uPanoramaAlpha`,`uHaloAlpha`,`uFlareThreshold`,`uFlareAlpha`],cs=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(void) { vUV = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }
`,ls=`
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform vec3 cameraPosition;
varying vec3 vNormal;
varying vec3 vViewDirection;
void main(void) {
  vec3 worldPosition = (world * vec4(position, 1.0)).xyz;
  vNormal = normalize(mat3(world) * normal);
  vViewDirection = cameraPosition - worldPosition;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`,us=`
precision highp float;
uniform vec3 uColor;
uniform float uSurfaceAlpha;
uniform float uHdrGain;
varying vec3 vNormal;
varying vec3 vViewDirection;
void main(void) {
  float facing = max(0.0, dot(normalize(vNormal), normalize(vViewDirection)));
  float limb = 0.34 + 0.66 * pow(facing, 0.58);
  vec3 hotCore = mix(uColor, vec3(1.0), 0.64);
  vec3 analyticCore = hotCore * min(2.2, 0.72 + limb * 1.18) * uHdrGain;
  gl_FragColor = vec4(min(analyticCore, vec3(6.0)), clamp(uSurfaceAlpha, 0.0, 1.0));
}
`,ds=`
precision highp float;
uniform vec3 uColor;
uniform float uCoronaAlpha;
uniform float uCoronaIntensity;
varying vec2 vUV;
void main(void) {
  float radius = length(vUV * 2.0 - 1.0);
  if (radius > 1.0) discard;
  float ring = smoothstep(0.28, 0.38, radius) * pow(max(0.0, 1.0 - radius), 2.4);
  gl_FragColor = vec4(uColor * uCoronaIntensity, ring * uCoronaAlpha * 0.72);
}
`,fs=class{stars;descriptors;descriptorByDatum;reducedMotion;lastElapsedMs=0;options;qualityConfig;geometry;panorama;dimensionsBuffer;baseDimensions;interactionBuffer;coreDimensionsBuffer;haloDimensionsBuffer;focusSphere;focusCorona;focusedMaterials=[];focusedDatum=null;focusedKey=null;presentation=null;hoverKey=null;pressedKey=null;fallbackActive=!1;fallbackFailed=!1;advancedFailure=null;focusedKind=`advanced`;compileGeneration=0;fallbackScheduled=!1;focusedReady=!1;disposed=!1;focusUniforms={kelvin:0,seed:0,rot:0,activity:0,time:0};hdrGain;uplift;focusDiffraction;scene;constructor(e,t,n,r,i={}){this.scene=e,this.stars=t,this.descriptors=t.map(Eo),this.descriptorByDatum=new Map(t.map((e,t)=>[e,this.descriptors[t]])),this.reducedMotion=r,this.options=i,this.hdrGain=Number.isFinite(i.hdrGain)&&i.hdrGain>0?i.hdrGain:1,this.qualityConfig=es[n],this.uplift=F(n),this.dimensionsBuffer=new Float32Array(t.length).fill(1),this.baseDimensions=new Float32Array(t.length).fill(1),this.interactionBuffer=new Float32Array(t.length*3).fill(1),this.coreDimensionsBuffer=new Float32Array(t.length).fill(1),this.haloDimensionsBuffer=new Float32Array(t.length).fill(1),this.geometry=gs(e,t,this.descriptors,this.dimensionsBuffer,this.coreDimensionsBuffer,this.haloDimensionsBuffer,this.interactionBuffer),this.panorama=[this.createPanoramaBatch(e,`core`,Ko,0),this.createPanoramaBatch(e,`halo`,Xo,1),this.createPanoramaBatch(e,`flare`,Yo,2)],this.focusSphere=ee(`stellar:focus:surface`,{diameter:2,segments:this.qualityConfig.sphereSegments},e),this.focusCorona=re(`stellar:focus:corona`,{size:2},e),this.focusDiffraction=re(`stellar:focus:diffraction`,{size:2},e);for(let e of[this.focusSphere,this.focusCorona,this.focusDiffraction])e.parent=i.parent??null,e.isPickable=!1,e.setEnabled(!1);this.focusCorona.billboardMode=C.BILLBOARDMODE_ALL,this.focusDiffraction.billboardMode=C.BILLBOARDMODE_ALL,this.installAdvancedFocusedMaterials(e)}setDimensions(e){if(this.disposed)return;if(e.length!==this.stars.length)throw RangeError(`Expected ${this.stars.length} star dimensions, received ${e.length}`);let t=!1;for(let n=0;n<this.dimensionsBuffer.length;n+=1){let r=e[n],i=Number.isFinite(r)?Math.min(1,Math.max(0,r)):1;t||=this.baseDimensions[n]!==i,this.baseDimensions[n]=i,this.dimensionsBuffer[n]=this.baseDimensions[n]}t&&(this.geometry.updateVerticesData(`aDim`,this.dimensionsBuffer,!1),this.applyPresentationDimensions())}setFocus(e,t){this.disposed||(this.focusedKey!==e||this.focusedDatum!==t)&&(this.focusedKey=e,this.focusedDatum=t,t&&this.applyFocusDatum(t),this.applyVisibility(),this.applyPresentationDimensions())}setPresentation(e,t,n){if(this.disposed)return;let r=this.presentation,i=!r||r.coreAlpha!==e.coreAlpha||r.haloAlpha!==e.haloAlpha||r.focusedOpacity!==e.focusedOpacity||r.effectiveNonFocusedOpacity!==e.effectiveNonFocusedOpacity||r.lodIntent!==e.lodIntent,a=this.hoverKey!==t||this.pressedKey!==n||!r||r.coreScale!==e.coreScale||r.coreBrightness!==e.coreBrightness||r.haloIntensity!==e.haloIntensity,o=!r||r.surfaceAlpha!==e.surfaceAlpha||r.coronaAlpha!==e.coronaAlpha||r.coronaIntensity!==e.coronaIntensity||r.lodIntent!==e.lodIntent;if(!i&&!a&&!o)return;this.presentation=e,this.hoverKey=t,this.pressedKey=n;let s=e.lodIntent===`hidden`?0:1;this.panorama[0]?.material.setFloat(`uPanoramaAlpha`,s),this.panorama[0]?.material.setFloat(`uCoreScale`,1),this.panorama[0]?.material.setFloat(`uCoreBrightness`,1),this.panorama[1]?.material.setFloat(`uPanoramaAlpha`,s),this.panorama[1]?.material.setFloat(`uHaloIntensity`,1),this.panorama[2]?.material.setFloat(`uPanoramaAlpha`,s),o&&this.applyFocusedPresentationUniforms(),this.applyVisibility(),a&&this.applyInteractions(),i&&this.applyPresentationDimensions()}setReducedMotion(e){if(this.disposed||this.reducedMotion===e)return;this.reducedMotion=e;let t=e?0:1.35;for(let{material:e}of this.panorama)e.setFloat(`uBobAmplitude`,t);this.applyAnimationTime(e?0:this.lastElapsedMs)}update(e){if(this.disposed)return;this.lastElapsedMs=_s(e.elapsedMs);let t=this.reducedMotion?0:this.lastElapsedMs,n=Math.max(1,_s(e.renderHeight)),r=Math.max(1,_s(e.devicePixelRatio)),i=Math.max(1,_s(e.projectionScale));for(let{material:e}of this.panorama)e.setFloat(`uTime`,t),e.setFloat(`uRenderHeight`,n),e.setFloat(`uDevicePixelRatio`,r),e.setFloat(`uProjectionScale`,i);this.applyFocusedAnimationTime(t),this.applyCoronaCap(i)}applyCoronaCap(e){let t=this.focusedDatum,n=this.scene.activeCamera;if(!t||!n)return;let r=this.descriptorByDatum.get(t)??Eo(t),i=ys(t.bodyR,.3,.01,10),a=y.Distance(n.globalPosition,this.focusCorona.position),o=Go(i,r.coronaScale,a,e);this.focusCorona.scaling.setAll(i*o),this.focusDiffraction.scaling.setAll(i*o*is)}applyAnimationTime(e){for(let{material:t}of this.panorama)t.setFloat(`uTime`,e);this.applyFocusedAnimationTime(e)}applyFocusedAnimationTime(e){if(!this.focusedDatum)return;let t=this.focusedDatum;Cs(t,e,this.reducedMotion?0:1.35,this.focusSphere.position),this.focusCorona.position.copyFrom(this.focusSphere.position),this.focusDiffraction.position.copyFrom(this.focusSphere.position),this.focusUniforms={...this.focusUniforms,time:e};for(let t of this.focusedMaterials)t instanceof m&&t.setFloat(`uTime`,e)}diagnostics(){return Object.freeze({panoramaBatchCount:this.panorama.length,panoramaGeometryCount:1,panoramaMeshIds:Object.freeze(this.panorama.map(({mesh:e})=>e.uniqueId)),panoramaMaterialIds:Object.freeze(this.panorama.map(({material:e})=>e.uniqueId)),focusedPairCount:1,focusedMeshIds:Object.freeze([this.focusSphere.uniqueId,this.focusCorona.uniqueId,this.focusDiffraction.uniqueId]),focusedVisible:this.focusSphere.isEnabled()||this.focusCorona.isEnabled(),starOrder:Object.freeze(this.stars.map(({s:e})=>w(e))),dimensions:Object.freeze(Array.from(this.dimensionsBuffer)),interactions:Object.freeze(Array.from({length:this.stars.length},(e,t)=>Object.freeze([vs(this.interactionBuffer[t*3]),vs(this.interactionBuffer[t*3+1]),vs(this.interactionBuffer[t*3+2])]))),quality:this.qualityConfig,stellarShaderFallback:this.fallbackActive,focusedReady:this.focusedReady,focusUniforms:Object.freeze({...this.focusUniforms}),disposed:this.disposed})}dispose(){if(!this.disposed){this.disposed=!0,this.compileGeneration+=1,this.fallbackScheduled=!1,this.focusedReady=!1;for(let{mesh:e,material:t}of this.panorama)e.dispose(!1,!1),t.dispose();this.geometry.dispose(),this.focusSphere.dispose(!1,!1),this.focusCorona.dispose(!1,!1),this.focusDiffraction.dispose(!1,!1);for(let e of this.focusedMaterials)e.dispose();this.focusedMaterials=[]}}createPanoramaBatch(e,t,n,r){let i=new C(`stellar:panorama:${t}`,e);i.parent=this.options.parent??null,i.isPickable=!1,i.isUnIndexed=!0,i.alwaysSelectAsActiveMesh=!0,this.geometry.applyToMesh(i);let a=new m(`stellar:panorama:${t}:material`,e,{vertexSource:Zo,fragmentSource:n},{attributes:os,uniforms:ss,needAlphaBlending:!0});return a.fillMode=x.MATERIAL_PointFillMode,a.alphaMode=x.ALPHA_ADD,a.disableDepthWrite=r!==0,a.setFloat(`uLayer`,r),a.setFloat(`uTime`,0),a.setFloat(`uBobAmplitude`,this.reducedMotion?0:1.35),a.setFloat(`uRenderHeight`,1e3),a.setFloat(`uDevicePixelRatio`,1),a.setFloat(`uProjectionScale`,500),a.setFloat(`uCoreScale`,1),a.setFloat(`uCoreBrightness`,1),a.setFloat(`uHaloIntensity`,1),a.setFloat(`uPanoramaAlpha`,1),a.setFloat(`uHaloAlpha`,1),a.setFloat(`uFlareThreshold`,Pn),a.setFloat(`uFlareAlpha`,1),i.material=a,{mesh:i,material:a,layer:r}}installAdvancedFocusedMaterials(e){let t=new m(`stellar:focus:surface:advanced`,e,{vertexSource:$o,fragmentSource:Qo},{attributes:[`position`,`normal`],uniforms:[`worldViewProjection`,`world`,`cameraPosition`,`uColor`,`uLimbColor`,`uCoreColor`,`uKelvin`,`uSeed`,`uRot`,`uActivity`,`uTime`,`uSurfaceAlpha`,`uHdrGain`,`uSpotCount`,`uSpotStrength`,`uSupergranulation`],defines:[`#define STAR_NOISE_OCTAVES ${this.qualityConfig.noiseOctaves}`],needAlphaBlending:!0});t.setFloat(`uHdrGain`,this.hdrGain),t.setFloat(`uSpotCount`,this.uplift.starSpotCount),t.setFloat(`uSupergranulation`,ns);let n=ps(e,`advanced`,qo);n.setFloat(`uStreamerCount`,this.uplift.coronaStreamerCount),n.setColor3(`uChromosphere`,ts);let r=ms(e,this.uplift.diffractionSpikeCount);t.alphaMode=x.ALPHA_COMBINE,t.disableDepthWrite=!0,n.alphaMode=x.ALPHA_ADD,n.disableDepthWrite=!0,this.focusedMaterials=[t,n,r],this.focusSphere.material=t,this.focusCorona.material=n,this.focusDiffraction.material=r,this.focusedKind=`advanced`,this.startFocusedCompilation(`advanced`,[{material:t,mesh:this.focusSphere},{material:n,mesh:this.focusCorona},{material:r,mesh:this.focusDiffraction}])}activateFallback(e){if(this.disposed||this.focusedKind!==`advanced`)return;this.advancedFailure=e,this.fallbackActive=!1,this.focusedReady=!1,this.focusedKind=`fallback`;let t=this.focusSphere.getScene(),n=this.focusedMaterials,r=hs(t,this.hdrGain),i=ps(t,`fallback`,ds);i.alphaMode=x.ALPHA_ADD,i.disableDepthWrite=!0;let a=ms(t,this.uplift.diffractionSpikeCount);this.focusedMaterials=[r,i,a],this.focusSphere.material=r,this.focusCorona.material=i,this.focusDiffraction.material=a;for(let e of n)e.dispose();this.focusedDatum&&this.applyFocusDatum(this.focusedDatum),this.applyFocusedPresentationUniforms(),this.startFocusedCompilation(`fallback`,[{material:r,mesh:this.focusSphere},{material:i,mesh:this.focusCorona},{material:a,mesh:this.focusDiffraction}])}failFallback(e){if(this.fallbackFailed||this.disposed)return;this.fallbackFailed=!0,this.focusSphere.setEnabled(!1),this.focusCorona.setEnabled(!1),this.focusDiffraction.setEnabled(!1);let t=this.advancedFailure??e;if(t!==e&&!(`cause`in t))try{Object.defineProperty(t,"cause",{value:e,configurable:!0})}catch{}this.options.onError?.(t)}applyFocusDatum(e){let t=this.descriptorByDatum.get(e)??Eo(e),n=new r(t.color[0],t.color[1],t.color[2]),i=ys(e.bodyR,.3,.01,10),a=ys(e.kelvin,5778,1e3,5e4),o=J(e.rot,0);this.focusSphere.scaling.setAll(i),this.focusCorona.scaling.setAll(i*t.coronaScale),this.focusDiffraction.scaling.setAll(i*t.coronaScale*is),this.focusUniforms={kelvin:a,seed:t.seed,rot:o,activity:t.surfaceActivity,time:this.focusUniforms.time},Cs(e,this.focusUniforms.time,this.reducedMotion?0:1.35,this.focusSphere.position),this.focusCorona.position.copyFrom(this.focusSphere.position),this.focusDiffraction.position.copyFrom(this.focusSphere.position);let s=Mn(a),c=Ut(a*1.16),l=new r(s[0],s[1],s[2]),u=new r(c[0]+(1-c[0])*.42,c[1]+(1-c[1])*.42,c[2]+(1-c[2])*.42);for(let e of this.focusedMaterials)e instanceof m&&(e.setColor3(`uColor`,n),e.setColor3(`uLimbColor`,l),e.setColor3(`uCoreColor`,u),e.setColor3(`uChromosphere`,ts),e.setFloat(`uKelvin`,a),e.setFloat(`uSeed`,t.seed),e.setFloat(`uRot`,o),e.setFloat(`uActivity`,t.surfaceActivity),e.setFloat(`uCoronaLayers`,this.qualityConfig.coronaLayers),e.setFloat(`uStreamerCount`,this.uplift.coronaStreamerCount),e.setFloat(`uSpotCount`,this.uplift.starSpotCount),e.setFloat(`uSupergranulation`,ns),e.setFloat(`uSpotStrength`,rs+.5800000000000001*ys(t.surfaceActivity,0,0,1)),e.setFloat(`uProminenceCount`,this.uplift.starProminenceCount),e.setFloat(`uSpikeCount`,this.uplift.diffractionSpikeCount))}applyVisibility(){if(this.fallbackFailed)return;let e=this.focusedReady&&this.focusedDatum!==null&&this.presentation!==null&&this.presentation.lodIntent!==`point`&&this.presentation.lodIntent!==`hidden`;this.focusSphere.setEnabled(e&&(this.presentation?.surfaceAlpha??0)>0),this.focusCorona.setEnabled(e&&(this.presentation?.coronaAlpha??0)>0),this.focusDiffraction.setEnabled(e&&(this.presentation?.coronaAlpha??0)>0)}applyPresentationDimensions(){let e=this.presentation;for(let t=0;t<this.baseDimensions.length;t+=1){let n=w(this.stars[t].s),r=this.baseDimensions[t];if(!e)this.coreDimensionsBuffer[t]=r,this.haloDimensionsBuffer[t]=r;else if(e.lodIntent===`hidden`)this.coreDimensionsBuffer[t]=0,this.haloDimensionsBuffer[t]=0;else if(this.focusedKey){let i=n===this.focusedKey;this.coreDimensionsBuffer[t]=r*(i?e.coreAlpha*e.focusedOpacity:e.effectiveNonFocusedOpacity),this.haloDimensionsBuffer[t]=r*(i?e.haloAlpha*e.focusedOpacity:e.effectiveNonFocusedOpacity)}else this.coreDimensionsBuffer[t]=r*e.coreAlpha,this.haloDimensionsBuffer[t]=r*e.haloAlpha}this.geometry.updateVerticesData(`aCoreDim`,this.coreDimensionsBuffer,!1),this.geometry.updateVerticesData(`aHaloDim`,this.haloDimensionsBuffer,!1)}applyFocusedPresentationUniforms(){if(!this.presentation)return;let e=this.focusSphere.material,t=this.focusCorona.material;e&&(e.disableDepthWrite=this.presentation.surfaceAlpha<.999),e instanceof m?e.setFloat(`uSurfaceAlpha`,this.presentation.surfaceAlpha):e&&(e.alpha=this.presentation.surfaceAlpha),t instanceof m&&(t.disableDepthWrite=!0,t.setFloat(`uCoronaAlpha`,this.presentation.coronaAlpha),t.setFloat(`uCoronaIntensity`,this.presentation.coronaIntensity));let n=this.focusDiffraction.material;n instanceof m&&n.setFloat(`uDiffractionAlpha`,this.presentation.coronaAlpha*as)}startFocusedCompilation(e,t){let n=++this.compileGeneration;this.focusedReady=!1;let r=()=>this.completeFocusedCompilation(e,n),i=t=>this.rejectFocusedCompilation(e,n,Ss(t));for(let{material:e}of t)e instanceof m&&(e.onError=(e,t)=>i(Error(t)));try{this.options.compile?this.options.compile(e,t,r,i):Promise.all(t.map(({material:e,mesh:t})=>e.forceCompilationAsync(t))).then(r,i)}catch(e){i(e)}}completeFocusedCompilation(e,t){this.isCurrentCompilation(e,t)&&(this.compileGeneration+=1,this.focusedReady=!0,this.fallbackActive=e===`fallback`,this.applyVisibility())}rejectFocusedCompilation(e,t,n){if(this.isCurrentCompilation(e,t)){if(this.compileGeneration+=1,this.focusedReady=!1,e===`fallback`){this.failFallback(n);return}this.fallbackScheduled||(this.fallbackScheduled=!0,queueMicrotask(()=>{this.disposed||!this.fallbackScheduled||this.focusedKind!==`advanced`||(this.fallbackScheduled=!1,this.activateFallback(n))}))}}isCurrentCompilation(e,t){return!this.disposed&&this.focusedKind===e&&this.compileGeneration===t}applyInteractions(){let e=this.presentation;for(let t=0;t<this.stars.length;t+=1){let n=w(this.stars[t].s),r=t*3;this.interactionBuffer[r]=n===this.pressedKey?e?.coreScale??1:n===this.hoverKey?1+((e?.haloIntensity??1)-1)*.32:1,this.interactionBuffer[r+1]=n===this.pressedKey?e?.coreBrightness??1:1,this.interactionBuffer[r+2]=n===this.hoverKey?e?.haloIntensity??1:1}this.geometry.updateVerticesData(`aInteraction`,this.interactionBuffer,!1)}};function ps(e,t,n){let i=new m(`stellar:focus:corona:${t}`,e,{vertexSource:cs,fragmentSource:n},{attributes:[`position`,`uv`],uniforms:[`worldViewProjection`,`uColor`,`uChromosphere`,`uActivity`,`uSeed`,`uRot`,`uTime`,`uCoronaAlpha`,`uCoronaIntensity`,`uCoronaLayers`,`uStreamerCount`,`uProminenceCount`],needAlphaBlending:!0});return i.backFaceCulling=!1,i.setColor3(`uColor`,r.White()),i.setColor3(`uChromosphere`,ts),i.setFloat(`uActivity`,0),i.setFloat(`uSeed`,0),i.setFloat(`uRot`,0),i.setFloat(`uTime`,0),i.setFloat(`uCoronaAlpha`,0),i.setFloat(`uCoronaIntensity`,1),i.setFloat(`uCoronaLayers`,1),i.setFloat(`uStreamerCount`,0),i.setFloat(`uProminenceCount`,0),i}function ms(e,t){let n=new m(`stellar:focus:diffraction:material`,e,{vertexSource:cs,fragmentSource:Jo},{attributes:[`position`,`uv`],uniforms:[`worldViewProjection`,`uColor`,`uSpikeCount`,`uDiffractionAlpha`,`uRot`,`uTime`,`uActivity`],needAlphaBlending:!0});return n.backFaceCulling=!1,n.alphaMode=x.ALPHA_ADD,n.disableDepthWrite=!0,n.setColor3(`uColor`,r.White()),n.setFloat(`uSpikeCount`,t),n.setFloat(`uDiffractionAlpha`,0),n.setFloat(`uRot`,0),n.setFloat(`uTime`,0),n.setFloat(`uActivity`,0),n}function hs(e,t){let n=new m(`stellar:focus:surface:fallback`,e,{vertexSource:ls,fragmentSource:us},{attributes:[`position`,`normal`],uniforms:[`worldViewProjection`,`world`,`cameraPosition`,`uColor`,`uSurfaceAlpha`,`uHdrGain`],needAlphaBlending:!0});return n.alphaMode=x.ALPHA_COMBINE,n.disableDepthWrite=!0,n.setColor3(`uColor`,r.White()),n.setFloat(`uSurfaceAlpha`,0),n.setFloat(`uHdrGain`,t),n}function gs(e,t,n,r,i,a,o){let s=new f(`stellar:panorama:shared-geometry`,e),c=e=>{let n=new Float32Array(t.length*3);return t.forEach((t,r)=>n.set(e(t,r),r*3)),n},l=e=>Float32Array.from(t,e);return s.setVerticesData(`position`,c(({p:e})=>bs(e)),!1,3),s.setVerticesData(`aCenter`,c(({center:e})=>bs(e)),!1,3),s.setVerticesData(`aAxis`,c(({axis:e})=>xs(e)),!1,3),s.setVerticesData(`aColor`,c((e,t)=>n[t].color),!1,3),s.setVerticesData(`aPeriod`,l(({period:e})=>Math.max(0,J(e,0))),!1,1),s.setVerticesData(`aCoreSize`,l((e,t)=>n[t].panoramaCorePx),!1,1),s.setVerticesData(`aHaloSize`,l((e,t)=>n[t].panoramaHaloPx),!1,1),s.setVerticesData(`aBright`,l((e,t)=>n[t].luminance),!1,1),s.setVerticesData(`aBurst`,l((e,t)=>n[t].surfaceActivity),!1,1),s.setVerticesData(`aSeed`,l((e,t)=>n[t].seed),!1,1),s.setVerticesData(`aRot`,l(({rot:e})=>J(e,0)),!1,1),s.setVerticesData(`aBodyR`,l(({bodyR:e})=>ys(e,.3,.01,10)),!1,1),s.setVerticesData(`aDim`,r,!0,1),s.setVerticesData(`aCoreDim`,i,!0,1),s.setVerticesData(`aHaloDim`,a,!0,1),s.setVerticesData(`aInteraction`,o,!0,3),s}function _s(e){return Number.isFinite(e)?Math.max(0,e):0}function vs(e){return Math.round(e*1e4)/1e4}function J(e,t){return Number.isFinite(e)?e:t}function ys(e,t,n,r){return Math.min(r,Math.max(n,J(e,t)))}function bs(e){return[J(e[0],0),J(e[1],0),J(e[2],0)]}function xs(e){let[t,n,r]=bs(e),i=Math.hypot(t,n,r);return i>0?[t/i,n/i,r/i]:[0,1,0]}function Ss(e){return e instanceof Error?e:Error(String(e))}function Cs(e,t,n,r){let i=bs(e.p),a=bs(e.center),o=xs(e.axis),s=Math.max(0,J(e.period,0)),c=Math.abs(Math.trunc(J(e.seed,1))),l=i[0]-a[0],u=i[1]-a[1],d=i[2]-a[2],f=s===0?0:Math.PI*2/s*(t/1e3),p=Math.cos(f),m=Math.sin(f),h=o[0]*l+o[1]*u+o[2]*d,g=o[1]*d-o[2]*u,_=o[2]*l-o[0]*d,v=o[0]*u-o[1]*l,y=Math.sin(t/(6400+c*311%5200)+c)*n;r.set(a[0]+l*p+g*m+o[0]*(h*(1-p)+y),a[1]+u*p+_*m+o[1]*(h*(1-p)+y),a[2]+d*p+v*m+o[2]*(h*(1-p)+y))}function ws(e){return Number.isFinite(e)?Math.min(1,Math.max(0,e)):0}function Ts(e){return e*e*(3-2*e)}function Es(e,t,n){return n===0?e:n===1?t:e+(t-e)*n}function Ds(e){if(e.phase===`strata`)return{coreAlpha:0,haloAlpha:0,surfaceAlpha:0,coronaAlpha:0,coronaIntensity:0,systemReveal:0,focusedOpacity:0,nonFocusedTargetOpacity:0,backgroundDimMix:0,effectiveNonFocusedOpacity:0,lodIntent:`hidden`};if(e.phase===`approach`){let t=ws(e.approachProgress),n=Ts(t),r=Ts(ws((t-.5)*2));return{coreAlpha:1-n,haloAlpha:1-n,surfaceAlpha:n,coronaAlpha:n,coronaIntensity:1,systemReveal:r,focusedOpacity:1,nonFocusedTargetOpacity:P,backgroundDimMix:n,effectiveNonFocusedOpacity:Es(1,P,n),lodIntent:t===0?`point`:t===1?`surface`:`transition`}}if(e.phase===`star-focus`||e.phase===`planet-focus`){let t=e.phase===`planet-focus`;return{coreAlpha:0,haloAlpha:0,surfaceAlpha:1,coronaAlpha:t?.45:1,coronaIntensity:t?.55:1,systemReveal:1,focusedOpacity:1,nonFocusedTargetOpacity:P,backgroundDimMix:1,effectiveNonFocusedOpacity:P,lodIntent:`surface`}}return{coreAlpha:1,haloAlpha:1,surfaceAlpha:0,coronaAlpha:0,coronaIntensity:0,systemReveal:0,focusedOpacity:1,nonFocusedTargetOpacity:P,backgroundDimMix:0,effectiveNonFocusedOpacity:1,lodIntent:`point`}}function Y(e){let t=Ds(e);if(e.phase===`strata`)return Object.freeze({...t,coreScale:0,coreBrightness:0,haloIntensity:0});let n=ws(e.hoverProgress),r=ws(e.pressedProgress),i=Es(Es(1,1.08,n),.94,r);return Object.freeze({...t,coreScale:i,coreBrightness:1+(1.12-1)*r,haloIntensity:1+.25*n})}function Os(e,t,n){return Math.min(n,Math.max(t,e))}function ks(e){return typeof e==`object`&&!!e}function As(e){return ks(e)&&Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.z)}function js(e){return ks(e)&&As(e.target)&&Number.isFinite(e.radius)&&e.radius>0}function Ms(e){return ks(e)&&Number.isSafeInteger(e.token)&&e.token>=0&&typeof e.starKey==`string`&&e.starKey.length>0&&Number.isFinite(e.durationMs)&&e.durationMs>=0&&js(e.from)&&js(e.to)}function Ns(e){return Object.freeze({x:e.x,y:e.y,z:e.z})}function Ps(e){return Object.freeze({target:Ns(e.target),radius:e.radius})}function Fs(e,t,n){if(!Number.isFinite(e)||e<0||!Number.isFinite(n)||n<0)return Object.freeze({ok:!1,error:`invalid-input`});let r=t?Math.min(120,n):Os(900+Math.log1p(e)*90,900,1300);return Object.freeze(Number.isFinite(r)?{ok:!0,value:r}:{ok:!1,error:`invalid-input`})}function Is(e,t){if(!Number.isFinite(e)||e<=0||!Array.isArray(t))return Object.freeze({ok:!1,error:`invalid-input`});if(t.length===0){let t=e*6;return Object.freeze(Number.isFinite(t)?{ok:!0,value:t}:{ok:!1,error:`invalid-input`})}let n=0;for(let e of t){if(!ks(e)||!Number.isFinite(e.orbitR)||e.orbitR<0||!Number.isFinite(e.radius)||e.radius<0)return Object.freeze({ok:!1,error:`invalid-input`});let t=e.orbitR+e.radius;if(!Number.isFinite(t))return Object.freeze({ok:!1,error:`invalid-input`});n=Math.max(n,t)}return Object.freeze({ok:!0,value:n})}function Ls(e){return ks(e)&&Number.isSafeInteger(e.token)&&e.token>=0&&typeof e.starKey==`string`&&e.starKey.length>0&&js(e.start)&&As(e.targetStar)&&Number.isFinite(e.bodyR)&&e.bodyR>0&&Number.isFinite(e.systemExtent)&&e.systemExtent>=0&&Number.isFinite(e.overviewRadius)&&e.overviewRadius>0&&Number.isFinite(e.distance)&&e.distance>=0&&Number.isFinite(e.requestedMs)&&e.requestedMs>=0&&typeof e.reducedMotion==`boolean`}function Rs(e){if(!Ls(e))return Object.freeze({ok:!1,error:`invalid-input`});let t=e.bodyR*8,n=e.overviewRadius*.72,r=e.bodyR*14,i=e.systemExtent*1.35;if(![t,n,r,i].every(Number.isFinite)||t>n)return Object.freeze({ok:!1,error:`invalid-input`});let a=Os(Number.isFinite(e.destinationRadius)&&e.destinationRadius>0?e.destinationRadius:Math.max(r,i),t,n);if(!Number.isFinite(a)||a<=0)return Object.freeze({ok:!1,error:`invalid-input`});let o=Fs(e.distance,e.reducedMotion,e.requestedMs);if(!o.ok)return Object.freeze({ok:!1,error:o.error});let s=Object.freeze({token:e.token,starKey:e.starKey,from:Ps(e.start),to:Ps({target:e.targetStar,radius:a}),durationMs:o.value});return Object.freeze({ok:!0,flight:s})}function zs(e){return e*e*(3-2*e)}function Bs(e,t){if(!Number.isFinite(t)||!Ms(e))return Object.freeze({ok:!1,error:`invalid-frame`});let n=e.durationMs===0?1:Os(t/e.durationMs,0,1),r=zs(n),i=Ns(n===0?e.from.target:n===1?e.to.target:{x:e.from.target.x+(e.to.target.x-e.from.target.x)*r,y:e.from.target.y+(e.to.target.y-e.from.target.y)*r,z:e.from.target.z+(e.to.target.z-e.from.target.z)*r}),a=n===0?e.from.radius:n===1?e.to.radius:Math.exp(Math.log(e.from.radius)+(Math.log(e.to.radius)-Math.log(e.from.radius))*r);return!As(i)||!Number.isFinite(a)?Object.freeze({ok:!1,error:`invalid-frame`}):Object.freeze({ok:!0,frame:Object.freeze({token:e.token,target:i,radius:a,progress:n,complete:n===1})})}var Vs=class{#e=0;#t=null;#n=null;#r=null;get selectedStarKey(){return this.#r}start(e){if(e.starKey===this.#r)return Object.freeze({kind:`noop`,reason:`already-focused`});let t=this.#e+1,n=Rs({...e,token:t});return n.ok?(this.#e=t,this.#t=t,this.#r=e.starKey,Object.freeze({kind:`started`,flight:n.flight})):Object.freeze({kind:`error`,error:n.error})}cancel(e){this.#n=this.#t,this.#e+=1,this.#t=null,e!==`user`&&(this.#r=null)}isActive(e){return e===this.#t}frame(e,t){return Ms(e)?e.token===this.#t?Bs(e,t):e.token===this.#n?Object.freeze({ok:!1,error:`cancelled`}):Object.freeze({ok:!1,error:`stale-token`}):Object.freeze({ok:!1,error:`invalid-frame`})}};function Hs(e){return e===`planet-focus`?`star-focus`:e===`star-focus`?`panorama`:null}function Us(e,t,n){return Number.isFinite(e)&&Number.isFinite(t)&&Number.isFinite(n)&&e>0&&t>n}var Ws=2.1;Sn(`high`).bloomThreshold;var Gs=1,Ks=900,qs=new Set;function Js(e,t){let n=ni(t);e.imageProcessingEnabled=!0;let r=e.imageProcessing;if(!r)return;r.vignetteEnabled=!0,r.vignetteWeight=n.vignetteWeight,r.vignetteColor=new s(n.vignetteColor[0],n.vignetteColor[1],n.vignetteColor[2],0),r.vignetteBlendMode=se.VIGNETTEMODE_MULTIPLY,r.colorCurvesEnabled=!0;let i=new l;i.shadowsHue=220,i.shadowsDensity=n.shadowsCoolness,i.highlightsHue=34,i.highlightsDensity=n.highlightsWarmth,i.globalSaturation=n.globalSaturation,r.colorCurves=i,e.grainEnabled=!0,e.grain.intensity=n.grainIntensity,e.grain.animated=!0,e.chromaticAberrationEnabled=n.chromaticAberration>0,n.chromaticAberration>0&&(e.chromaticAberration.aberrationAmount=n.chromaticAberration)}function Ys(e){e.toneMappingEnabled=!0,e.toneMappingType=se.TONEMAPPING_KHR_PBR_NEUTRAL,e.ditheringEnabled=!0,e.exposure=.92}function Xs(e,t){return t?e.filter(e=>e.star===t):[]}function Zs(e,t){return e&&t}function Qs(e,t,n,r){if(!Number.isFinite(e)||!Number.isFinite(t))return n;let i=Math.max(0,t-e),a=(Number.isFinite(r)?Math.max(0,r):0)+Math.max(1,n/8);return Math.min(n,Math.min(i,a))}function $s(e,t){return e===null||!Number.isFinite(e)||!Number.isFinite(t)||t<e?0:Math.min(50,Math.max(0,t-e))}function ec(){return typeof matchMedia==`function`&&matchMedia(`(pointer: coarse)`).matches}var tc=1100,nc=.1,rc=1.2,ic=class{runtime;callbacks;canvas;labelCanvas;engine;scene;pipeline;camera;universeRoot;universe;stars;starLayer;candidateBuffer;quality;pointerPresentation=new Ho;cameraFlightController=new Vs;planetFocusController;caveRoot=null;caveGuideLight=null;caveMaxDepth=1;nebula=null;starfield=null;dust=null;rings=null;overlay=null;labels=null;probeLayer=null;inspectedProbeId=null;arrivedProbeId=null;probeInspectionPose={...de};probeScanTimer=null;probeApproach=null;probeCameraMix=0;labelStrategy;sceneRadius=60;planets;visualByQuestion=new Map;visualByMeshId=new Map;materializedOwnerKey=null;specimenByMeshId=new Map;probes;strataTransition;selected=null;selectedVisual=null;focusedStar=null;mode=`all`;wormIdx=0;interactionByDatum=new Map;hoverKey=null;pressedKey=null;hoverProgress=0;pressedProgress=0;activeFlight=null;lastFlightDurationMs=0;presentation=Y({phase:`panorama`});lastLayerPresentation=null;lastLayerHoverKey=null;lastLayerPressedKey=null;lastPresentationInput=null;elapsedMs=0;lastSceneUpdateAt=null;lastStrataMoveAt=null;overviewTarget=y.Zero();overviewRadius=30;entryCameraSnapshot=null;destroyed=!1;universeVisible=!0;planetMotionFrozenAtMs=null;surfaceStage=mt;surfaceWorld=null;surfaceSky=null;surfaceGround=null;surfaceSun=null;surfaceAmbient=null;surfaceRoot=null;surfacePose=null;surfaceRadius=1;surfaceDisplacement=0;surfaceField=null;surfaceDescent=null;backdropGainValue=1;workspaceOpen=!1;reducedMotion;planetExitPending=!1;planetDragPointerId=null;planetDragX=0;planetDragY=0;planetDragMovement=0;planetDragStartedOnTarget=!1;diagnosticClickEvents=0;diagnosticLastPick=`none`;diagnosticCameraSamples=[];diagnosticCameraSequence=0;diagnosticApproachProgressOverride=null;diagnosticPlanetVisualConstructions=0;diagnosticPlanetShaderCompileRequests=0;diagnosticPlanetUpdatesLastFrame=0;labelPointScratch=new y;starPositionScratch=new y;flightTargetScratch=new y;planetStarPositionScratch=new y;planetPositionScratch=new y;candidateWorldScratch=new y;projectionIdentity=b.Identity();projectionViewport=new i(0,0,1,1);projectedPositionScratch=new y;pointerProjectionScratch={x:0,y:0,z:0};candidateProjectionScratch={x:0,y:0,depth:0,visible:!1};constructor(e,t,n,r,i={}){this.canvas=e,this.labelCanvas=t,this.callbacks=i,this.universe=n.universe,this.stars=Yt(n.universe),this.candidateBuffer=new Mo(this.stars),this.reducedMotion=r,this.planets=lc(n,this.stars),this.probes=new Set(n.probesById.keys());let a=new o(e,!0,{preserveDrawingBuffer:!1,stencil:!1,disableWebGL2Support:!1});if(a.webGLVersion<2)throw a.dispose(),cc(e),new vn;this.quality=_n(r),a.setHardwareScalingLevel(1/wn(window.devicePixelRatio,ec(),this.quality)),this.engine=a;let l=null,d=null,f=!1,p=!1;try{l=new c(a),this.scene=l,l.clearColor=new s(0,0,0,1),this.universeRoot=new le(`universe-root`,l);let o=gr(mr,hr),m=new u(`mindverse-camera`,o.alpha,o.beta,30,y.Zero(),l);this.camera=m,m.fov=Qn,m.minZ=nc,m.lowerRadiusLimit=rc,m.upperRadiusLimit=1e4;let h=ai(r);m.inertia=h.inertia,m.panningInertia=h.panningInertia,m.angularSensibilityX=h.angularSensibility,m.angularSensibilityY=h.angularSensibility,m.wheelDeltaPercentage=h.wheelDeltaPercentage,m.pinchDeltaPercentage=h.wheelDeltaPercentage,m.attachControl(e,!0),l.activeCamera=m,this.planetFocusController=new ro({readPose:()=>({target:{x:m.target.x,y:m.target.y,z:m.target.z},radius:m.radius}),writePose:e=>{m.setTarget(new y(e.target.x,e.target.y,e.target.z)),m.radius=e.radius},stopInertia:()=>{m.inertialAlphaOffset=0,m.inertialBetaOffset=0,m.inertialRadiusOffset=0,m.inertialPanningX=0,m.inertialPanningY=0}},()=>{this.planetExitPending=!0},{reducedMotion:r}),this.labelStrategy=new Ii(n.universe.clusters??[],this.stars),this.starLayer=new fs(l,this.stars,this.quality,r,{parent:this.universeRoot,onError:i.onRenderError,hdrGain:4}),this.applyModeDimensions(),this.starLayer.setPresentation(this.presentation,null,null),this.lastLayerPresentation=this.presentation,this.strataTransition=new Co({capturePose:()=>this.captureStrataEntryPose(),applyPose:e=>this.applyStrataPose(e),setUniverseVisible:e=>this.setUniverseVisible(e),animate:(e,t,n,r)=>this.animateStrata(e,t,n,r)},i),this.createScene(n),p=!0,this.installPointerListeners(),f=!0,d=new yn({engine:a,scene:l,releaseContext:()=>cc(e),canvas:{addEventListener:(t,n)=>e.addEventListener(t,n),removeEventListener:(t,n)=>e.removeEventListener(t,n)},isPageHidden:()=>document.hidden},{onReady:i.onRenderReady,onError:i.onRenderError,isAnimating:()=>this.hasActiveAnimation()}),this.runtime=d,this.labels=new zi(t),this.resizeLabels(),qs.add(this)}catch(t){throw p&&this.removePointerListeners(),d?d.destroy():f||(l&&l.dispose(),a.dispose(),cc(e)),t}}start(){this.runtime.start()}stop(){this.runtime.stop()}suspend(){this.cancelFlight(`suspend`),this.clearPointerFeedback(),this.runtime.suspend()}resume(){this.runtime.resume()}resize(){this.runtime.resize(),this.resizeLabels()}destroy(){this.destroyed||(this.diagnosticApproachProgressOverride=null,this.destroyed=!0,qs.delete(this),this.selected=null,this.selectedVisual=null,this.cancelFlight(`destroy`),this.clearPointerFeedback(),this.strataTransition.destroy(),this.removePointerListeners(),this.releaseMaterializedPlanets(),this.nebula?.dispose(),this.nebula=null,this.starfield?.dispose(),this.starfield=null,this.dust?.dispose(),this.dust=null,this.disposeSurfaceWorld(),this.rings?.dispose(),this.rings=null,this.overlay?.dispose(),this.overlay=null,this.labels?.dispose(),this.labels=null,this.cancelProbeScan(),this.probeLayer?.dispose(),this.probeLayer=null,this.starLayer.dispose(),this.runtime.destroy())}setMode(e,t=0){this.destroyed||(this.mode!==e||this.wormIdx!==t)&&(this.mode=e,this.wormIdx=t,this.applyModeDimensions(),this.focusedStar&&!this.isInteractive(this.focusedStar)&&this.resetView(),this.hoverKey&&!this.isKeyInteractive(this.hoverKey)&&this.clearPointerFeedback(),this.syncOrbitPresentation())}focusStar(e){if(this.destroyed||!this.universeVisible||this.strataTransition.phase!==null)return null;let t=rn(this.stars,e,this.mode,this.universe,this.wormIdx);return t?this.focusedStar===t&&!this.selected?t.s:this.applyStarFocus(t)?(this.callbacks.onPick?.(t.s),t.s):null:null}resetView(){this.destroyed||(this.cancelFlight(`reset`),this.clearPlanet(),this.focusedStar=null,this.planetMotionFrozenAtMs=null,this.releaseMaterializedPlanets(),this.starLayer.setFocus(null,null),this.applyLayerFocus(null),this.camera.setTarget(this.overviewTarget),this.camera.radius=this.overviewRadius,this.syncOrbitPresentation())}clearPlanet(){this.exitPlanetSurface(),!(this.destroyed||!this.selected)&&(this.planetFocusController.suspend(),this.selectedVisual?.visual.setSelected(!1),this.selectedVisual?.visual.setLod(this.quality===`low`?`low`:`medium`),this.selected=null,this.selectedVisual=null,this.callbacks.onAnchor?.(0,0,!1),this.callbacks.onPickPlanet?.(null),this.focusedStar&&(this.camera.setTarget(this.currentStarPosition(this.focusedStar)),this.camera.radius=this.systemFraming(this.focusedStar).radius),this.syncOrbitPresentation())}selectQuestionPlanet(e,t){if(this.destroyed)return null;let n=this.planets.find(n=>`id`in n.star.s&&n.star.s.id===e&&n.question.id===t)??null;if(!n)return null;if(this.cancelFlight(`planet`),this.selectedVisual?.visual.setSelected(!1),this.materializeStarSystem(n.star),this.selected=n,this.selectedVisual=this.visualByQuestion.get(n.question.id)??null,this.focusedStar=n.star,this.starLayer.setFocus(w(n.star.s),n.star),this.selectedVisual?.visual.setSelected(!0),this.selectedVisual){let e=this.planetFraming(n);this.planetFocusController.enter(this.selectedVisual.visual,e.distance,{low:e.low,high:e.high})}return this.syncOrbitPresentation(),this.callbacks.onPickPlanet?.(n),n}restoreQuestionPlanet(e,t){return this.selectQuestionPlanet(e,t)}setWorkspaceOpen(e){this.destroyed||(this.workspaceOpen=e,this.canvas.style.pointerEvents=e?`none`:``,e?this.camera.detachControl():this.universeVisible&&this.camera.attachControl(this.canvas,!0),this.applyCameraViewport(),e&&this.selected&&!M(this.surfaceStage)&&(this.camera.radius=rr),e&&this.clearPointerFeedback())}applyCameraViewport(){let e=this.workspaceOpen&&!M(this.surfaceStage);this.camera.viewport=e&&this.engine.getRenderWidth()>760?new i(.18,0,.82,1):e?new i(0,.16,1,.84):new i(0,0,1,1)}orbitWorkspace(e,t){if(!(this.destroyed||!this.selected)){if(M(this.surfaceStage)){this.walkPlanetSurface({forward:0,strafe:0,turn:e*.004,tilt:-t*.004});return}this.planetFocusController.drag(e,t)||this.selectedVisual?.visual.rotate(-e*.005,-t*.005)}}approachProbe(e,t){if(!this.destroyed){this.cancelProbeScan(),this.probeApproach=null,this.arrivedProbeId=null;try{if(!this.probes.has(e))throw X(`未知探测器：${e}`);if(!this.probeLayer?.hasProbe(e))throw X(`探测器未在轨：${e}`);let n=this.probeOwner(e);if(!n)throw X(`探测器没有归属恒星：${e}`);if(this.clearPlanet(),this.focusedStar!==n&&!this.applyStarFocus(n))throw X(`无法聚焦探测器所属恒星：${e}`);this.inspectedProbeId=e,this.probeInspectionPose={...de},this.probeLayer.inspect(e),this.probeLayer.setScanning(!1),this.reducedMotion?(this.probeCameraMix=1,this.arrivedProbeId=e,this.callbacks.onProbeArrived?.({probeId:e,token:t})):(this.probeCameraMix=0,this.probeApproach=Object.freeze({probeId:e,token:t,startedAt:performance.now()}),this.activeFlight=null)}catch(n){this.exitProbeInspection(),this.callbacks.onProbeError?.({probeId:e,token:t,cause:n instanceof Error?n:Error(String(n))})}}}probeOwner(e){let t=this.focusedStar&&`id`in this.focusedStar.s?this.focusedStar.s.id:null,n=null;for(let r of this.stars){let i=r.s;if(i.probeIds?.includes(e)){if(i.id===t)return r;n??=r}}return n}startProbeScan(e,t){if(this.destroyed)return;if(this.arrivedProbeId!==e||this.inspectedProbeId!==e){this.callbacks.onProbeError?.({probeId:e,token:t,cause:X(`探测器检查尚未就绪：${e}`)});return}this.cancelProbeScan(),this.probeCameraMix=1,this.probeLayer?.setScanning(!0);let n=()=>{this.probeScanTimer=null,this.probeLayer?.setScanning(!1),this.callbacks.onProbeScanComplete?.({probeId:e,token:t})};this.reducedMotion?n():this.probeScanTimer=setTimeout(n,Ks)}setProbeInspectionPose(e){this.destroyed||(this.probeInspectionPose=ue(e))}focusProbePart(e){this.destroyed||this.probeLayer?.setPartHighlight(e)}exitProbeInspection(){if(this.destroyed)return;let e=this.probeApproach!==null||this.inspectedProbeId!==null||this.arrivedProbeId!==null;this.cancelProbeScan(),this.probeApproach=null,this.probeLayer?.setScanning(!1),this.probeLayer?.setPartHighlight(null),this.probeLayer?.inspect(null),this.inspectedProbeId=null,this.arrivedProbeId=null,this.probeInspectionPose={...de},this.probeCameraMix=0,e&&this.focusedStar&&this.universeVisible&&this.camera.setTarget(this.currentStarPosition(this.focusedStar))}applyProbeInspectionCamera(){if(!this.inspectedProbeId||!this.probeLayer)return;let e=this.probeApproach;if(e&&(this.probeCameraMix=Ln(performance.now()-e.startedAt,520),this.probeCameraMix>=1&&(this.probeApproach=null,this.arrivedProbeId=e.probeId,this.callbacks.onProbeArrived?.({probeId:e.probeId,token:e.token}))),this.probeCameraMix<=0||!this.probeLayer.inspectionTarget(this.probeTargetScratch))return;let t=this.probeTargetScratch,{position:n,lookAt:r}=In([t.x,t.y,t.z],this.probeInspectionPose),i=new y(n[0],n[1],n[2]),a=this.camera.target.clone(),o=y.Lerp(this.camera.globalPosition,i,this.probeCameraMix),s=y.Lerp(a,new y(r[0],r[1],r[2]),this.probeCameraMix);!Z(o)||!Z(s)||(this.camera.setTarget(s),this.camera.setPosition(o))}probeTargetScratch=new y;cancelProbeScan(){this.probeScanTimer!==null&&(clearTimeout(this.probeScanTimer),this.probeScanTimer=null)}setReducedMotion(e){if(this.destroyed||this.reducedMotion===e)return;this.reducedMotion=e,this.planetFocusController.setReducedMotion(e),this.starLayer.setReducedMotion(e),this.starfield?.setReducedMotion(e);let t=ai(e);this.camera.inertia=t.inertia,this.camera.panningInertia=t.panningInertia;let n=this.activeFlight;if(e&&n&&this.focusedStar){let e=this.currentStarPosition(this.focusedStar),t=n.flight.to.radius;this.cancelFlight(`user`),this.camera.setTarget(e),this.camera.radius=t,this.syncStarLayerPresentation(),this.syncOrbitPresentation()}for(let e of this.visualByQuestion.values())this.updatePlanetPosition(e,this.elapsedMs);this.selectedVisual&&this.universeVisible?this.camera.target.copyFrom(this.selectedVisual.visual.activeMesh.position):this.focusedStar&&!this.activeFlight&&this.universeVisible&&this.camera.target.copyFrom(this.currentStarPosition(this.focusedStar))}skipGenesis(){this.destroyed||this.callbacks.onGenesisEnd?.()}enterStrata(e){if(this.destroyed||this.strataTransition.token===e.token)return;if(!this.selected||this.selected.question.id!==e.questionId){this.callbacks.onStrataError?.({token:e.token,questionId:e.questionId,scope:`transition`,cause:X(`请先选择对应的问题行星，再打开答案地层。`)});return}this.surfaceStage=j(this.surfaceStage,{kind:`dig`,token:this.surfaceStage.token}),this.applySurfaceVisibility(),this.cancelFlight(`strata`),this.planetFocusController.suspend(!1),this.clearPointerFeedback(),this.strataTransition.enter(e),this.lastStrataMoveAt=null;let t=this.strataTransition.layout;t&&this.createCave(t)}moveStrata(e){let t=performance.now();this.strataTransition.move(e,bo(this.lastStrataMoveAt,t)),this.lastStrataMoveAt=t}focusAnswerSpecimen(e){this.strataTransition.focusAnswer(e)}closeAnswerSpecimen(){this.strataTransition.closeAnswer()}exitStrata(e){this.strataTransition.exit(e)}createScene(e){Ys(this.scene.imageProcessingConfiguration);let t=Sn(this.quality),n=new ie(`mindverse-pipeline`,!0,this.scene,[this.camera]);this.pipeline=n,n.samples=t.multisampling,n.fxaaEnabled=t.fxaa,n.bloomEnabled=!0,n.bloomThreshold=t.bloomThreshold,n.bloomWeight=t.bloomWeight,n.bloomScale=t.bloomScale,n.bloomKernel=Cn(`panorama`,this.quality).kernel,Js(n,this.quality),this.configureOverview(e.universe),this.starfield=new Br(this.scene,{radius:this.sceneRadius,quality:this.quality,reducedMotion:this.reducedMotion,parent:this.universeRoot}),this.nebula=new Xn(this.scene,{radius:this.sceneRadius,palette:fi(e.universe.clusters??[]),environment:t,parent:this.universeRoot}),this.dust=new Er(this.scene,e.universe,{environment:t,reducedMotion:this.reducedMotion,parent:this.universeRoot}),this.probeLayer=new la(this.scene,e,this.stars,{reducedMotion:this.reducedMotion,parent:this.universeRoot,quality:this.quality}),this.rings=new Si(this.scene,e.universe,this.universeRoot),this.overlay=new Mi(this.scene,e.universe,{quality:this.quality,reducedMotion:this.reducedMotion,parent:this.universeRoot}),this.applyModeDimensions(),this.syncOrbitPresentation(),this.scene.onBeforeRenderObservable.add(()=>this.updateScene())}pickStrataAt(e,t){this.universeVisible||this.pickAtClient(e,t)}pickAtClient(e,t){if(this.destroyed)return;let n=this.canvas.getBoundingClientRect(),r=(e-n.left)*this.engine.getRenderWidth()/Math.max(1,n.width),i=(t-n.top)*this.engine.getRenderHeight()/Math.max(1,n.height),a=this.scene.pick(r,i)?.pickedMesh;if(!a)return;let o=this.specimenByMeshId.get(a.uniqueId);if(o){this.strataTransition.focusAnswer(o.answerId);return}let s=this.visualByMeshId.get(a.uniqueId);if(s){let e=`id`in s.datum.star.s?s.datum.star.s.id:``;e&&this.selectQuestionPlanet(e,s.datum.question.id);return}}configureOverview(e){this.sceneRadius=cr(e.stars??[],e.clusters??[]),this.overviewTarget=y.Zero();let t=lr(this.sceneRadius);this.overviewRadius=Q(t)?t:97.2,this.camera.setTarget(this.overviewTarget),this.camera.radius=this.overviewRadius}createPlanet(e){if(!(`id`in e.star.s))return;let t=ja({questionId:e.question.id,starId:e.star.s.id,answerCount:e.answerCount,timeSpan:e.material.timeSpan,freshness:e.material.freshness,created:e.created,collected:e.collected,normalizedStarEnergy:e.star.bright*1.8,normalizedOrbitDistance:e.orbitR/Ws}),n=this.createQuestionOrbit(e),r,i=new Xa({scene:this.scene,descriptor:t,parent:this.universeRoot,quality:this.quality,initialLod:this.quality===`low`?`low`:`medium`,onMeshesChanged:()=>this.refreshPlanetMeshIndex(r),compileSurface:async(e,t,n)=>{if(this.diagnosticPlanetShaderCompileRequests+=1,t===void 0)throw Error(`E2E injected ${t} planet surface failure`);await e.forceCompilationAsync(n)},compileAtmosphere:async(e,t)=>{this.diagnosticPlanetShaderCompileRequests+=1,await e.forceCompilationAsync(t)}});this.diagnosticPlanetVisualConstructions+=1,r=Object.freeze({datum:e,descriptor:t,visual:i,orbit:n}),this.visualByQuestion.set(e.question.id,r),this.refreshPlanetMeshIndex(r),this.updatePlanetPosition(r,0),i.ensureLod(this.quality===`low`?`low`:`medium`),i.ensureAtmosphere()}materializeStarSystem(e){let t=oc(e);if(this.materializedOwnerKey!==t){this.releaseMaterializedPlanets(),this.materializedOwnerKey=t;try{for(let t of Xs(this.planets,e))this.createPlanet(t)}catch(e){throw this.releaseMaterializedPlanets(),e}}}releaseMaterializedPlanets(){for(let e of this.visualByQuestion.values())e.visual.dispose(),e.orbit.dispose(!1,!0);this.visualByQuestion.clear(),this.visualByMeshId.clear(),this.materializedOwnerKey=null}hasActiveAnimation(){let e=[this.camera.inertialAlphaOffset,this.camera.inertialBetaOffset,this.camera.inertialRadiusOffset,this.camera.inertialPanningX,this.camera.inertialPanningY].some(e=>Math.abs(e)>1e-5);return!!(this.activeFlight||this.selected||this.strataTransition.phase!==null||this.planetExitPending||this.hoverKey||this.pressedKey||e)}createQuestionOrbit(e){let t=[];for(let n=0;n<=96;n+=1){let r=Math.PI*2*n/96,i=Math.cos(r),a=Math.sin(r);t.push(new y(e.star.p[0]+(e.u[0]*i+e.v[0]*a)*e.orbitR,e.star.p[1]+(e.u[1]*i+e.v[1]*a)*e.orbitR,e.star.p[2]+(e.u[2]*i+e.v[2]*a)*e.orbitR))}let n=oe(`question-orbit:${e.question.id}`,{points:t,useVertexAlpha:!0},this.scene);return n.parent=this.universeRoot,n.color=new r(e.star.color[0],e.star.color[1],e.star.color[2]),n.alpha=0,n.isPickable=!1,n}updateBackground(e){if(!this.universeVisible){this.nebula?.setDim(0),this.dust?.setDim(0),this.starfield?.setPhaseOpacity(0);return}let t=this.sceneRadius,{near:n,far:r}=ri(t,this.camera.globalPosition.length(),F(this.quality)),i=.22+.78*ac(this.camera.radius,t*.35,t*1.1),a=we(this.diagnosticPhase()===`universe`?this.selected?`planet-focus`:this.focusedStar?`star-focus`:`panorama`:`strata`);this.backdropGainValue=a;let o=this.mode===`all`?1:.48;this.nebula?.setDim(o*i*a),this.nebula?.update(this.motionTime()*.001),this.dust?.setDim(i*a),this.dust?.setUniform(`uT`,this.motionTime()),this.dust?.setUniform(`uNear`,n),this.dust?.setUniform(`uFar`,r);let s=e*.5/Math.tan(this.camera.fov*.5);this.dust?.setUniform(`uProjScale`,s),this.starfield?.setPhaseOpacity(i*a),this.starfield?.update(this.motionTime(),s);for(let e of[this.rings,this.overlay])e?.setUniform(`uNear`,n),e?.setUniform(`uFar`,r);this.rings?.setUniform(`uGain`,vi*a*Ft(this.camera.radius,this.overviewRadius)),this.overlay?.setUniform(`uT`,this.motionTime()),this.overlay?.setUniform(`uProjScale`,s),this.drawLabels(t,n,r),this.updatePlanetSurface(),this.probeLayer?.update({elapsedMs:this.motionTime(),projectionScale:s,focusedStarId:this.focusedStar&&`id`in this.focusedStar.s?this.focusedStar.s.id:null,starPositions:this.probeStarPositions(),starOpacities:this.probeStarOpacities()})}probeStarPositions(){let e=new Map;for(let t of this.stars)!(`id`in t.s)||!t.s.probeIds?.length||e.set(t.s.id,this.currentStarPosition(t).clone());return e}probeStarOpacities(){let e=new Map,t=this.focusedStar&&`id`in this.focusedStar.s?this.focusedStar.s.id:null;for(let n of this.stars){if(!(`id`in n.s)||!n.s.probeIds?.length)continue;let r=tn(n.s,this.mode,this.universe,this.wormIdx),i=t===null||t===n.s.id?1:P;e.set(n.s.id,r*i)}return e}applyLayerFocus(e){this.rings?.setFocus(e&&`g`in e.s?e.s.g:null),this.overlay?.setFocus(e?.s??null),this.labelStrategy.setFocus(e)}drawLabels(e,t,n){if(!this.labels)return;if(this.backdropGainValue<=0){this.labels.draw({clusters:[],stars:[],near:t,far:n,tooClose:e*.2,project:()=>({x:0,y:0,depth:-1,distance:0}),projectStar:()=>({x:0,y:0,depth:-1,distance:1,radiusPx:0})});return}let r=this.canvas.getBoundingClientRect(),i=Math.max(1,this.engine.getRenderHeight()),a=i*.5/Math.tan(this.camera.fov*.5),o=this.camera.globalPosition;this.labels.draw({clusters:this.labelStrategy.clusterLabels,stars:this.labelStrategy.starLabels,near:t,far:n,tooClose:e*.2,project:e=>{let t=this.labelPointScratch.set(e[0],e[1],e[2]),n=this.projectToCss(t);return{x:n.x,y:n.y,depth:n.z,distance:y.Distance(t,o)}},projectStar:e=>{let t=Jt(e,this.motionTime(),this.reducedMotion?0:1.35,this.labelPointScratch),n=this.projectToCss(t),s=Math.max(1,y.Distance(t,o));return{x:n.x,y:n.y,depth:n.z,distance:s,radiusPx:e.bodyR*a/s*r.height/i}}})}framingPhase(){return this.selected?`planet-focus`:this.focusedStar?`star-focus`:`panorama`}planetFraming(e){let t=dr(e.orbitR),n=fr(`planet-focus`,{sceneRadius:this.sceneRadius}),r=this.focusedStar?this.systemFramingRadius(this.focusedStar):t*2;return Object.freeze({distance:t,low:n.low,high:Math.max(t,r)})}systemFramingRadius(e){try{return this.systemFraming(e).radius}catch{return this.overviewRadius*.72}}scenePhase(){return this.universeVisible?this.selected?`planet-focus`:this.focusedStar?`star-focus`:`panorama`:`strata`}orbitPresentationState(){if(!this.universeVisible)return{phase:`strata`};let e=this.focusedStar?oc(this.focusedStar):void 0;return this.selected?{phase:`planet-focus`,focusedOwnerKey:e,selectedQuestionId:this.selected.question.id}:e&&this.activeFlight?{phase:`approach`,focusedOwnerKey:e,systemReveal:this.presentation.systemReveal}:e?{phase:`star-focus`,focusedOwnerKey:e}:{phase:`panorama`}}syncOrbitPresentation(){let e=this.orbitPresentationState(),t=Cn(this.scenePhase(),this.quality);this.pipeline.bloomEnabled=t.enabled,this.pipeline.bloomKernel=t.kernel;for(let t of this.visualByQuestion.values()){let n=oc(t.datum.star);Lo(t.orbit,Ro({...e,ownerKey:n,questionId:t.datum.question.id}));let r=zo({...e,ownerKey:n});t.visual.setReveal(r.reveal),t.visual.setVisible(r.visible);for(let e of t.visual.meshes)e.isPickable=r.pickable&&!e.name.includes(`:atmosphere`)}}updateScene(){if(this.destroyed)return;let e=performance.now(),t=$s(this.lastSceneUpdateAt,e);Number.isFinite(e)&&(this.lastSceneUpdateAt=e),this.elapsedMs+=this.reducedMotion||this.diagnosticApproachProgressOverride!=null?0:t,this.updateCameraFlight(),this.planetFocusController.update(t),this.planetExitPending&&this.planetFocusController.state===`idle`&&(this.planetExitPending=!1,this.finishPlanetExit()),this.updateStellarPresentation(t);let n=Math.max(1,this.engine.getRenderHeight()),r=wn(window.devicePixelRatio,ec(),this.quality);this.updateBackground(n),this.starLayer.update({elapsedMs:this.elapsedMs,renderHeight:n,devicePixelRatio:r,projectionScale:n*.5/Math.tan(this.camera.fov*.5)}),this.diagnosticPlanetUpdatesLastFrame=0;for(let e of this.visualByQuestion.values()){if(!Zs(this.universeVisible,e.visual.activeMesh.isEnabled()))continue;this.updatePlanetPosition(e,this.elapsedMs);let t=e.visual.activeMesh,n=y.Distance(this.camera.globalPosition,t.getAbsolutePosition());this.diagnosticPlanetUpdatesLastFrame+=1,e.visual.update({elapsedMs:this.motionTime(),cameraPosition:this.camera.globalPosition,starPosition:this.currentStarPosition(e.datum.star),projectedRadiusPx:La(e.visual.radius,n,this.camera.fov,this.engine.getRenderWidth(),this.engine.getRenderHeight())/2,focused:e===this.selectedVisual})}M(this.surfaceStage)||(this.selected&&this.selectedVisual&&this.universeVisible?(this.planetFocusController.state===`focused`&&this.camera.target.copyFrom(this.selectedVisual.visual.activeMesh.position),this.updateAnchor(this.selectedVisual.visual.activeMesh)):this.focusedStar&&!this.activeFlight&&this.universeVisible&&this.camera.target.copyFrom(this.currentStarPosition(this.focusedStar))),this.applyProbeInspectionCamera()}diagnosticPhase(){switch(this.strataTransition.phase){case`surface-approach`:return`surface-approach`;case`surface-crossing`:return`surface-crossing`;case`strata-snapped`:return`strata-snapped`;case`strata-free`:return`strata-free`;case`exit`:return`strata-exiting`;default:return`universe`}}prepareDiagnosticPlanetCapture(){let e=this.selectedVisual;if(!e||!this.universeVisible)return!1;let t=e.visual.activeMesh.getAbsolutePosition().clone(),n=this.currentStarPosition(e.datum.star).subtract(t),r=y.Cross(n,y.Up());return r.lengthSquared()<1e-8&&(r=y.Right()),r.normalize().scaleInPlace(this.camera.radius),this.camera.setTarget(t),this.camera.setPosition(t.add(r).add(y.Up().scale(this.camera.radius*.12))),!0}flipDiagnosticFarPlanetCapture(){return!this.focusedStar||this.selectedVisual||!this.universeVisible?!1:(this.camera.alpha+=Math.PI,!0)}diagnosticScene(){let e=this.stars[0]?this.projectToCss(this.currentStarPosition(this.stars[0])):null;return{planetCount:this.planets.length,probeCount:this.probeLayer?.diagnostics().probeCount??this.probes.size,probeNearVisible:(this.probeLayer?.diagnostics().nearOpacity??0)>.001,firstStarX:e?.x??null,firstStarY:e?.y??null,cameraDistance:this.camera.radius,targetDistance:this.camera.radius,cameraAlpha:this.camera.alpha,cameraBeta:this.camera.beta,cameraTargetX:this.camera.target.x,cameraTargetY:this.camera.target.y,cameraTargetZ:this.camera.target.z,cameraUp:[this.camera.upVector.x,this.camera.upVector.y,this.camera.upVector.z],strataPose:this.strataTransition.pose,undatedRoom:this.strataTransition.layout?.undatedRoom?{centerDepth:this.strataTransition.layout.undatedRoom.centerDepth,angle:this.strataTransition.layout.undatedRoom.angle}:null}}diagnosticStellar(){let e=this.stars.flatMap(e=>{if(!this.isInteractive(e)||!this.universeVisible)return[];let t=this.projectToCss(this.currentStarPosition(e));if(t.z<0||t.z>1)return[];let n=Eo(e),r=e===this.focusedStar&&this.presentation.lodIntent!==`point`,i=this.canvas.getBoundingClientRect(),a=e.bodyR*i.height/Math.max(.001,Math.tan(this.camera.fov*.5)*this.camera.radius),o=r?Math.max(n.panoramaCorePx,a):n.panoramaCorePx,s=r?Math.max(n.panoramaHaloPx,a*n.coronaScale):n.panoramaHaloPx;return[{starKey:w(e.s),core:{x:t.x-o/2,y:t.y-o/2,width:o,height:o},halo:{x:t.x-s/2,y:t.y-s/2,width:s,height:s}}]}),t=this.activeFlight&&this.activeFlight.flight.durationMs>0?Math.min(1,this.activeFlight.elapsedMs/this.activeFlight.flight.durationMs):+!!this.focusedStar;return{starCount:this.stars.length,projectedStars:e,hoveredStarKey:this.hoverKey,hoverProgress:this.hoverProgress,focusedStarKey:this.focusedStar?w(this.focusedStar.s):null,approachProgress:t,approachDurationMs:this.lastFlightDurationMs,reducedMotion:this.reducedMotion,systemReveal:this.presentation.systemReveal,visibleQuestionOrbits:[...this.visualByQuestion.values()].filter(({orbit:e})=>e.isEnabled()&&e.alpha>0).length,visibleQuestionPlanets:[...this.visualByQuestion.values()].filter(({visual:e})=>e.activeMesh.isEnabled()).length,cameraSamples:this.diagnosticCameraSamples??[],shaderFallback:this.starLayer.diagnostics().stellarShaderFallback}}selectedPlanetBounds(){let e=this.selectedVisual?.visual;return!e||!this.universeVisible?null:this.planetBounds(e.activeMesh,e.radius)}planetBounds(e,t){if(!this.universeVisible)return null;e.computeWorldMatrix(!0);let n=e.getBoundingInfo().boundingSphere,r=this.projectToCss(n.centerWorld),i=this.canvas.getBoundingClientRect(),a=La(t,y.Distance(this.camera.globalPosition,n.centerWorld),this.camera.fov,i.width,i.height*this.camera.viewport.height);return{x:r.x-a/2,y:r.y-a/2,width:a,height:a}}answerSpecimenDiagnostics(){if(this.universeVisible)return[];let e=this.canvas.getBoundingClientRect();return[...this.specimenByMeshId.entries()].map(([t,n])=>{let r=this.scene.meshes.find(({uniqueId:e})=>e===t),i={answerId:n.answerId,room:n.room,depth:n.depth,x:n.x,z:n.z};if(!r||!r.isEnabled())return{...i,bounds:null};let a=this.projectToCss(r.getAbsolutePosition()),o=this.scene.pick(a.x*this.engine.getRenderWidth()/Math.max(1,e.width),a.y*this.engine.getRenderHeight()/Math.max(1,e.height))?.pickedMesh?.uniqueId===t&&a.z>=0&&a.z<=1&&a.x>=12&&a.x<=e.width-12&&a.y>=12&&a.y<=e.height-12;return{...i,bounds:o?{x:a.x-12,y:a.y-12,width:24,height:24}:null}})}firstAnswerSpecimenBounds(e){let t=this.canvas.getBoundingClientRect(),n=e.flatMap(({bounds:e})=>e?[e]:[]);return n.length===0?null:n.reduce((e,n)=>{let r=Math.hypot(e.x+e.width/2-t.width/2,e.y+e.height/2-t.height/2);return Math.hypot(n.x+n.width/2-t.width/2,n.y+n.height/2-t.height/2)<r?n:e})}projectToCss(e){return this.projectToCssToRef(e,{x:0,y:0,z:0})}projectToCssToRef(e,t){let n=this.engine.getRenderWidth(),r=this.engine.getRenderHeight(),i=this.camera.viewport,a=this.projectionViewport;a.x=i.x*n,a.y=i.y*r,a.width=i.width*n,a.height=i.height*r;let o=this.projectedPositionScratch;y.ProjectToRef(e,this.projectionIdentity,this.scene.getTransformMatrix(),a,o);let s=this.canvas.getBoundingClientRect();return t.x=o.x*s.width/Math.max(1,n),t.y=o.y*s.height/Math.max(1,r),t.z=o.z,t}updatePlanetPosition(e,t){let n=e.datum,r=Ee({elapsedMs:t,frozenAtMs:this.planetMotionFrozenAtMs,reducedMotion:this.reducedMotion}),i=Jt(n.star,r.frameTimeMs,this.reducedMotion?0:1.35,this.planetStarPositionScratch),a=n.phase+Math.PI*2/n.period*(r.orbitTimeMs/1e3),o=Math.cos(a),s=Math.sin(a);e.visual.setPosition(this.planetPositionScratch.set(i.x+(n.u[0]*o+n.v[0]*s)*n.orbitR,i.y+(n.u[1]*o+n.v[1]*s)*n.orbitR,i.z+(n.u[2]*o+n.v[2]*s)*n.orbitR)),e.orbit.position.set(i.x-n.star.p[0],i.y-n.star.p[1],i.z-n.star.p[2])}refreshPlanetMeshIndex(e){for(let[t,n]of this.visualByMeshId)n===e&&this.visualByMeshId.delete(t);for(let t of e.visual.meshes)t.name.includes(`:atmosphere`)||this.visualByMeshId.set(t.uniqueId,e)}finishPlanetExit(){let e=this.selectedVisual;e&&(e.visual.setSelected(!1),e.visual.setLod(this.quality===`low`?`low`:`medium`),this.selected=null,this.selectedVisual=null,this.callbacks.onAnchor?.(0,0,!1),this.callbacks.onPickPlanet?.(null),this.syncOrbitPresentation())}updateAnchor(e){if(!this.callbacks.onAnchor)return;let t=this.engine.getRenderWidth(),n=this.engine.getRenderHeight(),r=this.camera.viewport,i=this.projectionViewport;i.x=r.x*t,i.y=r.y*n,i.width=r.width*t,i.height=r.height*n;let a=this.projectedPositionScratch;y.ProjectToRef(e.getAbsolutePosition(),this.projectionIdentity,this.scene.getTransformMatrix(),i,a);let o=a.z>=0&&a.z<=1;this.callbacks.onAnchor(a.x,a.y,o)}captureStrataEntryPose(){return this.entryCameraSnapshot=Object.freeze({alpha:this.camera.alpha,beta:this.camera.beta,radius:this.camera.radius,target:this.camera.target.clone()}),Object.freeze({depth:this.camera.radius,yaw:this.camera.alpha,pitch:this.camera.beta,snapId:null})}selectedPlanetWorldRadius(){let e=this.selectedVisual?.visual.activeMesh;if(!e)return .25;let t=e.getBoundingInfo().boundingSphere.radiusWorld;return Number.isFinite(t)&&t>0?t:.25}applyStrataPose(e){if(this.destroyed)return;if(this.universeVisible){let t=this.entryCameraSnapshot;t&&this.camera.setTarget(t.target),this.camera.alpha=e.yaw,this.camera.beta=e.pitch,this.camera.radius=e.depth;return}this.applyStrataDepthAtmosphere(e.depth);let t=new y(0,-e.depth,0),n=Math.cos(e.pitch),r=new y(Math.sin(e.yaw)*n,Math.sin(e.pitch),Math.cos(e.yaw)*n);this.camera.setPosition(t),this.camera.setTarget(t.add(r))}applyStrataDepthAtmosphere(e){let t=qr(e,this.caveMaxDepth);this.scene.fogDensity=t.density,this.scene.fogColor=new r(t.color[0],t.color[1],t.color[2]);let n=this.caveGuideLight;n&&(n.position.y=Yr(e,F(this.quality)).y)}enterPlanetSurface(e){if(this.destroyed||!this.selectedVisual||this.selectedVisual.datum.question.id!==e)return!1;let{field:t,displacement:n}=pt(this.selectedVisual.descriptor,this.quality),i=this.selectedVisual.visual.activeMesh.position,a=this.camera.globalPosition,o=new y(a.x-i.x,a.y-i.y,a.z-i.z),s=o.lengthSquared()>1e-9?[o.x/o.length(),o.y/o.length(),o.z/o.length()]:[0,1,0],c=this.focusedStar?this.currentStarPosition(this.focusedStar):null,l=Mt(s,c?[c.x-i.x,c.y-i.y,c.z-i.z]:s);this.disposeSurfaceWorld();let u=new le(`planet-surface-root`,this.scene);u.position.copyFrom(i),this.surfaceRoot=u,this.surfaceRadius=this.selectedPlanetWorldRadius(),this.surfaceDisplacement=n,this.surfaceGround=new Ue(this.scene,{radius:this.surfaceRadius,thermal:this.selectedVisual.descriptor.thermal,seed:this.selectedVisual.descriptor.seed}),this.surfaceWorld=new nt(this.scene,u,{material:this.surfaceGround.material,field:t,radius:this.surfaceRadius,displacement:n,resolution:this.quality===`high`?8:this.quality===`medium`?6:4,skirtDepth:.02,albedo:Pe(this.selectedVisual.descriptor.thermal),maxDepth:this.quality===`low`?4:5,detailAngle:.35,budget:this.quality===`high`?400:240}),this.surfaceSky=new Ie(this.scene,u,{radius:this.surfaceRadius*6,thermal:this.selectedVisual.descriptor.thermal});let d=this.surfaceSunDirection();return this.surfaceSun=new g(`planet-surface:sun`,new y(-d[0],-d[1],-d[2]),this.scene),this.surfaceSun.parent=u,this.surfaceSun.intensity=1.15,this.surfaceAmbient=new _(`planet-surface:sky-light`,new y(l[0],l[1],l[2]),this.scene),this.surfaceAmbient.parent=u,this.surfaceAmbient.intensity=.42,this.surfaceAmbient.groundColor=new r(.05,.045,.04),this.surfaceField=t,this.surfacePose=kt(l,this.surfaceRadius*.012),this.surfaceStage=j(this.surfaceStage,{kind:`enter`,questionId:e,landing:l}),this.surfaceDescent=Object.freeze({startedAt:performance.now(),elapsed:0,from:this.camera.globalPosition.clone(),fromTarget:this.camera.target.clone()}),this.applySurfaceVisibility(),!0}exitPlanetSurface(){this.surfaceStage.phase!==`idle`&&(this.surfaceStage=j(this.surfaceStage,{kind:`exit`}),this.disposeSurfaceWorld(),this.applySurfaceVisibility())}walkPlanetSurface(e){return!yt(this.surfaceStage)||!this.surfacePose?!1:(this.surfacePose=Dt(this.surfacePose,e),!0)}surfaceStageDiagnostics(){let e=this.surfaceWorld?.diagnostics(),t=this.surfacePose&&this.surfaceField?Ot(this.surfacePose,this.surfaceField,this.surfaceRadius,this.surfaceDisplacement):null;return Object.freeze({phase:this.surfaceStage.phase,descent:this.surfaceStage.descent,chunkCount:e?.chunkCount??0,meshCount:e?.meshCount??0,builtThisUpdate:e?.builtThisUpdate??0,vertexCount:e?.vertexCount??0,skyVisible:vt(this.surfaceStage),groundRadius:t?.groundRadius??0,cameraTargetDistance:y.Distance(this.camera.globalPosition,this.camera.target),lightCount:+!!this.surfaceSun+ +!!this.surfaceAmbient,cameraAltitude:this.surfaceRoot?y.Distance(this.camera.globalPosition,this.surfaceRoot.position)/Math.max(1e-6,this.surfaceRadius):0,sunElevation:t?(()=>{let e=this.surfaceSunDirection();return t.up[0]*e[0]+t.up[1]*e[1]+t.up[2]*e[2]})():0})}applySurfaceVisibility(){let e=_t(this.surfaceStage);this.surfaceRoot?.setEnabled(e),this.surfaceSky?.setDim(+!!vt(this.surfaceStage)),e?this.universeRoot.setEnabled(!1):this.surfaceStage.phase===`idle`&&this.universeVisible&&this.universeRoot.setEnabled(!0),!M(this.surfaceStage)&&!this.camera.upVector.equals(y.UpReadOnly)&&(this.camera.upVector=y.Up());let t=M(this.surfaceStage);this.camera.minZ=t&&this.surfacePose?At(this.surfacePose.eyeHeight):nc,this.camera.lowerRadiusLimit=t?null:rc,this.applyCameraViewport()}disposeSurfaceWorld(){this.surfaceWorld?.dispose(),this.surfaceWorld=null,this.surfaceSky?.dispose(),this.surfaceSky=null,this.surfaceGround?.dispose(),this.surfaceGround=null,this.surfaceSun?.dispose(),this.surfaceSun=null,this.surfaceAmbient?.dispose(),this.surfaceAmbient=null,this.surfaceRoot?.dispose(!1,!1),this.surfaceRoot=null,this.surfacePose=null,this.surfaceField=null}updatePlanetSurface(){let e=this.surfacePose,t=this.surfaceField;if(!e||!t||!_t(this.surfaceStage))return;let n=Ot(e,t,this.surfaceRadius,this.surfaceDisplacement),r=Math.hypot(n.position[0],n.position[1],n.position[2]);this.surfaceWorld?.update(e.direction,r/Math.max(1e-6,this.surfaceRadius));let i=this.surfaceRoot;if(!i)return;let a=new y(i.position.x+n.position[0],i.position.y+n.position[1],i.position.z+n.position[2]),o=new y(i.position.x+n.target[0],i.position.y+n.target[1],i.position.z+n.target[2]),s=this.surfaceDescent;if(s&&this.surfaceStage.phase===`descending`){let e=Qs(s.startedAt,performance.now(),tc,s.elapsed);this.surfaceDescent=Object.freeze({...s,elapsed:e});let t=this.reducedMotion?1:Math.min(1,e/tc),r=t*t*(3-2*t);this.camera.setPosition(y.Lerp(s.from,a,r)),this.camera.setTarget(y.Lerp(s.fromTarget,o,r)),this.camera.upVector=new y(n.up[0],n.up[1],n.up[2]),this.surfaceStage=j(this.surfaceStage,{kind:`descend`,token:this.surfaceStage.token,progress:t}),t>=1&&(this.surfaceStage=j(this.surfaceStage,{kind:`landed`,token:this.surfaceStage.token}),this.surfaceDescent=null)}else this.camera.upVector=new y(n.up[0],n.up[1],n.up[2]),this.camera.setTarget(o),this.camera.setPosition(a);let c=this.surfaceSunDirection();this.surfaceSky?.setSun(c),this.surfaceGround?.setSun(c);let l=this.camera.globalPosition;this.surfaceGround?.setCamera([l.x,l.y,l.z],[i.position.x,i.position.y,i.position.z],this.surfaceRadius),this.surfaceSun?.direction.set(-c[0],-c[1],-c[2]),this.surfaceAmbient?.direction.set(n.up[0],n.up[1],n.up[2])}surfaceSunDirection(){let e=this.surfaceRoot;if(!e||!this.focusedStar)return[0,1,0];let t=this.currentStarPosition(this.focusedStar),n=t.x-e.position.x,r=t.y-e.position.y,i=t.z-e.position.z,a=Math.hypot(n,r,i);return a>1e-6?[n/a,r/a,i/a]:[0,1,0]}setUniverseVisible(e){if(!this.destroyed){if(this.universeVisible=e,this.universeRoot.setEnabled(e),e&&this.surfaceStage.phase===`digging`&&(this.surfaceStage=j(this.surfaceStage,{kind:`surfaced`,token:this.surfaceStage.token}),this.applySurfaceVisibility()),this.caveRoot?.setEnabled(!e),this.scene.fogEnabled=!e,e&&!this.workspaceOpen?this.camera.attachControl(this.canvas,!0):this.camera.detachControl(),e&&this.selectedVisual&&this.planetFocusController.state===`idle`){let e=this.selected?this.planetFraming(this.selected):null;this.planetFocusController.enter(this.selectedVisual.visual,e?.distance,e?{low:e.low,high:e.high}:void 0)}e||this.clearPointerFeedback(),this.syncOrbitPresentation()}}animateStrata(e,t,n,r){if(this.destroyed)return()=>{};e===`surface-crossing`&&this.caveRoot?.setEnabled(!0);let i=this.camera.target.clone(),a=this.camera.radius,o=this.selectedVisual?.visual.activeMesh.position.clone()??i,s=e===`surface-approach`?o:e===`exit`?new y(0,-.35,1):new y(0,-1,1),c=this.selectedPlanetWorldRadius(),l=e===`surface-approach`?Math.min(a,Math.max(c*1.9,c+.05)):e===`exit`?.9:Math.max(.05,c*.25),u=this.reducedMotion?0:e===`surface-approach`?900:700,d=performance.now(),f=0,p=!1,m=this.scene.onBeforeRenderObservable.add(()=>{if(!(p||this.destroyed))try{let e=performance.now();f=Qs(d,e,u,f);let t=u===0?1:Math.min(1,f/u),r=t*t*(3-2*t);if(this.camera.setTarget(y.Lerp(i,s,r)),this.camera.radius=a+(l-a)*r,t<1)return;this.scene.onBeforeRenderObservable.remove(m),n()}catch(e){this.scene.onBeforeRenderObservable.remove(m),r(e instanceof Error?e:Error(String(e)))}});return()=>{p||(p=!0,this.scene.onBeforeRenderObservable.remove(m))}}createCave(e){this.specimenByMeshId.clear(),this.caveRoot?.dispose(!1,!0),this.caveGuideLight=null;let t=new le(`answer-strata-root`,this.scene);this.caveRoot=t;let n=e.layers.length>0?e.layers:[{id:`surface-observation-room`,centerDepth:2.5,thickness:5,colorIndex:1,openingAngle:null}];for(let i of n){let n=S(`cave-wall:${i.id}`,{height:i.thickness+.12,diameter:e.bounds.radius*2,tessellation:18,subdivisions:Sa(i.thickness+.12),cap:C.NO_CAP,arc:i.openingAngle===null||!e.undatedRoom?1:fo(e.undatedRoom).wallArc,enclose:!1},this.scene);n.parent=t,n.position.y=-i.centerDepth,n.rotation.y=i.openingAngle===null||!e.undatedRoom?i.colorIndex*.21:fo(e.undatedRoom).wallRotationY,n.scaling.x=1+Math.sin(i.centerDepth*1.7)*.055,n.scaling.z=1+Math.cos(i.centerDepth*1.3)*.07,n.isPickable=!0;let a=new p(`${n.name}:material`,this.scene);a.diffuseColor=new r(...ha(i.colorIndex)),a.emissiveColor=new r(...ga(i.colorIndex)),n.useVertexColors=!0,wa(n,i.thickness+.12),a.specularColor=new r(.045,.055,.06),a.backFaceCulling=!1,a.twoSidedLighting=!0,n.material=a;let o=S(`cave-seam:${i.id}`,{height:ma,diameter:e.bounds.radius*1.96,tessellation:22,cap:C.NO_CAP},this.scene);o.parent=t,o.position.y=-(i.centerDepth+i.thickness/2),o.isPickable=!1;let s=new p(`${o.name}:material`,this.scene);s.diffuseColor=new r(.035,.085,.1),s.emissiveColor=new r(...pa),s.backFaceCulling=!1,o.material=s}this.createCaveCap(t,e),this.createUndatedRoom(t,e);for(let n of e.specimens)this.createSpecimen(t,n);this.createCaveDust(t,e),this.createCaveLights(t,e),this.caveMaxDepth=Math.max(1,e.bounds.maxDepth);let i=Yr(e.bounds.minDepth,F(this.quality)),a=new te(`cave-guide`,new y(0,i.y,0),this.scene);a.parent=t,a.diffuse=new r(i.color[0],i.color[1],i.color[2]),a.specular=new r(i.color[0],i.color[1],i.color[2]),a.intensity=i.intensity,a.range=i.range,this.caveGuideLight=a,this.applyStrataDepthAtmosphere(e.bounds.minDepth),this.scene.fogMode=c.FOGMODE_EXP2,t.setEnabled(!1)}createCaveCap(e,t){let n=t.blockedDepth?t.bounds.maxDepth:t.bounds.maxDepth+.25,i=S(`cave-depth-cap`,{height:.55,diameter:t.bounds.radius*1.94,tessellation:18},this.scene);i.parent=e,i.position.y=-n;let a=new p(`cave-depth-cap:material`,this.scene);a.diffuseColor=t.blockedDepth?new r(.22,.16,.12):new r(.08,.1,.12),a.emissiveColor=t.blockedDepth?new r(.06,.025,.012):r.Black(),a.specularColor=r.Black(),i.material=a;let o=h(`surface-crossing-crack`,{radius:1,subdivisions:2},this.scene);o.parent=e,o.position.set(0,-.2,t.bounds.radius-.35),o.scaling.set(1.9,.1,.16),o.isPickable=!1;let s=new p(`surface-crossing-crack:material`,this.scene);s.diffuseColor=new r(.15,.44,.56),s.emissiveColor=new r(.12,.68,.92),o.material=s}createSpecimen(e,t){let n=h(`answer-specimen:${t.answerId}`,{radius:1,subdivisions:2},this.scene);n.parent=e,n.position.set(t.x,-t.depth,t.z),n.scaling.set(t.scale*.72,t.scale*1.65,t.scale),n.rotation.set(t.depth*.17,t.x*.23,t.z*.19),n.isPickable=!0,n.metadata={answerId:t.answerId};let i=new p(`${n.name}:material`,this.scene),a=t.relations.includes(`created`);i.diffuseColor=a?new r(.66,.38,.13):new r(.37,.53,.61),i.emissiveColor=a?new r(.42,.18,.04):new r(.08,.16,.2),i.specularColor=t.relations.includes(`collected`)?new r(.35,.67,.88):new r(.14,.19,.21),i.specularPower=72,n.material=i;let o=$r({scale:t.scale,created:a,collected:t.relations.includes(`collected`)}),s=h(`answer-specimen-halo:${t.answerId}`,{radius:1,subdivisions:2},this.scene);s.parent=n,s.scaling.setAll(o.radius),s.isPickable=!1;let c=new p(`${s.name}:material`,this.scene);c.disableLighting=!0,c.backFaceCulling=!1,c.alphaMode=Gs,c.emissiveColor=new r(o.color[0]*o.intensity,o.color[1]*o.intensity,o.color[2]*o.intensity),c.alpha=.3+o.intensity*.22,s.material=c,this.specimenByMeshId.set(n.uniqueId,t)}createUndatedRoom(e,n){let i=n.undatedRoom;if(!i)return;let a=ee(`undated-debris-room`,{diameter:i.radius*2,segments:14,arc:i.openArc,slice:1},this.scene);a.parent=e,a.position.set(i.x,-i.centerDepth,i.z),a.rotation.y=i.angle+Math.PI*.64,a.scaling.y=.78,a.isPickable=!0;let o=new p(`undated-debris-room:material`,this.scene);o.diffuseColor=new r(.16,.19,.22),o.emissiveColor=new r(.025,.055,.065),o.specularColor=new r(.04,.06,.07),o.backFaceCulling=!1,o.twoSidedLighting=!0,a.material=o;let s=Math.hypot(i.x,i.z),c=S(`undated-debris-tunnel`,{height:Math.max(1,s-n.bounds.radius+i.radius*.7),diameter:1.8,tessellation:14,cap:C.NO_CAP},this.scene);c.parent=e,c.position.set(i.x*.63,-i.centerDepth,i.z*.63);let l=fo(i),u=new y(l.tunnelDirection.x,0,l.tunnelDirection.z);c.rotationQuaternion=t.Identity(),t.FromUnitVectorsToRef(y.Up(),u,c.rotationQuaternion),c.isPickable=!0,c.material=o}createCaveDust(e,t){let n=new p(`cave-dust:material`,this.scene);n.disableLighting=!0,n.emissiveColor=new r(.18,.29,.32),n.alpha=.38;for(let r=0;r<24;r+=1){let i=ee(`cave-dust:${r}`,{diameter:.026+r%3*.009,segments:4},this.scene);i.parent=e;let a=r*2.399963,o=.7+r%7*.48;i.position.set(Math.sin(a)*o,-(.8+r/23*Math.max(1,t.bounds.maxDepth-1.2)),Math.cos(a)*o),i.isPickable=!1,i.material=n}}createCaveLights(e,t){let n=t.layers.length>0?t.layers.map(({centerDepth:e})=>e):[2.2];for(let[t,i]of n.entries()){let n=new te(`cave-light:${t}`,new y(t%2==0?2.4:-2.4,-i,t%3==0?1.7:-1.7),this.scene);n.parent=e,n.diffuse=t%2==0?new r(.22,.52,.66):new r(.58,.31,.16),n.intensity=_a,n.range=16}}applyStarFocus(e){try{this.diagnosticApproachProgressOverride=null,this.diagnosticCameraSamples?.splice(0),this.clearPlanet(),this.materializeStarSystem(e),this.focusedStar=e,this.planetMotionFrozenAtMs=this.motionTime();let t=w(e.s),n=this.currentStarPosition(e);this.starLayer.setFocus(t,e),this.applyLayerFocus(e);let r=this.systemFraming(e),i=y.Distance(this.camera.target,n);if(!Z(n)||!Z(this.camera.target)||!Q(this.camera.radius)||!Q(e.bodyR)||!Q(this.overviewRadius)||!Number.isFinite(i))throw Error(`Invalid camera flight input`);let a=this.cameraFlightController.start({destinationRadius:r.radius,starKey:t,start:{target:this.camera.target,radius:this.camera.radius},targetStar:n,bodyR:e.bodyR,systemExtent:r.extent,overviewRadius:this.overviewRadius,distance:i,requestedMs:1100,reducedMotion:this.reducedMotion});if(a.kind===`started`)this.activeFlight=Object.freeze({flight:a.flight,elapsedMs:0,startedAt:performance.now()}),this.lastFlightDurationMs=a.flight.durationMs,this.presentation=Y({phase:`approach`,approachProgress:0}),this.recordDiagnosticCameraSample();else if(a.kind===`noop`)this.activeFlight=null,this.lastFlightDurationMs=0,this.camera.setTarget(n),this.camera.radius=r.radius,this.presentation=Y({phase:`star-focus`});else throw Error(`Invalid camera flight input`);return this.syncStarLayerPresentation(),this.syncOrbitPresentation(),!0}catch(e){return this.recoverCamera(e),this.focusedStar?$(()=>this.materializeStarSystem(this.focusedStar)):$(()=>this.releaseMaterializedPlanets()),!1}}systemFraming(e){let t=this.planets.filter(t=>t.star===e).map(({orbitR:e,radius:t})=>({orbitR:e,radius:t})),n=Is(e.bodyR,t),r=e.bodyR*8,i=this.overviewRadius*.72;if(!n.ok||!Q(r)||!Q(i)||r>i)throw Error(`Invalid camera flight input`);let a=ur(n.value,this.camera.fov),o=Math.min(i,Math.max(r,a));if(!Q(o))throw Error(`Invalid camera flight input`);return Object.freeze({extent:n.value,radius:o})}applyModeDimensions(){let e=this.stars.map(({s:e})=>tn(e,this.mode,this.universe,this.wormIdx));this.interactionByDatum.clear();for(let e of this.stars)this.interactionByDatum.set(e,nn(e.s,this.mode,this.universe,this.wormIdx));this.starLayer.setDimensions(e),this.dust?.setMode(this.mode,this.universe,this.wormIdx),this.rings?.setMode(this.mode,this.universe,this.wormIdx),this.overlay?.setMode(this.mode,this.universe,this.wormIdx)}isInteractive(e){return this.interactionByDatum.get(e)===!0}isKeyInteractive(e){return rn(this.stars,e,this.mode,this.universe,this.wormIdx)!==null}currentStarPosition(e){return Jt(e,this.motionTime(),this.reducedMotion?0:1.35,this.starPositionScratch)}motionTime(){return this.reducedMotion||this.diagnosticApproachProgressOverride!=null?0:this.elapsedMs}cancelFlight(e){this.diagnosticApproachProgressOverride=null,this.cameraFlightController.cancel(e),this.activeFlight=null,this.presentation=Y({phase:this.selected?`planet-focus`:this.focusedStar?`star-focus`:`panorama`}),this.lastPresentationInput=null}updateCameraFlight(){let e=this.activeFlight;if(!e)return;let t=this.diagnosticApproachProgressOverride,n=typeof t==`number`?e.flight.durationMs*t:Qs(e.startedAt,performance.now(),e.flight.durationMs,e.elapsedMs),r=this.cameraFlightController.frame(e.flight,n);if(!r.ok){r.error===`invalid-frame`&&this.recoverCamera(Error(`Invalid camera flight frame`));return}try{let{frame:t}=r;if(![t.target.x,t.target.y,t.target.z,t.radius].every(Number.isFinite)||t.radius<=0)throw Error(`Invalid camera flight pose`);let i=t.progress*t.progress*(3-2*t.progress),a=this.focusedStar?this.currentStarPosition(this.focusedStar):null,o=this.flightTargetScratch.set(t.target.x,t.target.y,t.target.z);if(a&&(o.x+=(a.x-e.flight.to.target.x)*i,o.y+=(a.y-e.flight.to.target.y)*i,o.z+=(a.z-e.flight.to.target.z)*i),!Z(o))throw Error(`Invalid camera flight target`);this.camera.setTarget(o),this.camera.radius=t.radius,this.recordDiagnosticCameraSample(),this.presentation=Y({phase:`approach`,approachProgress:t.progress}),this.activeFlight=t.complete?null:Object.freeze({flight:e.flight,elapsedMs:n,startedAt:e.startedAt}),t.complete&&(this.diagnosticApproachProgressOverride=null,this.presentation=Y({phase:`star-focus`})),this.lastPresentationInput=null,this.syncOrbitPresentation()}catch(e){this.recoverCamera(e)}}setDiagnosticApproachProgress(e){return!1}recordDiagnosticCameraSample(){}recoverCamera(e){this.diagnosticApproachProgressOverride=null;let t=e instanceof Error?e:Error(String(e));$(()=>this.cameraFlightController.cancel(`reset`)),this.activeFlight=null;let n=null;this.focusedStar&&$(()=>{n=this.currentStarPosition(this.focusedStar)});let r=null;this.focusedStar&&$(()=>{r=this.systemFraming(this.focusedStar).radius});let i=this.focusedStar&&this.isInteractive(this.focusedStar)&&Q(this.focusedStar.bodyR)&&n&&Z(n)&&r!==null?this.focusedStar:null;if(i){let e=i,t=!1;$(()=>{this.starLayer.setFocus(w(e.s),e),t=!0}),t||(i=null)}if($(()=>this.pointerPresentation.clear()),$(()=>this.applyPointerPresentationFeedback(!1)),i&&n&&r!==null){let e=!1;$(()=>{this.camera.setTarget(n),this.camera.radius=r,e=!0}),e||(i=null)}i?this.presentation=Y({phase:`star-focus`}):(this.focusedStar=null,this.planetMotionFrozenAtMs=null,$(()=>this.starLayer.setFocus(null,null)),this.overviewTarget=Z(this.overviewTarget)?this.overviewTarget:y.Zero(),this.overviewRadius=Q(this.overviewRadius)?this.overviewRadius:30,$(()=>this.camera.setTarget(this.overviewTarget)),$(()=>{this.camera.radius=this.overviewRadius}),this.presentation=Y({phase:`panorama`})),$(()=>this.syncStarLayerPresentation()),this.lastPresentationInput=null,$(()=>this.syncOrbitPresentation()),this.callbacks.onRenderError?.(t)}updateStellarPresentation(e){let t=+!!this.hoverKey,n=this.reducedMotion?1:Math.min(1,e/150);this.hoverProgress+=(t-this.hoverProgress)*n,this.pressedProgress=+!!this.pressedKey;let r={phase:this.universeVisible?this.selected?`planet-focus`:this.activeFlight?`approach`:this.focusedStar?`star-focus`:`panorama`:`strata`,approachProgress:this.activeFlight&&this.activeFlight.flight.durationMs>0?this.activeFlight.elapsedMs/this.activeFlight.flight.durationMs:void 0,hoverProgress:this.hoverProgress,pressedProgress:this.pressedProgress},i=this.lastPresentationInput;i&&i.phase===r.phase&&i.approachProgress===r.approachProgress&&i.hoverProgress===r.hoverProgress&&i.pressedProgress===r.pressedProgress||(this.presentation=Y(r),this.lastPresentationInput=Object.freeze(r),this.syncStarLayerPresentation())}installPointerListeners(){this.canvas.addEventListener(`pointerdown`,this.onPointerDown),this.canvas.addEventListener(`pointermove`,this.onPointerMove),this.canvas.addEventListener(`pointerup`,this.onPointerUp),this.canvas.addEventListener(`pointercancel`,this.onPointerCancel),this.canvas.addEventListener(`lostpointercapture`,this.onLostPointerCapture),this.canvas.addEventListener(`pointerleave`,this.onPointerLeave),this.canvas.addEventListener(`wheel`,this.onWheel),window.addEventListener(`keydown`,this.onKeyDown)}removePointerListeners(){this.canvas.removeEventListener(`pointerdown`,this.onPointerDown),this.canvas.removeEventListener(`pointermove`,this.onPointerMove),this.canvas.removeEventListener(`pointerup`,this.onPointerUp),this.canvas.removeEventListener(`pointercancel`,this.onPointerCancel),this.canvas.removeEventListener(`lostpointercapture`,this.onLostPointerCapture),this.canvas.removeEventListener(`pointerleave`,this.onPointerLeave),this.canvas.removeEventListener(`wheel`,this.onWheel),window.removeEventListener(`keydown`,this.onKeyDown)}onPointerDown=e=>{if(this.destroyed||this.workspaceOpen)return;if(this.canvas.focus({preventScroll:!0}),this.cancelFlight(`user`),this.selected&&this.planetFocusController.state===`focused`){this.planetDragPointerId=e.pointerId,this.planetDragX=e.clientX,this.planetDragY=e.clientY,this.planetDragMovement=0,this.planetDragStartedOnTarget=this.pointerTarget(e.clientX,e.clientY,sc(e.pointerType))!==null;try{this.canvas.setPointerCapture(e.pointerId)}catch{}return}let t=this.pointerTarget(e.clientX,e.clientY,sc(e.pointerType));this.pointerPresentation.pointerDown({pointerId:e.pointerId,inputKind:sc(e.pointerType),x:e.clientX,y:e.clientY,starKey:t}),this.applyPointerPresentationFeedback();try{this.canvas.setPointerCapture(e.pointerId)}catch{}};onPointerMove=e=>{if(this.destroyed||this.workspaceOpen)return;if(this.planetDragPointerId===e.pointerId){let t=e.clientX-this.planetDragX,n=e.clientY-this.planetDragY;this.planetDragMovement+=Math.hypot(t,n),this.planetFocusController.drag(t,n),this.planetDragX=e.clientX,this.planetDragY=e.clientY;return}let t=this.pointerPresentation.gestureSnapshot(),n=t.activePointerId===null&&!t.multiPointerInvalidated?this.pointerTarget(e.clientX,e.clientY,sc(e.pointerType)):null;this.pointerPresentation.pointerMove({pointerId:e.pointerId,x:e.clientX,y:e.clientY,starKey:n}),this.applyPointerPresentationFeedback()};onPointerUp=e=>{if(this.destroyed)return;if(this.planetDragPointerId===e.pointerId){this.planetDragPointerId=null,this.canvas.hasPointerCapture(e.pointerId)&&this.canvas.releasePointerCapture(e.pointerId),this.planetDragMovement<6&&!this.planetDragStartedOnTarget&&this.exitHierarchy();return}let t=this.pointerPresentation.gestureSnapshot(),n=this.pointerTarget(e.clientX,e.clientY,sc(e.pointerType)),r=this.pointerPresentation.pointerUp({pointerId:e.pointerId,x:e.clientX,y:e.clientY,starKey:n});this.canvas.hasPointerCapture(e.pointerId)&&this.canvas.releasePointerCapture(e.pointerId),this.applyPointerPresentationFeedback(),r?this.activatePointerTarget(r):t.activePointerId===e.pointerId&&!t.cancelled&&!t.multiPointerInvalidated&&t.accumulatedMovement<6&&t.pressedStarKey===null&&n===null&&this.exitHierarchy()};onPointerCancel=e=>{this.planetDragPointerId===e.pointerId&&(this.planetDragPointerId=null),this.pointerPresentation.pointerCancel(e.pointerId),this.applyPointerPresentationFeedback()};onLostPointerCapture=e=>{this.planetDragPointerId===e.pointerId&&(this.planetDragPointerId=null),this.pointerPresentation.lostPointerCapture(e.pointerId),this.applyPointerPresentationFeedback()};onPointerLeave=()=>{this.pointerPresentation.pointerLeave(),this.applyPointerPresentationFeedback()};onWheel=e=>{if(this.destroyed||this.workspaceOpen)return;if(this.cancelFlight(`user`),this.planetFocusController.wheel(e.deltaY)){e.preventDefault();return}let t=pr(this.framingPhase(),{sceneRadius:this.sceneRadius,systemDistance:this.focusedStar?this.systemFramingRadius(this.focusedStar):void 0});t!==null&&Us(e.deltaY,this.camera.radius,t)&&this.exitHierarchy()};onKeyDown=e=>{this.applyKeyDown(e)};applyKeyDown(e){if(!(this.destroyed||this.workspaceOpen||this.inspectedProbeId||e.defaultPrevented)){if(this.planetFocusController.keyDown(e.key)){e.preventDefault();return}e.key===`Escape`&&this.exitHierarchy()}}pointerTarget(e,t,n){if(!this.universeVisible)return this.sceneTarget(e,t);let r=this.sceneTarget(e,t);if(r)return r;let i=this.canvas.getBoundingClientRect(),a=this.candidateBuffer.update(this.motionTime(),this.reducedMotion?0:1.35,(e,t)=>{let n=this.projectToCssToRef(this.candidateWorldScratch.set(e.x,e.y,e.z),this.pointerProjectionScratch),r=this.candidateProjectionScratch;return r.x=n.x,r.y=n.y,r.depth=n.z,r.visible=this.universeVisible&&this.isInteractive(t),r}),o={x:e-i.left,y:t-i.top,inputKind:n,viewport:{width:i.width,height:i.height}},s=Oo(o,a);if(s)return`star:${s.starKey}`;let c=Oo(o,this.projectedPlanetCandidates());return c?`planet:${c.starKey}`:null}projectedPlanetCandidates(){if(!this.universeVisible||!this.focusedStar)return[];let e=this.canvas.getBoundingClientRect(),t=Math.max(1,this.engine.getRenderHeight()),n=t*.5/Math.tan(this.camera.fov*.5),r=this.camera.globalPosition,i=[];for(let a of this.visualByQuestion.values()){let o=a.visual.activeMesh;if(!o.isEnabled()||!o.isPickable)continue;let s=this.projectToCss(o.position);if(!(s.z>0&&s.z<1))continue;let c=Math.max(.001,y.Distance(o.position,r)),l=a.visual.radius*n/c*e.height/t;i.push({starKey:a.datum.question.id,x:s.x,y:s.y,depth:s.z,visualRadiusPx:l,visible:!0,solid:!0})}return i}sceneTarget(e,t){let n=this.canvas.getBoundingClientRect(),r=(e-n.left)*this.engine.getRenderWidth()/Math.max(1,n.width),i=(t-n.top)*this.engine.getRenderHeight()/Math.max(1,n.height),a=this.scene.pick(r,i)?.pickedMesh;if(!a)return null;let o=this.probeLayer?.pickPart(a);if(o)return`probe-part:${o}`;let s=this.specimenByMeshId.get(a.uniqueId);if(s)return`specimen:${s.answerId}`;let c=this.visualByMeshId.get(a.uniqueId);return c&&c.visual.activeMesh.isEnabled()&&c.visual.activeMesh.isPickable?`planet:${c.datum.question.id}`:null}activatePointerTarget(e){if(e.startsWith(`star:`)){this.focusStar(e.slice(5));return}if(e.startsWith(`planet:`)){let t=this.visualByQuestion.get(e.slice(7)),n=t&&`id`in t.datum.star.s?t.datum.star.s.id:null;t&&n&&this.selectQuestionPlanet(n,t.datum.question.id);return}if(e.startsWith(`probe-part:`)){let t=e.slice(11);this.focusProbePart(t),this.callbacks.onProbePartChange?.(t);return}e.startsWith(`specimen:`)&&this.strataTransition.focusAnswer(e.slice(9))}exitHierarchy(){let e=Hs(this.universeVisible?this.selected?`planet-focus`:this.activeFlight||this.focusedStar?`star-focus`:`panorama`:`strata`);e===`star-focus`?this.clearPlanet():e===`panorama`&&(this.resetView(),this.callbacks.onPick?.(null))}clearPointerFeedback(){this.pointerPresentation.clear(),this.applyPointerPresentationFeedback(),this.hoverProgress=0,this.pressedProgress=0}applyPointerPresentationFeedback(e=!0){let t=this.pointerPresentation.snapshot();this.hoverKey=t.hoverStarKey,this.pressedKey=t.pressedStarKey,this.canvas.style.cursor=t.cursor,this.applyPlanetHover(t.hoverStarKey),e&&this.syncStarLayerPresentation()}applyPlanetHover(e){let t=e?.startsWith(`planet:`)?e.slice(7):null;for(let[e,n]of this.visualByQuestion)n.visual.setHovered(e===t)}syncStarLayerPresentation(){(this.lastLayerPresentation!==this.presentation||this.lastLayerHoverKey!==this.hoverKey||this.lastLayerPressedKey!==this.pressedKey)&&(this.starLayer.setPresentation(this.presentation,this.hoverKey,this.pressedKey),this.lastLayerPresentation=this.presentation,this.lastLayerHoverKey=this.hoverKey,this.lastLayerPressedKey=this.pressedKey)}resizeLabels(){let e=this.labelCanvas.getBoundingClientRect(),t=Math.min(window.devicePixelRatio||1,2);if(!this.labels){this.labelCanvas.width=Math.max(1,Math.round(e.width*t)),this.labelCanvas.height=Math.max(1,Math.round(e.height*t));return}this.labels.resize(Math.max(1,e.width),Math.max(1,e.height),t)}};function ac(e,t,n){let r=Math.min(1,Math.max(0,(e-t)/Math.max(1e-6,n-t)));return r*r*(3-2*r)}function oc(e){return`id`in e.s?e.s.id:e.s.c}function X(e){let t=Error(e);return t.name=`UnsupportedRendererFeatureError`,t}function sc(e){return e===`touch`||e===`pen`?e:`mouse`}function Z(e){return[e.x,e.y,e.z].every(Number.isFinite)}function Q(e){return Number.isFinite(e)&&e>0}function $(e){try{e()}catch{}}function cc(e){(e.getContext(`webgl2`)??e.getContext(`webgl`))?.getExtension(`WEBGL_lose_context`)?.loseContext()}function lc(t,n){let r=ye([...t.answersById.values()]),i=[];for(let a of n)if(`id`in a.s)for(let n of e(t,a.s)){let e=be(n,r),t=n.orbitIndex-1,o=pn(t),s=gn(t,a.sysU,a.sysV,a.sysAxis);i.push(Object.freeze({star:a,question:n.question,answerCount:n.answerCount,created:n.created,collected:n.collected,...n.latestPublicAt===void 0?{}:{latestPublicAt:n.latestPublicAt},answers:n.answers,material:e,orbitIndex:n.orbitIndex,index:i.length,u:[s.u[0],s.u[1],s.u[2]],v:[s.v[0],s.v[1],s.v[2]],orbitR:o,phase:hn(t,a.seed),period:mn(o),radius:Se(e.answerDensity)}))}return Object.freeze(i)}function uc(e,t,n,r,i){return new ic(e,t,n,r,i)}export{uc as createRenderer};