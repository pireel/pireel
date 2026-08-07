/**
 * A sandboxed component preview cannot be inspected by its React parent. This tiny reporter runs
 * inside the srcDoc and sends back the painted content bounds, so receipt cards can frame the
 * component itself instead of shrinking the entire project canvas around it.
 */

export interface PreviewContentBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function injectPreviewContentBoundsReporter(html: string, blockId: string): string {
  const script = `<script data-hf-preview-content-bounds>
(function(){
  var blockId=${JSON.stringify(blockId)};
  var queued=0;
  function schedule(){
    if(queued)return;
    queued=requestAnimationFrame(function(){queued=0;measure();});
  }
  function directText(el){
    for(var i=0;i<el.childNodes.length;i++){
      var n=el.childNodes[i];
      if(n.nodeType===3&&String(n.nodeValue||'').trim())return true;
    }
    return false;
  }
  function hasPaint(el,style){
    var tag=el.tagName;
    if(tag==='IMG'||tag==='SVG'||tag==='CANVAS'||tag==='VIDEO'||tag==='PICTURE')return true;
    if(directText(el))return true;
    if(style.backgroundImage&&style.backgroundImage!=='none')return true;
    if(style.backgroundColor&&style.backgroundColor!=='transparent'&&style.backgroundColor!=='rgba(0, 0, 0, 0)')return true;
    if(style.boxShadow&&style.boxShadow!=='none')return true;
    if(style.outlineStyle&&style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>0)return true;
    if((parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderRightWidth)||0)+(parseFloat(style.borderBottomWidth)||0)+(parseFloat(style.borderLeftWidth)||0)>0)return true;
    try{
      var before=getComputedStyle(el,'::before');
      var after=getComputedStyle(el,'::after');
      if((before.content&&before.content!=='none'&&before.content!=='normal')||(after.content&&after.content!=='none'&&after.content!=='normal'))return true;
    }catch(err){}
    return false;
  }
  function measure(){
    var root=document.getElementById(blockId);
    if(!root)return;
    var rr=root.getBoundingClientRect();
    if(rr.width<1||rr.height<1)return;
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    var nodes=root.querySelectorAll('*');
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i];
      var style=getComputedStyle(el);
      if(style.display==='none'||style.visibility==='hidden'||parseFloat(style.opacity||'1')<=0.01||!hasPaint(el,style))continue;
      var r=el.getBoundingClientRect();
      if(r.width<2||r.height<2)continue;
      var x1=Math.max(0,r.left-rr.left),y1=Math.max(0,r.top-rr.top);
      var x2=Math.min(rr.width,r.right-rr.left),y2=Math.min(rr.height,r.bottom-rr.top);
      if(x2<=x1||y2<=y1)continue;
      minX=Math.min(minX,x1);minY=Math.min(minY,y1);maxX=Math.max(maxX,x2);maxY=Math.max(maxY,y2);
    }
    var rect;
    if(!isFinite(minX))rect={x:0,y:0,w:rr.width,h:rr.height};
    else{
      var pad=Math.max(8,Math.min(rr.width,rr.height)*0.025);
      var x=Math.max(0,minX-pad),y=Math.max(0,minY-pad);
      rect={x:x,y:y,w:Math.min(rr.width,maxX+pad)-x,h:Math.min(rr.height,maxY+pad)-y};
    }
    parent.postMessage({type:'hf:previewContentBounds',blockId:blockId,rect:rect},'*');
  }
  addEventListener('load',schedule);
  addEventListener('message',function(e){var d=e.data||{};if(d.type==='hf:blockAdd'||d.type==='hf:blockHtml')setTimeout(schedule,0);});
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(schedule);
  setTimeout(schedule,0);setTimeout(schedule,160);setTimeout(schedule,600);
})();
</script>`;
  return html.includes('</body>') ? html.replace('</body>', `${script}\n</body>`) : html + script;
}
