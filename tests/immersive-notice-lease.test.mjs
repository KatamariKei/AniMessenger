import test from 'node:test';import assert from 'node:assert/strict';
import {noticeLeaseActive,canOwnNoticeLease} from '../shared/immersive-notice-lease.mjs';
test('immersive notification lease suppresses ordinary view until expiry and permits owner renewal',()=>{
 const lease={owner:'immersive-a',at:1000};
 assert(noticeLeaseActive(lease,1001));assert(!canOwnNoticeLease(lease,'immersive-b',1001));assert(canOwnNoticeLease(lease,'immersive-a',1001));
 assert(!noticeLeaseActive(lease,5500));assert(canOwnNoticeLease(lease,'immersive-b',5500));
 for(const invalid of [null,{}, {owner:'',at:1000},{owner:'a',at:'1000'},{owner:'a',at:9999}])assert(!noticeLeaseActive(invalid,1001));
});
