const appOrigin=location.origin;
import { createLiveReader } from './live-reading.mjs';
import { installCharacterLayout } from './character-layout.mjs';
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const passages=[{text:'Choose a conversation to begin.',scene:'',light:'day'}];
  const stage = $('stage');
  const longer = '\n\nFor a little while, there is no rush to fill the silence. She leaves the next part of the conversation to you.';
  const defaults = {typeSize:100,speed:130,backing:80,side:'left',length:'standard',lighting:'day',reduceMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,solid:false,keepControls:false,readingStyle:'cinematic'};
  let settings = {...defaults}, index = 0, timer = 0, revealCount = 0, words = [], hideTimer = 0, toastTimer = 0;

  stage.dataset.study='local-art';
  installCharacterLayout(stage);
  let activeBackground=stage.querySelector('.background.day');
  let activeCharacter=stage.querySelector('.character');
  stage.querySelector('.background.dusk').remove();
  const pendingImages=new Map();
  function preload(source) {
    if(!pendingImages.has(source))pendingImages.set(source,(async()=>{
      const image=new Image();
      const timeout=setTimeout(()=>image.removeAttribute('src'),15000);
      image.src=source;
      try{await image.decode();}
      catch{throw new Error('Artwork could not load. Retrying.');}
      finally{clearTimeout(timeout);}
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

  const history = [];
  const visited = new Set();
  const dialogs = [$('settings-dialog'),$('history-dialog'),$('exit-dialog'),$('live-source-dialog'),$('live-dossier-dialog')];
  const currentText = () => passages[0].text;
  function toast(message) { $('toast').textContent=message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600); }
  const reader=createLiveReader({panel:$('copy-scroll'),narrative:$('narrative'),revealButton:$('reveal'),getSettings:()=>settings});
  function showAll(){reader.showAll();}
  function startReveal(instant=false){reader.start(currentText(),instant);}
  function setLighting(value) {
    settings.lighting=value; stage.classList.toggle('is-dusk',value==='dusk');
    $('lighting').value=value; $('lighting-label').textContent=value==='dusk'?'Dusk lighting study':'Afternoon light';
  }
  function renderPassage(instant=false) {
    if(stage.classList.contains('scene-loading')){reader.clear();return;}
    $('scene-label').textContent=passages[index].scene;
    $('page-indicator').textContent=`${String(index+1).padStart(2,'0')} / ${String(passages.length).padStart(2,'0')}`;
    $('next').firstChild.textContent=index===passages.length-1?'Back to the beginning ':'Continue ';
    setLighting(passages[index].light); $('copy-scroll').scrollTop=0;
    const key=`${index}-${settings.length}`;
    if(!visited.has(key)) visited.add(key);
    startReveal(instant); wakeControls();
  }
  function advance() {}
  function wakeControls() {
    stage.classList.remove('controls-hidden'); clearTimeout(hideTimer);
    if(!settings.keepControls&&!matchMedia('(hover:none)').matches&&!dialogs.some(d=>d.open)) hideTimer=setTimeout(()=>{
      if(!stage.querySelector('.controls:focus-within'))stage.classList.add('controls-hidden');
    },4200);
  }
  function applySettings() {
    stage.style.setProperty('--type-scale',settings.typeSize/100);
    stage.style.setProperty('--panel-opacity',settings.backing/100);
    settings.side='left'; stage.dataset.side='left'; stage.classList.toggle('reduced-motion',settings.reduceMotion);
    stage.classList.toggle('solid-panel',settings.solid);
    $('type-size').value=settings.typeSize; $('type-value').textContent=`${settings.typeSize}%`;
    $('backing').value=settings.backing; $('backing-value').textContent=`${settings.backing}%`;
    $('speed').value=settings.speed; $('speed-value').textContent=$('speed').selectedOptions[0].textContent;
    $('length').value=settings.length;
    $('reduce-motion').checked=settings.reduceMotion; $('solid').checked=settings.solid; $('keep-controls').checked=settings.keepControls;
    $('reading-style').value=settings.readingStyle;
    $('speed').disabled=settings.readingStyle==='full';
    reader.refreshSettings();
    wakeControls();
  }
  $('next').addEventListener('click',advance);
  $('copy-scroll').addEventListener('click',()=>{if(reader.typing)showAll();});
  $('reveal').addEventListener('click',()=>reader.typing?showAll():startReveal());
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
  $('exit').addEventListener('click',()=>closeImmersive());
  $('resume').addEventListener('click',()=>$('exit-dialog').close());
  $('length').addEventListener('change',event=>{settings.length=event.target.value;renderPassage(true);});
  $('lighting').addEventListener('change',event=>setLighting(event.target.value));
  function artworkView(on) {stage.querySelectorAll('.reading-region,.controls').forEach(element=>{element.inert=on;});stage.classList.toggle('art-only',on);$('art-toggle').setAttribute('aria-pressed',String(on));$('art-notice').hidden=!on;if(on)$('art-return').focus();else (matchMedia('(max-width:800px)').matches?$('live-phone-art'):$('art-toggle')).focus();wakeControls();}
  $('art-toggle').addEventListener('click',()=>artworkView(true));$('art-return').addEventListener('click',()=>artworkView(false));
  stage.addEventListener('pointermove',wakeControls);stage.addEventListener('focusin',wakeControls);stage.addEventListener('pointerdown',wakeControls);
  document.addEventListener('keydown',event=>{
    if(dialogs.some(d=>d.open))return;
    if(event.key==='Escape'&&stage.classList.contains('art-only')){artworkView(false);return;}
    if(event.target.closest('input,select,textarea,button,a')||(event.target.closest('[tabindex]')&&!['ArrowLeft','ArrowRight'].includes(event.key)))return;
    if(event.key===' '||event.key==='Enter'){event.preventDefault();reader.typing?showAll():advance();}
    wakeControls();
  });

  const pauseReading=()=>reader.setPaused(document.hidden||stage.classList.contains('art-only')||dialogs.some(dialog=>dialog.open));
  document.addEventListener('visibilitychange',pauseReading);
  new MutationObserver(pauseReading).observe(stage,{attributes:true,attributeFilter:['class']});
  dialogs.forEach(dialog=>{
    let downOutside=false;
    const outside=event=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
    dialog.addEventListener('pointerdown',event=>{downOutside=event.target===dialog&&outside(event);});
    dialog.addEventListener('click',event=>{if(downOutside&&event.target===dialog&&outside(event))dialog.close();downOutside=false;});
    dialog.addEventListener('close',()=>{pauseReading();wakeControls();});
    new MutationObserver(pauseReading).observe(dialog,{attributes:true,attributeFilter:['open']});
  });

  applySettings();reader.clear();
  let selected='',instance='',messageId='',artKey='',pollTimer=0,polling=false,viewRevision=0,retry=false,sceneReady=false,pendingText='',manualArt=false;
  let sending=false,submitted=null,displayedMessageId='';
  let openingStoryTimer=0;
  function clearOpeningStoryTimer(){
    clearTimeout(openingStoryTimer);
    openingStoryTimer=0;
  }
  const chatHistory=history;
  function setRerollDisabled(disabled,backgroundOnly=stage.dataset.liveMode==='background-only'){
    $('live-reroll').disabled=disabled||backgroundOnly;
    $('live-phone-tools').querySelector('[data-live-tool="live-reroll"]').disabled=disabled||backgroundOnly;
    $('live-reroll-background').disabled=disabled;
  }
  const settingsKey='animessenger:immersive-reading-settings';
  const settingsDialog=$('settings-dialog');
  Object.assign(defaults,{characterFade:'auto',autoArt:true,highResBackground:true});
  settings={...defaults};
  try{
    const saved=localStorage.getItem(settingsKey);
    if(saved)Object.assign(settings,JSON.parse(saved));
    else settings.highResBackground=localStorage.getItem('animessenger:immersive-high-res-background')!=='off';
  }catch{}
  stage.dataset.characterFade=settings.characterFade;
  applySettings();

  const readingFields={
    typeSize:'type-size',backing:'backing',speed:'speed',readingStyle:'reading-style',
    reduceMotion:'reduce-motion',solid:'solid',keepControls:'keep-controls',
    autoArt:'live-auto-art',highResBackground:'live-high-res',characterFade:'character-fade'
  };
  function updateReadingLabels(){
    $('type-value').textContent=$('type-size').value+'%';
    $('backing-value').textContent=$('backing').value+'%';
    $('speed-value').textContent=$('speed').selectedOptions[0].textContent;
    $('speed').disabled=$('reading-style').value==='full';
  }
  function fillReadingSettings(values){
    for(const [key,id] of Object.entries(readingFields)){
      const field=$(id);
      if(field.type==='checkbox')field.checked=values[key];
      else field.value=values[key];
    }
    updateReadingLabels();
  }
  function previewReadingAppearance(values){
    stage.style.setProperty('--type-scale',values.typeSize/100);
    stage.style.setProperty('--panel-opacity',values.backing/100);
    stage.classList.toggle('solid-panel',values.solid);
    stage.dataset.characterFade=values.characterFade;
  }
  settingsDialog.addEventListener('input',()=>{
    updateReadingLabels();
    previewReadingAppearance({
      typeSize:Number($('type-size').value),
      backing:Number($('backing').value),
      solid:$('solid').checked,
      characterFade:$('character-fade').value
    });
  });
  settingsDialog.addEventListener('close',()=>previewReadingAppearance(settings));
  $('settings-open').addEventListener('click',()=>{
    fillReadingSettings(settings);
    settingsDialog.showModal();
    wakeControls();
  });
  $('cancel-settings').addEventListener('click',()=>settingsDialog.close());
  $('reset-settings').addEventListener('click',()=>{
    fillReadingSettings(defaults);
    previewReadingAppearance(defaults);
  });
  $('reading-settings-form').addEventListener('submit',event=>{
    if(event.submitter?.id!=='save-settings')return;
    event.preventDefault();
    const previous=settings;
    settings={...settings};
    for(const [key,id] of Object.entries(readingFields)){
      const field=$(id);
      if(field.type==='checkbox')settings[key]=field.checked;
      else if(typeof defaults[key]==='number')settings[key]=Number(field.value);
      else settings[key]=field.value;
    }
    try{localStorage.setItem(settingsKey,JSON.stringify(settings));}catch{}
    stage.dataset.characterFade=settings.characterFade;
    applySettings();
    settingsDialog.close();
    if(settings.autoArt!==previous.autoArt||settings.highResBackground!==previous.highResBackground){
      viewRevision++;
      clearTimeout(pollTimer);
      if(!settings.autoArt)status('Artwork updates paused.');
      void poll();
    }
  });
  const status=(message,busy=false)=>{message=String(message||'').replace(/…|\.{3,}/g,'').trim();if(message==='Updating artwork')message='Generating artwork';if(message==='Preparing the current scene')message='Preparing artwork';if($('live-status').textContent!==message)$('live-status').textContent=message;$('live-progress').hidden=!message;$('live-progress').dataset.busy=String(busy);$('live-progress-title').textContent=busy?'Setting the scene':'Scene not ready';};
  const holdStory=()=>{clearOpeningStoryTimer();sceneReady=false;reader.clear();stage.classList.remove('opening-reading-band');stage.classList.add('scene-loading');stage.querySelector('.reading-region').setAttribute('aria-busy','true');stage.querySelector('.reading-region').setAttribute('aria-hidden','true');};
  function showStory(){
    clearOpeningStoryTimer();
    stage.classList.remove('scene-loading','opening-reading-band');
    const reading=stage.querySelector('.reading-region');
    reading.removeAttribute('aria-hidden');
    reading.setAttribute('aria-busy','false');
    if(!sending&&displayedMessageId!==messageId){
      passages[0].text=pendingText;
      renderPassage();
      displayedMessageId=messageId;
    }
  }
  function showArtUnavailable(message){
    stage.classList.add('art-unavailable');
    if(messageId)showStory();
    status(message);
  }
  async function waitForOpeningFade(duration){
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(!settings.reduceMotion&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      await new Promise(resolve=>setTimeout(resolve,duration));
    }
  }
  const clearArt=()=>{viewRevision++;artKey='';stage.classList.remove('art-unavailable');stage.querySelectorAll('.background,.character').forEach(image=>{image.hidden=true;});$('art-toggle').disabled=true;$('live-phone-art').disabled=true;delete stage.dataset.liveArt;delete stage.dataset.liveMode;delete stage.dataset.liveVignette;};
  const stop=message=>{messageInput.value='';submitted=null;displayedMessageId='';$('live-writing').hidden=true;$('live-notifications').removeAttribute('src');$('live-notifications').classList.remove('has-notice');selected='';instance='';messageId='';pendingText='';retry=false;manualArt=false;$('live-dossier-open').disabled=true;$('live-reroll').disabled=true;$('live-retry').hidden=true;clearTimeout(pollTimer);clearArt();holdStory();stage.querySelector('h1').textContent='Choose a conversation';$('live-location').textContent='';$('live-avatar').hidden=true;$('live-avatar').removeAttribute('src');$('live-initial').textContent='?';$('live-tier').textContent='';$('live-percent').textContent='';stage.querySelector('.bond-track').setAttribute('aria-valuenow','0');stage.querySelector('.bond-track i').style.width='0%';chatHistory.splice(0);status(message,true);};
  async function getJson(url,options){const response=await fetch(url,{...options,cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not update the viewer.');return result;}
  async function choose(){
    $('live-picker-error').textContent='';$('live-source-dialog').showModal();wakeControls();
    try{const data=await getJson('/immersive/live/threads');const select=$('live-source');select.replaceChildren(new Option('Choose a conversation',''),...data.threads.map(t=>new Option(t.name+(t.mode==='story'?' · Story':''),t.id)));if(selected)select.value=selected;$('live-start').disabled=!select.value;}
    catch(error){$('live-picker-error').textContent=error.message;}
  }
  $('live-source').addEventListener('change',()=>{$('live-start').disabled=!$('live-source').value;});
  $('live-source-open').addEventListener('click',()=>void choose());
  $('live-start').addEventListener('click',()=>{const id=$('live-source').value;if(!id)return;stop('Loading conversation');selected=id;$('live-source-dialog').close();void poll();});
  $('live-retry').addEventListener('click',()=>{retry=true;manualArt=true;$('live-retry').hidden=true;clearTimeout(pollTimer);void poll();});
  const dossier=$('live-dossier-dialog'),dossierFrame=$('live-dossier-frame');
  let dossierTimer;
  function setDossierLoading(failed=false){
    clearTimeout(dossierTimer);
    delete dossier.dataset.ready;
    dossier.dataset.failed=String(failed);
    $('live-dossier-status').textContent=failed?'Could not open the dossier.':'Opening dossier';
    $('live-dossier-retry').hidden=!failed;
    $('live-dossier-close').hidden=false;
    if(!failed&&dossier.open)dossierTimer=setTimeout(()=>setDossierLoading(true),10000);
  }
  function prepareDossier(){
    if(!selected||!instance)return;
    const url=appOrigin+'/?dossier='+encodeURIComponent(selected)+'&instance='+encodeURIComponent(instance);
    if(dossierFrame.getAttribute('src')!==url){setDossierLoading();dossierFrame.src=url;}
  }
  $('live-dossier-open').addEventListener('click',()=>{
    if(!selected||!instance)return;
    prepareDossier();
    dossierFrame.contentWindow?.postMessage({type:'animessenger:dossier-open',id:selected,instance},appOrigin);
    $('live-dossier-close').hidden=dossier.dataset.ready==='true';dossier.showModal();
    if(dossier.dataset.ready!=='true'&&dossier.dataset.failed!=='true')setDossierLoading();
    wakeControls();
  });
  $('live-dossier-close').addEventListener('click',()=>dossier.close());
  $('live-dossier-retry').addEventListener('click',()=>{
    setDossierLoading();
    dossierFrame.src=dossierFrame.src;
    $('live-dossier-close').focus();
  });
  window.addEventListener('message',event=>{
    if(event.origin!==appOrigin||event.source!==dossierFrame.contentWindow
      ||event.data?.id!==selected||event.data?.instance!==instance)return;
    if(event.data.type==='animessenger:dossier-ready'){clearTimeout(dossierTimer);dossier.dataset.ready='true';$('live-dossier-close').hidden=true;}
    if(event.data.type==='animessenger:dossier-error')setDossierLoading(true);
    if(event.data.type==='animessenger:dossier-closed'&&dossier.open)dossier.close();
  });
  dossier.addEventListener('close',()=>{clearTimeout(dossierTimer);dossierFrame.contentWindow?.postMessage({type:'animessenger:dossier-open',id:selected,instance},appOrigin);clearTimeout(pollTimer);void poll();});
  function rerollLayer(layer){
    const button=$(layer==='background'?'live-reroll-background':'live-reroll');
    if(!selected||!instance||button.disabled)return;
    retry=layer;
    manualArt=true;
    setRerollDisabled(true);
    status(layer==='background'?'Generating background':'Generating character artwork',true);
    clearTimeout(pollTimer);
    void poll();
  }
  $('live-reroll').addEventListener('click',()=>rerollLayer('foreground'));
  $('live-reroll-background').addEventListener('click',()=>{
    settingsDialog.close();
    rerollLayer('background');
  });
  const composer=$('live-composer'),messageInput=$('live-message'),sendButton=$('live-send');
  const phoneTools=$('live-phone-tools');
  const phoneViews=[...stage.querySelectorAll('[data-live-view]')];
  let switchingView=false;
  $('live-phone-art').addEventListener('click',()=>artworkView(true));
  phoneViews.forEach(button=>button.addEventListener('click',()=>closeImmersive(button.dataset.liveView)));
  phoneTools.querySelectorAll('[data-live-tool]').forEach(button=>button.addEventListener('click',()=>{
    phoneTools.open=false;
    $(button.dataset.liveTool).click();
  }));
  document.addEventListener('pointerdown',event=>{if(!phoneTools.contains(event.target))phoneTools.open=false;});
  phoneTools.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&phoneTools.open){phoneTools.open=false;phoneTools.querySelector('summary').focus();}
  });
  function closeImmersive(view='story'){
    if(sending||switchingView)return;
    if(view==='chat'){
      switchingView=true;
      composerState();
    }
    parent.postMessage({type:'animessenger:immersive-close',draft:messageInput.value,view},location.origin);
  }
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin)return;
    if(event.data?.type==='animessenger:immersive-switch-error'){
      switchingView=false;
      composerState();
      status('Could not switch to Chat. Try again.');
      phoneViews[0].focus();
      return;
    }
    if(event.data?.type!=='animessenger:immersive-draft'||typeof event.data.draft!=='string')return;
    messageInput.value=event.data.draft;
    messageInput.dispatchEvent(new Event('input'));
  });
  function composerState(){
    const busy=sending||switchingView;
    messageInput.disabled=!selected||!instance||busy;
    sendButton.disabled=messageInput.disabled||!messageInput.value.trim();
    $('live-source-open').disabled=busy;
    $('exit').disabled=busy;
    phoneViews.forEach(button=>{button.disabled=busy;});
  }
  const grow=()=>{
    const mobile=matchMedia('(max-width:800px)').matches;
    if(mobile&&!messageInput.value){messageInput.style.height='';return;}
    messageInput.style.height=mobile?'0px':'auto';
    messageInput.style.height=Math.min(mobile?120:160,messageInput.scrollHeight+(mobile?2:0))+'px';
  };
  messageInput.addEventListener('input',()=>{grow();composerState();});
  $('live-action').addEventListener('click',()=>{const start=messageInput.selectionStart,end=messageInput.selectionEnd,space=start>0&&!/\s$/.test(messageInput.value.slice(0,start))?' ':'';messageInput.setRangeText(space+'[action: ]',start,end,'end');const caret=start+space.length+9;messageInput.setSelectionRange(caret,caret);messageInput.focus();grow();composerState();});
  messageInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();composer.requestSubmit();}});
  composer.addEventListener('submit',async event=>{
    event.preventDefault();const text=messageInput.value.trim();if(!text||sending||switchingView||!selected||!instance)return;
    if(!submitted||submitted.text!==text||submitted.id!==selected||submitted.instance!==instance){
      const clientMessageId=crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
      submitted={id:selected,instance,text,clientMessageId};
    }
    // Artwork polling can finish while the reply is still being generated.
    // Mark the current passage as handled before clearing the reading pane.
    sending=true;messageInput.value='';grow();displayedMessageId=messageId;reader.clear();$('live-writing').hidden=false;composerState();status('');wakeControls();
    try{await getJson('/immersive/live/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(submitted)});messageInput.value='';submitted=null;}
    catch(error){
      messageInput.value=text;
      $('live-writing').hidden=true;
      if(messageId&&displayedMessageId===messageId){
        if(stage.classList.contains('scene-loading'))displayedMessageId='';
        else{
          passages[0].text=pendingText;
          renderPassage(true);
        }
      }
      status(error.message);
    }
    finally{sending=false;composerState();clearTimeout(pollTimer);void poll();}
  });
  let entryReady=false;
  function signalEntryReady(){
    if(entryReady)return;
    entryReady=true;
    if(parent!==window)parent.postMessage({type:'animessenger:immersive-ready'},location.origin);
  }
  async function poll(){
    if(!selected||polling||document.hidden||dossier.open)return;
    polling=true;const chosen=selected;
    try{
      const {thread}=await getJson('/immersive/live/thread?id='+encodeURIComponent(chosen),{signal:AbortSignal.timeout(15000)});
      if(chosen!==selected)return;
      if(instance&&thread.instance!==instance){stop('This conversation was replaced. Choose it again to continue.');void choose();signalEntryReady();return;}
      instance=thread.instance;composerState();
      prepareDossier();
      const noticeUrl=appOrigin+'/?notifications='+encodeURIComponent(selected)+'&instance='+encodeURIComponent(instance);if($('live-notifications').getAttribute('src')!==noticeUrl)$('live-notifications').src=noticeUrl;
      $('live-dossier-open').disabled=false;
      $('live-dossier-open').setAttribute('aria-label','Open '+thread.name+' dossier');
      stage.querySelector('h1').textContent=thread.name;
      messageInput.placeholder='Message '+thread.name+'…';
      $('live-location').textContent=thread.location||'';
      $('live-initial').textContent=thread.name.slice(0,1);
      const avatar=$('live-avatar');
      if(thread.avatar){if(avatar.getAttribute('src')!==thread.avatar){avatar.hidden=true;avatar.src=thread.avatar;}}
      else{avatar.hidden=true;avatar.removeAttribute('src');}
      $('live-tier').textContent=String(thread.tier||'').toUpperCase();
      $('live-percent').textContent=thread.relationship+'%';
      stage.querySelector('.live-bond').style.setProperty('--bond-color',thread.relationshipColor);
      stage.querySelector('.bond-track').setAttribute('aria-valuenow',String(thread.relationship));
      stage.querySelector('.bond-track i').style.width=thread.relationship+'%';
      chatHistory.splice(0,chatHistory.length,...thread.history);
      const nextMessage=JSON.stringify([thread.latest?.id,thread.latest?.text]);
      if(nextMessage!==messageId){messageId=nextMessage;pendingText=thread.latest?.text||'Your next character reply will appear here.';}
      signalEntryReady();
      if(!openingStoryTimer&&stage.classList.contains('scene-loading'))openingStoryTimer=setTimeout(showStory,8000);
      if(thread.waitingForReply||sending){
        $('live-writing').hidden=false;
        if($('live-status').textContent==='Loading conversation')status('Waiting for the character’s reply',true);
        return;
      }
      $('live-writing').hidden=true;
      if(!stage.classList.contains('scene-loading')&&displayedMessageId!==messageId)showStory();
      if(!settings.autoArt&&!manualArt){showArtUnavailable('Artwork updates paused.');setRerollDisabled(false);return;}
      const visibleBackground=sceneReady?activeBackground.getAttribute('src'):null;
      const highResBackground=settings.highResBackground;
      const requestedRetry=retry;
      retry=false;
      let response;
      try{
        if(['Loading conversation','Waiting for the character’s reply'].includes($('live-status').textContent))status('Preparing artwork',true);
        response=await getJson('/immersive/live/render',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json'},body:JSON.stringify({id:chosen,instance,retry:requestedRetry,visibleBackground,highResBackground})});
      }catch(error){
        retry=retry||requestedRetry;
        throw error;
      }
      if(chosen!==selected||highResBackground!==settings.highResBackground||(!settings.autoArt&&!manualArt)||dossier.open)return;
      if(response.instance!==instance||response.status==='replaced'){stop('This conversation was replaced. Choose it again to continue.');return;}
      if(response.sourceRevision!==thread.revision)return;
      if(retry)return;
      setRerollDisabled(response.status==='pending'||response.status==='waiting',response.mode==='background-only');
      if(response.status==='waiting'){manualArt=false;$('live-retry').hidden=true;showArtUnavailable(response.message);return;}
      if(response.status==='error'){manualArt=false;showArtUnavailable(response.message);$('live-retry').hidden=false;return;}
      $('live-retry').hidden=true;
      if(response.status==='ready'){
        const revision=++viewRevision;
        const openingScene=stage.classList.contains('scene-loading');
        const current=()=>revision===viewRevision&&chosen===selected&&response.instance===instance
          &&!document.hidden&&!dossier.open&&(settings.autoArt||manualArt);
        if(response.key!==artKey){
          if(openingScene)status('Loading artwork',true);
          await Promise.all([preload(response.background),...(response.character?[preload(response.character)]:[])]);
          if(!current())return;
          const currentBackground=activeBackground.getAttribute('src');
          if(currentBackground!==response.background||activeBackground.hidden){
            const upgrading=!activeBackground.hidden&&currentBackground===response.baseBackground&&response.background!==response.baseBackground;
            activeBackground=replaceLayer(activeBackground,response.background,false,upgrading?3000:1200);
          }
          if(openingScene){
            await waitForOpeningFade(1200);
            if(!current())return;
            stage.dataset.liveVignette='true';
            status('');
            stage.classList.add('opening-reading-band');
            await waitForOpeningFade(350);
            if(!current())return;
          }
          stage.dataset.liveVignette='true';
          if(response.character){if(activeCharacter.getAttribute('src')!==response.character||activeCharacter.hidden)activeCharacter=replaceLayer(activeCharacter,response.character,true);}
          else activeCharacter.hidden=true;
          artKey=response.key;stage.dataset.liveArt=artKey;stage.dataset.liveMode=response.mode;
          activeCharacter.alt=thread.name+' in the current outfit and pose';
        }
        if(openingScene){
          if(response.character)await waitForOpeningFade(1200);
          if(!current())return;
        }
        sceneReady=true;
        stage.classList.remove('art-unavailable');
        $('art-toggle').disabled=false;
        $('live-phone-art').disabled=false;
        showStory();
        manualArt=false;
        status(response.mode==='background-only'?'Character artwork will appear once the outfit is verified.':'');
      }else status(response.message||'Updating artwork…',true);
    }catch(error){if(chosen===selected){showArtUnavailable(error.name==='TimeoutError'?'Scene update timed out. Retrying…':error.message);signalEntryReady();}}
    finally{polling=false;if(selected&&!document.hidden)pollTimer=setTimeout(()=>void poll(),3000);}
  }
  document.addEventListener('visibilitychange',()=>{viewRevision++;clearTimeout(pollTimer);if(!document.hidden)void poll();});
  window.addEventListener('message',event=>{const frame=$('live-notifications');if(event.origin===appOrigin&&event.source===frame.contentWindow&&event.data?.type==='animessenger:notice-visible'&&event.data.id===selected&&event.data.instance===instance)frame.classList.toggle('has-notice',Boolean(event.data.visible));});
  const pauseNotices=()=>$('live-notifications').contentWindow?.postMessage({type:'animessenger:notice-pause',paused:dialogs.some(d=>d.open)},appOrigin);
  dialogs.forEach(d=>new MutationObserver(pauseNotices).observe(d,{attributes:true,attributeFilter:['open']}));
  window.addEventListener('pagehide',()=>{selected='';viewRevision++;clearTimeout(pollTimer);clearOpeningStoryTimer();});
  const initial=new URLSearchParams(location.search);if(initial.get('id')){stop('Loading conversation');selected=initial.get('id');instance=initial.get('instance')||'';void poll();}else void choose();
  $('live-avatar').addEventListener('load',()=>{$('live-avatar').hidden=false;});
  $('live-avatar').addEventListener('error',()=>{$('live-avatar').hidden=true;});

})();


