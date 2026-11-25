from pathlib import Path
import re
p=Path('public/immersive')
html=(p/'index.html').read_text(encoding='utf-8')
html=html.replace('src="prototype.js"','src="live.js"').replace('<title>AniMessenger · Local art scene study</title>','<title>AniMessenger · Immersive live test</title>')
html=html.replace('<link rel="stylesheet" href="animessenger-ui.css">','<link rel="stylesheet" href="animessenger-ui.css"><link rel="stylesheet" href="live.css">')
html=html.replace('src="rgba-test/shrine-background.png"','hidden').replace('src="rgba-test/rise-rgba-style-stack.png"','hidden')
html=html.replace('<h1>Rise Kujikawa</h1>','<h1>Choose a conversation</h1>').replace('<span>FAMILIAR</span>','<span id="live-tier"></span>')
html=html.replace('Illustrative relationship progress','Relationship progress').replace('aria-valuenow="28"','aria-valuenow="0"').replace('<i></i></div></div></div>','<i style="width:0%"></i></div></div></div>')
html=html.replace('<div class="top-actions">','<div class="top-actions"><button id="live-source-open" type="button">Conversation</button>')
html=html.replace('Scripted preview · no live AI', 'Visual Novel')

# Move identity and relationship out of the reading panel into a shared header.
identity='<button id="live-dossier-open" class="live-identity" type="button" disabled aria-haspopup="dialog" aria-label="Open character dossier"><span class="live-avatar"><span id="live-initial" aria-hidden="true">?</span><img id="live-avatar" alt="" hidden></span><span class="live-identity-copy"><span class="live-identity-name"><h1>Choose a conversation</h1><svg class="live-identity-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg></span><span id="live-location"></span></span></button>'
bond='<div class="bond live-bond"><div class="live-bond-label"><span id="live-tier"></span><span id="live-percent"></span></div><div class="bond-track" role="meter" aria-label="Relationship progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:0%"></i></div></div>'
html=re.sub(r'<a class="wordmark".*?</a>',lambda m:identity,html,count=1,flags=re.S)
html=html.replace('<div class="top-actions">',bond+'<div class="top-actions">',1)
html=re.sub(r'    <div class="speaker-row">.*?</div></div></div>\n','',html,count=1)

html=re.sub(r'<form id="composer">.*?</form>','<a id="live-chat-link" class="live-chat-link" href="http://127.0.0.1:5173/" target="_blank" rel="noopener noreferrer">Chat in AniMessenger <span aria-hidden="true">↗</span></a>',html,count=1,flags=re.S)
html=html.replace('<a id="live-chat-link" class="live-chat-link" href="http://127.0.0.1:5173/" target="_blank" rel="noopener noreferrer">Chat in AniMessenger <span aria-hidden="true">↗</span></a>', '<form id="live-composer"><label class="sr-only" for="live-message">Your message</label><textarea id="live-message" rows="1" maxlength="3000" placeholder="Message your character" disabled></textarea><button id="live-send" type="submit" aria-label="Send message" disabled><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button></form>')
html=re.sub(r'<label>Character placement<select id="side">.*?</select></label>','',html,count=1,flags=re.S)
html=html.replace('<option value="130">Leisurely</option><option value="80" selected>Comfortable</option><option value="40">Brisk</option><option value="0">Instant</option>', '<option value="400">Very slow</option><option value="240">Leisurely</option><option value="130" selected>Comfortable</option><option value="80">Brisk</option><option value="0">Instant</option>')
html=html.replace('<label>Word reveal', '<label>Reading style<select id="reading-style"><option value="cinematic">Cinematic · word fade and automatic following</option><option value="full">Full passage · instant text and manual scrolling</option></select></label><label>Word reveal')
html=html.replace('<label>Passage length','<label hidden style="display:none">Passage length')
html=re.sub(r'<p class="settings-note">.*?</p>','<label class="check-label"><input id="live-auto-art" type="checkbox" checked> Update artwork automatically</label><p class="settings-note">Live test: this viewer follows saved replies from the conversation you choose. Keep chatting in AniMessenger. Artwork is generated locally and saved separately from your chat gallery. Audio and upscaling are not connected.</p>',html,count=1,flags=re.S)
html=html.replace('Preview history stays in this tab and is cleared on reload.','Recent messages from the selected conversation. This viewer does not edit or delete them.')
html=html.replace('This prototype is separate from your AniMessenger chats. There’s nothing to save.','Your conversation is saved in AniMessenger. You can close this viewer without losing it.')
html=html.replace('</main>','<aside id="live-progress" class="live-progress" role="status"><span class="loading-orbit" aria-hidden="true"></span><div class="loading-copy"><strong id="live-progress-title">Setting the scene</strong><span id="live-status">Choose a conversation to begin.</span></div><button id="live-retry" type="button" hidden>Retry artwork</button></aside></main>',1)
dialog='''
<dialog id="live-source-dialog" aria-labelledby="live-source-title"><header class="dialog-header"><div><p class="eyebrow">IMMERSIVE · LIVE TEST</p><h2 id="live-source-title">Choose your conversation.</h2></div><form method="dialog"><button class="close-button" aria-label="Close conversation picker"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></form></header><div class="settings-body"><label>Conversation<select id="live-source"><option value="">Loading conversations</option></select></label><p class="settings-note">Keep chatting in AniMessenger. This viewer follows saved replies and creates artwork locally from the current scene. Messages and dossier changes are saved in AniMessenger.</p><p class="settings-note">Character and background stay separate when the pose changes. Seated or leaning poses can include their immediate supporting seat or surface in the foreground.</p><p id="live-picker-error" role="status"></p><button id="live-start" class="reset-button" type="button" disabled>Start live view</button></div></dialog>
'''
html=html.replace('</body>',dialog+'</body>')
html=html.replace('<div id="copy-scroll"', '<div id="live-writing" role="status" hidden><span>The next moment is taking shape</span><i></i><i></i><i></i></div><div id="copy-scroll"')
html=html.replace('</main>','<iframe id="live-notifications" title="Story notifications" referrerpolicy="no-referrer"></iframe></main>',1)

