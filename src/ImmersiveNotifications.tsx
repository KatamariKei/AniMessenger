import tiers from '../shared/relationship-tiers.json';
import {playSound} from './sound';
import type {CSSProperties} from 'react';
import {canOwnNoticeLease} from '../shared/immersive-notice-lease.mjs';
import {useEffect,useRef,useState} from 'react';
import {api,Thread,AppConfig} from './api';
import {AchievementNotification} from './AchievementNotification';
import {DiscoveryNotification} from './DiscoveryNotification';
import {noticeLeaseKey} from './immersive-notice-owner';

export function ImmersiveNotifications(){
 const query=new URLSearchParams(location.search),id=query.get('notifications')||'',instance=query.get('instance')||'';
 const [thread,setThread]=useState<Thread|null>(null),[config,setConfig]=useState<AppConfig|null>(null),[owner,setOwner]=useState(false),[pending,setPending]=useState(false),[paused,setPaused]=useState(false),[milestones,setMilestones]=useState<Array<{id:string;label:string}>>([]);
 const milestone=milestones[0],active=owner&&!paused&&!document.hidden;
 const heardMilestones=useRef(new Set<string>());
 const previous=useRef<Thread|null>(null),token=useRef(crypto.randomUUID()),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{void api.config().then(setConfig).catch(()=>undefined);},[]);
 useEffect(()=>{const changed=()=>{try{const lease=JSON.parse(localStorage.getItem(noticeLeaseKey(id))||'null');if(lease?.owner!==token.current)setOwner(false);}catch{setOwner(false);}};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);},[id]);
 useEffect(()=>{
  let disposed=false;
  const refresh=async()=>{
   if(document.hidden){setOwner(false);return;}
   try{
    const held=JSON.parse(localStorage.getItem(noticeLeaseKey(id))||'null');if(!canOwnNoticeLease(held,token.current)){setOwner(false);return;}
    localStorage.setItem(noticeLeaseKey(id),JSON.stringify({owner:token.current,at:Date.now()}));
    const result=await api.thread(id);if(disposed||result.thread.storageInstanceId!==instance)return;
    const old=previous.current;
    if(old){const seen=new Set((old.relationshipMilestones||[]).map(e=>e.id));const next=(result.thread.relationshipMilestones||[]).filter(e=>!seen.has(e.id));if(next.length)setMilestones(queue=>[...queue,...next.filter(e=>!queue.some(q=>q.id===e.id))]);}
    previous.current=result.thread;setThread(result.thread);setOwner(true);
   }catch{setOwner(false);}
  };
  void refresh();const timer=setInterval(()=>void refresh(),1500);
  const visibility=()=>void refresh();document.addEventListener('visibilitychange',visibility);
  return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);try{const lease=JSON.parse(localStorage.getItem(noticeLeaseKey(id))||'null');if(lease?.owner===token.current)localStorage.removeItem(noticeLeaseKey(id));}catch{}};
 },[id,instance]);
 useEffect(()=>{const listener=(e:MessageEvent)=>{if(e.origin===new URL(document.referrer || 'http://127.0.0.1:8769').origin&&e.source===parent&&e.data?.type==='animessenger:notice-pause')setPaused(Boolean(e.data.paused));};window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);},[]);
 useEffect(()=>{if(!milestone||!active)return;const t=setTimeout(()=>setMilestones(q=>q.slice(1)),5200);return()=>clearTimeout(t);},[milestone,active]);
 useEffect(()=>{if(active&&milestone&&!heardMilestones.current.has(milestone.id)&&playSound('bond-celebration',{enabled:config?.soundEnabled??false,volume:config?.soundVolume??.35}))heardMilestones.current.add(milestone.id);},[active,milestone,config]);
 useEffect(()=>{const report=()=>parent.postMessage({type:'animessenger:notice-visible',id,instance,visible:Boolean(root.current?.querySelector('[role=status]'))},new URL(document.referrer || 'http://127.0.0.1:8769').origin);const observer=new MutationObserver(report);if(root.current)observer.observe(root.current,{childList:true,subtree:true});report();return()=>observer.disconnect();},[id,instance]);
 const portrait=thread?.character.avatarUrl?<img className="portrait" alt="" src={thread.character.avatarUrl}/>:<span/>;
 const name=thread?.character.displayName||thread?.character.name||'';
 return <div ref={root} className="immersive-notification-root">{thread&&<>
 {active&&milestone&&<div className="relationship-milestone" role="status" style={{"--bond-color":[...tiers].reverse().find(t=>t.threshold<=thread.relationship)?.color||"#77727b"} as CSSProperties}>{portrait}<span><small>Relationship up</small><strong>{name}</strong><b>{milestone.label}</b></span></div>}
 <DiscoveryNotification thread={thread} characterName={name} portrait={portrait} config={config} paused={!active||!!milestone} onPendingChange={setPending} onThreadUpdated={setThread}/>
 <AchievementNotification thread={thread} characterName={name} portrait={portrait} config={config} paused={!active||!!milestone||pending}/>
 </>}</div>;
}
