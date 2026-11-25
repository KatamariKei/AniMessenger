type Character = { id: string; name?: string; displayName?: string };
export function addressedCameoSpeakers(text: string, host: Character, guest: Character, lastSpeakerId?: string): string[];
export function isCameoConversationReply(message: {
  from: string; narration?: string | null; text?: string | null; imageJobId?: string; image?: string; imageUrl?: string;
}): boolean;
