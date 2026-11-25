const text=value=>String(value||'').replace(/\s+/g,' ').trim();

// An accepted opening remains this conversation's starting scene until its own
// dialogue advances. A visit in somebody else's chat is separate continuity.
export function conversationScene(thread={}) {
  const opening=thread.firstContact;
  if(thread.ownSceneEstablished||opening?.status!=='started'||!text(opening.scene?.location)||thread.cameo?.activeGuest)return thread.scene;
  const messages=thread.messages||[];
  if(messages.some(m=>m.from==='user'))return thread.scene;
  const dialogue=messages.filter(m=>m.from==='character'&&(!m.speakerId||m.speakerId===thread.character?.id)&&!m.imageUrl&&!m.image&&text(m.narration||m.text));
  if(dialogue.length!==1||text(dialogue[0].text)!==text(opening.openingLine)||!text(opening.openingLine))return thread.scene;
  return {...structuredClone(opening.scene),revision:thread.scene?.revision||0};
}

export function threadForOwnConversation(thread) {
  if(!thread)return thread;
  const scene=conversationScene(thread);
  return scene===thread.scene?thread:{...thread,scene,ownSceneEstablished:true};
}

const hostId=host=>host.id||host.character?.id;
function matchesHost(context,host){
  return Boolean(context&&hostId(host))&&context.hostThreadId===hostId(host)
    && (context.hostStorageInstanceId||null)===(host.storageInstanceId||null);
}

export function guestSceneForHost(thread,host) {
  const contexts=Array.isArray(thread?.guestSceneContexts)?thread.guestSceneContexts:[];
  return contexts.findLast(context=>matchesHost(context,host))?.scene||thread?.scene;
}

export function recordGuestScene(thread,host,scene) {
  const contexts=(Array.isArray(thread.guestSceneContexts)?thread.guestSceneContexts:[]).filter(context=>context&&!matchesHost(context,host)).slice(-7);
  return {
    ...threadForOwnConversation(thread),
    guestSceneContexts:[...contexts,{
      hostThreadId:hostId(host),hostStorageInstanceId:host.storageInstanceId||null,
      scene:structuredClone(scene),
    }],
  };
}
