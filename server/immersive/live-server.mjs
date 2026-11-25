import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {planLiveArt,resolveImmersiveScene} from './live-plan.mjs';
import {inspectPng} from './png-alpha.mjs';
import {checkComfy,generationStatus,fetchComfyImage,selectedDiffusionModel} from '../comfy.mjs';
import {visualNovelBlock} from '../../shared/visual-novel-availability.mjs';
import {relationshipTier} from '../relationship.mjs';
import {threadForOwnConversation} from '../conversation-scene.mjs';
import {readConfig} from '../config.mjs';
import {pendingSceneFields} from '../scene-verification.mjs';
import {wardrobeDescriptionRequested,wardrobeTransitionMentioned} from '../wardrobe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const preview=await fs.access(path.join(root,'public/immersive')).then(()=>path.join(root,'public/immersive')).catch(()=>path.join(root,'dist/immersive'));
let output=path.join(root,'data/immersive');
let assetPrefix='';
export async function configureImmersive(url,directory){app=url;assetPrefix='/immersive';output=path.join(directory,'immersive');await fs.mkdir(output,{recursive:true});}
const legacyAlphaError='The foreground did not contain usable transparency. Retry artwork, or test a different scene.';
let app='http://127.0.0.1:5174';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function jsonFile(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function appGet(route){const r=await fetch(app+route,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('AniMessenger is unavailable, or this chat no longer exists.');return r.json();}
async function finishChatImage(promptId){
 for(let attempt=0;attempt<120;attempt++){
  await new Promise(resolve=>setTimeout(resolve,2000));
  try{const result=await appGet('/api/images/status/'+encodeURIComponent(promptId));if(result.status!=='pending')return;}catch{return;}
 }
}
async function setup(config){
 const graph=await jsonFile(path.resolve(root,config.comfyWorkflowFile));
 const mapping=await jsonFile(path.resolve(root,config.comfyMappingFile));
 const comfyDiffusionModel=selectedDiffusionModel(config,mapping);
 if(!/anima(?!t)/i.test(comfyDiffusionModel))throw new Error('Choose an ANIMA diffusion model in Settings to use Visual Novel.');
 return {config:{...config,comfyDiffusionModel},graph,mapping,signature:digest([graph,mapping,comfyDiffusionModel]),computeReady:async()=>!(await appGet('/api/immersive/compute')).busy};
}
export function publicThread(thread){
 thread=threadForOwnConversation(thread);
 const messages=thread.messages||[];
 // Artwork can finish after a story turn or while the next reply is pending.
 const isArtworkDelivery=m=>m.from==='character'&&!m.narration&&(m.imageJobId||m.image||m.imageUrl);
 const latest=messages.findLast(m=>m.from==='character'&&(m.narration||m.text)&&!isArtworkDelivery(m));
 const turn=messages.findLast(m=>m.from==='user'||(m.from==='character'&&!isArtworkDelivery(m)));
 return {id:thread.id,instance:thread.storageInstanceId,revision:thread.storageRevision,name:thread.character?.displayName||thread.character?.name||'Character',mode:thread.conversationMode,latest:latest?{id:latest.id,text:latest.narration||latest.text}:null,
  history:(thread.messages||[]).filter(m=>['user','character'].includes(m.from)&&(m.narration||m.text)).slice(-30).map(m=>({speaker:m.from==='user'?'You':m.speakerId&&m.speakerId!==thread.character?.id?thread.cameo?.activeGuest?.name||'Guest':thread.character?.displayName||thread.character?.name,text:m.narration||m.text})),
  location:resolveImmersiveScene(thread).locationLabel||'',avatar:thread.character?.avatarUrl?assetPrefix+'/live/avatar?id='+encodeURIComponent(thread.id)+'&instance='+encodeURIComponent(thread.storageInstanceId):'',
  waitingForReply:turn?.from==='user',relationship:Math.min(100,Number(thread.relationship)||0),tier:thread.relationshipTier||relationshipTier(thread.relationship).label,relationshipColor:relationshipTier(thread.relationship).color};
}
export function allowedRequest(req,port){
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return false;
 if(req.headers['sec-fetch-site']==='cross-site')return false;
 const source=req.headers.origin||req.headers.referer;
 if(source){try{const u=new URL(source);if(!['http:'].includes(u.protocol)||u.host!==req.headers.host)return false;}catch{return false;}}
 return true;
}
export function buildLiveGraph(base,mapping,config,asset,attempt=0,sourceImage){
 const graph=structuredClone(base);
 const set=(name,value)=>{const f=mapping.fields?.[name];if(!f||!graph[f.node_id]?.inputs)throw new Error('The current image workflow is not compatible with this test.');graph[f.node_id].inputs[f.input]=value;};
 set('positive_prompt',asset.positive);set('negative_prompt',asset.negative||'');set('width',asset.width);set('height',asset.height);
 set('seed',(parseInt(asset.key.slice(0,8),16)+attempt)%2147483647);set('diffusion_model',config.comfyDiffusionModel);
  const defaults=mapping.defaults?.image_settings||{};
  for(const name of ['steps','cfg','sampler','scheduler'])if(defaults[name]!==undefined)set(name,defaults[name]);
 set('filename_prefix', `${asset.outputFolder}/${asset.kind}-${asset.key.slice(0,16)}`);
 if(asset.kind==='background'||asset.kind==='background-hires'){
  for(const node of Object.values(graph)){
   if(/^gpt-image-2_/i.test(node.inputs?.lora_name||''))node.inputs.strength_model=0.8;
  }
 }
 if(asset.kind==='background-hires'){
  const sampler=graph[mapping.fields.seed.node_id];
  const save=graph[mapping.fields.filename_prefix.node_id];
  const decode=graph[save?.inputs?.images?.[0]];
  if(!sourceImage||sampler?.class_type!=='KSampler'||decode?.class_type!=='VAEDecode'||!decode.inputs.vae){
   throw new Error('Background refinement requires a standard sampler and VAE decode.');
  }
  const addNode=(id,class_type,inputs)=>{
   while(graph[id])id+='_';
   graph[id]={class_type,inputs};
   return [id,0];
  };
  const image=addNode('immersive_source','LoadImage',{image:sourceImage});
  const pixels=addNode('immersive_scale','ImageScale',{image,upscale_method:'lanczos',width:asset.width,height:asset.height,crop:'disabled'});
  sampler.inputs.latent_image=addNode('immersive_encode','VAEEncode',{pixels,vae:decode.inputs.vae});
  sampler.inputs.denoise=0.5;
 }
 if(asset.kind==='foreground'){
  const vaes=Object.values(graph).filter(n=>n.class_type==='VAELoader');
  const sampler=graph[mapping.fields.seed.node_id];
  if(vaes.length!==1||!Array.isArray(sampler?.inputs?.model))throw new Error('This test requires one standard VAE loader and sampler.');
  vaes[0].inputs.vae_name='anima_rgba_vae.safetensors';
  let id='immersive_rgba';while(graph[id])id+='_';
  graph[id]={class_type:'LoraLoaderModelOnly',inputs:{model:sampler.inputs.model,lora_name:'anima_rgba_lora.safetensors',strength_model:1},_meta:{title:'Immersive foreground RGBA'}};
  sampler.inputs.model=[id,0];
 }
 return graph;
}
const sessions=new Map(),jobs=new Map();
let serial=Promise.resolve();
const exclusive=work=>{const next=serial.catch(()=>{}).then(work);serial=next;return next;};
async function jobFor(asset){
 await fs.mkdir(output,{recursive:true});
 if(jobs.has(asset.key))return jobs.get(asset.key);
 let job;
 try{job=await jsonFile(path.join(output,asset.key+'.job.json'));}catch(error){if(error.code!=='ENOENT')throw error;job={status:'new',attempt:0};}
 jobs.set(asset.key,job);return job;
}
async function saveJob(asset,job){await fs.writeFile(path.join(output,asset.key+'.job.json'),JSON.stringify(job,null,2));}
export async function updateAsset(asset,settings,retry,reroll=false){
 const job=await jobFor(asset);
 // Recover an older alpha rejection by fetching that existing result again,
 // not by spending another generation. Explicit retries still request new art.
 const rejectedAlpha=(job.status==='error'&&job.error===legacyAlphaError)||(job.status==='new'&&job.alphaRecoveryUsed===true);
 if(asset.kind==='foreground'&&rejectedAlpha&&job.promptId&&!retry&&!reroll){
  Object.assign(job,{status:'pending',error:null});await saveJob(asset,job);
 }
 if((job.status==='error'&&retry)||(reroll&&['complete','error'].includes(job.status))){Object.assign(job,{status:'new',error:null,attempt:(job.attempt||0)+1});await saveJob(asset,job);}
 if(job.status==='complete'){
  try{await fs.access(path.join(output,asset.key+'.png'));return job;}catch{job.status='new';}
 }
 if(job.status==='pending'){
  const result=await generationStatus(settings.config,job.promptId,{detectMissing:true});
  if(result.status==='error'){job.status='error';job.error=result.error;await saveJob(asset,job);}
  if(result.status==='complete'){
   try{
    const image=await fetchComfyImage(settings.config,new URL(result.imageUrl,'http://127.0.0.1'));
    const inspection=inspectPng(image.body);
    if(inspection.width!==asset.width||inspection.height!==asset.height)throw new Error('Artwork dimensions did not match the requested layer.');
    await fs.writeFile(path.join(output,asset.key+'.png'),image.body);
    Object.assign(job,{status:'complete',inspection,completedAt:new Date().toISOString()});await saveJob(asset,job);
   }catch(error){job.status='error';job.error=error.message;await saveJob(asset,job);}
  }
 }
 return job;
}
async function imageQueueDelay(settings){
 if(settings.computeReady&&!await settings.computeReady())return 'Artwork will update after the current reply.';
 const queue=await (await fetch(settings.config.comfyUrl+'/queue',{signal:AbortSignal.timeout(10000)})).json();
 if(!Array.isArray(queue.queue_running)||!Array.isArray(queue.queue_pending))throw new Error('ComfyUI queue is unavailable.');
 return queue.queue_running.length||queue.queue_pending.length?'Waiting for the image generator…':null;
}

async function submitAsset(asset,job,settings,sourceImage){
 const graph=buildLiveGraph(settings.graph,settings.mapping,settings.config,asset,job.attempt,sourceImage);
 const response=await fetch(settings.config.comfyUrl+'/prompt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:graph,client_id:'animessenger-immersive-live-test'}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();
 if(!response.ok||!result.prompt_id){
  const error=asset.kind==='foreground'
   ?'ComfyUI rejected the foreground workflow. Check that the RGBA models are installed.'
   :'ComfyUI rejected the background workflow.';
  Object.assign(job,{status:'error',error});
  await saveJob(asset,job);
  return;
 }
 Object.assign(job,{status:'pending',promptId:result.prompt_id,requestedAt:new Date().toISOString()});
 await saveJob(asset,job);
 await fs.writeFile(path.join(output,asset.key+'.api.json'),JSON.stringify(graph,null,2));
}

const assetUrl=(asset,job)=>assetPrefix+'/live-assets/'+asset.key+'.png?v='+(job.attempt||0);

async function refinedBackground(base,baseJob,settings,visibleBackground,waitingForReply){
 const asset={...base,kind:'background-hires',key:digest(['hires-v2',base.key,baseJob.attempt||0]),width:2304,height:1296};
 const job=await jobFor(asset);
 const baseVisible=visibleBackground===assetUrl(base,baseJob);
 if(job.status==='complete')return (await updateAsset(asset,settings,false)).status==='complete'?assetUrl(asset,job):null;
 if(!baseVisible||waitingForReply)return null;
 try{
  await updateAsset(asset,settings,false);
  if(job.status==='new'&&!(await imageQueueDelay(settings))){
   const form=new FormData();
   form.set('image',new Blob([await fs.readFile(path.join(output,base.key+'.png'))],{type:'image/png'}),asset.key+'.png');
   form.set('type','input');
   form.set('subfolder','AniMessenger/Immersive');
   form.set('overwrite','true');
   const response=await fetch(settings.config.comfyUrl+'/upload/image',{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
   const uploaded=await response.json();
   if(!response.ok||!uploaded.name)throw new Error('ComfyUI could not load the base background.');
   if(!(await imageQueueDelay(settings)))await submitAsset(asset,job,settings,[uploaded.subfolder,uploaded.name].filter(Boolean).join('/'));
  }
 }catch(error){
  if(job.status!=='pending'){
   Object.assign(job,{status:'error',error:error.message});
   await saveJob(asset,job);
  }
 }
 return job.status==='complete'?assetUrl(asset,job):null;
}

export async function renderThread(thread,settings,retry=false,now=Date.now(),visibleBackground,highResBackground=true){
 const plan=planLiveArt(thread,settings.config,settings.signature);
 if(plan.waiting)return {status:'waiting',message:plan.waiting,instance:thread.storageInstanceId};
 const session=sessions.get(thread.id);
 if(!session||session.instance!==thread.storageInstanceId||session.key!==plan.key){sessions.set(thread.id,{instance:thread.storageInstanceId,key:plan.key,changedAt:now});}
 const states=[];
 for(const asset of plan.assets)states.push(await updateAsset(asset,settings,retry===true,retry===asset.kind));
 if(states.some(s=>s.status==='error'))return {status:'error',key:plan.key,instance:plan.instance,message:states.find(s=>s.status==='error').error};
 const lastTurn=(thread.messages||[]).filter(m=>['user','character'].includes(m.from)).at(-1);
 if(states.every(s=>s.status==='complete')){
  const urls=Object.fromEntries(plan.assets.map((a,index)=>[a.kind,assetUrl(a,states[index])]));
  const backgroundIndex=plan.assets.findIndex(asset=>asset.kind==='background');
  const hires=highResBackground&&backgroundIndex>=0
   ?await refinedBackground(plan.assets[backgroundIndex],states[backgroundIndex],settings,visibleBackground,lastTurn?.from==='user')
   :null;
  const baseBackground=urls.background||urls.scene;
  return {status:'ready',key:digest([plan.key,...states.map(s=>s.attempt||0),hires]),instance:plan.instance,mode:plan.mode,background:hires||baseBackground,baseBackground,character:urls.foreground||null};
 }
 if(lastTurn?.from==='user')return {status:'pending',key:plan.key,instance:plan.instance,message:'Waiting for the reply before updating artwork.'};
 if(now-sessions.get(thread.id).changedAt<3500)return {status:'pending',key:plan.key,instance:plan.instance,message:'Preparing the current scene…'};
 if(!states.some(s=>s.status==='pending')){
  const delay=await imageQueueDelay(settings);
  if(delay)return {status:'pending',key:plan.key,instance:plan.instance,message:delay};
  const index=states.findIndex(s=>s.status==='new'),asset=plan.assets[index],job=states[index];
  await submitAsset(asset,job,settings);
  if(job.status==='error')return {status:'error',key:plan.key,instance:plan.instance,message:job.error};
 }
 return {status:'pending',key:plan.key,instance:plan.instance,message:'Updating artwork…'};
}
function send(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)throw new Error('Request too large.');}return JSON.parse(text||'{}');}
export function makeLiveServer({port=8769,trusted=false,getApp=appGet,postChat=fetch,render=renderThread,getSettings=setup,getConfig=readConfig,comfyOnline=checkComfy,reconcileScene}={}){
 const failedSceneChecks=new Map();
 const sceneChecks=new Map();
 return http.createServer(async(req,res)=>{
  if(!trusted&&!allowedRequest(req,port)){send(res,403,{error:'Open this local viewer directly on this computer.'});return;}
  try{
   const u=new URL(req.url,'http://'+req.headers.host);
   if(req.method==='GET'&&u.pathname==='/live/avatar'){
    const {thread}=await getApp('/api/threads/'+encodeURIComponent(u.searchParams.get('id')||''));
    const portrait=new URL(thread.character?.avatarUrl||'/',app);
    if(thread.storageInstanceId!==u.searchParams.get('instance')||portrait.origin!==app||portrait.pathname!=='/api/images/view'){send(res,404,{error:'Portrait unavailable.'});return;}
    const response=await fetch(portrait,{signal:AbortSignal.timeout(10000)});
    const type=response.headers.get('content-type')||'';
    if(!response.ok||!type.startsWith('image/')){send(res,404,{error:'Portrait unavailable.'});return;}
    res.writeHead(200,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   if(req.method==='GET'&&u.pathname==='/live/threads'){
    const {threads}=await getApp('/api/threads');send(res,200,{threads:threads.filter(t=>t.profile&&t.firstContact?.status!=='preview').map(t=>({id:t.id,name:t.character.displayName||t.character.name,mode:t.conversationMode}))});return;
   }
   if(req.method==='GET'&&u.pathname==='/live/thread'){
    const {thread}=await getApp('/api/threads/'+encodeURIComponent(u.searchParams.get('id')||''));
    send(res,200,{thread:publicThread(thread)});return;
   }
   if(req.method==='POST'&&u.pathname==='/live/render'){
    const input=await body(req);
    const result=await exclusive(async()=>{
     let {thread}=await getApp('/api/threads/'+encodeURIComponent(String(input.id||'')));
     if(!input.instance||input.instance!==thread.storageInstanceId)return {status:'replaced',message:'This chat was replaced. Choose it again.',instance:thread.storageInstanceId};
     const config=await getConfig();
     const state={instance:thread.storageInstanceId,sourceRevision:thread.storageRevision};
     const message=visualNovelBlock(config,await comfyOnline(config),true);
     if(message)return {...state,status:'waiting',message};
     const retry=['foreground','background'].includes(input.retry)?input.retry:input.retry===true;
     try{
      const latest=(thread.messages||[]).findLast(message=>['user','character'].includes(message.from));
      const latestUser=(thread.messages||[]).findLast(message=>message.from==='user');
      const wardrobeUpdate=wardrobeTransitionMentioned(latestUser?.text,latest?.narration||latest?.text)||wardrobeDescriptionRequested(latestUser?.text);
      const pending=pendingSceneFields(thread.scene);
      // Keep saved clothing through ordinary scene continuity. A walk or a
      // conversation is not a new outfit change that needs fresh proof.
      const needsCheck=pending.some(field=>!['outfit','posture','expression','activity'].includes(field))
       ||(pending.includes('outfit')&&wardrobeUpdate);
      if(reconcileScene&&latest?.from==='character'&&!thread.cameo?.activeGuest&&thread.firstContact?.status!=='preview'&&needsCheck){
       const signature=digest([thread.storageInstanceId,thread.scene,latest.id]);
       const failed=failedSceneChecks.get(thread.id);
       if(failed?.signature===signature&&!retry)return {...state,status:'error',message:failed.message};
       if(sceneChecks.get(thread.id)?.signature!==signature){
        const job={signature};
        sceneChecks.set(thread.id,job);
        void Promise.resolve().then(()=>reconcileScene(config,thread)).then(()=>{
         if(sceneChecks.get(thread.id)===job)failedSceneChecks.delete(thread.id);
        }).catch(error=>{
         if(sceneChecks.get(thread.id)!==job)return;
         const message=error.message||'The current scene could not be checked. Retry artwork or continue the conversation.';
         failedSceneChecks.set(thread.id,{signature,message});
         if(failedSceneChecks.size>100)failedSceneChecks.delete(failedSceneChecks.keys().next().value);
        }).finally(()=>{if(sceneChecks.get(thread.id)===job)sceneChecks.delete(thread.id);});
       }
       return {...state,status:'pending',message:'Verifying the current scene before updating artwork…'};
      }
      return {...await render(thread,await getSettings(config),retry,Date.now(),input.visibleBackground,input.highResBackground!==false),sourceRevision:state.sourceRevision};
     }catch(error){
      if((error instanceof TypeError||error.name==='TimeoutError')&&!await comfyOnline(config)){
       return {...state,status:'waiting',message:visualNovelBlock(config,false,true)};
      }
      throw error;
     }
    });
    send(res,200,result);return;
   }
   if(req.method==='POST'&&u.pathname==='/live/chat'){
    const input=await body(req);
    if(typeof input.text!=='string'||!input.text.trim()||input.text.length>3000||typeof input.clientMessageId!=='string'||!input.clientMessageId){send(res,400,{error:'Write a message of up to 3,000 characters.'});return;}
    const {thread}=await getApp('/api/threads/'+encodeURIComponent(String(input.id||'')));
    if(!input.instance||thread.storageInstanceId!==input.instance){send(res,409,{error:'This conversation was replaced. Choose it again.'});return;}
    if(thread.cameo?.activeGuest){send(res,400,{error:'Finish the guest encounter in AniMessenger before chatting here.'});return;}
    const response=await postChat(app+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({characterId:thread.id,text:input.text,clientMessageId:input.clientMessageId,expectedStorageInstanceId:input.instance})});
    const result=await response.json();
    if(!response.ok){send(res,response.status,{error:result.error||'The reply could not be completed. Retry your message.'});return;}
    for(const job of [...(result.imageJobs||[]),...(result.imageJob?[result.imageJob]:[])])if(job.promptId)void finishChatImage(job.promptId);
    send(res,200,{sent:true,warning:result.replyWarning||''});return;
   }
   if(req.method!=='GET'){send(res,405,{error:'This viewer does not send messages or edit chats.'});return;}
   const asset=/^\/live-assets\/([a-f0-9]{64})\.png$/.exec(u.pathname);
   let file,type;
   if(asset){file=path.join(output,asset[1]+'.png');type='image/png';}
   else{
    const name=u.pathname==='/'?'live-index.html':decodeURIComponent(u.pathname).replace(/^\//,'');
    file=path.resolve(preview,name);
    if(!file.startsWith(path.resolve(preview)+path.sep)){send(res,404,{error:'Not found.'});return;}
    type={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png'}[path.extname(file)];
    if(!type){send(res,404,{error:'Not found.'});return;}
   }
   const bytes=await fs.readFile(file);
    res.writeHead(200,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self' http://127.0.0.1:5173; frame-ancestors 'self' http://127.0.0.1:5173; base-uri 'none'"});res.end(bytes);
  }catch(error){if(!res.headersSent)send(res,500,{error:error.code==='ENOENT'?'The local preview file was not found.':error.message||'The live viewer could not update.'});else res.end();}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await fs.mkdir(output,{recursive:true});
 makeLiveServer().listen(8769,'127.0.0.1',()=>console.log('Immersive live viewer ready at http://127.0.0.1:8769/ (loopback only; chats are read-only)'));
}
