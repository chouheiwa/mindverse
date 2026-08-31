import{c as e,o as t}from"./api-vGgttR-j.js";import{A as n,B as r,C as i,F as a,G as o,H as s,I as c,L as l,M as u,Q as d,R as f,S as p,T as m,U as h,V as g,W as _,Z as v,a as y,b,c as x,g as S,i as C,j as ee,k as w,l as te,m as ne,n as re,o as T,p as E,q as ie,s as D,t as ae,u as O,v as k,w as oe,x as A,y as se,z as j}from"./three-D9i4NVAn.js";import{a as ce,i as le,n as ue,o as M,r as de,s as fe,t as pe}from"./postprocessing-wtPlhSw8.js";import{n as me,r as N}from"./Universe-BDIAbubB.js";var P=`
vec3 orbitAround(vec3 p, vec3 c, vec3 axis, float period, float t) {
  vec3 o = p - c;
  float r = length(o);
  if (r < 0.35 || period <= 0.0) return p;
  float th = 6.28318530718 / period * t;
  float ct = cos(th);
  float st = sin(th);
  return c + o * ct + cross(axis, o) * st + axis * dot(axis, o) * (1.0 - ct);
}
`,F=`
float depthFade(float viewZ, float near, float far) {
  float d = clamp((far - viewZ) / max(1e-3, far - near), 0.0, 1.0);
  return d * d;
}
`,I=`
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
`,he=`
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
`,L=class e{cleanups=[];closed=!1;defer(e){let t=!0,n=()=>{t&&(t=!1,e())};return this.closed?(n(),n):(this.cleanups.push(n),n)}use(e){return this.defer(()=>e.dispose()),e}release(){if(this.closed)return()=>void 0;this.closed=!0;let e=this.cleanups;this.cleanups=[];let t=!1;return()=>{if(!t){t=!0;for(let t=e.length-1;t>=0;t--)e[t]()}}}dispose(){this.release()()}static construct(t){let n=new e;try{return t(n)}catch(e){throw n.dispose(),e}}},ge=class{ready=!1;failed=!1;destroyed=!1;onReady;onError;constructor(e,t){this.onReady=e,this.onError=t}frameSucceeded(){return this.destroyed||this.ready||this.failed?!1:(this.ready=!0,this.onReady?.(),!0)}frameFailed(e){this.destroyed||this.failed||(this.failed=!0,this.onError?.(e instanceof Error?e:Error(String(e))))}destroy(){this.destroyed=!0}},R=6400,_e=1.92;function z(e,t){let n=Math.max(0,t);return e<125?-Math.min(1,n/68):Math.min(1,n/62)}function ve(e,t){return R*_e**+z(e,t)}function ye(e){let t=V(e,1e3,4e4)/100,n=t<=66?255:329.698727446*(t-60)**-.1332047592,r=t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*(t-60)**-.0755148492,i=t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307,a=[be(V(n,0,255)/255),be(V(r,0,255)/255),be(V(i,0,255)/255)],o=Math.max(a[0],a[1],a[2])||1;return[a[0]/o,a[1]/o,a[2]/o]}function B(e,t){return ye(ve(e,t))}function be(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function V(e,t,n){return e<t?t:e>n?n:e}var H=2.25;function xe(e){return e?.38:1}function U(e){let t=0;for(let n of e.stars)t=Math.max(t,Math.hypot(n.p[0],n.p[1],n.p[2]));for(let n of e.clusters)t=Math.max(t,Math.hypot(n.c[0],n.c[1],n.c[2]));return Math.max(60,t)}function W(e){let t=[...e.clusters].sort((e,t)=>t.n-e.n).slice(0,3),n=e=>{let n=t[e]??t[0];if(!n)return new D(.6,.7,1);let[r,i,a]=B(n.hue,n.sat);return new D(r,i,a)},r=n(2).clone().lerp(new D(1,1,1),.62);return[new D(.12,.19,.66).lerp(n(0),.26),new D(.54,.16,.6).lerp(n(1),.3),new D(.04,.42,.48).lerp(r,.26)]}var G=[{r:1,freq:3.4,warp:1.1,low:.1,high:.62,flat:1.45,dust:.55,spin:.0042},{r:1.62,freq:2.3,warp:.85,low:.16,high:.7,flat:1.05,dust:.38,spin:.0026},{r:2.45,freq:1.5,warp:.55,low:.24,high:.8,flat:.72,dust:.2,spin:.0015}];function K(e,t,n,r){return L.construct(i=>Se(e,t,n,r,i))}function Se(e,t,r,i,a){let o=new k,s=[],c=[];G.forEach((l,u)=>{let d=a.use(we(e,i.nebulaBake,{freq:l.freq,warp:l.warp,low:l.low,high:l.high,flat:l.flat,dust:l.dust,seed:3.7+u*17.3,colA:r[0],colB:r[1],colC:r[2]})),f=i.shellGain[u],p=a.use(new h({uniforms:{uMap:{value:d.texture},uGain:{value:f}},vertexShader:`
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        uniform samplerCube uMap;
        uniform float uGain;
        varying vec3 vDir;
        void main() {
          gl_FragColor = vec4(textureCube(uMap, normalize(vDir)).rgb * uGain, 1.0);
        }
      `,side:1,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),m=a.use(new C(1,1,1)),g=new n(m,p);g.scale.setScalar(t*l.r*22),g.renderOrder=-40+u,g.frustumCulled=!1,g.rotation.set(u*1.31,u*2.17,u*.73),o.add(g),s.push({mesh:g,spin:l.spin}),c.push({u:p.uniforms.uGain,base:f})});let l=Ce(t,r[1],i.coreGain,a);return o.add(l),c.push({u:l.material.uniforms.uGain,base:i.coreGain}),{group:o,update(e,t){s.forEach((t,n)=>{t.mesh.rotation.set(n*1.31,n*2.17+e*t.spin,n*.73)}),l.quaternion.copy(t.quaternion)},setDim(e){for(let t of c)t.u.value=t.base*e},dispose:a.release()}}function Ce(e,t,r,i){let a=i.use(new h({uniforms:{uTint:{value:t.clone()},uGain:{value:r}},vertexShader:`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      uniform vec3 uTint;
      uniform float uGain;
      varying vec2 vUv;
      void main() {
        // 扁的：星系核心是个透视中的盘，不是球
        vec2 p = (vUv - 0.5) * vec2(2.0, 5.2);
        float d = length(p);
        float halo = exp(-d * 2.6) * 0.16 + exp(-d * 7.5) * 0.40;
        gl_FragColor = vec4(mix(uTint, vec3(1.0), 0.45) * halo * uGain, 1.0);
      }
    `,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),o=new n(i.use(new c(e*H,e*H)),a);return o.renderOrder=-5,o.frustumCulled=!1,o}function we(e,t,r){let i=new ae(t,{type:se,format:j,generateMipmaps:!1,minFilter:m,magFilter:m}),a=new L;try{let t=a.use(new h({uniforms:{uFreq:{value:r.freq},uWarp:{value:r.warp},uLow:{value:r.low},uHigh:{value:r.high},uFlat:{value:r.flat},uDust:{value:r.dust},uSeed:{value:r.seed},uColA:{value:r.colA.clone()},uColB:{value:r.colB.clone()},uColC:{value:r.colC.clone()}},vertexShader:`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      ${I}
      ${he}
      uniform float uFreq, uWarp, uLow, uHigh, uFlat, uDust, uSeed;
      uniform vec3 uColA, uColB, uColC;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
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
    `,side:1,depthWrite:!1,depthTest:!1})),o=new s,c=new n(a.use(new C(10,10,10)),t);c.frustumCulled=!1,o.add(c);let l=new te(.5,40,i),u=e.getRenderTarget();try{l.update(e,o)}finally{e.setRenderTarget(u)}return a.dispose(),i}catch(e){throw a.dispose(),i.dispose(),e}}function q(e){let t=[Math.sin(e*1.7+.4),Math.cos(e*2.3)+.55,Math.sin(e*3.1+1.2)],n=Math.hypot(t[0],t[1],t[2])||1;return[t[0]/n,t[1]/n,t[2]/n]}function J(e,t){let n=Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]);return n<.35?0:Math.min(20+1.9*n**1.5,120)}function Te(e,t,n,r=44){let i=Math.abs(t[1])<.9?[0,1,0]:[1,0,0],a=[t[1]*i[2]-t[2]*i[1],t[2]*i[0]-t[0]*i[2],t[0]*i[1]-t[1]*i[0]],o=Math.hypot(a[0],a[1],a[2])||1;a[0]/=o,a[1]/=o,a[2]/=o;let s=[t[1]*a[2]-t[2]*a[1],t[2]*a[0]-t[0]*a[2],t[0]*a[1]-t[1]*a[0]],c=[];for(let t=0;t<r;t++){let i=t/r*Math.PI*2,o=Math.cos(i)*n,l=Math.sin(i)*n;c.push([e[0]+a[0]*o+s[0]*l,e[1]+a[1]*o+s[1]*l,e[2]+a[2]*o+s[2]*l])}return c}var Ee=5200;function De(e,t,n,r){let i=e.p[0]-e.center[0],a=e.p[1]-e.center[1],o=e.p[2]-e.center[2],s=e.period===0?0:Math.PI*2/e.period*(t/1e3),c=Math.cos(s),l=Math.sin(s),u=e.axis[0]*i+e.axis[1]*a+e.axis[2]*o,d=e.axis[1]*o-e.axis[2]*a,f=e.axis[2]*i-e.axis[0]*o,p=e.axis[0]*a-e.axis[1]*i,m=Math.sin(t/(6400+e.seed*311%5200)+e.seed)*n;return r.set(e.center[0]+i*c+d*l+e.axis[0]*(u*(1-c)+m),e.center[1]+a*c+f*l+e.axis[1]*(u*(1-c)+m),e.center[2]+o*c+p*l+e.axis[2]*(u*(1-c)+m))}function Oe(e){let t=e.stars,n=Math.max(1,...t.map(e=>e.n)),r=new Map,i=new Map;for(let t of e.clusters)r.set(t.g,t.c),i.set(t.g,q(t.g));let a=new Map;[...t].sort((e,t)=>t.pe*Math.log(1+t.n)-e.pe*Math.log(1+e.n)).forEach((e,t)=>a.set(e.c,Ee+t*62));let o=Y(97);return t.map(e=>{let t=r.get(e.g)??[0,0,0],s=i.get(e.g)??[0,1,0],c=e.n/n,l=ke(e.c),[u,d]=Ae(l);return{s:e,p:[e.p[0],e.p[1],e.p[2]],center:t,axis:s,period:J(e.p,t),start:je(o),ignite:a.get(e.c)??0,pointSize:3.4+11*c**.55,bodyR:.3+.95*c**.55,bright:.3+.7*e.pe,burst:e.bu,seed:e.n,rot:o()*Math.PI,color:B(e.hue,e.sat),kelvin:ve(e.hue,e.sat),sysAxis:l,sysU:u,sysV:d}})}function ke(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);let n=Y(t>>>0),r=[(n()-.5)*1.3,.75+n()*.5,(n()-.5)*1.3],i=Math.hypot(r[0],r[1],r[2])||1;return[r[0]/i,r[1]/i,r[2]/i]}function Ae(e){let t=Math.abs(e[1])<.9?[0,1,0]:[1,0,0],n=[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],r=Math.hypot(n[0],n[1],n[2])||1;return n[0]/=r,n[1]/=r,n[2]/=r,[n,[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]]]}function je(e){let t=e()*Math.PI*2,n=Math.acos(2*e()-1),r=2+e()*5;return[r*Math.sin(n)*Math.cos(t),r*Math.sin(n)*Math.sin(t),r*Math.cos(n)]}function Y(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}var X={core:.72,glow:4.3,flare:10.5},Z={core:4.6,glow:1.05,flare:1.7},Me=.85,Ne=`
${P}
${F}

attribute vec3 aStart;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute vec3 aColor;
attribute float aPeriod;
attribute float aSize;
attribute float aBright;
attribute float aBurst;
attribute float aSeed;
attribute float aIgnite;
attribute float aDim;
attribute float aRot;
attribute float aBodyR;

uniform float uT;          // 毫秒
uniform float uConverge;   // 0..1，创世收敛
uniform float uProjScale;  // (drawingBufferHeight / 2) / tan(fov / 2)
uniform float uNear;
uniform float uFar;
uniform float uSizeMul;
uniform float uIgniteMs;
uniform float uLitFloor;  // 跳过创世时把全部星强制点亮
uniform float uBob;

uniform float uFlareShape;   // 1 = 星芒层，尺寸随亮度收缩
uniform float uFadeToBody;   // 1 = 靠近后交给球体接管（只有硬核层这么做）
uniform float uNearMul;      // 近距离时改用「恒星半径的多少倍」当精灵尺寸
uniform float uMaxPx;        // 屏幕尺寸上限

varying vec3 vColor;
varying float vAlpha;
varying float vBright;
varying float vBase;
varying float vRot;
varying float vSphereIn;

void main() {
  float lit = max(uLitFloor, clamp((uT - aIgnite) / uIgniteMs, 0.0, 1.0));

  vec3 target = orbitAround(position, aCenter, aAxis, aPeriod, uT * 0.001);
  // 沿自转轴的轻微起伏 —— 否则半径接近 0 的主星会僵在原地
  target += aAxis * sin(uT / (6400.0 + mod(aSeed * 311.0, 5200.0)) + aSeed) * uBob;

  vec3 p = mix(aStart, target, uConverge);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;

  float tw = 1.0 - (0.09 + 0.26 * aBurst)
           * (0.5 + 0.5 * sin(uT / (760.0 + mod(aSeed * 53.0, 900.0)) + aSeed * 1.7));

  vBright = aBright * tw;
  vBase = aBright;
  vColor = aColor;
  vRot = aRot;
  // 球体在 6→18px 之间渐显，硬核点精灵在同一区间渐隐 —— 两者在同一坐标上、
  // 用同一条曲线，加起来恒为一，所以看不出交接。
  // 阈值必须和 gl/bodies.ts 里恒星球体的 lod 一致；取 6 而不是 2，是因为
  // 全景里最大的恒星也才 6px 左右，卡在 2 会让全景提前变暗。
  float sphereIn = smoothstep(6.0, 18.0, aBodyR * uProjScale / viewZ);
  float handover = 1.0 - uFadeToBody * sphereIn;

  vSphereIn = sphereIn;
  vAlpha = vBright * aDim * lit * handover * depthFade(viewZ, uNear, uFar);

  // 远处：精灵尺寸沿用 aSize，那是让全景好看的那套标定。
  // 近处：改成恒星半径的固定倍数 —— 日冕本来就是恒星半径的几倍，
  // 而不是一个跟距离无关的巨大常数。不换的话飞进去时辉光有五千像素宽。
  float shape = mix(1.0, smoothstep(0.80, 1.0, aBright), uFlareShape);
  float world = mix(aSize * uSizeMul, aBodyR * uNearMul, sphereIn);
  gl_PointSize = min(world * (uProjScale / viewZ) * (0.35 + 0.65 * lit) * shape, uMaxPx);
}
`,Pe=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(uv, uv);
  if (d2 > 1.0) discard;
  // 热核偏白：恒星中心的有效色温总是高于外缘，纯色心会显得像塑料珠
  vec3 c = mix(vColor, vec3(1.0), 0.74);
  gl_FragColor = vec4(c * exp(-d2 * 7.5) * vAlpha * uGain, 1.0);
}
`,Fe=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
varying float vSphereIn;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  if (d > 1.0) discard;
  // 两段叠加：内段紧、外段松。单段指数衰减会画出生硬的渐变环
  float a = exp(-d * 4.6) * 0.62 + pow(1.0 - d, 3.0) * 0.42;

  // 球体接管之后要把中心掏空 —— 这层是**日冕**，环在恒星外面。
  // 不掏空就是一坨加性光正好糊在球面上，临边昏暗和米粒组织全被冲成死白，
  // 球体等于白做。洞的半径对应精灵里球体占的那一份（1 / uNearMul * 2）。
  a *= mix(1.0, smoothstep(0.13, 0.30, d), vSphereIn);

  gl_FragColor = vec4(vColor * a * vAlpha * uGain, 1.0);
}
`,Ie=`
uniform float uGain;
uniform float uThreshold;
varying vec3 vColor;
varying float vAlpha;
varying float vBase;
varying float vRot;
void main() {
  // 亮度不够就整个精灵不画 —— 每颗星都长芒会立刻变成廉价滤镜
  float gate = smoothstep(uThreshold, uThreshold + 0.14, vBase);
  if (gate <= 0.001) discard;

  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;

  float c = cos(vRot);
  float s = sin(vRot);
  vec2 p = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);

  // 四主芒 + 两副芒：沿芒方向衰减慢，垂直方向衰减极快，这才是衍射的形状
  float h  = exp(-abs(p.x) * 2.4)  * exp(-abs(p.y) * 150.0);
  float v  = exp(-abs(p.y) * 2.4)  * exp(-abs(p.x) * 150.0);
  float k  = 0.70710678;
  float u1 = (p.x + p.y) * k;
  float u2 = (p.x - p.y) * k;
  float a1 = exp(-abs(u1) * 3.6) * exp(-abs(u2) * 230.0);
  float a2 = exp(-abs(u2) * 3.6) * exp(-abs(u1) * 230.0);

  float spikes = (h + v + 0.42 * (a1 + a2)) * smoothstep(1.0, 0.12, d);
  gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.62) * spikes * vAlpha * gate * uGain, 1.0);
}
`;function Le(e,t,n=Oe(e)){return L.construct(r=>Re(e,t,n,r))}function Re(e,t,n,r){let i=e.stars,a=i.length,o=new Float32Array(a*3),s=new Float32Array(a*3),c=new Float32Array(a*3),u=new Float32Array(a*3),f=new Float32Array(a*3),p=new Float32Array(a),m=new Float32Array(a),g=new Float32Array(a),v=new Float32Array(a),b=new Float32Array(a),x=new Float32Array(a),S=new Float32Array(a).fill(1),C=new Float32Array(a),ee=new Float32Array(a);n.forEach((e,n)=>{o.set(e.p,n*3),c.set(e.center,n*3),u.set(e.axis,n*3),s.set(e.start,n*3),f.set(e.color,n*3),p[n]=e.period,m[n]=e.pointSize,g[n]=e.bright,v[n]=t?0:e.burst,b[n]=e.seed,x[n]=e.ignite,C[n]=e.rot,ee[n]=e.bodyR});let w=new T;r.use(w),w.setAttribute(`position`,new y(o,3)),w.setAttribute(`aStart`,new y(s,3)),w.setAttribute(`aCenter`,new y(c,3)),w.setAttribute(`aAxis`,new y(u,3)),w.setAttribute(`aColor`,new y(f,3)),w.setAttribute(`aPeriod`,new y(p,1)),w.setAttribute(`aSize`,new y(m,1)),w.setAttribute(`aBright`,new y(g,1)),w.setAttribute(`aBurst`,new y(v,1)),w.setAttribute(`aSeed`,new y(b,1)),w.setAttribute(`aIgnite`,new y(x,1)),w.setAttribute(`aDim`,new y(S,1)),w.setAttribute(`aRot`,new y(C,1)),w.setAttribute(`aBodyR`,new y(ee,1)),w.boundingSphere=new _(new d,1e6);let te={uT:{value:0},uConverge:{value:+!!t},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3},uIgniteMs:{value:700},uLitFloor:{value:+!!t},uBob:{value:t?0:1.35}},ne=(e,t,n,i={})=>r.use(new h({uniforms:{...te,uSizeMul:{value:t},uGain:{value:n},uFlareShape:{value:0},uFadeToBody:{value:0},uNearMul:{value:7},uMaxPx:{value:520},...i},vertexShader:Ne,fragmentShader:e,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),re=ne(Fe,X.glow,Z.glow,{uNearMul:{value:7.5},uMaxPx:{value:520}}),E=ne(Pe,X.core,Z.core,{uFadeToBody:{value:1},uMaxPx:{value:90}}),ie=ne(Ie,X.flare,Z.flare,{uThreshold:{value:Me},uFlareShape:{value:1},uNearMul:{value:26},uMaxPx:{value:360}}),D=new k;for(let[e,t]of[[re,10],[E,12],[ie,14]]){let n=new l(w,e);n.renderOrder=t,n.frustumCulled=!1,D.add(n)}let ae=[re,E,ie],O=w.getAttribute(`aDim`),oe=r.release();return{group:D,order:i,igniteEnd:Ee+a*62+1500,setUniform(e,t){for(let n of ae)n.uniforms[e]&&(n.uniforms[e].value=t)},setDim(e,t,n){for(let r=0;r<a;r++)S[r]=Be(i[r],e,t,n);O.needsUpdate=!0},dispose:oe}}function ze(e,t,n,r){switch(t){case`dark`:return n.dark.some(t=>t.c===e.c)?1:.08;case`nebula`:return n.nebula.some(t=>t.c===e.c)?1:.1;case`worm`:{let t=n.wormholes[r];return t&&(e.g===t.a||e.g===t.b)?1:.11}case`me`:return n.meta.own===0||e.o>0?1:.1;case`solo`:return .12;default:return 1}}function Be(e,t,n,r){let i=ze(e,t,n,r);return n.dark.some(t=>t.c===e.c)?Math.min(i,.3):i}var Ve=.9,He=(e,t,n)=>Math.max(t,Math.min(n,e)),Ue=(e,t,n)=>{let r=He((n-e)/Math.max(1e-6,t-e),0,1);return r*r*(3-2*r)};function We(e){let t=He((e.far-e.viewZ)/Math.max(.001,e.far-e.near),0,1);return e.renderDim*Ue(13,40,e.starPx)*Ue(Ve,1,e.convergence)*t*t}function Ge(e){return e.clipZ>=-1&&e.clipZ<=1&&We(e)>.004}function Ke(e){let t=new Map;for(let n of e){let e=t.get(n.star);e?e.push(n):t.set(n.star,[n])}return t}function qe(e,t,n){return e.find(e=>`id`in e.star.s&&e.star.s.id===t&&e.question.id===n)??null}var Je=.12;function Ye(e,t){return!t||e?1:Je}function Xe(e,t){return Ye(e===t,t!==null)}var Ze=[`basalt`,`strata`,`cloud`,`archive`],Qe=Math.log1p(30),$e=.35,et=4294967296;function tt(e){return Ze.indexOf(e)}function nt(e){let t=new Map(Ze.map(e=>[e,[]]));return e.forEach((e,n)=>t.get(e.family).push(n)),Ze.flatMap(e=>{let n=t.get(e);return n.length===0?[]:[Object.freeze({family:e,globalIndices:Object.freeze(n)})]})}function rt(e,t){let n=Array.from({length:t},()=>null),r=new Map;for(let i of e){if(r.has(i.family))throw Error(`duplicate planet family group: ${i.family}`);r.set(i.family,i.globalIndices),i.globalIndices.forEach((e,r)=>{if(!Number.isSafeInteger(e)||e<0||e>=t)throw Error(`invalid global planet index: ${e}`);if(n[e]!==null)throw Error(`duplicate global planet index: ${e}`);n[e]=Object.freeze({family:i.family,instanceIndex:r})})}return Object.freeze({toLocal(e){return Number.isSafeInteger(e)&&e>=0&&e<n.length?n[e]:null},toGlobal(e,t){let n=r.get(e);return n&&Number.isSafeInteger(t)&&t>=0&&t<n.length?n[t]:null}})}function it(e,t){let n=Number.isFinite(t)?Math.max(0,t):0;return e===`far`?n>=18?`medium`:`far`:e===`near`?n<=72?`medium`:`near`:n<12?`far`:n>=84?`near`:`medium`}function at(e){return Number.isFinite(e)?Math.min(1,Math.max(0,e)):0}function ot(e){return typeof e==`number`&&Number.isFinite(e)&&e>0}function st(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}function ct(e){let t=1/0,n=-1/0;for(let r of e)for(let e of[r.publishedAt,r.updatedAt])ot(e)&&(t=Math.min(t,e),n=Math.max(n,e));return Object.freeze(!Number.isFinite(t)||!Number.isFinite(n)?{earliest:null,latest:null,duration:0}:{earliest:t,latest:n,duration:Math.max(0,n-t)})}function lt(e,t){let n=st(e.question.id),r=[],i=[],a=!1,o=!1;for(let t of e.answers){ot(t.publishedAt)&&(i.push(t.publishedAt),r.push(t.publishedAt)),ot(t.updatedAt)&&r.push(t.updatedAt);for(let e of t.bindings)e.relation===`created`&&(a=!0),e.relation===`collected`&&(o=!0)}let s=r.length>0?Math.max(...r):null,c=s===null||t.earliest===null||t.latest===null?$e:t.duration===0?.5:at((s-t.earliest)/t.duration),l=null;if(i.length>=2){let e=Math.max(...i)-Math.min(...i);l=Number.isFinite(e)?Math.min(2**53-1,Math.max(0,e)):2**53-1}let u=Math.log1p(e.question.answerIds.length)/Qe;return Object.freeze({seed:n/et,family:Ze[n%Ze.length],answerDensity:at(u),timeSpan:l,freshness:c,divergence:null,created:a,collected:o})}var ut=2.1,dt=1.15,ft=.085,pt={star:1.9,planet:.92,ring:.1},mt=`
${P}
${F}
attribute vec3 iPos;
attribute vec3 iCenter;
attribute vec3 iAxis;
attribute vec3 iStart;
attribute vec3 iColor;
// x=period y=ignite z=radius w=seed
attribute vec4 iOrb;
// x=kelvin y=dim
attribute vec2 iMeta;

uniform float uT;
uniform float uConverge;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
uniform float uIgniteMs;
uniform float uLitFloor;
uniform float uBob;

varying vec3 vColor;
varying vec3 vN;
varying vec3 vLocal;
varying vec3 vView;
varying float vAlpha;
varying float vKelvin;
varying float vSeed;

void main() {
  float lit = max(uLitFloor, clamp((uT - iOrb.y) / uIgniteMs, 0.0, 1.0));
  vec3 target = orbitAround(iPos, iCenter, iAxis, iOrb.x, uT * 0.001);
  target += iAxis * sin(uT / (6400.0 + mod(iOrb.w * 311.0, 5200.0)) + iOrb.w) * uBob;
  vec3 c = mix(iStart, target, uConverge);

  vec3 world = c + normalize(position) * iOrb.z * lit;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;

  // 屏幕上的半径决定它该不该现形；和点精灵的淡出互补，两边加起来恒为一。
  // 这两个阈值必须和 gl/stars.ts 的 sphereIn 逐字一致
  float px = iOrb.z * uProjScale / viewZ;
  float lod = smoothstep(6.0, 18.0, px);

  vN = normalize(normalMatrix * normalize(position));
  vLocal = normalize(position);
  vView = mv.xyz;
  vColor = iColor;
  vKelvin = iMeta.x;
  vSeed = iOrb.w;
  vAlpha = iMeta.y * lit * lod * depthFade(viewZ, uNear, uFar);
}
`,ht=`
${I}
uniform float uT;
uniform float uGain;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vLocal;
varying vec3 vView;
varying float vAlpha;
varying float vKelvin;
varying float vSeed;

void main() {
  if (vAlpha <= 0.004) discard;
  vec3 n = normalize(vLocal);

  // 米粒组织：三层噪声就够，不用整套 fbm —— 这是逐像素跑在可能占满屏的球上。
  // 频率刻意取高：低频噪声在球面上会长成一块块环形山，那读起来是卫星不是恒星。
  float t = uT * 0.00009;
  float g = snoise(n * 6.2 + vec3(vSeed, t, -t)) * 0.50
          + snoise(n * 15.0 - vec3(t * 1.7, vSeed, t)) * 0.32
          + snoise(n * 34.0 + vec3(-t, t * 2.2, vSeed)) * 0.18;

  // 冷星表面粗粝翻滚，热星平滑刺眼 —— 这是色温在表面上的样子
  float rough = clamp((5600.0 - vKelvin) / 2800.0, 0.0, 1.0);
  float cell = clamp(0.5 + 0.62 * g, 0.0, 1.0);
  cell = mix(0.88, cell, 0.30 + 0.70 * rough);

  // 临边昏暗：中心亮、边缘暗。这是「它是个球」最强的一个信号
  float mu = clamp(dot(normalize(vN), normalize(-vView)), 0.0, 1.0);
  float limb = 0.30 + 0.70 * pow(mu, 0.58);

  // 色球：最边上那一圈更冷更红，而且要比昏暗的过渡带亮一点点 ——
  // 真恒星的边缘不是渐隐到黑，是有一道薄薄的亮边
  float chromo = pow(1.0 - mu, 7.0);

  vec3 core = mix(vColor, vec3(1.0), 0.78);
  vec3 edge = mix(vColor, vec3(1.0, 0.58, 0.30), 0.42);
  vec3 col = mix(edge, core, limb * (0.45 + 0.55 * cell));

  float lum = limb * (0.68 + 0.32 * cell) + chromo * 0.55;
  gl_FragColor = vec4(col * lum * vAlpha * uGain, 1.0);
}
`,gt=`
${P}
${F}
// xyz=orbit basis U, w=dim
attribute vec4 iBasisDim;
attribute vec3 iStarPos;
attribute vec3 iStarCenter;
// xyz=star axis, w=LOD (0 far, 1 medium, 2 near)
attribute vec4 iAxisLod;
// xyz=star color, w=selected
attribute vec4 iColorSelected;
// x=orbitR y=phase z=period w=planetR
attribute vec4 iOrb;
// x=own*2+fresh y=starSeed z=starR w=starPeriod
//   own   ∈{0,1}  是否本人创作
//   fresh ∈[0,1)  内容的新旧，1 近 0 远
attribute vec4 iMeta;
// x=seed y=answerDensity z=freshness w=familyIndex
attribute vec4 iSurface;
// x=timeSpan y=hasTimeSpan z=created w=collected
attribute vec4 iChronicle;

uniform float uT;
uniform float uConverge;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
uniform float uBob;

varying vec3 vColor;
varying vec3 vN;
varying vec3 vL;
varying vec3 vV;
varying float vAlpha;
varying float vFresh;
varying float vSeed;
varying float vSel;
varying float vPlanetPx;
varying vec3 vLocal;
varying float vDensity;
varying float vCreated;
varying float vLod;

void main() {
  vec3 starW = orbitAround(iStarPos, iStarCenter, iAxisLod.xyz, iMeta.w, uT * 0.001);
  starW += iAxisLod.xyz * sin(uT / (6400.0 + mod(iMeta.y * 311.0, 5200.0)) + iMeta.y) * uBob;

  float th = iOrb.y + 6.28318530718 / iOrb.z * (uT * 0.001);
  // Three 的内建 normal 槽携带每实例恒星系轴；这样可恢复正确 V，且不超过 16 个顶点槽。
  vec3 planetV = normalize(cross(normal, iBasisDim.xyz));
  vec3 centerW = starW + (iBasisDim.xyz * cos(th) + planetV * sin(th)) * iOrb.x;
  vec3 nrm = normalize(position);
  vec3 world = centerW + nrm * iOrb.w;

  vec4 mvC = modelViewMatrix * vec4(centerW, 1.0);
  vec4 mvS = modelViewMatrix * vec4(starW, 1.0);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  // LOD 挂在**恒星**的屏幕大小上，不是行星自己的 —— 否则一颗大行星会
  // 在恒星还是个点的时候先冒出来
  float starPx = iMeta.z * uProjScale / max(1.0, -mvS.z);
  float lod = smoothstep(${13 .toFixed(1)}, ${40 .toFixed(1)}, starPx);

  vN = normalize(normalMatrix * nrm);
  vL = mvS.xyz - mv.xyz;
  vV = -mv.xyz;
  vFresh = iSurface.z;
  vSeed = iSurface.x;
  vSel = iColorSelected.w;
  vPlanetPx = iOrb.w * uProjScale / max(1.0, -mvC.z);
  vLocal = nrm;
  vDensity = iSurface.y;
  vCreated = iChronicle.z;
  vLod = iAxisLod.w;
  vColor = iColorSelected.xyz;
  vAlpha = iBasisDim.w * lod * smoothstep(${Ve.toFixed(2)}, 1.0, uConverge)
         * depthFade(max(1.0, -mvC.z), uNear, uFar);
}
`,_t=`
${I}
uniform float uT;
uniform float uGain;
uniform float uMotion;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vL;
varying vec3 vV;
varying float vAlpha;
varying float vFresh;
varying float vSeed;
varying float vSel;
varying float vPlanetPx;
varying vec3 vLocal;
varying float vDensity;
varying float vCreated;
varying float vLod;

void main() {
  if (vAlpha <= 0.004) discard;
  vec3 N = normalize(vN);
  vec3 L = normalize(vL);
  vec3 V = normalize(vV);

  float mediumLod = step(0.5, vLod) * smoothstep(12.0, 18.0, vPlanetPx);
  float nearLod = step(1.5, vLod) * smoothstep(72.0, 84.0, vPlanetPx);
  float terrain = 0.0;
  float detail = 0.0;
  if (vLod >= 0.5) {
#if PLANET_FAMILY == 0
    terrain = snoise(vLocal * 4.7 + vSeed) * 0.72 + snoise(vLocal * 10.0 - vSeed) * 0.28;
#elif PLANET_FAMILY == 1
    terrain = sin((vLocal.y + snoise(vLocal * 3.2 + vSeed) * 0.10) * 38.0);
#elif PLANET_FAMILY == 2
    float cloudTime = uT * 0.000035 * uMotion;
    terrain = snoise(vLocal * 3.1 + vec3(cloudTime, vSeed, -cloudTime));
#else
    vec3 archiveGrid = abs(fract(vLocal * 11.0 + vSeed) - 0.5);
    terrain = 1.0 - smoothstep(0.035, 0.12, min(archiveGrid.x, archiveGrid.y));
#endif
  }
  if (vLod >= 1.5) {
#if PLANET_FAMILY == 0
    detail = snoise(vLocal * 28.0 + vSeed * 3.0);
#elif PLANET_FAMILY == 1
    detail = sin(vLocal.y * 118.0 + snoise(vLocal * 9.0) * 2.2);
#elif PLANET_FAMILY == 2
    float highCloudTime = uT * 0.000065 * uMotion;
    detail = snoise(vLocal * 12.0 + vec3(-highCloudTime, highCloudTime, vSeed));
#else
    detail = snoise(vLocal * 24.0 + floor(vDensity * 8.0));
#endif
  }
  float roughness = clamp(0.70 - terrain * 0.12 * mediumLod - detail * 0.07 * nearLod, 0.35, 0.92);
  vec3 shapedN = normalize(N + vec3(terrain, detail, -terrain) * (0.045 * mediumLod + 0.025 * nearLod));
  float tex = 0.82 + 0.12 * terrain * mediumLod + 0.06 * detail * nearLod;
  // 岩石本色里掺一点恒星的颜色：行星是被这颗恒星照亮的
  vec3 rock = mix(vec3(0.28, 0.31, 0.40), vColor, 0.30) * tex;

  vec3 col;
  // 每颗行星都由自己的恒星照亮 —— 这是物理，对谁都成立。
  //
  // 这里携带的是问题回答的最近公开发布时间／更新时间：近期仍有公开活动的
  // 问题反照率高、带一层大气轮缘，久远或无公开时间的更暗、更粗糙。
  float d = max(0.0, dot(shapedN, L));
  float term = smoothstep(-0.06, 0.28, dot(shapedN, L));
  float albedo = mix(0.30, 1.0, vFresh);
  col = rock * albedo * (0.05 + (1.0 - roughness * 0.08) * d) * term;
  float atmo = pow(1.0 - max(0.0, dot(N, V)), 3.0) * vFresh * 0.55;
  col += vec3(0.42, 0.58, 0.95) * atmo * (0.25 + 0.75 * d);

  // 存在真实 created binding：夜面透出一点暖光。
  if (vCreated > 0.5) {
    float rim = pow(1.0 - max(0.0, dot(N, V)), 2.2);
    vec3 glow = vec3(1.0, 0.80, 0.48);
    col += glow * (0.09 + rim * 0.36) * (1.0 - term * 0.5);
  }

  // 选中：加一道冷色轮缘。不整颗提亮 —— 那会把「自己发光 / 只反射」这条
  // 语义抹平，选中态不该篡改数据本身在说的事
  if (vSel > 0.5) {
    float rim = pow(1.0 - max(0.0, dot(N, V)), 1.8);
    float scanPhase = mix(0.82, fract(uT * 0.00012), uMotion);
    float longitude = atan(vLocal.z, vLocal.x) / 6.28318530718 + 0.5;
    float latitude = asin(clamp(vLocal.y, -1.0, 1.0)) / 3.14159265359 + 0.5;
    float longitudeScan = 1.0 - smoothstep(0.018, 0.055, abs(longitude - scanPhase));
    float latitudeScan = 1.0 - smoothstep(0.018, 0.055, abs(latitude - (1.0 - scanPhase)));
    float scan = max(longitudeScan, latitudeScan);
    col += vec3(0.52, 0.72, 1.0) * (0.14 + rim * 1.6 + scan * 0.72);
  }

  gl_FragColor = vec4(col * vAlpha * uGain, 1.0);
}
`;function vt(e){return`#define PLANET_FAMILY ${e}\n${_t}`}var yt=`
${P}
${F}
attribute vec3 iU;
attribute vec3 iV;
attribute vec3 iStarPos;
attribute vec3 iStarCenter;
attribute vec3 iStarAxis;
attribute vec3 iColor;
attribute vec4 iOrb;
attribute vec4 iMeta;
attribute float iDim;
attribute float iSel;

uniform float uT;
uniform float uConverge;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
uniform float uBob;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 starW = orbitAround(iStarPos, iStarCenter, iStarAxis, iMeta.w, uT * 0.001);
  starW += iStarAxis * sin(uT / (6400.0 + mod(iMeta.y * 311.0, 5200.0)) + iMeta.y) * uBob;

  // position.xy 是单位圆上的参数，铺到这条轨道的平面里
  vec3 world = starW + (iU * position.x + iV * position.y) * iOrb.x;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  float starPx = iMeta.z * uProjScale / max(1.0, -(modelViewMatrix * vec4(starW, 1.0)).z);
  float lod = smoothstep(22.0, 62.0, starPx);

  // 选中那条轨道亮起来，让「这颗行星走的是哪一圈」一眼可见
  vColor = mix(iColor, vec3(0.62, 0.78, 1.0), iSel);
  vAlpha = iDim * lod * smoothstep(0.90, 1.0, uConverge) * (1.0 + 5.0 * iSel)
         * depthFade(max(1.0, -mv.z), uNear, uFar);
}
`,bt=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.003) discard;
  gl_FragColor = vec4(vColor * vAlpha * uGain, 1.0);
}
`;function xt(e,t){return L.construct(n=>St(e,t,n))}function St(t,r,a){let s=t.universe,c=Oe(s),l=c.length,u=a.use(new o(1,32,20)),f=a.use(new p);f.index=u.index,f.setAttribute(`position`,u.getAttribute(`position`)),f.instanceCount=l;let m=new Float32Array(l*3),g=new Float32Array(l*3),v=new Float32Array(l*3),b=new Float32Array(l*3),x=new Float32Array(l*3),S=new Float32Array(l*4),C=new Float32Array(l*2);c.forEach((e,t)=>{m.set(e.p,t*3),g.set(e.center,t*3),v.set(e.axis,t*3),b.set(e.start,t*3),x.set(e.color,t*3),S.set([e.period,e.ignite,e.bodyR,e.seed],t*4),C.set([e.kelvin,1],t*2)}),f.setAttribute(`iPos`,new A(m,3)),f.setAttribute(`iCenter`,new A(g,3)),f.setAttribute(`iAxis`,new A(v,3)),f.setAttribute(`iStart`,new A(b,3)),f.setAttribute(`iColor`,new A(x,3)),f.setAttribute(`iOrb`,new A(S,4)),f.setAttribute(`iMeta`,new A(C,2)),f.boundingSphere=new _(new d,1e6);let ee=()=>({uT:{value:0},uConverge:{value:+!!r},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3},uBob:{value:r?0:1.35}}),w=a.use(new h({uniforms:{...ee(),uIgniteMs:{value:700},uLitFloor:{value:+!!r},uGain:{value:pt.star}},vertexShader:mt,fragmentShader:ht,transparent:!0,depthTest:!0,depthWrite:!0})),te=new n(f,w);te.renderOrder=9,te.frustumCulled=!1;let ne=c.map(n=>e(t,n.s)),re=ct([...t.answersById.values()]),T=[];c.forEach((e,t)=>ne[t].forEach((t,n)=>T.push({d:e,idx:n,datum:t,material:lt(t,re)})));let E=T.length,ie=new Float32Array(E*3),D=new Float32Array(E*3),ae=new Float32Array(E*3),O=new Float32Array(E*3),se=new Float32Array(E*3),j=new Float32Array(E*3),ce=new Float32Array(E*3),le=new Float32Array(E*4),ue=new Float32Array(E*4),M=new Float32Array(E*4),de=new Float32Array(E*4),fe=new Float32Array(E).fill(1),pe=new Float32Array(E),me=new Int32Array(E),N=[],P=new Map;c.forEach((e,t)=>P.set(e,t)),T.forEach((e,t)=>{let n=e.d,r=e.idx*2654435761%1e3/1e3-.5,[i,a]=Et(n.sysU,n.sysV,n.sysAxis,r*.22),o=ut+e.idx*dt,s=7+2.4*o**1.5,c=(e.idx*137.508+n.seed*31.7)*Math.PI/180,l=ft+.115*e.material.answerDensity;ie.set(i,t*3),D.set(a,t*3),ae.set(n.p,t*3),O.set(n.center,t*3),se.set(n.axis,t*3),j.set(n.sysAxis,t*3),ce.set(n.color,t*3),le.set([o,c,s,l],t*4),ue.set([(e.material.created?2:0)+e.material.freshness,n.seed,n.bodyR,n.period],t*4),M.set([e.material.seed,e.material.answerDensity,e.material.freshness,tt(e.material.family)],t*4),de.set([e.material.timeSpan??0,e.material.timeSpan===null?0:1,+!!e.material.created,+!!e.material.collected],t*4),me[t]=P.get(n),N.push({star:n,question:e.datum.question,answerCount:e.datum.answerCount,created:e.datum.created,collected:e.datum.collected,latestPublicAt:e.datum.latestPublicAt,answers:e.datum.answers,material:e.material,orbitIndex:e.datum.orbitIndex,index:t,u:i,v:a,orbitR:o,phase:c,period:s,radius:l})});let F=a.use(new o(1,20,14)),I=nt(T.map(({material:e})=>e)),he=rt(I,E),L=I.map(e=>{let t=e.globalIndices.length,n=Tt(e.globalIndices,{pU:ie,pV:D,pStarPos:ae,pStarCenter:O,pStarAxis:se,pSystemAxis:j,pColor:ce,pOrb:le,pMeta:ue,pSurface:M,pChronicle:de,pDim:fe,pSel:pe}),o=a.use(new p);o.index=F.index,o.setAttribute(`position`,F.getAttribute(`position`)),o.instanceCount=t,Ct(o,n),o.setAttribute(`normal`,new A(n.pSystemAxis,3)),o.setAttribute(`iSurface`,new A(n.pSurface,4)),o.setAttribute(`iChronicle`,new A(n.pChronicle,4));let s=new Float32Array(t*4),c=new Float32Array(t*4),l=new Float32Array(t*4);for(let e=0;e<t;e++)s.set(n.pU.subarray(e*3,e*3+3),e*4),s[e*4+3]=n.pDim[e],c.set(n.pColor.subarray(e*3,e*3+3),e*4),c[e*4+3]=n.pSel[e],l.set(n.pStarAxis.subarray(e*3,e*3+3),e*4);o.setAttribute(`iBasisDim`,new A(s,4)),o.setAttribute(`iColorSelected`,new A(c,4)),o.setAttribute(`iAxisLod`,new A(l,4));let u=tt(e.family),d=a.use(new h({uniforms:{...ee(),uGain:{value:pt.planet},uMotion:{value:+!r}},vertexShader:gt,fragmentShader:vt(u),transparent:!0,depthTest:!0,depthWrite:!0})),f=a.use(new i(o,d,t));return f.userData.planetFamily=e.family,f.renderOrder=9,f.frustumCulled=!1,{family:e.family,globalIndices:e.globalIndices,geometry:o,material:d,mesh:f,basisDim:s,colorSelected:c,axisLod:l,basisDimAttribute:o.getAttribute(`iBasisDim`),colorSelectedAttribute:o.getAttribute(`iColorSelected`),axisLodAttribute:o.getAttribute(`iAxisLod`)}}),ge=new Float32Array(432);for(let e=0;e<72;e++){let t=e/72*Math.PI*2,n=(e+1)/72*Math.PI*2;ge.set([Math.cos(t),Math.sin(t),0,Math.cos(n),Math.sin(n),0],e*6)}let R=a.use(new p);R.setAttribute(`position`,new y(ge,3)),R.instanceCount=E,wt(R,{pU:ie,pV:D,pStarPos:ae,pStarCenter:O,pStarAxis:se,pColor:ce,pOrb:le,pMeta:ue,pDim:fe,pSel:pe});let _e=a.use(new h({uniforms:{...ee(),uGain:{value:pt.ring}},vertexShader:yt,fragmentShader:bt,transparent:!0,blending:2,depthTest:!1,depthWrite:!1})),z=new oe(R,_e);z.renderOrder=8.5,z.frustumCulled=!1;let ve=new k;ve.add(z,te,...L.map(({mesh:e})=>e));let ye=[w,_e,...L.map(({material:e})=>e)],B=f.getAttribute(`iMeta`),be=R.getAttribute(`iDim`),V=R.getAttribute(`iSel`),H=-1,xe=Ke(N),U=N.map(()=>`far`),W=Object.freeze([]),G=W,K=new d,Se=new d,Ce=new Map(L.map(e=>[e.family,e])),we=c.map(()=>1),q=e=>`id`in e&&typeof e.id==`string`?`id:${e.id}`:`concept:${e.c}`,J=null,Te=a.release(),Ee=()=>{for(let e=0;e<l;e++)C[e*2+1]=we[e]*Xe(q(c[e].s),J);for(let e=0;e<E;e++)fe[e]=we[me[e]]*Xe(q(N[e].star.s),J);for(let e of L)e.globalIndices.forEach((t,n)=>{e.basisDim[n*4+3]=fe[t]}),e.basisDimAttribute.needsUpdate=!0;B.needsUpdate=!0,be.needsUpdate=!0},ke=(e,t,n)=>{if(U[e.index]===t)return;U[e.index]=t;let r=he.toLocal(e.index),i=Ce.get(r.family);i.axisLod[r.instanceIndex*4+3]=t===`far`?0:t===`medium`?1:2,n.add(i)},Ae=e=>{for(let t of e)t.axisLodAttribute.needsUpdate=!0};return{group:ve,data:c,planets:N,planetIndexMap:he,planetsForStar:e=>xe.get(e)??[],setSelected(e){if(e!==H){if(H>=0){pe[H]=0;let e=he.toLocal(H);if(e){let t=L.find(({family:t})=>t===e.family);t.colorSelected[e.instanceIndex*4+3]=0,t.colorSelectedAttribute.needsUpdate=!0}}if(H=e>=0&&e<E?e:-1,H>=0){pe[H]=1;let e=he.toLocal(H),t=L.find(({family:t})=>t===e.family);t.colorSelected[e.instanceIndex*4+3]=1,t.colorSelectedAttribute.needsUpdate=!0}V.needsUpdate=!0}},updatePlanetLods(e,t,n){let i=new Set;e.updateMatrixWorld();let a=r?0:1.35,o=Math.min(G.length,512);for(let r=0;r<o;r++){let o=G[r];De(o.star,t,a,K);let s=o.phase+Math.PI*2/o.period*(t/1e3),c=Math.cos(s),l=Math.sin(s);K.set(K.x+(o.u[0]*c+o.v[0]*l)*o.orbitR,K.y+(o.u[1]*c+o.v[1]*l)*o.orbitR,K.z+(o.u[2]*c+o.v[2]*l)*o.orbitR),Se.copy(K).applyMatrix4(e.matrixWorldInverse);let u=o.radius*n/Math.max(1,-Se.z);ke(o,it(U[o.index],u),i)}return Ae(i),o},setUniform(e,t){for(let n of ye)n.uniforms[e]&&(n.uniforms[e].value=t)},setFocus(e){let t=e===null?null:c.find(t=>(`id`in t.s?t.s.id:t.s.c)===e)??null,n=t===null?W:xe.get(t)??W;if(n!==G){let e=new Set;for(let t of G)ke(t,`far`,e);G=n,Ae(e)}J=t===null?null:q(t.s),Ee()},setMode(e,t,n){we=c.map(r=>Be(r.s,e,t,n)),Ee()},dispose:Te}}function Ct(e,t){e.setAttribute(`iStarPos`,new A(t.pStarPos,3)),e.setAttribute(`iStarCenter`,new A(t.pStarCenter,3)),e.setAttribute(`iOrb`,new A(t.pOrb,4)),e.setAttribute(`iMeta`,new A(t.pMeta,4)),e.boundingSphere=new _(new d,1e6)}function wt(e,t){e.setAttribute(`iU`,new A(t.pU,3)),e.setAttribute(`iV`,new A(t.pV,3)),e.setAttribute(`iStarPos`,new A(t.pStarPos,3)),e.setAttribute(`iStarCenter`,new A(t.pStarCenter,3)),e.setAttribute(`iStarAxis`,new A(t.pStarAxis,3)),e.setAttribute(`iColor`,new A(t.pColor,3)),e.setAttribute(`iOrb`,new A(t.pOrb,4)),e.setAttribute(`iMeta`,new A(t.pMeta,4)),e.setAttribute(`iDim`,new A(t.pDim,1)),e.setAttribute(`iSel`,new A(t.pSel,1)),e.boundingSphere=new _(new d,1e6)}function Tt(e,t){let n={pU:new Float32Array(e.length*3),pV:new Float32Array(e.length*3),pStarPos:new Float32Array(e.length*3),pStarCenter:new Float32Array(e.length*3),pStarAxis:new Float32Array(e.length*3),pSystemAxis:new Float32Array(e.length*3),pColor:new Float32Array(e.length*3),pOrb:new Float32Array(e.length*4),pMeta:new Float32Array(e.length*4),pSurface:new Float32Array(e.length*4),pChronicle:new Float32Array(e.length*4),pDim:new Float32Array(e.length),pSel:new Float32Array(e.length)},r=(e,t,n,r,i)=>{e.set(t.subarray(r*n,r*n+n),i*n)};return e.forEach((e,i)=>{r(n.pU,t.pU,3,e,i),r(n.pV,t.pV,3,e,i),r(n.pStarPos,t.pStarPos,3,e,i),r(n.pStarCenter,t.pStarCenter,3,e,i),r(n.pStarAxis,t.pStarAxis,3,e,i),r(n.pSystemAxis,t.pSystemAxis,3,e,i),r(n.pColor,t.pColor,3,e,i),r(n.pOrb,t.pOrb,4,e,i),r(n.pMeta,t.pMeta,4,e,i),r(n.pSurface,t.pSurface,4,e,i),r(n.pChronicle,t.pChronicle,4,e,i),n.pDim[i]=t.pDim[e],n.pSel[i]=t.pSel[e]}),n}function Et(e,t,n,r){let i=Math.cos(r),a=Math.sin(r),o=[e[0]*i+n[0]*a,e[1]*i+n[1]*a,e[2]*i+n[2]*a],s=Math.hypot(o[0],o[1],o[2])||1;return o[0]/=s,o[1]/=s,o[2]/=s,[o,[t[0],t[1],t[2]]]}var Dt=`
${P}
${F}

