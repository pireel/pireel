/**
 * gl-transitions 合成层(单一来源,三端共用):
 *  - GLSL 着色器本体逐字取自 gl-transitions(gl-transitions.com,MIT),参数烤成常量,
 *    只保留 direction 作 uniform(推移/划开用);
 *  - GL_MIXER_SRC = 纯 ES5 的 WebGL 渲染器**函数源码字符串**——预览 shim(iframe 内联
 *    脚本,不能 import)直接字符串拼接,导出端/面板用 createGlMixer(new Function 同一份
 *    源码)——合成器只有一份实现,不存在"改一处忘一处"。
 *  - 纹理上传 UNPACK_FLIP_Y(gl-transitions uv 原点在左下);from/to 任意 TexImageSource
 *    (ImageBitmap / Canvas / OffscreenCanvas)。
 */

import type { CutTransitionEffect } from './composition-core';

/** 效果 id → transition GLSL(gl-transitions 规范:实现 vec4 transition(vec2 uv),
 *  可用 getFromColor/getToColor/progress/ratio/direction)。 */
export const TRANSITION_GLSL: Record<CutTransitionEffect, string> = {
  // fade (gre)
  fade: `vec4 transition(vec2 uv){ return mix(getFromColor(uv), getToColor(uv), progress); }`,
  // fadecolor (gre) —— 烤黑色
  fadeblack: `
const vec3 fcolor = vec3(0.0);
const float colorPhase = 0.4;
vec4 transition(vec2 uv){
  return mix(
    mix(vec4(fcolor,1.0), getFromColor(uv), smoothstep(1.0-colorPhase, 0.0, progress)),
    mix(vec4(fcolor,1.0), getToColor(uv), smoothstep(colorPhase, 1.0, progress)),
    progress);
}`,
  // directional (Gaëtan Renaudeau)
  directional: `
vec4 transition(vec2 uv){
  vec2 p = uv + progress * sign(direction);
  vec2 f = fract(p);
  return mix(
    getToColor(f),
    getFromColor(f),
    step(0.0, p.y) * step(p.y, 1.0) * step(0.0, p.x) * step(p.x, 1.0));
}`,
  // directionalwipe (gre) —— smoothness=0.5
  directionalwipe: `
const vec2 wcenter = vec2(0.5, 0.5);
const float wsmoothness = 0.1; // 上游默认 0.5=半屏羽化,真实画面读作叠化——收紧才有"划"感
vec4 transition(vec2 uv){
  vec2 v = normalize(direction);
  v /= abs(v.x) + abs(v.y);
  float d = v.x * wcenter.x + v.y * wcenter.y;
  float m =
    (1.0 - step(progress, 0.0)) *
    (1.0 - smoothstep(-wsmoothness, 0.0, v.x * uv.x + v.y * uv.y - (d - 0.5 + progress * (1.0 + wsmoothness))));
  return mix(getFromColor(uv), getToColor(uv), m);
}`,
  // circleopen (gre) —— smoothness=0.3, opening=true
  circleopen: `
const float csmoothness = 0.08; // 收紧圆形边缘(上游默认 0.3 太软)
const vec2 ccenter = vec2(0.5, 0.5);
const float SQRT_2 = 1.414213562373;
vec4 transition(vec2 uv){
  float x = progress;
  float m = smoothstep(-csmoothness, 0.0, SQRT_2 * distance(ccenter, uv) - x * (1.0 + csmoothness));
  return mix(getFromColor(uv), getToColor(uv), 1.0 - m);
}`,
  // windowslice (gre) —— count=10, smoothness=0.5
  windowslice: `
const float wscount = 10.0;
const float wssmoothness = 0.5; // 上游默认:宽 ramp = 多条百叶同时开合的机理,收紧会退化成硬边擦
vec4 transition(vec2 p){
  float pr = smoothstep(-wssmoothness, 0.0, p.x - progress * (1.0 + wssmoothness));
  float s = step(pr, fract(wscount * p.x));
  return mix(getFromColor(p), getToColor(p), s);
}`,
  // CrossZoom (rectalogic, adapted from TWGL sample) —— strength=0.4
  crosszoom: `
const float czstrength = 0.4;
const float PI = 3.141592653589793;
float Linear_ease(in float begin, in float change, in float duration, in float time){ return change * time / duration + begin; }
float Exponential_easeInOut(in float begin, in float change, in float duration, in float time){
  if (time == 0.0) return begin;
  else if (time == duration) return begin + change;
  time = time / (duration / 2.0);
  if (time < 1.0) return change / 2.0 * pow(2.0, 10.0 * (time - 1.0)) + begin;
  return change / 2.0 * (-pow(2.0, -10.0 * (time - 1.0)) + 2.0) + begin;
}
float Sinusoidal_easeInOut(in float begin, in float change, in float duration, in float time){
  return -change / 2.0 * (cos(PI * time / duration) - 1.0) + begin;
}
float czrand(vec2 co){ return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 crossFade(in vec2 uv, in float dissolve){ return mix(getFromColor(uv).rgb, getToColor(uv).rgb, dissolve); }
vec4 transition(vec2 uv){
  vec2 texCoord = uv.xy / vec2(1.0).xy;
  float t = Linear_ease(0.0, 1.0, 1.0, progress);
  float dissolve = Exponential_easeInOut(0.0, 1.0, 1.0, progress);
  float strength = Sinusoidal_easeInOut(0.0, czstrength, 0.5, t);
  vec3 color = vec3(0.0);
  float total = 0.0;
  vec2 toCenter = vec2(0.5) - texCoord;
  float offset = czrand(uv);
  for (float ti = 0.0; ti <= 40.0; ti++) {
    float percent = (ti + offset) / 40.0;
    float weight = 4.0 * (percent - percent * percent);
    color += crossFade(texCoord + toCenter * percent * strength, dissolve) * weight;
    total += weight;
  }
  return vec4(color / total, 1.0);
}`,
  // rotate_scale_fade (Fernando Kuteken) —— center=0.5, rotations=1, scale=8
  rotatescale: `
const vec2 rcenter = vec2(0.5, 0.5);
const float rotations = 1.0;
const float rscale = 8.0;
const vec4 backColor = vec4(0.15, 0.15, 0.15, 1.0);
const float RPI = 3.14159265359;
vec4 transition(vec2 uv){
  vec2 difference = uv - rcenter;
  vec2 dir = normalize(difference);
  float dist = length(difference);
  float angle = 2.0 * RPI * rotations * progress;
  float c = cos(angle);
  float s = sin(angle);
  float currentScale = mix(rscale, 1.0, 2.0 * abs(progress - 0.5));
  vec2 rotatedDir = vec2(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
  vec2 rotatedUv = rcenter + rotatedDir * dist / currentScale;
  if (rotatedUv.x < 0.0 || rotatedUv.x > 1.0 || rotatedUv.y < 0.0 || rotatedUv.y > 1.0) return backColor;
  return mix(getFromColor(rotatedUv), getToColor(rotatedUv), progress);
}`,
  // GlitchMemories (Gunnar Roth)
  glitch: `
vec4 transition(vec2 p){
  vec2 block = floor(p.xy / vec2(16));
  vec2 uv_noise = block / vec2(64);
  uv_noise += floor(vec2(progress) * vec2(1200.0, 3500.0)) / vec2(64);
  vec2 dist = progress > 0.0 ? (fract(uv_noise) - 0.5) * 0.3 * (1.0 - progress) : vec2(0.0);
  vec2 red = p + dist * 0.2;
  vec2 green = p + dist * 0.3;
  vec2 blue = p + dist * 0.5;
  return vec4(
    mix(getFromColor(red), getToColor(red), progress).r,
    mix(getFromColor(green), getToColor(green), progress).g,
    mix(getFromColor(blue), getToColor(blue), progress).b,
    1.0);
}`,
  // Dreamy (mikolalysenko)
  dreamy: `
vec2 doffset(float progress, float x, float theta){
  float phase = progress * progress + progress + theta;
  float shifty = 0.03 * progress * cos(10.0 * (progress + x));
  return vec2(0, shifty);
}
vec4 transition(vec2 p){
  return mix(getFromColor(p + doffset(progress, p.x, 0.0)), getToColor(p + doffset(1.0 - progress, p.x, 3.14)), progress);
}`,
};

