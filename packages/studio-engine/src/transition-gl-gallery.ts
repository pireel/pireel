/**
 * Cut transitions picked from the gl-transitions gallery (https://gl-transitions.com, MIT; author
 * and original name on each entry), one per common editing move: whip pans and spins, zoom
 * through, camera shake, slides, flash, defocus, bloom, light leak, grayscale, pixelate, blocks,
 * clock / heart / blink wipes, cube, doorway, page turn, pop-in card, swirl, ripple, VHS, TV off.
 *
 * Same contract as the hand-tuned set in transition-gl.ts: `vec4 transition(vec2 uv)` over
 * getFromColor / getToColor / progress / ratio / direction, parameters baked to constants.
 * `direction` is the mixer's (see glDirection): it points AGAINST the incoming shot's travel, so
 * shaders whose own direction is the motion negate it.
 */

import type { GalleryTransitionEffect } from './composition-core';

export const GALLERY_GLSL: Record<GalleryTransitionEffect, string> = {
  // Slide over: adapted from Directional (Gaëtan Renaudeau, MIT). The incoming image slides in over
  // the outgoing one, which stays put; it eases out as it lands, with a soft shadow on its leading edge.
  slide: `
vec4 transition(vec2 uv) {
  vec2 m = -sign(direction); // the incoming shot's travel
  float e = 1.0 - pow(1.0 - progress, 3.0);
  vec2 q = uv + m * (1.0 - e);
  if (q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0) return getToColor(q);
  // a soft shadow on the outgoing image just ahead of the incoming edge
  float ahead = dot(q - clamp(q, 0.0, 1.0), m);
  float shade = 0.35 * (1.0 - smoothstep(0.0, 0.06, ahead)) * step(0.0001, progress) * (1.0 - step(1.0, progress));
  vec4 c = getFromColor(uv);
  return vec4(c.rgb * (1.0 - shade), c.a);
}
`,
  // WhipPan (gre, MIT): A fast camera pan that streaks both images with motion blur, the incoming one arriving from the opposite side
  whippan: `
const float blur = 0.4;

const int SAMPLES = 24;

// The panned strip: the outgoing image, then the incoming one behind it
vec4 strip(vec2 q, vec2 d) {
  vec2 qt = q + d;
  // which side of the seam between the two images (works for diagonals too)
  if (dot(q - 0.5, -d) < 0.5 * dot(d, d)) {
    return getFromColor(clamp(q, 0.0, 1.0));
  }
  return getToColor(clamp(qt, 0.0, 1.0));
}

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 transition(vec2 uv) {
  vec2 d = sign(-direction); // the mixer's direction points against the motion
  // ease in and out: slow start, whip in the middle, slow landing
  float p = progress;
  float h = 1.0 - abs(2.0 * p - 1.0); // 0 at both ends, 1 in the middle
  // mostly cubic, with a bit of linear so that it starts moving at once
  float e = 0.5 * h * (0.1 + 0.9 * h * h);
  float pos = p < 0.5 ? e : 1.0 - e;
  float len = blur * h * (0.1 + 2.7 * h * h) / 2.8; // follows the speed

  vec2 q = uv - d * pos;
  // average along the motion, jittered to hide the sample steps
  float jitter = rand(uv);
  vec3 color = vec3(0.0);
  float alpha = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + jitter) / float(SAMPLES) - 0.5;
    vec4 c = strip(q + d * t * len, d);
    color += c.rgb * c.a;
    alpha += c.a;
  }
  return vec4(color / max(alpha, 1e-5), alpha / float(SAMPLES));
}
`,
  // WhipSpin (gre, MIT): The camera rolls faster and faster around the center of the frame, streaking the outgoing image in a spin blur, then the incoming one takes over mid-spin and slows to a stop
  whipspin: `
const float turns = 1.0;
const float blur = 0.5;
const float chroma = 0.6;
const float zoom = 0.25;

const float PI = 3.141592653589793;
const int SAMPLES = 24;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// fold the coordinates back into the image so that the rotated frame stays filled
vec2 mirror(vec2 v) {
  vec2 m = mod(v, 2.0);
  return mix(m, 2.0 - m, step(1.0, m));
}

// the camera's roll angle at time t: the outgoing image speeds up until the middle,
// then the incoming one, already turning, slows down to rest
float rollAngle(float t) {
  float halfTurn = PI * turns;
  if (t < 0.5) {
    float x = 2.0 * t;
    return halfTurn * x * x * x;
  }
  float x = 2.0 - 2.0 * t;
  return -halfTurn * x * x * x;
}

vec4 transition(vec2 uv) {
  float p = progress;
  float h = 1.0 - abs(2.0 * p - 1.0); // 0 at both ends, 1 at the cut
  // the shutter is open longer as the spin speeds up, and closed at both ends
  float shutter = blur * 0.1 * h;
  float scale = 1.0 + zoom * h * h * h;
  vec2 q = (uv - 0.5) * vec2(ratio, 1.0);
  float jitter = hash(uv * vec2(ratio, 1.0) * 731.0);
  vec3 color = vec3(0.0);
  vec3 weight = vec3(0.0);
  float alpha = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float s = (float(i) + jitter) / float(SAMPLES) - 0.5;
    float t = clamp(p + s * shutter, 0.0, 1.0);
    float a = rollAngle(t);
    float c = cos(a), sn = sin(a);
    vec2 r = vec2(c * q.x + sn * q.y, -sn * q.x + c * q.y) / scale;
    vec2 suv = mirror(r / vec2(ratio, 1.0) + 0.5);
    vec4 col = t < 0.5 ? getFromColor(suv) : getToColor(suv);
    // red trails behind and blue leads along the arc: the channels split with the speed
    vec3 w = max(vec3(1.0 - 4.0 * chroma * s, 1.0, 1.0 + 4.0 * chroma * s), 0.0);
    color += col.rgb * col.a * w;
    weight += col.a * w;
    alpha += col.a;
  }
  return vec4(color / max(weight, vec3(1e-5)), alpha / float(SAMPLES));
}
`,
  // ZoomInOut (OllyOllyOlly, MIT): Zooms into the outgoing image until it blurs into a flat color, then out to the incoming one
  zoominout: `
vec2 zoom(vec2 uv, float amount) {
  return 0.5 + ((uv - 0.5) * (1.0 - amount));
}

vec4 transition (vec2 uv) {
  float zoomFrom = smoothstep(0.0, 1.0, progress * 2.0);
  float zoomTo = smoothstep(0.0, 1.0, (1.0 - progress) * 2.0);
  float crossfade = smoothstep(0.4, 0.6, progress);
  return mix(
    getFromColor(zoom(uv, zoomFrom)),
    getToColor(zoom(uv, zoomTo)),
    crossfade
  );
}
`,
  // CameraShake (gre, MIT): The camera jolts violently in random directions, with motion blur and color fringes along each jolt; the cut happens at the peak of the shake, which then settles on the incoming image
  camerashake: `
const float strength = 0.5;
const float jolts = 12.0;
const float blur = 0.5;
const float split = 0.5;

const int TAPS = 10;

float hash12(vec2 v) {
  vec3 v3 = fract(vec3(v.xyx) * 0.1031);
  v3 += dot(v3, v3.yzx + 33.33);
  return fract((v3.x + v3.y) * v3.z);
}

vec2 mirror(vec2 v) {
  return 1.0 - abs(1.0 - mod(v, 2.0));
}

// the camera position at jolt key k: offset (x, y) and roll, each in -1..1
vec3 jolt(float k) {
  // successive jolts go in nearly opposite directions
  float a = 2.4 * k + 1.2 * hash12(vec2(k, 11.0));
  float m = 0.55 + 0.45 * hash12(vec2(k, 23.0));
  return vec3(m * cos(a), m * sin(a), 2.0 * hash12(vec2(k, 37.0)) - 1.0);
}

// how strong the shake is at time t: it builds up quickly, peaks around the cut, then settles
float envelope(float t) {
  float h = clamp(1.6 * (1.0 - abs(2.0 * t - 1.0)), 0.0, 1.0);
  return h * h * (3.0 - 2.0 * h);
}

// the image seen by the camera at time t (in progress units), premultiplied
vec4 shot(vec2 uv, float t, bool incoming) {
  float env = envelope(t);
  // a key every 1/jolts, one of them exactly at the cut
  float s = (t - 0.5) * jolts;
  float k = floor(s);
  float g = 1.0 - (s - k);
  float e = 1.0 - g * g * g; // snaps to the next key, then holds
  vec3 j = mix(jolt(k), jolt(k + 1.0), e) * env;
  float omax = 0.14 * strength * env;
  float rmax = 0.07 * strength * env;
  vec2 off = j.xy * omax;
  float roll = j.z * rmax;
  // zoom in just enough that the frame edges never show, for any offset and roll up to these
  float zoom = (cos(rmax) + sin(rmax) * max(ratio, 1.0 / ratio)) / (1.0 - 2.0 * omax);
  vec2 q = (uv - 0.5) * vec2(ratio, 1.0);
  q = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * q / zoom;
  vec2 p = mirror(q / vec2(ratio, 1.0) + 0.5 + off);
  vec4 c = incoming ? getToColor(p) : getFromColor(p);
  return vec4(c.rgb * c.a, c.a);
}

vec4 transition(vec2 uv) {
  // the exposure follows the shake: no blur at the very ends
  float open = envelope(progress);
  float shutter = 0.8 * blur / jolts * open;
  float lag = 0.2 * split / jolts * open;
  // each channel, premultiplied, and its alpha
  vec2 sumR = vec2(0.0);
  vec2 sumG = vec2(0.0);
  vec2 sumB = vec2(0.0);
  float wsum = 0.0;
  for (int i = 0; i < TAPS; i++) {
    float u = (float(i) + 0.5) / float(TAPS) - 0.5;
    float t = progress + u * shutter;
    // the trails fade out at both ends of the exposure
    float w = 1.0 - 1.4 * abs(u);
    // the cut happens during the exposure: the channels of a tap show the same image
    bool incoming = t >= 0.5;
    // red leads and blue trails the motion, so they split by the speed of the jolt
    vec4 r = shot(uv, t + lag, incoming);
    vec4 c = shot(uv, t, incoming);
    vec4 b = shot(uv, t - lag, incoming);
    sumR += w * r.ra;
    sumG += w * c.ga;
    sumB += w * b.ba;
    wsum += w;
  }
  float alpha = (sumR.y + sumG.y + sumB.y) / (3.0 * wsum);
  if (alpha <= 0.0) return vec4(0.0);
  vec3 color = vec3(
    sumR.x / max(sumR.y, 1e-5),
    sumG.x / max(sumG.y, 1e-5),
    sumB.x / max(sumB.y, 1e-5)
  );
  return vec4(color, alpha);
}
`,
  // StretchSlide (gre, MIT): The outgoing image stretches out long as it shoots away to one side, pulling in the incoming one squashed behind it, which overshoots and springs back to its shape
  stretchslide: `
const float stretch = 0.6;
const float bounce = 0.6;

const float PI = 3.14159265;

// mirror the coordinates back into the frame
vec2 mirror(vec2 v) {
  return 1.0 - abs(1.0 - mod(v, 2.0));
}

vec4 transition(vec2 uv) {
  vec2 dd = -direction; // the mixer's direction points against the motion
  float dl = length(dd);
  vec2 d = dl > 1e-6 ? dd / dl : vec2(-1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  // s: position along the slide across the frame, from 0 (trailing side) to 1 (leading side)
  float ext = abs(d.x) + abs(d.y);
  vec2 q = uv - 0.5;
  float s = 0.5 + dot(q, d) / ext;
  float t = progress;

  // the slide accelerates into the landing (a smoothstep when there is no bounce)
  float land = mix(1.0, 0.5, bounce);
  float m = 3.0 * bounce; // speed at the landing, relative to a linear slide
  float x = clamp(t / land, 0.0, 1.0);
  float e = x * x * (3.0 - 2.0 * x) + m * x * x * (x - 1.0);
  // then a damped spring, starting at the landing speed, that comes to rest exactly at the end
  float w = 2.5 * PI;
  float u = clamp((t - land) / max(1.0 - land, 1e-4), 0.0, 1.0);
  float osc = m * (1.0 - land) / (land * w) * exp(-u) * sin(w * u) * (1.0 - u) * (1.0 - u);
  // past the landing the frame stays covered: the spring stretches the incoming image
  // along the slide, and squashes it back into a sideways bulge
  float len = e + max(osc, 0.0);
  float bulge = 1.0 - e + 3.0 * max(-osc, 0.0);

  // the incoming image is pinned at the trailing side and spans up to the seam
  float g = 1.0 + 0.6 * stretch * bulge;
  vec2 pt = q + d * (s / max(len, 1e-4) - s) * ext;
  pt -= n * dot(pt, n) * (1.0 - 1.0 / g);
  vec4 b = getToColor(mirror(pt + 0.5));

  // the outgoing image hangs from the seam and stretches out long ahead of it,
  // the most near the seam, where it is pulled
  float l = 1.0 + 4.0 * stretch * e;
  float k = clamp(1.6 * stretch * e, 0.0, 0.8);
  float y = max(s - e, 0.0) / l;
  // invert y = (1 + k) v - k v^2
  float v = 2.0 * y / ((1.0 + k) + sqrt((1.0 + k) * (1.0 + k) - 4.0 * k * y));
  vec4 a = getFromColor(mirror(q + d * (v - s) * ext + 0.5));

  // past the landing, only the incoming image is left
  return (s < len || t >= land) ? b : a;
}
`,
  // FlashFade (gre, MIT): A crossfade that brightens toward a color in the middle
  flash: `
const vec3 color = vec3(1.0);
vec4 transition (vec2 uv) {
  return mix(
    getFromColor(uv) + vec4(progress*color, 0.0),
    getToColor(uv) + vec4((1.0-progress)*color, 0.0),
    progress
  );
}
`,
  // DefocusBlur (Sergey Kosarevsky, MIT): A crossfade through an out-of-focus blur
  blur: `
// Ported from https://gist.github.com/corporateshark/b9f8e5675c647e615419

const float blurSize = 0.02;

// 12-tap Poisson disk
// https://github.com/spite/Wagner/blob/master/fragment-shaders/poisson-disc-blur-fs.glsl

vec4 transition(vec2 uv) {
  float T = progress;
  float half_ = 0.5;
  float D = (T < half_) ? mix(0.0, blurSize, T / half_) : mix(blurSize, 0.0, (T - half_) / half_);
  vec4 C0 = getFromColor(uv);
  vec4 C1 = getToColor(uv);
  C0 += getFromColor(vec2(-0.326, -0.406) * D + uv);
  C1 += getToColor(vec2(-0.326, -0.406) * D + uv);
  C0 += getFromColor(vec2(-0.840, -0.074) * D + uv);
  C1 += getToColor(vec2(-0.840, -0.074) * D + uv);
  C0 += getFromColor(vec2(-0.696,  0.457) * D + uv);
  C1 += getToColor(vec2(-0.696,  0.457) * D + uv);
  C0 += getFromColor(vec2(-0.203,  0.621) * D + uv);
  C1 += getToColor(vec2(-0.203,  0.621) * D + uv);
  C0 += getFromColor(vec2( 0.962, -0.195) * D + uv);
  C1 += getToColor(vec2( 0.962, -0.195) * D + uv);
  C0 += getFromColor(vec2( 0.473, -0.480) * D + uv);
  C1 += getToColor(vec2( 0.473, -0.480) * D + uv);
  C0 += getFromColor(vec2( 0.519,  0.767) * D + uv);
  C1 += getToColor(vec2( 0.519,  0.767) * D + uv);
  C0 += getFromColor(vec2( 0.185, -0.893) * D + uv);
  C1 += getToColor(vec2( 0.185, -0.893) * D + uv);
  C0 += getFromColor(vec2( 0.507,  0.064) * D + uv);
  C1 += getToColor(vec2( 0.507,  0.064) * D + uv);
  C0 += getFromColor(vec2( 0.896,  0.412) * D + uv);
  C1 += getToColor(vec2( 0.896,  0.412) * D + uv);
  C0 += getFromColor(vec2(-0.322, -0.933) * D + uv);
  C1 += getToColor(vec2(-0.322, -0.933) * D + uv);
  C0 += getFromColor(vec2(-0.792, -0.598) * D + uv);
  C1 += getToColor(vec2(-0.792, -0.598) * D + uv);
  C0 /= 13.0;
  C1 /= 13.0;
  return mix(C0, C1, T);
}
`,
  // BloomDissolve (gre, MIT): The highlights of the outgoing image blow out into a soft, wide glow that floods the frame; under it the incoming image takes over, then the glow subsides back into its highlights while the image stays sharp
  bloom: `
const float spread = 0.25;
const float threshold = 0.6;
const float intensity = 1.5;
const vec3 tint = vec3(1.0, 0.9, 0.75);

// pairs of opposite taps: 20 reads per pixel
const int PAIRS = 10;
const float GOLDEN_ANGLE = 2.399963;

float hash12(vec2 v) {
  vec3 v3 = fract(vec3(v.xyx) * 0.1031);
  v3 += dot(v3, v3.yzx + 33.33);
  return fract((v3.x + v3.y) * v3.z);
}

// mirror the coordinates back into the frame
vec2 mirror(vec2 v) {
  return 1.0 - abs(1.0 - mod(v, 2.0));
}

// the image on screen at a point, premultiplied: one image, or both during the short switch
vec4 image(vec2 st, float m) {
  if (m <= 0.0) {
    vec4 c = getFromColor(st);
    return vec4(c.rgb * c.a, c.a);
  }
  if (m >= 1.0) {
    vec4 c = getToColor(st);
    return vec4(c.rgb * c.a, c.a);
  }
  vec4 a = getFromColor(st);
  vec4 b = getToColor(st);
  return mix(vec4(a.rgb * a.a, a.a), vec4(b.rgb * b.a, b.a), m);
}

// the light of a pixel (premultiplied): its color above the knee, full well before white
vec3 glow(vec4 c, float knee) {
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  return c.rgb * smoothstep(knee, knee + max(0.3 * (1.0 - knee), 1e-3), lum);
}

vec4 transition(vec2 uv) {
  float p = progress;
  // the glow blooms on the outgoing image, and subsides on the incoming one
  float amount = 4.0 * p * (1.0 - p);
  float peak = amount * amount;
  // around the middle, the whole frame catches the light and floods with glow
  float flood = peak * peak * peak;
  // the switch, under the glow at its brightest
  float m = smoothstep(0.44, 0.56, p);
  if (amount <= 0.0) return m < 0.5 ? getFromColor(uv) : getToColor(uv);

  // the image stays sharp underneath (premultiplied colors, only the images on screen are read)
  vec4 c = image(uv, m);
  if (c.a <= 0.0) return vec4(0.0);
  c.rgb /= c.a;

  // more and more of the image catches the light as the glow grows
  float knee = threshold * (1.0 - 0.3 * peak) * (1.0 - flood);
  float radius = spread * amount;
  // a rotation and a radial shift of the spiral for each pixel blend the taps into a smooth glow;
  // hashed by integer cell so that every GPU computes the same values
  vec2 cell = floor(uv * vec2(ratio, 1.0) * 997.0);
  float spin = 6.2831853 * hash12(cell);
  float shift = hash12(cell + 71.0);

  // a golden-angle spiral, denser toward the center so the glow is bright at its core with a wide soft tail;
  // each tap is read with its opposite, which cancels most of the noise across smooth gradients
  vec3 bloom = vec3(0.0);
  vec4 soft = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < PAIRS; i++) {
    float s = (float(i) + shift) / float(PAIRS);
    float r = s * s;
    float a = float(i) * GOLDEN_ANGLE + spin;
    vec2 offset = radius * r * vec2(cos(a) / ratio, sin(a));
    vec4 i0 = image(mirror(uv + offset), m);
    vec4 i1 = image(mirror(uv - offset), m);
    vec3 l = glow(i0, knee) + glow(i1, knee);
    // the sparse outer taps weigh less, so the tail of the glow stays smooth
    float w = 1.0 - 0.75 * s;
    // white at the core, tinted toward the edges
    bloom += w * mix(vec3(1.0), tint, smoothstep(0.0, 0.5, r)) * l;
    total += w;
    // a closer blur of the image, to soften it
    float sw = (1.0 - s) * (1.0 - s);
    soft += sw * (i0 + i1);
  }
  bloom /= 2.0 * total;
  // at the peak the light softens the image itself, which hides the switch
  vec3 blurred = soft.a > 0.0 ? soft.rgb / soft.a : c.rgb;
  vec3 base = mix(c.rgb, blurred, 0.7 * flood);
  bloom *= intensity * peak * (1.0 + 2.0 * flood);
  // compressed, so that the glow floods the frame without flattening into white
  bloom = 0.92 * (1.0 - exp(-bloom));

  // the glow is a light screened over the image: it adds nothing to its alpha
  base = min(base * (1.0 + 0.25 * peak), 1.0);
  return vec4(base + bloom - base * bloom, c.a);
}
`,
  // FilmBurn (Anastasia Dunbar, MIT): Glowing film-burn light leaks wash over the image and reveal the incoming one
  lightleak: `
const float Seed = 2.31;
float sigmoid(float x, float a) {
    float b = pow(x*2.,a)/2.;
    if (x > .5) {
        b = 1.-pow(2.-(x*2.),a)/2.;
    }
	return b;
}
float rand(float co){
    return fract(sin((co*24.9898)+Seed)*43758.5453);
}
float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}
float apow(float a,float b) { return pow(abs(a),b)*sign(b); }
vec3 pow3(vec3 a,vec3 b) { return vec3(apow(a.r,b.r),apow(a.g,b.g),apow(a.b,b.b)); }
float smooth_mix(float a,float b,float c) { return mix(a,b,sigmoid(c,2.)); }
float random(vec2 co, float shft){
    co += 10.;
    return smooth_mix(fract(sin(dot(co.xy ,vec2(12.9898+(floor(shft)*.5),78.233+Seed))) * 43758.5453),fract(sin(dot(co.xy ,vec2(12.9898+(floor(shft+1.)*.5),78.233+Seed))) * 43758.5453),fract(shft));
}
float smooth_random(vec2 co, float shft) {
	return smooth_mix(smooth_mix(random(floor(co),shft),random(floor(co+vec2(1.,0.)),shft),fract(co.x)),smooth_mix(random(floor(co+vec2(0.,1.)),shft),random(floor(co+vec2(1.,1.)),shft),fract(co.x)),fract(co.y));
}
vec4 blendedColor(vec2 p) {
    return mix(getFromColor(p), getToColor(p), sigmoid(progress,10.));
}
#define pi 3.14159265358979323
#define clamps(x) clamp(x,0.,1.)

vec4 transition(vec2 p) {
  vec3 f = vec3(0.);
  for (float i = 0.; i < 13.; i++) {
    f += sin(((p.x*rand(i)*6.)+(progress*8.))+rand(i+1.43))*sin(((p.y*rand(i+4.4)*6.)+(progress*6.))+rand(i+2.4));
    f += 1.-clamps(length(p-vec2(smooth_random(vec2(progress*1.3),i+1.),smooth_random(vec2(progress*.5),i+6.25)))*mix(20.,70.,rand(i)));
  }
  f += 4.;
  f /= 11.;
  f = pow3(f*vec3(1.,0.7,0.6),vec3(1.,2.-sin(progress*pi),1.3));
  f *= sin(progress*pi);

  p -= .5;
  p *= 1.+(smooth_random(vec2(progress*5.),6.3)*sin(progress*pi)*.05);
  p += .5;

  vec4 blurred_image = vec4(0.);
  float bluramount = sin(progress*pi)*.03;
  #define repeats  50.
  for (float i = 0.; i < repeats; i++) {
      vec2 q = vec2(cos(degrees((i/repeats)*360.)),sin(degrees((i/repeats)*360.))) *  (rand(vec2(i,p.x+p.y))+bluramount);
      vec2 uv2 = p+(q*bluramount);
      blurred_image += blendedColor(uv2);
  }
  blurred_image /= repeats;

  return blurred_image+vec4(f,0.);
}
`,
  // FadeGrayscale (gre, MIT): A crossfade through grayscale
  grayscale: `
const float intensity = 0.3;

vec3 grayscale (vec3 color) {
  return vec3(0.2126*color.r + 0.7152*color.g + 0.0722*color.b);
}

vec4 transition (vec2 uv) {
  vec4 fc = getFromColor(uv);
  vec4 tc = getToColor(uv);
  return mix(
    mix(vec4(grayscale(fc.rgb), fc.a), fc, smoothstep(1.0-intensity, 0.0, progress)),
    mix(vec4(grayscale(tc.rgb), tc.a), tc, smoothstep(    intensity, 1.0, progress)),
    progress);
}
`,
  // Pixelize (gre, MIT): Both images pixelate, crossfade, then sharpen again
  pixelize: `
// forked from https://gist.github.com/benraziel/c528607361d90a072e98

// minimum number of squares (when the effect is at its higher level)
const ivec2 squaresMin = ivec2(20);
// zero disable the stepping
const int steps = 50;

vec4 transition(vec2 uv) {
  float d = min(progress, 1.0 - progress);
  float dist = steps>0 ? ceil(d * float(steps)) / float(steps) : d;
  vec2 squareSize = 2.0 * dist / vec2(squaresMin);
  vec2 p = dist>0.0 ? (floor(uv / squareSize) + 0.5) * squareSize : uv;
  return mix(getFromColor(p), getToColor(p), progress);
}
`,
  // RandomSquares (gre, MIT): The incoming image appears in random squares
  squares: `
const ivec2 size = ivec2(10, 10);
const float smoothness = 0.5;

float rand (vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

vec4 transition(vec2 p) {
  float r = rand(floor(vec2(size) * p));
  float m = smoothstep(0.0, -smoothness, r - (progress * (1.0 + smoothness)));
  return mix(getFromColor(p), getToColor(p), m);
}
`,
  // ClockWipe (Fernando Kuteken, MIT): A wipe that sweeps around the center from a starting angle
  clockwipe: `
#define PI 3.141592653589

const float startingAngle = 90.0;

vec4 transition (vec2 uv) {

  float offset = startingAngle * PI / 180.0;
  float angle = atan(uv.y - 0.5, uv.x - 0.5) + offset;
  float normalizedAngle = (angle + PI) / (2.0 * PI);

  normalizedAngle = normalizedAngle - floor(normalizedAngle);

  return mix(
    getFromColor(uv),
    getToColor(uv),
    step(normalizedAngle, progress)
    );
}
`,
  // HeartWipe (gre, MIT): A heart shape grows from the center to reveal the incoming image
  heart: `
float inHeart (vec2 p, vec2 center, float size) {
  if (size==0.0) return 0.0;
  vec2 o = (p-center)/(1.6*size);
  float a = o.x*o.x+o.y*o.y-0.3;
  return step(a*a*a, o.x*o.x*o.y*o.y*o.y);
}
vec4 transition (vec2 uv) {
  return mix(
    getFromColor(uv),
    getToColor(uv),
    inHeart(uv, vec2(0.5, 0.4), progress)
  );
}
`,
  // EyeBlink (gre, MIT): Curved eyelids close from the top and bottom over the outgoing image, which blurs and dims, then open on the incoming image as it comes back into focus, as if the viewer blinked
  eyeblink: `
const float blur = 0.5;
const float softness = 0.12;
const int blinks = 1;
const vec4 color = vec4(0.03, 0.02, 0.02, 1.0);

const int TAPS = 16;
// how much the eyelids curve: the opening is widest at the center and the corners close first
const float CURVE = 0.25;
// where the eyelids meet, below the middle: the upper lid travels further than the lower one
const float MEET = 0.44;

vec2 mirror(vec2 v) {
  return 1.0 - abs(1.0 - mod(v, 2.0));
}

// a blink fully closed at c (held for 2 * hold): the lids close over wc before it
// and open over wo after it, slower, like a real blink
float lidBlink(float t, float c, float wc, float wo, float hold) {
  return 1.0 - smoothstep(hold, t < c ? wc : wo, abs(t - c));
}

vec4 image(vec2 uv, bool incoming) {
  vec4 c = incoming ? getToColor(uv) : getFromColor(uv);
  return vec4(c.rgb * c.a, c.a);
}

vec4 transition(vec2 uv) {
  bool two = blinks > 1;
  // the moment the eyes are fully closed, when the images are swapped
  float cut = two ? 0.3 : 0.42;
  // how closed the eyes are: 0 open, 1 closed
  float closed = two
    ? max(lidBlink(progress, cut, 0.26, 0.26, 0.015), lidBlink(progress, 0.7, 0.14, 0.24, 0.01))
    : lidBlink(progress, cut, 0.36, 0.5, 0.02);
  bool incoming = progress >= cut;

  // the rim of each eyelid is an arc; fully open, even its corners clear the frame by the widest shadow
  float soft = clamp(softness, 0.001, 0.3);
  float x = 2.0 * uv.x - 1.0;
  float rim = (1.0 - closed) * (1.31 + CURVE) - CURVE * x * x;
  // distance inside the opening from the nearest lid, as a share of that lid's travel
  float y = uv.y - MEET;
  float d = rim - max(y / (1.0 - MEET), -y / MEET);
  // the lid fills beyond its rim, with a soft shadow falling inside the opening
  float s = 1.0 - smoothstep(0.0, soft, d);
  float lid = s * s;
  if (lid >= 1.0) return color;

  // how out of focus and dim the view is: it peaks at the cut, follows the lids, and clears at both ends
  float f = progress < cut ? progress / cut : (1.0 - progress) / (1.0 - cut);
  f = clamp(f, 0.0, 1.0);
  f = max(f * (2.0 - f), closed) * blur;

  vec4 c;
  if (f <= 0.0) {
    c = incoming ? getToColor(uv) : getFromColor(uv);
  } else {
    // a disc of taps along a golden-angle spiral, premultiplied
    float r = 0.025 * f;
    c = vec4(0.0);
    for (int i = 0; i < TAPS; i++) {
      float k = float(i) + 0.5;
      float a = 2.39996 * k;
      vec2 o = sqrt(k / float(TAPS)) * vec2(cos(a), sin(a)) * r;
      c += image(mirror(uv + o * vec2(1.0 / ratio, 1.0)), incoming);
    }
    c /= float(TAPS);
    c = c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0);
    // less light reaches the eye as it closes
    c.rgb *= 1.0 - 0.35 * f;
  }
  return mix(c, color, lid);
}
`,
  // Cube (gre, MIT): The two images are faces of a rotating 3D cube, with a floor reflection
  cube: `
const float persp = 0.7;
const float unzoom = 0.3;
const float reflection = 0.4;
const float floating = 3.0;

vec2 project (vec2 p) {
  return p * vec2(1.0, -1.2) + vec2(0.0, -floating/100.);
}

bool inBounds (vec2 p) {
  return all(lessThan(vec2(0.0), p)) && all(lessThan(p, vec2(1.0)));
}

vec4 bgColor (vec2 p, vec2 pfr, vec2 pto) {
  vec4 c = vec4(0.0); // where no image is drawn: transparent
  pfr = project(pfr);
  // FIXME avoid branching might help perf!
  if (inBounds(pfr)) {
    c += mix(vec4(0.0), getFromColor(pfr), reflection * mix(1.0, 0.0, pfr.y));
  }
  pto = project(pto);
  if (inBounds(pto)) {
    c += mix(vec4(0.0), getToColor(pto), reflection * mix(1.0, 0.0, pto.y));
  }
  return c;
}

// p : the position
// persp : the perspective in [ 0, 1 ]
// center : the xcenter in [0, 1] \ 0.5 excluded
vec2 xskew (vec2 p, float persp, float center) {
  float x = mix(p.x, 1.0-p.x, center);
  return (
    (
      vec2( x, (p.y - 0.5*(1.0-persp) * x) / (1.0+(persp-1.0)*x) )
      - vec2(0.5-distance(center, 0.5), 0.0)
    )
    * vec2(0.5 / distance(center, 0.5) * (center<0.5 ? 1.0 : -1.0), 1.0)
    + vec2(center<0.5 ? 0.0 : 1.0, 0.0)
  );
}

vec4 transition(vec2 op) {
  float uz = unzoom * 2.0*(0.5-distance(0.5, progress));
  vec2 p = -uz*0.5+(1.0+uz) * op;
  vec2 fromP = xskew(
    (p - vec2(progress, 0.0)) / vec2(1.0-progress, 1.0),
    1.0-mix(progress, 0.0, persp),
    0.0
  );
  vec2 toP = xskew(
    p / vec2(progress, 1.0),
    mix(pow(progress, 2.0), 1.0, persp),
    1.0
  );
  // FIXME avoid branching might help perf!
  if (inBounds(fromP)) {
    return getFromColor(fromP);
  }
  else if (inBounds(toP)) {
    return getToColor(toP);
  }
  return bgColor(op, fromP, toP);
}
`,
  // Doorway (gre, MIT): The outgoing image opens like double doors as the incoming one comes forward, with a floor reflection
  doorway: `
const float reflection = 0.4;
const float perspective = 0.4;
const float depth = 3.0;

const vec4 black = vec4(0.0); // where no image is drawn: transparent
const vec2 boundMin = vec2(0.0, 0.0);
const vec2 boundMax = vec2(1.0, 1.0);

bool inBounds (vec2 p) {
  return all(lessThan(boundMin, p)) && all(lessThan(p, boundMax));
}

vec2 project (vec2 p) {
  return p * vec2(1.0, -1.2) + vec2(0.0, -0.02);
}

vec4 bgColor (vec2 p, vec2 pto) {
  vec4 c = black;
  pto = project(pto);
  if (inBounds(pto)) {
    c += mix(black, getToColor(pto), reflection * mix(1.0, 0.0, pto.y));
  }
  return c;
}

vec4 transition (vec2 p) {
  vec2 pfr = vec2(-1.), pto = vec2(-1.);
  float middleSlit = 2.0 * abs(p.x-0.5) - progress;
  if (middleSlit > 0.0) {
    pfr = p + (p.x > 0.5 ? -1.0 : 1.0) * vec2(0.5*progress, 0.0);
    float d = 1.0/(1.0+perspective*progress*(1.0-middleSlit));
    pfr.y -= d/2.;
    pfr.y *= d;
    pfr.y += d/2.;
  }
  float size = mix(1.0, depth, 1.-progress);
  pto = (p + vec2(-0.5, -0.5)) * vec2(size, size) + vec2(0.5, 0.5);
  if (inBounds(pfr)) {
    return getFromColor(pfr);
  }
  else if (inBounds(pto)) {
    return getToColor(pto);
  }
  else {
    return bgColor(p, pto);
  }
}
`,
  // BookFlip (hong, MIT): The outgoing image turns like a book page from right to left, revealing the incoming one
  pageflip: `
// Avoids dividing by zero when the page is edge-on (progress = 0.5).
float nonZero(float x) {
  return abs(x) < 1e-4 ? (x < 0.0 ? -1e-4 : 1e-4) : x;
}

vec2 skewRight(vec2 p) {
  float skewX = (p.x - progress)/nonZero(0.5 - progress) * 0.5;
  float skewY =  (p.y - 0.5)/(0.5 + progress * (p.x - 0.5) / 0.5)* 0.5  + 0.5;
  return vec2(skewX, skewY);
}

vec2 skewLeft(vec2 p) {
  float skewX = (p.x - 0.5)/nonZero(progress - 0.5) * 0.5 + 0.5;
  float skewY = (p.y - 0.5) / (0.5 + (1.0 - progress ) * (0.5 - p.x) / 0.5) * 0.5  + 0.5;
  return vec2(skewX, skewY);
}

vec4 addShade() {
  float shadeVal  =  max(0.7, abs(progress - 0.5) * 2.0);
  return vec4(vec3(shadeVal ), 1.0);
}

vec4 transition (vec2 p) {
  float pr = step(1.0 - progress, p.x);

  if (p.x < 0.5) {
    return mix(getFromColor(p), getToColor(skewLeft(p)) * addShade(), pr);
  } else {
    return mix(getFromColor(skewRight(p)) * addShade(), getToColor(p),   pr);
  }
}
`,
  // PopIn (gre, MIT): The incoming image pops in as a rounded card over the outgoing one, with an elastic overshoot: too big, a bit small, then it settles into the full frame as its corners square off
  popin: `
const vec2 center = vec2(0.5, 0.5);
const float bounce = 1.0;
const float corner = 0.12;
const float shadow = 0.5;

const float PI = 3.141592653589793;

// signed distance to a rounded box of half size b and corner radius r
float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec4 transition(vec2 uv) {
  float t = progress;
  // scale of the card: an ease-out, plus a damped spring that overshoots and lands exactly at t = 1
  float easeOut = 1.0 - (1.0 - t) * (1.0 - t) * (1.0 - t);
  float spring = 1.0 - exp(-1.5 * t) * cos(2.5 * PI * t) * (1.0 - t);
  float s = mix(easeOut, spring, bounce);

  // the card is the incoming frame scaled by s around the center, in aspect-corrected space
  vec2 asp = vec2(ratio, 1.0);
  float side = min(ratio, 1.0);
  vec2 cardCenter = center + (0.5 - center) * s;
  vec2 halfSize = 0.5 * s * asp;
  float r = corner * s * side * (1.0 - t);
  float aa = 0.002;
  // the edge is pushed out by one antialiasing width, so at t = 1 the card covers the whole frame
  float d = roundedBox((uv - cardCenter) * asp, halfSize, r) - aa;
  float cover = clamp(0.5 - d / aa, 0.0, 1.0) * smoothstep(0.0, 0.08, t);

  // drop shadow on the outgoing image, offset down and blurred, growing with the card
  float k = min(s, 1.0) * side;
  float blur = 0.05 * k + 1e-4;
  vec2 offset = vec2(0.0, -0.03 * k);
  float ds = roundedBox((uv - cardCenter - offset) * asp, halfSize, r);
  float shade = shadow * (1.0 - smoothstep(-blur, blur, ds)) * smoothstep(0.0, 0.15, t);

  vec4 a = getFromColor(uv);
  // the shadow darkens the outgoing image, it does not change its alpha (no shadow on transparent areas)
  a.rgb *= 1.0 - shade;
  // clamped: only the antialiased rim, one pixel or two outside the card, reads past the edge
  vec4 b = getToColor(clamp((uv - center) / max(s, 1e-4) + center, 0.0, 1.0));
  // blend premultiplied, then back to straight alpha
  vec4 c = mix(vec4(a.rgb * a.a, a.a), vec4(b.rgb * b.a, b.a), cover);
  return c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0);
}
`,
  // Swirl (Sergey Kosarevsky, MIT): Both images swirl around the center while crossfading
  swirl: `
// ( http://www.linderdaum.com )
// ported by gre from https://gist.github.com/corporateshark/cacfedb8cca0f5ce3f7c

vec4 transition(vec2 UV)
{
	float Radius = 1.0;

	float T = progress;

	UV -= vec2( 0.5, 0.5 );

	float Dist = length(UV);

	if ( Dist < Radius )
	{
		float Percent = (Radius - Dist) / Radius;
		float A = ( T <= 0.5 ) ? mix( 0.0, 1.0, T/0.5 ) : mix( 1.0, 0.0, (T-0.5)/0.5 );
		float Theta = Percent * Percent * A * 8.0 * 3.14159;
		float S = sin( Theta );
		float C = cos( Theta );
		UV = vec2( dot(UV, vec2(C, -S)), dot(UV, vec2(S, C)) );
	}
	UV += vec2( 0.5, 0.5 );

	vec4 C0 = getFromColor(UV);
	vec4 C1 = getToColor(UV);

	return mix( C0, C1, T );
}
`,
  // WaterDrop (Paweł Płóciennik, MIT): Ripples spread from the center like a drop falling into water, crossfading to the incoming image
  ripple: `
const float amplitude = 30.0;
const float speed = 30.0;

vec4 transition(vec2 p) {
  vec2 dir = p - vec2(.5);
  float dist = length(dir);

  if (dist > progress) {
    return mix(getFromColor( p), getToColor( p), progress);
  } else {
    vec2 offset = dir * sin(dist * amplitude - progress * speed);
    return mix(getFromColor( p + offset), getToColor( p), progress);
  }
}
`,
  // VhsTracking (gre, MIT): Tape-tracking bands of white snow roll down the frame, tearing the lines around them, with smeared color, wobbling lines, a jittering strip at the bottom and a dropout flash, as the incoming image is recorded over the outgoing one under the densest band
  vhs: `
const int bands = 3;
const float noise = 0.6;
const float bleed = 0.5;
const float wobble = 0.5;

const float LINES = 220.0; // tape lines over the frame height
const float FRAMES = 40.0; // the noise changes this many times over the transition
const float BAND = 0.11; // half height of the main band
const float STRIP = 0.06; // height of the jittering strip at the bottom
const int TAPS = 6;

float hash12(vec2 v) {
  vec3 v3 = fract(vec3(v.xyx) * 0.1031);
  v3 += dot(v3, v3.yzx + 33.33);
  return fract((v3.x + v3.y) * v3.z);
}

vec2 mirror(vec2 v) {
  return 1.0 - abs(1.0 - mod(v, 2.0));
}

// the tape image on the outgoing (or, once re-recorded, incoming) side, premultiplied
vec4 tape(vec2 p, bool fresh) {
  p = mirror(p);
  vec4 c = fresh ? getToColor(p) : getFromColor(p);
  return vec4(c.rgb * c.a, c.a);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// how dense a band centered at y = c of half height w is on line y, with ragged edges
float bandDensity(float y, float c, float w, float jitter) {
  float d = abs(y - c) / w + 0.35 * jitter;
  return 1.0 - smoothstep(0.0, 1.0, d);
}

vec4 transition(vec2 uv) {
  // the effects build up quickly and settle at the end: exactly 0 at both ends
  float h = clamp(2.5 * (1.0 - abs(2.0 * progress - 1.0)), 0.0, 1.0);
  float env = h * h * (3.0 - 2.0 * h);
  // a short dropout flash when the main band crosses the middle of the frame
  float f = clamp(1.0 - abs(progress - 0.5) / 0.04, 0.0, 1.0);
  float flash = f * f * (3.0 - 2.0 * f);

  float frame = floor(progress * FRAMES);
  float line = floor(uv.y * LINES);
  float jitter = hash12(vec2(line, frame + 7.0)) - 0.5;

  // the main band rolls from above the frame to below it; the incoming image is above it
  float c0 = mix(1.0 + 1.2 * BAND, -1.2 * BAND, progress);
  // (the cut is ragged, line by line)
  bool fresh = uv.y > c0 + 0.8 * BAND * jitter;
  float dens = bandDensity(uv.y, c0, BAND, jitter);
  float tear = 1.0 - smoothstep(0.0, 1.0, abs(uv.y - c0) / (2.5 * BAND));
  // thinner and weaker bands roll faster, wrapping around the frame
  for (int i = 1; i < 4; i++) {
    if (i < bands) {
      float k = float(i);
      float w = BAND * (0.35 + 0.2 * hash12(vec2(k, 3.0)));
      float speed = 1.3 + 0.9 * k;
      float cy = -w + (1.0 + 2.0 * w) * fract(hash12(vec2(k, 5.0)) - speed * progress);
      dens = max(dens, 0.6 * bandDensity(uv.y, cy, w, jitter));
      tear = max(tear, 0.5 * (1.0 - smoothstep(0.0, 1.0, abs(uv.y - cy) / (2.5 * w))));
    }
  }
  dens *= env;
  tear *= env;

  // horizontal displacement of the line: a slow wobble, a fine jitter and the tearing
  float rowTear = hash12(vec2(floor(uv.y * LINES * 0.5), frame + 31.0)) - 0.5;
  float dx = wobble * env * (0.006 * sin(uv.y * 7.0 + progress * 23.0) + 0.004 * jitter);
  dx += (0.3 + 0.7 * noise) * tear * 0.18 * rowTear;
  // the head-switching strip at the bottom: lines skewed sideways and jittering
  float strip = env * (1.0 - smoothstep(0.0, STRIP, uv.y));
  dx += strip * (0.03 + 0.06 * (1.0 - uv.y / STRIP)) * (0.6 + 0.8 * hash12(vec2(frame, 41.0)));
  vec2 q = vec2(uv.x + dx, uv.y);

  vec4 c = tape(q, fresh);
  if (c.a <= 0.0) return vec4(0.0);
  // chroma bleed: the color is smeared to the right of the luma
  float len = bleed * (0.02 + 0.05 * dens) * env;
  vec4 avg = c;
  if (len > 0.0) {
    avg = vec4(0.0);
    for (int i = 0; i < TAPS; i++) {
      float u = (float(i) + 0.5) / float(TAPS);
      avg += tape(q - vec2(len * (0.4 + u), 0.0), fresh);
    }
    avg /= float(TAPS);
  }
  vec3 chroma = (avg.rgb - luma(avg.rgb)) / max(avg.a, 1e-5);
  vec3 rgb = luma(c.rgb) + chroma * c.a; // premultiplied by c.a
  // the signal fades and loses color under the bands
  rgb = mix(rgb, vec3(luma(rgb)), 0.6 * dens);

  // snow: short white streaks on the tape lines, denser in the bands
  // (the streaks of each line start at a random offset so they never line up vertically)
  vec2 cell = vec2(floor(uv.x * LINES * 0.3 * ratio + 40.0 * jitter), line);
  float n = hash12(cell + frame * vec2(37.0, 17.0));
  float amount = clamp(noise * max(1.3 * dens, 0.8 * strip) + 0.35 * flash, 0.0, 1.0);
  float snow = amount > 0.0 ? smoothstep(1.0 - amount, 1.0 - 0.6 * amount, n) : 0.0;
  snow *= 0.55 + 0.45 * hash12(cell.yx + frame);
  // and a finer sparkle between them
  float g = hash12(vec2(floor(uv.x * LINES * ratio), line) + frame * vec2(13.0, 29.0));
  snow = max(snow, amount > 0.0 ? 0.7 * smoothstep(1.0 - 0.4 * amount, 1.0, g) : 0.0);
  // and a few dark specks
  float dark = g < 0.1 * amount ? 1.0 : 0.0;
  // the dropout: whole stretches of a few lines go white
  float group = floor(uv.y * LINES / 3.0);
  float drop = step(1.0 - 0.15 * flash, hash12(vec2(group, floor(uv.x * 6.0 + 5.0 * hash12(vec2(group, frame))) + frame * 7.0)));
  rgb *= 1.0 - 0.5 * dark;
  rgb += (clamp(snow + drop + 0.12 * flash, 0.0, 1.0)) * (c.a - rgb);

  return vec4(clamp(rgb / c.a, 0.0, 1.0), c.a);
}
`,
  // TvTurnOff (gre, MIT): The outgoing image collapses into a glowing line and a dot, like an old TV turned off, then the incoming image powers on from the dot
  tvoff: `
const vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
const float glow = 1.0;

vec4 getColor(vec2 uv, bool isFrom) {
  return isFrom ? getFromColor(uv) : getToColor(uv);
}

// The screen at a time t of its power-off: 0 is the full image, 1 is off
vec4 screen(vec2 uv, float t, bool isFrom) {
  float collapse = smoothstep(0.0, 0.4, t); // the image squeezes into a line
  float shrink = smoothstep(0.3, 0.65, t); // the line shrinks into a dot
  float fade = 0.4 * smoothstep(0.75, 1.0, t); // the dot dims
  float radius = 0.01 * (1.0 - fade);
  // half size of the picture, in height units (x is scaled by ratio)
  vec2 size = vec2(mix(0.5 * ratio, radius, shrink), mix(0.5, radius, collapse));
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  vec2 q = clamp(0.5 + 0.5 * p / size, 0.0, 1.0);
  vec4 c = getColor(q, isFrom);
  // the squeezed picture gets brighter and burns to white
  float white = smoothstep(0.4, 1.0, collapse);
  vec4 light = vec4(mix(min(c.rgb * (1.0 + 2.0 * collapse), 1.0), vec3(1.0), white), c.a);
  // soft edges, outside the picture so that t = 0 is the exact image
  vec2 d = abs(p) - size;
  float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  float inside = clamp(1.0 - dist / 0.004, 0.0, 1.0);
  // a glow around the line, tinted by the center of the picture, then warm white around the dot
  vec4 mid = getColor(vec2(0.5), isFrom);
  vec4 halo = vec4(mix(mix(mid.rgb, vec3(1.0), 0.7), vec3(1.0, 0.92, 0.8), shrink), mid.a);
  float h = 1.0 - exp(-2.0 * glow * white * exp(-max(dist, 0.0) / (0.02 + 0.04 * shrink)));
  vec4 col = mix(color, halo, h * (1.0 - fade));
  return mix(col, light, inside * (1.0 - fade));
}

vec4 transition(vec2 uv) {
  if (progress < 0.5) {
    return screen(uv, 2.0 * progress, true);
  }
  return screen(uv, 2.0 - 2.0 * progress, false);
}
`,
};
