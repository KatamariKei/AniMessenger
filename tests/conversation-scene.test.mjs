import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationScene,threadForOwnConversation,guestSceneForHost,recordGuestScene} from '../server/conversation-scene.mjs';
import {resumeCameoSession} from '../server/guest-cameo.mjs';

const opening={location:'Intercity Bus Terminal',outfit:'white dress with a ribbon',lighting:'sunset',presence:'together'};
const guest={id:'guest',character:{id:'guest',name:'Guest'},scene:{location:'Stray Sheep',outfit:'guest outfit',revision:53,verification:{pending:['location']}},firstContact:{status:'started',openingLine:'Going somewhere?',scene:opening},messages:[{id:'opening',from:'character',text:'Going somewhere?'},{id:'photo',from:'character',imageUrl:'/opening.png'}],memories:[{text:'Met the user at the Stray Sheep.'}],relationship:21};
const host={id:'host',storageInstanceId:'host-instance-a',character:{id:'host',name:'Host'},scene:{location:'Stray Sheep'},profile:{name:'Host'},messages:[],cameo:{activeGuest:{characterId:'guest',joinedAtMessageId:'joined'}}};

test('an untouched accepted opening overrides guest staging without deleting memories',()=>{
 const before=structuredClone(guest),own=threadForOwnConversation(guest);
 assert.equal(own.scene.location,'Intercity Bus Terminal');assert.equal(own.scene.outfit,opening.outfit);
 assert.equal(own.scene.verification,undefined);assert.equal(own.scene.revision,53);
 assert.deepEqual(own.memories,guest.memories);assert.equal(own.relationship,21);assert.deepEqual(guest,before);
});

test('own dialogue, later host messages, previews and active host cameos are never rewound',()=>{
 for(const sample of [
  {...guest,messages:[...guest.messages,{from:'user',text:'Hello'}]},
  {...guest,messages:[...guest.messages,{from:'character',text:'A later scene'}]},
  {...guest,firstContact:{...guest.firstContact,status:'preview'}},
  {...guest,cameo:{activeGuest:{characterId:'another'}}},
  {...guest,firstContact:undefined},
 ])assert.strictEqual(conversationScene(sample),sample.scene);
});

test('explicit appearance edits after restoring an opening survive subsequent reads and guest visits',()=>{
 const restored=threadForOwnConversation(guest);
 const edited={...restored,scene:{...restored.scene,outfit:'green jacket'}};
 assert.strictEqual(threadForOwnConversation(edited),edited);
 const revisited=recordGuestScene(edited,host,{location:'Stray Sheep',outfit:'guest outfit'});
 assert.equal(revisited.scene.location,'Intercity Bus Terminal');assert.equal(revisited.scene.outfit,'green jacket');
 assert.equal(guest.firstContact.scene.outfit,opening.outfit);
});

test('guest updates preserve solo opening and retain shared memories and progression',()=>{
 const shared={location:'Stray Sheep',outfit:'blue jacket',posture:'seated'};
 const saved=recordGuestScene(guest,host,shared);
 assert.equal(saved.scene.location,'Intercity Bus Terminal');
 assert.deepEqual(saved.memories,guest.memories);assert.equal(saved.relationship,guest.relationship);
 assert.deepEqual(guestSceneForHost(saved,host),shared);
 shared.outfit='changed elsewhere';assert.equal(guestSceneForHost(saved,host).outfit,'blue jacket');
});

test('established solo scenes remain intact when their characters visit another chat',()=>{
 const own={...guest,messages:[...guest.messages,{from:'user',text:'Let us stay at the terminal.'}],scene:opening};
 const saved=recordGuestScene(own,host,{location:'Stray Sheep'});
 assert.strictEqual(saved.scene,own.scene);assert.equal(guestSceneForHost(saved,host).location,'Stray Sheep');
});

test('guest scene contexts are isolated by host and recreated host instance',()=>{
 const other={...host,id:'other',storageInstanceId:'other-instance'};
 const saved=recordGuestScene(recordGuestScene(guest,host,{location:'Bar'}),other,{location:'Library'});
 assert.equal(guestSceneForHost(saved,host).location,'Bar');assert.equal(guestSceneForHost(saved,other).location,'Library');
 assert.equal(guestSceneForHost(saved,{...host,storageInstanceId:'replacement'}).location,'Intercity Bus Terminal');
 assert.equal(guestSceneForHost({...saved,guestSceneContexts:{}},host).location,'Intercity Bus Terminal');
});

test('actual cameo resume uses guest context, not the protected solo opening',()=>{
 const saved=recordGuestScene(guest,host,{location:'Stray Sheep',outfit:'blue jacket',expression:'smiling'});
 const session=resumeCameoSession({hostThread:host,guestCharacter:guest.character,guestProfile:{name:'Guest',visual:{}},guestThread:saved});
 assert.equal(session.guest.scene.outfit,'blue jacket');assert.equal(session.guest.scene.location,'Stray Sheep');
 assert.equal(saved.scene.location,'Intercity Bus Terminal');
});

test('guest contexts remain bounded while replacing the current host context',()=>{
 let saved=guest;
 for(let i=0;i<12;i++)saved=recordGuestScene(saved,{...host,id:'host-'+i,storageInstanceId:'instance-'+i},{location:'Room '+i});
 assert.equal(saved.guestSceneContexts.length,8);
 saved=recordGuestScene(saved,{...host,id:'host-11',storageInstanceId:'instance-11'},{location:'Updated room'});
 assert.equal(saved.guestSceneContexts.length,8);assert.equal(saved.guestSceneContexts.at(-1).scene.location,'Updated room');
});
