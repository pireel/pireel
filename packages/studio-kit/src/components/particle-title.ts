/**
 * particleTitle — a title that assembles out of particles, then resolves into crisp type.
 *
 * Variants:
 *  - converge  particles fly in from around the box and settle into the letterforms. The default.
 *  - rise      particles rise from below like sparks and lock into place.
 *
 * WebGL, drawn as a pure function of time: seeking any frame redraws it exactly, so preview and
 * export match. The particles fade out as the real type fades in, which keeps the final hold
 * sharp and selectable. Without WebGL the type simply appears.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, text, reqText, type PropsOf } from '../schema';
import { fadeUp } from '../motion';
import { fitDown, isCjk, typeScale } from '../sizing';

export const particleTitleSchema = defineSchema({
  variant: en(['converge', 'rise'], 'converge', 'converge = particles fly in from around; rise = sparks rise from below'),
  text: reqText(20, 'Title', 'The title, verbatim — short'),
  sub: text(48, '', 'Line under the title'),
  ...SURFACE_FIELDS,
  surface: en(['card', 'none'], 'none', 'Sits on the footage by default'),
});

export type ParticleTitleProps = PropsOf<typeof particleTitleSchema>;

/** JSON for a timeline string: safe inside the <script> that carries the timeline. */
const js = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export function renderParticleTitle(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = particleTitleSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const subH = p.sub ? s.label * 1.8 : 0;
  const size = fitDown(s.hero, p.text.length, cjk, ctx.box.w - s.pad * 2, Math.min(s.head, 28));
  const glW = Math.max(1, Math.round(ctx.box.w - s.pad * 2));
  // The canvas takes the whole stage so particles have room to travel; the title sits centred in it.
  const glH = Math.max(1, Math.round(Math.max(size * 1.6, ctx.box.h - s.pad * 2 - subH)));
  const subSize = fitDown(s.label, p.sub.length, cjk, ctx.box.w - s.pad * 2, Math.min(s.label, 18));
  const shadow = p.surface === 'card' ? '' : 'text-shadow:0 4px 26px rgb(0 0 0 / 0.45);';
  const life = ctx.durationSec && ctx.durationSec > 1.8 ? ctx.durationSec : 4;
  const settle = 1.45; // particles hand over to the crisp type here

  const html = `
<div class="wrap">
  <div class="stage">
    <canvas class="gl" width="${Math.round(glW * 1.5)}" height="${Math.round(glH * 1.5)}"></canvas>
    <div class="solid">${esc(p.text)}</div>
  </div>
  ${p.sub ? `<div class="sub">${esc(p.sub)}</div>` : ''}
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(s.gap * 0.5)}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .stage{position:relative;width:${glW}px;height:${glH}px;}
#${id} .gl{position:absolute;inset:0;width:100%;height:100%;}
#${id} .solid{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${size}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);line-height:1;white-space:nowrap;opacity:0;${shadow}}
#${id} .sub{font-size:${subSize}px;font-weight:600;color:${inkOn(p, true)};${shadow}}
</style>`;

  // The draw routine: sample the title's pixels once (after fonts load), then every seek places
  // each particle by time alone — start → target with a per-particle delay, plus a faint shimmer.
  const program = `(function(){
var root=document.querySelector('#${id} .stage');var cv=document.querySelector('#${id} .gl');var solid=document.querySelector('#${id} .solid');
if(!cv)return;
var gl=null;try{gl=cv.getContext('webgl',{preserveDrawingBuffer:true,premultipliedAlpha:true,alpha:true,antialias:true});}catch(e){}
var o={t:0};
if(!gl){tl.to(solid,{opacity:1,duration:0.3},0.2);return;}
var W=cv.width,H=cv.height,variant=${js(p.variant)},label=${js(p.text)},SETTLE=${settle};
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function css(name,fb){var v=getComputedStyle(root).getPropertyValue(name).trim();return v||fb;}
function rgb(c){var k=document.createElement('canvas').getContext('2d');k.fillStyle='#000';k.fillStyle=c;var h=k.fillStyle;if(h.charAt(0)==='#'){return[parseInt(h.substr(1,2),16)/255,parseInt(h.substr(3,2),16)/255,parseInt(h.substr(5,2),16)/255];}var m=h.match(/[\\d.]+/g)||[255,255,255];return[m[0]/255,m[1]/255,m[2]/255];}
var vs='attribute vec2 aS;attribute vec2 aT;attribute float aR;uniform float uT;uniform vec2 uRes;uniform float uSz;varying float vA;varying float vK;'+
'float eio(float x){x=clamp(x,0.,1.);return x<.5?4.*x*x*x:1.-pow(-2.*x+2.,3.)/2.;}'+
'void main(){float d=.15+aR*.45+(aT.x/uRes.x)*.25;float k=eio((uT-d)/.95);vec2 p=mix(aS,aT,k);'+
'p+=k*vec2(sin(uT*6.+aR*40.),cos(uT*5.+aR*30.))*.8;vK=k;vA=smoothstep(0.,.25,uT)*(1.-smoothstep(${settle.toFixed(2)},${(settle + 0.45).toFixed(2)},uT));'+
'vec2 n=p/uRes*2.-1.;gl_Position=vec4(n.x,-n.y,0.,1.);gl_PointSize=uSz*(1.+(1.-k)*.8);}';
var fs='precision mediump float;uniform vec3 uInk;uniform vec3 uAcc;varying float vA;varying float vK;'+
'void main(){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);if(r>1.)discard;float a=vA*(1.-r*r);vec3 c=mix(uAcc,uInk,vK);gl_FragColor=vec4(c*a,a);}';
function sh(t,src){var x=gl.createShader(t);gl.shaderSource(x,src);gl.compileShader(x);return x;}
var pg=gl.createProgram();gl.attachShader(pg,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pg,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pg);
if(!gl.getProgramParameter(pg,gl.LINK_STATUS)){tl.to(solid,{opacity:1,duration:0.3},0.2);return;}
var n=0,ready=false,step=Math.max(3,Math.round(Math.sqrt(W*H/9000)));
function build(){
var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
var st=getComputedStyle(solid);var px=parseFloat(st.fontSize)*(W/Math.max(1,root.clientWidth||W));
x.font=st.fontWeight+' '+px+'px '+st.fontFamily;x.textAlign='center';x.textBaseline='middle';x.fillStyle='#fff';
x.fillText(st.textTransform==='uppercase'?label.toUpperCase():label,W/2,H/2);
var d=x.getImageData(0,0,W,H).data,T=[];for(var y=0;y<H;y+=step)for(var i=0;i<W;i+=step)if(d[(y*W+i)*4+3]>128)T.push(i,y);
var r=rng(${Math.abs(p.text.split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7))}),buf=[];n=Math.min(T.length/2,9000);
for(var k=0;k<n;k++){var j=Math.floor(r()*T.length/2)*2,tx=T[j],ty=T[j+1],sx,sy;
if(variant==='rise'){sx=tx+(r()-.5)*W*.12;sy=H*(.86+r()*.14);}else{sx=r()*W;sy=r()*H;}
buf.push(sx,sy,tx,ty,r());}
var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(buf),gl.STATIC_DRAW);
[['aS',2,0],['aT',2,8],['aR',1,16]].forEach(function(a){var l=gl.getAttribLocation(pg,a[0]);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,a[1],gl.FLOAT,false,20,a[2]);});
ready=true;}
function draw(t){
if(!ready&&(!document.fonts||document.fonts.status==='loaded'||t>0))build();
gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);if(!n)return;
gl.useProgram(pg);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
gl.uniform1f(gl.getUniformLocation(pg,'uT'),t);gl.uniform2f(gl.getUniformLocation(pg,'uRes'),W,H);gl.uniform1f(gl.getUniformLocation(pg,'uSz'),step*1.15);
var ink=rgb(css('--sk-ink',css('--sk-fg','#ffffff'))),acc=rgb(css('--sk-accent','#2f6bff'));
gl.uniform3f(gl.getUniformLocation(pg,'uInk'),ink[0],ink[1],ink[2]);gl.uniform3f(gl.getUniformLocation(pg,'uAcc'),acc[0],acc[1],acc[2]);
gl.drawArrays(gl.POINTS,0,n);}
tl.to(o,{t:${life.toFixed(2)},duration:${life.toFixed(2)},ease:'none',onUpdate:function(){draw(o.t);}},0);
tl.to(solid,{opacity:1,duration:0.4,ease:'power2.out'},SETTLE);
draw(0);
})();`;

  const tl = [program.replace(/\n/g, ''), ...(p.sub ? [fadeUp(`#${id} .sub`, settle + 0.2, { y: 10 })] : [])];
  return { html: html.trim(), timeline: tl.join('\n') };
}
