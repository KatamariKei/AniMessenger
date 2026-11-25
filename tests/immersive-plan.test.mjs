import test from 'node:test';import assert from 'node:assert/strict';
import {foregroundGaze,planLiveArt} from '../server/immersive/live-plan.mjs';
import {makeLiveServer,publicThread} from '../server/immersive/live-server.mjs';
import {once} from 'node:events';
import {defaultConfig} from '../server/config.mjs';
import {visualNovelBlock} from '../shared/visual-novel-availability.mjs';
import {applyFinalScene} from '../server/final-scene.mjs';
import {characterPlacement,characterFade} from '../public/immersive/character-layout.mjs';
const thread={id:'test',storageInstanceId:'one',character:{id:'test',name:'Test'},profile:{visual:{identity:['brown hair'],defaultWardrobe:'blue jacket'},persona:{}},scene:{location:'garden',presence:'together',outfit:'blue jacket',posture:'standing'},messages:[]};
const config={comfyDiffusionModel:'anima.safetensors'};
test('a named bar keeps its venue framing when the detailed environment becomes pending',()=>{
 const name='the Copper Lantern';
 const arrived=`They stepped into ${name}.`;
 const saved={...thread,scene:{...thread.scene,location:name,environment:'a narrow space behind the bar counter',
  locationEvidence:{source:'character',text:arrived},verification:{pending:['environment']}},messages:[
  {from:'user',text:'[action: Mira is working at the Copper Lantern bar.]'},
  {from:'character',narration:arrived},
  {from:'character',narration:'The noise of the bar faded as she moved behind the bar.'},
  {from:'character',narration:'She looked up and smiled.'},
 ]};
 const background=planLiveArt(saved,config,'pending-venue').assets[0].positive;
 assert.match(background,/pub and bar interior.*service counter.*bottle shelves.*Copper Lantern/i);
 assert.doesNotMatch(background,/narrow space/i);
 const later={...saved,scene:{...saved.scene,locationEvidence:{source:'character',text:name}},
  messages:[...saved.messages,{from:'character',narration:`She got back to work in the main room of ${name}.`}]};
 assert.equal(planLiveArt(later,config,'pending-venue').assets[0].key,planLiveArt(saved,config,'pending-venue').assets[0].key);
 const apartment='They stepped into their apartment.';
 const moved={...saved,scene:{...saved.scene,location:'their apartment',locationEvidence:{source:'character',text:apartment}},
  messages:[...saved.messages,{from:'character',narration:apartment}]};
 assert.doesNotMatch(planLiveArt(moved,config,'pending-venue').assets[0].positive,/bar interior|bottle shelves/i);
});
test('Visual Novel recovers a pending room from ordinary narration without a location instruction',()=>{
 const saved={...thread,character:{...thread.character,name:'Mira Vale'},scene:{...thread.scene,location:'locker room shower',
  environment:'tiled shower',verification:{pending:['location','environment'],omitted:['environment']}},messages:[
  {from:'user',text:'We get on with our day.'},
  {from:'character',narration:'While Alex was working, Mira was in her element at the Copper Lantern. She moved through the bar and set down a glass.'},
  {from:'user',text:'When I entered the bar, she smiled.'},
  {from:'character',narration:'Mira waved him over.'},
 ]};
 assert.equal(publicThread(saved).location,'the Copper Lantern');
 const background=planLiveArt(saved,config,'normal-narration').assets[0].positive;
 assert.match(background,/the Copper Lantern.*bar interior/i);
 assert.doesNotMatch(background,/shower/i);
});
test('an explicit scene cut to a named bar recovers a pending location across later replies',()=>{
 const direction="[action: Mira is working at the Copper Lantern bar. Let's focus on her narrative and change the location to the Copper Lantern.]";
 const scene={...thread.scene,location:'locker room shower',characterLocation:'locker room shower',
  userLocation:'workshop',environment:'tiled shower with benches',verification:{status:'needs_review',pending:['location','environment'],omitted:['environment']}};
 const messages=[
  {id:'cut',from:'user',text:direction},
  {id:'at-bar',from:'character',narration:'The atmosphere inside the Copper Lantern was warm.'},
  {id:'enter',from:'user',text:'When I entered the bar, our eyes immediately locked.'},
  {id:'welcome',from:'character',narration:'Mira rounded the corner of the bar and smiled.'},
 ];
 for(const presence of ['together','apart']){
  const saved={...thread,scene:{...scene,presence},messages};
  const plan=planLiveArt(saved,config,'scene-cut');
  assert.equal(publicThread(saved).location,'the Copper Lantern');
  assert.match(plan.assets[0].positive,/the Copper Lantern.*bar interior/i);
  assert.doesNotMatch(plan.assets[0].positive,/shower|locker room/i);
  assert.equal(saved.scene.userLocation,'workshop');
 }
 assert.equal(applyFinalScene({...scene,presence:'apart'},{userText:direction}).scene.userLocation,'workshop');
 assert.equal(applyFinalScene({...scene,presence:'apart'},{userText:direction}).scene.characterLocation,'the Copper Lantern');
 assert.equal(applyFinalScene(scene,{userText:'Should we change the location to the Copper Lantern?'}).scene.location,scene.location);
});
test('Visual Novel distinguishes skipped image setup from a saved ComfyUI setup',()=>{
 const setup=/Setup → Run guided setup.*Image setup/;
 assert.match(visualNovelBlock(defaultConfig,false),setup);
 assert.match(visualNovelBlock({...defaultConfig,comfyWorkflowFile:'',comfyMappingFile:''},true),setup);
 for(const settings of [{comfyModelsDir:'models'},{comfyOutputDir:'output'},config,{comfyWorkflowFile:'custom.json',comfyMappingFile:'mapping.json'}]){
  assert.equal(visualNovelBlock({...defaultConfig,...settings},false),'Start ComfyUI to open Visual Novel.');
  assert.equal(visualNovelBlock({...defaultConfig,...settings},true),'');
 }
 assert.equal(visualNovelBlock(defaultConfig,true),'');
});
test('Visual Novel pauses artwork while ComfyUI is offline and resumes on reconnection',async t=>{
 let online=false,renderCount=0;
 const server=makeLiveServer({
  trusted:true,
  getApp:async()=>({thread:{...thread,storageRevision:7}}),
  getConfig:async()=>({...defaultConfig,...config}),
  comfyOnline:async()=>online,
  getSettings:async()=>({config}),
  render:async()=>{renderCount++;return {status:'ready',instance:thread.storageInstanceId};},
 });
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const requestArtwork=async()=>{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/live/render',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({id:thread.id,instance:thread.storageInstanceId}),
  });
  assert.equal(response.status,200);
  return response.json();
 };
 const waiting=await requestArtwork();
 assert.equal(waiting.status,'waiting');
 assert.equal(waiting.message,'Start ComfyUI to resume artwork updates.');
 assert.equal(waiting.sourceRevision,7);
 assert.equal(renderCount,0);
 online=true;
 assert.equal((await requestArtwork()).status,'ready');
 assert.equal(renderCount,1);
});

