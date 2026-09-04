import{c as e}from"./api-vGgttR-j.js";import{C as t,S as n,_ as r,a as i,b as a,c as o,d as s,f as c,g as l,h as u,i as d,l as f,m as p,n as m,o as h,p as g,r as ee,s as _,t as v,u as te,v as y,w as ne,x as b,y as re}from"./babylon-tRotkDBm.js";import{r as x}from"./Universe-CpK9-IiV.js";var ie=[`basalt`,`strata`,`cloud`,`archive`],ae=Math.log1p(30),oe=.35,se=4294967296;function ce(e){return Number.isFinite(e)?Math.min(1,Math.max(0,e)):0}function S(e){return typeof e==`number`&&Number.isFinite(e)&&e>0}function le(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}function ue(e){let t=1/0,n=-1/0;for(let r of e)for(let e of[r.publishedAt,r.updatedAt])S(e)&&(t=Math.min(t,e),n=Math.max(n,e));return Object.freeze(!Number.isFinite(t)||!Number.isFinite(n)?{earliest:null,latest:null,duration:0}:{earliest:t,latest:n,duration:Math.max(0,n-t)})}function de(e,t){let n=le(e.question.id),r=[],i=[],a=!1,o=!1;for(let t of e.answers){S(t.publishedAt)&&(i.push(t.publishedAt),r.push(t.publishedAt)),S(t.updatedAt)&&r.push(t.updatedAt);for(let e of t.bindings)e.relation===`created`&&(a=!0),e.relation===`collected`&&(o=!0)}let s=r.length>0?Math.max(...r):null,c=s===null||t.earliest===null||t.latest===null?oe:t.duration===0?.5:ce((s-t.earliest)/t.duration),l=null;if(i.length>=2){let e=Math.max(...i)-Math.min(...i);l=Number.isFinite(e)?Math.min(2**53-1,Math.max(0,e)):2**53-1}let u=Math.log1p(e.question.answerIds.length)/ae;return Object.freeze({seed:n/se,family:ie[n%ie.length],answerDensity:ce(u),timeSpan:l,freshness:c,divergence:null,created:a,collected:o})}var fe=6400,pe=1.92;function me(e,t){let n=Math.max(0,t);return e<125?-Math.min(1,n/68):Math.min(1,n/62)}function he(e,t){return fe*pe**+me(e,t)}function ge(e){let t=C(e,1e3,4e4)/100,n=t<=66?255:329.698727446*(t-60)**-.1332047592,r=t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*(t-60)**-.0755148492,i=t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307,a=[ve(C(n,0,255)/255),ve(C(r,0,255)/255),ve(C(i,0,255)/255)],o=Math.max(a[0],a[1],a[2])||1;return[a[0]/o,a[1]/o,a[2]/o]}function _e(e,t){return ge(he(e,t))}function ve(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function C(e,t,n){return e<t?t:e>n?n:e}function ye(e){let t=[Math.sin(e*1.7+.4),Math.cos(e*2.3)+.55,Math.sin(e*3.1+1.2)],n=Math.hypot(t[0],t[1],t[2])||1;return[t[0]/n,t[1]/n,t[2]/n]}function be(e,t){let n=Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]);return n<.35?0:Math.min(20+1.9*n**1.5,120)}function xe(e,t,n,r=44){let i=Math.abs(t[1])<.9?[0,1,0]:[1,0,0],a=[t[1]*i[2]-t[2]*i[1],t[2]*i[0]-t[0]*i[2],t[0]*i[1]-t[1]*i[0]],o=Math.hypot(a[0],a[1],a[2])||1;a[0]/=o,a[1]/=o,a[2]/=o;let s=[t[1]*a[2]-t[2]*a[1],t[2]*a[0]-t[0]*a[2],t[0]*a[1]-t[1]*a[0]],c=[];for(let t=0;t<r;t++){let i=t/r*Math.PI*2,o=Math.cos(i)*n,l=Math.sin(i)*n;c.push([e[0]+a[0]*o+s[0]*l,e[1]+a[1]*o+s[1]*l,e[2]+a[2]*o+s[2]*l])}return c}var Se=5200;function Ce(e,t,n,r){let i=e.p[0]-e.center[0],a=e.p[1]-e.center[1],o=e.p[2]-e.center[2],s=e.period===0?0:Math.PI*2/e.period*(t/1e3),c=Math.cos(s),l=Math.sin(s),u=e.axis[0]*i+e.axis[1]*a+e.axis[2]*o,d=e.axis[1]*o-e.axis[2]*a,f=e.axis[2]*i-e.axis[0]*o,p=e.axis[0]*a-e.axis[1]*i,m=Math.sin(t/(6400+e.seed*311%5200)+e.seed)*n;return r.set(e.center[0]+i*c+d*l+e.axis[0]*(u*(1-c)+m),e.center[1]+a*c+f*l+e.axis[1]*(u*(1-c)+m),e.center[2]+o*c+p*l+e.axis[2]*(u*(1-c)+m))}function we(e){let t=e.stars,n=Math.max(1,...t.map(e=>e.n)),r=new Map,i=new Map;for(let t of e.clusters)r.set(t.g,t.c),i.set(t.g,ye(t.g));let a=new Map;[...t].sort((e,t)=>t.pe*Math.log(1+t.n)-e.pe*Math.log(1+e.n)).forEach((e,t)=>a.set(x(e),Se+t*62));let o=Oe(97);return t.map(e=>{let t=r.get(e.g)??[0,0,0],s=i.get(e.g)??[0,1,0],c=e.n/n,l=Te(e.c),[u,d]=Ee(l);return{s:e,p:[e.p[0],e.p[1],e.p[2]],center:t,axis:s,period:be(e.p,t),start:De(o),ignite:a.get(x(e))??0,pointSize:3.4+11*c**.55,bodyR:.3+.95*c**.55,bright:.3+.7*e.pe,burst:e.bu,seed:e.n,rot:o()*Math.PI,color:_e(e.hue,e.sat),kelvin:he(e.hue,e.sat),sysAxis:l,sysU:u,sysV:d}})}function Te(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);let n=Oe(t>>>0),r=[(n()-.5)*1.3,.75+n()*.5,(n()-.5)*1.3],i=Math.hypot(r[0],r[1],r[2])||1;return[r[0]/i,r[1]/i,r[2]/i]}function Ee(e){let t=Math.abs(e[1])<.9?[0,1,0]:[1,0,0],n=[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],r=Math.hypot(n[0],n[1],n[2])||1;return n[0]/=r,n[1]/=r,n[2]/=r,[n,[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]]]}function De(e){let t=e()*Math.PI*2,n=Math.acos(2*e()-1),r=2+e()*5;return[r*Math.sin(n)*Math.cos(t),r*Math.sin(n)*Math.sin(t),r*Math.cos(n)]}function Oe(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}function ke(e,t,n,r){switch(t){case`dark`:return n.dark.some(t=>t.c===e.c)?1:.08;case`nebula`:return n.nebula.some(t=>t.c===e.c)?1:.1;case`worm`:{let t=n.wormholes[r];return t&&(e.g===t.a||e.g===t.b)?1:.11}case`me`:return n.meta.own===0||e.o>0?1:.1;case`solo`:return .12;default:return 1}}function Ae(e,t,n,r){let i=ke(e,t,n,r);return n.dark.some(t=>t.c===e.c)?Math.min(i,.3):i}function je(e,t,n,r){return ke(e,t,n,r)>=.4}function Me(e,t,n,r,i){let a=e.find(({s:e})=>x(e)===t)??null;return a&&je(a.s,n,r,i)?a:null}function Ne(e){if(e)return`low`;let t=navigator.hardwareConcurrency||4,n=navigator.deviceMemory??4;return t<6||n<4?`medium`:`high`}var Pe=class extends Error{code=`webgl2_required`;constructor(){super(`当前设备不支持 WebGL2，无法启动 3D 宇宙。`),this.name=`BabylonWebGL2RequiredError`}},Fe=class{cleanups=[];ports;callbacks;running=!1;requested=!1;suspended=!1;destroyed=!1;readyReported=!1;fatalReported=!1;listenerCount=0;constructor(e,t={}){this.ports=e,this.callbacks=t,e.releaseContext&&this.cleanups.push(e.releaseContext),this.cleanups.push(()=>e.engine.dispose()),this.cleanups.push(()=>e.scene.dispose());try{if(e.engine.webGLVersion<2)throw new Pe;this.listen(`webglcontextlost`,this.onContextLost),this.listen(`webglcontextrestored`,this.onContextRestored)}catch(e){throw this.destroyed=!0,this.disposeAll(),e}}start(){this.destroyed||this.fatalReported||(this.requested=!0,this.startRequestedLoop())}stop(){this.requested=!1,this.stopActiveLoop()}suspend(){this.destroyed||this.suspended||(this.suspended=!0,this.stopActiveLoop())}resume(){this.destroyed||!this.suspended||(this.suspended=!1,this.startRequestedLoop())}resize(){this.destroyed||this.ports.engine.resize()}destroy(){this.destroyed||(this.destroyed=!0,this.requested=!1,this.stopActiveLoop(),this.disposeAll())}diagnostics(){return Object.freeze({renderLoops:+!!this.running,listeners:this.listenerCount})}frame=()=>{if(!(this.destroyed||this.fatalReported))try{this.ports.scene.render(),this.readyReported||(this.readyReported=!0,this.callbacks.onReady?.())}catch(e){this.reportFatal(e)}};onContextLost=e=>{e.preventDefault();let t=Error(`WebGL context lost`);t.name=`WebGLContextLostError`,this.reportFatal(t)};onContextRestored=()=>{!this.destroyed&&!this.fatalReported&&this.resize()};listen(e,t){this.ports.canvas.addEventListener(e,t),this.listenerCount+=1,this.cleanups.push(()=>{this.ports.canvas.removeEventListener(e,t),--this.listenerCount})}startRequestedLoop(){this.running||!this.requested||this.suspended||this.destroyed||this.fatalReported||(this.ports.engine.runRenderLoop(this.frame),this.running=!0)}stopActiveLoop(){this.running&&(this.running=!1,this.ports.engine.stopRenderLoop(this.frame))}reportFatal(e){this.destroyed||this.fatalReported||(this.fatalReported=!0,this.requested=!1,this.stopActiveLoop(),this.callbacks.onError?.(e instanceof Error?e:Error(String(e))))}disposeAll(){for(let e=this.cleanups.length-1;e>=0;--e)try{this.cleanups[e]()}catch{}this.cleanups.length=0}},Ie=1e-6,Le=Math.log1p(30),Re=Math.log1p(3650),w=Object.freeze([[`magma`,1.4],[`desert`,.8],[`rock`,.42],[`tundra`,.2],[`ice`,.06]]);function ze(e,t){let n=Number.isFinite(e)?Math.max(0,e):0,r=Number.isFinite(t)?Math.abs(t):0,i=n/Math.max(r*r,Ie);return Number.isFinite(i)?i:Number.MAX_VALUE}function Be(e){let t=Number.isFinite(e)?Math.max(0,e):0,n={magma:0,desert:0,rock:0,tundra:0,ice:0};if(t>=w[0][1])return n.magma=1,Object.freeze(n);if(t<=w.at(-1)[1])return n.ice=1,Object.freeze(n);for(let e=0;e<w.length-1;e+=1){let[r,i]=w[e],[a,o]=w[e+1];if(t>i||t<o)continue;let s=(t-o)/(i-o),c=s*s*(3-2*s);return n[r]=c,n[a]=1-c,Object.freeze(n)}return n.rock=1,Object.freeze(n)}function Ve(e){let t=E(Math.log1p(Math.max(0,Ue(e.answerCount)))/Le),n=e.timeSpan===null?0:Math.max(0,Ue(e.timeSpan))/86400,r=e.timeSpan===null?0:E(Math.log1p(n)/Re),i=ze(e.normalizedStarEnergy,e.normalizedOrbitDistance);return Object.freeze({metadata:Object.freeze({questionId:e.questionId,starId:e.starId}),seed:He(e.questionId,e.starId),radius:T(.55+.45*t,.55,1),craterCount:Math.round(T(5+43*t,5,48)),detailDensity:E(t),faultStrength:E(r),atmosphere:E(e.freshness),createdGlow:+!!e.created,collectedMarker:+!!e.collected,incident:T(i,0,Number.MAX_VALUE),thermal:Be(i)})}function He(e,t){let n=2166136261;for(let r of`${e}\u0000${t}`)n^=r.codePointAt(0)??0,n=Math.imul(n,16777619);return n>>>0}var Ue=e=>Number.isFinite(e)?e:0,T=(e,t,n)=>Math.min(n,Math.max(t,Ue(e))),E=e=>T(e,0,1),We=.045,Ge=.03,Ke=.22,qe=.16;function Je(e){return Number.isFinite(e)?Math.min(1,Math.max(0,e)):0}function Ye(e,t,n,r,i){if(![e,t,n,r,i].every(Number.isFinite)||e<=0||t<=e||n<=0||n>=Math.PI||r<=0||i<=0)return 0;let a=Math.asin(Math.min(1,e/t)),o=Math.tan(a)*i/Math.tan(n*.5);return Math.min(1,Math.max(0,o/Math.min(r,i)))}function Xe(e,t,n,r,i){return Ye(e,t,n,r,i)*Math.min(r,i)}function Ze(e,t,n){let r=Je(t);return!n&&e===`high`?`medium`:e===`high`?r<qe?`medium`:`high`:e===`medium`?n&&r>=Ke?`high`:r<Ge?`low`:`medium`:r>=We?`medium`:`low`}var Qe=8,$e=40,et=Object.freeze({low:3,medium:5,high:6});function tt(e,t){let n=it(e.craterCount,0,48),r=Math.min(n,Math.min(Qe,Math.max(2,Math.round(n*.16)))),i=rt(e.seed),a=Object.freeze(Array.from({length:r},()=>nt(i))),o=t===`low`?0:n-r;return Object.freeze({octaves:et[t],warpStrength:D(e.detailDensity),ridgeStrength:D(e.faultStrength),largeCraters:a,smallCraterBudget:o,smallCraterThreshold:t===`low`?0:D(o/$e)})}function nt(e){let t=e()*2-1,n=e()*Math.PI*2,r=Math.sqrt(Math.max(0,1-t*t));return Object.freeze({direction:Object.freeze([r*Math.cos(n),t,r*Math.sin(n)]),radius:.07+e()*.11,depth:.025+e()*.055,rim:.012+e()*.028})}function rt(e){let t=e>>>0||2654435769;return()=>(t^=t<<13,t^=t>>>17,t^=t<<5,t>>>=0,t/4294967296)}function it(e,t,n){return Math.round(Math.min(n,Math.max(t,Number.isFinite(e)?e:t)))}function D(e){return Math.min(1,Math.max(0,Number.isFinite(e)?e:0))}var at=`
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
`,ot=`
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
`,st=`
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

void main(void) {
  vec3 magma = vec3(0.78, 0.075, 0.012);
  vec3 desert = vec3(0.76, 0.42, 0.10);
  vec3 rock = vec3(0.31, 0.34, 0.40);
  vec3 tundra = vec3(0.20, 0.46, 0.39);
  vec3 ice = vec3(0.42, 0.70, 0.96);

  float latitude = abs(normalize(vRadial).y);
  float polarMask = smoothstep(mix(0.82, 0.48, uThermalIce), 0.98, latitude);
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
    - vCraterMask * 0.12, 0.78, 1.18);
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
  baseColor = mix(baseColor, vec3(0.12, 0.30, 0.44), uThermalIce * iceFractures * 0.46);
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
  float createdInnerLight = uCreated * pow(max(0.0, vHeight + 0.28), 3.0) * 0.34;
  emissive += vec3(1.10, 0.38, 0.07) * createdInnerLight;

  float markerBand = 1.0 - smoothstep(0.018, 0.04, abs(vRadial.y));
  float markerDash = step(0.54, fract(atan(vRadial.z, vRadial.x) * 3.82 + uSeed * 0.00017));
  vec3 marker = vec3(0.20, 0.46, 0.62) * markerBand * markerDash * uCollected * 0.24;
  float selectionRim = pow(1.0 - NoV, 5.0);
  vec3 selectionFeedback = vec3(0.24, 0.78, 1.15) * selectionRim * uSelected * 0.02;

  gl_FragColor = vec4(surfaceColor + emissive + marker + selectionFeedback, uReveal);
}
`,ct=`
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 worldViewProjection;
uniform float uTime;
uniform float uDisplacement;
uniform float uDetailDensity;
uniform float uFaultStrength;
uniform float uWarpStrength;
uniform float uNormalEpsilon;
uniform float uSmallCraterThreshold;
uniform float uSeed;
uniform int uOctaves;
uniform int uQualityLevel;
uniform int uLargeCraterCount;
uniform vec4 uLargeCraters[8];
uniform vec4 uLargeCraterShape[8];

varying vec3 vLocal;
varying vec3 vWorldPosition;
varying vec3 vRadial;
varying vec3 vWorldRadial;
varying vec3 vNormal;
varying float vHeight;
varying float vRelief;
varying float vRidgeMask;
varying float vCraterMask;

vec3 hashGradient(vec3 cell) {
  vec3 dots = vec3(
    dot(cell, vec3(127.1, 311.7, 74.7)),
    dot(cell, vec3(269.5, 183.3, 246.1)),
    dot(cell, vec3(113.5, 271.9, 124.6))
  );
  return normalize(fract(sin(dots + uSeed * 0.000071) * 43758.5453123) * 2.0 - 1.0);
}

vec3 hashCellPoint(vec3 cell) {
  vec3 dots = vec3(
    dot(cell, vec3(157.1, 319.7, 83.3)),
    dot(cell, vec3(221.7, 137.9, 301.3)),
    dot(cell, vec3(97.7, 251.3, 199.1))
  );
  return fract(sin(dots + uSeed * 0.000113) * 43758.5453123);
}

float hashCellAcceptance(vec3 cell) {
  return fract(sin(dot(cell, vec3(41.7, 289.1, 173.3)) + uSeed * 0.000193) * 24634.6345);
}

float gradientNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  vec3 fade = local * local * (3.0 - 2.0 * local);
  float n000 = dot(hashGradient(cell + vec3(0.0, 0.0, 0.0)), local - vec3(0.0, 0.0, 0.0));
  float n100 = dot(hashGradient(cell + vec3(1.0, 0.0, 0.0)), local - vec3(1.0, 0.0, 0.0));
  float n010 = dot(hashGradient(cell + vec3(0.0, 1.0, 0.0)), local - vec3(0.0, 1.0, 0.0));
  float n110 = dot(hashGradient(cell + vec3(1.0, 1.0, 0.0)), local - vec3(1.0, 1.0, 0.0));
  float n001 = dot(hashGradient(cell + vec3(0.0, 0.0, 1.0)), local - vec3(0.0, 0.0, 1.0));
  float n101 = dot(hashGradient(cell + vec3(1.0, 0.0, 1.0)), local - vec3(1.0, 0.0, 1.0));
  float n011 = dot(hashGradient(cell + vec3(0.0, 1.0, 1.0)), local - vec3(0.0, 1.0, 1.0));
  float n111 = dot(hashGradient(cell + vec3(1.0, 1.0, 1.0)), local - vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, fade.x);
  float nx10 = mix(n010, n110, fade.x);
  float nx01 = mix(n001, n101, fade.x);
  float nx11 = mix(n011, n111, fade.x);
  return mix(mix(nx00, nx10, fade.y), mix(nx01, nx11, fade.y), fade.z) * 0.9 + 0.5;
}

float fbm(vec3 point, int octaveCount) {
  float sum = 0.0;
  float amplitude = 0.53;
  float normalization = 0.0;
  for (int octave = 0; octave < 6; octave++) {
    if (octave >= octaveCount) break;
    sum += gradientNoise(point) * amplitude;
    normalization += amplitude;
    point = point * 2.03 + vec3(17.13, 9.71, 13.57);
    amplitude *= 0.5;
  }
  return sum / max(normalization, 0.0001);
}

vec3 domainWarp(vec3 point) {
  return vec3(
    fbm(point + vec3(11.7, 3.1, 7.9), 3),
    fbm(point + vec3(5.3, 19.1, 2.7), 3),
    fbm(point + vec3(13.1, 8.3, 23.7), 3)
  ) * 2.0 - 1.0;
}

float ridgedNoise(vec3 point, int octaveCount) {
  float sum = 0.0;
  float amplitude = 0.56;
  float normalization = 0.0;
  for (int octave = 0; octave < 6; octave++) {
    if (octave >= octaveCount) break;
    float ridge = 1.0 - abs(gradientNoise(point) * 2.0 - 1.0);
    sum += ridge * ridge * amplitude;
    normalization += amplitude;
    point = point * 2.11 + vec3(7.1, 13.7, 5.9);
    amplitude *= 0.48;
  }
  return sum / max(normalization, 0.0001);
}

float craterProfile(float distanceToCenter, float radius, float depth, float rimHeight) {
  float normalizedDistance = distanceToCenter / max(radius, 0.0001);
  float bowl = 1.0 - smoothstep(0.0, 0.72, normalizedDistance);
  float wall = smoothstep(0.42, 0.82, normalizedDistance)
    * (1.0 - smoothstep(0.82, 1.0, normalizedDistance));
  float rim = 1.0 - smoothstep(0.0, 0.18, abs(normalizedDistance - 1.0));
  return -depth * bowl * bowl + depth * 0.18 * wall + rimHeight * rim;
}

vec2 largeCraterField(vec3 direction) {
  float height = 0.0;
  float mask = 0.0;
  for (int craterIndex = 0; craterIndex < 8; craterIndex++) {
    if (craterIndex >= uLargeCraterCount) break;
    vec4 crater = uLargeCraters[craterIndex];
    vec4 shape = uLargeCraterShape[craterIndex];
    if (crater.w <= 0.0) continue;
    float distanceToCenter = length(direction - normalize(crater.xyz));
    float profile = craterProfile(distanceToCenter, crater.w, shape.x, shape.y);
    height += profile;
    mask = max(mask, 1.0 - smoothstep(crater.w * 0.35, crater.w * 1.18, distanceToCenter));
  }
  return vec2(height, mask);
}

vec2 smallCraterFieldScale(vec3 direction, float frequency) {
  vec3 samplePosition = direction * frequency;
  vec3 centerCell = floor(samplePosition);
  float height = 0.0;
  float mask = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 cell = centerCell + vec3(float(x), float(y), float(z));
        float accepted = step(uSmallCraterThreshold, hashCellAcceptance(cell));
        vec3 candidate = normalize(cell + hashCellPoint(cell));
        float radius = mix(0.34, 0.58, hashCellPoint(cell + 5.17).x) / frequency;
        float distanceToCenter = length(direction - candidate);
        float localMask = (1.0 - smoothstep(radius * 0.35, radius * 1.2, distanceToCenter)) * accepted;
        height += craterProfile(distanceToCenter, radius, radius * 0.12, radius * 0.045) * accepted;
        mask = max(mask, localMask);
      }
    }
  }
  return vec2(height, mask);
}

vec2 smallCraterField(vec3 direction) {
  if (uQualityLevel <= 0) return vec2(0.0);
  vec2 field = smallCraterFieldScale(direction, mix(18.0, 28.0, uDetailDensity));
  if (uQualityLevel >= 2) field += smallCraterFieldScale(direction, mix(37.0, 53.0, uDetailDensity));
  return field;
}

vec4 terrainSample(vec3 direction) {
  vec3 warped = direction + domainWarp(direction * 1.7) * uWarpStrength;
  float continents = fbm(warped * 2.1, uOctaves);
  float mountainMask = smoothstep(0.48, 0.72, continents);
  float ridges = ridgedNoise(warped * 5.4, uOctaves) * mountainMask * uFaultStrength;
  float fineDetail = (gradientNoise(warped * mix(11.0, 23.0, uDetailDensity)) - 0.5)
    * mix(0.028, 0.085, uDetailDensity);
  vec2 largeCraters = largeCraterField(direction);
  vec2 smallCraters = smallCraterField(direction);
  float height = (continents - 0.48) * 0.72 + ridges * 0.28 + fineDetail
    + largeCraters.x + smallCraters.x;
  return vec4(height, ridges * mountainMask, largeCraters.y, smallCraters.y);
}

float terrainHeight(vec3 direction) {
  return terrainSample(direction).x;
}

vec3 displacedNormal(vec3 radial) {
  vec3 tangent = normalize(abs(radial.y) < 0.95
    ? cross(radial, vec3(0.0, 1.0, 0.0))
    : cross(radial, vec3(1.0, 0.0, 0.0)));
  vec3 bitangent = normalize(cross(radial, tangent));
  float epsilon = max(uNormalEpsilon, 0.0001);
  vec3 a = normalize(radial + tangent * epsilon);
  vec3 b = normalize(radial - tangent * epsilon);
  vec3 c = normalize(radial + bitangent * epsilon);
  vec3 d = normalize(radial - bitangent * epsilon);
  vec3 dpT = a * (1.0 + terrainHeight(a) * uDisplacement)
    - b * (1.0 + terrainHeight(b) * uDisplacement);
  vec3 dpB = c * (1.0 + terrainHeight(c) * uDisplacement)
    - d * (1.0 + terrainHeight(d) * uDisplacement);
  return normalize(cross(dpT, dpB));
}

void main(void) {
  vec3 radial = normalize(normal);
  vec4 terrain = terrainSample(radial);
  vec3 displaced = position + normal * terrain.x * uDisplacement;
  vec3 localNormal = displacedNormal(radial);
  vec4 worldPosition = world * vec4(displaced, 1.0);
  vLocal = displaced;
  vWorldPosition = worldPosition.xyz;
  vRadial = radial;
  vWorldRadial = normalize(mat3(world) * radial);
  vNormal = normalize(mat3(world) * localNormal);
  vHeight = terrain.x;
  // A compact, high-frequency material signal. It is deliberately separate
  // from displacement so small strata remain readable without distorting the
  // silhouette or the stellar terminator.
  vRelief = gradientNoise(radial * mix(14.0, 24.0, uDetailDensity)) - 0.5;
  vRidgeMask = clamp(terrain.y, 0.0, 1.0);
  vCraterMask = clamp(max(terrain.z, terrain.w), 0.0, 1.0);
  gl_Position = worldViewProjection * vec4(displaced, 1.0);
}
`,lt=`world.worldViewProjection.uTime.uDisplacement.uDetailDensity.uFaultStrength.uWarpStrength.uNormalEpsilon.uSmallCraterThreshold.uSeed.uOctaves.uQualityLevel.uLargeCraterCount.uLargeCraters.uLargeCraterShape.uThermal.uThermalIce.uFreshness.uCreated.uCollected.uSelected.uCraterDensity.uIncident.uReveal.uLightDirection.uCameraPosition`.split(`.`),ut=[`world`,`worldViewProjection`,`uPlanetCenter`,`uCameraPosition`,`uLightDirection`,`uRayleighColor`,`uShellRadius`,`uDensity`,`uReveal`,`uQualityLevel`],dt=Object.freeze({low:0,medium:1,high:2}),ft=class{descriptor;radius;orbitMesh;atmosphereMesh;atmosphereMaterial;focusMesh=null;scene;parent;onError;onMeshesChanged;compileSurface;compileAtmosphere;orbitMaterial;focusMaterial=null;focusAtmosphereMesh=null;focusAtmosphereMaterial=null;level;focusBlend=0;reveal=0;visible=!0;selected=!1;atmosphereFallback=!1;highUnavailable=!1;disposed=!1;lightScratch=new n;constructor(e){this.scene=e.scene,this.parent=e.parent,this.descriptor=e.descriptor,this.radius=e.descriptor.radius*(e.radiusScale??.38),this.onError=e.onError,this.onMeshesChanged=e.onMeshesChanged,this.compileSurface=e.compileSurface??((e,t,n)=>e.forceCompilationAsync(n)),this.compileAtmosphere=e.compileAtmosphere??((e,t)=>e.forceCompilationAsync(t)),this.level=e.initialLod??`medium`,this.orbitMesh=this.createSurfaceMesh(`orbit`,this.level),this.orbitMaterial=this.orbitMesh.material;let t=this.createAtmosphere(`orbit`);this.atmosphereMesh=t.mesh,this.atmosphereMaterial=t.material,this.applyPresentation()}get activeMesh(){return this.focusMesh&&this.focusBlend>=.5?this.focusMesh:this.orbitMesh}get minimumFocusRadiusMultiplier(){return this.highUnavailable?4.2:2.2}get surfaceMaterial(){return this.activeMesh.material}get meshes(){return[this.orbitMesh,this.atmosphereMesh,this.focusMesh,this.focusAtmosphereMesh].filter(e=>e!==null)}setPosition(e){for(let t of this.meshes)t.position.copyFrom(e)}focusTarget(){let e=this.activeMesh.position;return{x:e.x,y:e.y,z:e.z}}setVisible(e){this.visible=e,this.applyPresentation()}setReveal(e){this.reveal=mt(e),this.applyReveal()}setSelected(e){this.selected=e,this.level!==`lambert`&&this.orbitMaterial.setFloat(`uSelected`,+!!e),this.focusMaterial?.setFloat(`uSelected`,+!!e)}setFocusBlend(e){this.focusBlend=mt(e),this.applyPresentation()}setLod(e){this.disposed||this.level!==`lambert`&&(e===`high`?(this.ensureFocusResources(),this.level=`high`):(this.level=e,this.configureSurfaceMaterial(this.orbitMaterial,e),this.disposeFocusResources()),this.applyPresentation(),this.onMeshesChanged?.(this))}async ensureLod(e){let t=e===`high`&&this.highUnavailable?`medium`:e,n=t===`high`?[`high`,`medium`,`low`]:t===`medium`?[`medium`,`low`]:[`low`];for(let e of n)try{this.setLod(e);let t=e===`high`?this.focusMesh:this.orbitMesh;if(!t?.material)throw Error(`Planet ${e} surface was not created`);if(await this.compileSurface(t.material,e,t),e===`high`&&this.focusAtmosphereMesh?.material&&!this.atmosphereFallback)try{await this.compileAtmosphere(this.focusAtmosphereMesh.material,this.focusAtmosphereMesh)}catch(e){this.atmosphereFallback=!0,this.atmosphereMesh.setEnabled(!1),this.focusAtmosphereMesh.setEnabled(!1),this.report(e)}return}catch(t){e===`high`&&(this.highUnavailable=!0),this.report(t)}this.installLambertFallback()}async ensureAtmosphere(){try{await this.compileAtmosphere(this.atmosphereMaterial,this.atmosphereMesh)}catch(e){this.atmosphereFallback=!0,this.atmosphereMesh.setEnabled(!1),this.focusAtmosphereMesh?.setEnabled(!1),this.report(e)}}update(e){if(!this.visible||!this.activeMesh.isEnabled()||this.disposed||this.scene.frustumPlanes.length>0&&!this.activeMesh.isInFrustum(this.scene.frustumPlanes))return!1;let t=e.focused,n=this.level===`lambert`?`lambert`:Ze(this.level,e.coverage,t);n!==`lambert`&&n!==this.level&&this.ensureLod(n),this.lightScratch.copyFrom(e.starPosition).subtractInPlace(this.activeMesh.position),this.lightScratch.lengthSquared()<1e-8?this.lightScratch.set(0,1,0):this.lightScratch.normalize();let r=this.level===`lambert`?[]:[this.orbitMaterial,this.focusMaterial];for(let t of r)t?.setFloat(`uTime`,pt(e.elapsedMs)),t?.setVector3(`uLightDirection`,this.lightScratch),t?.setVector3(`uCameraPosition`,e.cameraPosition);for(let t of[this.atmosphereMaterial,this.focusAtmosphereMaterial])t?.setVector3(`uPlanetCenter`,this.activeMesh.position),t?.setVector3(`uLightDirection`,this.lightScratch),t?.setVector3(`uCameraPosition`,e.cameraPosition);return!0}rotate(e,t){if(!Number.isFinite(e)||!Number.isFinite(t))return;let r=b.RotationAxis(n.Up(),e),i=b.RotationAxis(n.Right(),t);for(let e of this.meshes)e.rotationQuaternion||=b.FromEulerAngles(e.rotation.x,e.rotation.y,e.rotation.z),e.rotationQuaternion=r.multiply(i).multiply(e.rotationQuaternion)}diagnostics(){let e=this.activeMesh.rotationQuaternion??b.Identity();return Object.freeze({surfaceLevel:this.level,surfaceFallback:this.level===`lambert`,atmosphereFallback:this.atmosphereFallback,rotation:Object.freeze([e.x,e.y,e.z,e.w]),thermalDominant:Object.entries(this.descriptor.thermal).reduce((e,t)=>t[1]>e[1]?t:e)[0],highFrequencyDetail:this.level===`high`&&this.focusMesh?.isEnabled()===!0&&this.focusMaterial?.isReady(this.focusMesh)===!0})}dispose(){this.disposed||(this.disposed=!0,this.disposeFocusResources(),this.orbitMesh.dispose(!1,!0),this.atmosphereMesh.dispose(!1,!0))}createSurfaceMesh(e,t){let n=o(`planet:${this.descriptor.metadata.questionId}:${e}`,{radius:1,subdivisions:t===`high`?12:t===`medium`?6:3,flat:!1},this.scene);return n.parent=this.parent??null,n.scaling.setAll(this.radius),n.isPickable=!0,n.metadata={...this.descriptor.metadata},n.material=this.createSurfaceMaterial(`${n.name}:material`,t),n}createSurfaceMaterial(e,t){let n=new _(e,this.scene,{vertexSource:ct,fragmentSource:st},{attributes:[`position`,`normal`],uniforms:[...lt],needAlphaBlending:!0});return n.backFaceCulling=!0,this.configureSurfaceMaterial(n,t),n}configureSurfaceMaterial(e,n){let r=tt(this.descriptor,n);e.setFloat(`uTime`,0),e.setFloat(`uDisplacement`,.045+this.descriptor.detailDensity*.08),e.setFloat(`uDetailDensity`,this.descriptor.detailDensity),e.setFloat(`uFaultStrength`,this.descriptor.faultStrength),e.setFloat(`uWarpStrength`,r.warpStrength),e.setFloat(`uNormalEpsilon`,n===`high`?.006:.012),e.setFloat(`uSmallCraterThreshold`,r.smallCraterThreshold),e.setInt(`uOctaves`,r.octaves),e.setInt(`uQualityLevel`,dt[n]),e.setInt(`uLargeCraterCount`,r.largeCraters.length);let i=r.largeCraters.flatMap(({direction:e,radius:t})=>[...e,t]),a=r.largeCraters.flatMap(({depth:e,rim:t})=>[e,t,0,0]);for(;i.length<32;)i.push(0);for(;a.length<32;)a.push(0);e.setArray4(`uLargeCraters`,i),e.setArray4(`uLargeCraterShape`,a),e.setVector4(`uThermal`,new t(this.descriptor.thermal.magma,this.descriptor.thermal.desert,this.descriptor.thermal.rock,this.descriptor.thermal.tundra)),e.setFloat(`uThermalIce`,this.descriptor.thermal.ice),e.setFloat(`uFreshness`,this.descriptor.atmosphere),e.setFloat(`uCreated`,this.descriptor.createdGlow),e.setFloat(`uCollected`,this.descriptor.collectedMarker),e.setFloat(`uSelected`,+!!this.selected),e.setFloat(`uSeed`,this.descriptor.seed),e.setFloat(`uCraterDensity`,this.descriptor.craterCount/48),e.setFloat(`uIncident`,this.descriptor.incident),e.setFloat(`uReveal`,0)}createAtmosphere(e){let t=o(`planet:${this.descriptor.metadata.questionId}:${e}:atmosphere`,{radius:1,subdivisions:e===`focus`?5:3,flat:!1},this.scene);t.parent=this.parent??null;let n=this.radius*(1.095+this.descriptor.atmosphere*.025);t.scaling.setAll(n),t.isPickable=!1,t.metadata={...this.descriptor.metadata};let r=new _(`${t.name}:material`,this.scene,{vertexSource:ot,fragmentSource:at},{attributes:[`position`,`normal`],uniforms:[...ut],needAlphaBlending:!0});return r.backFaceCulling=!1,r.disableDepthWrite=!0,r.setColor3(`uRayleighColor`,new y(.24,.48,.82)),r.setFloat(`uShellRadius`,n),r.setFloat(`uDensity`,.2+this.descriptor.atmosphere*.22),r.setFloat(`uReveal`,0),r.setInt(`uQualityLevel`,e===`focus`?2:dt[this.level===`lambert`?`low`:this.level]),t.material=r,{mesh:t,material:r}}ensureFocusResources(){if(this.focusMesh)return;this.focusMesh=this.createSurfaceMesh(`focus`,`high`),this.focusMesh.position.copyFrom(this.orbitMesh.position),this.focusMaterial=this.focusMesh.material;let e=this.createAtmosphere(`focus`);this.focusAtmosphereMesh=e.mesh,this.focusAtmosphereMesh.position.copyFrom(this.orbitMesh.position),this.focusAtmosphereMaterial=e.material,this.onMeshesChanged?.(this)}disposeFocusResources(){this.focusMesh?.dispose(!1,!0),this.focusAtmosphereMesh?.dispose(!1,!0),this.focusMesh=null,this.focusMaterial=null,this.focusAtmosphereMesh=null,this.focusAtmosphereMaterial=null}installLambertFallback(){this.disposeFocusResources();let e=new d(`planet:${this.descriptor.metadata.questionId}:lambert`,this.scene),t=this.descriptor.thermal;e.diffuseColor=new y(t.magma*.48+t.desert*.62+t.rock*.22+t.tundra*.24+t.ice*.52,t.magma*.045+t.desert*.29+t.rock*.25+t.tundra*.34+t.ice*.72,t.magma*.008+t.desert*.075+t.rock*.28+t.tundra*.37+t.ice*.86),e.specularColor=y.Black(),this.orbitMesh.material?.dispose(),this.orbitMesh.material=e,this.level=`lambert`,this.applyPresentation()}applyPresentation(){let e=this.visible&&!!this.focusMesh&&this.focusBlend>0,t=this.visible&&(!this.focusMesh||this.focusBlend<1);this.orbitMesh.setEnabled(t),this.orbitMesh.isPickable=t,this.atmosphereMesh.setEnabled(t&&!this.atmosphereFallback),this.focusMesh&&(this.focusMesh.setEnabled(e),this.focusMesh.isPickable=e),this.focusAtmosphereMesh?.setEnabled(e&&!this.atmosphereFallback),this.applyReveal()}applyReveal(){this.level!==`lambert`&&this.orbitMaterial.setFloat(`uReveal`,this.reveal*(1-this.focusBlend)),this.atmosphereMaterial.setFloat(`uReveal`,this.reveal*(1-this.focusBlend)),this.focusMaterial?.setFloat(`uReveal`,this.reveal*this.focusBlend),this.focusAtmosphereMaterial?.setFloat(`uReveal`,this.reveal*this.focusBlend)}report(e){this.onError?.(e instanceof Error?e:Error(String(e)))}},pt=e=>Number.isFinite(e)?e:0,mt=e=>Math.min(1,Math.max(0,pt(e))),O=e=>({target:{...e.target},radius:e.radius}),k=(e,t,n)=>e+(t-e)*n,ht=(e,t,n)=>({target:{x:k(e.target.x,t.target.x,n),y:k(e.target.y,t.target.y,n),z:k(e.target.z,t.target.z,n)},radius:k(e.radius,t.radius,n)}),gt=class{state=`idle`;camera;onExit;visual=null;returnPose=null;transitionFrom=null;transitionTo=null;transitionElapsed=0;blendFrom=0;blendTo=0;blend=0;reducedMotion;exitNotified=!1;yawVelocity=0;pitchVelocity=0;transitionMs;focusRadiusMultiplier;minRadiusMultiplier;maxRadiusMultiplier;pointerRadiansPerPixel;keyboardStep;wheelSensitivity;constructor(e,t,n={}){this.camera=e,this.onExit=t,this.reducedMotion=n.reducedMotion??!1,this.transitionMs=Math.max(1,n.transitionMs??420),this.focusRadiusMultiplier=n.focusRadiusMultiplier??4,this.minRadiusMultiplier=n.minRadiusMultiplier??2.2,this.maxRadiusMultiplier=n.maxRadiusMultiplier??8,this.pointerRadiansPerPixel=n.pointerRadiansPerPixel??.005,this.keyboardStep=n.keyboardStep??.08,this.wheelSensitivity=n.wheelSensitivity??.001}enter(e){this.state===`idle`&&(this.returnPose=O(this.camera.readPose())),this.visual=e,this.exitNotified=!1,this.clearRotationInertia();let t=this.clampRadius(e.radius*this.focusRadiusMultiplier);this.beginTransition(`entering`,{target:{...e.focusTarget()},radius:t},1)}exit(){this.state===`idle`||!this.visual||!this.returnPose||(this.clearRotationInertia(),this.beginTransition(`exiting`,this.returnPose,0))}suspend(e=!0){this.state!==`idle`&&(this.clearRotationInertia(),e&&this.returnPose&&this.camera.writePose(O(this.returnPose)),this.visual&&this.visual.setFocusBlend(0),this.finishExit())}setReducedMotion(e){this.reducedMotion=e,this.camera.stopInertia(),this.clearRotationInertia(),e&&(this.state===`entering`||this.state===`exiting`)&&this.finishTransition()}update(e){if((this.state===`entering`||this.state===`exiting`)&&Number.isFinite(e)&&e>0){this.transitionElapsed+=e;let t=Math.min(1,this.transitionElapsed/this.transitionMs);this.applyTransition(t),t>=1&&this.finishTransition()}if(this.state===`focused`&&!this.reducedMotion&&this.visual&&(Math.abs(this.yawVelocity)>1e-4||Math.abs(this.pitchVelocity)>1e-4)){let t=Math.max(0,Math.min(4,e/16));this.visual.rotate(this.yawVelocity*t,this.pitchVelocity*t);let n=.84**t;this.yawVelocity*=n,this.pitchVelocity*=n}}drag(e,t){if(this.state!==`focused`||!this.visual||!Number.isFinite(e)||!Number.isFinite(t))return!1;let n=-e*this.pointerRadiansPerPixel,r=-t*this.pointerRadiansPerPixel;return this.visual.rotate(n,r),this.reducedMotion||(this.yawVelocity=n,this.pitchVelocity=r),!0}wheel(e){if(this.state!==`focused`||!Number.isFinite(e))return!1;let t=this.camera.readPose(),n=this.clampRadius(t.radius*Math.exp(e*this.wheelSensitivity));return e>0&&n<=t.radius+1e-6?!1:(this.camera.writePose({...t,radius:n}),!0)}pinch(e){if(this.state!==`focused`||!Number.isFinite(e)||e<=0)return!1;let t=this.camera.readPose();return this.camera.writePose({...t,radius:this.clampRadius(t.radius/e)}),!0}keyDown(e){if(e===`Escape`)return this.state!==`idle`&&(this.exitNotified||(this.exitNotified=!0,this.exit(),this.onExit()),!0);if(this.state!==`focused`||!this.visual)return!1;let t=e.toLowerCase(),n={arrowleft:[-this.keyboardStep,0],a:[-this.keyboardStep,0],arrowright:[this.keyboardStep,0],d:[this.keyboardStep,0],arrowup:[0,this.keyboardStep],w:[0,this.keyboardStep],arrowdown:[0,-this.keyboardStep],s:[0,-this.keyboardStep]}[t];return n?(this.visual.rotate(n[0],n[1]),!0):!1}beginTransition(e,t,n){this.state=e,this.transitionFrom=O(this.camera.readPose()),this.transitionTo=O(t),this.transitionElapsed=0,this.blendFrom=this.blend,this.blendTo=n,this.reducedMotion&&this.finishTransition()}applyTransition(e){!this.transitionFrom||!this.transitionTo||!this.visual||(this.camera.writePose(ht(this.transitionFrom,this.transitionTo,e)),this.blend=k(this.blendFrom,this.blendTo,e),this.visual.setFocusBlend(this.blend))}finishTransition(){if(this.applyTransition(1),this.state===`entering`){this.state=`focused`;return}this.state===`exiting`&&this.finishExit()}finishExit(){this.state=`idle`,this.visual=null,this.returnPose=null,this.transitionFrom=null,this.transitionTo=null,this.transitionElapsed=0,this.blend=0}clampRadius(e){let t=Number.isFinite(this.visual?.radius)&&this.visual.radius>0?this.visual.radius:1,n=this.visual?.minimumFocusRadiusMultiplier,r=Number.isFinite(n)&&n>0?Math.max(this.minRadiusMultiplier,n):this.minRadiusMultiplier;return Math.min(t*this.maxRadiusMultiplier,Math.max(t*r,e))}clearRotationInertia(){this.yawVelocity=0,this.pitchVelocity=0,this.camera.stopInertia()}},_t=5,vt=4.8,yt=.9,bt=1.8,xt=1.15,St=.82,A=Math.PI*.18000000000000005;function j(e){let t=Math.hypot(e.x,e.z)||1;return Object.freeze({wallArc:St,wallRotationY:0,openingDirection:Object.freeze({x:P(Math.cos(A)),z:P(Math.sin(A))}),tunnelDirection:Object.freeze({x:P(e.x/t),z:P(e.z/t)})})}function Ct(e,t){let n=F(t);if(e.evidenceLevel===`surface-only`)return Object.freeze({evidenceLevel:e.evidenceLevel,entryPose:n,bounds:Object.freeze({minDepth:0,maxDepth:_t,radius:vt}),layers:Object.freeze([]),specimens:Object.freeze(e.surfaceSpecimens.map((t,n)=>M(t,n,e.surfaceSpecimens.length,2.35,`surface`))),undatedRoom:null,blockedDepth:!0});let r=Math.max(2.4,Math.min(e.bounds.bottom-1,e.bounds.bottom*.58)),i=Math.PI/2-A,a=6.949999999999999,o=e.undated.length>0?Object.freeze({centerDepth:r,angle:i,x:P(Math.sin(i)*a),z:P(Math.cos(i)*a),radius:2.2,openArc:.72}):null,s=e.strata.map((e,t)=>Object.freeze({id:e.id,centerDepth:e.centerDepth,thickness:e.thickness,colorIndex:t%4,openingAngle:o&&Math.abs(e.centerDepth-o.centerDepth)<=e.thickness/2?o.angle:null})),c=e.strata.flatMap(e=>e.specimens.map((t,n)=>M(t,n,e.specimens.length,Ot(t,e),`main`))),l=e.undated.map((t,n)=>M(t,n,e.undated.length,r,`undated`,o));return Object.freeze({evidenceLevel:e.evidenceLevel,entryPose:n,bounds:Object.freeze({minDepth:e.bounds.top,maxDepth:e.bounds.bottom,radius:vt}),layers:Object.freeze(s),specimens:Object.freeze([...c,...l]),undatedRoom:o,blockedDepth:!1})}function wt(e,t,n,r){let i=N(n,0,.1),a=N(t.forward,-1,1),o=N(t.yaw,-1,1),s=N(t.pitch,-1,1),c=e.snapId?7:11;return Tt({depth:N(e.depth+a*c*i,r.bounds.minDepth,r.bounds.maxDepth),yaw:At(e.yaw+o*1.8*i),pitch:N(e.pitch+s*1.4*i,-1.15,xt),snapId:e.snapId},r)}function Tt(e,t){if(t.evidenceLevel!==`retrospective`||t.layers.length===0)return F({...e,snapId:null});if(e.snapId){let n=t.layers.find(({id:t})=>t===e.snapId);if(n&&Math.abs(e.depth-n.centerDepth)<=bt)return F({...e,snapId:n.id})}let n=t.layers.reduce((t,n)=>t?Math.abs(n.centerDepth-e.depth)<Math.abs(t.centerDepth-e.depth)?n:t:n,null);return n&&Math.abs(n.centerDepth-e.depth)<=yt?F({...e,depth:n.centerDepth,snapId:n.id}):F({...e,snapId:null})}function Et(e,t){return Object.freeze({answerId:t.answerId,savedPose:F(e),pose:F({depth:t.depth,yaw:At(Math.atan2(t.x,t.z)-.28),pitch:N((t.depth-e.depth)*.045,-.35,.35),snapId:e.snapId})})}function Dt(e){return e?F(e.savedPose):null}function M(e,t,n,r,i,a=null){let o=jt(e.answerId),s=(n<=1?0:t/n*Math.PI*2)+(i===`undated`?Math.PI*.38:0)+((o&255)/255-.5)*.26,c=i===`undated`?.85:3.85+(o>>>8&255)/255*.4,l=i===`undated`?a?.x??0:0,u=i===`undated`?a?.z??0:0;return Object.freeze({answerId:e.answerId,depth:P(i===`main`?r:r+((o>>>16&255)/255-.5)*.72),x:P(l+Math.sin(s)*c),z:P(u+Math.cos(s)*c),scale:P(.22+(o>>>24&255)/255*.18),room:i,relations:e.relations})}function Ot(e,t){let n=Math.max(1,t.endPublishedAt-t.startPublishedAt),r=N(((e.publishedAt??t.startPublishedAt)-t.startPublishedAt)/n,0,1),i=Math.min(.6,t.thickness*.12),a=Math.max(.5,t.thickness-i*2);return P(t.centerDepth+a/2-r*a)}function kt(e,t){return e===null||!Number.isFinite(e)||!Number.isFinite(t)?1/60:N((t-e)/1e3,1/240,.1)}var N=(e,t,n)=>Math.min(n,Math.max(t,Number.isFinite(e)?e:0)),P=e=>Math.round(e*1e6)/1e6;function At(e){let t=(e+Math.PI)%(Math.PI*2);return(t<0?t+Math.PI*2:t)-Math.PI}function F(e){return Object.freeze({depth:e.depth,yaw:e.yaw,pitch:e.pitch,snapId:e.snapId})}function jt(e){let t=2166136261;for(let n=0;n<e.length;n+=1)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}var Mt=class{port;callbacks;active=null;cancelAnimation=null;nextGeneration=1;constructor(e,t={}){this.port=e,this.callbacks=t}get layout(){return this.active?.layout??null}get pose(){return this.active?I(this.active.pose):null}get token(){return this.active?.request.token??null}get questionId(){return this.active?.request.questionId??null}get phase(){return this.active?.phase??null}enter(e){if(this.active?.request.token===e.token)return;let t=this.active?.layout.entryPose??null;this.cancelCurrentAnimation(),t&&(this.port.setUniverseVisible(!0),this.port.applyPose(t));let n=this.nextGeneration++,r=t??this.port.capturePose(),i=Ct(e.scene,r),a=I({depth:i.bounds.minDepth,yaw:r.yaw,pitch:r.pitch,snapId:null});this.active={request:e,layout:i,pose:a,focus:null,phase:`surface-approach`,generation:n},this.emitPhase(`surface-approach`),this.runAnimation(`surface-approach`,n,()=>this.beginCrossing(n))}move(e,t){let n=this.active;if(!n||n.phase!==`strata-free`&&n.phase!==`strata-snapped`||n.focus)return;let r=n.pose.snapId;n.pose=wt(n.pose,e,t,n.layout),this.port.applyPose(n.pose),n.pose.snapId!==r&&(n.phase=n.pose.snapId?`strata-snapped`:`strata-free`,this.emitPhase(n.phase)),this.emitPose()}focusAnswer(e){let t=this.active;if(!t||t.phase!==`strata-free`&&t.phase!==`strata-snapped`||t.focus)return;let n=t.layout.specimens.find(t=>t.answerId===e);if(!n){this.emitError(Nt(`答案标本不存在：${e}`),`operation`);return}t.focus=Et(t.pose,n),t.pose=t.focus.pose,this.port.applyPose(t.pose),this.callbacks.onAnswerSpecimenFocus?.({token:t.request.token,questionId:t.request.questionId,answerId:e,pose:I(t.focus.savedPose)})}closeAnswer(){let e=this.active;if(!e)return;let t=Dt(e.focus);t&&(e.focus=null,e.pose=t,this.port.applyPose(t),this.emitPose())}exit(e){let t=this.active;if(!t||t.request.token!==e||t.phase===`exit`)return;this.cancelCurrentAnimation(),t.phase=`exit`,t.focus=null;let n=t.generation;this.runAnimation(`exit`,n,()=>{let e=this.current(n);if(!e)return;this.port.setUniverseVisible(!0),this.port.applyPose(e.layout.entryPose);let t={token:e.request.token,questionId:e.request.questionId};this.active=null,this.cancelAnimation=null,this.callbacks.onStrataExited?.(t)})}destroy(){this.cancelCurrentAnimation(),this.active=null,this.nextGeneration+=1}beginCrossing(e){let t=this.current(e);t&&(t.phase=`surface-crossing`,this.emitPhase(`surface-crossing`),this.runAnimation(`surface-crossing`,e,()=>this.finishEntry(e)))}finishEntry(e){let t=this.current(e);if(!t)return;this.port.setUniverseVisible(!1),t.phase=`strata-free`,t.pose=I({depth:Math.min(1.2,t.layout.bounds.maxDepth),yaw:0,pitch:-.18,snapId:null}),this.port.applyPose(t.pose);let n={token:t.request.token,questionId:t.request.questionId};this.callbacks.onStrataEntered?.(n),this.emitPhase(`strata-free`),this.emitPose()}runAnimation(e,t,n){let r=this.current(t);if(!r)return;let i=r.request.token;this.cancelAnimation=this.port.animate(e,i,()=>{this.current(t)&&(this.cancelAnimation=null,n())},e=>{let n=this.current(t);n&&(this.cancelAnimation=null,this.emitError(e,`transition`),this.port.setUniverseVisible(!0),this.port.applyPose(n.layout.entryPose),this.active=null)})}current(e){return this.active?.generation===e?this.active:null}cancelCurrentAnimation(){this.cancelAnimation?.(),this.cancelAnimation=null}emitPhase(e){let t=this.active;t&&this.callbacks.onStrataPhase?.(e===`strata-snapped`?{token:t.request.token,questionId:t.request.questionId,phase:e,snapId:t.pose.snapId}:{token:t.request.token,questionId:t.request.questionId,phase:e})}emitPose(){let e=this.active;e&&this.callbacks.onStrataPose?.({questionId:e.request.questionId,pose:I(e.pose)})}emitError(e,t){let n=this.active;n&&this.callbacks.onStrataError?.({token:n.request.token,questionId:n.request.questionId,scope:t,cause:e})}};function Nt(e){let t=Error(e);return t.name=`StrataOperationError`,t}function I(e){return Object.freeze({depth:e.depth,yaw:e.yaw,pitch:e.pitch,snapId:e.snapId})}function L(e){let t=z(R(e.bright,.5),0,2),n=z(R(e.burst,0),0,1),r=z(2+Math.log1p(t*3)*2.15,2,7);return Object.freeze({color:Pt(e.color),luminance:z(.72+Math.log1p(t*4),.72,2.4),panoramaCorePx:r,panoramaHaloPx:z(r*(2.5+n*1.5),6,28),coronaScale:2.5+n*1.5,surfaceActivity:n,seed:Math.abs(Math.trunc(R(e.seed,1)))})}function Pt(e){return Object.freeze([z(R(e[0],1),0,1),z(R(e[1],1),0,1),z(R(e[2],1),0,1)])}function R(e,t){return Number.isFinite(e)?e:t}function z(e,t,n){return Math.min(n,Math.max(t,e))}function Ft(e,t){if(e.capturedByHigherPriority)return null;let n=e.inputKind===`mouse`,r=n?10:22,i=n?28:36,a=null,o=1/0;for(let n=0;n<t.length;n+=1){let s=t[n];if(!s||!Rt(s,e.viewport.width,e.viewport.height))continue;let c=Ut(s.visualRadiusPx,r,i),l=e.x-s.x,u=e.y-s.y,d=l*l+u*u;d>c*c||(!a||d<o||d===o&&It(s,a))&&(a=s,o=d)}return a}function It(e,t){return e.depth===t.depth?Lt(e.starKey,t.starKey)<0:e.depth<t.depth}function Lt(e,t){return e<t?-1:+(e>t)}function Rt(e,t,n){return e.visible&&Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.depth)&&Number.isFinite(e.visualRadiusPx)&&e.x>=0&&e.x<=t&&e.y>=0&&e.y<=n&&e.depth>=0&&e.depth<=1}var zt=class{prepared;candidates;world=Bt();constructor(e){this.prepared=e.map(e=>({datum:e,starKey:x(e.s),visual:L(e)})),this.candidates=this.prepared.map(({starKey:e,visual:t})=>({starKey:e,x:0,y:0,depth:0,visualRadiusPx:t.panoramaHaloPx,visible:!1}))}update(e,t,n){for(let r=0;r<this.prepared.length;r+=1){let i=this.prepared[r],a=this.candidates[r];if(!i||!a)continue;Ce(i.datum,e,t,this.world);let o=n(this.world,i.datum,i.visual);a.x=o.x,a.y=o.y,a.depth=o.depth,a.visible=o.visible}return this.candidates}};function Bt(){return{x:0,y:0,z:0,set(e,t,n){return this.x=e,this.y=t,this.z=n,this}}}var Vt={activePointerId:null,inputKind:null,origin:null,lastPoint:null,accumulatedMovement:0,pressedStarKey:null,cancelled:!1,multiPointerInvalidated:!1},Ht=class{state=Vt;downPointerIds=new Set;snapshot(){return this.state}pointerDown(e){if(this.downPointerIds.has(e.pointerId))return;if(this.downPointerIds.size>0){this.downPointerIds.add(e.pointerId),this.invalidateForMultiplePointers();return}this.downPointerIds.add(e.pointerId);let t={x:e.x,y:e.y};this.state={activePointerId:e.pointerId,inputKind:e.inputKind,origin:t,lastPoint:t,accumulatedMovement:0,pressedStarKey:e.starKey,cancelled:!1,multiPointerInvalidated:!1}}pointerMove(e){e.pointerId!==this.state.activePointerId||!this.state.lastPoint||this.addMovement(e)}pointerUp(e){if(!this.downPointerIds.has(e.pointerId))return null;let t=null;return e.pointerId===this.state.activePointerId&&this.state.lastPoint&&(this.addMovement(e),t=this.downPointerIds.size===1&&!this.state.cancelled&&!this.state.multiPointerInvalidated&&this.state.accumulatedMovement<6&&this.state.pressedStarKey!==null&&e.starKey===this.state.pressedStarKey?this.state.pressedStarKey:null),this.finishPointer(e.pointerId),t}pointerCancel(e){this.cancel(e)}lostPointerCapture(e){this.cancel(e)}addMovement(e){let t=this.state.lastPoint;t&&(this.state={...this.state,lastPoint:{x:e.x,y:e.y},accumulatedMovement:this.state.accumulatedMovement+Math.abs(e.x-t.x)+Math.abs(e.y-t.y)})}cancel(e){this.downPointerIds.has(e)&&this.finishPointer(e)}invalidateForMultiplePointers(){this.state={...this.state,pressedStarKey:null,cancelled:!0,multiPointerInvalidated:!0}}finishPointer(e){let t=e===this.state.activePointerId;if(this.downPointerIds.delete(e),this.downPointerIds.size===0){this.reset();return}this.state={...this.state,activePointerId:t?null:this.state.activePointerId,inputKind:t?null:this.state.inputKind,origin:t?null:this.state.origin,lastPoint:t?null:this.state.lastPoint,pressedStarKey:null,cancelled:!0,multiPointerInvalidated:!0}}reset(){this.state=Vt}};function Ut(e,t,n){return Math.min(n,Math.max(t,e))}function Wt(e,t){e.alpha=t,e.setEnabled(t>0)}function Gt(e){return e.phase===`strata`?0:e.phase===`panorama`?.035:.012}function Kt(e){let t=e.filter(e=>e>1.5).sort((e,t)=>e-t);return t.length===0?null:Math.round(t[Math.floor(t.length*.55)])}function qt(e,t=6){return new Set([...e].sort((e,t)=>t.n-e.n||e.g-t.g).slice(0,Math.max(0,t)).map(({g:e})=>e))}function Jt(e){return e.phase===`panorama`||e.phase===`strata`||e.ownerKey!==e.focusedOwnerKey?0:e.phase===`approach`?.34*Xt(e.systemReveal):e.phase===`star-focus`?.34:e.questionId===e.selectedQuestionId?.92:.08}function Yt(e){let t=e.phase===`panorama`||e.phase===`strata`||e.ownerKey!==e.focusedOwnerKey?0:e.phase===`approach`?Xt(e.systemReveal):1;return Object.freeze({reveal:t,visible:t>0,pickable:t>=.05})}function Xt(e){return Number.isFinite(e)?Math.min(1,Math.max(0,e)):0}var B=Object.freeze({hoverStarKey:null,pressedStarKey:null,cursor:``}),Zt=class{gesture=new Ht;feedback=B;snapshot(){return this.feedback}gestureSnapshot(){return this.gesture.snapshot()}pointerDown(e){this.gesture.pointerDown(e),this.feedback=Object.freeze({hoverStarKey:null,pressedStarKey:V(this.gesture.snapshot().pressedStarKey),cursor:``})}pointerMove(e){this.gesture.pointerMove(e);let t=this.gesture.snapshot();if(t.activePointerId!==null||t.multiPointerInvalidated){this.feedback=Object.freeze({hoverStarKey:null,pressedStarKey:V(t.pressedStarKey),cursor:``});return}this.feedback=Object.freeze({hoverStarKey:V(e.starKey),pressedStarKey:null,cursor:e.starKey?`pointer`:``})}pointerUp(e){let t=this.gesture.pointerUp(e);return this.feedback=B,t}pointerCancel(e){this.gesture.pointerCancel(e),this.feedback=B}lostPointerCapture(e){this.gesture.lostPointerCapture(e),this.feedback=B}pointerLeave(){let e=this.gesture.snapshot();e.activePointerId!==null||e.multiPointerInvalidated||(this.feedback=B)}clear(){this.gesture=new Ht,this.feedback=B}};function V(e){return e?.startsWith(`star:`)?e.slice(5):null}var Qt=`
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
`,$t=`
precision highp float;
uniform vec3 uColor;
uniform float uActivity;
uniform float uSeed;
uniform float uRot;
uniform float uTime;
uniform float uCoronaAlpha;
uniform float uCoronaIntensity;
uniform float uCoronaLayers;
varying vec2 vUV;
void main(void) {
  vec2 centered = vUV * 2.0 - 1.0;
  float radius = length(centered);
  if (radius > 1.0) discard;
  float cutout = smoothstep(0.27, 0.37, radius);
  float ring = exp(-abs(radius - 0.40) * 12.0);
  float outer = pow(max(0.0, 1.0 - radius), 2.2);
  float ray = 0.72 + 0.28 * sin(atan(centered.y, centered.x) * (7.0 + uCoronaLayers * 2.0) + uRot + uSeed + uTime * 0.0001);
  float corona = cutout * (ring * 0.50 + outer * ray * (0.34 + uActivity * 0.22));
  float alpha = clamp(corona * uCoronaAlpha, 0.0, 0.82);
  gl_FragColor = vec4(uColor * (0.72 + uCoronaIntensity * 0.38), alpha);
}
`,en=`
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
`,tn=`
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
`,nn=`
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
`,rn=`
precision highp float;
#ifndef STAR_NOISE_OCTAVES
#define STAR_NOISE_OCTAVES 4
#endif
uniform vec3 uColor;
uniform vec3 cameraPosition;
uniform float uKelvin;
uniform float uSeed;
uniform float uRot;
uniform float uActivity;
uniform float uTime;
uniform float uSurfaceAlpha;
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
void main(void) {
  vec3 normal = normalize(vWorldNormal);
  float animatedTime = uTime * 0.00008;
  float granulation = warpedGranulation(vLocal * 7.0 + vec3(uRot, animatedTime, -animatedTime));
  float cellular = abs(valueNoise(vLocal * 31.0 + uSeed) * 2.0 - 1.0);
  float limb = 0.30 + 0.70 * pow(max(dot(normal, normalize(vViewDirection)), 0.0), 0.58);
  float heat = clamp((uKelvin - 2800.0) / 7000.0, 0.0, 1.0);
  vec3 hotCenter = mix(uColor, vec3(1.0, 0.92, 0.76), 0.42 + heat * 0.24);
  vec3 detailed = hotCenter * (0.62 + granulation * 0.42 + cellular * 0.12);
  float flare = uActivity * pow(max(0.0, granulation - 0.62), 3.0) * 2.4;
  vec3 color = detailed * limb + mix(uColor, vec3(1.0, 0.48, 0.16), 0.5) * flare;
  gl_FragColor = vec4(min(color, vec3(2.8)), clamp(uSurfaceAlpha, 0.0, 1.0));
}
`,an=`
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
`,on=Object.freeze({high:Object.freeze({sphereSegments:48,noiseOctaves:4,coronaLayers:2}),medium:Object.freeze({sphereSegments:32,noiseOctaves:3,coronaLayers:2}),low:Object.freeze({sphereSegments:20,noiseOctaves:2,coronaLayers:1})}),sn=[`position`,`aCenter`,`aAxis`,`aColor`,`aPeriod`,`aCoreSize`,`aHaloSize`,`aBright`,`aBurst`,`aSeed`,`aRot`,`aBodyR`,`aDim`,`aCoreDim`,`aHaloDim`,`aInteraction`],cn=[`worldView`,`projection`,`uTime`,`uBobAmplitude`,`uRenderHeight`,`uDevicePixelRatio`,`uProjectionScale`,`uLayer`,`uCoreScale`,`uCoreBrightness`,`uHaloIntensity`,`uPanoramaAlpha`,`uHaloAlpha`,`uFlareThreshold`,`uFlareAlpha`],ln=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(void) { vUV = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }
`,un=`
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
`,dn=`
precision highp float;
uniform vec3 uColor;
uniform float uSurfaceAlpha;
varying vec3 vNormal;
varying vec3 vViewDirection;
void main(void) {
  float facing = max(0.0, dot(normalize(vNormal), normalize(vViewDirection)));
  float limb = 0.34 + 0.66 * pow(facing, 0.58);
  vec3 hotCore = mix(uColor, vec3(1.0), 0.64);
  vec3 analyticCore = hotCore * min(2.2, 0.72 + limb * 1.18);
  gl_FragColor = vec4(analyticCore, clamp(uSurfaceAlpha, 0.0, 1.0));
}
`,fn=`
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
`,pn=class{stars;descriptors;descriptorByDatum;reducedMotion;lastElapsedMs=0;options;qualityConfig;geometry;panorama;dimensionsBuffer;baseDimensions;interactionBuffer;coreDimensionsBuffer;haloDimensionsBuffer;focusSphere;focusCorona;focusedMaterials=[];focusedDatum=null;focusedKey=null;presentation=null;hoverKey=null;pressedKey=null;fallbackActive=!1;fallbackFailed=!1;advancedFailure=null;focusedKind=`advanced`;compileGeneration=0;fallbackScheduled=!1;focusedReady=!1;disposed=!1;focusUniforms={kelvin:0,seed:0,rot:0,activity:0,time:0};constructor(e,t,n,r,a={}){this.stars=t,this.descriptors=t.map(L),this.descriptorByDatum=new Map(t.map((e,t)=>[e,this.descriptors[t]])),this.reducedMotion=r,this.options=a,this.qualityConfig=on[n],this.dimensionsBuffer=new Float32Array(t.length).fill(1),this.baseDimensions=new Float32Array(t.length).fill(1),this.interactionBuffer=new Float32Array(t.length*3).fill(1),this.coreDimensionsBuffer=new Float32Array(t.length).fill(1),this.haloDimensionsBuffer=new Float32Array(t.length).fill(1),this.geometry=gn(e,t,this.descriptors,this.dimensionsBuffer,this.coreDimensionsBuffer,this.haloDimensionsBuffer,this.interactionBuffer),this.panorama=[this.createPanoramaBatch(e,`core`,Qt,0),this.createPanoramaBatch(e,`halo`,tn,1),this.createPanoramaBatch(e,`flare`,en,2)],this.focusSphere=i(`stellar:focus:surface`,{diameter:2,segments:this.qualityConfig.sphereSegments},e),this.focusCorona=v(`stellar:focus:corona`,{size:2},e);for(let e of[this.focusSphere,this.focusCorona])e.parent=a.parent??null,e.isPickable=!1,e.setEnabled(!1);this.focusCorona.billboardMode=c.BILLBOARDMODE_ALL,this.installAdvancedFocusedMaterials(e)}setDimensions(e){if(this.disposed)return;if(e.length!==this.stars.length)throw RangeError(`Expected ${this.stars.length} star dimensions, received ${e.length}`);let t=!1;for(let n=0;n<this.dimensionsBuffer.length;n+=1){let r=e[n],i=Number.isFinite(r)?Math.min(1,Math.max(0,r)):1;t||=this.baseDimensions[n]!==i,this.baseDimensions[n]=i,this.dimensionsBuffer[n]=this.baseDimensions[n]}t&&(this.geometry.updateVerticesData(`aDim`,this.dimensionsBuffer,!1),this.applyPresentationDimensions())}setFocus(e,t){this.disposed||(this.focusedKey!==e||this.focusedDatum!==t)&&(this.focusedKey=e,this.focusedDatum=t,t&&this.applyFocusDatum(t),this.applyVisibility(),this.applyPresentationDimensions())}setPresentation(e,t,n){if(this.disposed)return;let r=this.presentation,i=!r||r.coreAlpha!==e.coreAlpha||r.haloAlpha!==e.haloAlpha||r.focusedOpacity!==e.focusedOpacity||r.effectiveNonFocusedOpacity!==e.effectiveNonFocusedOpacity||r.lodIntent!==e.lodIntent,a=this.hoverKey!==t||this.pressedKey!==n||!r||r.coreScale!==e.coreScale||r.coreBrightness!==e.coreBrightness||r.haloIntensity!==e.haloIntensity,o=!r||r.surfaceAlpha!==e.surfaceAlpha||r.coronaAlpha!==e.coronaAlpha||r.coronaIntensity!==e.coronaIntensity||r.lodIntent!==e.lodIntent;if(!i&&!a&&!o)return;this.presentation=e,this.hoverKey=t,this.pressedKey=n;let s=e.lodIntent===`hidden`?0:1;this.panorama[0]?.material.setFloat(`uPanoramaAlpha`,s),this.panorama[0]?.material.setFloat(`uCoreScale`,1),this.panorama[0]?.material.setFloat(`uCoreBrightness`,1),this.panorama[1]?.material.setFloat(`uPanoramaAlpha`,s),this.panorama[1]?.material.setFloat(`uHaloIntensity`,1),this.panorama[2]?.material.setFloat(`uPanoramaAlpha`,s),o&&this.applyFocusedPresentationUniforms(),this.applyVisibility(),a&&this.applyInteractions(),i&&this.applyPresentationDimensions()}setReducedMotion(e){if(this.disposed||this.reducedMotion===e)return;this.reducedMotion=e;let t=e?0:1.35;for(let{material:e}of this.panorama)e.setFloat(`uBobAmplitude`,t);this.applyAnimationTime(e?0:this.lastElapsedMs)}update(e){if(this.disposed)return;this.lastElapsedMs=H(e.elapsedMs);let t=this.reducedMotion?0:this.lastElapsedMs,n=Math.max(1,H(e.renderHeight)),r=Math.max(1,H(e.devicePixelRatio)),i=Math.max(1,H(e.projectionScale));for(let{material:e}of this.panorama)e.setFloat(`uTime`,t),e.setFloat(`uRenderHeight`,n),e.setFloat(`uDevicePixelRatio`,r),e.setFloat(`uProjectionScale`,i);this.applyFocusedAnimationTime(t)}applyAnimationTime(e){for(let{material:t}of this.panorama)t.setFloat(`uTime`,e);this.applyFocusedAnimationTime(e)}applyFocusedAnimationTime(e){if(!this.focusedDatum)return;let t=this.focusedDatum;bn(t,e,this.reducedMotion?0:1.35,this.focusSphere.position),this.focusCorona.position.copyFrom(this.focusSphere.position),this.focusUniforms={...this.focusUniforms,time:e};for(let t of this.focusedMaterials)t instanceof _&&t.setFloat(`uTime`,e)}diagnostics(){return Object.freeze({panoramaBatchCount:this.panorama.length,panoramaGeometryCount:1,panoramaMeshIds:Object.freeze(this.panorama.map(({mesh:e})=>e.uniqueId)),panoramaMaterialIds:Object.freeze(this.panorama.map(({material:e})=>e.uniqueId)),focusedPairCount:1,focusedMeshIds:Object.freeze([this.focusSphere.uniqueId,this.focusCorona.uniqueId]),focusedVisible:this.focusSphere.isEnabled()||this.focusCorona.isEnabled(),starOrder:Object.freeze(this.stars.map(({s:e})=>x(e))),dimensions:Object.freeze(Array.from(this.dimensionsBuffer)),interactions:Object.freeze(Array.from({length:this.stars.length},(e,t)=>Object.freeze([U(this.interactionBuffer[t*3]),U(this.interactionBuffer[t*3+1]),U(this.interactionBuffer[t*3+2])]))),quality:this.qualityConfig,stellarShaderFallback:this.fallbackActive,focusedReady:this.focusedReady,focusUniforms:Object.freeze({...this.focusUniforms}),disposed:this.disposed})}dispose(){if(!this.disposed){this.disposed=!0,this.compileGeneration+=1,this.fallbackScheduled=!1,this.focusedReady=!1;for(let{mesh:e,material:t}of this.panorama)e.dispose(!1,!1),t.dispose();this.geometry.dispose(),this.focusSphere.dispose(!1,!1),this.focusCorona.dispose(!1,!1);for(let e of this.focusedMaterials)e.dispose();this.focusedMaterials=[]}}createPanoramaBatch(e,t,n,r){let i=new c(`stellar:panorama:${t}`,e);i.parent=this.options.parent??null,i.isPickable=!1,i.isUnIndexed=!0,i.alwaysSelectAsActiveMesh=!0,this.geometry.applyToMesh(i);let a=new _(`stellar:panorama:${t}:material`,e,{vertexSource:nn,fragmentSource:n},{attributes:sn,uniforms:cn,needAlphaBlending:!0});return a.fillMode=m.MATERIAL_PointFillMode,a.alphaMode=m.ALPHA_ADD,a.disableDepthWrite=r!==0,a.setFloat(`uLayer`,r),a.setFloat(`uTime`,0),a.setFloat(`uBobAmplitude`,this.reducedMotion?0:1.35),a.setFloat(`uRenderHeight`,1e3),a.setFloat(`uDevicePixelRatio`,1),a.setFloat(`uProjectionScale`,500),a.setFloat(`uCoreScale`,1),a.setFloat(`uCoreBrightness`,1),a.setFloat(`uHaloIntensity`,1),a.setFloat(`uPanoramaAlpha`,1),a.setFloat(`uHaloAlpha`,1),a.setFloat(`uFlareThreshold`,2),a.setFloat(`uFlareAlpha`,1),i.material=a,{mesh:i,material:a,layer:r}}installAdvancedFocusedMaterials(e){let t=new _(`stellar:focus:surface:advanced`,e,{vertexSource:an,fragmentSource:rn},{attributes:[`position`,`normal`],uniforms:[`worldViewProjection`,`world`,`cameraPosition`,`uColor`,`uKelvin`,`uSeed`,`uRot`,`uActivity`,`uTime`,`uSurfaceAlpha`],defines:[`#define STAR_NOISE_OCTAVES ${this.qualityConfig.noiseOctaves}`],needAlphaBlending:!0}),n=mn(e,`advanced`,$t);t.alphaMode=m.ALPHA_COMBINE,t.disableDepthWrite=!0,n.alphaMode=m.ALPHA_ADD,n.disableDepthWrite=!0,this.focusedMaterials=[t,n],this.focusSphere.material=t,this.focusCorona.material=n,this.focusedKind=`advanced`,this.startFocusedCompilation(`advanced`,[{material:t,mesh:this.focusSphere},{material:n,mesh:this.focusCorona}])}activateFallback(e){if(this.disposed||this.focusedKind!==`advanced`)return;this.advancedFailure=e,this.fallbackActive=!1,this.focusedReady=!1,this.focusedKind=`fallback`;let t=this.focusSphere.getScene(),n=this.focusedMaterials,r=hn(t),i=mn(t,`fallback`,fn);i.alphaMode=m.ALPHA_ADD,i.disableDepthWrite=!0,this.focusedMaterials=[r,i],this.focusSphere.material=r,this.focusCorona.material=i;for(let e of n)e.dispose();this.focusedDatum&&this.applyFocusDatum(this.focusedDatum),this.applyFocusedPresentationUniforms(),this.startFocusedCompilation(`fallback`,[{material:r,mesh:this.focusSphere},{material:i,mesh:this.focusCorona}])}failFallback(e){if(this.fallbackFailed||this.disposed)return;this.fallbackFailed=!0,this.focusSphere.setEnabled(!1),this.focusCorona.setEnabled(!1);let t=this.advancedFailure??e;if(t!==e&&!(`cause`in t))try{Object.defineProperty(t,"cause",{value:e,configurable:!0})}catch{}this.options.onError?.(t)}applyFocusDatum(e){let t=this.descriptorByDatum.get(e)??L(e),n=new y(t.color[0],t.color[1],t.color[2]),r=_n(e.bodyR,.3,.01,10),i=_n(e.kelvin,5778,1e3,5e4),a=W(e.rot,0);this.focusSphere.scaling.setAll(r),this.focusCorona.scaling.setAll(r*t.coronaScale),this.focusUniforms={kelvin:i,seed:t.seed,rot:a,activity:t.surfaceActivity,time:this.focusUniforms.time},bn(e,this.focusUniforms.time,this.reducedMotion?0:1.35,this.focusSphere.position),this.focusCorona.position.copyFrom(this.focusSphere.position);for(let e of this.focusedMaterials)e instanceof _&&(e.setColor3(`uColor`,n),e.setFloat(`uKelvin`,i),e.setFloat(`uSeed`,t.seed),e.setFloat(`uRot`,a),e.setFloat(`uActivity`,t.surfaceActivity),e.setFloat(`uCoronaLayers`,this.qualityConfig.coronaLayers))}applyVisibility(){if(this.fallbackFailed)return;let e=this.focusedReady&&this.focusedDatum!==null&&this.presentation!==null&&this.presentation.lodIntent!==`point`&&this.presentation.lodIntent!==`hidden`;this.focusSphere.setEnabled(e&&(this.presentation?.surfaceAlpha??0)>0),this.focusCorona.setEnabled(e&&(this.presentation?.coronaAlpha??0)>0)}applyPresentationDimensions(){let e=this.presentation;for(let t=0;t<this.baseDimensions.length;t+=1){let n=x(this.stars[t].s),r=this.baseDimensions[t];if(!e)this.coreDimensionsBuffer[t]=r,this.haloDimensionsBuffer[t]=r;else if(e.lodIntent===`hidden`)this.coreDimensionsBuffer[t]=0,this.haloDimensionsBuffer[t]=0;else if(this.focusedKey){let i=n===this.focusedKey;this.coreDimensionsBuffer[t]=r*(i?e.coreAlpha*e.focusedOpacity:e.effectiveNonFocusedOpacity),this.haloDimensionsBuffer[t]=r*(i?e.haloAlpha*e.focusedOpacity:e.effectiveNonFocusedOpacity)}else this.coreDimensionsBuffer[t]=r*e.coreAlpha,this.haloDimensionsBuffer[t]=r*e.haloAlpha}this.geometry.updateVerticesData(`aCoreDim`,this.coreDimensionsBuffer,!1),this.geometry.updateVerticesData(`aHaloDim`,this.haloDimensionsBuffer,!1)}applyFocusedPresentationUniforms(){if(!this.presentation)return;let e=this.focusSphere.material,t=this.focusCorona.material;e&&(e.disableDepthWrite=this.presentation.surfaceAlpha<.999),e instanceof _?e.setFloat(`uSurfaceAlpha`,this.presentation.surfaceAlpha):e&&(e.alpha=this.presentation.surfaceAlpha),t instanceof _&&(t.disableDepthWrite=!0,t.setFloat(`uCoronaAlpha`,this.presentation.coronaAlpha),t.setFloat(`uCoronaIntensity`,this.presentation.coronaIntensity))}startFocusedCompilation(e,t){let n=++this.compileGeneration;this.focusedReady=!1;let r=()=>this.completeFocusedCompilation(e,n),i=t=>this.rejectFocusedCompilation(e,n,yn(t));for(let{material:e}of t)e instanceof _&&(e.onError=(e,t)=>i(Error(t)));try{this.options.compile?this.options.compile(e,t,r,i):Promise.all(t.map(({material:e,mesh:t})=>e.forceCompilationAsync(t))).then(r,i)}catch(e){i(e)}}completeFocusedCompilation(e,t){this.isCurrentCompilation(e,t)&&(this.compileGeneration+=1,this.focusedReady=!0,this.fallbackActive=e===`fallback`,this.applyVisibility())}rejectFocusedCompilation(e,t,n){if(this.isCurrentCompilation(e,t)){if(this.compileGeneration+=1,this.focusedReady=!1,e===`fallback`){this.failFallback(n);return}this.fallbackScheduled||(this.fallbackScheduled=!0,queueMicrotask(()=>{this.disposed||!this.fallbackScheduled||this.focusedKind!==`advanced`||(this.fallbackScheduled=!1,this.activateFallback(n))}))}}isCurrentCompilation(e,t){return!this.disposed&&this.focusedKind===e&&this.compileGeneration===t}applyInteractions(){let e=this.presentation;for(let t=0;t<this.stars.length;t+=1){let n=x(this.stars[t].s),r=t*3;this.interactionBuffer[r]=n===this.pressedKey?e?.coreScale??1:n===this.hoverKey?1+((e?.haloIntensity??1)-1)*.32:1,this.interactionBuffer[r+1]=n===this.pressedKey?e?.coreBrightness??1:1,this.interactionBuffer[r+2]=n===this.hoverKey?e?.haloIntensity??1:1}this.geometry.updateVerticesData(`aInteraction`,this.interactionBuffer,!1)}};function mn(e,t,n){let r=new _(`stellar:focus:corona:${t}`,e,{vertexSource:ln,fragmentSource:n},{attributes:[`position`,`uv`],uniforms:[`worldViewProjection`,`uColor`,`uActivity`,`uSeed`,`uRot`,`uTime`,`uCoronaAlpha`,`uCoronaIntensity`,`uCoronaLayers`],needAlphaBlending:!0});return r.backFaceCulling=!1,r.setColor3(`uColor`,y.White()),r.setFloat(`uActivity`,0),r.setFloat(`uSeed`,0),r.setFloat(`uRot`,0),r.setFloat(`uTime`,0),r.setFloat(`uCoronaAlpha`,0),r.setFloat(`uCoronaIntensity`,1),r.setFloat(`uCoronaLayers`,1),r}function hn(e){let t=new _(`stellar:focus:surface:fallback`,e,{vertexSource:un,fragmentSource:dn},{attributes:[`position`,`normal`],uniforms:[`worldViewProjection`,`world`,`cameraPosition`,`uColor`,`uSurfaceAlpha`],needAlphaBlending:!0});return t.alphaMode=m.ALPHA_COMBINE,t.disableDepthWrite=!0,t.setColor3(`uColor`,y.White()),t.setFloat(`uSurfaceAlpha`,0),t}function gn(e,t,n,r,i,a,o){let s=new p(`stellar:panorama:shared-geometry`,e),c=e=>{let n=new Float32Array(t.length*3);return t.forEach((t,r)=>n.set(e(t,r),r*3)),n},l=e=>Float32Array.from(t,e);return s.setVerticesData(`position`,c(({p:e})=>G(e)),!1,3),s.setVerticesData(`aCenter`,c(({center:e})=>G(e)),!1,3),s.setVerticesData(`aAxis`,c(({axis:e})=>vn(e)),!1,3),s.setVerticesData(`aColor`,c((e,t)=>n[t].color),!1,3),s.setVerticesData(`aPeriod`,l(({period:e})=>Math.max(0,W(e,0))),!1,1),s.setVerticesData(`aCoreSize`,l((e,t)=>n[t].panoramaCorePx),!1,1),s.setVerticesData(`aHaloSize`,l((e,t)=>n[t].panoramaHaloPx),!1,1),s.setVerticesData(`aBright`,l((e,t)=>n[t].luminance),!1,1),s.setVerticesData(`aBurst`,l((e,t)=>n[t].surfaceActivity),!1,1),s.setVerticesData(`aSeed`,l((e,t)=>n[t].seed),!1,1),s.setVerticesData(`aRot`,l(({rot:e})=>W(e,0)),!1,1),s.setVerticesData(`aBodyR`,l(({bodyR:e})=>_n(e,.3,.01,10)),!1,1),s.setVerticesData(`aDim`,r,!0,1),s.setVerticesData(`aCoreDim`,i,!0,1),s.setVerticesData(`aHaloDim`,a,!0,1),s.setVerticesData(`aInteraction`,o,!0,3),s}function H(e){return Number.isFinite(e)?Math.max(0,e):0}function U(e){return Math.round(e*1e4)/1e4}function W(e,t){return Number.isFinite(e)?e:t}function _n(e,t,n,r){return Math.min(r,Math.max(n,W(e,t)))}function G(e){return[W(e[0],0),W(e[1],0),W(e[2],0)]}function vn(e){let[t,n,r]=G(e),i=Math.hypot(t,n,r);return i>0?[t/i,n/i,r/i]:[0,1,0]}function yn(e){return e instanceof Error?e:Error(String(e))}function bn(e,t,n,r){let i=G(e.p),a=G(e.center),o=vn(e.axis),s=Math.max(0,W(e.period,0)),c=Math.abs(Math.trunc(W(e.seed,1))),l=i[0]-a[0],u=i[1]-a[1],d=i[2]-a[2],f=s===0?0:Math.PI*2/s*(t/1e3),p=Math.cos(f),m=Math.sin(f),h=o[0]*l+o[1]*u+o[2]*d,g=o[1]*d-o[2]*u,ee=o[2]*l-o[0]*d,_=o[0]*u-o[1]*l,v=Math.sin(t/(6400+c*311%5200)+c)*n;r.set(a[0]+l*p+g*m+o[0]*(h*(1-p)+v),a[1]+u*p+ee*m+o[1]*(h*(1-p)+v),a[2]+d*p+_*m+o[2]*(h*(1-p)+v))}function K(e){return Number.isFinite(e)?Math.min(1,Math.max(0,e)):0}function xn(e){return e*e*(3-2*e)}function Sn(e,t,n){return n===0?e:n===1?t:e+(t-e)*n}function Cn(e){if(e.phase===`strata`)return{coreAlpha:0,haloAlpha:0,surfaceAlpha:0,coronaAlpha:0,coronaIntensity:0,systemReveal:0,focusedOpacity:0,nonFocusedTargetOpacity:0,backgroundDimMix:0,effectiveNonFocusedOpacity:0,lodIntent:`hidden`};if(e.phase===`approach`){let t=K(e.approachProgress),n=xn(t),r=xn(K((t-.5)*2));return{coreAlpha:1-n,haloAlpha:1-n,surfaceAlpha:n,coronaAlpha:n,coronaIntensity:1,systemReveal:r,focusedOpacity:1,nonFocusedTargetOpacity:.18,backgroundDimMix:n,effectiveNonFocusedOpacity:Sn(1,.18,n),lodIntent:t===0?`point`:t===1?`surface`:`transition`}}if(e.phase===`star-focus`||e.phase===`planet-focus`){let t=e.phase===`planet-focus`;return{coreAlpha:0,haloAlpha:0,surfaceAlpha:1,coronaAlpha:t?.45:1,coronaIntensity:t?.55:1,systemReveal:1,focusedOpacity:1,nonFocusedTargetOpacity:.18,backgroundDimMix:1,effectiveNonFocusedOpacity:.18,lodIntent:`surface`}}return{coreAlpha:1,haloAlpha:1,surfaceAlpha:0,coronaAlpha:0,coronaIntensity:0,systemReveal:0,focusedOpacity:1,nonFocusedTargetOpacity:.18,backgroundDimMix:0,effectiveNonFocusedOpacity:1,lodIntent:`point`}}function q(e){let t=Cn(e);if(e.phase===`strata`)return Object.freeze({...t,coreScale:0,coreBrightness:0,haloIntensity:0});let n=K(e.hoverProgress),r=K(e.pressedProgress),i=Sn(Sn(1,1.08,n),.94,r);return Object.freeze({...t,coreScale:i,coreBrightness:1+(1.12-1)*r,haloIntensity:1+.25*n})}function wn(e,t,n){return Math.min(n,Math.max(t,e))}function J(e){return typeof e==`object`&&!!e}function Tn(e){return J(e)&&Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.z)}function En(e){return J(e)&&Tn(e.target)&&Number.isFinite(e.radius)&&e.radius>0}function Dn(e){return J(e)&&Number.isSafeInteger(e.token)&&e.token>=0&&typeof e.starKey==`string`&&e.starKey.length>0&&Number.isFinite(e.durationMs)&&e.durationMs>=0&&En(e.from)&&En(e.to)}function On(e){return Object.freeze({x:e.x,y:e.y,z:e.z})}function kn(e){return Object.freeze({target:On(e.target),radius:e.radius})}function An(e,t,n){if(!Number.isFinite(e)||e<0||!Number.isFinite(n)||n<0)return Object.freeze({ok:!1,error:`invalid-input`});let r=t?Math.min(120,n):wn(900+Math.log1p(e)*90,900,1300);return Object.freeze(Number.isFinite(r)?{ok:!0,value:r}:{ok:!1,error:`invalid-input`})}function jn(e,t){if(!Number.isFinite(e)||e<=0||!Array.isArray(t))return Object.freeze({ok:!1,error:`invalid-input`});if(t.length===0){let t=e*6;return Object.freeze(Number.isFinite(t)?{ok:!0,value:t}:{ok:!1,error:`invalid-input`})}let n=0;for(let e of t){if(!J(e)||!Number.isFinite(e.orbitR)||e.orbitR<0||!Number.isFinite(e.radius)||e.radius<0)return Object.freeze({ok:!1,error:`invalid-input`});let t=e.orbitR+e.radius;if(!Number.isFinite(t))return Object.freeze({ok:!1,error:`invalid-input`});n=Math.max(n,t)}return Object.freeze({ok:!0,value:n})}function Mn(e){return J(e)&&Number.isSafeInteger(e.token)&&e.token>=0&&typeof e.starKey==`string`&&e.starKey.length>0&&En(e.start)&&Tn(e.targetStar)&&Number.isFinite(e.bodyR)&&e.bodyR>0&&Number.isFinite(e.systemExtent)&&e.systemExtent>=0&&Number.isFinite(e.overviewRadius)&&e.overviewRadius>0&&Number.isFinite(e.distance)&&e.distance>=0&&Number.isFinite(e.requestedMs)&&e.requestedMs>=0&&typeof e.reducedMotion==`boolean`}function Nn(e){if(!Mn(e))return Object.freeze({ok:!1,error:`invalid-input`});let t=e.bodyR*8,n=e.overviewRadius*.72,r=e.bodyR*14,i=e.systemExtent*1.35;if(![t,n,r,i].every(Number.isFinite)||t>n)return Object.freeze({ok:!1,error:`invalid-input`});let a=wn(Math.max(r,i),t,n);if(!Number.isFinite(a)||a<=0)return Object.freeze({ok:!1,error:`invalid-input`});let o=An(e.distance,e.reducedMotion,e.requestedMs);if(!o.ok)return Object.freeze({ok:!1,error:o.error});let s=Object.freeze({token:e.token,starKey:e.starKey,from:kn(e.start),to:kn({target:e.targetStar,radius:a}),durationMs:o.value});return Object.freeze({ok:!0,flight:s})}function Pn(e){return e*e*(3-2*e)}function Fn(e,t){if(!Number.isFinite(t)||!Dn(e))return Object.freeze({ok:!1,error:`invalid-frame`});let n=e.durationMs===0?1:wn(t/e.durationMs,0,1),r=Pn(n),i=On(n===0?e.from.target:n===1?e.to.target:{x:e.from.target.x+(e.to.target.x-e.from.target.x)*r,y:e.from.target.y+(e.to.target.y-e.from.target.y)*r,z:e.from.target.z+(e.to.target.z-e.from.target.z)*r}),a=n===0?e.from.radius:n===1?e.to.radius:Math.exp(Math.log(e.from.radius)+(Math.log(e.to.radius)-Math.log(e.from.radius))*r);return!Tn(i)||!Number.isFinite(a)?Object.freeze({ok:!1,error:`invalid-frame`}):Object.freeze({ok:!0,frame:Object.freeze({token:e.token,target:i,radius:a,progress:n,complete:n===1})})}var In=class{#e=0;#t=null;#n=null;#r=null;get selectedStarKey(){return this.#r}start(e){if(e.starKey===this.#r)return Object.freeze({kind:`noop`,reason:`already-focused`});let t=this.#e+1,n=Nn({...e,token:t});return n.ok?(this.#e=t,this.#t=t,this.#r=e.starKey,Object.freeze({kind:`started`,flight:n.flight})):Object.freeze({kind:`error`,error:n.error})}cancel(e){this.#n=this.#t,this.#e+=1,this.#t=null,e!==`user`&&(this.#r=null)}isActive(e){return e===this.#t}frame(e,t){return Dn(e)?e.token===this.#t?Fn(e,t):e.token===this.#n?Object.freeze({ok:!1,error:`cancelled`}):Object.freeze({ok:!1,error:`stale-token`}):Object.freeze({ok:!1,error:`invalid-frame`})}};function Ln(e){return e===`planet-focus`?`star-focus`:e===`star-focus`?`panorama`:null}function Rn(e,t,n){return Number.isFinite(e)&&Number.isFinite(t)&&Number.isFinite(n)&&e>0&&t>n}var zn=2.1,Bn=1.15,Vn=.085,Hn=1.05,Un=new Set;function Wn(e){e.toneMappingEnabled=!0,e.toneMappingType=l.TONEMAPPING_KHR_PBR_NEUTRAL,e.ditheringEnabled=!0,e.exposure=.92}function Gn(e,t){return Math.min(t?1.5:2,Math.max(1,Number.isFinite(e)&&e>0?e:1))}function Kn(){return typeof matchMedia==`function`&&matchMedia(`(pointer: coarse)`).matches}var qn=class{runtime;callbacks;canvas;labelCanvas;engine;scene;camera;universeRoot;universe;stars;starLayer;candidateBuffer;quality;pointerPresentation=new Zt;cameraFlightController=new In;planetFocusController;caveRoot=null;planets;visualByQuestion=new Map;macroOrbits=[];visualByMeshId=new Map;specimenByMeshId=new Map;probes;strataTransition;selected=null;selectedVisual=null;focusedStar=null;mode=`all`;wormIdx=0;interactionByDatum=new Map;hoverKey=null;pressedKey=null;hoverProgress=0;pressedProgress=0;activeFlight=null;presentation=q({phase:`panorama`});lastLayerPresentation=null;lastLayerHoverKey=null;lastLayerPressedKey=null;lastPresentationInput=null;elapsedMs=0;lastStrataMoveAt=null;overviewTarget=n.Zero();overviewRadius=30;entryCameraSnapshot=null;destroyed=!1;universeVisible=!0;workspaceOpen=!1;reducedMotion;planetExitPending=!1;planetDragPointerId=null;planetDragX=0;planetDragY=0;planetDragMovement=0;planetDragStartedOnTarget=!1;diagnosticClickEvents=0;diagnosticLastPick=`none`;diagnosticCameraSamples=[];diagnosticCameraSequence=0;diagnosticApproachProgressOverride=null;starPositionScratch=new n;flightTargetScratch=new n;planetStarPositionScratch=new n;planetPositionScratch=new n;candidateWorldScratch=new n;projectionIdentity=a.Identity();projectionViewport=new r(0,0,1,1);projectedPositionScratch=new n;pointerProjectionScratch={x:0,y:0,z:0};candidateProjectionScratch={x:0,y:0,depth:0,visible:!1};constructor(e,t,r,i,a={}){this.canvas=e,this.labelCanvas=t,this.callbacks=a,this.universe=r.universe,this.stars=we(r.universe),this.candidateBuffer=new zt(this.stars),this.reducedMotion=i,this.planets=Xn(r,this.stars),this.probes=new Set(r.probesById.keys());let o=new ne(e,!0,{preserveDrawingBuffer:!1,stencil:!1,disableWebGL2Support:!1});if(o.webGLVersion<2)throw o.dispose(),$(e),new Pe;o.setHardwareScalingLevel(1/Gn(window.devicePixelRatio,Kn())),this.engine=o;let c=null,l=null,d=!1,f=!1;try{c=new u(o),this.scene=c,c.clearColor=new re(0,0,0,1),this.universeRoot=new g(`universe-root`,c);let t=new s(`mindverse-camera`,-Math.PI/2,Math.PI/2.55,30,n.Zero(),c);this.camera=t,t.minZ=.1,t.lowerRadiusLimit=1.2,t.upperRadiusLimit=1e4,t.wheelDeltaPercentage=.012,t.pinchDeltaPercentage=.012,t.attachControl(e,!0),c.activeCamera=t,this.planetFocusController=new gt({readPose:()=>({target:{x:t.target.x,y:t.target.y,z:t.target.z},radius:t.radius}),writePose:e=>{t.setTarget(new n(e.target.x,e.target.y,e.target.z)),t.radius=e.radius},stopInertia:()=>{t.inertialAlphaOffset=0,t.inertialBetaOffset=0,t.inertialRadiusOffset=0,t.inertialPanningX=0,t.inertialPanningY=0}},()=>{this.planetExitPending=!0},{reducedMotion:i}),this.quality=Ne(i),this.starLayer=new pn(c,this.stars,this.quality,i,{parent:this.universeRoot,onError:a.onRenderError}),this.applyModeDimensions(),this.starLayer.setPresentation(this.presentation,null,null),this.lastLayerPresentation=this.presentation,this.strataTransition=new Mt({capturePose:()=>this.captureStrataEntryPose(),applyPose:e=>this.applyStrataPose(e),setUniverseVisible:e=>this.setUniverseVisible(e),animate:(e,t,n,r)=>this.animateStrata(e,t,n,r)},a),this.createScene(r),f=!0,this.installPointerListeners(),d=!0,l=new Fe({engine:o,scene:c,releaseContext:()=>$(e),canvas:{addEventListener:(t,n)=>e.addEventListener(t,n),removeEventListener:(t,n)=>e.removeEventListener(t,n)}},{onReady:a.onRenderReady,onError:a.onRenderError}),this.runtime=l,this.resizeLabels(),Un.add(this)}catch(t){throw f&&this.removePointerListeners(),l?l.destroy():d||(c&&c.dispose(),o.dispose(),$(e)),t}}start(){this.runtime.start()}stop(){this.runtime.stop()}suspend(){this.cancelFlight(`suspend`),this.clearPointerFeedback(),this.runtime.suspend()}resume(){this.runtime.resume()}resize(){this.runtime.resize(),this.resizeLabels()}destroy(){if(!this.destroyed){this.diagnosticApproachProgressOverride=null,this.destroyed=!0,Un.delete(this),this.selected=null,this.selectedVisual=null,this.cancelFlight(`destroy`),this.clearPointerFeedback(),this.strataTransition.destroy(),this.removePointerListeners();for(let e of this.visualByQuestion.values())e.visual.dispose();this.visualByQuestion.clear(),this.visualByMeshId.clear(),this.starLayer.dispose(),this.runtime.destroy()}}setMode(e,t=0){this.destroyed||(this.mode!==e||this.wormIdx!==t)&&(this.mode=e,this.wormIdx=t,this.applyModeDimensions(),this.focusedStar&&!this.isInteractive(this.focusedStar)&&this.resetView(),this.hoverKey&&!this.isKeyInteractive(this.hoverKey)&&this.clearPointerFeedback(),this.syncOrbitPresentation())}focusStar(e){if(this.destroyed||!this.universeVisible||this.strataTransition.phase!==null)return null;let t=Me(this.stars,e,this.mode,this.universe,this.wormIdx);return t?this.focusedStar===t&&!this.selected?t.s:this.applyStarFocus(t)?(this.callbacks.onPick?.(t.s),t.s):null:null}resetView(){this.destroyed||(this.cancelFlight(`reset`),this.clearPlanet(),this.focusedStar=null,this.starLayer.setFocus(null,null),this.camera.setTarget(this.overviewTarget),this.camera.radius=this.overviewRadius,this.syncOrbitPresentation())}clearPlanet(){this.destroyed||!this.selected||(this.planetFocusController.suspend(),this.selectedVisual?.visual.setSelected(!1),this.selectedVisual?.visual.setLod(this.quality===`low`?`low`:`medium`),this.selected=null,this.selectedVisual=null,this.callbacks.onAnchor?.(0,0,!1),this.callbacks.onPickPlanet?.(null),this.focusedStar&&(this.camera.setTarget(this.currentStarPosition(this.focusedStar)),this.camera.radius=this.systemFraming(this.focusedStar).radius),this.syncOrbitPresentation())}selectQuestionPlanet(e,t){if(this.destroyed)return null;let n=this.planets.find(n=>`id`in n.star.s&&n.star.s.id===e&&n.question.id===t)??null;return n?(this.cancelFlight(`planet`),this.selectedVisual?.visual.setSelected(!1),this.selected=n,this.selectedVisual=this.visualByQuestion.get(n.question.id)??null,this.focusedStar=n.star,this.starLayer.setFocus(x(n.star.s),n.star),this.selectedVisual?.visual.setSelected(!0),this.selectedVisual&&this.planetFocusController.enter(this.selectedVisual.visual),this.syncOrbitPresentation(),this.callbacks.onPickPlanet?.(n),n):null}restoreQuestionPlanet(e,t){return this.selectQuestionPlanet(e,t)}setWorkspaceOpen(e){this.destroyed||(this.workspaceOpen=e,this.canvas.style.pointerEvents=e?`none`:``,e?this.camera.detachControl():this.universeVisible&&this.camera.attachControl(this.canvas,!0),this.camera.viewport=e&&this.engine.getRenderWidth()>760?new r(.18,0,.82,1):e?new r(0,.16,1,.84):new r(0,0,1,1),e&&this.clearPointerFeedback())}orbitWorkspace(e,t){this.destroyed||!this.selected||this.planetFocusController.drag(e,t)||this.selectedVisual?.visual.rotate(-e*.005,-t*.005)}approachProbe(e,t){this.reportProbeUnsupported(e,t)}startProbeScan(e,t){this.reportProbeUnsupported(e,t)}setProbeInspectionPose(e){}focusProbePart(e){}exitProbeInspection(){}setReducedMotion(e){if(this.destroyed||this.reducedMotion===e)return;this.reducedMotion=e,this.planetFocusController.setReducedMotion(e),this.starLayer.setReducedMotion(e);let t=this.activeFlight;if(e&&t&&this.focusedStar){let e=this.currentStarPosition(this.focusedStar),n=t.flight.to.radius;this.cancelFlight(`user`),this.camera.setTarget(e),this.camera.radius=n,this.syncStarLayerPresentation(),this.syncOrbitPresentation()}for(let e of this.visualByQuestion.values())this.updatePlanetPosition(e,this.elapsedMs);this.selectedVisual&&this.universeVisible?this.camera.target.copyFrom(this.selectedVisual.visual.activeMesh.position):this.focusedStar&&!this.activeFlight&&this.universeVisible&&this.camera.target.copyFrom(this.currentStarPosition(this.focusedStar))}skipGenesis(){this.destroyed||this.callbacks.onGenesisEnd?.()}enterStrata(e){if(this.destroyed||this.strataTransition.token===e.token)return;if(!this.selected||this.selected.question.id!==e.questionId){this.callbacks.onStrataError?.({token:e.token,questionId:e.questionId,scope:`transition`,cause:Yn(`请先选择对应的问题行星，再打开答案地层。`)});return}this.cancelFlight(`strata`),this.planetFocusController.suspend(!1),this.clearPointerFeedback(),this.strataTransition.enter(e),this.lastStrataMoveAt=null;let t=this.strataTransition.layout;t&&this.createCave(t)}moveStrata(e){let t=performance.now();this.strataTransition.move(e,kt(this.lastStrataMoveAt,t)),this.lastStrataMoveAt=t}focusAnswerSpecimen(e){this.strataTransition.focusAnswer(e)}closeAnswerSpecimen(){this.strataTransition.closeAnswer()}exitStrata(e){this.strataTransition.exit(e)}createScene(e){Wn(this.scene.imageProcessingConfiguration);let t=new ee(`mindverse-pipeline`,!0,this.scene,[this.camera]);t.fxaaEnabled=!1,t.bloomEnabled=!0,t.bloomThreshold=Hn,t.bloomWeight=.14,t.bloomKernel=48,this.configureOverview(this.stars),this.createMacroOrbits(e);for(let e of this.planets)this.createPlanet(e);this.syncOrbitPresentation(),this.scene.onBeforeRenderObservable.add(()=>this.updateScene())}pickStrataAt(e,t){this.universeVisible||this.pickAtClient(e,t)}pickAtClient(e,t){if(this.destroyed)return;let n=this.canvas.getBoundingClientRect(),r=(e-n.left)*this.engine.getRenderWidth()/Math.max(1,n.width),i=(t-n.top)*this.engine.getRenderHeight()/Math.max(1,n.height),a=this.scene.pick(r,i)?.pickedMesh;if(!a)return;let o=this.specimenByMeshId.get(a.uniqueId);if(o){this.strataTransition.focusAnswer(o.answerId);return}let s=this.visualByMeshId.get(a.uniqueId);if(s){let e=`id`in s.datum.star.s?s.datum.star.s.id:``;e&&this.selectQuestionPlanet(e,s.datum.question.id);return}}configureOverview(e){if(e.length===0)return;let t=e.map(e=>n.FromArray(e.p)).filter(X);if(t.length===0){this.overviewTarget=n.Zero(),this.overviewRadius=30,this.camera.setTarget(this.overviewTarget),this.camera.radius=this.overviewRadius;return}let r=t.reduce((e,t)=>e.addInPlace(t),n.Zero()).scaleInPlace(1/t.length),i=Math.max(8,...t.map(e=>n.Distance(r,e)));this.overviewTarget=r,this.overviewRadius=Z(i*2.4)?i*2.4:30,this.camera.setTarget(r),this.camera.radius=this.overviewRadius}createPlanet(e){if(!(`id`in e.star.s))return;let t=Ve({questionId:e.question.id,starId:e.star.s.id,answerCount:e.answerCount,timeSpan:e.material.timeSpan,freshness:e.material.freshness,created:e.created,collected:e.collected,normalizedStarEnergy:e.star.bright*1.8,normalizedOrbitDistance:e.orbitR/zn}),n=this.createQuestionOrbit(e),r,i=new ft({scene:this.scene,descriptor:t,parent:this.universeRoot,initialLod:this.quality===`low`?`low`:`medium`,onMeshesChanged:()=>this.refreshPlanetMeshIndex(r)});r=Object.freeze({datum:e,descriptor:t,visual:i,orbit:n}),this.visualByQuestion.set(e.question.id,r),this.refreshPlanetMeshIndex(r),this.updatePlanetPosition(r,0),i.ensureLod(this.quality===`low`?`low`:`medium`),i.ensureAtmosphere()}createMacroOrbits(e){let t=qt(e.universe.clusters);for(let r of e.universe.clusters){if(!t.has(r.g))continue;let i=_e(r.hue,r.sat),a=[];for(let t of r.mem){let n=e.universe.stars.find(e=>e.c===t);if(!n)continue;let i=Math.hypot(n.p[0]-r.c[0],n.p[1]-r.c[1],n.p[2]-r.c[2]);a.push(i)}let o=Kt(a);if(o===null)continue;let s=xe(r.c,ye(r.g),o,96).map(e=>n.FromArray(e));s.length>0&&s.push(s[0].clone());let c=h(`cluster-orbit:${r.g}:${o}`,{points:s,useVertexAlpha:!0},this.scene);c.parent=this.universeRoot,c.color=new y(i[0],i[1],i[2]).scale(.22),c.alpha=0,c.isPickable=!1,this.macroOrbits.push({ownerKey:String(r.g),mesh:c})}}createQuestionOrbit(e){let t=[];for(let r=0;r<=96;r+=1){let i=Math.PI*2*r/96,a=Math.cos(i),o=Math.sin(i);t.push(new n(e.star.p[0]+(e.u[0]*a+e.v[0]*o)*e.orbitR,e.star.p[1]+(e.u[1]*a+e.v[1]*o)*e.orbitR,e.star.p[2]+(e.u[2]*a+e.v[2]*o)*e.orbitR))}let r=h(`question-orbit:${e.question.id}`,{points:t,useVertexAlpha:!0},this.scene);return r.parent=this.universeRoot,r.color=new y(e.star.color[0],e.star.color[1],e.star.color[2]),r.alpha=0,r.isPickable=!1,r}orbitPresentationState(){if(!this.universeVisible)return{phase:`strata`};let e=this.focusedStar?Jn(this.focusedStar):void 0;return this.selected?{phase:`planet-focus`,focusedOwnerKey:e,selectedQuestionId:this.selected.question.id}:e&&this.activeFlight?{phase:`approach`,focusedOwnerKey:e,systemReveal:this.presentation.systemReveal}:e?{phase:`star-focus`,focusedOwnerKey:e}:{phase:`panorama`}}syncOrbitPresentation(){let e=this.orbitPresentationState();for(let t of this.macroOrbits)Wt(t.mesh,Gt({...e,ownerKey:t.ownerKey}));for(let t of this.visualByQuestion.values()){let n=Jn(t.datum.star);Wt(t.orbit,Jt({...e,ownerKey:n,questionId:t.datum.question.id}));let r=Yt({...e,ownerKey:n});t.visual.setReveal(r.reveal),t.visual.setVisible(r.visible);for(let e of t.visual.meshes)e.isPickable=r.pickable&&!e.name.includes(`:atmosphere`)}}updateScene(){if(this.destroyed)return;let e=Math.min(50,Math.max(0,this.engine.getDeltaTime()));this.elapsedMs+=this.reducedMotion||this.diagnosticApproachProgressOverride!=null?0:e,this.updateCameraFlight(e),this.planetFocusController.update(e),this.planetExitPending&&this.planetFocusController.state===`idle`&&(this.planetExitPending=!1,this.finishPlanetExit()),this.updateStellarPresentation(e);let t=Math.max(1,this.engine.getRenderHeight()),r=Gn(window.devicePixelRatio,Kn());this.starLayer.update({elapsedMs:this.elapsedMs,renderHeight:t,devicePixelRatio:r,projectionScale:t*.5/Math.tan(this.camera.fov*.5)});for(let e of this.visualByQuestion.values()){this.updatePlanetPosition(e,this.elapsedMs);let t=e.visual.activeMesh,r=n.Distance(this.camera.globalPosition,t.getAbsolutePosition());e.visual.update({elapsedMs:this.motionTime(),cameraPosition:this.camera.globalPosition,starPosition:this.currentStarPosition(e.datum.star),coverage:Ye(e.visual.radius,r,this.camera.fov,this.engine.getRenderWidth(),this.engine.getRenderHeight()),focused:e===this.selectedVisual})}this.selected&&this.selectedVisual&&this.universeVisible?(this.planetFocusController.state===`focused`&&this.camera.target.copyFrom(this.selectedVisual.visual.activeMesh.position),this.updateAnchor(this.selectedVisual.visual.activeMesh)):this.focusedStar&&!this.activeFlight&&this.universeVisible&&this.camera.target.copyFrom(this.currentStarPosition(this.focusedStar))}diagnosticPhase(){switch(this.strataTransition.phase){case`surface-approach`:return`surface-approach`;case`surface-crossing`:return`surface-crossing`;case`strata-snapped`:return`strata-snapped`;case`strata-free`:return`strata-free`;case`exit`:return`strata-exiting`;default:return`universe`}}prepareDiagnosticPlanetCapture(){let e=this.selectedVisual;if(!e||!this.universeVisible)return!1;let t=e.visual.activeMesh.getAbsolutePosition().clone(),r=this.currentStarPosition(e.datum.star).subtract(t),i=n.Cross(r,n.Up());return i.lengthSquared()<1e-8&&(i=n.Right()),i.normalize().scaleInPlace(this.camera.radius),this.camera.setTarget(t),this.camera.setPosition(t.add(i).add(n.Up().scale(this.camera.radius*.12))),!0}flipDiagnosticFarPlanetCapture(){return!this.focusedStar||this.selectedVisual||!this.universeVisible?!1:(this.camera.alpha+=Math.PI,!0)}diagnosticScene(){let e=this.stars[0]?this.projectToCss(this.currentStarPosition(this.stars[0])):null;return{planetCount:this.visualByQuestion.size,probeCount:this.probes.size,probeNearVisible:!1,firstStarX:e?.x??null,firstStarY:e?.y??null,cameraDistance:this.camera.radius,targetDistance:this.camera.radius,cameraAlpha:this.camera.alpha,cameraBeta:this.camera.beta,cameraTargetX:this.camera.target.x,cameraTargetY:this.camera.target.y,cameraTargetZ:this.camera.target.z,strataPose:this.strataTransition.pose,undatedRoom:this.strataTransition.layout?.undatedRoom?{centerDepth:this.strataTransition.layout.undatedRoom.centerDepth,angle:this.strataTransition.layout.undatedRoom.angle}:null}}diagnosticStellar(){let e=this.stars.flatMap(e=>{if(!this.isInteractive(e)||!this.universeVisible)return[];let t=this.projectToCss(this.currentStarPosition(e));if(t.z<0||t.z>1)return[];let n=L(e),r=e===this.focusedStar&&this.presentation.lodIntent!==`point`,i=this.canvas.getBoundingClientRect(),a=e.bodyR*i.height/Math.max(.001,Math.tan(this.camera.fov*.5)*this.camera.radius),o=r?Math.max(n.panoramaCorePx,a):n.panoramaCorePx,s=r?Math.max(n.panoramaHaloPx,a*n.coronaScale):n.panoramaHaloPx;return[{starKey:x(e.s),core:{x:t.x-o/2,y:t.y-o/2,width:o,height:o},halo:{x:t.x-s/2,y:t.y-s/2,width:s,height:s}}]}),t=this.activeFlight&&this.activeFlight.flight.durationMs>0?Math.min(1,this.activeFlight.elapsedMs/this.activeFlight.flight.durationMs):+!!this.focusedStar;return{starCount:this.stars.length,projectedStars:e,hoveredStarKey:this.hoverKey,hoverProgress:this.hoverProgress,focusedStarKey:this.focusedStar?x(this.focusedStar.s):null,approachProgress:t,systemReveal:this.presentation.systemReveal,visibleQuestionOrbits:[...this.visualByQuestion.values()].filter(({orbit:e})=>e.isEnabled()&&e.alpha>0).length,visibleQuestionPlanets:[...this.visualByQuestion.values()].filter(({visual:e})=>e.activeMesh.isEnabled()).length,cameraSamples:this.diagnosticCameraSamples??[],shaderFallback:this.starLayer.diagnostics().stellarShaderFallback}}selectedPlanetBounds(){let e=this.selectedVisual?.visual;return!e||!this.universeVisible?null:this.planetBounds(e.activeMesh,e.radius)}planetBounds(e,t){if(!this.universeVisible)return null;e.computeWorldMatrix(!0);let r=e.getBoundingInfo().boundingSphere,i=this.projectToCss(r.centerWorld),a=this.canvas.getBoundingClientRect(),o=Xe(t,n.Distance(this.camera.globalPosition,r.centerWorld),this.camera.fov,a.width,a.height*this.camera.viewport.height);return{x:i.x-o/2,y:i.y-o/2,width:o,height:o}}answerSpecimenDiagnostics(){if(this.universeVisible)return[];let e=this.canvas.getBoundingClientRect();return[...this.specimenByMeshId.entries()].map(([t,n])=>{let r=this.scene.meshes.find(({uniqueId:e})=>e===t),i={answerId:n.answerId,room:n.room,depth:n.depth,x:n.x,z:n.z};if(!r||!r.isEnabled())return{...i,bounds:null};let a=this.projectToCss(r.getAbsolutePosition()),o=this.scene.pick(a.x*this.engine.getRenderWidth()/Math.max(1,e.width),a.y*this.engine.getRenderHeight()/Math.max(1,e.height))?.pickedMesh?.uniqueId===t&&a.z>=0&&a.z<=1&&a.x>=12&&a.x<=e.width-12&&a.y>=12&&a.y<=e.height-12;return{...i,bounds:o?{x:a.x-12,y:a.y-12,width:24,height:24}:null}})}firstAnswerSpecimenBounds(e){let t=this.canvas.getBoundingClientRect(),n=e.flatMap(({bounds:e})=>e?[e]:[]);return n.length===0?null:n.reduce((e,n)=>{let r=Math.hypot(e.x+e.width/2-t.width/2,e.y+e.height/2-t.height/2);return Math.hypot(n.x+n.width/2-t.width/2,n.y+n.height/2-t.height/2)<r?n:e})}projectToCss(e){return this.projectToCssToRef(e,{x:0,y:0,z:0})}projectToCssToRef(e,t){let r=this.engine.getRenderWidth(),i=this.engine.getRenderHeight(),a=this.camera.viewport,o=this.projectionViewport;o.x=a.x*r,o.y=a.y*i,o.width=a.width*r,o.height=a.height*i;let s=this.projectedPositionScratch;n.ProjectToRef(e,this.projectionIdentity,this.scene.getTransformMatrix(),o,s);let c=this.canvas.getBoundingClientRect();return t.x=s.x*c.width/Math.max(1,r),t.y=s.y*c.height/Math.max(1,i),t.z=s.z,t}updatePlanetPosition(e,t){let n=e.datum,r=this.reducedMotion?0:t,i=Ce(n.star,r,this.reducedMotion?0:1.35,this.planetStarPositionScratch),a=n.phase+Math.PI*2/n.period*(r/1e3),o=Math.cos(a),s=Math.sin(a);e.visual.setPosition(this.planetPositionScratch.set(i.x+(n.u[0]*o+n.v[0]*s)*n.orbitR,i.y+(n.u[1]*o+n.v[1]*s)*n.orbitR,i.z+(n.u[2]*o+n.v[2]*s)*n.orbitR)),e.orbit.position.set(i.x-n.star.p[0],i.y-n.star.p[1],i.z-n.star.p[2])}refreshPlanetMeshIndex(e){for(let[t,n]of this.visualByMeshId)n===e&&this.visualByMeshId.delete(t);for(let t of e.visual.meshes)t.name.includes(`:atmosphere`)||this.visualByMeshId.set(t.uniqueId,e)}finishPlanetExit(){let e=this.selectedVisual;e&&(e.visual.setSelected(!1),e.visual.setLod(this.quality===`low`?`low`:`medium`),this.selected=null,this.selectedVisual=null,this.callbacks.onAnchor?.(0,0,!1),this.callbacks.onPickPlanet?.(null),this.syncOrbitPresentation())}updateAnchor(e){if(!this.callbacks.onAnchor)return;let t=this.engine.getRenderWidth(),r=this.engine.getRenderHeight(),i=this.camera.viewport,a=this.projectionViewport;a.x=i.x*t,a.y=i.y*r,a.width=i.width*t,a.height=i.height*r;let o=this.projectedPositionScratch;n.ProjectToRef(e.getAbsolutePosition(),this.projectionIdentity,this.scene.getTransformMatrix(),a,o);let s=o.z>=0&&o.z<=1;this.callbacks.onAnchor(o.x,o.y,s)}captureStrataEntryPose(){return this.entryCameraSnapshot=Object.freeze({alpha:this.camera.alpha,beta:this.camera.beta,radius:this.camera.radius,target:this.camera.target.clone()}),Object.freeze({depth:this.camera.radius,yaw:this.camera.alpha,pitch:this.camera.beta,snapId:null})}applyStrataPose(e){if(this.destroyed)return;if(this.universeVisible){let t=this.entryCameraSnapshot;t&&this.camera.setTarget(t.target),this.camera.alpha=e.yaw,this.camera.beta=e.pitch,this.camera.radius=e.depth;return}let t=new n(0,-e.depth,0),r=Math.cos(e.pitch),i=new n(Math.sin(e.yaw)*r,Math.sin(e.pitch),Math.cos(e.yaw)*r);this.camera.setPosition(t),this.camera.setTarget(t.add(i))}setUniverseVisible(e){this.destroyed||(this.universeVisible=e,this.universeRoot.setEnabled(e),this.caveRoot?.setEnabled(!e),this.scene.fogEnabled=!e,e&&!this.workspaceOpen?this.camera.attachControl(this.canvas,!0):this.camera.detachControl(),e&&this.selectedVisual&&this.planetFocusController.state===`idle`&&this.planetFocusController.enter(this.selectedVisual.visual),e||this.clearPointerFeedback(),this.syncOrbitPresentation())}animateStrata(e,t,r,i){if(this.destroyed)return()=>{};e===`surface-crossing`&&this.caveRoot?.setEnabled(!0);let a=this.camera.target.clone(),o=this.camera.radius,s=this.selectedVisual?.visual.activeMesh.position.clone()??a,c=e===`surface-approach`?s:e===`exit`?new n(0,-.35,1):new n(0,-1,1),l=e===`surface-approach`?Math.max(.7,(this.selectedVisual?.descriptor.radius??.7)*.82):.9,u=this.reducedMotion?0:e===`surface-approach`?720:560,d=0,f=!1,p=this.scene.onBeforeRenderObservable.add(()=>{if(!(f||this.destroyed))try{d+=Math.max(1,this.engine.getDeltaTime());let e=u===0?1:Math.min(1,d/u),t=e*e*(3-2*e);if(this.camera.setTarget(n.Lerp(a,c,t)),this.camera.radius=o+(l-o)*t,e<1)return;this.scene.onBeforeRenderObservable.remove(p),r()}catch(e){this.scene.onBeforeRenderObservable.remove(p),i(e instanceof Error?e:Error(String(e)))}});return()=>{f||(f=!0,this.scene.onBeforeRenderObservable.remove(p))}}createCave(e){this.specimenByMeshId.clear(),this.caveRoot?.dispose(!1,!0);let t=new g(`answer-strata-root`,this.scene);this.caveRoot=t;let n=[new y(.28,.19,.14),new y(.18,.23,.25),new y(.3,.25,.17),new y(.17,.2,.27)],r=e.layers.length>0?e.layers:[{id:`surface-observation-room`,centerDepth:2.5,thickness:5,colorIndex:1,openingAngle:null}];for(let i of r){let r=f(`cave-wall:${i.id}`,{height:i.thickness+.12,diameter:e.bounds.radius*2,tessellation:18,subdivisions:3,cap:c.NO_CAP,arc:i.openingAngle===null||!e.undatedRoom?1:j(e.undatedRoom).wallArc,enclose:!1},this.scene);r.parent=t,r.position.y=-i.centerDepth,r.rotation.y=i.openingAngle===null||!e.undatedRoom?i.colorIndex*.21:j(e.undatedRoom).wallRotationY,r.scaling.x=1+Math.sin(i.centerDepth*1.7)*.055,r.scaling.z=1+Math.cos(i.centerDepth*1.3)*.07,r.isPickable=!0;let a=new d(`${r.name}:material`,this.scene),o=n[i.colorIndex%n.length];a.diffuseColor=o,a.emissiveColor=o.scale(.36),a.specularColor=new y(.045,.055,.06),a.backFaceCulling=!1,a.twoSidedLighting=!0,r.material=a;let s=f(`cave-seam:${i.id}`,{height:.1,diameter:e.bounds.radius*1.96,tessellation:22,cap:c.NO_CAP},this.scene);s.parent=t,s.position.y=-(i.centerDepth+i.thickness/2),s.isPickable=!1;let l=new d(`${s.name}:material`,this.scene);l.diffuseColor=new y(.035,.085,.1),l.emissiveColor=new y(.035,.19,.22),l.backFaceCulling=!1,s.material=l}this.createCaveCap(t,e),this.createUndatedRoom(t,e);for(let n of e.specimens)this.createSpecimen(t,n);this.createCaveDust(t,e),this.createCaveLights(t,e),this.scene.fogMode=u.FOGMODE_EXP2,this.scene.fogDensity=.028,this.scene.fogColor=new y(.012,.018,.025),t.setEnabled(!1)}createCaveCap(e,t){let n=t.blockedDepth?t.bounds.maxDepth:t.bounds.maxDepth+.25,r=f(`cave-depth-cap`,{height:.55,diameter:t.bounds.radius*1.94,tessellation:18},this.scene);r.parent=e,r.position.y=-n;let i=new d(`cave-depth-cap:material`,this.scene);i.diffuseColor=t.blockedDepth?new y(.22,.16,.12):new y(.08,.1,.12),i.emissiveColor=t.blockedDepth?new y(.06,.025,.012):y.Black(),i.specularColor=y.Black(),r.material=i;let a=o(`surface-crossing-crack`,{radius:1,subdivisions:2},this.scene);a.parent=e,a.position.set(0,-.2,t.bounds.radius-.35),a.scaling.set(1.9,.1,.16),a.isPickable=!1;let s=new d(`surface-crossing-crack:material`,this.scene);s.diffuseColor=new y(.15,.44,.56),s.emissiveColor=new y(.12,.68,.92),a.material=s}createSpecimen(e,t){let n=o(`answer-specimen:${t.answerId}`,{radius:1,subdivisions:2},this.scene);n.parent=e,n.position.set(t.x,-t.depth,t.z),n.scaling.set(t.scale*.72,t.scale*1.65,t.scale),n.rotation.set(t.depth*.17,t.x*.23,t.z*.19),n.isPickable=!0,n.metadata={answerId:t.answerId};let r=new d(`${n.name}:material`,this.scene),i=t.relations.includes(`created`);r.diffuseColor=i?new y(.66,.38,.13):new y(.37,.53,.61),r.emissiveColor=i?new y(.42,.18,.04):new y(.08,.16,.2),r.specularColor=t.relations.includes(`collected`)?new y(.35,.67,.88):new y(.14,.19,.21),r.specularPower=72,n.material=r,this.specimenByMeshId.set(n.uniqueId,t)}createUndatedRoom(e,t){let r=t.undatedRoom;if(!r)return;let a=i(`undated-debris-room`,{diameter:r.radius*2,segments:14,arc:r.openArc,slice:1},this.scene);a.parent=e,a.position.set(r.x,-r.centerDepth,r.z),a.rotation.y=r.angle+Math.PI*.64,a.scaling.y=.78,a.isPickable=!0;let o=new d(`undated-debris-room:material`,this.scene);o.diffuseColor=new y(.16,.19,.22),o.emissiveColor=new y(.025,.055,.065),o.specularColor=new y(.04,.06,.07),o.backFaceCulling=!1,o.twoSidedLighting=!0,a.material=o;let s=Math.hypot(r.x,r.z),l=f(`undated-debris-tunnel`,{height:Math.max(1,s-t.bounds.radius+r.radius*.7),diameter:1.8,tessellation:14,cap:c.NO_CAP},this.scene);l.parent=e,l.position.set(r.x*.63,-r.centerDepth,r.z*.63);let u=j(r),p=new n(u.tunnelDirection.x,0,u.tunnelDirection.z);l.rotationQuaternion=b.Identity(),b.FromUnitVectorsToRef(n.Up(),p,l.rotationQuaternion),l.isPickable=!0,l.material=o}createCaveDust(e,t){let n=new d(`cave-dust:material`,this.scene);n.disableLighting=!0,n.emissiveColor=new y(.18,.29,.32),n.alpha=.38;for(let r=0;r<24;r+=1){let a=i(`cave-dust:${r}`,{diameter:.026+r%3*.009,segments:4},this.scene);a.parent=e;let o=r*2.399963,s=.7+r%7*.48;a.position.set(Math.sin(o)*s,-(.8+r/23*Math.max(1,t.bounds.maxDepth-1.2)),Math.cos(o)*s),a.isPickable=!1,a.material=n}}createCaveLights(e,t){let r=t.layers.length>0?t.layers.map(({centerDepth:e})=>e):[2.2];for(let[t,i]of r.entries()){let r=new te(`cave-light:${t}`,new n(t%2==0?2.4:-2.4,-i,t%3==0?1.7:-1.7),this.scene);r.parent=e,r.diffuse=t%2==0?new y(.22,.52,.66):new y(.58,.31,.16),r.intensity=.72,r.range=9}}applyStarFocus(e){try{this.diagnosticApproachProgressOverride=null,this.diagnosticCameraSamples?.splice(0),this.clearPlanet(),this.focusedStar=e;let t=x(e.s),r=this.currentStarPosition(e);this.starLayer.setFocus(t,e);let i=this.systemFraming(e),a=n.Distance(this.camera.target,r);if(!X(r)||!X(this.camera.target)||!Z(this.camera.radius)||!Z(e.bodyR)||!Z(this.overviewRadius)||!Number.isFinite(a))throw Error(`Invalid camera flight input`);let o=this.cameraFlightController.start({starKey:t,start:{target:this.camera.target,radius:this.camera.radius},targetStar:r,bodyR:e.bodyR,systemExtent:i.extent,overviewRadius:this.overviewRadius,distance:a,requestedMs:1100,reducedMotion:this.reducedMotion});if(o.kind===`started`)this.activeFlight=Object.freeze({flight:o.flight,elapsedMs:0}),this.presentation=q({phase:`approach`,approachProgress:0}),this.recordDiagnosticCameraSample();else if(o.kind===`noop`)this.activeFlight=null,this.camera.setTarget(r),this.camera.radius=i.radius,this.presentation=q({phase:`star-focus`});else throw Error(`Invalid camera flight input`);return this.syncStarLayerPresentation(),this.syncOrbitPresentation(),!0}catch(e){return this.recoverCamera(e),!1}}systemFraming(e){let t=this.planets.filter(t=>t.star===e).map(({orbitR:e,radius:t})=>({orbitR:e,radius:t})),n=jn(e.bodyR,t),r=e.bodyR*8,i=this.overviewRadius*.72;if(!n.ok||!Z(r)||!Z(i)||r>i)throw Error(`Invalid camera flight input`);let a=Math.min(i,Math.max(r,e.bodyR*14,n.value*1.35));if(!Z(a))throw Error(`Invalid camera flight input`);return Object.freeze({extent:n.value,radius:a})}applyModeDimensions(){let e=this.stars.map(({s:e})=>Ae(e,this.mode,this.universe,this.wormIdx));this.interactionByDatum.clear();for(let e of this.stars)this.interactionByDatum.set(e,je(e.s,this.mode,this.universe,this.wormIdx));this.starLayer.setDimensions(e)}isInteractive(e){return this.interactionByDatum.get(e)===!0}isKeyInteractive(e){return Me(this.stars,e,this.mode,this.universe,this.wormIdx)!==null}currentStarPosition(e){return Ce(e,this.motionTime(),this.reducedMotion?0:1.35,this.starPositionScratch)}motionTime(){return this.reducedMotion||this.diagnosticApproachProgressOverride!=null?0:this.elapsedMs}cancelFlight(e){this.diagnosticApproachProgressOverride=null,this.cameraFlightController.cancel(e),this.activeFlight=null,this.presentation=q({phase:this.selected?`planet-focus`:this.focusedStar?`star-focus`:`panorama`}),this.lastPresentationInput=null}updateCameraFlight(e){let t=this.activeFlight;if(!t)return;let n=this.diagnosticApproachProgressOverride,r=typeof n==`number`?t.flight.durationMs*n:t.elapsedMs+e,i=this.cameraFlightController.frame(t.flight,r);if(!i.ok){i.error===`invalid-frame`&&this.recoverCamera(Error(`Invalid camera flight frame`));return}try{let{frame:e}=i;if(![e.target.x,e.target.y,e.target.z,e.radius].every(Number.isFinite)||e.radius<=0)throw Error(`Invalid camera flight pose`);let n=e.progress*e.progress*(3-2*e.progress),a=this.focusedStar?this.currentStarPosition(this.focusedStar):null,o=this.flightTargetScratch.set(e.target.x,e.target.y,e.target.z);if(a&&(o.x+=(a.x-t.flight.to.target.x)*n,o.y+=(a.y-t.flight.to.target.y)*n,o.z+=(a.z-t.flight.to.target.z)*n),!X(o))throw Error(`Invalid camera flight target`);this.camera.setTarget(o),this.camera.radius=e.radius,this.recordDiagnosticCameraSample(),this.presentation=q({phase:`approach`,approachProgress:e.progress}),this.activeFlight=e.complete?null:Object.freeze({flight:t.flight,elapsedMs:r}),e.complete&&(this.diagnosticApproachProgressOverride=null,this.presentation=q({phase:`star-focus`})),this.lastPresentationInput=null,this.syncOrbitPresentation()}catch(e){this.recoverCamera(e)}}setDiagnosticApproachProgress(e){return!1}recordDiagnosticCameraSample(){}recoverCamera(e){this.diagnosticApproachProgressOverride=null;let t=e instanceof Error?e:Error(String(e));Q(()=>this.cameraFlightController.cancel(`reset`)),this.activeFlight=null;let r=null;this.focusedStar&&Q(()=>{r=this.currentStarPosition(this.focusedStar)});let i=null;this.focusedStar&&Q(()=>{i=this.systemFraming(this.focusedStar).radius});let a=this.focusedStar&&this.isInteractive(this.focusedStar)&&Z(this.focusedStar.bodyR)&&r&&X(r)&&i!==null?this.focusedStar:null;if(a){let e=a,t=!1;Q(()=>{this.starLayer.setFocus(x(e.s),e),t=!0}),t||(a=null)}if(Q(()=>this.pointerPresentation.clear()),Q(()=>this.applyPointerPresentationFeedback(!1)),a&&r&&i!==null){let e=!1;Q(()=>{this.camera.setTarget(r),this.camera.radius=i,e=!0}),e||(a=null)}a?this.presentation=q({phase:`star-focus`}):(this.focusedStar=null,Q(()=>this.starLayer.setFocus(null,null)),this.overviewTarget=X(this.overviewTarget)?this.overviewTarget:n.Zero(),this.overviewRadius=Z(this.overviewRadius)?this.overviewRadius:30,Q(()=>this.camera.setTarget(this.overviewTarget)),Q(()=>{this.camera.radius=this.overviewRadius}),this.presentation=q({phase:`panorama`})),Q(()=>this.syncStarLayerPresentation()),this.lastPresentationInput=null,Q(()=>this.syncOrbitPresentation()),this.callbacks.onRenderError?.(t)}updateStellarPresentation(e){let t=+!!this.hoverKey,n=this.reducedMotion?1:Math.min(1,e/150);this.hoverProgress+=(t-this.hoverProgress)*n,this.pressedProgress=+!!this.pressedKey;let r={phase:this.universeVisible?this.selected?`planet-focus`:this.activeFlight?`approach`:this.focusedStar?`star-focus`:`panorama`:`strata`,approachProgress:this.activeFlight&&this.activeFlight.flight.durationMs>0?this.activeFlight.elapsedMs/this.activeFlight.flight.durationMs:void 0,hoverProgress:this.hoverProgress,pressedProgress:this.pressedProgress},i=this.lastPresentationInput;i&&i.phase===r.phase&&i.approachProgress===r.approachProgress&&i.hoverProgress===r.hoverProgress&&i.pressedProgress===r.pressedProgress||(this.presentation=q(r),this.lastPresentationInput=Object.freeze(r),this.syncStarLayerPresentation())}installPointerListeners(){this.canvas.addEventListener(`pointerdown`,this.onPointerDown),this.canvas.addEventListener(`pointermove`,this.onPointerMove),this.canvas.addEventListener(`pointerup`,this.onPointerUp),this.canvas.addEventListener(`pointercancel`,this.onPointerCancel),this.canvas.addEventListener(`lostpointercapture`,this.onLostPointerCapture),this.canvas.addEventListener(`pointerleave`,this.onPointerLeave),this.canvas.addEventListener(`wheel`,this.onWheel),window.addEventListener(`keydown`,this.onKeyDown)}removePointerListeners(){this.canvas.removeEventListener(`pointerdown`,this.onPointerDown),this.canvas.removeEventListener(`pointermove`,this.onPointerMove),this.canvas.removeEventListener(`pointerup`,this.onPointerUp),this.canvas.removeEventListener(`pointercancel`,this.onPointerCancel),this.canvas.removeEventListener(`lostpointercapture`,this.onLostPointerCapture),this.canvas.removeEventListener(`pointerleave`,this.onPointerLeave),this.canvas.removeEventListener(`wheel`,this.onWheel),window.removeEventListener(`keydown`,this.onKeyDown)}onPointerDown=e=>{if(this.destroyed||this.workspaceOpen)return;if(this.canvas.focus({preventScroll:!0}),this.cancelFlight(`user`),this.selected&&this.planetFocusController.state===`focused`){this.planetDragPointerId=e.pointerId,this.planetDragX=e.clientX,this.planetDragY=e.clientY,this.planetDragMovement=0,this.planetDragStartedOnTarget=this.sceneTarget(e.clientX,e.clientY)!==null;try{this.canvas.setPointerCapture(e.pointerId)}catch{}return}let t=this.pointerTarget(e.clientX,e.clientY,Y(e.pointerType));this.pointerPresentation.pointerDown({pointerId:e.pointerId,inputKind:Y(e.pointerType),x:e.clientX,y:e.clientY,starKey:t}),this.applyPointerPresentationFeedback();try{this.canvas.setPointerCapture(e.pointerId)}catch{}};onPointerMove=e=>{if(this.destroyed||this.workspaceOpen)return;if(this.planetDragPointerId===e.pointerId){let t=e.clientX-this.planetDragX,n=e.clientY-this.planetDragY;this.planetDragMovement+=Math.hypot(t,n),this.planetFocusController.drag(t,n),this.planetDragX=e.clientX,this.planetDragY=e.clientY;return}let t=this.pointerPresentation.gestureSnapshot(),n=t.activePointerId===null&&!t.multiPointerInvalidated?this.pointerTarget(e.clientX,e.clientY,Y(e.pointerType)):null;this.pointerPresentation.pointerMove({pointerId:e.pointerId,x:e.clientX,y:e.clientY,starKey:n}),this.applyPointerPresentationFeedback()};onPointerUp=e=>{if(this.destroyed)return;if(this.planetDragPointerId===e.pointerId){this.planetDragPointerId=null,this.canvas.hasPointerCapture(e.pointerId)&&this.canvas.releasePointerCapture(e.pointerId),this.planetDragMovement<6&&!this.planetDragStartedOnTarget&&this.exitHierarchy();return}let t=this.pointerPresentation.gestureSnapshot(),n=this.pointerTarget(e.clientX,e.clientY,Y(e.pointerType)),r=this.pointerPresentation.pointerUp({pointerId:e.pointerId,x:e.clientX,y:e.clientY,starKey:n});this.canvas.hasPointerCapture(e.pointerId)&&this.canvas.releasePointerCapture(e.pointerId),this.applyPointerPresentationFeedback(),r?this.activatePointerTarget(r):t.activePointerId===e.pointerId&&!t.cancelled&&!t.multiPointerInvalidated&&t.accumulatedMovement<6&&t.pressedStarKey===null&&n===null&&this.exitHierarchy()};onPointerCancel=e=>{this.planetDragPointerId===e.pointerId&&(this.planetDragPointerId=null),this.pointerPresentation.pointerCancel(e.pointerId),this.applyPointerPresentationFeedback()};onLostPointerCapture=e=>{this.planetDragPointerId===e.pointerId&&(this.planetDragPointerId=null),this.pointerPresentation.lostPointerCapture(e.pointerId),this.applyPointerPresentationFeedback()};onPointerLeave=()=>{this.pointerPresentation.pointerLeave(),this.applyPointerPresentationFeedback()};onWheel=e=>{if(this.destroyed||this.workspaceOpen)return;if(this.cancelFlight(`user`),this.planetFocusController.wheel(e.deltaY)){e.preventDefault();return}let t=this.selected?(this.selectedVisual?.visual.radius??1)*7.9:this.overviewRadius*.9;Rn(e.deltaY,this.camera.radius,t)&&this.exitHierarchy()};onKeyDown=e=>{if(!(this.destroyed||this.workspaceOpen)){if(this.planetFocusController.keyDown(e.key)){e.preventDefault();return}e.key===`Escape`&&this.exitHierarchy()}};pointerTarget(e,t,n){if(!this.universeVisible)return this.sceneTarget(e,t);let r=this.sceneTarget(e,t);if(r)return r;let i=this.canvas.getBoundingClientRect(),a=this.candidateBuffer.update(this.motionTime(),this.reducedMotion?0:1.35,(e,t)=>{let n=this.projectToCssToRef(this.candidateWorldScratch.set(e.x,e.y,e.z),this.pointerProjectionScratch),r=this.candidateProjectionScratch;return r.x=n.x,r.y=n.y,r.depth=n.z,r.visible=this.universeVisible&&this.isInteractive(t),r}),o=Ft({x:e-i.left,y:t-i.top,inputKind:n,viewport:{width:i.width,height:i.height}},a);return o?`star:${o.starKey}`:null}sceneTarget(e,t){let n=this.canvas.getBoundingClientRect(),r=(e-n.left)*this.engine.getRenderWidth()/Math.max(1,n.width),i=(t-n.top)*this.engine.getRenderHeight()/Math.max(1,n.height),a=this.scene.pick(r,i)?.pickedMesh;if(!a)return null;let o=this.specimenByMeshId.get(a.uniqueId);if(o)return`specimen:${o.answerId}`;let s=this.visualByMeshId.get(a.uniqueId);return s&&s.visual.activeMesh.isEnabled()&&s.visual.activeMesh.isPickable?`planet:${s.datum.question.id}`:null}activatePointerTarget(e){if(e.startsWith(`star:`)){this.focusStar(e.slice(5));return}if(e.startsWith(`planet:`)){let t=this.visualByQuestion.get(e.slice(7)),n=t&&`id`in t.datum.star.s?t.datum.star.s.id:null;t&&n&&this.selectQuestionPlanet(n,t.datum.question.id);return}e.startsWith(`specimen:`)&&this.strataTransition.focusAnswer(e.slice(9))}exitHierarchy(){let e=Ln(this.universeVisible?this.selected?`planet-focus`:this.activeFlight||this.focusedStar?`star-focus`:`panorama`:`strata`);e===`star-focus`?this.clearPlanet():e===`panorama`&&(this.resetView(),this.callbacks.onPick?.(null))}clearPointerFeedback(){this.pointerPresentation.clear(),this.applyPointerPresentationFeedback(),this.hoverProgress=0,this.pressedProgress=0}applyPointerPresentationFeedback(e=!0){let t=this.pointerPresentation.snapshot();this.hoverKey=t.hoverStarKey,this.pressedKey=t.pressedStarKey,this.canvas.style.cursor=t.cursor,e&&this.syncStarLayerPresentation()}syncStarLayerPresentation(){(this.lastLayerPresentation!==this.presentation||this.lastLayerHoverKey!==this.hoverKey||this.lastLayerPressedKey!==this.pressedKey)&&(this.starLayer.setPresentation(this.presentation,this.hoverKey,this.pressedKey),this.lastLayerPresentation=this.presentation,this.lastLayerHoverKey=this.hoverKey,this.lastLayerPressedKey=this.pressedKey)}resizeLabels(){let e=this.labelCanvas.getBoundingClientRect(),t=Math.min(window.devicePixelRatio||1,2);this.labelCanvas.width=Math.max(1,Math.round(e.width*t)),this.labelCanvas.height=Math.max(1,Math.round(e.height*t))}reportProbeUnsupported(e,t){if(this.destroyed)return;let n=this.probes.has(e)?`Babylon 垂直样片尚未迁移探测器检查。`:`未知探测器：${e}`;this.callbacks.onProbeError?.({probeId:e,token:t,cause:Yn(n)})}};function Jn(e){return`id`in e.s?e.s.id:e.s.c}function Yn(e){let t=Error(e);return t.name=`UnsupportedRendererFeatureError`,t}function Y(e){return e===`touch`||e===`pen`?e:`mouse`}function X(e){return[e.x,e.y,e.z].every(Number.isFinite)}function Z(e){return Number.isFinite(e)&&e>0}function Q(e){try{e()}catch{}}function $(e){(e.getContext(`webgl2`)??e.getContext(`webgl`))?.getExtension(`WEBGL_lose_context`)?.loseContext()}function Xn(t,n){let r=ue([...t.answersById.values()]),i=[];for(let a of n)if(`id`in a.s)for(let n of e(t,a.s)){let e=de(n,r),t=zn+(n.orbitIndex-1)*Bn;i.push(Object.freeze({star:a,question:n.question,answerCount:n.answerCount,created:n.created,collected:n.collected,...n.latestPublicAt===void 0?{}:{latestPublicAt:n.latestPublicAt},answers:n.answers,material:e,orbitIndex:n.orbitIndex,index:i.length,u:[a.sysU[0],a.sysU[1],a.sysU[2]],v:[a.sysV[0],a.sysV[1],a.sysV[2]],orbitR:t,phase:(n.orbitIndex*137.508+a.seed*31.7)*Math.PI/180,period:7+2.4*t**1.5,radius:Vn+.115*e.answerDensity}))}return Object.freeze(i)}function Zn(e,t,n,r,i){return new qn(e,t,n,r,i)}export{Zn as createRenderer};