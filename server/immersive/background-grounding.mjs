// Resolve presentation framing from visible, current-place narration. This
// never writes scene state or asks a model to invent environmental details.
import {environmentForLocation} from '../environment.mjs';

const text=value=>String(value||'').replace(/\s+/g,' ').trim();
const normalized=value=>text(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const dialogue=value=>value.replace(/“[^”]*”|"[^"]*"/g,' ');
const sceneryText=value=>text(value).replace(/\b(?:her|his|their|our|my|your|its)\s+/gi,'');
const futureOrMemory=/\b(?:imagined?|remember(?:ed|s)?|recall(?:ed|s)?|dream(?:ed|s)?|would|could|might|pretend|plan(?:ned|s)?|want(?:ed|s)?|hope(?:d|s)?|should|shall|will|going to|let['’]?s)\b/i;
const outside=/\b(?:is|are|am|was|were|stood|standing|stands?|waited|waiting|stopped|stop|paused|remain(?:ed|s)?)\b(?:\s+(?:still|now|right|just|ready|quietly|patiently|together|here|there))*\s+(?:outside|out front|in front of (?:the|an?|this) (?:caf[eé]|coffee shop|establishment|building|entrance)|at (?:the|its) entrance|on (?:the|a) (?:patio|terrace))\b|\b(?:admire|admired|admiring)\b[^.!?]{0,35}\b(?:facade|façade|exterior)\b/i;
const inside=/\benter(?:ed|s)?\s+(?:(?:the|a|this)\s+)?(?:caf[eé]|coffee shop|establishment|building|room|shop|restaurant)\b|\b(?:stepp?ed|steps?|walk(?:ed|s)?|went|go(?:es)?|mov(?:ed|es?))\s+inside\b|\b(?:we|they|she|he|i|you)\s+(?:are|is|was|were|remain(?:ed|s)?)\s+(?:now\s+)?inside\b/i;
const explicitTime=/\b(?:it (?:is|was)(?: now)?|now)\s+(?:already\s+)?(?:the\s+)?(nighttime|night|midnight|daytime|morning|noon|afternoon|evening|twilight|dusk|dawn)\b/i;
const timeSkip=/^\s*(?:\[action:\s*)?(?:(?:the\s+)?(morning|dawn|evening|dusk|night)\s+(?:comes?|came|has come|arrives?|arrived|breaks?|broke|falls?|fell|sets? in)\b|(?:the\s+)?(?:next|following)\s+(morning|afternoon|evening|night)\b)/i;
const ambientTime=/\b(twilight|dusk|dawn)\b(?=\s+(?:light|sky|deepened|settled|fell|broke)\b)|\b(?:at|into|in)\s+(?:the\s+)?(twilight|dusk|dawn)\b/i;
const lightQuality=/\b(?:soft|warm|cool|dim|bright|golden)(?:[\s,]+(?:and\s+)?(?:soft|warm|cool|dim|bright|golden|ambient|morning|afternoon|evening)){0,3}\s+(?:lighting|light|glow|sunlight|daylight|lamplight)\b/i;
const nightTime=/^(?:nighttime|night|midnight)$/i;
const dayTime=/^(?:daytime|morning|noon|afternoon)$/i;
const nightLight=/\b(?:moonlight|moonlit|nighttime|midnight|night sky|dark outside)\b/i;
const dayLight=/\b(?:daylight|sunlight|sunlit|daytime|morning light|bright blue sky)\b/i;
const barVenue=/\b(?:bar|pub|tavern)\b/i;
const localBarDetails=/\b(?:behind|inside|through|around|across|rest of|noise of|air of|patrons (?:at|in|of))\s+(?:the|this)\s+(?:bar|pub|tavern)\b|\b(?:mahogany bar counter|back[- ]bar shelving)\b/i;
const isSceneMessage=(message,characterId)=>(message.from==='user'||(message.from==='character'&&message.narration))
  &&(!message.speakerId||message.speakerId===characterId);

function namedBarVenue(messages,location,characterId){
  const name=location.replace(/^the\s+/i,'').replace(/[’]/g,"'").replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!name)return false;
  const label=new RegExp(`(?<![\\p{L}\\p{N}])${name}\\s+(?:bar|pub|tavern)\\b`,'iu');
  return messages.some(message=>isSceneMessage(message,characterId)&&
    (dialogue(text(message.narration||message.text)).replace(/[’]/g,"'").match(/[^.!?]+[.!?]?/g)||[])
      .some(sentence=>!sentence.endsWith('?')&&!futureOrMemory.test(sentence)&&label.test(sentence)));
}

function currentTimeCue(sentence,pattern){
  if(/\b(?:yesterday|last night|earlier|not yet)\b/i.test(sentence))return '';
  const cue=pattern.exec(sentence);
  if(!cue||/\b(?:no|not|without)\s+(?:the\s+)?$/i.test(sentence.slice(0,cue.index)))return '';
  return (cue[1]||cue[2]).toLowerCase();
}

export function backgroundGrounding(thread,scene){
  const location=text(scene.location),placeKey=normalized(location);
  const garden=/\bgardens?$/i.test(location);
  const outdoorGarden=garden&&!/\b(?:indoor|interior|enclosed|greenhouse)\b/i.test(location+' '+text(scene.environment));
  const evidence=scene.locationEvidence;
  const messages=thread.messages||[];
  let checkpoint=-1;
  // Only follow a location checkpoint that actually names the current place.
  if(evidence?.text&&placeKey&&normalized(evidence.text).includes(placeKey)){
    for(let i=messages.length-1;i>=0;i--)if(messages[i].from===evidence.source&&normalized(messages[i].narration||messages[i].text).includes(normalized(evidence.text))){checkpoint=i;break;}
  }
  let viewpoint=/\b(?:exterior|outdoors|outside)\b/i.test(scene.environment||'')?'exterior':/\b(?:interior|indoors|inside)\b/i.test(scene.environment||'')?'interior':null;
  const savedLighting=text(scene.lighting);
  let timeOfDay=savedLighting.match(/\b(nighttime|midnight|twilight|dusk|dawn|daytime)\b/i)?.[1]||'';
  let explicitSceneTime=false;
  let sourceMessageId=null,lighting='';const clauses=[];
  const scope=checkpoint>=0?messages.slice(checkpoint):messages.slice(-2);
  for(const message of scope){
    if(!isSceneMessage(message,thread.character?.id))continue;
    const visible=dialogue(text(message.narration||message.text)).replace(/\b(we|they|you)['’]re\b/gi,'$1 are').replace(/\bi['’]m\b/gi,'I am').replace(/\b(she|he|it)['’]s\b/gi,'$1 is');
    if(checkpoint<0&&(!placeKey||!normalized(visible).includes(placeKey)))continue;
    for(const sentence of visible.match(/[^.!?]+[.!?]?/g)||[]){
      if(sentence.endsWith('?')||futureOrMemory.test(sentence)||/\b(?:photograph|picture|painting|poster|mural|screen)\s+of\b/i.test(sentence))continue;
      clauses.push({text:sentence.replace(/[.!]$/,'').trim(),sourceMessageId:message.id});
      const out=outside.exec(sentence),into=inside.exec(sentence);
      if(out||into){viewpoint=out&&(!into||out.index>into.index)?'exterior':'interior';sourceMessageId=message.id;}
      const declaredTime=currentTimeCue(sentence,explicitTime)||currentTimeCue(sentence,timeSkip);
      if(declaredTime){
        if(timeOfDay!==declaredTime)lighting='';
        timeOfDay=declaredTime;
        explicitSceneTime=true;
      }
      else if(!explicitSceneTime)timeOfDay=currentTimeCue(sentence,ambientTime)||timeOfDay;
      const light=sentence.match(lightQuality);
      if(light)lighting=light[0];
    }
  }
  if(outdoorGarden||(!viewpoint&&/\b(?:streets?|roads?)$/i.test(location)))viewpoint='exterior';
  const cafe=/\bcaf[eé]\b|\bcoffee\s*shop\b/i.test(location);
  // The name of a venue is still current when its finer surroundings are
  // pending. Keep its category grounded in physical details from this scene.
  const otherSetting=/\b(?:apartment|bedroom|kitchen|bathroom|shower|house|train|bus|station|streets?|roads?|gardens?)\b/i;
  // A repeated place name can advance the checkpoint past the description.
  // Only carry a venue type across that boundary if it names this exact place.
  const hasLocalBarDetails=clauses.some(clause=>localBarDetails.test(clause.text))
    || (!cafe&&!otherSetting.test(location)&&namedBarVenue(messages,location,thread.character?.id));
  const bar=barVenue.test(location) || (!otherSetting.test(location) &&
    (barVenue.test(scene.environment||'') || hasLocalBarDetails));
  if(bar&&!viewpoint&&hasLocalBarDetails)viewpoint='interior';
  const framing=cafe?(viewpoint==='exterior'?'(cafe storefront exterior:1.3), outdoors, coffee shop facade and entrance, street-level exterior view':viewpoint==='interior'?'(cafe interior:1.3), coffee shop interior, customer seating and service counter':'cafe, coffee shop setting')
    :bar?(viewpoint==='exterior'?'(bar storefront exterior:1.3), street-level entrance':'(pub and bar interior:1.3), service counter, bottle shelves and glassware')
      :(viewpoint==='exterior'?'outdoor exterior view':viewpoint==='interior'?'indoor interior view':'');
  // A newly described exterior must not inherit a stale interior description.
  const night=nightTime.test(timeOfDay),day=dayTime.test(timeOfDay);
  const conflictingLight=night?dayLight:day?nightLight:null;
  const consistentLighting=value=>conflictingLight&&conflictingLight.test(value)?'':value;
  const savedEnvironment=viewpoint==='exterior'&&/\b(?:interior|indoors|classroom|bedroom)\b/i.test(scene.environment||'')?'':text(scene.environment).replace(/\b(?:(?:a|the)\s+)?(?:small\s+)?bathroom shower\b/gi,'a shower enclosure');
  const currentEnvironment=conflictingLight&&conflictingLight.test(savedEnvironment)
    ?savedEnvironment.split(/[,;.!?]+/).map(part=>consistentLighting(part.trim())).filter(Boolean).join(', ')
    :savedEnvironment;
  const environment=sceneryText(currentEnvironment||(outdoorGarden||/\bshower\b/i.test(location)?environmentForLocation(location):''));
  const setting=location+' '+environment;
  const occupancy=[environment,...clauses.map(clause=>clause.text)].join(' ');
  const privateSetting=/\b(?:bedroom|bathroom|shower enclosure|private quarters|private room)\b/i.test(setting);
  const emptySetting=/\b(?:unoccupied|deserted|no one (?:else|around|in sight)|(?:no|without) (?:people|pedestrians|customers|crowds?)|empty (?:room|street|caf[eé]|shop|hall|platform))\b/i.test(occupancy);
  const ambientPeople=!privateSetting&&!emptySetting&&/\b(?:pedestrians|passersby|passers-by|commuters|crowds?|customers|shoppers)\b/i.test(occupancy);
  const timePrompt=night?'(nighttime:1.35), dark outside':day?timeOfDay+', (natural daylight:1.2)':timeOfDay;
  const negative=[viewpoint==='exterior'?'indoor view, interior view':viewpoint==='interior'?'exterior-only view':'',
    night?'daytime, sunlight, daylight, bright blue sky':day?'nighttime, moonlight, dark outside':''].filter(Boolean).join(', ');
  return {viewpoint,sourceMessageId,clauses,framing,location:sceneryText(location),environment,ambientPeople,privateSetting,lighting:[timePrompt,consistentLighting(lighting)||consistentLighting(savedLighting)].filter(Boolean).join(', '),negative};
}
