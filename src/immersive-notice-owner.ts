import {noticeLeaseActive} from '../shared/immersive-notice-lease.mjs';
import { useEffect, useState } from 'react';
export const noticeLeaseKey=(id:string)=>'animessenger.immersive-notices.'+id;
export function useImmersiveNoticeOwner(id:string){
 const [owned,setOwned]=useState(false);
 useEffect(()=>{
  const read=()=>{try{const lease=JSON.parse(localStorage.getItem(noticeLeaseKey(id))||'null');setOwned(noticeLeaseActive(lease));}catch{setOwned(false);}};
  read();const timer=setInterval(read,500);window.addEventListener('storage',read);
  return()=>{clearInterval(timer);window.removeEventListener('storage',read);};
 },[id]);
 return owned && new URLSearchParams(location.search).get('notifications')!==id;
}