html=html.replace('<button id="art-toggle"', '<button id="live-reroll" class="icon-button" type="button" aria-label="Reroll character artwork" title="Reroll character artwork" disabled><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1.2L20 9M4 15l2.3 3.2A7 7 0 0 0 17.9 17"/></svg></button><button id="art-toggle"',1)
html=html.replace('</body>','<dialog id="live-dossier-dialog" aria-label="Character dossier"><div class="dossier-loading"><span class="dossier-spinner" aria-hidden="true"></span><span id="live-dossier-status" role="status">Opening dossier</span><button id="live-dossier-retry" class="reset-button" type="button" hidden>Retry</button></div><iframe id="live-dossier-frame" title="Character dossier" loading="eager" referrerpolicy="no-referrer"></iframe><button id="live-dossier-close" type="button" aria-label="Close dossier window">Close</button></dialog></body>')
(p/'live-index.html').write_text(html,encoding='utf-8')
js=(p/'prototype.js').read_text(encoding='utf-8')
js=re.sub(r'^import .*?;\n','',js,flags=re.M)
js=js.replace("  const $ = id => document.getElementById(id);","  const $ = id => document.getElementById(id);\n  const passages=[{text:'Choose a conversation to begin.',scene:'',light:'day'}];")
js=js.replace("  const currentText = () => passages[index].text + (settings.length === 'long' ? longer : '');","  const currentText = () => passages[0].text;")
start=js.index('  const art=createAssetCoordinator(')
end=js.index('\n  const history = [];',start)
js=js[:start]+js[end:]
js=js.replace('const image=new Image(); image.src=source; await image.decode();', """const image=new Image();
      const timeout=setTimeout(()=>image.removeAttribute('src'),15000);
      image.src=source;
      try{await image.decode();}
      catch{throw new Error('Artwork could not load. Retrying.');}
      finally{clearTimeout(timeout);}""")
js=js.replace("const dialogs = [$('settings-dialog'),$('history-dialog'),$('exit-dialog')];","const dialogs = [$('settings-dialog'),$('history-dialog'),$('exit-dialog'),$('live-source-dialog'),$('live-dossier-dialog')];")
js=re.sub(r"    art.transition\(passages\[index\].visual\).*?;\n",'',js)
js=js.replace("if(!visited.has(key)) {history.push({speaker:'Rise',text:currentText()}); visited.add(key);}","if(!visited.has(key)) visited.add(key);")
js=js.replace("stage.dataset.side=settings.side;","settings.side='left'; stage.dataset.side='left';")
js=js.replace("$('side').value=settings.side; ","")
js=re.sub(r"  \$\('side'\)\.addEventListener\('change',.*?;\n",'',js)
js=js.replace("  function advance() { index=(index+1)%passages.length; renderPassage(); }","  function advance() {}")

