import { createAssetCoordinator } from './scene-assets.mjs';
import { manifest, passages } from './scene-study.mjs';
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const longer = '\n\nFor a little while, there is no rush to fill the silence. She leaves the next part of the conversation to you.';
  const defaults = {typeSize:100,speed:80,backing:80,side:'left',length:'standard',lighting:'day',reduceMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,solid:false,keepControls:false};
  let settings = {...defaults}, index = 0, timer = 0, revealCount = 0, words = [], hideTimer = 0, toastTimer = 0;

  stage.dataset.study='local-art';
  let activeBackground=stage.querySelector('.background.day');
  let activeCharacter=stage.querySelector('.character');
  stage.querySelector('.background.dusk').remove();
  const pendingImages=new Map();
  function preload(source) {
    if(!pendingImages.has(source))pendingImages.set(source,(async()=>{
      const image=new Image(); image.src=source; await image.decode();
    })().catch(error=>{pendingImages.delete(source);throw error;}));
    return pendingImages.get(source);
  }
  function replaceLayer(old, source, character, backgroundFadeMs=1200) {
    const image=document.createElement('img');
    image.src=source;image.className=character?'character':'background day';
    image.alt=character?'Rise Kujikawa, in the current prepared outfit and pose':'';
    image.style.opacity='0';
    if(!character){
      image.style.transitionDuration=backgroundFadeMs+'ms';
      old.style.transitionDuration=backgroundFadeMs+'ms';
    }
    if(character)stage.insertBefore(image,stage.querySelector('.topbar'));
    else stage.querySelector('.scenery').insertBefore(image,stage.querySelector('.vignette'));
    old.setAttribute('aria-hidden','true');
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      image.style.opacity='1';
      old.style.opacity='0';
      setTimeout(()=>old.remove(),settings.reduceMotion?50:character?1250:backgroundFadeMs+50);
    }));
    return image;
  }
  const art=createAssetCoordinator({manifest,load:preload,commit:(target,changed)=>{
    if(changed.background)activeBackground=replaceLayer(activeBackground,target.background,false);
    if(changed.character)activeCharacter=replaceLayer(activeCharacter,target.character,true);
    stage.dataset.background=target.backgroundKey;
    stage.dataset.character=target.characterKey;
  }});

  const history = [];
  const visited = new Set();
  const dialogs = [$('settings-dialog'),$('history-dialog'),$('exit-dialog')];
  const currentText = () => passages[index].text + (settings.length === 'long' ? longer : '');
  function toast(message) { $('toast').textContent=message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600); }
  function updateReveal() {
    $('narrative').querySelector('.revealed').textContent=words.slice(0,revealCount).join('');
    const typing = revealCount < words.length;
    $('narrative').querySelector('.revealed').classList.toggle('typing',typing);
    $('reveal').textContent=typing?'Show all':'Replay text';
    $('reveal').setAttribute('aria-label',typing?'Reveal the complete passage':'Replay this passage’s text animation');
  }
  function tick() { if(revealCount>=words.length)return; revealCount++; updateReveal(); if(revealCount<words.length)timer=setTimeout(tick,settings.speed); }
  function showAll() { clearTimeout(timer); revealCount=words.length; updateReveal(); }
  function startReveal(instant=false) {
    clearTimeout(timer); const text=currentText(); words=text.match(/\S+\s*|\s+/g)||[];
    $('narrative').querySelector('.reserve').textContent=text;
    $('narrative').querySelector('.accessible-copy').textContent=text;
    revealCount=instant||settings.reduceMotion||settings.speed===0?words.length:0;
    updateReveal(); if(revealCount<words.length)tick();
  }
  function setLighting(value) {
    settings.lighting=value; stage.classList.toggle('is-dusk',value==='dusk');
    $('lighting').value=value; $('lighting-label').textContent=value==='dusk'?'Dusk lighting study':'Afternoon light';
  }
  function renderPassage(instant=false) {
    $('scene-label').textContent=passages[index].scene;
    $('page-indicator').textContent=`${String(index+1).padStart(2,'0')} / ${String(passages.length).padStart(2,'0')}`;
    $('next').firstChild.textContent=index===passages.length-1?'Back to the beginning ':'Continue ';
    setLighting(passages[index].light); $('copy-scroll').scrollTop=0;
    art.transition(passages[index].visual).catch(()=>toast('The next illustration could not load. The previous artwork is still visible.'));
    const key=`${index}-${settings.length}`;
    if(!visited.has(key)) {history.push({speaker:'Rise',text:currentText()}); visited.add(key);}
    startReveal(instant); wakeControls();
  }
  function advance() { index=(index+1)%passages.length; renderPassage(); }
  function wakeControls() {
    stage.classList.remove('controls-hidden'); clearTimeout(hideTimer);
    if(!settings.keepControls&&!matchMedia('(hover:none)').matches&&!dialogs.some(d=>d.open)) hideTimer=setTimeout(()=>{
      if(!stage.querySelector('.controls:focus-within'))stage.classList.add('controls-hidden');
    },4200);
  }
  function applySettings() {
    stage.style.setProperty('--type-scale',settings.typeSize/100);
    stage.style.setProperty('--panel-opacity',settings.backing/100);
    stage.dataset.side=settings.side; stage.classList.toggle('reduced-motion',settings.reduceMotion);
    stage.classList.toggle('solid-panel',settings.solid);
    $('type-size').value=settings.typeSize; $('type-value').textContent=`${settings.typeSize}%`;
    $('backing').value=settings.backing; $('backing-value').textContent=`${settings.backing}%`;
    $('speed').value=settings.speed; $('speed-value').textContent=$('speed').selectedOptions[0].textContent;
    $('side').value=settings.side; $('length').value=settings.length;
    $('reduce-motion').checked=settings.reduceMotion; $('solid').checked=settings.solid; $('keep-controls').checked=settings.keepControls;
    wakeControls();
  }
  $('next').addEventListener('click',advance);
  $('copy-scroll').addEventListener('click',()=>{if(revealCount<words.length)showAll();});
  $('reveal').addEventListener('click',()=>revealCount<words.length?showAll():startReveal());
  $('settings-open').addEventListener('click',()=>{wakeControls();$('settings-dialog').showModal();});
  $('history-open').addEventListener('click',()=>{
    $('history-list').replaceChildren(...history.map(item=>{const section=document.createElement('section');section.className='history-item';const h=document.createElement('h3');h.textContent=item.speaker;const p=document.createElement('p');p.textContent=item.text;section.append(h,p);return section;}));
    $('history-dialog').showModal(); wakeControls();
  });
  // The embedded viewer shares the app's fullscreen root. Requesting
  // fullscreen on the iframe itself would introduce a second display state.
  let fullscreenDocument=document;
  try { if(parent!==window&&parent.location.origin===location.origin)fullscreenDocument=parent.document; } catch {}
  const fullscreenButton=$('fullscreen');
  const syncFullscreen=()=>{
    const active=Boolean(fullscreenDocument.fullscreenElement);
    const label=active?'Exit full screen':'Enter full screen';
    fullscreenButton.classList.toggle('is-fullscreen',active);
    fullscreenButton.setAttribute('aria-pressed',String(active));
    fullscreenButton.setAttribute('aria-label',label);
    fullscreenButton.title=label;
    fullscreenButton.disabled=!active&&!fullscreenDocument.fullscreenEnabled;
  };
  fullscreenButton.addEventListener('click',async()=>{
    try {
      if(fullscreenDocument.fullscreenElement)await fullscreenDocument.exitFullscreen();
      else await (fullscreenDocument===document?stage:fullscreenDocument.documentElement).requestFullscreen();
    } catch {toast('Full screen is unavailable here. Try this page in your desktop browser.');}
    finally {syncFullscreen();}
  });
  fullscreenDocument.addEventListener('fullscreenchange',syncFullscreen);
  window.addEventListener('pagehide',()=>fullscreenDocument.removeEventListener('fullscreenchange',syncFullscreen),{once:true});
  syncFullscreen();
  $('exit').addEventListener('click',async()=>{if(document.fullscreenElement)await document.exitFullscreen();$('exit-dialog').showModal();});
  $('resume').addEventListener('click',()=>$('exit-dialog').close());
  $('composer').addEventListener('submit',event=>{
    event.preventDefault();const text=$('message').value.trim();if(!text)return;
    history.push({speaker:'You · preview only',text}); $('message').value=''; advance();
    toast('Your line was added to preview history. This next passage is scripted.');
  });
  $('type-size').addEventListener('input',event=>{settings.typeSize=Number(event.target.value);applySettings();});
  $('backing').addEventListener('input',event=>{settings.backing=Number(event.target.value);applySettings();});
  $('speed').addEventListener('change',event=>{settings.speed=Number(event.target.value);applySettings();if(settings.speed===0)showAll();});
  $('side').addEventListener('change',event=>{settings.side=event.target.value;applySettings();});
  $('length').addEventListener('change',event=>{settings.length=event.target.value;renderPassage(true);});
  $('lighting').addEventListener('change',event=>setLighting(event.target.value));
  $('reduce-motion').addEventListener('change',event=>{settings.reduceMotion=event.target.checked;applySettings();if(settings.reduceMotion)showAll();});
  $('solid').addEventListener('change',event=>{settings.solid=event.target.checked;applySettings();});
  $('keep-controls').addEventListener('change',event=>{settings.keepControls=event.target.checked;applySettings();});
  $('reset-settings').addEventListener('click',()=>{settings={...defaults};applySettings();renderPassage(true);});
  function artworkView(on) {stage.querySelectorAll('.reading-region,.controls').forEach(element=>{element.inert=on;});stage.classList.toggle('art-only',on);$('art-toggle').setAttribute('aria-pressed',String(on));$('art-notice').hidden=!on;if(on)$('art-return').focus();else $('art-toggle').focus();}
  $('art-toggle').addEventListener('click',()=>artworkView(true));$('art-return').addEventListener('click',()=>artworkView(false));
  stage.addEventListener('pointermove',wakeControls);stage.addEventListener('focusin',wakeControls);stage.addEventListener('pointerdown',wakeControls);
  document.addEventListener('keydown',event=>{
    if(dialogs.some(d=>d.open))return;
    if(event.key==='Escape'&&stage.classList.contains('art-only')){artworkView(false);return;}
    if(event.target.closest('input,select,textarea,button,a')||(event.target.closest('[tabindex]')&&!['ArrowLeft','ArrowRight'].includes(event.key)))return;
    if(event.key===' '||event.key==='Enter'){event.preventDefault();revealCount<words.length?showAll():advance();}
    if(event.key==='ArrowRight'){event.preventDefault();advance();}
    if(event.key==='ArrowLeft'){event.preventDefault();index=(index+passages.length-1)%passages.length;renderPassage(true);}
    wakeControls();
  });
  dialogs.forEach(dialog=>dialog.addEventListener('close',wakeControls));
  applySettings();renderPassage();
})();