attribute vec3 aStart;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute vec3 aColor;
attribute float aPeriod;
attribute float aSize;
attribute float aDim;
attribute float aSeed;

uniform float uT;
uniform float uConverge;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
uniform float uTwinkle;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 target = orbitAround(position, aCenter, aAxis, aPeriod, uT * 0.001);
  vec3 p = mix(aStart, target, uConverge);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;

  float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uT / (1100.0 + mod(aSeed * 91.0, 1700.0)) + aSeed));
  vColor = aColor;
  vAlpha = aDim * tw * depthFade(viewZ, uNear, uFar) * (0.35 + 0.65 * uConverge);
  // 必须封顶。尘埃是一条内容，飞进恒星系时它按 1/z 能涨到上百像素，
  // 整个背景会糊成一团棉花 —— 那是之前那版最脏的一处
  gl_PointSize = clamp(aSize * (uProjScale / viewZ), 1.0, 9.0);
}
`,Ot=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d2 = dot(gl_PointCoord * 2.0 - 1.0, gl_PointCoord * 2.0 - 1.0);
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(vColor * exp(-d2 * 3.4) * vAlpha * uGain, 1.0);
}
`;function kt(e,t){return L.construct(n=>At(e,t,n))}function At(e,t,n){let r=new Map,i=new Map,a=new Map;for(let t of e.clusters)r.set(t.g,t.c),i.set(t.g,q(t.g)),a.set(t.g,[t.hue,t.sat]);let o=Nt(1319),s=e.particles,c=s.length,u=new Int32Array(c),d=jt(c,(e,t)=>{let n=s[e],c=n[3],l=r.get(c)??[0,0,0],d=i.get(c)??[0,1,0],[f,p]=a.get(c)??[218,0];u[e]=c,t.pos=[n[0],n[1],n[2]],t.center=l,t.axis=d,t.period=J(t.pos,l),t.color=B(f,n[4]?Math.max(p,24):p),t.size=n[4]?1.9:1.35,t.seed=e*.618,t.start=Mt(o)});n.use(d.geo);let f=e.solo,p=f.length,m=p>0?jt(p,(e,t)=>{let n=f[e];t.pos=[n.p[0],n.p[1],n.p[2]],t.center=[n.p[0],n.p[1],n.p[2]],t.axis=[0,1,0],t.period=0,t.color=[.72,.8,1],t.size=2.2,t.seed=e*1.37+5,t.start=Mt(o)}):null;m&&n.use(m.geo);let g={uT:{value:0},uConverge:{value:+!!t},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3}},_=n.use(new h({uniforms:{...g,uGain:{value:.3},uTwinkle:{value:0}},vertexShader:Dt,fragmentShader:Ot,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),v=n.use(new h({uniforms:{...g,uGain:{value:.85},uTwinkle:{value:t?0:.55}},vertexShader:Dt,fragmentShader:Ot,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),y=new k,b=new l(d.geo,_);b.renderOrder=6,b.frustumCulled=!1,y.add(b);let x=null;m&&(x=new l(m.geo,v),x.renderOrder=8,x.frustumCulled=!1,y.add(x));let S=[_,v];return{group:y,setUniform(e,t){for(let n of S)n.uniforms[e]&&(n.uniforms[e].value=t)},setMode(e,t,n){let r=t.wormholes[n];for(let t=0;t<c;t++)d.dim[t]=e===`all`?1:e===`worm`&&r?u[t]===r.a||u[t]===r.b?.9:.07:.12;if(d.dimAttr.needsUpdate=!0,m){let t=e===`solo`?1:e===`all`?.34:.08;m.dim.fill(t),m.dimAttr.needsUpdate=!0}},dispose:n.release()}}function jt(e,t){let n=new Float32Array(e*3),r=new Float32Array(e*3),i=new Float32Array(e*3),a=new Float32Array(e*3),o=new Float32Array(e*3),s=new Float32Array(e),c=new Float32Array(e),l=new Float32Array(e).fill(1),u=new Float32Array(e),f={pos:[0,0,0],start:[0,0,0],center:[0,0,0],axis:[0,1,0],color:[1,1,1],period:0,size:1,seed:0};for(let l=0;l<e;l++)t(l,f),n.set(f.pos,l*3),r.set(f.start,l*3),i[l*3]=f.center[0],i[l*3+1]=f.center[1],i[l*3+2]=f.center[2],a[l*3]=f.axis[0],a[l*3+1]=f.axis[1],a[l*3+2]=f.axis[2],o.set(f.color,l*3),s[l]=f.period,c[l]=f.size,u[l]=f.seed;let p=new T;return p.setAttribute(`position`,new y(n,3)),p.setAttribute(`aStart`,new y(r,3)),p.setAttribute(`aCenter`,new y(i,3)),p.setAttribute(`aAxis`,new y(a,3)),p.setAttribute(`aColor`,new y(o,3)),p.setAttribute(`aPeriod`,new y(s,1)),p.setAttribute(`aSize`,new y(c,1)),p.setAttribute(`aDim`,new y(l,1)),p.setAttribute(`aSeed`,new y(u,1)),p.boundingSphere=new _(new d,1e6),{geo:p,dim:l,dimAttr:p.getAttribute(`aDim`)}}function Mt(e){let t=e()*Math.PI*2,n=Math.acos(2*e()-1),r=2+e()*5;return[r*Math.sin(n)*Math.cos(t),r*Math.sin(n)*Math.sin(t),r*Math.cos(n)]}function Nt(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}var Pt=96,Ft=`
${F}
attribute vec3 aColor;
attribute float aDim;
uniform float uConverge;
uniform float uNear;
uniform float uFar;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  // 收敛完成前不画：创世阶段星星还在飞，轨道环没有意义
  vAlpha = aDim * depthFade(viewZ, uNear, uFar) * smoothstep(0.9, 1.0, uConverge);
}
`,It=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.002) discard;
  gl_FragColor = vec4(vColor * vAlpha * uGain, 1.0);
}
`;function Lt(e){return L.construct(t=>Rt(e,t))}function Rt(e,t){let n=[],r=[],i=[];for(let t of e.clusters){let a=q(t.g),o=B(t.hue,t.sat),s=new Set;for(let n of t.mem){let r=e.stars.find(e=>e.c===n);if(!r)continue;let i=Math.hypot(r.p[0]-t.c[0],r.p[1]-t.c[1],r.p[2]-t.c[2]);i>1.5&&s.add(Math.round(i))}for(let e of s){let s=Te(t.c,a,e,Pt);for(let e=0;e<s.length;e++){let a=s[e],c=s[(e+1)%s.length];n.push(a[0],a[1],a[2],c[0],c[1],c[2]),r.push(o[0],o[1],o[2],o[0],o[1],o[2]),i.push(t.g,t.g)}}}if(n.length===0)return null;let a=i.length,o=new T;t.use(o),o.setAttribute(`position`,new S(n,3)),o.setAttribute(`aColor`,new S(r,3));let s=new Float32Array(a).fill(1);o.setAttribute(`aDim`,new y(s,1)),o.computeBoundingSphere();let c=t.use(new h({uniforms:{uConverge:{value:0},uNear:{value:1},uFar:{value:4e3},uGain:{value:.24}},vertexShader:Ft,fragmentShader:It,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),l=new oe(o,c);l.renderOrder=4,l.frustumCulled=!1;let u=i,d=new Float32Array(a).fill(1),f=null,p=o.getAttribute(`aDim`),m=t.release(),g=()=>{for(let e=0;e<a;e++)s[e]=d[e]*Xe(u[e],f);p.needsUpdate=!0};return{object:l,setUniform(e,t){c.uniforms[e]&&(c.uniforms[e].value=t)},setFocus(e){f=e,g()},setMode(e,t,n){let r=t.wormholes[n];for(let t=0;t<a;t++)d[t]=e===`all`?1:e===`worm`&&r?+(u[t]===r.a||u[t]===r.b):.14;g()},dispose:m}}var zt=new D(1,.62,.24),Bt=190,Vt=`
${F}
attribute float aT;      // 0..1，沿曲线的位置
attribute float aWorm;   // 属于第几条虫洞
attribute float aFocus;
uniform float uT;
uniform float uActive;
uniform float uConverge;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;

  float on = step(abs(aWorm - uActive), 0.5);
  // 三道脉冲沿曲线跑；尾部拖长，头部收紧
  float phase = fract(aT * 3.0 - uT * 0.00042);
  float pulse = pow(1.0 - phase, 5.0);
  float base = 0.16 + 0.84 * pulse;

  vAlpha = on * base * aFocus * depthFade(viewZ, uNear, uFar) * smoothstep(0.9, 1.0, uConverge);
  gl_PointSize = max(1.0, (1.6 + 4.6 * pulse) * (uProjScale / viewZ) * 0.55);
}
`,Ht=`
uniform vec3 uColor;
uniform float uGain;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.003) discard;
  float d2 = dot(gl_PointCoord * 2.0 - 1.0, gl_PointCoord * 2.0 - 1.0);
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(uColor * exp(-d2 * 3.0) * vAlpha * uGain, 1.0);
}
`,Ut=`
${P}
${F}
attribute vec2 aCorner;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute float aPeriod;
attribute float aRadius;
attribute float aSeed;
attribute float aFocus;
uniform float uT;
uniform float uConverge;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  vec3 wp = orbitAround(position, aCenter, aAxis, aPeriod, uT * 0.001);
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  float viewZ = max(1.0, -mv.z);
  mv.xy += aCorner * aRadius;
  gl_Position = projectionMatrix * mv;
  vUv = aCorner;
  vSeed = aSeed;
  vAlpha = aFocus * depthFade(viewZ, uNear, uFar) * smoothstep(0.9, 1.0, uConverge);
}
`,Wt=`
uniform float uT;
uniform float uEmphasis;
uniform vec3 uColor;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
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
  gl_FragColor = vec4(mix(uColor, vec3(0.86, 0.90, 1.0), arc * lobes) * a, 1.0);
}
`;function Gt(e){return L.construct(t=>Kt(e,t))}function Kt(e,t){let r=new k,i=()=>({uT:{value:0},uConverge:{value:0},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3}}),a=[],o=new Map;for(let t of e.clusters)o.set(t.g,t.c);let s=[],c=[],u=[],f=[];e.wormholes.forEach((e,t)=>{let n=o.get(e.a),r=o.get(e.b);if(!n||!r)return;let i=qt(n,r);for(let a=0;a<Bt;a++){let o=a/189,l=Jt(n,i,r,o);s.push(l[0],l[1],l[2]),c.push(o),u.push(t),f.push(o<.5?e.a:e.b)}});let p=null,m=null,g=null;if(s.length>0){let e=new T;t.use(e),e.setAttribute(`position`,new S(s,3)),e.setAttribute(`aT`,new S(c,1)),e.setAttribute(`aWorm`,new S(u,1)),g=new S(new Float32Array(f.length).fill(1),1),e.setAttribute(`aFocus`,g),e.computeBoundingSphere(),m=t.use(new h({uniforms:{...i(),uActive:{value:0},uColor:{value:zt.clone()},uGain:{value:2.6}},vertexShader:Vt,fragmentShader:Ht,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),p=new l(e,m),p.renderOrder=16,p.frustumCulled=!1,p.visible=!1,r.add(p),a.push(m)}let v=null,y=null,b=[],x=e.dark.map(t=>({d:t,s:e.stars.find(e=>e.c===t.c)})).filter(e=>!!e.s);if(x.length>0){let o=[[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]],s=[],c=[],l=[],u=[],f=[],p=[],m=[];x.forEach(({d:t,s:n},r)=>{let i=e.clusters.find(e=>e.g===n.g),a=i?i.c:n.p,d=q(n.g),h=i?J(n.p,a):0,g=34+t.f*2.2;for(let[e,i]of o)s.push(n.p[0],n.p[1],n.p[2]),c.push(e,i),l.push(a[0],a[1],a[2]),u.push(d[0],d[1],d[2]),f.push(h),p.push(g),m.push(r*1.7+t.f),b.push(n.c)});let g=new T;t.use(g),g.setAttribute(`position`,new S(s,3)),g.setAttribute(`aCorner`,new S(c,2)),g.setAttribute(`aCenter`,new S(l,3)),g.setAttribute(`aAxis`,new S(u,3)),g.setAttribute(`aPeriod`,new S(f,1)),g.setAttribute(`aRadius`,new S(p,1)),g.setAttribute(`aSeed`,new S(m,1)),y=new S(new Float32Array(b.length).fill(1),1),g.setAttribute(`aFocus`,y),g.boundingSphere=new _(new d,1e6),v=t.use(new h({uniforms:{...i(),uEmphasis:{value:.14},uColor:{value:zt.clone()}},vertexShader:Ut,fragmentShader:Wt,blending:2,depthWrite:!1,depthTest:!1,transparent:!0}));let C=new n(g,v);C.renderOrder=15,C.frustumCulled=!1,r.add(C),a.push(v)}return{group:r,setUniform(e,t){for(let n of a)n.uniforms[e]&&(n.uniforms[e].value=t)},setActiveWorm(e){m&&(m.uniforms.uActive.value=e)},setEmphasis(e){v&&(v.uniforms.uEmphasis.value=e)},setWormVisible(e){p&&(p.visible=e)},setFocus(e){if(g){let t=g.array;for(let n=0;n<t.length;n++)t[n]=Xe(f[n],e?.g??null);g.needsUpdate=!0}if(y){let t=y.array;for(let n=0;n<t.length;n++)t[n]=Xe(b[n],e?.c??null);y.needsUpdate=!0}},dispose:t.release()}}function qt(e,t){let n=[t[0]-e[0],t[1]-e[1],t[2]-e[2]],r=Math.hypot(n[0],n[1],n[2])||1,i=[n[0]/r,n[1]/r,n[2]/r],a=[0,1,0],o=a[0]*i[0]+a[1]*i[1]+a[2]*i[2],s=[a[0]-i[0]*o,a[1]-i[1]*o,a[2]-i[2]*o],c=Math.hypot(s[0],s[1],s[2]);c<1e-4&&(s=[1-i[0]*i[0],-i[1]*i[0],-i[2]*i[0]],c=Math.hypot(s[0],s[1],s[2])||1);let l=r*.3;return[(e[0]+t[0])/2+s[0]/c*l,(e[1]+t[1])/2+s[1]/c*l,(e[2]+t[2])/2+s[2]/c*l]}function Jt(e,t,n,r){let i=1-r,a=i*i,o=2*i*r,s=r*r;return[e[0]*a+t[0]*o+n[0]*s,e[1]*a+t[1]*o+n[1]*s,e[2]*a+t[2]*o+n[2]*s]}function Yt(e,t){return t===null?e.map((e,t)=>({cluster:e,index:t})).sort((e,t)=>t.cluster.n-e.cluster.n||e.index-t.index).slice(0,7).map(({cluster:e})=>e):e.filter(e=>e.g===t)}function Xt(e){return Math.min(1,Math.max(0,(e-18)/24))}function Zt(e,t){return t?e.filter(e=>e.s.g===t.s.g).map(e=>({star:e,opacity:Xe(e.s.c,t.s.c)})):[]}var Qt=class{sourceClusters;sourceStars;clusterLabels;starLabels=[];revision=0;focusStarId=null;constructor(e,t){this.sourceClusters=e,this.sourceStars=t,this.clusterLabels=Yt(e,null)}setFocus(e){let t=e?.s.c??null;t!==this.focusStarId&&(this.focusStarId=t,this.clusterLabels=Yt(this.sourceClusters,e?.s.g??null),this.starLabels=Zt(this.sourceStars,e),this.revision+=1)}},$t=class{canvas;ctx;w=0;h=0;v=new d;v2=new d;disposeResources;constructor(e){let t=new L;try{this.canvas=e;let n=e.getContext(`2d`);if(!n)throw Error(`2D label canvas is unavailable`);this.ctx=n,t.defer(()=>this.clear()),this.disposeResources=t.release()}catch(e){throw t.dispose(),e}}resize(e,t,n){this.w=e,this.h=t,this.canvas.width=Math.round(e*n),this.canvas.height=Math.round(t*n),this.ctx.setTransform(n,0,0,n,0,0)}clear(){this.ctx.clearRect(0,0,this.w,this.h)}dispose(){this.disposeResources()}tooClose=0;draw(e,t,n,r,i,a,o,s){let c=this.ctx;if(c.clearRect(0,0,this.w,this.h),t<.88)return;let l=Math.min((t-.88)/.12,1);c.font=`600 13px "Noto Sans SC", -apple-system, "PingFang SC", sans-serif`,c.textAlign=`center`,c.textBaseline=`alphabetic`,c.lineJoin=`round`,c.miterLimit=2;let u=[],d=n.map(t=>(this.v.set(t.c[0],t.c[1],t.c[2]).project(e),{c:t,ndc:{x:this.v.x,y:this.v.y,z:this.v.z}})).filter(e=>e.ndc.z>-1&&e.ndc.z<1);for(let{c:t,ndc:n}of d){let r=(n.x*.5+.5)*this.w,i=(-n.y*.5+.5)*this.h;if(r<-80||r>this.w+80||i<-40||i>this.h+40)continue;let a=this.v2.set(t.c[0],t.c[1],t.c[2]).distanceTo(e.position);if(a<this.tooClose)continue;let d=Math.min(1,Math.max(0,(s-a)/Math.max(.001,s-o))),f=.5+.5*d*d,p=i-15,m=c.measureText(t.name).width,h=[r-m/2-7,p-14,r+m/2+7,p+6];if(u.some(e=>h[0]<e[2]&&h[2]>e[0]&&h[1]<e[3]&&h[3]>e[1]))continue;u.push(h);let g=Math.min(1,.96*l*f),_=B(t.hue,t.sat),v=Math.round(226+29*_[0]),y=Math.round(226+29*_[1]),b=Math.round(226+29*_[2]);c.lineWidth=3.5,c.strokeStyle=`rgba(3,5,12,${(g*.92).toFixed(3)})`,c.strokeText(t.name,r,p),c.fillStyle=`rgba(${Math.min(255,v)},${Math.min(255,y)},${Math.min(255,b)},${g.toFixed(3)})`,c.fillText(t.name,r,p)}let f=this.h*.5/Math.tan(e.fov*Math.PI/360);for(let{star:t,opacity:n}of r){De(t,i,a,this.v),this.v2.copy(this.v).applyMatrix4(e.matrixWorldInverse);let r=Math.max(1,-this.v2.z),o=Xt(t.bodyR*f/r)*n*l;if(o<=0||(this.v.project(e),this.v.z<=-1||this.v.z>=1))continue;let s=(this.v.x*.5+.5)*this.w,u=(-this.v.y*.5+.5)*this.h-12;c.lineWidth=3,c.strokeStyle=`rgba(3,5,12,${(o*.92).toFixed(3)})`,c.strokeText(t.s.c,s,u),c.fillStyle=`rgba(240,244,255,${o.toFixed(3)})`,c.fillText(t.s.c,s,u)}}};function en(e){if(e)return`low`;let t=navigator.hardwareConcurrency||4,n=navigator.deviceMemory??4;return t<6||n<4?`medium`:`high`}function tn(e,t){let n=e===null||!Number.isFinite(e)||!Number.isFinite(t)?0:t-e,r=n>0?n:0;return{rawFrameMs:r,animationDeltaSeconds:Math.min(r/1e3,.05)}}function nn(e,t,n){let r=Math.max(0,n-t);return{t0:e.t0===null?null:e.t0+r,skipAt:e.skipAt===null?null:e.skipAt+r,lastTouch:e.lastTouch+r,lastNow:n}}var rn={high:{nebulaBake:512,shellGain:[.1,.075,.035],coreGain:.38,bloom:.72,chromaticAberration:0},medium:{nebulaBake:256,shellGain:[.085,.055,.025],coreGain:.3,bloom:.62,chromaticAberration:0},low:{nebulaBake:128,shellGain:[.06,.035,.015],coreGain:.22,bloom:.48,chromaticAberration:0}};function an(e){return rn[e]}var on=new WeakMap,sn=.34,cn=512,ln=64,un=new w().makeScale(0,0,0),dn=new D;function fn(e,t){let n=Number.isFinite(t)?Math.max(0,t):0;return e===`far`?n>=28?`medium`:`far`:e===`medium`?n<=14?`far`:n>=92?`near`:`medium`:n<=76?`medium`:`near`}function pn(e,t,n){let r=Number.isFinite(n)?Math.max(0,n):0;if(t===`far`){let t=Ln(20,28,r);e.far=1-t,e.medium=t,e.near=0;return}if(t===`medium`&&r<28){let t=Ln(14,28,r);e.far=1-t,e.medium=t,e.near=0;return}if(t===`medium`&&r>76){let t=Ln(76,92,r);e.far=0,e.medium=1-t,e.near=t;return}if(t===`near`){let t=Ln(76,92,r);e.far=0,e.medium=1-t,e.near=t;return}e.far=0,e.medium=1,e.near=0}function mn(e,t,n,r,i){return e.elapsedMs=t,e.projectionScale=n,e.focusedStarId=r,e.convergence=i,e}function hn(e,t){return L.construct(n=>gn(e,t,n))}function gn(e,t,r){let i=bn(e,t),a=0,s=e=>(a+=1,r.use(e)),l=s(new O(.18,.18,.52,6,1,!1).rotateZ(Math.PI/2)),u=s(new C(.34,.025,.24)),p=s(new o(.055,8,6)),m=s(new O(.012,.012,.28,6)),h=s(new x(.1,.18,8).rotateZ(-Math.PI/2)),g=s(new O(.035,.035,.17,8).rotateX(Math.PI/2)),_=s(new ie(.181,.008,4,16).rotateY(Math.PI/2)),v=s(new O(.07,.09,.08,12).rotateX(Math.PI/2)),y=s(new C(.28,.012,.018)),S=s(new c(.22,.08)),te={color:5464435,metalness:.72,roughness:.36},ne={color:2439513,metalness:.56,roughness:.28},re={color:16753722,emissive:16742424,emissiveIntensity:1.8,roughness:.28},T={color:9608875,metalness:.84,roughness:.24},D={color:16757068,emissive:16743193,emissiveIntensity:2.1,roughness:.22},ae={color:12964316,emissive:1385265,emissiveIntensity:.25,metalness:.66,roughness:.3,side:2},oe=s(kn(te)),A=s(kn(ne)),se=s(kn(re)),j=s(kn(T)),ce=s(An(te)),le=s(An(ne)),ue=s(An(re)),M=s(An(T)),de=s(new ee({color:7585256,emissive:1192780,emissiveIntensity:.8,metalness:.25,roughness:.12,clearcoat:1,clearcoatRoughness:.08,alphaHash:!0,transparent:!1,depthWrite:!0,opacity:0}));jn(de);let fe=s(An(D)),pe=s(An(ae)),me=[ce,le,ue,M,de,fe,pe],N=[Q(`hull`,l,oe),Q(`left-wing`,u,A,[0,0,-.31]),Q(`right-wing`,u,A,[0,0,.31]),Q(`beacon`,p,se,[0,.22,0])],P=[Q(`antenna`,m,j,[.05,.25,0]),Q(`thruster`,h,j,[-.34,0,0]),Q(`left-hinge`,g,j,[0,0,-.2]),Q(`right-hinge`,g,j,[0,0,.2])],F=[Q(`seam`,_,M,[.05,0,0]),Q(`scanner-lens`,v,de,[.12,0,.2]),Q(`light-strip-inner`,y,fe,[.03,-.17,0]),Q(`etching`,S,pe,[.08,.01,-.185],[Math.PI/2,0,0])],I=[...N,...P],he=new Map([[oe,ce],[A,le],[se,ue],[j,M]]),L=[...I.map(e=>({...e,material:he.get(e.material)??M})),...F],ge=Math.max(1,i.length),R=new k;R.name=`probe-far`;let _e=new k;_e.name=`probe-medium`;let z=new k;z.name=`probe-near-singleton`;let ve=Cn(N,ge,R,10,s),ye=Cn(I,ge,_e,20,s),B=L.map(e=>{let t=new n(e.geometry,e.material);return t.name=`probe-near:${e.part}`,t.userData.probePart=e.part,t.matrixAutoUpdate=!1,t.renderOrder=30,z.add(t),{...e,mesh:t}}),be=B.map(({mesh:e})=>e);z.visible=!1;let V=new k;V.name=`article-probes`;let H=new b(12178687,1053986,1.25),xe=new E(16766880,2.1);xe.position.set(2,3,4),V.add(H,xe,R,_e,z);let U=new Map(i.map(e=>[e.key,`far`])),W=i.map(()=>new w),G=new Uint8Array(i.length),K=i.map(()=>({far:1,medium:0,near:0})),Se=wn(i.length),Ce=wn(i.length),we=new f,q=new d,J=new d,Te=new d,Ee=new d(1,1,1),De=new w,Oe=new w,ke=new w,Ae=new w,je=new d,Y={probeCount:i.length,sharedResourceCount:a,nearModelCount:1,lods:{far:i.length,medium:0,near:0},maxSimultaneousLevels:1,nearOpacity:0,nearCandidateId:null,frame:{farInstances:0,mediumInstances:0,matrixWrites:0,colorWrites:0,dirtyBuffers:0},parts:{far:N.map(({part:e})=>e),medium:I.map(({part:e})=>e),near:L.map(({part:e})=>e)},inspectedProbeId:null,highlightedPart:null,scanning:!1},X=!1,Z=-1,Me=()=>void 0,Ne;return Ne={group:V,update:e=>{if(X)return;e.camera.updateMatrixWorld(!0),En(Y.frame),Se.count=0,Ce.count=0;let t=-1,n=-1,r=!1,a=-1;for(let o=0;o<i.length;o+=1){let s=i[o],c=e.starWorldPositions.get(s.starId),l=Rn(e.starOpacities.get(s.starId)??0)*Rn(e.convergence);if(!c||l<=0){G[o]=Number(!W[o].equals(un)),W[o].copy(un),K[o].far=0,K[o].medium=0,K[o].near=0,U.set(s.key,`far`);continue}let u=s.phase+e.elapsedMs*.001*s.speed,d=Math.cos(u),f=Math.sin(u);J.set(c.x+(s.u[0]*d+s.v[0]*f)*s.radius,c.y+(s.u[1]*d+s.v[1]*f)*s.radius,c.z+(s.u[2]*d+s.v[2]*f)*s.radius),q.set(-s.u[0]*f+s.v[0]*d,-s.u[1]*f+s.v[1]*d,-s.u[2]*f+s.v[2]*d).normalize(),we.setFromUnitVectors(yn,q),De.compose(J,we,Ee),G[o]=Number(!W[o].equals(De)),W[o].copy(De),Te.copy(J).applyMatrix4(e.camera.matrixWorldInverse);let p=Te.z<-.01?sn*e.projectionScale/-Te.z:0,m=s.starId===e.focusedStarId,h=U.get(s.key)??`far`,g=m?fn(h,p):`far`;U.set(s.key,g),m?Nn(K[o],g,p,l):(K[o].far=l,K[o].medium=0,K[o].near=0),s.probeId===Y.inspectedProbeId&&m&&l>0&&(a=o),K[o].near>0&&(o===Z&&(r=!0),(t<0||p>n)&&(t=o,n=p))}Z=a>=0?a:r?Z:t,Y.nearCandidateId=Z<0?null:i[Z].probeId,Y.lods.far=0,Y.lods.medium=0,Y.lods.near=0,Y.maxSimultaneousLevels=0;for(let t=0;t<i.length;t+=1){let n=U.get(i[t].key)??`far`;t===a&&(n=`near`,U.set(i[t].key,n),K[t].far=0,K[t].medium=0,K[t].near=Rn(e.starOpacities.get(i[t].starId)??0)*Rn(e.convergence)),K[t].near>0&&t!==Z&&(n===`near`&&(n=`medium`,U.set(i[t].key,n)),K[t].far=0,K[t].medium=Rn(e.starOpacities.get(i[t].starId)??0)*Rn(e.convergence),K[t].near=0),Y.lods[n]+=1,Y.maxSimultaneousLevels=Math.max(Y.maxSimultaneousLevels,Number(K[t].far>0)+Number(K[t].medium>0)+Number(K[t].near>0)),K[t].far>.001&&Tn(Se,t,K[t].far,!1),K[t].medium>.001&&Tn(Ce,t,K[t].medium,K[t].far>.001)}Y.frame.farInstances=Se.count,Y.frame.mediumInstances=Ce.count,Dn(ve,W,G,Se,Oe,Y.frame),Dn(ye,W,G,Ce,Oe,Y.frame),On(B,me,z,Z,W,K,Y,e.elapsedMs,ke,Ae),Z>=0&&je.setFromMatrixPosition(W[Z])},inspect(e){X||(Y.inspectedProbeId=e)},setPartHighlight(e){X||(Y.highlightedPart=e)},setScanning(e){X||(Y.scanning=e)},inspectionTarget(e){return X||Z<0||!z.visible?!1:(e.copy(je),!0)},raycastPart(e){if(X||!z.visible)return null;z.updateMatrixWorld(!0);let t=e.intersectObjects(be,!1)[0]?.object.userData.probePart;return _n(t)?t:null},dispose(){X||(X=!0,V.clear(),on.delete(Ne),Me())}},on.set(Ne,Y),Me=r.release(),Ne}function _n(e){return typeof e==`string`&&vn.has(e)}var vn=new Set([`hull`,`left-wing`,`right-wing`,`beacon`,`antenna`,`thruster`,`left-hinge`,`right-hinge`,`seam`,`scanner-lens`,`light-strip-inner`,`etching`]),yn=new d(1,0,0);function bn(e,n,r){let i=[];for(let a of n){if(!Sn(a.s))continue;let n=t(e,a.s);if(n.length===0)continue;let o=Pn(a.s.id),[s,c]=Fn(o),l=new Map;for(let e of n){let t=In(`${a.s.id}\u0000${e.id}`),n=xn(l,t%cn,r);l.set(n,xn(l,n+1,r));let u=n%ln/ln*Math.PI*2,d=2.5+Math.floor(n/ln)*.46,f=[s[0]*Math.cos(u)*d+c[0]*Math.sin(u)*d,s[1]*Math.cos(u)*d+c[1]*Math.sin(u)*d,s[2]*Math.cos(u)*d+c[2]*Math.sin(u)*d];i.push(Object.freeze({starId:a.s.id,probeId:e.id,key:`${a.s.id}\u0000${e.id}`,slot:n,phase:u,radius:d,position:f,axis:o,u:s,v:c,speed:.16+t%37*.0015}))}}return i}function xn(e,t,n){let r=t,i=[];for(;n&&(n.allocationWork+=1),e.has(r);)i.push(r),r=e.get(r)??r+1;for(let t of i)e.set(t,r);return r}function Sn(e){return`id`in e&&typeof e.id==`string`&&`probeIds`in e}function Cn(e,t,n,r,a){return e.map(e=>{let o=a(new i(e.geometry,e.material,t));return o.name=`${n.name}:${e.part}`,o.userData.probePart=e.part,o.frustumCulled=!1,o.renderOrder=r,o.count=t,o.instanceColor=new A(new Float32Array(t*3),3),n.add(o),{part:e.part,mesh:o,local:e.local}})}function wn(e){let t=new Int32Array(e);t.fill(-1);let n=new Float32Array(e);return n.fill(NaN),{indices:new Int32Array(e),previousIndices:t,alphas:new Float32Array(e),previousAlphas:n,upperIntervals:new Uint8Array(e),previousUpperIntervals:new Uint8Array(e),matrixChanged:new Uint8Array(e),colorChanged:new Uint8Array(e),count:0}}function Tn(e,t,n,r){e.indices[e.count]=t,e.alphas[e.count]=n,e.upperIntervals[e.count]=Number(r),e.count+=1}function En(e){e.farInstances=0,e.mediumInstances=0,e.matrixWrites=0,e.colorWrites=0,e.dirtyBuffers=0}function Dn(e,t,n,r,i,a){for(let e=0;e<r.count;e+=1){let t=r.indices[e];r.matrixChanged[e]=Number(r.previousIndices[e]!==t||n[t]===1),r.colorChanged[e]=Number(r.previousIndices[e]!==t||r.previousAlphas[e]!==r.alphas[e]||r.previousUpperIntervals[e]!==r.upperIntervals[e])}for(let{mesh:n,local:o}of e){n.count=r.count;let e=!1,s=!1;for(let c=0;c<r.count;c+=1)r.matrixChanged[c]===1&&(i.multiplyMatrices(t[r.indices[c]],o),n.setMatrixAt(c,i),a.matrixWrites+=1,e=!0),r.colorChanged[c]===1&&(dn.setRGB(r.alphas[c],r.upperIntervals[c],1),n.setColorAt(c,dn),a.colorWrites+=1,s=!0);e&&(n.instanceMatrix.needsUpdate=!0,a.dirtyBuffers+=1),s&&n.instanceColor&&(n.instanceColor.needsUpdate=!0,a.dirtyBuffers+=1)}for(let e=0;e<r.count;e+=1)r.previousIndices[e]=r.indices[e],r.previousAlphas[e]=r.alphas[e],r.previousUpperIntervals[e]=r.upperIntervals[e]}function On(e,t,n,r,i,a,o,s,c,l){let u=r<0?0:a[r].near;o.nearOpacity=u;for(let e of t)e.opacity!==u&&(e.opacity=u);if(n.visible=r>=0&&u>.001,n.visible)for(let t of e)t.mesh.visible=!0,t.mesh.matrix.multiplyMatrices(i[r],t.local),t.part===o.highlightedPart&&(c.makeScale(1.12,1.12,1.12),t.mesh.matrix.multiply(c)),t.part===`scanner-lens`&&o.scanning&&(l.makeRotationX(s*.003),t.mesh.matrix.multiply(l)),t.mesh.matrixWorldNeedsUpdate=!0}function Q(e,t,n,r=[0,0,0],i=[0,0,0]){return{part:e,geometry:t,material:n,local:new w().compose(new d(...r),new f().setFromEuler(new ne(...i)),new d(1,1,1))}}function kn(e){let t=new u({...e,alphaHash:!0,transparent:!1,depthWrite:!0});return t.onBeforeCompile=e=>{e.vertexShader=e.vertexShader.replace(`void main() {`,`varying float vProbeAlpha;
varying float vProbeUpper;
void main() {`).replace(`#include <color_vertex>`,`#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  vProbeAlpha = instanceColor.r;
  vProbeUpper = instanceColor.g;
  vColor.rgb = vec3(1.0);
#else
  vProbeAlpha = 1.0;
  vProbeUpper = 0.0;
#endif`),e.fragmentShader=e.fragmentShader.replace(`void main() {`,`varying float vProbeAlpha;
varying float vProbeUpper;
void main() {`).replace(`#include <alphahash_fragment>`,Mn(`vProbeAlpha`,`vProbeUpper`))},t.customProgramCacheKey=()=>`mindverse-probe-partition-fade-v3`,t}function An(e){let t=new u({...e,alphaHash:!0,transparent:!1,depthWrite:!0,opacity:0});return jn(t),t}function jn(e){e.onBeforeCompile=e=>{e.fragmentShader=e.fragmentShader.replace(`#include <alphahash_fragment>`,Mn(`diffuseColor.a`,`1.0`))},e.customProgramCacheKey=()=>`mindverse-probe-upper-alpha-hash-v1`}function Mn(e,t){return`
#ifdef USE_ALPHAHASH
  float probeAlpha = clamp(${e}, 0.0, 1.0);
  if (probeAlpha <= 0.0) discard;
  if (probeAlpha < 1.0) {
    float probeThreshold = getAlphaHashThreshold( vPosition );
    if (${t} > 0.5) {
      if (probeThreshold < 1.0 - probeAlpha) discard;
    } else if (probeThreshold >= probeAlpha) discard;
  }
  diffuseColor.a = 1.0;
#endif
`}function Nn(e,t,n,r){pn(e,t,n),e.far*=r,e.medium*=r,e.near*=r}function Pn(e){let t=In(e),n=In(`${e}:plane`),r=[((t&65535)/65535-.5)*1.4,.72+(t>>>16&65535)/65535*.56,((n&65535)/65535-.5)*1.4],i=Math.hypot(...r)||1;return[r[0]/i,r[1]/i,r[2]/i]}function Fn(e){let t=Math.abs(e[1])<.9?[0,1,0]:[1,0,0],n=[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],r=Math.hypot(...n)||1;return n[0]/=r,n[1]/=r,n[2]/=r,[n,[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]]]}function In(e){let t=2166136261;for(let n=0;n<e.length;n+=1)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}function Ln(e,t,n){let r=Rn((n-e)/Math.max(1e-9,t-e));return r*r*(3-2*r)}function Rn(e){return Math.min(1,Math.max(0,Number.isFinite(e)?e:0))}var zn=1800,Bn=3400,Vn=500,Hn=520,Un=900,Wn=11,Gn=46,Kn=13,qn=16,Jn=4.5,Yn=1.2;function Xn(e){return $(e*.8,2.8,6)}function Zn(e,t){let n=new Map;for(let r of t)if(`id`in r.s)for(let t of r.s.probeIds){if(!e.probesById.has(t))continue;let i=n.get(t)??[];i.push(r),n.set(t,i)}for(let e of n.values())e.sort((e,t)=>er(e).localeCompare(er(t)));return n}var Qn=class{renderer;scene=new s;camera;composer;nebula;stars;bodies;probes;probeFrame;dust;rings;overlay;labels;labelStrategy;raf=0;w=0;h=0;dpr=1;R;yaw=.5;pitch=-.2;dist;targetDist;t0=null;lastNow=0;lastTouch=-1e9;skipAt=null;genesisDone;mode=`all`;wormIdx=0;quality;focus=new d;focusStar=null;wantFocus=new d;focusOff=new d;retarget=!0;selected=null;convergence;depthNear=1;depthFar=4e3;dragging=!1;lx=0;ly=0;moved=0;tmp=new d;tmp2=new d;inspectionTarget=new d;inspectionLookAt=new d;inspectionCameraPosition=new d;inspectionCameraTarget=new d;raycaster=new r;pointerNdc=new v;probeStarWorldPositions=new Map;probeStarOpacities=new Map;probeStarData=[];probeIds=new Set;probeOwnersById=new Map;inspectionProbeId=null;arrivedProbeId=null;inspectionPose={...me};probeTransition=null;probeTransitionTimer=null;probeTransitionRaf=0;inspectionCameraMix=0;lost=!1;destroyed=!1;suspendedAt=null;canvas;u;reduceMotion;cb;resources=new L;signals;constructor(e,t,n,r,i={},o=en(r)){this.canvas=e;let s=n.universe;this.u=s,this.reduceMotion=r,this.cb=i,this.signals=new ge(i.onRenderReady,i.onRenderError),this.genesisDone=r,this.convergence=+!!r,this.quality=o;let c=an(this.quality);this.R=U(s),this.dist=this.R*4.6,this.targetDist=this.R*1.62;try{this.renderer=new re({canvas:e,antialias:!1,alpha:!1,powerPreference:`high-performance`,stencil:!1}),this.resources.defer(()=>this.renderer.dispose()),this.renderer.setClearColor(0,1),this.renderer.outputColorSpace=g,this.renderer.toneMapping=0,this.camera=new a(60,1,.5,this.R*90);let i=Oe(s);this.probeStarData=i.filter(({s:e})=>`id`in e&&e.probeIds.length>0);for(let{s:e}of this.probeStarData)`id`in e&&(this.probeStarWorldPositions.set(e.id,new d),this.probeStarOpacities.set(e.id,1));this.probeIds=new Set(n.probesById.keys()),this.probeOwnersById=Zn(n,i),this.probeFrame={elapsedMs:0,camera:this.camera,projectionScale:0,focusedStarId:null,convergence:this.convergence,starWorldPositions:this.probeStarWorldPositions,starOpacities:this.probeStarOpacities},this.labelStrategy=new Qt(s.clusters,i),this.nebula=K(this.renderer,this.R,W(s),c),this.resources.defer(()=>this.nebula.dispose()),this.stars=Le(s,r,i),this.resources.defer(()=>this.stars.dispose()),this.bodies=xt(n,r),this.resources.defer(()=>this.bodies.dispose()),this.probes=hn(n,i),this.resources.defer(()=>this.probes.dispose()),this.dust=kt(s,r),this.resources.defer(()=>this.dust.dispose()),this.rings=Lt(s),this.rings&&this.resources.defer(()=>this.rings?.dispose()),this.overlay=Gt(s),this.resources.defer(()=>this.overlay.dispose()),this.labels=new $t(t),this.resources.defer(()=>this.labels.dispose()),this.scene.add(this.nebula.group,this.dust.group,this.bodies.group,this.probes.group,this.stars.group,this.overlay.group),this.rings&&this.scene.add(this.rings.object);let o=this.renderer.getContext(),l=typeof WebGL2RenderingContext<`u`&&o instanceof WebGL2RenderingContext?o.getParameter(o.MAX_SAMPLES):0;this.composer=new de(this.renderer,{frameBufferType:se,multisampling:Math.min(4,Number.isFinite(l)?l:0),depthBuffer:!0,stencilBuffer:!1}),this.resources.defer(()=>this.composer.dispose()),this.composer.addPass(new ce(this.scene,this.camera));let u=[new ue({blendFunction:pe.ADD,mipmapBlur:!0,luminanceThreshold:.68,luminanceSmoothing:.3,intensity:c.bloom,radius:.74,levels:8}),new M({mode:fe.NEUTRAL})];this.composer.addPass(new le(this.camera,...u)),this.applyMode(),this.bindPointer(),this.resources.defer(()=>this.unbindPointer()),this.resources.defer(()=>this.stop()),this.resize()}catch(e){throw this.signals.destroy(),this.resources.dispose(),e}}start(){!this.destroyed&&this.suspendedAt===null&&!this.raf&&(this.raf=requestAnimationFrame(this.frame))}stop(){this.raf&&cancelAnimationFrame(this.raf),this.raf=0}suspend(e=performance.now()){this.suspendedAt===null&&(this.suspendedAt=e,this.stop())}resume(e=performance.now()){if(this.suspendedAt===null)return;let t=nn({t0:this.t0,skipAt:this.skipAt,lastTouch:this.lastTouch},this.suspendedAt,e);this.t0=t.t0,this.skipAt=t.skipAt,this.lastTouch=t.lastTouch,this.lastNow=t.lastNow,this.suspendedAt=null,this.start()}destroy(){this.destroyed||(this.exitProbeInspection(),this.destroyed=!0,this.signals.destroy(),this.resources.dispose())}setMode(e,t=this.wormIdx){this.mode=e,this.wormIdx=t,e!==`all`&&this.resetView(),this.applyMode()}resetView(){this.focusStar=null,this.applyFocus(),this.targetDist=this.R*1.62,this.retarget=!0,this.clearPlanet()}clearPlanet(){this.selected&&(this.selected=null,this.bodies.setSelected(-1),this.cb.onAnchor?.(0,0,!1),this.cb.onPickPlanet?.(null),this.retarget=!0,this.focusStar&&(this.targetDist=qn))}selectQuestionPlanet(e,t){let n=qe(this.bodies.planets,e,t);return n&&this.selectPlanet(n),n}restoreQuestionPlanet(e,t){return this.selectQuestionPlanet(e,t)}setWorkspaceOpen(e){this.canvas.style.pointerEvents=e?`none`:``,this.canvas.style.filter=e?`brightness(.55) saturate(.72)`:``}approachProbe(e,t){if(this.destroyed)return;this.cancelProbeTransition();let n={kind:`approach`,probeId:e,token:t};this.probeTransition=n,this.arrivedProbeId=null;try{this.requireProbe(e);let t=this.probeOwnersById.get(e)??[],r=this.focusStar?er(this.focusStar):null,i=t.find(e=>er(e)===r)??t[0];if(!i)throw Error(`Probe has no owner: ${e}`);if(this.clearPlanet(),!this.isCurrentProbeTransition(n))return;if(this.focusStar=i,this.applyFocus(),this.targetDist=qn,this.retarget=!0,this.inspectionProbeId=e,this.probes.inspect(e),this.probes.setScanning(!1),this.reduceMotion)this.inspectionCameraMix=1,this.finishProbeTransition(n,this.cb.onProbeArrived);else{this.inspectionCameraMix=0;let e=null,t=r=>{this.destroyed||this.probeTransition!==n||(e??=r,this.inspectionCameraMix=$((r-e)/Hn,0,1),this.inspectionCameraMix>=1?(this.probeTransitionRaf=0,this.finishProbeTransition(n,this.cb.onProbeArrived)):this.scheduleProbeFrame(n,t))};this.scheduleProbeFrame(n,t)}}catch(e){this.failProbeTransition(n,e)}}startProbeScan(e,t){if(this.destroyed)return;try{this.requireProbe(e),this.requireReadyProbeInspection(e)}catch(n){this.reportProbeError(e,t,n);return}this.cancelProbeTransition();let n={kind:`scan`,probeId:e,token:t};this.probeTransition=n;try{this.inspectionProbeId=e,this.probes.inspect(e),this.probes.setScanning(!0),this.inspectionCameraMix=1,this.reduceMotion?(this.probes.setScanning(!1),this.finishProbeTransition(n,this.cb.onProbeScanComplete)):this.probeTransitionTimer=setTimeout(()=>{this.probeTransition===n&&this.probes.setScanning(!1),this.finishProbeTransition(n,this.cb.onProbeScanComplete)},Un)}catch(e){this.failProbeTransition(n,e)}}setProbeInspectionPose(e){this.destroyed||(this.inspectionPose=N(e),this.lastTouch=performance.now())}setReducedMotion(e){if(this.destroyed||this.reduceMotion===e||(this.reduceMotion=e,!e))return;this.convergence=1;let t=this.probeTransition;t&&(this.probeTransitionTimer!==null&&clearTimeout(this.probeTransitionTimer),this.probeTransitionRaf&&cancelAnimationFrame(this.probeTransitionRaf),this.probeTransitionTimer=null,this.probeTransitionRaf=0,this.inspectionCameraMix=1,t.kind===`scan`?(this.probes.setScanning(!1),this.finishProbeTransition(t,this.cb.onProbeScanComplete)):this.finishProbeTransition(t,this.cb.onProbeArrived))}focusProbePart(e){this.destroyed||this.probes.setPartHighlight(e)}exitProbeInspection(){let e=this.probeTransition!==null||this.inspectionProbeId!==null||this.arrivedProbeId!==null;this.cancelProbeTransition(),this.inspectionProbeId=null,this.arrivedProbeId=null,this.inspectionPose={...me},this.inspectionCameraMix=0,e&&this.resetProbeVisuals()}skipGenesis(){this.skipAt===null&&(this.skipAt=performance.now())}resize(){let e=this.canvas.getBoundingClientRect();this.dpr=Math.min(window.devicePixelRatio||1,2),this.w=Math.max(1,e.width),this.h=Math.max(1,e.height),this.renderer.setPixelRatio(this.dpr),this.renderer.setSize(this.w,this.h,!1),this.composer.setSize(this.w,this.h),this.camera.aspect=this.w/this.h,this.camera.updateProjectionMatrix(),this.labels.resize(this.w,this.h,this.dpr)}frame=e=>{if(this.raf=0,!this.destroyed&&!this.lost)try{let t=this.t0===null,n=this.t0??e;this.t0=n;let{rawFrameMs:r,animationDeltaSeconds:i}=tn(t?null:this.lastNow,e);Number.isFinite(e)&&(this.lastNow=e);let a=this.reduceMotion?0:e-n,o=this.skipAt===null?0:$((e-this.skipAt)/Vn,0,1),s=this.reduceMotion?1:$((a-zn)/Bn,0,1),c=Math.max(1-(1-s)**3,o);this.convergence=c;let l=this.reduceMotion?1:o;!this.reduceMotion&&e-this.lastTouch>3500&&c>.95&&(this.yaw+=.085*i),this.selected?this.planetWorld(this.selected,a,this.wantFocus):this.focusStar?this.starWorld(this.focusStar,a,this.wantFocus):this.wantFocus.set(0,0,0),this.retarget&&=(this.focusOff.copy(this.focus).sub(this.wantFocus),!1);let u=this.selected?9:this.focusStar?6:4;this.focusOff.multiplyScalar(Math.exp(-u*i)),this.focusOff.lengthSq()<1e-6&&this.focusOff.set(0,0,0),this.focus.copy(this.wantFocus).add(this.focusOff);let d=this.targetDist<this.dist?$n(this.focusOff.length(),this.R*.03,this.R*.45):0;this.dist+=(this.targetDist-this.dist)*(1-Math.exp(-3.4*i*(1-.9*d))),this.camera.position.set(this.focus.x+Math.sin(this.yaw)*Math.cos(this.pitch)*this.dist,this.focus.y-Math.sin(this.pitch)*this.dist,this.focus.z+Math.cos(this.yaw)*Math.cos(this.pitch)*this.dist),this.camera.lookAt(this.focus);let f=this.camera.position.length(),p=Math.max(1,f-this.R*1.15),m=f+this.R*1.75;this.depthNear=p,this.depthFar=m;let h=this.h*this.dpr*.5/Math.tan(60*Math.PI/360);for(let e of[this.stars,this.dust,this.overlay,this.bodies])e.setUniform(`uT`,a),e.setUniform(`uConverge`,c),e.setUniform(`uProjScale`,h),e.setUniform(`uNear`,p),e.setUniform(`uFar`,m);this.stars.setUniform(`uLitFloor`,l),this.bodies.setUniform(`uLitFloor`,l),this.bodies.updatePlanetLods(this.camera,a,h);let g=this.focusStar&&`id`in this.focusStar.s?this.focusStar.s.id:null;for(let e of this.probeStarData){if(!(`id`in e.s))continue;let t=this.probeStarWorldPositions.get(e.s.id);if(!t)continue;this.starWorld(e,a,t);let n=g===null||g===e.s.id?1:.12;this.probeStarOpacities.set(e.s.id,Be(e.s,this.mode,this.u,this.wormIdx)*n)}this.probes.update(mn(this.probeFrame,a,h/this.dpr,g,c)),this.applyProbeInspectionCamera(),this.rings?.setUniform(`uConverge`,c),this.rings?.setUniform(`uNear`,p),this.rings?.setUniform(`uFar`,m);let _=.22+.78*$n(this.dist,this.R*.35,this.R*1.1),v=xe(!!(this.focusStar||this.selected));if(this.nebula.setDim((this.mode===`all`?1:.48)*_*v),this.nebula.update(a*.001,this.camera),this.selected&&this.cb.onAnchor){this.planetWorld(this.selected,a,this.tmp);let e=this.tmp.project(this.camera),t=e.z>-1&&e.z<1;this.cb.onAnchor((e.x*.5+.5)*this.w,(-e.y*.5+.5)*this.h,t)}this.composer.render(),this.signals.frameSucceeded(),this.labels.tooClose=this.R*.2,this.labels.draw(this.camera,c,this.labelStrategy.clusterLabels,this.labelStrategy.starLabels,a,this.reduceMotion?0:1.35,p,m),!this.genesisDone&&(o>=1||a>this.stars.igniteEnd)&&(this.genesisDone=!0,this.cb.onGenesisEnd?.()),!this.destroyed&&this.suspendedAt===null&&(this.raf=requestAnimationFrame(this.frame))}catch(e){this.handleFatalFrameFailure(e)}};applyMode(){this.stars.setDim(this.mode,this.u,this.wormIdx),this.bodies.setMode(this.mode,this.u,this.wormIdx),this.dust.setMode(this.mode,this.u,this.wormIdx),this.rings?.setMode(this.mode,this.u,this.wormIdx),this.overlay.setActiveWorm(this.wormIdx),this.overlay.setWormVisible(this.mode===`worm`),this.overlay.setEmphasis(this.mode===`dark`?1:.14)}applyFocus(){let e=this.focusStar?.s??null;this.labelStrategy.setFocus(this.focusStar),this.bodies.setFocus(e===null?null:`id`in e&&typeof e.id==`string`?e.id:e.c),this.rings?.setFocus(e?.g??null),this.overlay.setFocus(e)}bindPointer(){let e=this.canvas;e.addEventListener(`pointerdown`,this.onDown),e.addEventListener(`pointermove`,this.onMove),e.addEventListener(`pointerup`,this.onUp),e.addEventListener(`wheel`,this.onWheel,{passive:!1}),e.addEventListener(`dblclick`,this.onDoubleClickBound),e.addEventListener(`webglcontextlost`,this.onContextLostBound),e.addEventListener(`webglcontextrestored`,this.onContextRestored)}unbindPointer(){let e=this.canvas;e.removeEventListener(`pointerdown`,this.onDown),e.removeEventListener(`pointermove`,this.onMove),e.removeEventListener(`pointerup`,this.onUp),e.removeEventListener(`wheel`,this.onWheel),e.removeEventListener(`dblclick`,this.onDoubleClickBound),e.removeEventListener(`webglcontextlost`,this.onContextLostBound),e.removeEventListener(`webglcontextrestored`,this.onContextRestored)}onContextLostBound=e=>this.onContextLost(e);onContextLost(e){e.preventDefault(),this.lost=!0,this.handleFatalFrameFailure(Error(`WebGL context lost`))}handleFatalFrameFailure(e){this.stop(),this.exitProbeInspection(),this.signals.frameFailed(e)}onContextRestored=()=>{this.lost=!1,this.resize()};onDown=e=>{this.inspectionProbeId||(this.canvas.focus({preventScroll:!0}),this.lastTouch=performance.now(),this.dragging=!0,this.moved=0,this.lx=e.clientX,this.ly=e.clientY,this.canvas.setPointerCapture(e.pointerId))};onMove=e=>{if(this.inspectionProbeId)return;if(!this.dragging){let t=this.canvas.getBoundingClientRect(),n=e.clientX-t.left,r=e.clientY-t.top,i=this.hitPlanet(n,r)!==null||this.hitStar(n,r)!==null?`pointer`:``;this.canvas.style.cursor!==i&&(this.canvas.style.cursor=i);return}this.lastTouch=performance.now();let t=e.clientX-this.lx,n=e.clientY-this.ly;this.moved+=Math.abs(t)+Math.abs(n),this.yaw+=t*.0055,this.pitch=$(this.pitch+n*.0045,-1.2,1.2),this.lx=e.clientX,this.ly=e.clientY};onUp=e=>{this.inspectionProbeId||(this.dragging=!1,this.moved<6&&this.pick(e.clientX,e.clientY))};onWheel=e=>{if(this.inspectionProbeId)return;e.preventDefault(),this.lastTouch=performance.now();let t=this.targetDist*(1+Math.sign(e.deltaY)*.12),n=this.selected?Yn:this.focusStar?Jn:this.R*.62;this.targetDist=$(t,n,this.R*4.6),this.selected&&this.targetDist>qn*.85?this.clearPlanet():this.focusStar&&this.targetDist>this.R*.9&&this.resetView()};onDoubleClickBound=e=>this.onDoubleClick(e);onDoubleClick(e){if(this.destroyed||!this.inspectionProbeId)return;let t=this.canvas.getBoundingClientRect();if(t.width<=0||t.height<=0)return;this.pointerNdc.set((e.clientX-t.left)/t.width*2-1,-((e.clientY-t.top)/t.height)*2+1),this.raycaster.setFromCamera(this.pointerNdc,this.camera);let n=this.probes.raycastPart(this.raycaster);n&&(this.focusProbePart(n),this.cb.onProbePartChange?.(n))}applyProbeInspectionCamera(){if(!this.inspectionProbeId||!this.probes.inspectionTarget(this.inspectionTarget))return;let e=this.inspectionPose;this.inspectionLookAt.set(this.inspectionTarget.x+e.panX,this.inspectionTarget.y+e.panY,this.inspectionTarget.z),this.inspectionCameraPosition.set(this.inspectionLookAt.x+Math.sin(e.yaw)*Math.cos(e.pitch)*e.distance,this.inspectionLookAt.y-Math.sin(e.pitch)*e.distance,this.inspectionLookAt.z+Math.cos(e.yaw)*Math.cos(e.pitch)*e.distance),this.camera.position.lerp(this.inspectionCameraPosition,this.inspectionCameraMix),this.inspectionCameraTarget.copy(this.focus).lerp(this.inspectionLookAt,this.inspectionCameraMix),this.camera.lookAt(this.inspectionCameraTarget),this.camera.updateMatrixWorld(!0)}requireProbe(e){if(!this.probeIds.has(e))throw Error(`Unknown probe: ${e}`)}requireReadyProbeInspection(e){if(this.arrivedProbeId!==e||this.inspectionProbeId!==e)throw Error(`Probe inspection is not ready: ${e}`);let t=this.focusStar?er(this.focusStar):null;if(!(this.probeOwnersById.get(e)??[]).some(e=>er(e)===t))throw Error(`Probe owner is not focused: ${e}`);if(!this.probes.inspectionTarget(this.inspectionTarget))throw Error(`Probe near target is not visible: ${e}`)}isCurrentProbeTransition(e){return!this.destroyed&&this.probeTransition===e}scheduleProbeFrame(e,t){let n=requestAnimationFrame(t);if(!this.isCurrentProbeTransition(e)){cancelAnimationFrame(n);return}this.probeTransitionRaf=n}cancelProbeTransition(){this.probeTransitionTimer!==null&&clearTimeout(this.probeTransitionTimer),this.probeTransitionRaf&&cancelAnimationFrame(this.probeTransitionRaf),this.probeTransitionTimer=null,this.probeTransitionRaf=0,this.probeTransition=null}finishProbeTransition(e,t){this.destroyed||this.probeTransition!==e||(e.kind===`approach`&&(this.arrivedProbeId=e.probeId),this.probeTransition=null,this.probeTransitionTimer=null,t?.({probeId:e.probeId,token:e.token}))}failProbeTransition(e,t){if(this.probeTransition===e){if(e.kind===`scan`){this.cancelProbeTransition();try{this.probes.setScanning(!1)}catch{}}else this.exitProbeInspection();this.reportProbeError(e.probeId,e.token,t)}}reportProbeError(e,t,n){let r=n instanceof Error?n:Error(String(n));this.cb.onProbeError?.({probeId:e,token:t,cause:r})}resetProbeVisuals(){let e=[()=>this.probes.inspect(null),()=>this.probes.setScanning(!1),()=>this.probes.setPartHighlight(null)];for(let t of e)try{t()}catch{}}pick(e,t){let n=this.canvas.getBoundingClientRect(),r=e-n.left,i=t-n.top,a=this.hitPlanet(r,i);if(a){this.selectPlanet(a);return}this.clearPlanet();let o=this.hitStar(r,i);o?(this.focusStar=o,this.applyFocus(),this.targetDist=qn,this.retarget=!0):this.focusStar&&this.resetView(),this.cb.onPick?.(o?.s??null)}selectPlanet(e){this.selected=e,this.bodies.setSelected(e.index),this.focusStar=e.star,this.applyFocus(),this.targetDist=Xn(e.orbitR),this.retarget=!0,this.cb.onPickPlanet?.(e)}hitPlanet(e,t){if(!this.focusStar)return null;let n=this.reduceMotion?0:this.lastNow-(this.t0??this.lastNow),r=this.h*this.dpr*.5/Math.tan(60*Math.PI/360),i=null,a=1/0;for(let o of this.bodies.planetsForStar(this.focusStar)){let s=Be(o.star.s,this.mode,this.u,this.wormIdx);this.planetWorld(o,n,this.tmp),this.tmp2.copy(this.tmp).applyMatrix4(this.camera.matrixWorldInverse);let c=Math.max(1,-this.tmp2.z);this.starWorld(o.star,n,this.tmp2).applyMatrix4(this.camera.matrixWorldInverse);let l=Math.max(1,-this.tmp2.z),u=o.star.bodyR*r/l,d=o.radius*(r/c)/this.dpr;if(this.tmp.project(this.camera),!Ge({starPx:u,convergence:this.convergence,renderDim:s,viewZ:c,near:this.depthNear,far:this.depthFar,clipZ:this.tmp.z}))continue;let f=(this.tmp.x*.5+.5)*this.w,p=(-this.tmp.y*.5+.5)*this.h,m=Math.hypot(f-e,p-t);m<Math.max(d*1.5,Kn)&&m<a&&(a=m,i=o)}return i}hitStar(e,t){let n=this.reduceMotion?0:this.lastNow-(this.t0??this.lastNow),r=this.h*this.dpr*.5/Math.tan(60*Math.PI/360),i=null,a=1/0;for(let o of this.bodies.data){if(ze(o.s,this.mode,this.u,this.wormIdx)<.4)continue;this.starWorld(o,n,this.tmp);let s=Math.max(1,this.tmp.distanceTo(this.camera.position));if(this.tmp.project(this.camera),this.tmp.z<-1||this.tmp.z>1)continue;let c=(this.tmp.x*.5+.5)*this.w,l=(-this.tmp.y*.5+.5)*this.h,u=Math.hypot(c-e,l-t);u>=a||u<$(o.pointSize*4.3*(r/s)/(2*this.dpr)*.62,Wn,Gn)&&(a=u,i=o)}return i}planetWorld(e,t,n){this.starWorld(e.star,t,n);let r=e.phase+Math.PI*2/e.period*(t/1e3),i=Math.cos(r),a=Math.sin(r);return n.set(n.x+(e.u[0]*i+e.v[0]*a)*e.orbitR,n.y+(e.u[1]*i+e.v[1]*a)*e.orbitR,n.z+(e.u[2]*i+e.v[2]*a)*e.orbitR)}starWorld(e,t,n){return De(e,t,this.reduceMotion?0:1.35,n)}};function $n(e,t,n){let r=$((e-t)/Math.max(1e-6,n-t),0,1);return r*r*(3-2*r)}function $(e,t,n){return e<t?t:e>n?n:e}function er(e){return`id`in e.s?e.s.id:``}export{Qn as Renderer};