test('Visual Novel verifies uncertain outfits and surroundings before generating replacement artwork',async t=>{
 let saved={...thread,storageRevision:7,scene:{...thread.scene,location:'Shopping District',
  environment:'Inside a high-end boutique with clothing displays.',outfit:'blue jacket and black pants',
  verification:{pending:['environment','outfit']}},messages:[{id:'fitting',from:'user',text:'She goes to the fitting room.'},
  {id:'reveal',from:'character',narration:'She slid into the black miniskirt, then the blood-red blouse, and draped the coat over her shoulders. She stepped out into the boutique.'}]};
 let checks=0,renders=0,finishCheck;
 const gate=new Promise(resolve=>{finishCheck=resolve;});t.after(()=>finishCheck());
 const server=makeLiveServer({trusted:true,getApp:async()=>({thread:saved}),getConfig:async()=>({...defaultConfig,...config}),
  comfyOnline:async()=>true,getSettings:async()=>({config}),reconcileScene:async(_config,incoming)=>{
   checks++;assert.equal(incoming.scene.outfit,'blue jacket and black pants');await gate;
   saved={...incoming,storageRevision:8,scene:{...incoming.scene,outfit:'black miniskirt, blood-red blouse, high-collared coat',
    environment:'Inside a high-end boutique, fitting room curtains and clothing displays.',verification:{pending:[]}}};
   return {thread:saved,reconciled:true};
  },render:async current=>{
   renders++;const plan=planLiveArt(current,config,'fixture');
   assert.match(plan.assets.find(asset=>asset.kind==='background').positive,/boutique.*fitting room/i);
   assert.match(plan.assets.find(asset=>asset.kind==='foreground').positive,/black miniskirt.*blood-red blouse/);
   assert.doesNotMatch(plan.assets.find(asset=>asset.kind==='foreground').positive,/blue jacket|black pants/);
   return {status:'ready'};
  }});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const request=()=>fetch('http://127.0.0.1:'+server.address().port+'/live/render',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:saved.id,instance:saved.storageInstanceId})}).then(r=>r.json());
 assert.equal((await request()).status,'pending');assert.equal((await request()).status,'pending');
 assert.equal(checks,1);assert.equal(renders,0);finishCheck();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal((await request()).sourceRevision,8);assert.equal((await request()).status,'ready');
 assert.equal(checks,1);assert.equal(renders,2);
});