js=js.replace("speed:80,", "speed:130,")
js=js.replace("keepControls:false}","keepControls:false,readingStyle:'cinematic'}")
start=js.index('  function updateReveal() {')
end=js.index('  function setLighting(',start)
js=js[:start]+"  const reader=createLiveReader({panel:$('copy-scroll'),narrative:$('narrative'),revealButton:$('reveal'),getSettings:()=>settings});\n  function showAll(){reader.showAll();}\n  function startReveal(instant=false){reader.start(currentText(),instant);}\n"+js[end:]
js=js.replace('revealCount<words.length','reader.typing')
js=js.replace('  function renderPassage(instant=false) {',"  function renderPassage(instant=false) {\n    if(stage.classList.contains('scene-loading')){reader.clear();return;}")
js=js.replace("    wakeControls();\n  }\n  $('next')", "    $('reading-style').value=settings.readingStyle;\n    $('speed').disabled=settings.readingStyle==='full';\n    reader.refreshSettings();\n    wakeControls();\n  }\n  $('next')")
js=js.replace("  $('type-size').addEventListener", "  $('reading-style').addEventListener('change',event=>{settings.readingStyle=event.target.value;applySettings();});\n  $('type-size').addEventListener")
js=js.replace("  dialogs.forEach(dialog=>dialog.addEventListener('close',wakeControls));", """
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
""")

js=re.sub(r"  \$\('composer'\).addEventListener\('submit',event=>\{.*?\n  \}\);\n",'',js,flags=re.S)
js=re.sub(r"    if\(event.key==='Arrow(?:Right|Left)'\).*?\n",'',js)
js=re.sub(r"^  \$\('(settings-open|reading-style|type-size|backing|speed|reduce-motion|solid|keep-controls|reset-settings)'\)\.addEventListener.*\n", '', js, flags=re.M)
js=js.replace('  applySettings();renderPassage();','  applySettings();reader.clear();\n'+(Path('server/immersive/live-client.js').read_text(encoding='utf-8')))
js="import { createLiveReader } from './live-reading.mjs';\nimport { installCharacterLayout } from './character-layout.mjs';\n"+js
js=js.replace("  stage.dataset.study='local-art';","  stage.dataset.study='local-art';\n  installCharacterLayout(stage);")
(p/'live.js').write_text(js,encoding='utf-8')

