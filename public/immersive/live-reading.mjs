export function createLiveReader({panel,narrative,revealButton,getSettings}) {
  const reserve=narrative.querySelector('.reserve');
  const revealed=narrative.querySelector('.revealed');
  const accessible=narrative.querySelector('.accessible-copy');
  let tokens=[],spans=[],count=0,timer=0,paused=false,follow=true,scrollFrame=0;
  const typing=()=>count<tokens.length;
  const cancel=()=>{clearTimeout(timer);timer=0;cancelAnimationFrame(scrollFrame);scrollFrame=0;};
  function followWord(word){
    if(scrollFrame)return;
    const edge=word.getBoundingClientRect(),view=panel.getBoundingClientRect();
    if(edge.bottom<=view.bottom-Math.min(64,view.height*.15))return;
    const from=panel.scrollTop;
    const target=Math.min(panel.scrollHeight-panel.clientHeight,Math.max(0,from+edge.bottom-view.top-view.height*.65));
    if(target<=from)return;
    const began=performance.now();
    const move=now=>{
      const progress=Math.min(1,(now-began)/260);
      panel.scrollTop=from+(target-from)*(1-(1-progress)**3);
      scrollFrame=progress<1?requestAnimationFrame(move):0;
    };
    scrollFrame=requestAnimationFrame(move);
  }
  function controls(){
    revealed.classList.toggle('typing',typing());
    revealButton.textContent=typing()?'Show all':'Replay text';
    revealButton.setAttribute('aria-label',typing()?'Reveal the complete passage':'Replay this passage’s text animation');
  }
  function reveal(animated){
    const word=spans[count++];
    word.className=animated?'reading-word is-visible is-revealing':'reading-word is-visible';
    return word;
  }
  function tick(){
    timer=0;if(paused||!typing())return;
    const word=reveal(true);controls();
    const settings=getSettings();
    if(follow&&settings.readingStyle==='cinematic'){
      followWord(word);
    }
    if(typing())timer=setTimeout(tick,getSettings().speed);
  }
  function showAll(){cancel();while(typing())reveal(false);controls();}
  function clear(){cancel();tokens=[];spans=[];count=0;reserve.textContent='';accessible.textContent='';revealed.replaceChildren();panel.scrollTop=0;controls();}
  function start(text,instant=false){
    clear();follow=true;tokens=String(text).match(/\S+\s*|\s+/g)||[];
    reserve.textContent=text;accessible.textContent=text;
    // Lay out the entire passage once. Revealing opacity must not reflow the
    // paragraph or rebalance its right edge each time a word appears.
    spans=tokens.map(token=>{const word=document.createElement('span');word.className='reading-word';word.textContent=token;return word;});
    revealed.append(...spans);
    const settings=getSettings();
    if(instant||settings.readingStyle==='full'||settings.reduceMotion||settings.speed===0)showAll();
    else{controls();tick();}
  }
  function setPaused(value){paused=value;if(value)cancel();else if(typing()&&!timer)timer=setTimeout(tick,getSettings().speed);}
  function refreshSettings(){
    follow=true;
    const settings=getSettings();
    if(settings.readingStyle==='full'||settings.reduceMotion||settings.speed===0)showAll();
  }
  // Let someone scroll back without fighting automatic following. A new reply
  // resumes following; changing reading style also restores the selected mode.
  const stopFollowing=()=>{follow=false;cancelAnimationFrame(scrollFrame);scrollFrame=0;};
  panel.addEventListener('wheel',stopFollowing,{passive:true});
  panel.addEventListener('touchstart',stopFollowing,{passive:true});
  panel.addEventListener('keydown',event=>{if(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown'].includes(event.key))stopFollowing();});
  return {start,clear,showAll,setPaused,refreshSettings,get typing(){return typing();}};
}