test('failed VN scene checks retain existing artwork and wait for retry or new evidence instead of repeating on every poll',async t=>{
 let saved={...thread,scene:{...thread.scene,verification:{pending:['outfit']}},messages:[{id:'reply',from:'character',narration:'She changed into a blue dress.'}]};
 let checks=0,renders=0;
 const server=makeLiveServer({trusted:true,getApp:async()=>({thread:saved}),getConfig:async()=>({...defaultConfig,...config}),
  comfyOnline:async()=>true,getSettings:async()=>({config}),reconcileScene:async()=>{checks++;throw new Error('Outfit could not be verified.');},
  render:async()=>{renders++;return {status:'ready'};}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const request=retry=>fetch('http://127.0.0.1:'+server.address().port+'/live/render',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:saved.id,instance:saved.storageInstanceId,retry})}).then(r=>r.json());
 assert.equal((await request()).status,'pending');assert.equal((await request()).status,'error');await request();assert.equal(checks,1);assert.equal(renders,0);
 await request('foreground');assert.equal(checks,2);
 saved={...saved,messages:[{id:'new-reply',from:'character',narration:'She puts on a red coat.'}]};
 await request();assert.equal(checks,3);
});
test('walking without a wardrobe change does not require proving the saved outfit again',async t=>{
 const saved={...thread,scene:{...thread.scene,outfit:'blood-red blouse, black miniskirt',verification:{pending:['outfit','posture']}},
  messages:[{id:'walk',from:'user',text:'We hurry through the city alleys toward the restaurant.'},
   {id:'walking',from:'character',narration:'She leads him through the alleys, laughing as she jumps over a puddle.'}]};
 let checks=0;
 const server=makeLiveServer({trusted:true,getApp:async()=>({thread:saved}),getConfig:async()=>({...defaultConfig,...config}),
  comfyOnline:async()=>true,getSettings:async()=>({config}),reconcileScene:async()=>{checks++;throw new Error('No fresh outfit quote.');},
  render:async current=>{assert.equal(current.scene.outfit,saved.scene.outfit);return {status:'ready'};}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const result=await fetch('http://127.0.0.1:'+server.address().port+'/live/render',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({id:saved.id,instance:saved.storageInstanceId})}).then(r=>r.json());
 assert.equal(result.status,'ready');assert.equal(checks,0);
 assert.deepEqual(saved.scene.verification.pending,['outfit','posture']);
});

test('late artwork captions stay in history without replacing the passage or ending the reply wait',()=>{
 const passage={id:'story',from:'character',narration:'She paused to watch the rain.'};
 const user={id:'user',from:'user',text:'What are you thinking about?'};
 const deliveries=[
  {id:'photo',from:'character',imageJobId:'job',image:'/art.png',text:'Here is the picture.'},
  {id:'legacy',from:'character',image:'/old.png',text:'Look at this.'},
  {id:'failed',from:'character',imageJobId:'failed-job',text:'A little surprise for you.'},
 ];
 for(const delivery of deliveries){
  const view=publicThread({...thread,messages:[passage,user,delivery]});
  assert.deepEqual(view.latest,{id:passage.id,text:passage.narration});
  assert.equal(view.waitingForReply,true);
  assert.equal(view.history.at(-1).text,delivery.text);
 }
 const next={id:'next',from:'character',narration:'She turned back to answer.',image:'/scene.png'};
 const updated=publicThread({...thread,messages:[passage,user,...deliveries,next]});
 assert.deepEqual(updated.latest,{id:next.id,text:next.narration});
 assert.equal(updated.waitingForReply,false);
 const plain={id:'plain',from:'character',text:'A regular reply.'};
 assert.deepEqual(publicThread({...thread,messages:[passage,plain,...deliveries]}).latest,{id:plain.id,text:plain.text});
});
test('ordinary shared activity defaults to eye contact and explicit gaze still works',()=>{
 const scene={...thread.scene,activity:'watching wrestling'};
 const gaze=(...lines)=>foregroundGaze(scene,lines.map(text=>({text})));
 assert.equal(gaze('She looked up at the screen.'),'looking at viewer');
 assert.equal(gaze('She studied the ruins.'),'looking at viewer');
 assert.equal(gaze('She looked away from him.'),'looking away');
 assert.equal(gaze('She looked away.','She looked back at him.'),'looking at viewer');
 assert.equal(gaze('She looked upward toward the canopy.'),'looking up');
 assert.equal(gaze('She closed her eyes.'),'closed eyes');
 assert.match(planLiveArt({...thread,scene},config,'test').assets[1].positive,/looking at viewer/i);
});
test('integrated art keeps square foreground, separate background and concise framing',()=>{
 const plan=planLiveArt(thread,config,'test');assert.equal(plan.mode,'layered');const fg=plan.assets[1];assert.deepEqual([fg.width,fg.height],[1536,1536]);assert.match(fg.positive,/solo, medium shot/);assert.doesNotMatch(fg.positive,/empty space|center-left composition/);
 const changed=planLiveArt({...thread,scene:{...thread.scene,outfit:'red dress'}},config,'test');assert.equal(changed.assets[0].key,plan.assets[0].key);assert.notEqual(changed.assets[1].key,fg.key);
});
test('integrated character stays left aligned at full height with a responsive fade',()=>{
 for(const [width,height] of [[1920,1080],[3840,2160]]){assert.deepEqual(characterPlacement({width,height},{width:1536,height:1536}),{left:0,top:0,width:height,height});assert.match(characterFade(height,width),/linear-gradient/);}
});
test('confusion suggests a shrug unless the story has already posed the arms',()=>{
 const scene={...thread.scene,expression:'confused'};
 const plan=planLiveArt({...thread,scene},config,'test');
 const foreground=plan.assets[1];
 assert.match(foreground.positive,/medium shot/);
 assert.match(foreground.positive,/small shrug.*slight head tilt/i);
 assert.doesNotMatch(foreground.positive,/visible hands|elbows|palm up/i);
 const crossed=planLiveArt({...thread,scene,messages:[
  {from:'character',narration:'She folded her arms. She looked confused.'},
 ]},config,'test');
 assert.match(crossed.assets[1].positive,/arms crossed loosely.*slight head tilt/i);
 assert.equal(crossed.assets[1].positive.match(/arms crossed/gi).length,1);
 assert.doesNotMatch(crossed.assets[1].positive,/shrug|visible hands and elbows/);
 assert.notEqual(crossed.assets[1].key,foreground.key);
 assert.equal(crossed.assets[0].key,plan.assets[0].key);
});
test('a brief reaction in the closing paragraph preserves the latest sustained expression',()=>{
 const scene={...thread.scene,expression:'shy and intrigued'};
 const foreground=narration=>planLiveArt({...thread,scene,messages:[{from:'character',narration}]},config,'test').assets[1].positive;
 assert.match(foreground('She studied his face.\n\nShe listened quietly.\n\nShe laughed softly.'),/expression is shy and intrigued/i);
 const settled=foreground('She looked confused.\n\nShe looked thoughtful.\n\nShe briefly smiled.');
 assert.match(settled,/expression is thoughtful/i);
 assert.doesNotMatch(settled,/confused|expression is smiling/i);
});
test('a beaming expression and a cheerful baseline reach the sprite prompt',()=>{
 const profile={...thread.profile,persona:{traits:['Cheerful']},socialIdentity:{pronouns:'she/her'}};
 const scene={...thread.scene,expression:'shyly happy',verification:{pending:['expression']}};
 const prompt=(narration,patch={})=>planLiveArt({...thread,profile,scene:{...scene,...patch},messages:[{from:'character',narration}]},config,'test').assets[1].positive;
 assert.match(prompt('She beamed at him, her expression one of pure happiness.'),/expression is a bright smile/);
 assert.match(prompt('She waited beside him.'),/expression is a gentle smile/);
 assert.match(prompt('She beamed at him. Then she looked solemn.'),/expression is solemn/);
 assert.match(prompt('She waited beside him.',{expression:'worried',verification:undefined}),/expression is worried/);
 assert.doesNotMatch(prompt('She fell asleep.',{activity:'sleeping',posture:'lying'}),/gentle smile/);
});
test('narrated one-hand pose and lingering smile reach art even while saved expression is pending',()=>{
 const scene={...thread.scene,expression:'playful and curious',verification:{pending:['expression']}};
 const profile={...thread.profile,socialIdentity:{pronouns:'she/her'}};
 const messages=[
  {from:'character',narration:'She placed a hand on her hip and looked at Alex with a playful, challenging glint in her blue eyes.'},
  {from:'user',text:'That was the punchline!'},
  {from:'character',narration:'She burst into laughter. As her laughter subsided into a soft, lingering smile, she looked up at him.'},
 ];
 const prompt=planLiveArt({...thread,scene,profile,messages},config,'test').assets[1].positive;
 assert.equal(prompt.match(/hand on own hip/gi)?.length,1);
 assert.match(prompt,/expression is a warm smile/i);
 assert.doesNotMatch(prompt,/playful and curious|hands on hips/i);
 const lowered=planLiveArt({...thread,scene,profile,messages:[...messages,{from:'character',narration:'She lowered her hand.'}]},config,'test').assets[1].positive;
 assert.doesNotMatch(lowered,/hand on own hip/i);
});
test('held props survive a quiet turn and another actor’s gesture without losing the seated pose',()=>{
 const scene={...thread.scene,posture:'seated',expression:'surprised'};
 const profile={...thread.profile,socialIdentity:{pronouns:'she/her'}};
 const messages=[{from:'character',narration:'She held a mug with both hands. Her eyes widened.'}];
 const plan=entries=>planLiveArt({...thread,profile,scene,messages:entries},config,'test');
 const foreground=plan(messages).assets[1];
 assert.match(foreground.positive,/holding the mug in both hands/i);
 assert.match(foreground.positive,/expression is surprised/i);
 assert.doesNotMatch(foreground.positive,/visible hands|elbows|close in front of the torso/i);
 assert.match(foreground.positive,/is seated/);
 const continued=plan([...messages,{from:'user',text:'[action: I wave and point at the clock]'},
  {from:'character',narration:'He waved in reply. She listened quietly.'}]).assets[1];
 assert.equal(continued.key,foreground.key);
 const putDown=plan([...messages,{from:'character',narration:'She put the mug down.'}]).assets[1];
 assert.doesNotMatch(putDown.positive,/holding the mug/);
});
test('the final action wins when a wave ends, and suggested posing stays out of scene state',()=>{
 const waving={...thread,messages:[{from:'character',narration:'She waved once.'}]};
 const ended={...waving,messages:[{from:'character',narration:'She waved and then lowered her hand.'}]};
 const before=structuredClone(ended);
 assert.match(planLiveArt(waving,config,'test').assets[1].positive,/waving/i);
 const settled=planLiveArt(ended,config,'test').assets[1];
 assert.doesNotMatch(settled.positive,/raised|wav(?:e|ing)/i);
 assert.match(settled.positive,/is standing/i);
 assert.doesNotMatch(settled.positive,/weight shifted|contrapposto/i);
 assert.deepEqual(ended,before);
});
test('contrapposto follows a standing weight shift and yields to explicit hand cues',()=>{
 const prompt=(narration,posture='standing')=>planLiveArt({...thread,scene:{...thread.scene,posture},messages:[{from:'character',narration}]},config,'test').assets[1].positive;
 assert.doesNotMatch(prompt('She waited quietly.'),/contrapposto|weight shifted/i);
 assert.equal(prompt('She settled her weight onto one leg.').match(/contrapposto/gi)?.length,1);
 assert.match(prompt('He stood with his weight on one leg.'),/contrapposto/i);
 assert.doesNotMatch(prompt('She might shift her weight onto one leg.'),/contrapposto/i);
 assert.doesNotMatch(prompt('She shifted her weight onto one leg.','seated'),/contrapposto/i);
 const crossed=prompt('She shifted her weight onto one leg and crossed her arms.');
 assert.match(crossed,/arms crossed loosely/i);
 assert.doesNotMatch(crossed,/contrapposto/i);
});
test('hands on hips follows a clear assertive beat when standing with free hands',()=>{
 const prompt=(narration,posture='standing')=>planLiveArt({...thread,scene:{...thread.scene,posture},messages:[{from:'character',narration}]},config,'test').assets[1].positive;
 assert.match(prompt('She plants her hands on her hips.'),/hands on hips/i);
 assert.match(prompt('She scolded him.'),/hands on hips/i);
 assert.match(prompt('She stood confidently.'),/hands on hips/i);
 assert.doesNotMatch(prompt('She looked angry.'),/hands on hips/i);
 assert.doesNotMatch(prompt('She scolded him.','seated'),/hands on hips/i);
 assert.doesNotMatch(prompt('She scolded him. She looked thoughtful.'),/hands on hips/i);
 const mug=prompt('She held a mug and scolded him.');
 assert.match(mug,/holding the mug/i);
 assert.doesNotMatch(mug,/hands on hips/i);
});
test('integrated artwork refuses incomplete or unsupported guest scenes',()=>{
 assert.match(planLiveArt({...thread,profile:null},config,'test').waiting,/setup/);
 assert.match(planLiveArt({...thread,cameo:{activeGuest:{characterId:'guest'}}},config,'test').waiting,/Guest/);
});
test('outfit review keeps layered artwork using the saved or default wardrobe',()=>{
 const ready=planLiveArt(thread,config,'test');
 const pending=planLiveArt({...thread,scene:{...thread.scene,verification:{pending:['outfit']}}},config,'test');
 assert.equal(pending.mode,'layered');
 assert.deepEqual(pending.assets,ready.assets);
 const missing=planLiveArt({...thread,scene:{...thread.scene,outfit:'',verification:{pending:['outfit']}}},config,'test');
 assert.match(missing.assets[1].positive,/blue jacket/);
 const unknownLocation=planLiveArt({...thread,scene:{...thread.scene,verification:{pending:['location','outfit']}}},config,'test');
 assert.match(unknownLocation.waiting,/verify.*location/);
});
test('a clothing wager and user-only shirt removal leave the character artwork available',()=>{
 const quote='She put on her blue jacket.';
 const saved={...thread,scene:{...thread.scene,outfitEvidence:{kind:'final_scene',source:'character',text:quote},verification:{pending:['outfit']}},messages:[
  {from:'character',narration:quote},
  {from:'user',text:'Loser removes an article of clothing. You in?'},
  {from:'character',narration:'She grinned. “I’m in!”'},
  {from:'user',text:'[action: I take off my t-shirt and throw it onto the ground]'},
  {from:'character',narration:'She watched him pull his t-shirt off.'}
 ]};
 assert.match(planLiveArt(saved,config,'test').assets[1].positive,/blue jacket/);
 const changed={...saved,scene:{...saved.scene,outfit:'red dress',verification:{pending:[]}}};
 assert.match(planLiveArt(changed,config,'test').assets[1].positive,/red dress/);
});
test('a current shared seating action can recover an unverified room without reusing stale scenery',()=>{
 const saved={...thread,scene:{...thread.scene,location:'home',environment:'rural cottage with mountain view',verification:{pending:['location','environment']}},messages:[
  {from:'user',text:'[action: we sit down on the couch in the living room in the modern urban townhouse and I hand her a drink]'},
  {from:'character',narration:'She sank into the cushions and accepted the glass.'}
 ]};
 const result=planLiveArt(saved,config,'test');
 assert.match(result.assets[0].positive,/living room in the modern urban townhouse/);
 assert.doesNotMatch(result.assets[0].positive,/rural cottage|mountain view/);
 const continued={...saved,messages:[...saved.messages,{from:'user',text:'How about a movie?'},{from:'character',narration:'She picked up the remote.'}]};
 assert.equal(planLiveArt(continued,config,'test').assets[0].key,result.assets[0].key);
 const watching={...continued,scene:{...saved.scene,posture:'standing',verification:{pending:['location','posture']}},messages:[
  ...continued.messages,{from:'user',text:"[action: we're both sitting on the couch as I put on the show]"},
  {from:'character',narration:'“Everyone in the building could feel the drama.” She shifted into her seat and looked up at him.'}
 ]};
 const watchingPlan=planLiveArt(watching,config,'test');
 assert.match(watchingPlan.assets[0].positive,/modern urban townhouse/);
 assert.match(watchingPlan.assets[1].positive,/seated|sitting/i);
 const later=planLiveArt({...watching,messages:[
  ...saved.messages,
  ...Array.from({length:12},()=>({from:'character',narration:'She smiled.'})),
  {from:'user',text:'[action: Test is sitting down, but cheering at the screen]'},
  {from:'character',narration:'She practically stood up on the couch, her glass held high in excitement.'}
 ]},config,'test');
 assert.match(later.assets[0].positive,/modern urban townhouse/);
 assert.match(later.assets[1].positive,/seated|sitting/i);
 const moved={...saved,messages:[saved.messages[0],{from:'character',narration:'She stepped into the kitchen.'}]};
 assert.match(planLiveArt(moved,config,'test').waiting,/verify.*location/);
 const genericHome={...saved,scene:{...saved.scene,verification:{pending:['environment']}},messages:[
  ...saved.messages,
  {from:'character',narration:'The horns blasted through the living room speakers. Her laugh echoed in the quiet room.'},
  {from:'character',narration:'She leaned back into the cushions, feeling completely at home in his space. Her glass caught a reflection in the ambient light of the living room.'}
 ]};
 assert.match(planLiveArt(genericHome,config,'test').assets[0].positive,/modern urban townhouse/);
 const movedHome={...genericHome,messages:[...genericHome.messages,{from:'character',narration:'She walked into the kitchen.'}]};
 assert.doesNotMatch(planLiveArt(movedHome,config,'test').assets[0].positive,/modern urban townhouse/);
});
test('pending location can recover from the saved user checkpoint without putting its owner in the background',()=>{
 const declaration='[action: we are in the walk-in shower in her bathroom';
 const saved={...thread,scene:{...thread.scene,location:'the walk-in shower in her bathroom',
  verification:{pending:['location','environment']},locationEvidence:{source:'user',text:declaration}},messages:[
  {from:'user',text:declaration+' and we look at the tile]'},
  {from:'character',narration:'She noticed the pattern on the tiles.'},
 ]};
 const background=planLiveArt(saved,config,'test').assets[0];
 assert.match(background.positive,/walk-in shower.*bathroom.*wet tile/i);
 assert.match(background.positive,/empty private interior, interior architecture/);
 assert.doesNotMatch(background.positive,/\bher\b/);
 assert.match(background.negative,/person in reflection/);
 assert.equal(publicThread(saved).location,'the walk-in shower in her bathroom');
 const departed={...saved,messages:[...saved.messages,{from:'character',narration:'She stepped into the kitchen.'}]};
 assert.match(planLiveArt(departed,config,'test').waiting,/verify.*location/);
});
test('shared travel keeps the street through dialogue and gives way to cafe arrival',()=>{
 const departure='They stepped out of the bookstore.';
 const street={...thread,scene:{...thread.scene,location:'Street outside Local Bookstore',environment:'Cobblestone streets leading toward a cafe',
  locationEvidence:{source:'character',text:departure}},messages:[
  {from:'character',narration:departure},
  {from:'user',text:'[action: we walk side by side down the cobblestone streets on our way to the cafe]'},
  {from:'character',narration:'She pivoted back toward the direction of the cafe.'}
 ]};
 const prompt=planLiveArt(street,config,'test').assets[0].positive;
 assert.match(prompt,/cobblestone street/);
 assert.doesNotMatch(prompt,/bookstore|cafe/i);
 const arrival='They entered the cafe.';
 const cafe={...street,scene:{...street.scene,location:'cafe',environment:'',locationEvidence:{source:'character',text:arrival}},
  messages:[...street.messages,{from:'character',narration:arrival}]};
 assert.match(planLiveArt(cafe,config,'test').assets[0].positive,/cafe interior/);
});
test('leaving a venue and entering the street grounds the artwork and location label before arrival',()=>{
 const cafe='[action: we are at the cafe, a bookstore-themed cafe]';
 const departure='[action: we leave the cafe and enter the busy neighborhood streets and set off walking to the park. As we walked side by side I grabbed her hand] Off we go!';
 const narration='The cool evening air of the neighborhood streets brushed against them as they stepped away from the cafe. The sidewalk was alive with the chatter of passing pedestrians.';
 const saved={...thread,scene:{...thread.scene,location:'the cafe',environment:'A bookstore-themed cafe',
  verification:{version:1,status:'needs_review',pending:['location','environment']},locationEvidence:{source:'user',kind:'final_scene',text:cafe}},messages:[
   {from:'user',text:cafe},
   {from:'user',text:departure},
   {from:'character',narration},
 ]};
 const before=structuredClone(saved);
 const location='the busy neighborhood street';
 assert.equal(applyFinalScene(saved.scene,{userText:departure,characterText:narration,modelScene:{location:'the cafe'}}).scene.location,location);
 assert.equal(publicThread(saved).location,location);
 const background=planLiveArt(saved,config,'test').assets[0];
 assert.match(background.positive,/outdoor exterior view/);
 assert.match(background.positive,/busy neighborhood street/);
 assert.match(background.positive,/tiny passersby far from the camera/);
 assert.match(background.negative,/\(foreground person:1\.4\)/);
 assert.doesNotMatch(background.positive,/cafe|park/i);
 assert.deepEqual(saved,before);
});
test('garden gates and a plural garden declaration each advance a saved street scene',()=>{
 const street='[action: we walk down the neighborhood street toward the botanical gardens]';
 const scene={...thread.scene,location:'the neighborhood street',environment:'A neighborhood street with pedestrians',
  locationEvidence:{source:'user',kind:'final_scene',text:street.slice(0,-1)}};
 const approach={...thread,scene,messages:[{from:'user',text:street},{from:'character',narration:'They neared the iron gates of the botanical gardens.'}]};
 assert.match(planLiveArt(approach,config,'test').assets[0].positive,/neighborhood street/);
 for(const action of [
  '[action: we entered through the iron gates of the botanical gardens, and we were surrounded by flora]',
  '[action: we are currently inside the botanical gardens, surrounded by plants and trees]',
 ]){
  const narration='As they walked toward the greenhouse, the twilight deepened over the surrounding flowers.';
  const saved={...approach,messages:[...approach.messages,{from:'user',text:action},{from:'character',narration}]};
  assert.equal(applyFinalScene(scene,{userText:action,characterText:narration}).scene.location,'the botanical gardens');
  assert.equal(publicThread(saved).location,'the botanical gardens');
  const prompt=planLiveArt(saved,config,'test').assets[0].positive;
  assert.match(prompt,/outdoor exterior view.*botanical gardens.*plants, flowers, pathways.*twilight/);
  assert.doesNotMatch(prompt,/street|pedestrians|greenhouse|indoor interior/);
 }
});
test('reopening keeps a verified home arrival ahead of older scenery and resolves a later room move',()=>{
 const arrival='after a long walk we arrive at her home.';
 const decor='It was impeccably clean upscale decor with a Victorian flair.';
 const room=`[action: we entered her home and then walked into the living room. ${decor}]`;
 const scene={...thread.scene,location:'her home',environment:'a living room with clean Victorian decor',
  locationEvidence:{source:'user',kind:'final_scene',text:arrival},
  environmentEvidence:{source:'user',kind:'final_scene',text:decor}};
 const home={...thread,scene,messages:[
  {from:'user',text:'[action: we are inside the botanical gardens]'},
  {from:'character',narration:'She looked at the flowers.'},
  {from:'user',text:`[action: ${arrival}]`},
  {from:'character',narration:'She stood in the entryway.'},
 ]};
 assert.equal(publicThread(home).location,'her home');
 const livingRoom={...home,messages:[...home.messages,{from:'user',text:room},
  {from:'character',narration:'She followed him into the living room.'},
  {from:'user',text:'Shall we talk for a bit?'},{from:'character',narration:'She smiled.'}]};
 assert.equal(applyFinalScene(scene,{userText:room}).scene.location,'the living room');
 assert.equal(publicThread(livingRoom).location,'the living room');
 const background=planLiveArt(livingRoom,config,'test').assets[0];
 assert.match(background.positive,/living room.*Victorian decor/);
 assert.doesNotMatch(background.positive,/garden/i);
});
test('explicit story night survives warm room lighting and clears after a later daytime change',()=>{
 const arrival='[action: we are in the living room]';
 const scene={...thread.scene,location:'the living room',lighting:'ambient light',locationEvidence:{source:'user',text:arrival}};
 const messages=[{from:'user',text:arrival},
  {from:'user',text:"[action: It's nighttime. The soft, warm lighting fills the living room.]"},
  {from:'character',narration:'The warm ambient light caught the edge of the glass. "I wish it was morning already."'}];
 const getBackground=messages=>planLiveArt({...thread,scene,messages},config,'test').assets[0];
 const night=getBackground(messages);
 assert.match(night.positive,/nighttime:1\.35.*dark outside.*warm ambient light/);
 assert.match(night.negative,/daytime, sunlight, daylight/);
 const day=getBackground([...messages,{from:'user',text:"[action: It's morning now. Bright sunlight spills across the room.]"}]);
 assert.match(day.positive,/morning.*natural daylight.*Bright sunlight/i);
 assert.doesNotMatch(day.positive,/nighttime|dark outside/);
 assert.doesNotMatch(day.negative,/sunlight|daylight/);
 assert.notEqual(day.key,night.key);
});
test('a narrated morning time skip replaces stale moonlight in the same room',()=>{
 const arrival='[action: we are in the bedroom]';
 const scene={...thread.scene,location:'the bedroom',environment:'linen curtains, moonlight illuminates the bedroom',
  lighting:'moonlight',locationEvidence:{source:'user',text:arrival},verification:{pending:['lighting']}};
 const messages=[{from:'user',text:arrival},{from:'user',text:"[action: it's nighttime.]"}];
 const background=entries=>planLiveArt({...thread,scene,messages:entries},config,'test').assets[0];
 const question=background([...messages,{from:'user',text:'[action: The next morning?]'}]);
 assert.match(question.positive,/nighttime:1\.35/);
 const morning=background([...messages,
  {from:'user',text:'[action: morning comes and the light filters through her curtains]'},
  {from:'character',narration:'The soft, golden light of a Wednesday morning filtered through the curtains.'},
  {from:'user',text:'Good morning!'},
  {from:'character',narration:'The sunlight continued to filter through the curtains.'},
 ]);
 assert.match(morning.positive,/bedroom.*linen curtains.*morning.*golden light/i);
 assert.doesNotMatch(morning.positive,/moonlight|nighttime|dark outside/);
 assert.match(morning.negative,/nighttime, moonlight, dark outside/);
 assert.doesNotMatch(morning.negative,/sunlight|daylight/);
 assert.notEqual(morning.key,question.key);
});
test('background prompts filter anatomy negatives and allow pedestrians only with scene evidence',()=>{
 const options={...config,globalNegativePrompt:'blurry, bad anatomy, extra limbs, hands, pubic hair, 1girl, text'};
 const background=(scene)=>planLiveArt({...thread,scene:{...thread.scene,...scene}},options,'test').assets[0];
 const bedroom=background({location:'home',environment:'bedroom with freshly changed sheets'});
 assert.match(bedroom.positive,/empty bedroom interior, interior architecture, environment concept art, wide room view from the doorway.*freshly changed sheets/);
 assert.match(bedroom.negative,/person, people, crowd/);
 assert.doesNotMatch(bedroom.negative,/anatomy|limbs|hands|hair/);
 assert.doesNotMatch(bedroom.positive,/no humans/);
 assert.match(bedroom.negative,/1girl, 1boy, solo/);
 assert.match(bedroom.negative,/blurry/);
 const street=background({location:'main street',environment:'pedestrians on the far sidewalk'});
 assert.match(street.positive,/distant background figures/);
 assert.doesNotMatch(street.positive,/no humans/);
 assert.doesNotMatch(street.negative,/1girl|1boy|solo/);
 assert.doesNotMatch(street.negative,/(?:^|, )(?:people|crowd|person)(?:,|$)/);
 const emptyStreet=background({location:'main street',environment:'deserted street, no pedestrians'});
 assert.match(emptyStreet.positive,/unoccupied setting/);
});
test('generic bedroom wording matches the room-first preview',()=>{
 const scene={...thread.scene,location:'bedroom',environment:'A bedroom with a bed and covers.',lighting:'soft glow'};
 const background=planLiveArt({...thread,scene},config,'test').assets[0];
 assert.match(background.positive,/score_8, empty bedroom interior, interior architecture, environment concept art, wide room view from the doorway, bed with neatly arranged covers, soft glow$/);
});
test('a narrated cabin arrival recovers pending location and keeps fresh interior details',()=>{
 const scene={...thread.scene,location:'Lon Lon Ranch',environment:'Open green fields with a view of Death Mountain.',verification:{pending:['location','environment','activity']}};
 const messages=[
  {from:'user',text:'[action: we step inside the rustic, homey space]'},
  {from:'character',narration:'She followed him inside as they entered the small cabin. The interior had cedar walls, with golden sunlight streaming through the window.'},
  {from:'user',text:'This will do nicely.'},
  {from:'character',narration:'She smiled and nodded.'},
 ];
 const saved={...thread,scene,messages};
 const plan=planLiveArt(saved,config,'test');
 assert.match(plan.assets[0].positive,/indoor interior view.*small cabin.*cedar walls.*sunlight/i);
 assert.doesNotMatch(plan.assets[0].positive,/Death Mountain|green fields/);
 assert.equal(publicThread(saved).location,'the small cabin');
 assert.equal(saved.scene.location,'Lon Lon Ranch');
 const onRanch={...saved,messages:[{from:'character',narration:'She guided him across the ranch grounds toward the outbuilding.'},...messages]};
 assert.equal(publicThread(onRanch).location,'Cabin at Lon Lon Ranch');
 assert.equal(planLiveArt(onRanch,config,'test').assets[0].key,plan.assets[0].key);
 const proposal={...saved,messages:[{from:'user',text:'Shall we go inside?'},{from:'character',narration:'She thought they might enter the small cabin later.'}]};
 assert.match(planLiveArt(proposal,config,'test').waiting,/verify.*location/);
});