html=(p/'live-index.html').read_text(encoding='utf-8')
html=html.replace('referrerpolicy="no-referrer"','referrerpolicy="origin"')
html=html.replace('<button id="live-source-open" type="button">Conversation</button>','<button id="live-source-open" type="button" hidden>Conversation</button>')
html=html.replace('id="settings-open" type="button"','id="settings-open" type="button" aria-label="Reading settings" title="Reading settings"')
html=html.replace('<span>Reading settings</span>','').replace('>Reading settings</button>','></button>')
html=html.replace('<textarea id="live-message"','<button id="live-action" type="button" aria-label="Insert an action">[action:]</button><textarea id="live-message"')
phone_modes='''<div id="live-phone-modes" role="group" aria-label="Conversation view">
  <button type="button" data-live-view="chat"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3ZM8 10h8m-8 3h5"/></svg><span>Chat</span></button>
  <button type="button" data-live-view="story"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5c3.2-.8 5.9-.2 8.5 1.7v12c-2.6-1.9-5.3-2.5-8.5-1.7ZM20.5 5.5c-3.2-.8-5.9-.2-8.5 1.7v12c2.6-1.9 5.3-2.5 8.5-1.7Z"/></svg><span>Story</span></button>
  <button type="button" aria-pressed="true"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h13a1 1 0 0 1 1 1v12M3 18l5-5 3 3 2-2 4 4"/><rect x="3" y="7" width="14" height="14" rx="2"/></svg><span>Visual Novel</span></button>
</div><button id="live-phone-art" type="button" data-live-tool="art-toggle" aria-label="View artwork" title="View artwork"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.7-6 10-6 10 6 10 6-3.7 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.6"/></svg></button>'''
html=html.replace('<button id="live-action"', phone_modes+'<details id="live-phone-tools"><summary aria-label="Message and artwork tools">+</summary><div><button type="button" data-live-tool="live-action">Insert action</button><button type="button" data-live-tool="history-open">History</button><button type="button" data-live-tool="live-reroll" disabled>Reroll character artwork</button></div></details><button id="live-action"')
start=html.index('<svg',html.index('id="live-reroll"'));end=html.index('</svg>',start)+6
html=html[:start]+'<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 0-15.2-6.5L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.2 6.5L21 16"/><path d="M16 16h5v5"/></svg>'+html[end:]
(p/'live-index.html').write_text(html,encoding='utf-8')
js=(p/'live.js').read_text(encoding='utf-8')
js=js.replace("'/live/","'/immersive/live/")
js=js.replace("'http://127.0.0.1:5173/?", "appOrigin+'/?").replace("'http://127.0.0.1:5173'",'appOrigin')
js="const appOrigin=location.origin;\n"+js
js=js.replace('  void choose();',"  const initial=new URLSearchParams(location.search);if(initial.get('id')){stop('Loading conversation');selected=initial.get('id');instance=initial.get('instance')||'';void poll();}else void choose();")
js=js.replace("async()=>{if(document.fullscreenElement)await document.exitFullscreen();$('exit-dialog').showModal();}", "()=>closeImmersive()")
js=js.replace("if(on)$('art-return').focus();else $('art-toggle').focus();", "if(on)$('art-return').focus();else (matchMedia('(max-width:800px)').matches?$('live-phone-art'):$('art-toggle')).focus();wakeControls();")
js=js.replace("stage.querySelectorAll('.reading-region,.controls').forEach", "stage.querySelectorAll('.reading-region,.controls').forEach")
js=js.replace("  messageInput.addEventListener('input',composerState);", "  const grow=()=>{\n    const mobile=matchMedia('(max-width:800px)').matches;\n    if(mobile&&!messageInput.value){messageInput.style.height='';return;}\n    messageInput.style.height=mobile?'0px':'auto';\n    messageInput.style.height=Math.min(mobile?120:160,messageInput.scrollHeight+(mobile?2:0))+'px';\n  };\n  messageInput.addEventListener('input',()=>{grow();composerState();});\n  $('live-action').addEventListener('click',()=>{const start=messageInput.selectionStart,end=messageInput.selectionEnd,space=start>0&&!/\\s$/.test(messageInput.value.slice(0,start))?' ':'';messageInput.setRangeText(space+'[action: ]',start,end,'end');const caret=start+space.length+9;messageInput.setSelectionRange(caret,caret);messageInput.focus();grow();composerState();});")
(p/'live.js').write_text(js,encoding='utf-8')

js=(p/'live.js').read_text(encoding='utf-8').replace("messageInput.value='';displayedMessageId","messageInput.value='';grow();displayedMessageId")
(p/'live.js').write_text(js,encoding='utf-8')

html=(p/'live-index.html').read_text(encoding='utf-8').replace('Immersive live test','Immersive mode').replace('IMMERSIVE · LIVE TEST','IMMERSIVE MODE')
html=re.sub(r'<p class="settings-note">Live test:.*?</p>', '<p class="settings-note">Adjust how the story is presented in immersive mode.</p>',html)
html=html.replace('Update artwork automatically</label>', 'Update artwork automatically</label><label class="check-label"><input id="live-high-res" type="checkbox" checked> High-res background upscaling</label>')
html=html.replace('High-res background upscaling</label>', 'High-res background upscaling</label><button id="live-reroll-background" class="reset-button" type="button" disabled>Reroll background</button>')
html=html.replace('<p class="settings-note">Adjust how the story is presented in immersive mode.</p>', '<label>Character edge fade<select id="character-fade"><option value="auto">Auto</option><option value="always">Always</option><option value="off">Off</option></select></label>')
html=html.replace('<button id="reset-settings" class="reset-button" type="button">Reset reading settings</button>\n</div></dialog>', '</div><footer class="reading-settings-actions"><button id="reset-settings" type="button">Restore defaults</button><button id="cancel-settings" type="button">Cancel</button><button id="save-settings" type="submit" form="reading-settings-form">Save settings</button></footer></dialog>')
html=html.replace('<dialog id="settings-dialog" aria-labelledby="settings-title"><form method="dialog">','<dialog id="settings-dialog" aria-labelledby="settings-title"><form id="reading-settings-form" method="dialog">')
html=html.replace('<button class="close-button" aria-label="Close reading settings">','<button class="close-button" type="submit" value="cancel" aria-label="Close reading settings">')
(p/'live-index.html').write_text(html,encoding='utf-8')


html=(p/'live-index.html').read_text(encoding='utf-8')
html=re.sub(r'<title>.*?</title>','<title>AniMessenger · Immersive mode</title>',html)
(p/'live-index.html').write_text(html,encoding='utf-8')