/**
 * WebGL 合成器(ES5 函数源码,单一来源):(W, H, defs) => { canvas, render } | null。
 * render(fromSrc, toSrc, effectId, progress, dirX, dirY) 把结果画在自己的 canvas 上,
 * 返回 false = 该效果编译失败/GL 不可用(调用方降级)。上传 FLIP_Y(gl-transitions
 * uv 左下原点);程序按效果懒编译缓存。
 */
export const GL_MIXER_SRC = `function (W, H, defs) {
  var cv = typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined' ? new OffscreenCanvas(W, H) : (function(){ var c = document.createElement('canvas'); c.width = W; c.height = H; return c; })();
  var gl = cv.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  var VS = 'attribute vec2 a;varying vec2 _uv;void main(){_uv=(a+1.0)/2.0;gl_Position=vec4(a,0.0,1.0);}';
  var HEAD = 'precision highp float;varying vec2 _uv;uniform sampler2D from,to;uniform float progress,ratio;uniform vec2 direction;' +
    'vec4 getFromColor(vec2 uv){return texture2D(from,uv);}vec4 getToColor(vec2 uv){return texture2D(to,uv);}';
  var TAIL = 'void main(){gl_FragColor=transition(_uv);}';
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var texA = gl.createTexture(), texB = gl.createTexture();
  var setup = function (tex) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  };
  setup(texA); setup(texB);
  var progs = {};
  var compile = function (id) {
    if (id in progs) return progs[id];
    var src = defs[id];
    if (!src) { progs[id] = null; return null; }
    var mk = function (type, code) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, code);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { try { console.warn('[hf] transition shader', id, gl.getShaderInfoLog(sh)); } catch (e) {} return null; }
      return sh;
    };
    var vsh = mk(gl.VERTEX_SHADER, VS);
    var fsh = mk(gl.FRAGMENT_SHADER, HEAD + src + TAIL);
    if (!vsh || !fsh) { progs[id] = null; return null; }
    var pr = gl.createProgram();
    gl.attachShader(pr, vsh); gl.attachShader(pr, fsh); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { progs[id] = null; return null; }
    progs[id] = {
      p: pr,
      a: gl.getAttribLocation(pr, 'a'),
      progress: gl.getUniformLocation(pr, 'progress'),
      ratio: gl.getUniformLocation(pr, 'ratio'),
      direction: gl.getUniformLocation(pr, 'direction'),
      from: gl.getUniformLocation(pr, 'from'),
      to: gl.getUniformLocation(pr, 'to'),
    };
    return progs[id];
  };
  var keyA = null, keyB = null; // 纹理内容版本:同 key 跳过 texImage2D(全分辨率上传是逐 tick 重合成的大头)
  var upload = function (unit, tex, srcImg, key, cur) {
    if (key != null && key === cur) return cur;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcImg);
    return key == null ? null : key;
  };
  return {
    canvas: cv,
    render: function (fromSrc, toSrc, id, p, dx, dy, fromKey, toKey) {
      var pr = compile(id);
      if (!pr) return false;
      try {
        gl.viewport(0, 0, W, H);
        gl.useProgram(pr.p);
        keyA = upload(0, texA, fromSrc, fromKey, keyA);
        keyB = upload(1, texB, toSrc, toKey, keyB);
        gl.uniform1i(pr.from, 0);
        gl.uniform1i(pr.to, 1);
        gl.uniform1f(pr.progress, p);
        if (pr.ratio) gl.uniform1f(pr.ratio, W / H);
        if (pr.direction) gl.uniform2f(pr.direction, dx || 0, dy || 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(pr.a);
        gl.vertexAttribPointer(pr.a, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return true;
      } catch (e) { return false; }
    },
  };
}`;

export interface GlMixer {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  render: (fromSrc: TexImageSource, toSrc: TexImageSource, id: string, p: number, dx?: number, dy?: number, fromKey?: string, toKey?: string) => boolean;
}

/** 导出端/面板用:同一份 GL_MIXER_SRC 实例化(与 shim 里的合成器逐字节同源)。 */
export function createGlMixer(W: number, H: number): GlMixer | null {
  try {
    const factory = new Function(`return (${GL_MIXER_SRC})`)() as (w: number, h: number, defs: Record<string, string>) => GlMixer | null;
    return factory(W, H, TRANSITION_GLSL);
  } catch {
    return null;
  }
}

/** 我们的方向语义(B 的行进方向)→ gl-transitions 的 direction uniform(y 轴朝上)。 */
export function glDirection(dir: 'up' | 'down' | 'left' | 'right'): [number, number] {
  switch (dir) {
    case 'left':
      return [1, 0];
    case 'right':
      return [-1, 0];
    case 'up':
      return [0, -1];
    default:
      return [0, 1];
  }
}
