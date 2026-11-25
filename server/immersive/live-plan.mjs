import { createHash } from 'node:crypto';
import { buildImagePrompt } from '../identity.mjs';
import { characterImageOutputFolder } from '../comfy.mjs';
import { pendingSceneFields } from '../scene-verification.mjs';
import { backgroundGrounding } from './background-grounding.mjs';
import { foregroundPose } from './foreground-pose.mjs';
import { threadForOwnConversation } from '../conversation-scene.mjs';
import { declaredSharedLocation, directedSceneLocation, explicitSeatingAction, isGenericHomeLocation, narratedCurrentLocation } from '../final-scene.mjs';
import { hasDifferentCurrentPlace } from '../scene-reconciliation.mjs';
import { evaluateSceneTurnV2 } from '../scene-events-v2.mjs';
import { inferEnvironmentCue } from '../environment.mjs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
export function foregroundLighting(value){
  return [...new Set(clean(value).match(/\b(?:bright|warm|cool|soft|dim|morning|afternoon|evening|night|sunlight|daylight|moonlight|candlelight)\b/gi)||[])].map(word=>({moonlight:'cool light',night:'dim light'}[word.toLowerCase()]||word)).join(' ');
}
// Carry only a short gaze cue, not the surrounding narrative or scenery.
export function foregroundGaze(scene,clauses=[],characterName='') {
  const classify=value=>{
    const text=clean(value);
    if(/\b(?:closed?|closing|shut|shutting)\s+(?:(?:her|his|their)\s+)?eyes\b|\beyes\s+(?:(?:are|were)\s+)?closed\b/i.test(text))return 'closed eyes';
    if(/\b(?:looks?|looked|looking|gazes?|gazed|gazing|glances?|glanced|glancing|stares?|stared|staring)\s+(?:(?:directly|back|briefly)\s+)?(?:at|towards?|into)\s+(?:you|the viewer|the user|him|her)\b|\beye contact\b/i.test(text))return 'looking at viewer';
    const direction=text.match(/\b(?:look(?:s|ed|ing)?|gaz(?:e|es|ed|ing)|glanc(?:e|es|ed|ing))\s+(away\b|upwards?\b|skyward\b|downwards?\b|(?:up|down)\b(?!\s+(?:at|towards?|to)\b))/i)?.[1].toLowerCase();
    if(direction==='away'||/\b(?:avert(?:s|ed|ing)?\s+(?:her|his|their)\s+(?:eyes|gaze)|(?:turns?|turned|turning)\s+(?:her|his|their)\s+(?:head|face)\s+away)\b/i.test(text))return 'looking away';
    if(direction)return /^(?:up|skyward)/.test(direction)?'looking up':'looking down';
    return '';
  };
  for(const clause of [...clauses].reverse()){
    // User actions and another person's gaze must not pose the host.
    let text=clean(clause.text);
    const name=clean(characterName),parts=name.split(/\s+/);
    const aliases=[name,parts[0],parts.at(-1)].filter(n=>n&&n.length>2&&!/^(?:the|princess|queen|king|lady|doctor)$/i.test(n));
    const subject=aliases.find(n=>text.toLowerCase().startsWith(n.toLowerCase()+' '));
    if(subject)text='She '+text.slice(subject.length+1);
    if(!/^(?:she|he|they|her (?:eyes|gaze)|his (?:eyes|gaze)|their (?:eyes|gaze))\b/i.test(text))continue;
    const cue=classify(text);if(cue)return cue;
  }
  return classify(scene.expression)||(scene.presence==='apart'?'':'looking at viewer');
}
export function foregroundStaging(scene,clauses=[]) {
  const sources=[clean(scene.activity),...clauses.map(c=>c.text)].reverse();
  if(scene.posture==='seated'){
    for(const source of sources){const match=source.match(/\b(?:sat|seated|sitting|settled|slid|sank)\b[^.!?]{0,85}\b(booth|bench|chair|stool|sofa|couch)\b/i);if(match)return 'seated on a '+match[1].toLowerCase()+' seat';}
  }
  if(scene.posture==='lying'){
    for(const source of sources){const match=source.match(/\b(?:lying|lay|reclined|reclining)\b[^.!?]{0,70}\b(bed|sofa|couch|cushion)\b/i);if(match)return 'lying on a '+match[1].toLowerCase();}
  }
  for(const source of sources){const match=source.match(/\blean(?:ing|ed|s)?\s+(against|on)\s+(?:(?:the|a|an)\s+)?(fence|railing|counter|table|wall)\b/i);if(match)return 'leaning '+match[1].toLowerCase()+' a '+match[2].toLowerCase();}
  return '';
}
const staging=message=>clean(message.narration||message.text)
  .replace(/“[^”]*”|"[^"]*"/g,' ')
  .replace(/\bat\s+(?:him|her|them|me|us|you)\b/gi,'');

