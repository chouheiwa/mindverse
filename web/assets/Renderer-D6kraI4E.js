import{c as e}from"./api-vGgttR-j.js";import{A as t,B as n,C as r,D as i,E as a,M as o,N as s,O as c,P as l,_ as u,a as d,c as f,f as p,g as m,h,i as g,j as _,k as v,m as y,n as b,o as x,s as S,t as C,v as w,y as T,z as E}from"./three-Cq-fTrNH.js";import{a as D,c as O,i as k,n as A,o as j,r as M,s as N,t as P}from"./postprocessing-CCzHAWZV.js";function F(e){let t=[Math.sin(e*1.7+.4),Math.cos(e*2.3)+.55,Math.sin(e*3.1+1.2)],n=Math.hypot(t[0],t[1],t[2])||1;return[t[0]/n,t[1]/n,t[2]/n]}function I(e,t){let n=Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]);return n<.35?0:Math.min(20+1.9*n**1.5,120)}function L(e,t,n,r){let i=I(e,t);if(i===0)return[e[0],e[1],e[2]];let a=[e[0]-t[0],e[1]-t[1],e[2]-t[2]],o=Math.PI*2/i*(r/1e3),s=Math.cos(o),c=Math.sin(o),l=n[0]*a[0]+n[1]*a[1]+n[2]*a[2],u=[n[1]*a[2]-n[2]*a[1],n[2]*a[0]-n[0]*a[2],n[0]*a[1]-n[1]*a[0]];return[t[0]+a[0]*s+u[0]*c+n[0]*l*(1-s),t[1]+a[1]*s+u[1]*c+n[1]*l*(1-s),t[2]+a[2]*s+u[2]*c+n[2]*l*(1-s)]}function ee(e,t,n,r=44){let i=Math.abs(t[1])<.9?[0,1,0]:[1,0,0],a=[t[1]*i[2]-t[2]*i[1],t[2]*i[0]-t[0]*i[2],t[0]*i[1]-t[1]*i[0]],o=Math.hypot(a[0],a[1],a[2])||1;a[0]/=o,a[1]/=o,a[2]/=o;let s=[t[1]*a[2]-t[2]*a[1],t[2]*a[0]-t[0]*a[2],t[0]*a[1]-t[1]*a[0]],c=[];for(let t=0;t<r;t++){let i=t/r*Math.PI*2,o=Math.cos(i)*n,l=Math.sin(i)*n;c.push([e[0]+a[0]*o+s[0]*l,e[1]+a[1]*o+s[1]*l,e[2]+a[2]*o+s[2]*l])}return c}var R=`
vec3 orbitAround(vec3 p, vec3 c, vec3 axis, float period, float t) {
  vec3 o = p - c;
  float r = length(o);
  if (r < 0.35 || period <= 0.0) return p;
  float th = 6.28318530718 / period * t;
  float ct = cos(th);
  float st = sin(th);
  return c + o * ct + cross(axis, o) * st + axis * dot(axis, o) * (1.0 - ct);
}
`,z=`
float depthFade(float viewZ, float near, float far) {
  float d = clamp((far - viewZ) / max(1e-3, far - near), 0.0, 1.0);
  return d * d;
}
`,B=`
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
`,V=`
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
`,H=[{r:1,freq:3.4,warp:1.1,low:.1,high:.62,flat:1.45,dust:.55,gain:.24,spin:.0042},{r:1.62,freq:2.3,warp:.85,low:.16,high:.7,flat:1.05,dust:.38,gain:.17,spin:.0026},{r:2.45,freq:1.5,warp:.55,low:.24,high:.8,flat:.72,dust:.2,gain:.09,spin:.0015}],U=512;function te(e,t,n,i=U){let a=new y,s=[],c=[],l=[];H.forEach((u,d)=>{let f=re(e,i,{freq:u.freq,warp:u.warp,low:u.low,high:u.high,flat:u.flat,dust:u.dust,seed:3.7+d*17.3,colA:n[0],colB:n[1],colC:n[2]});s.push(f);let p=new o({uniforms:{uMap:{value:f.texture},uGain:{value:u.gain}},vertexShader:`
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
      `,side:1,blending:2,depthWrite:!1,depthTest:!1,transparent:!0});s.push(p);let m=new g(1,1,1);s.push(m);let h=new r(m,p);h.scale.setScalar(t*u.r*22),h.renderOrder=-40+d,h.frustumCulled=!1,h.rotation.set(d*1.31,d*2.17,d*.73),a.add(h),c.push({mesh:h,spin:u.spin}),l.push({u:p.uniforms.uGain,base:u.gain})});let u=ne(t,n[1]);return s.push(u.geometry,u.material),a.add(u),l.push({u:u.material.uniforms.uGain,base:1}),{group:a,update(e,t){c.forEach((t,n)=>{t.mesh.rotation.set(n*1.31,n*2.17+e*t.spin,n*.73)}),u.quaternion.copy(t.quaternion)},setDim(e){for(let t of l)t.u.value=t.base*e},dispose(){for(let e of s)e.dispose()}}}function ne(e,t){let n=new o({uniforms:{uTint:{value:t.clone()},uGain:{value:1}},vertexShader:`
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
    `,blending:2,depthWrite:!1,depthTest:!1,transparent:!0}),a=new r(new i(e*3.2,e*3.2),n);return a.renderOrder=-5,a.frustumCulled=!1,a}function re(e,t,n){let i=new C(t,{type:h,format:v,generateMipmaps:!1,minFilter:T,magFilter:T}),a=new o({uniforms:{uFreq:{value:n.freq},uWarp:{value:n.warp},uLow:{value:n.low},uHigh:{value:n.high},uFlat:{value:n.flat},uDust:{value:n.dust},uSeed:{value:n.seed},uColA:{value:n.colA.clone()},uColB:{value:n.colB.clone()},uColC:{value:n.colC.clone()}},vertexShader:`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      ${B}
      ${V}
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
    `,side:1,depthWrite:!1,depthTest:!1}),s=new _,c=new r(new g(10,10,10),a);c.frustumCulled=!1,s.add(c);let l=new f(.5,40,i),u=e.getRenderTarget();return l.update(e,s),e.setRenderTarget(u),c.geometry.dispose(),a.dispose(),i}var W=6400,G=1.92;function ie(e,t){let n=Math.max(0,t);return e<125?-Math.min(1,n/68):Math.min(1,n/62)}function K(e,t){return W*G**+ie(e,t)}function ae(e){let t=Y(e,1e3,4e4)/100,n=t<=66?255:329.698727446*(t-60)**-.1332047592,r=t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*(t-60)**-.0755148492,i=t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307,a=[J(Y(n,0,255)/255),J(Y(r,0,255)/255),J(Y(i,0,255)/255)],o=Math.max(a[0],a[1],a[2])||1;return[a[0]/o,a[1]/o,a[2]/o]}function q(e,t){return ae(K(e,t))}function J(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function Y(e,t,n){return e<t?t:e>n?n:e}var X=5200;function oe(e){let t=e.stars,n=Math.max(1,...t.map(e=>e.n)),r=new Map,i=new Map;for(let t of e.clusters)r.set(t.g,t.c),i.set(t.g,F(t.g));let a=new Map;[...t].sort((e,t)=>t.pe*Math.log(1+t.n)-e.pe*Math.log(1+e.n)).forEach((e,t)=>a.set(e.c,X+t*62));let o=ue(97);return t.map(e=>{let t=r.get(e.g)??[0,0,0],s=i.get(e.g)??[0,1,0],c=e.n/n,l=se(e.c),[u,d]=ce(l);return{s:e,p:[e.p[0],e.p[1],e.p[2]],center:t,axis:s,period:I(e.p,t),start:le(o),ignite:a.get(e.c)??0,pointSize:3.4+11*c**.55,bodyR:.3+.95*c**.55,bright:.3+.7*e.pe,burst:e.bu,seed:e.n,rot:o()*Math.PI,color:q(e.hue,e.sat),kelvin:K(e.hue,e.sat),sysAxis:l,sysU:u,sysV:d}})}function se(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);let n=ue(t>>>0),r=[(n()-.5)*1.3,.75+n()*.5,(n()-.5)*1.3],i=Math.hypot(r[0],r[1],r[2])||1;return[r[0]/i,r[1]/i,r[2]/i]}function ce(e){let t=Math.abs(e[1])<.9?[0,1,0]:[1,0,0],n=[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],r=Math.hypot(n[0],n[1],n[2])||1;return n[0]/=r,n[1]/=r,n[2]/=r,[n,[e[1]*n[2]-e[2]*n[1],e[2]*n[0]-e[0]*n[2],e[0]*n[1]-e[1]*n[0]]]}function le(e){let t=e()*Math.PI*2,n=Math.acos(2*e()-1),r=2+e()*5;return[r*Math.sin(n)*Math.cos(t),r*Math.sin(n)*Math.sin(t),r*Math.cos(n)]}function ue(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}var Z=class e{cleanups=[];closed=!1;defer(e){if(this.closed)return e(),e;let t=!0,n=()=>{t&&(t=!1,e())};return this.cleanups.push(n),n}use(e){return this.defer(()=>e.dispose()),e}release(){if(this.closed)return()=>void 0;this.closed=!0;let e=this.cleanups;this.cleanups=[];let t=!1;return()=>{if(!t){t=!0;for(let t=e.length-1;t>=0;t--)e[t]()}}}dispose(){this.release()()}static construct(t){let n=new e;try{return t(n)}catch(e){throw n.dispose(),e}}},de=class{ready=!1;failed=!1;destroyed=!1;onReady;onError;constructor(e,t){this.onReady=e,this.onError=t}frameSucceeded(){this.destroyed||this.ready||this.failed||(this.ready=!0,this.onReady?.())}frameFailed(e){this.destroyed||this.failed||(this.failed=!0,this.onError?.(e instanceof Error?e:Error(String(e))))}destroy(){this.destroyed=!0}},Q={core:.72,glow:4.3,flare:10.5},fe={core:4.6,glow:1.05,flare:1.7},pe=.85,me=`
${R}
${z}

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
`,he=`
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
`,ge=`
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
`,_e=`
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
`;function ve(e,t,n=oe(e)){return Z.construct(r=>ye(e,t,n,r))}function ye(e,t,r,i){let a=e.stars,l=a.length,u=new Float32Array(l*3),f=new Float32Array(l*3),p=new Float32Array(l*3),m=new Float32Array(l*3),h=new Float32Array(l*3),g=new Float32Array(l),_=new Float32Array(l),v=new Float32Array(l),b=new Float32Array(l),S=new Float32Array(l),C=new Float32Array(l),w=new Float32Array(l).fill(1),T=new Float32Array(l),E=new Float32Array(l);r.forEach((e,n)=>{u.set(e.p,n*3),p.set(e.center,n*3),m.set(e.axis,n*3),f.set(e.start,n*3),h.set(e.color,n*3),g[n]=e.period,_[n]=e.pointSize,v[n]=e.bright,b[n]=t?0:e.burst,S[n]=e.seed,C[n]=e.ignite,T[n]=e.rot,E[n]=e.bodyR});let D=new x;i.use(D),D.setAttribute(`position`,new d(u,3)),D.setAttribute(`aStart`,new d(f,3)),D.setAttribute(`aCenter`,new d(p,3)),D.setAttribute(`aAxis`,new d(m,3)),D.setAttribute(`aColor`,new d(h,3)),D.setAttribute(`aPeriod`,new d(g,1)),D.setAttribute(`aSize`,new d(_,1)),D.setAttribute(`aBright`,new d(v,1)),D.setAttribute(`aBurst`,new d(b,1)),D.setAttribute(`aSeed`,new d(S,1)),D.setAttribute(`aIgnite`,new d(C,1)),D.setAttribute(`aDim`,new d(w,1)),D.setAttribute(`aRot`,new d(T,1)),D.setAttribute(`aBodyR`,new d(E,1)),D.boundingSphere=new s(new n,1e6);let O={uT:{value:0},uConverge:{value:+!!t},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3},uIgniteMs:{value:700},uLitFloor:{value:+!!t},uBob:{value:t?0:1.35}},k=(e,t,n,r={})=>i.use(new o({uniforms:{...O,uSizeMul:{value:t},uGain:{value:n},uFlareShape:{value:0},uFadeToBody:{value:0},uNearMul:{value:7},uMaxPx:{value:520},...r},vertexShader:me,fragmentShader:e,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),A=k(ge,Q.glow,fe.glow,{uNearMul:{value:7.5},uMaxPx:{value:520}}),j=k(he,Q.core,fe.core,{uFadeToBody:{value:1},uMaxPx:{value:90}}),M=k(_e,Q.flare,fe.flare,{uThreshold:{value:pe},uFlareShape:{value:1},uNearMul:{value:26},uMaxPx:{value:360}}),N=new y;for(let[e,t]of[[A,10],[j,12],[M,14]]){let n=new c(D,e);n.renderOrder=t,n.frustumCulled=!1,N.add(n)}let P=[A,j,M],F=D.getAttribute(`aDim`),I=i.release();return{group:N,order:a,igniteEnd:X+l*62+1500,setUniform(e,t){for(let n of P)n.uniforms[e]&&(n.uniforms[e].value=t)},setDim(e,t,n){for(let r=0;r<l;r++)w[r]=xe(a[r],e,t,n);F.needsUpdate=!0},dispose:I}}function be(e,t,n,r){switch(t){case`dark`:return n.dark.some(t=>t.c===e.c)?1:.08;case`nebula`:return n.nebula.some(t=>t.c===e.c)?1:.1;case`worm`:{let t=n.wormholes[r];return t&&(e.g===t.a||e.g===t.b)?1:.11}case`me`:return n.meta.own===0||e.o>0?1:.1;case`solo`:return .12;default:return 1}}function xe(e,t,n,r){let i=be(e,t,n,r);return n.dark.some(t=>t.c===e.c)?Math.min(i,.3):i}var Se=.9,Ce=(e,t,n)=>Math.max(t,Math.min(n,e)),we=(e,t,n)=>{let r=Ce((n-e)/Math.max(1e-6,t-e),0,1);return r*r*(3-2*r)};function Te(e){let t=Ce((e.far-e.viewZ)/Math.max(.001,e.far-e.near),0,1);return e.renderDim*we(13,40,e.starPx)*we(Se,1,e.convergence)*t*t}function Ee(e){return e.clipZ>=-1&&e.clipZ<=1&&Te(e)>.004}function De(e){let t=new Map;for(let n of e){let e=t.get(n.star);e?e.push(n):t.set(n.star,[n])}return t}function Oe(e,t,n){return e.find(e=>`id`in e.star.s&&e.star.s.id===t&&e.question.id===n)??null}var ke=2.1,Ae=1.15,je=.085,Me={star:1.9,planet:.92,ring:.1},Ne=`
${R}
${z}
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
`,Pe=`
${B}
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
`,Fe=`
${R}
${z}
attribute vec3 iU;
attribute vec3 iV;
attribute vec3 iStarPos;
attribute vec3 iStarCenter;
attribute vec3 iStarAxis;
attribute vec3 iColor;
// x=orbitR y=phase z=period w=planetR
attribute vec4 iOrb;
// x=own*2+fresh y=starSeed z=starR w=starPeriod
//   own   ∈{0,1}  是否本人创作
//   fresh ∈[0,1)  内容的新旧，1 近 0 远
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
varying vec3 vN;
varying vec3 vL;
varying vec3 vV;
varying float vAlpha;
varying float vOwn;
varying float vFresh;
varying float vSeed;
varying float vSel;

void main() {
  vec3 starW = orbitAround(iStarPos, iStarCenter, iStarAxis, iMeta.w, uT * 0.001);
  starW += iStarAxis * sin(uT / (6400.0 + mod(iMeta.y * 311.0, 5200.0)) + iMeta.y) * uBob;

  float th = iOrb.y + 6.28318530718 / iOrb.z * (uT * 0.001);
  vec3 centerW = starW + (iU * cos(th) + iV * sin(th)) * iOrb.x;
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
  vOwn = step(2.0, iMeta.x);
  vFresh = iMeta.x - vOwn * 2.0;
  vSeed = iOrb.y;
  vSel = iSel;
  vColor = iColor;
  vAlpha = iDim * lod * smoothstep(${Se.toFixed(2)}, 1.0, uConverge)
         * depthFade(max(1.0, -mvC.z), uNear, uFar);
}
`,Ie=`
${B}
uniform float uGain;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vL;
varying vec3 vV;
varying float vAlpha;
varying float vOwn;
varying float vFresh;
varying float vSeed;
varying float vSel;

void main() {
  if (vAlpha <= 0.004) discard;
  vec3 N = normalize(vN);
  vec3 L = normalize(vL);
  vec3 V = normalize(vV);

  float tex = 0.82 + 0.18 * (snoise(N * 5.0 + vSeed) * 0.7 + snoise(N * 13.0 - vSeed) * 0.3);
  // 岩石本色里掺一点恒星的颜色：行星是被这颗恒星照亮的
  vec3 rock = mix(vec3(0.28, 0.31, 0.40), vColor, 0.30) * tex;

  vec3 col;
  // 每颗行星都由自己的恒星照亮 —— 这是物理，对谁都成立。
  //
  // 这里携带的是问题回答的最近公开发布时间／更新时间：近期仍有公开活动的
  // 问题反照率高、带一层大气轮缘，久远或无公开时间的更暗、更粗糙。
  float d = max(0.0, dot(N, L));
  float term = smoothstep(-0.06, 0.28, dot(N, L));
  float albedo = mix(0.30, 1.0, vFresh);
  col = rock * albedo * (0.05 + 0.95 * d) * term;
  float atmo = pow(1.0 - max(0.0, dot(N, V)), 3.0) * vFresh * 0.55;
  col += vec3(0.42, 0.58, 0.95) * atmo * (0.25 + 0.75 * d);

  // 存在真实 created binding：夜面透出一点暖光。
  if (vOwn > 0.5) {
    float rim = pow(1.0 - max(0.0, dot(N, V)), 2.2);
    vec3 glow = vec3(1.0, 0.80, 0.48);
    col += glow * (0.09 + rim * 0.36) * (1.0 - term * 0.5);
  }

  // 选中：加一道冷色轮缘。不整颗提亮 —— 那会把「自己发光 / 只反射」这条
  // 语义抹平，选中态不该篡改数据本身在说的事
  if (vSel > 0.5) {
    float rim = pow(1.0 - max(0.0, dot(N, V)), 1.8);
    col += vec3(0.52, 0.72, 1.0) * (0.14 + rim * 1.6);
  }

  gl_FragColor = vec4(col * vAlpha * uGain, 1.0);
}
`,Le=`
${R}
${z}
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
`,Re=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.003) discard;
  gl_FragColor = vec4(vColor * vAlpha * uGain, 1.0);
}
`;function ze(t,i){let a=t.universe,c=oe(a),f=c.length,p=new l(1,32,20),h=new u;h.index=p.index,h.setAttribute(`position`,p.getAttribute(`position`)),h.instanceCount=f;let g=new Float32Array(f*3),_=new Float32Array(f*3),v=new Float32Array(f*3),b=new Float32Array(f*3),x=new Float32Array(f*3),S=new Float32Array(f*4),C=new Float32Array(f*2);c.forEach((e,t)=>{g.set(e.p,t*3),_.set(e.center,t*3),v.set(e.axis,t*3),b.set(e.start,t*3),x.set(e.color,t*3),S.set([e.period,e.ignite,e.bodyR,e.seed],t*4),C.set([e.kelvin,1],t*2)}),h.setAttribute(`iPos`,new m(g,3)),h.setAttribute(`iCenter`,new m(_,3)),h.setAttribute(`iAxis`,new m(v,3)),h.setAttribute(`iStart`,new m(b,3)),h.setAttribute(`iColor`,new m(x,3)),h.setAttribute(`iOrb`,new m(S,4)),h.setAttribute(`iMeta`,new m(C,2)),h.boundingSphere=new s(new n,1e6);let T=()=>({uT:{value:0},uConverge:{value:+!!i},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3},uBob:{value:i?0:1.35}}),E=new o({uniforms:{...T(),uIgniteMs:{value:700},uLitFloor:{value:+!!i},uGain:{value:Me.star}},vertexShader:Ne,fragmentShader:Pe,transparent:!0,depthTest:!0,depthWrite:!0}),D=new r(h,E);D.renderOrder=9,D.frustumCulled=!1;let O=c.map(n=>e(t,n.s)),k=1/0,A=-1/0;for(let e of O)for(let t of e){let e=t.latestPublicAt;e!==void 0&&(e<k&&(k=e),e>A&&(A=e))}let j=Math.max(1,A-k),M=e=>e===void 0||!Number.isFinite(k)||!Number.isFinite(A)?.45:Math.min(.999,Math.max(0,(e-k)/j)),N=[];c.forEach((e,t)=>O[t].forEach((t,n)=>N.push({d:e,idx:n,datum:t,own:+!!t.created,fresh:M(t.latestPublicAt)})));let P=N.length,F=new Float32Array(P*3),I=new Float32Array(P*3),L=new Float32Array(P*3),ee=new Float32Array(P*3),R=new Float32Array(P*3),z=new Float32Array(P*3),B=new Float32Array(P*4),V=new Float32Array(P*4),H=new Float32Array(P).fill(1),U=new Float32Array(P),te=new Int32Array(P),ne=[],re=new Map;c.forEach((e,t)=>re.set(e,t)),N.forEach((e,t)=>{let n=e.d,r=e.idx*2654435761%1e3/1e3-.5,[i,a]=Ve(n.sysU,n.sysV,n.sysAxis,r*.22),o=ke+e.idx*Ae,s=7+2.4*o**1.5,c=(e.idx*137.508+n.seed*31.7)*Math.PI/180,l=je+.115*Math.min(1,Math.log1p(e.datum.answerCount)/Math.log1p(30));F.set(i,t*3),I.set(a,t*3),L.set(n.p,t*3),ee.set(n.center,t*3),R.set(n.axis,t*3),z.set(n.color,t*3),B.set([o,c,s,l],t*4),V.set([e.own*2+e.fresh,n.seed,n.bodyR,n.period],t*4),te[t]=re.get(n),ne.push({star:n,question:e.datum.question,answerCount:e.datum.answerCount,created:e.datum.created,collected:e.datum.collected,latestPublicAt:e.datum.latestPublicAt,answers:e.datum.answers,orbitIndex:e.datum.orbitIndex,index:t,u:i,v:a,orbitR:o,phase:c,period:s,radius:l})});let W=new l(1,20,14),G=new u;G.index=W.index,G.setAttribute(`position`,W.getAttribute(`position`)),G.instanceCount=P,Be(G,{pU:F,pV:I,pStarPos:L,pStarCenter:ee,pStarAxis:R,pColor:z,pOrb:B,pMeta:V,pDim:H,pSel:U});let ie=new o({uniforms:{...T(),uGain:{value:Me.planet}},vertexShader:Fe,fragmentShader:Ie,transparent:!0,depthTest:!0,depthWrite:!0}),K=new r(G,ie);K.renderOrder=9,K.frustumCulled=!1;let ae=new Float32Array(432);for(let e=0;e<72;e++){let t=e/72*Math.PI*2,n=(e+1)/72*Math.PI*2;ae.set([Math.cos(t),Math.sin(t),0,Math.cos(n),Math.sin(n),0],e*6)}let q=new u;q.setAttribute(`position`,new d(ae,3)),q.instanceCount=P,Be(q,{pU:F,pV:I,pStarPos:L,pStarCenter:ee,pStarAxis:R,pColor:z,pOrb:B,pMeta:V,pDim:H,pSel:U});let J=new o({uniforms:{...T(),uGain:{value:Me.ring}},vertexShader:Le,fragmentShader:Re,transparent:!0,blending:2,depthTest:!1,depthWrite:!1}),Y=new w(q,J);Y.renderOrder=8.5,Y.frustumCulled=!1;let X=new y;X.add(Y,D,K);let se=[E,ie,J],ce=h.getAttribute(`iMeta`),le=G.getAttribute(`iDim`),ue=q.getAttribute(`iDim`),Z=G.getAttribute(`iSel`),de=q.getAttribute(`iSel`),Q=-1,fe=De(ne);return{group:X,data:c,planets:ne,planetsForStar:e=>fe.get(e)??[],setSelected(e){e!==Q&&(Q>=0&&(U[Q]=0),Q=e>=0&&e<P?e:-1,Q>=0&&(U[Q]=1),Z.needsUpdate=!0,de.needsUpdate=!0)},setUniform(e,t){for(let n of se)n.uniforms[e]&&(n.uniforms[e].value=t)},setMode(e,t,n){let r=c.map(r=>xe(r.s,e,t,n));for(let e=0;e<f;e++)C[e*2+1]=r[e];ce.needsUpdate=!0;for(let e=0;e<P;e++)H[e]=r[te[e]];le.needsUpdate=!0,ue.needsUpdate=!0},dispose(){p.dispose(),W.dispose(),h.dispose(),G.dispose(),q.dispose();for(let e of se)e.dispose()}}}function Be(e,t){e.setAttribute(`iU`,new m(t.pU,3)),e.setAttribute(`iV`,new m(t.pV,3)),e.setAttribute(`iStarPos`,new m(t.pStarPos,3)),e.setAttribute(`iStarCenter`,new m(t.pStarCenter,3)),e.setAttribute(`iStarAxis`,new m(t.pStarAxis,3)),e.setAttribute(`iColor`,new m(t.pColor,3)),e.setAttribute(`iOrb`,new m(t.pOrb,4)),e.setAttribute(`iMeta`,new m(t.pMeta,4)),e.setAttribute(`iDim`,new m(t.pDim,1)),e.setAttribute(`iSel`,new m(t.pSel,1)),e.boundingSphere=new s(new n,1e6)}function Ve(e,t,n,r){let i=Math.cos(r),a=Math.sin(r),o=[e[0]*i+n[0]*a,e[1]*i+n[1]*a,e[2]*i+n[2]*a],s=Math.hypot(o[0],o[1],o[2])||1;return o[0]/=s,o[1]/=s,o[2]/=s,[o,[t[0],t[1],t[2]]]}var He=`
${R}
${z}

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
`,Ue=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d2 = dot(gl_PointCoord * 2.0 - 1.0, gl_PointCoord * 2.0 - 1.0);
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(vColor * exp(-d2 * 3.4) * vAlpha * uGain, 1.0);
}
`;function We(e,t){return Z.construct(n=>Ge(e,t,n))}function Ge(e,t,n){let r=new Map,i=new Map,a=new Map;for(let t of e.clusters)r.set(t.g,t.c),i.set(t.g,F(t.g)),a.set(t.g,[t.hue,t.sat]);let s=Je(1319),l=e.particles,u=l.length,d=new Int32Array(u),f=Ke(u,(e,t)=>{let n=l[e],o=n[3],c=r.get(o)??[0,0,0],u=i.get(o)??[0,1,0],[f,p]=a.get(o)??[218,0];d[e]=o,t.pos=[n[0],n[1],n[2]],t.center=c,t.axis=u,t.period=I(t.pos,c),t.color=q(f,n[4]?Math.max(p,24):p),t.size=n[4]?1.9:1.35,t.seed=e*.618,t.start=qe(s)});n.use(f.geo);let p=e.solo,m=p.length,h=m>0?Ke(m,(e,t)=>{let n=p[e];t.pos=[n.p[0],n.p[1],n.p[2]],t.center=[n.p[0],n.p[1],n.p[2]],t.axis=[0,1,0],t.period=0,t.color=[.72,.8,1],t.size=2.2,t.seed=e*1.37+5,t.start=qe(s)}):null;h&&n.use(h.geo);let g={uT:{value:0},uConverge:{value:+!!t},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3}},_=n.use(new o({uniforms:{...g,uGain:{value:.3},uTwinkle:{value:0}},vertexShader:He,fragmentShader:Ue,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),v=n.use(new o({uniforms:{...g,uGain:{value:.85},uTwinkle:{value:t?0:.55}},vertexShader:He,fragmentShader:Ue,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),b=new y,x=new c(f.geo,_);x.renderOrder=6,x.frustumCulled=!1,b.add(x);let S=null;h&&(S=new c(h.geo,v),S.renderOrder=8,S.frustumCulled=!1,b.add(S));let C=[_,v];return{group:b,setUniform(e,t){for(let n of C)n.uniforms[e]&&(n.uniforms[e].value=t)},setMode(e,t,n){let r=t.wormholes[n];for(let t=0;t<u;t++)f.dim[t]=e===`all`?1:e===`worm`&&r?d[t]===r.a||d[t]===r.b?.9:.07:.12;if(f.dimAttr.needsUpdate=!0,h){let t=e===`solo`?1:e===`all`?.34:.08;h.dim.fill(t),h.dimAttr.needsUpdate=!0}},dispose:n.release()}}function Ke(e,t){let r=new Float32Array(e*3),i=new Float32Array(e*3),a=new Float32Array(e*3),o=new Float32Array(e*3),c=new Float32Array(e*3),l=new Float32Array(e),u=new Float32Array(e),f=new Float32Array(e).fill(1),p=new Float32Array(e),m={pos:[0,0,0],start:[0,0,0],center:[0,0,0],axis:[0,1,0],color:[1,1,1],period:0,size:1,seed:0};for(let n=0;n<e;n++)t(n,m),r.set(m.pos,n*3),i.set(m.start,n*3),a[n*3]=m.center[0],a[n*3+1]=m.center[1],a[n*3+2]=m.center[2],o[n*3]=m.axis[0],o[n*3+1]=m.axis[1],o[n*3+2]=m.axis[2],c.set(m.color,n*3),l[n]=m.period,u[n]=m.size,p[n]=m.seed;let h=new x;return h.setAttribute(`position`,new d(r,3)),h.setAttribute(`aStart`,new d(i,3)),h.setAttribute(`aCenter`,new d(a,3)),h.setAttribute(`aAxis`,new d(o,3)),h.setAttribute(`aColor`,new d(c,3)),h.setAttribute(`aPeriod`,new d(l,1)),h.setAttribute(`aSize`,new d(u,1)),h.setAttribute(`aDim`,new d(f,1)),h.setAttribute(`aSeed`,new d(p,1)),h.boundingSphere=new s(new n,1e6),{geo:h,dim:f,dimAttr:h.getAttribute(`aDim`)}}function qe(e){let t=e()*Math.PI*2,n=Math.acos(2*e()-1),r=2+e()*5;return[r*Math.sin(n)*Math.cos(t),r*Math.sin(n)*Math.sin(t),r*Math.cos(n)]}function Je(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}var Ye=96,Xe=`
${z}
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
`,Ze=`
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.002) discard;
  gl_FragColor = vec4(vColor * vAlpha * uGain, 1.0);
}
`;function Qe(e){return Z.construct(t=>$e(e,t))}function $e(e,t){let n=[],r=[],i=[];for(let t of e.clusters){let a=F(t.g),o=q(t.hue,t.sat),s=new Set;for(let n of t.mem){let r=e.stars.find(e=>e.c===n);if(!r)continue;let i=Math.hypot(r.p[0]-t.c[0],r.p[1]-t.c[1],r.p[2]-t.c[2]);i>1.5&&s.add(Math.round(i))}for(let e of s){let s=ee(t.c,a,e,Ye);for(let e=0;e<s.length;e++){let a=s[e],c=s[(e+1)%s.length];n.push(a[0],a[1],a[2],c[0],c[1],c[2]),r.push(o[0],o[1],o[2],o[0],o[1],o[2]),i.push(t.g,t.g)}}}if(n.length===0)return null;let a=i.length,s=new x;t.use(s),s.setAttribute(`position`,new p(n,3)),s.setAttribute(`aColor`,new p(r,3));let c=new Float32Array(a).fill(1);s.setAttribute(`aDim`,new d(c,1)),s.computeBoundingSphere();let l=t.use(new o({uniforms:{uConverge:{value:0},uNear:{value:1},uFar:{value:4e3},uGain:{value:.24}},vertexShader:Xe,fragmentShader:Ze,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),u=new w(s,l);u.renderOrder=4,u.frustumCulled=!1;let f=i,m=s.getAttribute(`aDim`);return{object:u,setUniform(e,t){l.uniforms[e]&&(l.uniforms[e].value=t)},setMode(e,t,n){let r=t.wormholes[n];for(let t=0;t<a;t++)c[t]=e===`all`?1:e===`worm`&&r?+(f[t]===r.a||f[t]===r.b):.14;m.needsUpdate=!0},dispose:t.release()}}var et=new S(1,.62,.24),tt=190,nt=`
${z}
attribute float aT;      // 0..1，沿曲线的位置
attribute float aWorm;   // 属于第几条虫洞
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

  vAlpha = on * base * depthFade(viewZ, uNear, uFar) * smoothstep(0.9, 1.0, uConverge);
  gl_PointSize = max(1.0, (1.6 + 4.6 * pulse) * (uProjScale / viewZ) * 0.55);
}
`,rt=`
uniform vec3 uColor;
uniform float uGain;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.003) discard;
  float d2 = dot(gl_PointCoord * 2.0 - 1.0, gl_PointCoord * 2.0 - 1.0);
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(uColor * exp(-d2 * 3.0) * vAlpha * uGain, 1.0);
}
`,it=`
${R}
${z}
attribute vec2 aCorner;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute float aPeriod;
attribute float aRadius;
attribute float aSeed;
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
  vAlpha = depthFade(viewZ, uNear, uFar) * smoothstep(0.9, 1.0, uConverge);
}
`,at=`
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
`;function ot(e){return Z.construct(t=>st(e,t))}function st(e,t){let i=new y,a=()=>({uT:{value:0},uConverge:{value:0},uProjScale:{value:1e3},uNear:{value:1},uFar:{value:4e3}}),l=[],u=new Map;for(let t of e.clusters)u.set(t.g,t.c);let d=[],f=[],m=[];e.wormholes.forEach((e,t)=>{let n=u.get(e.a),r=u.get(e.b);if(!n||!r)return;let i=ct(n,r);for(let e=0;e<tt;e++){let a=e/189,o=lt(n,i,r,a);d.push(o[0],o[1],o[2]),f.push(a),m.push(t)}});let h=null,g=null;if(d.length>0){let e=new x;t.use(e),e.setAttribute(`position`,new p(d,3)),e.setAttribute(`aT`,new p(f,1)),e.setAttribute(`aWorm`,new p(m,1)),e.computeBoundingSphere(),g=t.use(new o({uniforms:{...a(),uActive:{value:0},uColor:{value:et.clone()},uGain:{value:2.6}},vertexShader:nt,fragmentShader:rt,blending:2,depthWrite:!1,depthTest:!1,transparent:!0})),h=new c(e,g),h.renderOrder=16,h.frustumCulled=!1,h.visible=!1,i.add(h),l.push(g)}let _=null,v=e.dark.map(t=>({d:t,s:e.stars.find(e=>e.c===t.c)})).filter(e=>!!e.s);if(v.length>0){let c=[[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]],u=[],d=[],f=[],m=[],h=[],g=[],y=[];v.forEach(({d:t,s:n},r)=>{let i=e.clusters.find(e=>e.g===n.g),a=i?i.c:n.p,o=F(n.g),s=i?I(n.p,a):0,l=34+t.f*2.2;for(let[e,i]of c)u.push(n.p[0],n.p[1],n.p[2]),d.push(e,i),f.push(a[0],a[1],a[2]),m.push(o[0],o[1],o[2]),h.push(s),g.push(l),y.push(r*1.7+t.f)});let b=new x;t.use(b),b.setAttribute(`position`,new p(u,3)),b.setAttribute(`aCorner`,new p(d,2)),b.setAttribute(`aCenter`,new p(f,3)),b.setAttribute(`aAxis`,new p(m,3)),b.setAttribute(`aPeriod`,new p(h,1)),b.setAttribute(`aRadius`,new p(g,1)),b.setAttribute(`aSeed`,new p(y,1)),b.boundingSphere=new s(new n,1e6),_=t.use(new o({uniforms:{...a(),uEmphasis:{value:.14},uColor:{value:et.clone()}},vertexShader:it,fragmentShader:at,blending:2,depthWrite:!1,depthTest:!1,transparent:!0}));let S=new r(b,_);S.renderOrder=15,S.frustumCulled=!1,i.add(S),l.push(_)}return{group:i,setUniform(e,t){for(let n of l)n.uniforms[e]&&(n.uniforms[e].value=t)},setActiveWorm(e){g&&(g.uniforms.uActive.value=e)},setEmphasis(e){_&&(_.uniforms.uEmphasis.value=e)},setWormVisible(e){h&&(h.visible=e)},dispose:t.release()}}function ct(e,t){let n=[t[0]-e[0],t[1]-e[1],t[2]-e[2]],r=Math.hypot(n[0],n[1],n[2])||1,i=[n[0]/r,n[1]/r,n[2]/r],a=[0,1,0],o=a[0]*i[0]+a[1]*i[1]+a[2]*i[2],s=[a[0]-i[0]*o,a[1]-i[1]*o,a[2]-i[2]*o],c=Math.hypot(s[0],s[1],s[2]);c<1e-4&&(s=[1-i[0]*i[0],-i[1]*i[0],-i[2]*i[0]],c=Math.hypot(s[0],s[1],s[2])||1);let l=r*.3;return[(e[0]+t[0])/2+s[0]/c*l,(e[1]+t[1])/2+s[1]/c*l,(e[2]+t[2])/2+s[2]/c*l]}function lt(e,t,n,r){let i=1-r,a=i*i,o=2*i*r,s=r*r;return[e[0]*a+t[0]*o+n[0]*s,e[1]*a+t[1]*o+n[1]*s,e[2]*a+t[2]*o+n[2]*s]}var ut=class{canvas;u;ctx;w=0;h=0;v=new n;v2=new n;disposeResources;constructor(e,t){let n=new Z;try{this.canvas=e,this.u=t;let r=e.getContext(`2d`);if(!r)throw Error(`2D label canvas is unavailable`);this.ctx=r,n.defer(()=>this.clear()),this.disposeResources=n.release()}catch(e){throw n.dispose(),e}}resize(e,t,n){this.w=e,this.h=t,this.canvas.width=Math.round(e*n),this.canvas.height=Math.round(t*n),this.ctx.setTransform(n,0,0,n,0,0)}clear(){this.ctx.clearRect(0,0,this.w,this.h)}dispose(){this.disposeResources()}tooClose=0;draw(e,t,n,r,i,a){let o=this.ctx;if(o.clearRect(0,0,this.w,this.h),t<.88)return;let s=Math.min((t-.88)*8,1);o.font=`600 13px "Noto Sans SC", -apple-system, "PingFang SC", sans-serif`,o.textAlign=`center`,o.textBaseline=`alphabetic`,o.lineJoin=`round`,o.miterLimit=2;let c=this.u.wormholes[r],l=[],u=this.u.clusters.map(t=>(this.v.set(t.c[0],t.c[1],t.c[2]).project(e),{c:t,ndc:{x:this.v.x,y:this.v.y,z:this.v.z}})).filter(e=>e.ndc.z>-1&&e.ndc.z<1).sort((e,t)=>t.c.n-e.c.n);for(let{c:t,ndc:r}of u){let u=n===`all`?1:n===`worm`&&c?t.g===c.a||t.g===c.b?1:.16:.3;if(u<.25)continue;let d=(r.x*.5+.5)*this.w,f=(-r.y*.5+.5)*this.h;if(d<-80||d>this.w+80||f<-40||f>this.h+40)continue;let p=this.v2.set(t.c[0],t.c[1],t.c[2]).distanceTo(e.position);if(p<this.tooClose)continue;let m=Math.min(1,Math.max(0,(a-p)/Math.max(.001,a-i))),h=.5+.5*m*m,g=f-15,_=o.measureText(t.name).width,v=[d-_/2-7,g-14,d+_/2+7,g+6];if(l.some(e=>v[0]<e[2]&&v[2]>e[0]&&v[1]<e[3]&&v[3]>e[1]))continue;l.push(v);let y=Math.min(1,.96*s*u*h),b=q(t.hue,t.sat),x=Math.round(226+29*b[0]),S=Math.round(226+29*b[1]),C=Math.round(226+29*b[2]);o.lineWidth=3.5,o.strokeStyle=`rgba(3,5,12,${(y*.92).toFixed(3)})`,o.strokeText(t.name,d,g),o.fillStyle=`rgba(${Math.min(255,x)},${Math.min(255,S)},${Math.min(255,C)},${y.toFixed(3)})`,o.fillText(t.name,d,g)}}};function dt(e){let t=0;for(let n of e.stars)t=Math.max(t,Math.hypot(n.p[0],n.p[1],n.p[2]));for(let n of e.clusters)t=Math.max(t,Math.hypot(n.c[0],n.c[1],n.c[2]));return Math.max(60,t)}function ft(e){let t=[...e.clusters].sort((e,t)=>t.n-e.n).slice(0,3),n=e=>{let n=t[e]??t[0];if(!n)return new S(.6,.7,1);let[r,i,a]=q(n.hue,n.sat);return new S(r,i,a)},r=n(2).clone().lerp(new S(1,1,1),.62);return[new S(.12,.19,.66).lerp(n(0),.26),new S(.54,.16,.6).lerp(n(1),.3),new S(.04,.42,.48).lerp(r,.26)]}function pt(e){if(e)return`low`;let t=navigator.hardwareConcurrency||4,n=navigator.deviceMemory??4;return t<6||n<4?`medium`:`high`}function mt(e,t,n){let r=Math.max(0,n-t);return{t0:e.t0===null?null:e.t0+r,skipAt:e.skipAt===null?null:e.skipAt+r,lastTouch:e.lastTouch+r,lastNow:n}}var ht=1800,gt=3400,_t=500,vt=11,yt=46,bt=13,xt=16,St=4.5,Ct=1.2;function wt(e){return $(e*.8,2.8,6)}var Tt=class{renderer;scene=new _;camera;composer;nebula;stars;bodies;dust;rings;overlay;labels;raf=0;w=0;h=0;dpr=1;R;yaw=.5;pitch=-.2;dist;targetDist;t0=null;lastNow=0;lastTouch=-1e9;skipAt=null;genesisDone;mode=`all`;wormIdx=0;quality;ca=null;focus=new n;focusStar=null;wantFocus=new n;focusOff=new n;retarget=!0;selected=null;convergence;depthNear=1;depthFar=4e3;dragging=!1;lx=0;ly=0;moved=0;tmp=new n;tmp2=new n;lost=!1;destroyed=!1;suspendedAt=null;canvas;u;reduceMotion;cb;resources=new Z;signals;constructor(e,n,r,i,o={},s=pt(i)){this.canvas=e;let c=r.universe;this.u=c,this.reduceMotion=i,this.cb=o,this.signals=new de(o.onRenderReady,o.onRenderError),this.genesisDone=i,this.convergence=+!!i,this.quality=s,this.R=dt(c),this.dist=this.R*4.6,this.targetDist=this.R*1.62;try{this.renderer=new b({canvas:e,antialias:!1,alpha:!1,powerPreference:`high-performance`,stencil:!1}),this.resources.defer(()=>this.renderer.dispose()),this.renderer.setClearColor(0,1),this.renderer.outputColorSpace=t,this.renderer.toneMapping=0,this.camera=new a(60,1,.5,this.R*90);let o=oe(c);this.nebula=te(this.renderer,this.R,ft(c)),this.resources.defer(()=>this.nebula.dispose()),this.stars=ve(c,i,o),this.resources.defer(()=>this.stars.dispose()),this.bodies=ze(r,i),this.resources.defer(()=>this.bodies.dispose()),this.dust=We(c,i),this.resources.defer(()=>this.dust.dispose()),this.rings=Qe(c),this.rings&&this.resources.defer(()=>this.rings?.dispose()),this.overlay=ot(c),this.resources.defer(()=>this.overlay.dispose()),this.labels=new ut(n,c),this.resources.defer(()=>this.labels.dispose()),this.scene.add(this.nebula.group,this.dust.group,this.bodies.group,this.stars.group,this.overlay.group),this.rings&&this.scene.add(this.rings.object);let s=this.renderer.getContext(),l=typeof WebGL2RenderingContext<`u`&&s instanceof WebGL2RenderingContext?s.getParameter(s.MAX_SAMPLES):0;this.composer=new k(this.renderer,{frameBufferType:h,multisampling:Math.min(4,Number.isFinite(l)?l:0),depthBuffer:!0,stencilBuffer:!1}),this.resources.defer(()=>this.composer.dispose()),this.composer.addPass(new j(this.scene,this.camera));let u=new A({blendFunction:P.ADD,mipmapBlur:!0,luminanceThreshold:.68,luminanceSmoothing:.3,intensity:1.02,radius:.74,levels:8});this.quality!==`low`&&(this.ca=new M({offset:new E(.003,.003),radialModulation:!0,modulationOffset:.15}));let d=this.ca?[u,this.ca,new N({mode:O.NEUTRAL})]:[u,new N({mode:O.NEUTRAL})];this.composer.addPass(new D(this.camera,...d)),this.applyMode(),this.bindPointer(),this.resources.defer(()=>this.unbindPointer()),this.resources.defer(()=>this.stop()),this.resize()}catch(e){throw this.signals.destroy(),this.resources.dispose(),e}}start(){!this.destroyed&&this.suspendedAt===null&&!this.raf&&(this.raf=requestAnimationFrame(this.frame))}stop(){this.raf&&cancelAnimationFrame(this.raf),this.raf=0}suspend(e=performance.now()){this.suspendedAt===null&&(this.suspendedAt=e,this.stop())}resume(e=performance.now()){if(this.suspendedAt===null)return;let t=mt({t0:this.t0,skipAt:this.skipAt,lastTouch:this.lastTouch},this.suspendedAt,e);this.t0=t.t0,this.skipAt=t.skipAt,this.lastTouch=t.lastTouch,this.lastNow=t.lastNow,this.suspendedAt=null,this.start()}destroy(){this.destroyed||(this.destroyed=!0,this.signals.destroy(),this.resources.dispose())}setMode(e,t=this.wormIdx){this.mode=e,this.wormIdx=t,e!==`all`&&this.resetView(),this.applyMode()}resetView(){this.focusStar=null,this.targetDist=this.R*1.62,this.retarget=!0,this.clearPlanet()}clearPlanet(){this.selected&&(this.selected=null,this.bodies.setSelected(-1),this.cb.onAnchor?.(0,0,!1),this.cb.onPickPlanet?.(null),this.retarget=!0,this.focusStar&&(this.targetDist=xt))}selectQuestionPlanet(e,t){let n=Oe(this.bodies.planets,e,t);return n&&this.selectPlanet(n),n}restoreQuestionPlanet(e,t){return this.selectQuestionPlanet(e,t)}setWorkspaceOpen(e){this.canvas.style.pointerEvents=e?`none`:``,this.canvas.style.filter=e?`brightness(.55) saturate(.72)`:``}skipGenesis(){this.skipAt===null&&(this.skipAt=performance.now())}resize(){let e=this.canvas.getBoundingClientRect();this.dpr=Math.min(window.devicePixelRatio||1,2),this.w=Math.max(1,e.width),this.h=Math.max(1,e.height),this.renderer.setPixelRatio(this.dpr),this.renderer.setSize(this.w,this.h,!1),this.composer.setSize(this.w,this.h),this.camera.aspect=this.w/this.h,this.camera.updateProjectionMatrix(),this.labels.resize(this.w,this.h,this.dpr)}frame=e=>{if(this.raf=0,!this.destroyed&&!this.lost)try{this.t0===null&&(this.t0=e,this.lastNow=e);let t=Math.min((e-this.lastNow)/1e3,.05);this.lastNow=e;let n=this.reduceMotion?0:e-this.t0,r=this.skipAt===null?0:$((e-this.skipAt)/_t,0,1),i=this.reduceMotion?1:$((n-ht)/gt,0,1),a=Math.max(1-(1-i)**3,r);this.convergence=a;let o=this.reduceMotion?1:r;!this.reduceMotion&&e-this.lastTouch>3500&&a>.95&&(this.yaw+=.085*t),this.selected?this.planetWorld(this.selected,n,this.wantFocus):this.focusStar?this.starWorld(this.focusStar,n,this.wantFocus):this.wantFocus.set(0,0,0),this.retarget&&=(this.focusOff.copy(this.focus).sub(this.wantFocus),!1);let s=this.selected?9:this.focusStar?6:4;this.focusOff.multiplyScalar(Math.exp(-s*t)),this.focusOff.lengthSq()<1e-6&&this.focusOff.set(0,0,0),this.focus.copy(this.wantFocus).add(this.focusOff);let c=this.targetDist<this.dist?Et(this.focusOff.length(),this.R*.03,this.R*.45):0;this.dist+=(this.targetDist-this.dist)*(1-Math.exp(-3.4*t*(1-.9*c))),this.camera.position.set(this.focus.x+Math.sin(this.yaw)*Math.cos(this.pitch)*this.dist,this.focus.y-Math.sin(this.pitch)*this.dist,this.focus.z+Math.cos(this.yaw)*Math.cos(this.pitch)*this.dist),this.camera.lookAt(this.focus);let l=this.camera.position.length(),u=Math.max(1,l-this.R*1.15),d=l+this.R*1.75;this.depthNear=u,this.depthFar=d;let f=this.h*this.dpr*.5/Math.tan(60*Math.PI/360);for(let e of[this.stars,this.dust,this.overlay,this.bodies])e.setUniform(`uT`,n),e.setUniform(`uConverge`,a),e.setUniform(`uProjScale`,f),e.setUniform(`uNear`,u),e.setUniform(`uFar`,d);this.stars.setUniform(`uLitFloor`,o),this.bodies.setUniform(`uLitFloor`,o),this.rings?.setUniform(`uConverge`,a),this.rings?.setUniform(`uNear`,u),this.rings?.setUniform(`uFar`,d);let p=.22+.78*Et(this.dist,this.R*.35,this.R*1.1);if(this.nebula.setDim((this.mode===`all`?1:.48)*p),this.nebula.update(n*.001,this.camera),this.selected&&this.cb.onAnchor){this.planetWorld(this.selected,n,this.tmp);let e=this.tmp.project(this.camera),t=e.z>-1&&e.z<1;this.cb.onAnchor((e.x*.5+.5)*this.w,(-e.y*.5+.5)*this.h,t)}this.composer.render(),this.signals.frameSucceeded(),this.labels.tooClose=this.R*.2,this.labels.draw(this.camera,a,this.mode,this.wormIdx,u,d),!this.genesisDone&&(r>=1||n>this.stars.igniteEnd)&&(this.genesisDone=!0,this.cb.onGenesisEnd?.()),!this.destroyed&&this.suspendedAt===null&&(this.raf=requestAnimationFrame(this.frame))}catch(e){this.stop(),this.signals.frameFailed(e)}};applyMode(){this.stars.setDim(this.mode,this.u,this.wormIdx),this.bodies.setMode(this.mode,this.u,this.wormIdx),this.dust.setMode(this.mode,this.u,this.wormIdx),this.rings?.setMode(this.mode,this.u,this.wormIdx),this.overlay.setActiveWorm(this.wormIdx),this.overlay.setWormVisible(this.mode===`worm`),this.overlay.setEmphasis(this.mode===`dark`?1:.14)}bindPointer(){let e=this.canvas;e.addEventListener(`pointerdown`,this.onDown),e.addEventListener(`pointermove`,this.onMove),e.addEventListener(`pointerup`,this.onUp),e.addEventListener(`wheel`,this.onWheel,{passive:!1}),e.addEventListener(`webglcontextlost`,this.onContextLost),e.addEventListener(`webglcontextrestored`,this.onContextRestored)}unbindPointer(){let e=this.canvas;e.removeEventListener(`pointerdown`,this.onDown),e.removeEventListener(`pointermove`,this.onMove),e.removeEventListener(`pointerup`,this.onUp),e.removeEventListener(`wheel`,this.onWheel),e.removeEventListener(`webglcontextlost`,this.onContextLost),e.removeEventListener(`webglcontextrestored`,this.onContextRestored)}onContextLost=e=>{e.preventDefault(),this.lost=!0,this.stop(),this.signals.frameFailed(Error(`WebGL context lost`))};onContextRestored=()=>{this.lost=!1,this.resize()};onDown=e=>{this.canvas.focus({preventScroll:!0}),this.lastTouch=performance.now(),this.dragging=!0,this.moved=0,this.lx=e.clientX,this.ly=e.clientY,this.canvas.setPointerCapture(e.pointerId)};onMove=e=>{if(!this.dragging){let t=this.canvas.getBoundingClientRect(),n=e.clientX-t.left,r=e.clientY-t.top,i=this.hitPlanet(n,r)!==null||this.hitStar(n,r)!==null?`pointer`:``;this.canvas.style.cursor!==i&&(this.canvas.style.cursor=i);return}this.lastTouch=performance.now();let t=e.clientX-this.lx,n=e.clientY-this.ly;this.moved+=Math.abs(t)+Math.abs(n),this.yaw+=t*.0055,this.pitch=$(this.pitch+n*.0045,-1.2,1.2),this.lx=e.clientX,this.ly=e.clientY};onUp=e=>{this.dragging=!1,this.moved<6&&this.pick(e.clientX,e.clientY)};onWheel=e=>{e.preventDefault(),this.lastTouch=performance.now();let t=this.targetDist*(1+Math.sign(e.deltaY)*.12),n=this.selected?Ct:this.focusStar?St:this.R*.62;this.targetDist=$(t,n,this.R*4.6),this.selected&&this.targetDist>xt*.85?this.clearPlanet():this.focusStar&&this.targetDist>this.R*.9&&this.resetView()};pick(e,t){let n=this.canvas.getBoundingClientRect(),r=e-n.left,i=t-n.top,a=this.hitPlanet(r,i);if(a){this.selectPlanet(a);return}this.clearPlanet();let o=this.hitStar(r,i);o?(this.focusStar=o,this.targetDist=xt,this.retarget=!0):this.focusStar&&this.resetView(),this.cb.onPick?.(o?.s??null)}selectPlanet(e){this.selected=e,this.bodies.setSelected(e.index),this.focusStar=e.star,this.targetDist=wt(e.orbitR),this.retarget=!0,this.cb.onPickPlanet?.(e)}hitPlanet(e,t){if(!this.focusStar)return null;let n=this.reduceMotion?0:this.lastNow-(this.t0??this.lastNow),r=this.h*this.dpr*.5/Math.tan(60*Math.PI/360),i=null,a=1/0;for(let o of this.bodies.planetsForStar(this.focusStar)){let s=xe(o.star.s,this.mode,this.u,this.wormIdx);this.planetWorld(o,n,this.tmp),this.tmp2.copy(this.tmp).applyMatrix4(this.camera.matrixWorldInverse);let c=Math.max(1,-this.tmp2.z);this.starWorld(o.star,n,this.tmp2).applyMatrix4(this.camera.matrixWorldInverse);let l=Math.max(1,-this.tmp2.z),u=o.star.bodyR*r/l,d=o.radius*(r/c)/this.dpr;if(this.tmp.project(this.camera),!Ee({starPx:u,convergence:this.convergence,renderDim:s,viewZ:c,near:this.depthNear,far:this.depthFar,clipZ:this.tmp.z}))continue;let f=(this.tmp.x*.5+.5)*this.w,p=(-this.tmp.y*.5+.5)*this.h,m=Math.hypot(f-e,p-t);m<Math.max(d*1.5,bt)&&m<a&&(a=m,i=o)}return i}hitStar(e,t){let n=this.reduceMotion?0:this.lastNow-(this.t0??this.lastNow),r=this.h*this.dpr*.5/Math.tan(60*Math.PI/360),i=null,a=1/0;for(let o of this.bodies.data){if(be(o.s,this.mode,this.u,this.wormIdx)<.4)continue;this.starWorld(o,n,this.tmp);let s=Math.max(1,this.tmp.distanceTo(this.camera.position));if(this.tmp.project(this.camera),this.tmp.z<-1||this.tmp.z>1)continue;let c=(this.tmp.x*.5+.5)*this.w,l=(-this.tmp.y*.5+.5)*this.h,u=Math.hypot(c-e,l-t);u>=a||u<$(o.pointSize*4.3*(r/s)/(2*this.dpr)*.62,vt,yt)&&(a=u,i=o)}return i}planetWorld(e,t,n){this.starWorld(e.star,t,n);let r=e.phase+Math.PI*2/e.period*(t/1e3),i=Math.cos(r),a=Math.sin(r);return n.set(n.x+(e.u[0]*i+e.v[0]*a)*e.orbitR,n.y+(e.u[1]*i+e.v[1]*a)*e.orbitR,n.z+(e.u[2]*i+e.v[2]*a)*e.orbitR)}starWorld(e,t,n){let r=L(e.p,e.center,e.axis,t),i=this.reduceMotion?0:Math.sin(t/(6400+e.seed*311%5200)+e.seed)*1.35;return n.set(r[0]+e.axis[0]*i,r[1]+e.axis[1]*i,r[2]+e.axis[2]*i)}};function Et(e,t,n){let r=$((e-t)/Math.max(1e-6,n-t),0,1);return r*r*(3-2*r)}function $(e,t,n){return e<t?t:e>n?n:e}export{Tt as Renderer};