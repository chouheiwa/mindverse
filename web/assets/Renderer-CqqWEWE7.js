import{c as e}from"./api-vGgttR-j.js";import{A as t,D as n,F as r,M as i,N as a,O as o,P as s,V as c,_ as l,a as u,b as d,c as f,f as p,g as m,h,i as g,j as _,k as v,m as y,n as b,o as x,s as S,t as C,v as ee,w,y as te}from"./three-B4KVT46k.js";import{a as T,i as ne,n as E,o as re,r as ie,s as D,t as O}from"./postprocessing-BJ29hrYV.js";var k=`
vec3 orbitAround(vec3 p, vec3 c, vec3 axis, float period, float t) {
  vec3 o = p - c;
  float r = length(o);
  if (r < 0.35 || period <= 0.0) return p;
  float th = 6.28318530718 / period * t;
  float ct = cos(th);
  float st = sin(th);
  return c + o * ct + cross(axis, o) * st + axis * dot(axis, o) * (1.0 - ct);
}
`,A=`
float depthFade(float viewZ, float near, float far) {
  float d = clamp((far - viewZ) / max(1e-3, far - near), 0.0, 1.0);
  return d * d;
}
`,j=`
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
`,M=`
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
`,N=class e{cleanups=[];closed=!1;defer(e){let t=!0,n=()=>{t&&(t=!1,e())};return this.closed?(n(),n):(this.cleanups.push(n),n)}use(e){return this.defer(()=>e.dispose()),e}release(){if(this.closed)return()=>void 0;this.closed=!0;let e=this.cleanups;this.cleanups=[];let t=!1;return()=>{if(!t){t=!0;for(let t=e.length-1;t>=0;t--)e[t]()}}}dispose(){this.release()()}static construct(t){let n=new e;try{return t(n)}catch(e){throw n.dispose(),e}}},P=class{ready=!1;failed=!1;destroyed=!1;onReady;onError;constructor(e,t){this.onReady=e,this.onError=t}frameSucceeded(){return this.destroyed||this.ready||this.failed?!1:(this.ready=!0,this.onReady?.(),!0)}frameFailed(e){this.destroyed||this.failed||(this.failed=!0,this.onError?.(e instanceof Error?e:Error(String(e))))}destroy(){this.destroyed=!0}},F=6400,ae=1.92;function oe(e,t){let n=Math.max(0,t);return e<125?-Math.min(1,n/68):Math.min(1,n/62)}function se(e,t){return F*ae**+oe(e,t)}function I(e){let t=z(e,1e3,4e4)/100,n=t<=66?255:329.698727446*(t-60)**-.1332047592,r=t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*(t-60)**-.0755148492,i=t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307,a=[R(z(n,0,255)/255),R(z(r,0,255)/255),R(z(i,0,255)/255)],o=Math.max(a[0],a[1],a[2])||1;return[a[0]/o,a[1]/o,a[2]/o]}function L(e,t){return I(se(e,t))}function R(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function z(e,t,n){return e<t?t:e>n?n:e}var ce=2.25;function le(e){return e?.38:1}function ue(e){let t=0;for(let n of e.stars)t=Math.max(t,Math.hypot(n.p[0],n.p[1],n.p[2]));for(let n of e.clusters)t=Math.max(t,Math.hypot(n.c[0],n.c[1],n.c[2]));return Math.max(60,t)}function B(e){let t=[...e.clusters].sort((e,t)=>t.n-e.n).slice(0,3),n=e=>{let n=t[e]??t[0];if(!n)return new S(.6,.7,1);let[r,i,a]=L(n.hue,n.sat);return new S(r,i,a)},r=n(2).clone().lerp(new S(1,1,1),.62);return[new S(.12,.19,.66).lerp(n(0),.26),new S(.54,.16,.6).lerp(n(1),.3),new S(.04,.42,.48).lerp(r,.26)]}var V=[{r:1,freq:3.4,warp:1.1,low:.1,high:.62,flat:1.45,dust:.55,spin:.0042},{r:1.62,freq:2.3,warp:.85,low:.16,high:.7,flat:1.05,dust:.38,spin:.0026},{r:2.45,freq:1.5,warp:.55,low:.24,high:.8,flat:.72,dust:.2,spin:.0015}];function de(e,t,n,r){return N.construct(i=>H(e,t,n,r,i))}function H(e,t,n,r,i){let o=new y,s=[],c=[];V.forEach((l,u)=>{let d=i.use(U(e,r.nebulaBake,{freq:l.freq,warp:l.warp,low:l.low,high:l.high,flat:l.flat,dust:l.dust,seed:3.7+u*17.3,colA:n[0],colB:n[1],colC:n[2]})),f=r.shellGain[u],p=i.use(new a({uniforms:{uMap:{value:d.texture},uGain:{value:f}},vertexShader:`
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
      `,side:1,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),m=i.use(new g(1,1,1)),h=new w(m,p);h.scale.setScalar(t*l.r*22),h.renderOrder=-40+u,h.frustumCulled=!1,h.rotation.set(u*1.31,u*2.17,u*.73),o.add(h),s.push({mesh:h,spin:l.spin}),c.push({u:p.uniforms.uGain,base:f})});let l=fe(t,n[1],r.coreGain,i);return o.add(l),c.push({u:l.material.uniforms.uGain,base:r.coreGain}),{group:o,update(e,t){s.forEach((t,n)=>{t.mesh.rotation.set(n*1.31,n*2.17+e*t.spin,n*.73)}),l.quaternion.copy(t.quaternion)},setDim(e){for(let t of c)t.u.value=t.base*e},dispose:i.release()}}function fe(e,t,n,r){let i=r.use(new a({uniforms:{uTint:{value:t.clone()},uGain:{value:n}},vertexShader:`
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
    `,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),s=new w(r.use(new o(e*ce,e*ce)),i);return s.renderOrder=-5,s.frustumCulled=!1,s}function U(e,n,r){let o=new C(n,{type:h,format:t,generateMipmaps:!1,minFilter:d,magFilter:d}),s=new N;try{let t=s.use(new a({uniforms:{uFreq:{value:r.freq},uWarp:{value:r.warp},uLow:{value:r.low},uHigh:{value:r.high},uFlat:{value:r.flat},uDust:{value:r.dust},uSeed:{value:r.seed},uColA:{value:r.colA.clone()},uColB:{value:r.colB.clone()},uColC:{value:r.colC.clone()}},vertexShader:`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      ${j}
      ${M}
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
    `,side:1,depthWrite:!1,depthTest:!1})),n=new i,c=new w(s.use(new g(10,10,10)),t);c.frustumCulled=!1,n.add(c);let l=new f(.5,40,o),u=e.getRenderTarget();try{l.update(e,n)}finally{e.setRenderTarget(u)}return s.dispose(),o}catch(e){throw s.dispose(),o.dispose(),e}}function W(e){let t=[Math.sin(e*1.7+.4),Math.cos(e*2.3)+.55,Math.sin(e*3.1+1.2)],n=Math.hypot(t[0],t[1],t[2])||1;return[t[0]/n,t[1]/n,t[2]/n]}function pe(e,t){let n=Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]);return n<.35?0:Math.min(20+1.9*n**1.5,120)}function me(e,t,n,r=44){let i=Math.abs(t[1])<.9?[0,1,0]:[1,0,0],a=[t[1]*i[2]-t[2]*i[1],t[2]*i[0]-t[0]*i[2],t[0]*i[1]-t[1]*i[0]],o=Math.hypot(a[0],a[1],a[2])||1;a[0]/=o,a[1]/=o,a[2]/=o;let s=[t[1]*a[2]-t[2]*a[1],t[2]*a[0]-t[0]*a[2],t[0]*a[1]-t[1]*a[0]],c=[];for(let t=0;t<r;t++){let i=t/r*Math.PI*2,o=Math.cos(i)*n,l=Math.sin(i)*n;c.push([e[0]+a[0]*o+s[0]*l,e[1]+a[1]*o+s[1]*l,e[2]+a[2]*o+s[2]*l])}return c}var he=5200;function ge(e,t,n,r){let i=e.p[0]-e.center[0],a=e.p[1]-e.center[1],o=e.p[2]-e.center[2],s=e.period===0?0:Math.PI*2/e.period*(t/1e3),c=Math.cos(s),l=Math.sin(s),u=e.axis[0]*i+e.axis[1]*a+e.axis[2]*o,d=e.axis[1]*o-e.axis[2]*a,f=e.axis[2]*i-e.axis[0]*o,p=e.axis[0]*a-e.axis[1]*i,m=Math.sin(t/(6400+e.seed*311%5200)+e.seed)*n;return r.set(e.center[0]+i*c+d*l+e.axis[0]*(u*(1-c)+m),e.center[1]+a*c+f*l+e.axis[1]*(u*(1-c)+m),e.center[2]+o*c+p*l+e.axis[2]*(u*(1-c)+m))}function _e(e){let t=e.stars,n=Math.max(1,...t.map(e=>e.n)),r=new Map,i=new Map;for(let t of e.clusters)r.set(t.g,t.c),i.set(t.g,W(t.g));let a=new Map;[...t].sort((e,t)=>t.pe*Math.log(1+t.n)-e.pe*Math.log(1+e.n)).forEach((e,t)=>a.set(e.c,he+t*62));let o=K(97);return t.map(e=>{let t=r.get(e.g)??[0,0,0],s=i.get(e.g)??[0,1,0],c=e.n/n,l=ve(e.c),[u,d]=G(l);return{s:e,p:[e.p[0],e.p[1],e.p[2]],center:t,axis:s,period:pe(e.p,t),start:ye(o),ignite:a.get(e.c)??0,pointSize:3.4+11*c**.55,bodyR:.3+.95*c**.55,bright:.3+.7*e.pe,burst:e.bu,seed:e.n,rot:o()*Math.PI,color:L(e.hue,e.sat),kelvin:se(e.hue,e.sat),sysAxis:l,sysU:u,sysV:d}})}function ve(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);let n=K(t>>>0),r=[(n()-.5)*1.3,.75+n()*.5,(n()-.5)*1.3],i=Math.hypot(r[0],r[1],r[2])||1;return[r[0]/i,r[1]/i,r[2]/i]}function G(e){let t=Math.abs(e[1])<.9?[0,1,0]:[1,0,0],n=[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],r=Math.hypot(n[0],n[1],n[2])||1;return n[0]/=r,n[1]/=r,n[2]/=r,[n,[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]]]}function ye(e){let t=e()*Math.PI*2,n=Math.acos(2*e()-1),r=2+e()*5;return[r*Math.sin(n)*Math.cos(t),r*Math.sin(n)*Math.sin(t),r*Math.cos(n)]}function K(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}var q={core:.72,glow:4.3,flare:10.5},J={core:4.6,glow:1.05,flare:1.7},Y=.85,be=`
${k}
${A}

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
`,xe=`
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
`,Se=`
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
`,Ce=`
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
`;function X(e,t,n=_e(e)){return N.construct(r=>we(e,t,n,r))}function we(e,t,n,r){let i=e.stars,o=i.length,l=new Float32Array(o*3),d=new Float32Array(o*3),f=new Float32Array(o*3),p=new Float32Array(o*3),m=new Float32Array(o*3),h=new Float32Array(o),g=new Float32Array(o),_=new Float32Array(o),b=new Float32Array(o),S=new Float32Array(o),C=new Float32Array(o),ee=new Float32Array(o).fill(1),w=new Float32Array(o),te=new Float32Array(o);n.forEach((e,n)=>{l.set(e.p,n*3),f.set(e.center,n*3),p.set(e.axis,n*3),d.set(e.start,n*3),m.set(e.color,n*3),h[n]=e.period,g[n]=e.pointSize,_[n]=e.bright,b[n]=t?0:e.burst,S[n]=e.seed,C[n]=e.ignite,w[n]=e.rot,te[n]=e.bodyR});let T=new x;r.use(T),T.setAttribute(`position`,new u(l,3)),T.setAttribute(`aStart`,new u(d,3)),T.setAttribute(`aCenter`,new u(f,3)),T.setAttribute(`aAxis`,new u(p,3)),T.setAttribute(`aColor`,new u(m,3)),T.setAttribute(`aPeriod`,new u(h,1)),T.setAttribute(`aSize`,new u(g,1)),T.setAttribute(`aBright`,new u(_,1)),T.setAttribute(`aBurst`,new u(b,1)),T.setAttribute(`aSeed`,new u(S,1)),T.setAttribute(`aIgnite`,new u(C,1)),T.setAttribute(`aDim`,new u(ee,1)),T.setAttribute(`aRot`,new u(w,1)),T.setAttribute(`aBodyR`,new u(te,1)),T.boundingSphere=new s(new c,1e6);let ne={uT:{value:0},uConverge:{value:+!!t},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3},uIgniteMs:{value:700},uLitFloor:{value:+!!t},uBob:{value:t?0:1.35}},E=(e,t,n,i={})=>r.use(new a({uniforms:{...ne,uSizeMul:{value:t},uGain:{value:n},uFlareShape:{value:0},uFadeToBody:{value:0},uNearMul:{value:7},uMaxPx:{value:520},...i},vertexShader:be,fragmentShader:e,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),re=E(Se,q.glow,J.glow,{uNearMul:{value:7.5},uMaxPx:{value:520}}),ie=E(xe,q.core,J.core,{uFadeToBody:{value:1},uMaxPx:{value:90}}),D=E(Ce,q.flare,J.flare,{uThreshold:{value:Y},uFlareShape:{value:1},uNearMul:{value:26},uMaxPx:{value:360}}),O=new y;for(let[e,t]of[[re,10],[ie,12],[D,14]]){let n=new v(T,e);n.renderOrder=t,n.frustumCulled=!1,O.add(n)}let k=[re,ie,D],A=T.getAttribute(`aDim`),j=r.release();return{group:O,order:i,igniteEnd:he+o*62+1500,setUniform(e,t){for(let n of k)n.uniforms[e]&&(n.uniforms[e].value=t)},setDim(e,t,n){for(let r=0;r<o;r++)ee[r]=Ee(i[r],e,t,n);A.needsUpdate=!0},dispose:j}}function Te(e,t,n,r){switch(t){case`dark`:return n.dark.some(t=>t.c===e.c)?1:.08;case`nebula`:return n.nebula.some(t=>t.c===e.c)?1:.1;case`worm`:{let t=n.wormholes[r];return t&&(e.g===t.a||e.g===t.b)?1:.11}case`me`:return n.meta.own===0||e.o>0?1:.1;case`solo`:return .12;default:return 1}}function Ee(e,t,n,r){let i=Te(e,t,n,r);return n.dark.some(t=>t.c===e.c)?Math.min(i,.3):i}var De=.9,Oe=(e,t,n)=>Math.max(t,Math.min(n,e)),ke=(e,t,n)=>{let r=Oe((n-e)/Math.max(1e-6,t-e),0,1);return r*r*(3-2*r)};function Ae(e){let t=Oe((e.far-e.viewZ)/Math.max(.001,e.far-e.near),0,1);return e.renderDim*ke(13,40,e.starPx)*ke(De,1,e.convergence)*t*t}function je(e){return e.clipZ>=-1&&e.clipZ<=1&&Ae(e)>.004}function Me(e){let t=new Map;for(let n of e){let e=t.get(n.star);e?e.push(n):t.set(n.star,[n])}return t}function Ne(e,t,n){return e.find(e=>`id`in e.star.s&&e.star.s.id===t&&e.question.id===n)??null}var Pe=.12;function Fe(e,t){return!t||e?1:Pe}function Z(e,t){return Fe(e===t,t!==null)}var Q=[`basalt`,`strata`,`cloud`,`archive`],Ie=Math.log1p(30),Le=.35,Re=4294967296;function ze(e){return Q.indexOf(e)}function Be(e){let t=new Map(Q.map(e=>[e,[]]));return e.forEach((e,n)=>t.get(e.family).push(n)),Q.flatMap(e=>{let n=t.get(e);return n.length===0?[]:[Object.freeze({family:e,globalIndices:Object.freeze(n)})]})}function Ve(e,t){let n=Array.from({length:t},()=>null),r=new Map;for(let i of e){if(r.has(i.family))throw Error(`duplicate planet family group: ${i.family}`);r.set(i.family,i.globalIndices),i.globalIndices.forEach((e,r)=>{if(!Number.isSafeInteger(e)||e<0||e>=t)throw Error(`invalid global planet index: ${e}`);if(n[e]!==null)throw Error(`duplicate global planet index: ${e}`);n[e]=Object.freeze({family:i.family,instanceIndex:r})})}return Object.freeze({toLocal(e){return Number.isSafeInteger(e)&&e>=0&&e<n.length?n[e]:null},toGlobal(e,t){let n=r.get(e);return n&&Number.isSafeInteger(t)&&t>=0&&t<n.length?n[t]:null}})}function He(e,t){let n=Number.isFinite(t)?Math.max(0,t):0;return e===`far`?n>=18?`medium`:`far`:e===`near`?n<=72?`medium`:`near`:n<12?`far`:n>=84?`near`:`medium`}function Ue(e){return Number.isFinite(e)?Math.min(1,Math.max(0,e)):0}function We(e){return typeof e==`number`&&Number.isFinite(e)&&e>0}function Ge(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}function Ke(e){let t=1/0,n=-1/0;for(let r of e)for(let e of[r.publishedAt,r.updatedAt])We(e)&&(t=Math.min(t,e),n=Math.max(n,e));return Object.freeze(!Number.isFinite(t)||!Number.isFinite(n)?{earliest:null,latest:null,duration:0}:{earliest:t,latest:n,duration:Math.max(0,n-t)})}function qe(e,t){let n=Ge(e.question.id),r=[],i=[],a=!1,o=!1;for(let t of e.answers){We(t.publishedAt)&&(i.push(t.publishedAt),r.push(t.publishedAt)),We(t.updatedAt)&&r.push(t.updatedAt);for(let e of t.bindings)e.relation===`created`&&(a=!0),e.relation===`collected`&&(o=!0)}let s=r.length>0?Math.max(...r):null,c=s===null||t.earliest===null||t.latest===null?Le:t.duration===0?.5:Ue((s-t.earliest)/t.duration),l=null;if(i.length>=2){let e=Math.max(...i)-Math.min(...i);l=Number.isFinite(e)?Math.min(2**53-1,Math.max(0,e)):2**53-1}let u=Math.log1p(e.question.answerIds.length)/Ie;return Object.freeze({seed:n/Re,family:Q[n%Q.length],answerDensity:Ue(u),timeSpan:l,freshness:c,divergence:null,created:a,collected:o})}var Je=2.1,Ye=1.15,Xe=.085,Ze={star:1.9,planet:.92,ring:.1},Qe=`
${k}
${A}
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
`,$e=`
${j}
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
`,et=`
${k}
${A}
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
  vec3 planetV = normalize(cross(iAxisLod.xyz, iBasisDim.xyz));
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
  vAlpha = iBasisDim.w * lod * smoothstep(${De.toFixed(2)}, 1.0, uConverge)
         * depthFade(max(1.0, -mvC.z), uNear, uFar);
}
`,tt=`
${j}
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
`;function nt(e){return`#define PLANET_FAMILY ${e}\n${tt}`}var rt=`
${k}
${A}
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
`,it=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.003) discard;
  gl_FragColor = vec4(vColor * vAlpha * uGain, 1.0);
}
`;function at(e,t){return N.construct(n=>ot(e,t,n))}function ot(t,n,i){let o=t.universe,d=_e(o),f=d.length,p=i.use(new r(1,32,20)),h=i.use(new l);h.index=p.index,h.setAttribute(`position`,p.getAttribute(`position`)),h.instanceCount=f;let g=new Float32Array(f*3),_=new Float32Array(f*3),v=new Float32Array(f*3),b=new Float32Array(f*3),x=new Float32Array(f*3),S=new Float32Array(f*4),C=new Float32Array(f*2);d.forEach((e,t)=>{g.set(e.p,t*3),_.set(e.center,t*3),v.set(e.axis,t*3),b.set(e.start,t*3),x.set(e.color,t*3),S.set([e.period,e.ignite,e.bodyR,e.seed],t*4),C.set([e.kelvin,1],t*2)}),h.setAttribute(`iPos`,new m(g,3)),h.setAttribute(`iCenter`,new m(_,3)),h.setAttribute(`iAxis`,new m(v,3)),h.setAttribute(`iStart`,new m(b,3)),h.setAttribute(`iColor`,new m(x,3)),h.setAttribute(`iOrb`,new m(S,4)),h.setAttribute(`iMeta`,new m(C,2)),h.boundingSphere=new s(new c,1e6);let T=()=>({uT:{value:0},uConverge:{value:+!!n},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3},uBob:{value:n?0:1.35}}),ne=i.use(new a({uniforms:{...T(),uIgniteMs:{value:700},uLitFloor:{value:+!!n},uGain:{value:Ze.star}},vertexShader:Qe,fragmentShader:$e,transparent:!0,depthTest:!0,depthWrite:!0})),E=new w(h,ne);E.renderOrder=9,E.frustumCulled=!1;let re=d.map(n=>e(t,n.s)),ie=Ke([...t.answersById.values()]),D=[];d.forEach((e,t)=>re[t].forEach((t,n)=>D.push({d:e,idx:n,datum:t,material:qe(t,ie)})));let O=D.length,k=new Float32Array(O*3),A=new Float32Array(O*3),j=new Float32Array(O*3),M=new Float32Array(O*3),N=new Float32Array(O*3),P=new Float32Array(O*3),F=new Float32Array(O*4),ae=new Float32Array(O*4),oe=new Float32Array(O*4),se=new Float32Array(O*4),I=new Float32Array(O).fill(1),L=new Float32Array(O),R=new Int32Array(O),z=[],ce=new Map;d.forEach((e,t)=>ce.set(e,t)),D.forEach((e,t)=>{let n=e.d,r=e.idx*2654435761%1e3/1e3-.5,[i,a]=ut(n.sysU,n.sysV,n.sysAxis,r*.22),o=Je+e.idx*Ye,s=7+2.4*o**1.5,c=(e.idx*137.508+n.seed*31.7)*Math.PI/180,l=Xe+.115*e.material.answerDensity;k.set(i,t*3),A.set(a,t*3),j.set(n.p,t*3),M.set(n.center,t*3),N.set(n.axis,t*3),P.set(n.color,t*3),F.set([o,c,s,l],t*4),ae.set([(e.material.created?2:0)+e.material.freshness,n.seed,n.bodyR,n.period],t*4),oe.set([e.material.seed,e.material.answerDensity,e.material.freshness,ze(e.material.family)],t*4),se.set([e.material.timeSpan??0,e.material.timeSpan===null?0:1,+!!e.material.created,+!!e.material.collected],t*4),R[t]=ce.get(n),z.push({star:n,question:e.datum.question,answerCount:e.datum.answerCount,created:e.datum.created,collected:e.datum.collected,latestPublicAt:e.datum.latestPublicAt,answers:e.datum.answers,material:e.material,orbitIndex:e.datum.orbitIndex,index:t,u:i,v:a,orbitR:o,phase:c,period:s,radius:l})});let le=i.use(new r(1,20,14)),ue=Be(D.map(({material:e})=>e)),B=Ve(ue,O),V=ue.map(e=>{let t=e.globalIndices.length,r=lt(e.globalIndices,{pU:k,pV:A,pStarPos:j,pStarCenter:M,pStarAxis:N,pColor:P,pOrb:F,pMeta:ae,pSurface:oe,pChronicle:se,pDim:I,pSel:L}),o=i.use(new l);o.index=le.index,o.setAttribute(`position`,le.getAttribute(`position`)),o.instanceCount=t,st(o,r),o.setAttribute(`iSurface`,new m(r.pSurface,4)),o.setAttribute(`iChronicle`,new m(r.pChronicle,4));let s=new Float32Array(t*4),c=new Float32Array(t*4),u=new Float32Array(t*4);for(let e=0;e<t;e++)s.set(r.pU.subarray(e*3,e*3+3),e*4),s[e*4+3]=r.pDim[e],c.set(r.pColor.subarray(e*3,e*3+3),e*4),c[e*4+3]=r.pSel[e],u.set(r.pStarAxis.subarray(e*3,e*3+3),e*4);o.setAttribute(`iBasisDim`,new m(s,4)),o.setAttribute(`iColorSelected`,new m(c,4)),o.setAttribute(`iAxisLod`,new m(u,4));let d=ze(e.family),f=i.use(new a({uniforms:{...T(),uGain:{value:Ze.planet},uMotion:{value:+!n}},vertexShader:et,fragmentShader:nt(d),transparent:!0,depthTest:!0,depthWrite:!0})),p=new ee(o,f,t);return p.userData.planetFamily=e.family,p.renderOrder=9,p.frustumCulled=!1,{family:e.family,globalIndices:e.globalIndices,geometry:o,material:f,mesh:p,basisDim:s,colorSelected:c,axisLod:u,basisDimAttribute:o.getAttribute(`iBasisDim`),colorSelectedAttribute:o.getAttribute(`iColorSelected`),axisLodAttribute:o.getAttribute(`iAxisLod`)}}),de=new Float32Array(432);for(let e=0;e<72;e++){let t=e/72*Math.PI*2,n=(e+1)/72*Math.PI*2;de.set([Math.cos(t),Math.sin(t),0,Math.cos(n),Math.sin(n),0],e*6)}let H=i.use(new l);H.setAttribute(`position`,new u(de,3)),H.instanceCount=O,ct(H,{pU:k,pV:A,pStarPos:j,pStarCenter:M,pStarAxis:N,pColor:P,pOrb:F,pMeta:ae,pDim:I,pSel:L});let fe=i.use(new a({uniforms:{...T(),uGain:{value:Ze.ring}},vertexShader:rt,fragmentShader:it,transparent:!0,blending:2,depthTest:!1,depthWrite:!1})),U=new te(H,fe);U.renderOrder=8.5,U.frustumCulled=!1;let W=new y;W.add(U,E,...V.map(({mesh:e})=>e));let pe=[ne,fe,...V.map(({material:e})=>e)],me=h.getAttribute(`iMeta`),he=H.getAttribute(`iDim`),ve=H.getAttribute(`iSel`),G=-1,ye=Me(z),K=z.map(()=>`far`),q=Object.freeze([]),J=q,Y=new c,be=new c,xe=new Map(V.map(e=>[e.family,e])),Se=d.map(()=>1),Ce=null,X=null,we=i.release(),Te=()=>{for(let e=0;e<f;e++)C[e*2+1]=Se[e]*Z(d[e].s.c,Ce);for(let e=0;e<O;e++)I[e]=Se[R[e]]*Z(z[e].star.s.c,Ce);for(let e of V)e.globalIndices.forEach((t,n)=>{e.basisDim[n*4+3]=I[t]}),e.basisDimAttribute.needsUpdate=!0;me.needsUpdate=!0,he.needsUpdate=!0};return{group:W,data:d,planets:z,planetIndexMap:B,planetsForStar:e=>ye.get(e)??[],setSelected(e){if(e!==G){if(G>=0){L[G]=0;let e=B.toLocal(G);if(e){let t=V.find(({family:t})=>t===e.family);t.colorSelected[e.instanceIndex*4+3]=0,t.colorSelectedAttribute.needsUpdate=!0}}if(G=e>=0&&e<O?e:-1,G>=0){L[G]=1;let e=B.toLocal(G),t=V.find(({family:t})=>t===e.family);t.colorSelected[e.instanceIndex*4+3]=1,t.colorSelectedAttribute.needsUpdate=!0}ve.needsUpdate=!0}},updatePlanetLods(e,t,r){let i=X===null?q:ye.get(X)??q,a=new Set,o=(e,t)=>{if(K[e.index]===t)return;K[e.index]=t;let n=B.toLocal(e.index),r=xe.get(n.family);r.axisLod[n.instanceIndex*4+3]=t===`far`?0:t===`medium`?1:2,a.add(r)};if(i!==J){for(let e of J)o(e,`far`);J=i}e.updateMatrixWorld();let s=n?0:1.35;for(let n of J){ge(n.star,t,s,Y);let i=n.phase+Math.PI*2/n.period*(t/1e3),a=Math.cos(i),c=Math.sin(i);Y.set(Y.x+(n.u[0]*a+n.v[0]*c)*n.orbitR,Y.y+(n.u[1]*a+n.v[1]*c)*n.orbitR,Y.z+(n.u[2]*a+n.v[2]*c)*n.orbitR),be.copy(Y).applyMatrix4(e.matrixWorldInverse);let l=n.radius*r/Math.max(1,-be.z);o(n,He(K[n.index],l))}for(let e of a)e.axisLodAttribute.needsUpdate=!0},setUniform(e,t){for(let n of pe)n.uniforms[e]&&(n.uniforms[e].value=t)},setFocus(e){Ce=e,X=e===null?null:d.find(t=>t.s.c===e)??null,Te()},setMode(e,t,n){Se=d.map(r=>Ee(r.s,e,t,n)),Te()},dispose:we}}function st(e,t){e.setAttribute(`iStarPos`,new m(t.pStarPos,3)),e.setAttribute(`iStarCenter`,new m(t.pStarCenter,3)),e.setAttribute(`iOrb`,new m(t.pOrb,4)),e.setAttribute(`iMeta`,new m(t.pMeta,4)),e.boundingSphere=new s(new c,1e6)}function ct(e,t){e.setAttribute(`iU`,new m(t.pU,3)),e.setAttribute(`iV`,new m(t.pV,3)),e.setAttribute(`iStarPos`,new m(t.pStarPos,3)),e.setAttribute(`iStarCenter`,new m(t.pStarCenter,3)),e.setAttribute(`iStarAxis`,new m(t.pStarAxis,3)),e.setAttribute(`iColor`,new m(t.pColor,3)),e.setAttribute(`iOrb`,new m(t.pOrb,4)),e.setAttribute(`iMeta`,new m(t.pMeta,4)),e.setAttribute(`iDim`,new m(t.pDim,1)),e.setAttribute(`iSel`,new m(t.pSel,1)),e.boundingSphere=new s(new c,1e6)}function lt(e,t){let n={pU:new Float32Array(e.length*3),pV:new Float32Array(e.length*3),pStarPos:new Float32Array(e.length*3),pStarCenter:new Float32Array(e.length*3),pStarAxis:new Float32Array(e.length*3),pColor:new Float32Array(e.length*3),pOrb:new Float32Array(e.length*4),pMeta:new Float32Array(e.length*4),pSurface:new Float32Array(e.length*4),pChronicle:new Float32Array(e.length*4),pDim:new Float32Array(e.length),pSel:new Float32Array(e.length)},r=(e,t,n,r,i)=>{e.set(t.subarray(r*n,r*n+n),i*n)};return e.forEach((e,i)=>{r(n.pU,t.pU,3,e,i),r(n.pV,t.pV,3,e,i),r(n.pStarPos,t.pStarPos,3,e,i),r(n.pStarCenter,t.pStarCenter,3,e,i),r(n.pStarAxis,t.pStarAxis,3,e,i),r(n.pColor,t.pColor,3,e,i),r(n.pOrb,t.pOrb,4,e,i),r(n.pMeta,t.pMeta,4,e,i),r(n.pSurface,t.pSurface,4,e,i),r(n.pChronicle,t.pChronicle,4,e,i),n.pDim[i]=t.pDim[e],n.pSel[i]=t.pSel[e]}),n}function ut(e,t,n,r){let i=Math.cos(r),a=Math.sin(r),o=[e[0]*i+n[0]*a,e[1]*i+n[1]*a,e[2]*i+n[2]*a],s=Math.hypot(o[0],o[1],o[2])||1;return o[0]/=s,o[1]/=s,o[2]/=s,[o,[t[0],t[1],t[2]]]}var dt=`
${k}
${A}

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
`,ft=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d2 = dot(gl_PointCoord * 2.0 - 1.0, gl_PointCoord * 2.0 - 1.0);
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(vColor * exp(-d2 * 3.4) * vAlpha * uGain, 1.0);
}
`;function pt(e,t){return N.construct(n=>mt(e,t,n))}function mt(e,t,n){let r=new Map,i=new Map,o=new Map;for(let t of e.clusters)r.set(t.g,t.c),i.set(t.g,W(t.g)),o.set(t.g,[t.hue,t.sat]);let s=_t(1319),c=e.particles,l=c.length,u=new Int32Array(l),d=ht(l,(e,t)=>{let n=c[e],a=n[3],l=r.get(a)??[0,0,0],d=i.get(a)??[0,1,0],[f,p]=o.get(a)??[218,0];u[e]=a,t.pos=[n[0],n[1],n[2]],t.center=l,t.axis=d,t.period=pe(t.pos,l),t.color=L(f,n[4]?Math.max(p,24):p),t.size=n[4]?1.9:1.35,t.seed=e*.618,t.start=gt(s)});n.use(d.geo);let f=e.solo,p=f.length,m=p>0?ht(p,(e,t)=>{let n=f[e];t.pos=[n.p[0],n.p[1],n.p[2]],t.center=[n.p[0],n.p[1],n.p[2]],t.axis=[0,1,0],t.period=0,t.color=[.72,.8,1],t.size=2.2,t.seed=e*1.37+5,t.start=gt(s)}):null;m&&n.use(m.geo);let h={uT:{value:0},uConverge:{value:+!!t},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3}},g=n.use(new a({uniforms:{...h,uGain:{value:.3},uTwinkle:{value:0}},vertexShader:dt,fragmentShader:ft,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),_=n.use(new a({uniforms:{...h,uGain:{value:.85},uTwinkle:{value:t?0:.55}},vertexShader:dt,fragmentShader:ft,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),b=new y,x=new v(d.geo,g);x.renderOrder=6,x.frustumCulled=!1,b.add(x);let S=null;m&&(S=new v(m.geo,_),S.renderOrder=8,S.frustumCulled=!1,b.add(S));let C=[g,_];return{group:b,setUniform(e,t){for(let n of C)n.uniforms[e]&&(n.uniforms[e].value=t)},setMode(e,t,n){let r=t.wormholes[n];for(let t=0;t<l;t++)d.dim[t]=e===`all`?1:e===`worm`&&r?u[t]===r.a||u[t]===r.b?.9:.07:.12;if(d.dimAttr.needsUpdate=!0,m){let t=e===`solo`?1:e===`all`?.34:.08;m.dim.fill(t),m.dimAttr.needsUpdate=!0}},dispose:n.release()}}function ht(e,t){let n=new Float32Array(e*3),r=new Float32Array(e*3),i=new Float32Array(e*3),a=new Float32Array(e*3),o=new Float32Array(e*3),l=new Float32Array(e),d=new Float32Array(e),f=new Float32Array(e).fill(1),p=new Float32Array(e),m={pos:[0,0,0],start:[0,0,0],center:[0,0,0],axis:[0,1,0],color:[1,1,1],period:0,size:1,seed:0};for(let s=0;s<e;s++)t(s,m),n.set(m.pos,s*3),r.set(m.start,s*3),i[s*3]=m.center[0],i[s*3+1]=m.center[1],i[s*3+2]=m.center[2],a[s*3]=m.axis[0],a[s*3+1]=m.axis[1],a[s*3+2]=m.axis[2],o.set(m.color,s*3),l[s]=m.period,d[s]=m.size,p[s]=m.seed;let h=new x;return h.setAttribute(`position`,new u(n,3)),h.setAttribute(`aStart`,new u(r,3)),h.setAttribute(`aCenter`,new u(i,3)),h.setAttribute(`aAxis`,new u(a,3)),h.setAttribute(`aColor`,new u(o,3)),h.setAttribute(`aPeriod`,new u(l,1)),h.setAttribute(`aSize`,new u(d,1)),h.setAttribute(`aDim`,new u(f,1)),h.setAttribute(`aSeed`,new u(p,1)),h.boundingSphere=new s(new c,1e6),{geo:h,dim:f,dimAttr:h.getAttribute(`aDim`)}}function gt(e){let t=e()*Math.PI*2,n=Math.acos(2*e()-1),r=2+e()*5;return[r*Math.sin(n)*Math.cos(t),r*Math.sin(n)*Math.sin(t),r*Math.cos(n)]}function _t(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}var vt=96,yt=`
${A}
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
`,bt=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.002) discard;
  gl_FragColor = vec4(vColor * vAlpha * uGain, 1.0);
}
`;function xt(e){return N.construct(t=>St(e,t))}function St(e,t){let n=[],r=[],i=[];for(let t of e.clusters){let a=W(t.g),o=L(t.hue,t.sat),s=new Set;for(let n of t.mem){let r=e.stars.find(e=>e.c===n);if(!r)continue;let i=Math.hypot(r.p[0]-t.c[0],r.p[1]-t.c[1],r.p[2]-t.c[2]);i>1.5&&s.add(Math.round(i))}for(let e of s){let s=me(t.c,a,e,vt);for(let e=0;e<s.length;e++){let a=s[e],c=s[(e+1)%s.length];n.push(a[0],a[1],a[2],c[0],c[1],c[2]),r.push(o[0],o[1],o[2],o[0],o[1],o[2]),i.push(t.g,t.g)}}}if(n.length===0)return null;let o=i.length,s=new x;t.use(s),s.setAttribute(`position`,new p(n,3)),s.setAttribute(`aColor`,new p(r,3));let c=new Float32Array(o).fill(1);s.setAttribute(`aDim`,new u(c,1)),s.computeBoundingSphere();let l=t.use(new a({uniforms:{uConverge:{value:0},uNear:{value:1},uFar:{value:4e3},uGain:{value:.24}},vertexShader:yt,fragmentShader:bt,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),d=new te(s,l);d.renderOrder=4,d.frustumCulled=!1;let f=i,m=new Float32Array(o).fill(1),h=null,g=s.getAttribute(`aDim`),_=t.release(),v=()=>{for(let e=0;e<o;e++)c[e]=m[e]*Z(f[e],h);g.needsUpdate=!0};return{object:d,setUniform(e,t){l.uniforms[e]&&(l.uniforms[e].value=t)},setFocus(e){h=e,v()},setMode(e,t,n){let r=t.wormholes[n];for(let t=0;t<o;t++)m[t]=e===`all`?1:e===`worm`&&r?+(f[t]===r.a||f[t]===r.b):.14;v()},dispose:_}}var Ct=new S(1,.62,.24),wt=190,Tt=`
${A}
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
`,Et=`
uniform vec3 uColor;
uniform float uGain;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.003) discard;
  float d2 = dot(gl_PointCoord * 2.0 - 1.0, gl_PointCoord * 2.0 - 1.0);
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(uColor * exp(-d2 * 3.0) * vAlpha * uGain, 1.0);
}
`,Dt=`
${k}
${A}
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
`,Ot=`
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
`;function kt(e){return N.construct(t=>At(e,t))}function At(e,t){let n=new y,r=()=>({uT:{value:0},uConverge:{value:0},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3}}),i=[],o=new Map;for(let t of e.clusters)o.set(t.g,t.c);let l=[],u=[],d=[],f=[];e.wormholes.forEach((e,t)=>{let n=o.get(e.a),r=o.get(e.b);if(!n||!r)return;let i=jt(n,r);for(let a=0;a<wt;a++){let o=a/189,s=Mt(n,i,r,o);l.push(s[0],s[1],s[2]),u.push(o),d.push(t),f.push(o<.5?e.a:e.b)}});let m=null,h=null,g=null;if(l.length>0){let e=new x;t.use(e),e.setAttribute(`position`,new p(l,3)),e.setAttribute(`aT`,new p(u,1)),e.setAttribute(`aWorm`,new p(d,1)),g=new p(new Float32Array(f.length).fill(1),1),e.setAttribute(`aFocus`,g),e.computeBoundingSphere(),h=t.use(new a({uniforms:{...r(),uActive:{value:0},uColor:{value:Ct.clone()},uGain:{value:2.6}},vertexShader:Tt,fragmentShader:Et,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),m=new v(e,h),m.renderOrder=16,m.frustumCulled=!1,m.visible=!1,n.add(m),i.push(h)}let _=null,b=null,S=[],C=e.dark.map(t=>({d:t,s:e.stars.find(e=>e.c===t.c)})).filter(e=>!!e.s);if(C.length>0){let o=[[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]],l=[],u=[],d=[],f=[],m=[],h=[],g=[];C.forEach(({d:t,s:n},r)=>{let i=e.clusters.find(e=>e.g===n.g),a=i?i.c:n.p,s=W(n.g),c=i?pe(n.p,a):0,p=34+t.f*2.2;for(let[e,i]of o)l.push(n.p[0],n.p[1],n.p[2]),u.push(e,i),d.push(a[0],a[1],a[2]),f.push(s[0],s[1],s[2]),m.push(c),h.push(p),g.push(r*1.7+t.f),S.push(n.c)});let v=new x;t.use(v),v.setAttribute(`position`,new p(l,3)),v.setAttribute(`aCorner`,new p(u,2)),v.setAttribute(`aCenter`,new p(d,3)),v.setAttribute(`aAxis`,new p(f,3)),v.setAttribute(`aPeriod`,new p(m,1)),v.setAttribute(`aRadius`,new p(h,1)),v.setAttribute(`aSeed`,new p(g,1)),b=new p(new Float32Array(S.length).fill(1),1),v.setAttribute(`aFocus`,b),v.boundingSphere=new s(new c,1e6),_=t.use(new a({uniforms:{...r(),uEmphasis:{value:.14},uColor:{value:Ct.clone()}},vertexShader:Dt,fragmentShader:Ot,blending:2,depthWrite:!1,depthTest:!1,transparent:!0}));let y=new w(v,_);y.renderOrder=15,y.frustumCulled=!1,n.add(y),i.push(_)}return{group:n,setUniform(e,t){for(let n of i)n.uniforms[e]&&(n.uniforms[e].value=t)},setActiveWorm(e){h&&(h.uniforms.uActive.value=e)},setEmphasis(e){_&&(_.uniforms.uEmphasis.value=e)},setWormVisible(e){m&&(m.visible=e)},setFocus(e){if(g){let t=g.array;for(let n=0;n<t.length;n++)t[n]=Z(f[n],e?.g??null);g.needsUpdate=!0}if(b){let t=b.array;for(let n=0;n<t.length;n++)t[n]=Z(S[n],e?.c??null);b.needsUpdate=!0}},dispose:t.release()}}function jt(e,t){let n=[t[0]-e[0],t[1]-e[1],t[2]-e[2]],r=Math.hypot(n[0],n[1],n[2])||1,i=[n[0]/r,n[1]/r,n[2]/r],a=[0,1,0],o=a[0]*i[0]+a[1]*i[1]+a[2]*i[2],s=[a[0]-i[0]*o,a[1]-i[1]*o,a[2]-i[2]*o],c=Math.hypot(s[0],s[1],s[2]);c<1e-4&&(s=[1-i[0]*i[0],-i[1]*i[0],-i[2]*i[0]],c=Math.hypot(s[0],s[1],s[2])||1);let l=r*.3;return[(e[0]+t[0])/2+s[0]/c*l,(e[1]+t[1])/2+s[1]/c*l,(e[2]+t[2])/2+s[2]/c*l]}function Mt(e,t,n,r){let i=1-r,a=i*i,o=2*i*r,s=r*r;return[e[0]*a+t[0]*o+n[0]*s,e[1]*a+t[1]*o+n[1]*s,e[2]*a+t[2]*o+n[2]*s]}function Nt(e,t){return t===null?e.map((e,t)=>({cluster:e,index:t})).sort((e,t)=>t.cluster.n-e.cluster.n||e.index-t.index).slice(0,7).map(({cluster:e})=>e):e.filter(e=>e.g===t)}function Pt(e){return Math.min(1,Math.max(0,(e-18)/24))}function Ft(e,t){return t?e.filter(e=>e.s.g===t.s.g).map(e=>({star:e,opacity:Z(e.s.c,t.s.c)})):[]}var It=class{sourceClusters;sourceStars;clusterLabels;starLabels=[];revision=0;focusStarId=null;constructor(e,t){this.sourceClusters=e,this.sourceStars=t,this.clusterLabels=Nt(e,null)}setFocus(e){let t=e?.s.c??null;t!==this.focusStarId&&(this.focusStarId=t,this.clusterLabels=Nt(this.sourceClusters,e?.s.g??null),this.starLabels=Ft(this.sourceStars,e),this.revision+=1)}},Lt=class{canvas;ctx;w=0;h=0;v=new c;v2=new c;disposeResources;constructor(e){let t=new N;try{this.canvas=e;let n=e.getContext(`2d`);if(!n)throw Error(`2D label canvas is unavailable`);this.ctx=n,t.defer(()=>this.clear()),this.disposeResources=t.release()}catch(e){throw t.dispose(),e}}resize(e,t,n){this.w=e,this.h=t,this.canvas.width=Math.round(e*n),this.canvas.height=Math.round(t*n),this.ctx.setTransform(n,0,0,n,0,0)}clear(){this.ctx.clearRect(0,0,this.w,this.h)}dispose(){this.disposeResources()}tooClose=0;draw(e,t,n,r,i,a,o,s){let c=this.ctx;if(c.clearRect(0,0,this.w,this.h),t<.88)return;let l=Math.min((t-.88)/.12,1);c.font=`600 13px "Noto Sans SC", -apple-system, "PingFang SC", sans-serif`,c.textAlign=`center`,c.textBaseline=`alphabetic`,c.lineJoin=`round`,c.miterLimit=2;let u=[],d=n.map(t=>(this.v.set(t.c[0],t.c[1],t.c[2]).project(e),{c:t,ndc:{x:this.v.x,y:this.v.y,z:this.v.z}})).filter(e=>e.ndc.z>-1&&e.ndc.z<1);for(let{c:t,ndc:n}of d){let r=(n.x*.5+.5)*this.w,i=(-n.y*.5+.5)*this.h;if(r<-80||r>this.w+80||i<-40||i>this.h+40)continue;let a=this.v2.set(t.c[0],t.c[1],t.c[2]).distanceTo(e.position);if(a<this.tooClose)continue;let d=Math.min(1,Math.max(0,(s-a)/Math.max(.001,s-o))),f=.5+.5*d*d,p=i-15,m=c.measureText(t.name).width,h=[r-m/2-7,p-14,r+m/2+7,p+6];if(u.some(e=>h[0]<e[2]&&h[2]>e[0]&&h[1]<e[3]&&h[3]>e[1]))continue;u.push(h);let g=Math.min(1,.96*l*f),_=L(t.hue,t.sat),v=Math.round(226+29*_[0]),y=Math.round(226+29*_[1]),b=Math.round(226+29*_[2]);c.lineWidth=3.5,c.strokeStyle=`rgba(3,5,12,${(g*.92).toFixed(3)})`,c.strokeText(t.name,r,p),c.fillStyle=`rgba(${Math.min(255,v)},${Math.min(255,y)},${Math.min(255,b)},${g.toFixed(3)})`,c.fillText(t.name,r,p)}let f=this.h*.5/Math.tan(e.fov*Math.PI/360);for(let{star:t,opacity:n}of r){ge(t,i,a,this.v),this.v2.copy(this.v).applyMatrix4(e.matrixWorldInverse);let r=Math.max(1,-this.v2.z),o=Pt(t.bodyR*f/r)*n*l;if(o<=0||(this.v.project(e),this.v.z<=-1||this.v.z>=1))continue;let s=(this.v.x*.5+.5)*this.w,u=(-this.v.y*.5+.5)*this.h-12;c.lineWidth=3,c.strokeStyle=`rgba(3,5,12,${(o*.92).toFixed(3)})`,c.strokeText(t.s.c,s,u),c.fillStyle=`rgba(240,244,255,${o.toFixed(3)})`,c.fillText(t.s.c,s,u)}}};function Rt(e){if(e)return`low`;let t=navigator.hardwareConcurrency||4,n=navigator.deviceMemory??4;return t<6||n<4?`medium`:`high`}function zt(e,t){let n=e===null||!Number.isFinite(e)||!Number.isFinite(t)?0:t-e,r=n>0?n:0;return{rawFrameMs:r,animationDeltaSeconds:Math.min(r/1e3,.05)}}function Bt(e,t,n){let r=Math.max(0,n-t);return{t0:e.t0===null?null:e.t0+r,skipAt:e.skipAt===null?null:e.skipAt+r,lastTouch:e.lastTouch+r,lastNow:n}}var Vt={high:{nebulaBake:512,shellGain:[.1,.075,.035],coreGain:.38,bloom:.72,chromaticAberration:0},medium:{nebulaBake:256,shellGain:[.085,.055,.025],coreGain:.3,bloom:.62,chromaticAberration:0},low:{nebulaBake:128,shellGain:[.06,.035,.015],coreGain:.22,bloom:.48,chromaticAberration:0}};function Ht(e){return Vt[e]}var Ut=1800,Wt=3400,Gt=500,Kt=11,qt=46,Jt=13,Yt=16,Xt=4.5,Zt=1.2;function Qt(e){return $(e*.8,2.8,6)}var $t=class{renderer;scene=new i;camera;composer;nebula;stars;bodies;dust;rings;overlay;labels;labelStrategy;raf=0;w=0;h=0;dpr=1;R;yaw=.5;pitch=-.2;dist;targetDist;t0=null;lastNow=0;lastTouch=-1e9;skipAt=null;genesisDone;mode=`all`;wormIdx=0;quality;focus=new c;focusStar=null;wantFocus=new c;focusOff=new c;retarget=!0;selected=null;convergence;depthNear=1;depthFar=4e3;dragging=!1;lx=0;ly=0;moved=0;tmp=new c;tmp2=new c;lost=!1;destroyed=!1;suspendedAt=null;canvas;u;reduceMotion;cb;resources=new N;signals;constructor(e,t,r,i,a={},o=Rt(i)){this.canvas=e;let s=r.universe;this.u=s,this.reduceMotion=i,this.cb=a,this.signals=new P(a.onRenderReady,a.onRenderError),this.genesisDone=i,this.convergence=+!!i,this.quality=o;let c=Ht(this.quality);this.R=ue(s),this.dist=this.R*4.6,this.targetDist=this.R*1.62;try{this.renderer=new b({canvas:e,antialias:!1,alpha:!1,powerPreference:`high-performance`,stencil:!1}),this.resources.defer(()=>this.renderer.dispose()),this.renderer.setClearColor(0,1),this.renderer.outputColorSpace=_,this.renderer.toneMapping=0,this.camera=new n(60,1,.5,this.R*90);let a=_e(s);this.labelStrategy=new It(s.clusters,a),this.nebula=de(this.renderer,this.R,B(s),c),this.resources.defer(()=>this.nebula.dispose()),this.stars=X(s,i,a),this.resources.defer(()=>this.stars.dispose()),this.bodies=at(r,i),this.resources.defer(()=>this.bodies.dispose()),this.dust=pt(s,i),this.resources.defer(()=>this.dust.dispose()),this.rings=xt(s),this.rings&&this.resources.defer(()=>this.rings?.dispose()),this.overlay=kt(s),this.resources.defer(()=>this.overlay.dispose()),this.labels=new Lt(t),this.resources.defer(()=>this.labels.dispose()),this.scene.add(this.nebula.group,this.dust.group,this.bodies.group,this.stars.group,this.overlay.group),this.rings&&this.scene.add(this.rings.object);let o=this.renderer.getContext(),l=typeof WebGL2RenderingContext<`u`&&o instanceof WebGL2RenderingContext?o.getParameter(o.MAX_SAMPLES):0;this.composer=new ie(this.renderer,{frameBufferType:h,multisampling:Math.min(4,Number.isFinite(l)?l:0),depthBuffer:!0,stencilBuffer:!1}),this.resources.defer(()=>this.composer.dispose()),this.composer.addPass(new T(this.scene,this.camera));let u=[new E({blendFunction:O.ADD,mipmapBlur:!0,luminanceThreshold:.68,luminanceSmoothing:.3,intensity:c.bloom,radius:.74,levels:8}),new re({mode:D.NEUTRAL})];this.composer.addPass(new ne(this.camera,...u)),this.applyMode(),this.bindPointer(),this.resources.defer(()=>this.unbindPointer()),this.resources.defer(()=>this.stop()),this.resize()}catch(e){throw this.signals.destroy(),this.resources.dispose(),e}}start(){!this.destroyed&&this.suspendedAt===null&&!this.raf&&(this.raf=requestAnimationFrame(this.frame))}stop(){this.raf&&cancelAnimationFrame(this.raf),this.raf=0}suspend(e=performance.now()){this.suspendedAt===null&&(this.suspendedAt=e,this.stop())}resume(e=performance.now()){if(this.suspendedAt===null)return;let t=Bt({t0:this.t0,skipAt:this.skipAt,lastTouch:this.lastTouch},this.suspendedAt,e);this.t0=t.t0,this.skipAt=t.skipAt,this.lastTouch=t.lastTouch,this.lastNow=t.lastNow,this.suspendedAt=null,this.start()}destroy(){this.destroyed||(this.destroyed=!0,this.signals.destroy(),this.resources.dispose())}setMode(e,t=this.wormIdx){this.mode=e,this.wormIdx=t,e!==`all`&&this.resetView(),this.applyMode()}resetView(){this.focusStar=null,this.applyFocus(),this.targetDist=this.R*1.62,this.retarget=!0,this.clearPlanet()}clearPlanet(){this.selected&&(this.selected=null,this.bodies.setSelected(-1),this.cb.onAnchor?.(0,0,!1),this.cb.onPickPlanet?.(null),this.retarget=!0,this.focusStar&&(this.targetDist=Yt))}selectQuestionPlanet(e,t){let n=Ne(this.bodies.planets,e,t);return n&&this.selectPlanet(n),n}restoreQuestionPlanet(e,t){return this.selectQuestionPlanet(e,t)}setWorkspaceOpen(e){this.canvas.style.pointerEvents=e?`none`:``,this.canvas.style.filter=e?`brightness(.55) saturate(.72)`:``}skipGenesis(){this.skipAt===null&&(this.skipAt=performance.now())}resize(){let e=this.canvas.getBoundingClientRect();this.dpr=Math.min(window.devicePixelRatio||1,2),this.w=Math.max(1,e.width),this.h=Math.max(1,e.height),this.renderer.setPixelRatio(this.dpr),this.renderer.setSize(this.w,this.h,!1),this.composer.setSize(this.w,this.h),this.camera.aspect=this.w/this.h,this.camera.updateProjectionMatrix(),this.labels.resize(this.w,this.h,this.dpr)}frame=e=>{if(this.raf=0,!this.destroyed&&!this.lost)try{let t=this.t0===null,n=this.t0??e;this.t0=n;let{rawFrameMs:r,animationDeltaSeconds:i}=zt(t?null:this.lastNow,e);Number.isFinite(e)&&(this.lastNow=e);let a=this.reduceMotion?0:e-n,o=this.skipAt===null?0:$((e-this.skipAt)/Gt,0,1),s=this.reduceMotion?1:$((a-Ut)/Wt,0,1),c=Math.max(1-(1-s)**3,o);this.convergence=c;let l=this.reduceMotion?1:o;!this.reduceMotion&&e-this.lastTouch>3500&&c>.95&&(this.yaw+=.085*i),this.selected?this.planetWorld(this.selected,a,this.wantFocus):this.focusStar?this.starWorld(this.focusStar,a,this.wantFocus):this.wantFocus.set(0,0,0),this.retarget&&=(this.focusOff.copy(this.focus).sub(this.wantFocus),!1);let u=this.selected?9:this.focusStar?6:4;this.focusOff.multiplyScalar(Math.exp(-u*i)),this.focusOff.lengthSq()<1e-6&&this.focusOff.set(0,0,0),this.focus.copy(this.wantFocus).add(this.focusOff);let d=this.targetDist<this.dist?en(this.focusOff.length(),this.R*.03,this.R*.45):0;this.dist+=(this.targetDist-this.dist)*(1-Math.exp(-3.4*i*(1-.9*d))),this.camera.position.set(this.focus.x+Math.sin(this.yaw)*Math.cos(this.pitch)*this.dist,this.focus.y-Math.sin(this.pitch)*this.dist,this.focus.z+Math.cos(this.yaw)*Math.cos(this.pitch)*this.dist),this.camera.lookAt(this.focus);let f=this.camera.position.length(),p=Math.max(1,f-this.R*1.15),m=f+this.R*1.75;this.depthNear=p,this.depthFar=m;let h=this.h*this.dpr*.5/Math.tan(60*Math.PI/360);for(let e of[this.stars,this.dust,this.overlay,this.bodies])e.setUniform(`uT`,a),e.setUniform(`uConverge`,c),e.setUniform(`uProjScale`,h),e.setUniform(`uNear`,p),e.setUniform(`uFar`,m);this.stars.setUniform(`uLitFloor`,l),this.bodies.setUniform(`uLitFloor`,l),this.bodies.updatePlanetLods(this.camera,a,h),this.rings?.setUniform(`uConverge`,c),this.rings?.setUniform(`uNear`,p),this.rings?.setUniform(`uFar`,m);let g=.22+.78*en(this.dist,this.R*.35,this.R*1.1),_=le(!!(this.focusStar||this.selected));if(this.nebula.setDim((this.mode===`all`?1:.48)*g*_),this.nebula.update(a*.001,this.camera),this.selected&&this.cb.onAnchor){this.planetWorld(this.selected,a,this.tmp);let e=this.tmp.project(this.camera),t=e.z>-1&&e.z<1;this.cb.onAnchor((e.x*.5+.5)*this.w,(-e.y*.5+.5)*this.h,t)}this.composer.render(),this.signals.frameSucceeded(),this.labels.tooClose=this.R*.2,this.labels.draw(this.camera,c,this.labelStrategy.clusterLabels,this.labelStrategy.starLabels,a,this.reduceMotion?0:1.35,p,m),!this.genesisDone&&(o>=1||a>this.stars.igniteEnd)&&(this.genesisDone=!0,this.cb.onGenesisEnd?.()),!this.destroyed&&this.suspendedAt===null&&(this.raf=requestAnimationFrame(this.frame))}catch(e){this.stop(),this.signals.frameFailed(e)}};applyMode(){this.stars.setDim(this.mode,this.u,this.wormIdx),this.bodies.setMode(this.mode,this.u,this.wormIdx),this.dust.setMode(this.mode,this.u,this.wormIdx),this.rings?.setMode(this.mode,this.u,this.wormIdx),this.overlay.setActiveWorm(this.wormIdx),this.overlay.setWormVisible(this.mode===`worm`),this.overlay.setEmphasis(this.mode===`dark`?1:.14)}applyFocus(){let e=this.focusStar?.s??null;this.labelStrategy.setFocus(this.focusStar),this.bodies.setFocus(e?.c??null),this.rings?.setFocus(e?.g??null),this.overlay.setFocus(e)}bindPointer(){let e=this.canvas;e.addEventListener(`pointerdown`,this.onDown),e.addEventListener(`pointermove`,this.onMove),e.addEventListener(`pointerup`,this.onUp),e.addEventListener(`wheel`,this.onWheel,{passive:!1}),e.addEventListener(`webglcontextlost`,this.onContextLost),e.addEventListener(`webglcontextrestored`,this.onContextRestored)}unbindPointer(){let e=this.canvas;e.removeEventListener(`pointerdown`,this.onDown),e.removeEventListener(`pointermove`,this.onMove),e.removeEventListener(`pointerup`,this.onUp),e.removeEventListener(`wheel`,this.onWheel),e.removeEventListener(`webglcontextlost`,this.onContextLost),e.removeEventListener(`webglcontextrestored`,this.onContextRestored)}onContextLost=e=>{e.preventDefault(),this.lost=!0,this.stop(),this.signals.frameFailed(Error(`WebGL context lost`))};onContextRestored=()=>{this.lost=!1,this.resize()};onDown=e=>{this.canvas.focus({preventScroll:!0}),this.lastTouch=performance.now(),this.dragging=!0,this.moved=0,this.lx=e.clientX,this.ly=e.clientY,this.canvas.setPointerCapture(e.pointerId)};onMove=e=>{if(!this.dragging){let t=this.canvas.getBoundingClientRect(),n=e.clientX-t.left,r=e.clientY-t.top,i=this.hitPlanet(n,r)!==null||this.hitStar(n,r)!==null?`pointer`:``;this.canvas.style.cursor!==i&&(this.canvas.style.cursor=i);return}this.lastTouch=performance.now();let t=e.clientX-this.lx,n=e.clientY-this.ly;this.moved+=Math.abs(t)+Math.abs(n),this.yaw+=t*.0055,this.pitch=$(this.pitch+n*.0045,-1.2,1.2),this.lx=e.clientX,this.ly=e.clientY};onUp=e=>{this.dragging=!1,this.moved<6&&this.pick(e.clientX,e.clientY)};onWheel=e=>{e.preventDefault(),this.lastTouch=performance.now();let t=this.targetDist*(1+Math.sign(e.deltaY)*.12),n=this.selected?Zt:this.focusStar?Xt:this.R*.62;this.targetDist=$(t,n,this.R*4.6),this.selected&&this.targetDist>Yt*.85?this.clearPlanet():this.focusStar&&this.targetDist>this.R*.9&&this.resetView()};pick(e,t){let n=this.canvas.getBoundingClientRect(),r=e-n.left,i=t-n.top,a=this.hitPlanet(r,i);if(a){this.selectPlanet(a);return}this.clearPlanet();let o=this.hitStar(r,i);o?(this.focusStar=o,this.applyFocus(),this.targetDist=Yt,this.retarget=!0):this.focusStar&&this.resetView(),this.cb.onPick?.(o?.s??null)}selectPlanet(e){this.selected=e,this.bodies.setSelected(e.index),this.focusStar=e.star,this.applyFocus(),this.targetDist=Qt(e.orbitR),this.retarget=!0,this.cb.onPickPlanet?.(e)}hitPlanet(e,t){if(!this.focusStar)return null;let n=this.reduceMotion?0:this.lastNow-(this.t0??this.lastNow),r=this.h*this.dpr*.5/Math.tan(60*Math.PI/360),i=null,a=1/0;for(let o of this.bodies.planetsForStar(this.focusStar)){let s=Ee(o.star.s,this.mode,this.u,this.wormIdx);this.planetWorld(o,n,this.tmp),this.tmp2.copy(this.tmp).applyMatrix4(this.camera.matrixWorldInverse);let c=Math.max(1,-this.tmp2.z);this.starWorld(o.star,n,this.tmp2).applyMatrix4(this.camera.matrixWorldInverse);let l=Math.max(1,-this.tmp2.z),u=o.star.bodyR*r/l,d=o.radius*(r/c)/this.dpr;if(this.tmp.project(this.camera),!je({starPx:u,convergence:this.convergence,renderDim:s,viewZ:c,near:this.depthNear,far:this.depthFar,clipZ:this.tmp.z}))continue;let f=(this.tmp.x*.5+.5)*this.w,p=(-this.tmp.y*.5+.5)*this.h,m=Math.hypot(f-e,p-t);m<Math.max(d*1.5,Jt)&&m<a&&(a=m,i=o)}return i}hitStar(e,t){let n=this.reduceMotion?0:this.lastNow-(this.t0??this.lastNow),r=this.h*this.dpr*.5/Math.tan(60*Math.PI/360),i=null,a=1/0;for(let o of this.bodies.data){if(Te(o.s,this.mode,this.u,this.wormIdx)<.4)continue;this.starWorld(o,n,this.tmp);let s=Math.max(1,this.tmp.distanceTo(this.camera.position));if(this.tmp.project(this.camera),this.tmp.z<-1||this.tmp.z>1)continue;let c=(this.tmp.x*.5+.5)*this.w,l=(-this.tmp.y*.5+.5)*this.h,u=Math.hypot(c-e,l-t);u>=a||u<$(o.pointSize*4.3*(r/s)/(2*this.dpr)*.62,Kt,qt)&&(a=u,i=o)}return i}planetWorld(e,t,n){this.starWorld(e.star,t,n);let r=e.phase+Math.PI*2/e.period*(t/1e3),i=Math.cos(r),a=Math.sin(r);return n.set(n.x+(e.u[0]*i+e.v[0]*a)*e.orbitR,n.y+(e.u[1]*i+e.v[1]*a)*e.orbitR,n.z+(e.u[2]*i+e.v[2]*a)*e.orbitR)}starWorld(e,t,n){return ge(e,t,this.reduceMotion?0:1.35,n)}};function en(e,t,n){let r=$((e-t)/Math.max(1e-6,n-t),0,1);return r*r*(3-2*r)}function $(e,t,n){return e<t?t:e>n?n:e}export{$t as Renderer};