function narratedArrival(scene, messages) {
  if (messages.at(-1)?.from !== 'character') return null;
  for (const [index, message] of [...messages.entries()].reverse()) {
    if (message.from === 'character' && !message.narration) continue;
    const text = staging(message);
    const turn = message.from === 'user' ? { userText: text } : { characterText: text };
    const move = evaluateSceneTurnV2(scene, turn).candidates.findLast(event =>
      ['arrive', 'depart'].includes(event.kind) && event.actorIds.includes('character') &&
      event.temporal === 'current' && event.modality === 'asserted');
    if (!move) continue;
    if (message.from !== 'character' || move.kind !== 'arrive' || move.validation.status !== 'accepted') return null;
    const location = move.payload.label;
    const clauses = text.match(/[^.!?;]+[.!?;]?/g) || [];
    const arrival = clauses.findIndex(clause => clause.toLowerCase().includes(location.toLowerCase()));
    if (arrival < 0) return null;
    // A solo move in the narration can leave the user behind. Only recover a
    // pending shared location when the arrival itself includes both of them.
    const sharedArrival = /\b(?:they|we)\s+(?:(?:both|finally|then|now)\s+)*(?:enter(?:ed|s)?|arriv(?:e[sd]?)|reach(?:ed|es)?|(?:stepp?ed|steps?|walk(?:ed|s)?|went|go(?:es)?|mov(?:ed|es?))\s+(?:inside|into|through))\b/i;
    if (!move.actorIds.includes('user') && !sharedArrival.test(clauses[arrival])) return null;
    const ranchCabin = /\branch$/i.test(clean(scene.location)) && /\bcabin\b/i.test(location) &&
      messages.slice(Math.max(0, index - 6), index + 1).some(entry =>
        /\b(?:across|through) (?:the )?ranch grounds\b|\b(?:the )?ranch['’]s outbuildings?\b/i.test(staging(entry)));
    return { location, environment: inferEnvironmentCue(clauses.slice(arrival).join(' ')),
      ...(ranchCabin ? { locationLabel: `Cabin at ${clean(scene.location)}` } : {}),
      locationEvidence: { source: 'character', kind: 'final_scene', text: location } };
  }
  return null;
}

function recoverNarratedLocation(scene, messages, characterName) {
  if(messages.at(-1)?.from!=='character')return null;
  for(const message of messages.toReversed()){
    if(message.from==='character'&&message.narration){
      const place=narratedCurrentLocation({characterText:message.narration,characterName,allowUnnamedCharacter:scene.presence==='apart'});
      if(place)return {location:place.value,environment:place.environment,
        locationEvidence:{source:place.source,kind:'final_scene',text:place.quote}};
    }
    const text=staging(message);
    const turn=message.from==='user'?{userText:text}:{characterText:text};
    if(evaluateSceneTurnV2(scene,turn).accepted.some(event=>
      ['arrive','depart'].includes(event.kind)&&event.actorIds.includes('character')))return null;
  }
  return null;
}

export function resolveImmersiveScene(thread) {
  let pending = pendingSceneFields(thread.scene);
  let locationLabel;
  const scene = { ...thread.scene };
  const messages=(thread.messages||[]).filter(message=>['user','character'].includes(message.from)
    &&(message.from==='user'||message.narration||!(message.imageJobId||message.image||message.imageUrl))
    &&(!message.speakerId||message.speakerId===thread.character?.id)&&clean(message.narration||message.text));
  if (['together','apart'].includes(scene.presence) && !pending.includes('presence')) {
    const proof=scene.locationEvidence;
    const checkpoint=proof?.text?messages.findLastIndex(message=>message.from===proof.source&&
      clean(message.narration||message.text).includes(clean(proof.text))):-1;
    // An older specific place cannot replace a newer verified arrival, even
    // when that arrival uses a generic label such as "her home".
    const declarationFor=(message,position)=>(
      (position>=messages.length-12 ? directedSceneLocation({userText:message.text}) : null) ||
      (scene.presence==='together' ? declaredSharedLocation({userText:message.text}) : null)
    );
    const index=messages.findLastIndex((message,position)=>(position>checkpoint||
      (position===checkpoint&&pending.includes('location')))&&message.from==='user'&&
      declarationFor(message,position));
    const declared=index>=0?declarationFor(messages[index],index):null;
    const recover=pending.includes('location') ||
      (isGenericHomeLocation(scene.location)&&!isGenericHomeLocation(declared?.value)) ||
      (checkpoint>=0&&index>checkpoint);
    if (declared && recover && messages.at(-1)?.from==='character' &&
        !messages.slice(index+1).some(message=>{
          const text=staging(message);
          const turn=message.from==='user'?{userText:text}:{characterText:text};
          return evaluateSceneTurnV2({location:declared.value,presence:'together'},turn).accepted.some(event=>
            ['arrive','depart'].includes(event.kind)&&event.actorIds.includes('character')&&
            hasDifferentCurrentPlace({location:declared.value},{latestExchange:{[message.from]:`in ${event.payload.label}`}}));
        })) {
      const surroundings=scene.environmentEvidence;
      const describedInSameMove=surroundings?.source==='user'&&clean(surroundings.text)&&
        clean(messages[index].text).includes(clean(surroundings.text));
      const changed=clean(scene.location).toLowerCase()!==clean(declared.value).toLowerCase();
      if(changed&&!describedInSameMove)scene.environment='';
      if(changed&&declared.actor==='character'){
        scene.activity='';
        scene.posture='unknown';
        scene.lighting='';
      }
      scene.location=declared.value;
      scene.characterLocation=declared.value;
      scene.locationEvidence={source:'user',kind:'final_scene',text:declared.quote};
      if(declared.environment){
        scene.environment=declared.environment;
        if(scene.verification?.omitted?.includes('environment')){
          scene.verification={...scene.verification,omitted:scene.verification.omitted.filter(field=>field!=='environment')};
        }
      }
      pending=pending.filter(field=>field!=='location'&&!(field==='environment'&&declared.environment));
    }
    if (pending.includes('location')) {
      const recent=messages.slice(Math.max(checkpoint + 1, messages.length - 12));
      const arrival = (scene.presence==='together' ? narratedArrival(scene,recent) : null)
        || recoverNarratedLocation(scene,recent,thread.profile?.name||thread.character?.name);
      if (arrival) {
        locationLabel = arrival.locationLabel;
        const samePlace = clean(scene.location).toLowerCase() === clean(arrival.location).toLowerCase();
        scene.location = arrival.location;
        scene.characterLocation = arrival.location;
        scene.locationEvidence = arrival.locationEvidence;
        scene.environment = arrival.environment || (samePlace ? scene.environment : '');
        pending = pending.filter(field => field !== 'location' && !(field === 'environment' && arrival.environment));
        if (arrival.environment && scene.verification?.omitted?.includes('environment')) {
          scene.verification = { ...scene.verification, omitted: scene.verification.omitted.filter(field => field !== 'environment') };
        }
      }
    }
  }
  return {scene,pending,messages,locationLabel:locationLabel||scene.location};
}

export function planLiveArt(thread, config, workflowSignature) {
  thread=threadForOwnConversation(thread);
  if (!thread?.profile || !thread.storageInstanceId) return { waiting:'Finish the character setup before starting artwork.' };
  if (thread.firstContact?.status === 'preview') return { waiting:'Start the conversation in AniMessenger first.' };
  if (thread.guest?.activeGuest || thread.guestSession?.activeGuest || thread.cameo?.activeGuest) return { waiting:'Guest artwork is not connected in this first live test.' };
  let {scene,pending,messages}=resolveImmersiveScene(thread);
  const recent=messages.slice(-12);
  const requiredPending=pending.filter(field => ['location','presence'].includes(field));
  if (requiredPending.length) return { waiting:'Waiting for the conversation to verify the character’s '+requiredPending.join(', ')+'.' };
  // Keep the saved outfit for presentation while wardrobe verification catches
  // up. buildImagePrompt uses the profile wardrobe if there is no saved outfit.
  for (const field of [...pending, ...(scene.verification?.omitted || [])]) {
    if (field !== 'outfit') delete scene[field];
  }
  if ((!scene.posture || scene.posture==='unknown') && recent.at(-1)?.from==='character') {
    for (const message of recent.toReversed()) {
      const text=staging(message);
      // A prior pose cannot carry across a move to another setting.
      if(hasDifferentCurrentPlace(scene,{latestExchange:{[message.from]:text}}))break;
      const evidence=evaluateSceneTurnV2(scene,message.from==='user'?{userText:text}:{characterText:text})
        .accepted.findLast(event=>event.kind==='set_posture'&&event.actorIds.includes('character'));
      const explicitSeating=message.from==='user'&&scene.presence==='together'&&
        explicitSeatingAction(message.text,thread.profile?.name||thread.character?.name);
      if(!explicitSeating&&!evidence)continue;
      scene.posture=explicitSeating?'seated':evidence.payload.posture;
      pending=pending.filter(field=>field!=='posture');
      break;
    }
  }
  if(scene.presence==='apart'){
    // Older world-link openings stored the character's realm in location,
    // before characterLocation existed. Recover only the untouched opening.
    const opening=thread.firstContact;
    const dialogue=(thread.messages||[]).filter(m=>m.from==='character'&&(!m.speakerId||m.speakerId===thread.character?.id)&&!m.imageUrl&&!m.image&&clean(m.narration||m.text));
    if(!clean(scene.characterLocation)&&opening?.status==='started'&&opening.contactMode==='world_link'
      &&opening.scene?.presence==='apart'&&clean(scene.location)===clean(opening.scene.location)
      &&!(thread.messages||[]).some(m=>m.from==='user')&&dialogue.length===1
      &&clean(dialogue[0].text)===clean(opening.openingLine)&&clean(opening.openingLine))scene.characterLocation=scene.location;
    if(!clean(scene.characterLocation))return {waiting:'Waiting for the character’s current location before preparing artwork.'};
    if(clean(scene.location).toLowerCase()!==clean(scene.characterLocation).toLowerCase())scene.environment='';
    scene.location=scene.characterLocation;
  }
  if (!clean(scene.location)) return { waiting:'The conversation has not established a setting yet.' };
  const identity = { instance:thread.storageInstanceId, character:thread.character, visual:thread.profile.visual, imageIdentity:thread.profile.imageIdentity };
  const common = { version:3, workflowSignature, model:config.comfyDiffusionModel, negative:config.globalNegativePrompt };
  const assets = [];
  const grounding=backgroundGrounding(thread,scene);
  const outputFolder = `${characterImageOutputFolder(thread)}/Immersive`;
  const presentationScene={...scene};
    const occupancy=grounding.ambientPeople
      ?'(environment as the main subject:1.3), distant background figures, tiny passersby far from the camera, clear foreground'
      :'(no humans:1.3), scenery only, unoccupied setting';
    const privateInterior = grounding.privateSetting && grounding.viewpoint !== 'exterior';
    const bedroom = /\bbedroom\b/i.test(`${grounding.location} ${grounding.environment}`);
    const genericBedding = /^(?:a |the )?bedroom with (?:a )?bed and covers[.!]?$/i.test(grounding.environment);
    const backgroundSetting = privateInterior ? [
      bedroom ? 'empty bedroom interior' : 'empty private interior',
      'interior architecture, environment concept art',
      bedroom ? 'wide room view from the doorway' : 'wide room view',
      /^(?:the )?bedroom$/i.test(grounding.location) ? '' : grounding.location,
      genericBedding ? 'bed with neatly arranged covers' : grounding.environment,
    ] : [grounding.framing, 'detailed anime scenery, wide landscape composition, eye-level viewpoint', occupancy, grounding.location, grounding.environment];
    const backgroundPrompt = ['masterpiece, best quality, amazing quality, very aesthetic, absurdres, newest, highres, year 2025, score_9, score_8', ...backgroundSetting, grounding.lighting].filter(Boolean).join(', ');
    const characterNegative=/\b(?:anatomy|limbs?|hands?|fingers?|digits?|toes?|feet|face|eyes?|hair|bodies|body|people|persons?|humans?|girls?|boys?|crowds?|pedestrians?|solo|[1-9](?:girl|boy)s?)\b/i;
    const backgroundNegatives=String(config.globalNegativePrompt||'').split(',').map(clean)
      .filter(tag=>tag&&!characterNegative.test(tag));
    const backgroundNegative=[...new Set([...backgroundNegatives,...grounding.negative.split(', ').filter(Boolean),
      ...(grounding.ambientPeople?['portrait','close-up','(foreground person:1.4)','large figure','character focus']:['person','people','crowd','1girl','1boy','solo',
        ...(grounding.privateSetting?['(human figure:1.5)','person in reflection','human silhouette']:[])]),'text','watermark'])].join(', ');
    assets.push({kind:'background',key:hash([common,identity.instance,'background',backgroundPrompt,backgroundNegative]),positive:backgroundPrompt,negative:backgroundNegative,width:1536,height:864,outputFolder});
    // Pose changes affect the foreground, not whether the scene is layered.
    const characterName=thread.character?.displayName||thread.character?.name;
    const support=pending.includes('posture')?'':foregroundStaging(presentationScene,grounding.clauses);
    const pose=foregroundPose(presentationScene,messages,{characterName,pronouns:thread.profile.socialIdentity?.pronouns,support,traits:thread.profile.persona?.traits});
    const foregroundScene = { ...presentationScene, location:'', environment:'', activity:'', expression:pose.expression, lighting:foregroundLighting(scene.lighting), presence:'together' };
    const latestHost=(thread.messages||[]).findLast(m=>m.from==='character'&&(!m.speakerId||m.speakerId===thread.character?.id));
    const gaze=foregroundGaze(scene,grounding.clauses.filter(c=>c.sourceMessageId===latestHost?.id),characterName);
    const framing=[support,pose.direction,gaze].filter(Boolean).join(', ');
    const characterPrompt=buildImagePrompt(thread.profile,thread.character,foregroundScene,framing,{preserveCharacterTraits:true,userName:config.userName}).replace(/\bsolo focus, /g,'');
    const foregroundPrompt = ['(transparent background:1.3)',config.globalPositivePrompt,'solo, medium shot, '+characterPrompt].filter(Boolean).join('\n\n');
    // Bare "hands" suppresses the feature the sprite must retain. Preserve
    // specific anatomy negatives and leave the user's global config unchanged.
    const foregroundNegative=[...String(config.globalNegativePrompt||'').split(',').map(clean).filter(tag=>tag&&!/^(?:hands?|first[- ]person view)$/i.test(tag)),'multiple people, duplicate person, pov, pov hands, pov crotch, scenery, crowd, background people, cropped, out of frame, full body, close-up, text, watermark'].join(', ');
    assets.push({kind:'foreground',key:hash([common,identity,'foreground',foregroundPrompt,foregroundNegative,1536,1536]),positive:foregroundPrompt,negative:foregroundNegative,width:1536,height:1536,outputFolder});
  return { mode:'layered', key:hash(assets.map(a=>a.key)),instance:thread.storageInstanceId,assets };
}
