// Display the complete canvas at viewport height; fixed left placement.
export function characterPlacement(stage,image) {
  const size=stage.height;
  return {left:0,top:0,width:size*(image?.width&&image?.height?image.width/image.height:1),height:size};
}
export function characterFade(width,stageWidth,textEdge=width) {
  const end=Math.max(0,Math.min(width,textEdge));
  const fade=Math.min(stageWidth*.14,width*.28)*(2/3);
  return `linear-gradient(to right, black ${Math.max(0,end-fade)}px, transparent ${end}px)`;
}
function inspectSilhouette(image) {
  const size=256;
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=size;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)return null;
  context.drawImage(image,0,0,size,size);
  const pixels=context.getImageData(0,0,size,size).data;
  const rightByRow=new Uint16Array(size);
  let edgeRun=0, longestEdgeRun=0, clearPixels=0;
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const alpha=pixels[(y*size+x)*4+3];
      if(alpha<32)clearPixels++;
      if(alpha>=96)rightByRow[y]=x+1;
    }
    const edgeAlpha=pixels[(y*size+size-1)*4+3];
    edgeRun=edgeAlpha>=160?edgeRun+1:0;
    longestEdgeRun=Math.max(longestEdgeRun,edgeRun);
  }
  return {rightByRow,cutEdge:longestEdgeRun>=16,hasTransparency:clearPixels>=size*size*.02};
}
export function installCharacterLayout(stage) {
  let frame=0;
  const silhouettes=new WeakMap();
  const reading=stage.querySelector('.reading-region');
  const layout=()=>{
    const stageRect=stage.getBoundingClientRect();
    const textRect=stage.querySelector('#copy-scroll')?.getBoundingClientRect();
    const previousClearance=parseFloat(reading?.style.marginLeft)||0;
    const baseTextLeft=textRect?textRect.left-stageRect.left-previousClearance:0;
    const mode=stage.dataset.characterFade||'auto';
    let clearance=0;
    for(const image of stage.querySelectorAll('.character')){
      let silhouette=silhouettes.get(image);
      if(mode==='auto'&&image.naturalWidth&&!silhouettes.has(image)){
        try{silhouette=inspectSilhouette(image);}catch{silhouette=null;}
        silhouettes.set(image,silhouette);
      }
      const clipped=silhouette?.hasTransparency&&silhouette.cutEdge;
      const autoMask=clipped?'linear-gradient(to right, black 94%, transparent 100%)':'none';
      if(stage.clientWidth<=800){
        for(const property of ['left','right','top','bottom','width','height','object-fit','object-position'])image.style.removeProperty(property);
        image.style.setProperty('--character-mask',mode==='always'?'linear-gradient(to right, black 81.333333%, transparent 100%)':mode==='auto'?autoMask:'none');
        continue;
      }
      const placement=characterPlacement({width:stage.clientWidth,height:stage.clientHeight},{width:image.naturalWidth,height:image.naturalHeight});
      for(const property of ['left','top','width','height'])image.style[property]=placement[property]+'px';
      image.style.right='auto';image.style.bottom='auto';image.style.objectFit='contain';image.style.objectPosition='left top';
      const gap=stage.clientWidth*.012;
      image.style.setProperty('--character-mask',mode==='always'
        ?characterFade(placement.width,stage.clientWidth,textRect?baseTextLeft-gap:placement.width)
        :mode==='auto'?autoMask:'none');
      if(mode==='auto'&&silhouette?.hasTransparency&&textRect&&!image.hidden&&image.getAttribute('aria-hidden')!=='true'){
        const rows=silhouette.rightByRow;
        const first=Math.max(0,Math.floor((textRect.top-stageRect.top)/placement.height*rows.length));
        const last=Math.min(rows.length,Math.ceil((textRect.bottom-stageRect.top)/placement.height*rows.length));
        const right=Math.max(0,...rows.slice(first,last))/rows.length*placement.width;
        const maxShift=Math.max(0,stage.clientWidth*.65-baseTextLeft);
        clearance=Math.min(maxShift,Math.max(clearance,right+gap-baseTextLeft));
      }
    }
    if(reading)reading.style.marginLeft=clearance?clearance+'px':'';
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(layout);};
  const resize=new ResizeObserver(schedule);resize.observe(stage);
  const changes=new MutationObserver(schedule);changes.observe(stage,{childList:true,attributes:true,attributeFilter:['data-side','data-character-fade']});
  stage.addEventListener('load',schedule,true);
  schedule();
  return ()=>{cancelAnimationFrame(frame);resize.disconnect();changes.disconnect();stage.removeEventListener('load',schedule,true);};
}
