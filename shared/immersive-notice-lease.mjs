export const NOTICE_LEASE_MS=4500;
export function noticeLeaseActive(lease,now=Date.now()){
 return Boolean(lease&&typeof lease.owner==='string'&&lease.owner&&Number.isFinite(lease.at)&&now>=lease.at&&now-lease.at<NOTICE_LEASE_MS);
}
export function canOwnNoticeLease(lease,owner,now=Date.now()){
 return !noticeLeaseActive(lease,now)||lease.owner===owner;
}
