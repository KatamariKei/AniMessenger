export async function readChatResponse<T>(response: Response, onDraft?: (text: string) => void): Promise<T> {
  if (!response.body) throw new Error("The reply connection closed. Please retry your message.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let complete = false;
  let payload: T;
  const line = (raw: string) => {
    if (!raw.trim()) return;
    const event = JSON.parse(raw);
    if (complete) throw new Error("The reply stream contained data after completion.");
    if (event.type === "error") throw new Error(event.error || "The reply could not be completed.");
    if (event.type === "draft" && typeof event.text === "string") onDraft?.(event.text);
    if (event.type === "complete") { payload = event.payload; complete = true; }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      if (pending.length > 20_000_000) throw new Error("The reply stream was too large.");
      let end;
      while ((end = pending.indexOf("\n")) >= 0) { line(pending.slice(0, end)); pending = pending.slice(end + 1); }
    }
    line(pending + decoder.decode());
    if (!complete) throw new Error("The reply connection closed before delivery. Please retry your message.");
    return payload!;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
