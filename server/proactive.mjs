import { relationshipStage } from "./relationship.mjs";

export const PROACTIVE_STATE_VERSION = 2;
export const MAX_GLOBAL_PROACTIVE_UNREAD = 1;
export const DEFAULT_PROACTIVE_DELIVERY_START = "08:00";
export const DEFAULT_PROACTIVE_DELIVERY_END = "23:00";

// Per-character eligibility. The global governor below decides when any
// character may actually send, so many close characters cannot create bursts.
const normalCharacterRanges = {
  trusted: [180, 420],
  close: [120, 330],
  "deeply close": [90, 270],
};

const globalGapRanges = {
  relaxed: [240, 480],
  normal: [120, 240],
  lively: [60, 150],
};

const paceMultipliers = {
  relaxed: 1.5,
  normal: 1,
  lively: 0.65,
};

function randomInt(min, max, random = Math.random) {
  const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return min + Math.floor(roll * (max - min + 1));
}

function validIso(value) {
  if (typeof value !== "string") return null;
  return Number.isFinite(new Date(value).getTime()) ? value : null;
}

function clockMinutes(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return hour * 60 + minute;
}

export function isWithinProactiveDeliveryWindow(
  now = new Date(),
  start = DEFAULT_PROACTIVE_DELIVERY_START,
  end = DEFAULT_PROACTIVE_DELIVERY_END,
) {
  const startMinutes = clockMinutes(start, 8 * 60);
  const endMinutes = clockMinutes(end, 23 * 60);
  const current = now.getHours() * 60 + now.getMinutes();
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return current >= startMinutes && current < endMinutes;
  return current >= startMinutes || current < endMinutes;
}

export function proactiveCadenceRange(relationship, pace = "normal") {
  if (pace === "off") return null;
  const base = normalCharacterRanges[relationshipStage(relationship)];
  if (!base) return null;
  const multiplier = paceMultipliers[pace] || paceMultipliers.normal;
  return base.map((minutes) => Math.max(15, Math.round(minutes * multiplier)));
}

export function proactiveGlobalGapRange(pace = "normal") {
  if (pace === "off") return null;
  return globalGapRanges[pace] || globalGapRanges.normal;
}

export function proactiveImageChance(relationship) {
  const stage = relationshipStage(relationship);
  if (stage === "deeply close") return 0.5;
  if (stage === "close") return 0.35;
  if (stage === "trusted") return 0.2;
  return 0;
}

export function shouldAttachProactiveImage(relationship, visualCandidate, random = Math.random) {
  return Boolean(visualCandidate) && Number(random()) < proactiveImageChance(relationship);
}

function normalizeFollowUp(value) {
  if (!value || typeof value !== "object" || !String(value.subject || "").trim()) return null;
  return {
    subject: String(value.subject).trim().slice(0, 240),
    createdAt: validIso(value.createdAt),
    earliestAt: validIso(value.earliestAt),
  };
}

export function normalizeProactiveTopicKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function normalizeTopics(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeProactiveTopicKey)
    .filter(Boolean)
    .slice(-6);
}

export function normalizeProactiveState(state) {
  return {
    version: PROACTIVE_STATE_VERSION,
    nextAt: validIso(state?.nextAt),
    lastAt: validIso(state?.lastAt),
    pending: Boolean(state?.pending),
    globalNextAt: validIso(state?.globalNextAt),
    recentTopics: normalizeTopics(state?.recentTopics),
    pendingFollowUp: normalizeFollowUp(state?.pendingFollowUp),
  };
}

export function scheduleNextProactive(state, relationship, pace = "normal", now = new Date(), random = Math.random) {
  const normalized = normalizeProactiveState(state);
  const range = proactiveCadenceRange(relationship, pace);
  if (!range) return { ...normalized, nextAt: null, pending: false };
  const minutes = randomInt(range[0], range[1], random);
  return { ...normalized, nextAt: new Date(now.getTime() + minutes * 60_000).toISOString(), pending: false };
}

export function updatePendingFollowUp(state, followUp, resolvesPending = false, now = new Date()) {
  const normalized = normalizeProactiveState(state);
  if (resolvesPending) return { ...normalized, pendingFollowUp: null };
  if (!followUp || !String(followUp.subject || "").trim()) return normalized;
  const earliestMinutes = Math.max(15, Math.min(1440, Math.trunc(Number(followUp.earliestMinutes) || 60)));
  return {
    ...normalized,
    pendingFollowUp: {
      subject: String(followUp.subject).trim().slice(0, 240),
      createdAt: now.toISOString(),
      earliestAt: new Date(now.getTime() + earliestMinutes * 60_000).toISOString(),
    },
  };
}

export function hasEligibleFollowUp(thread, now = new Date()) {
  const followUp = normalizeProactiveState(thread?.proactive).pendingFollowUp;
  if (!followUp) return false;
  const earliest = new Date(followUp.earliestAt || followUp.createdAt || 0).getTime();
  return Number.isFinite(earliest) && earliest <= now.getTime();
}

export function globalProactiveNextAt(threads = []) {
  const times = threads
    .map((thread) => normalizeProactiveState(thread?.proactive).globalNextAt)
    .filter(Boolean)
    .sort();
  return times.at(-1) || null;
}

export function proactiveCandidateScore(thread, now = new Date()) {
  const state = normalizeProactiveState(thread?.proactive);
  const lastAt = new Date(state.lastAt || 0).getTime();
  const hoursSince = Number.isFinite(lastAt) ? Math.min(72, Math.max(0, (now.getTime() - lastAt) / 3_600_000)) : 72;
  const followUpBoost = hasEligibleFollowUp(thread, now) ? 1000 : 0;
  return followUpBoost + Math.max(0, Number(thread?.relationship) || 0) + hoursSince * 3;
}

export function canProactivelyReachOut(thread, context = {}, now = new Date()) {
  const state = normalizeProactiveState(thread?.proactive);
  const globalUnreadCount = Math.max(0, Number(context?.globalUnreadCount) || 0);
  if (!thread?.profile || !proactiveCadenceRange(thread.relationship, context?.pace || "normal")) return false;
  if (!isWithinProactiveDeliveryWindow(now, context?.deliveryStart, context?.deliveryEnd)) return false;
  if (Math.max(0, Number(thread.unreadCount) || 0) > 0 || state.pending) return false;
  if (globalUnreadCount >= MAX_GLOBAL_PROACTIVE_UNREAD) return false;
  const globalDue = context?.globalNextAt ? new Date(context.globalNextAt).getTime() : Number.NaN;
  if (Number.isFinite(globalDue) && globalDue > now.getTime()) return false;
  const due = state.nextAt ? new Date(state.nextAt).getTime() : Number.NaN;
  return Number.isFinite(due) && due <= now.getTime();
}

export function recordProactiveAttempt(
  state,
  relationship,
  pace = "normal",
  now = new Date(),
  pending = false,
  random = Math.random,
  details = {},
) {
  const scheduled = scheduleNextProactive(state, relationship, pace, now, random);
  const globalRange = proactiveGlobalGapRange(pace) || globalGapRanges.normal;
  const globalMinutes = randomInt(globalRange[0], globalRange[1], random);
  const topic = normalizeTopics([details.topicKey])[0] || "";
  return {
    ...scheduled,
    lastAt: now.toISOString(),
    pending,
    globalNextAt: new Date(now.getTime() + globalMinutes * 60_000).toISOString(),
    recentTopics: topic ? normalizeTopics([...scheduled.recentTopics, topic]) : scheduled.recentTopics,
    pendingFollowUp: details.resolvesFollowUp ? null : scheduled.pendingFollowUp,
  };
}
