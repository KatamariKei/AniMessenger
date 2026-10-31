const streams = new WeakMap();

// Opt-in transport only. Drafts never enter the thread store or final payload.
export function enableChatStream(response, replacer) {
  const state = { blocked: false, closed: false, last: undefined, sentAt: 0 };
  streams.set(response, state);
  response.once("close", () => { state.closed = true; streams.delete(response); });
  response.on("drain", () => { state.blocked = false; });
  const write = event => {
    if (state.closed || response.destroyed || response.writableEnded) return;
    if (!response.headersSent) response.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store",
      "x-accel-buffering": "no",
    });
    try { state.blocked = !response.write(JSON.stringify(event, replacer) + "\n"); }
    catch { state.closed = true; }
  };
  state.finish = (status, payload) => {
    write(status >= 400 ? { type: "error", error: payload.error || "The reply could not be completed.", status }
      : { type: "complete", payload });
    if (!response.destroyed && !response.writableEnded) response.end();
    streams.delete(response);
  };
  return text => {
    if (state.blocked || text === state.last) return;
    if (text && state.last && Date.now() - state.sentAt < 50) return;
    state.last = text;
    state.sentAt = Date.now();
    write({ type: "draft", text });
  };
}

export function finishChatStream(response, status, payload) {
  const state = streams.get(response);
  if (!state) return false;
  state.finish(status, payload);
  return true;
}

// Read only a top-level visible string. Incomplete escapes stay buffered, so a
// split quote, unicode escape or surrogate pair cannot expose JSON syntax.
export function visibleDraft(source, field) {
  function stringAt(start) {
    let value = "";
    for (let i = start + 1; i < source.length; i++) {
      const char = source[i];
      if (char === '"') return { value, end: i + 1, complete: true };
      if (char < " ") return null;
      if (char !== "\\") { value += char; continue; }
      const escape = source[++i];
      if (escape === undefined) break;
      if (escape === "u") {
        const hex = source.slice(i + 1, i + 5);
        if (hex.length < 4) break;
        if (!/^[0-9a-f]{4}$/i.test(hex)) return null;
        value += String.fromCharCode(parseInt(hex, 16)); i += 4;
      } else {
        const escapes = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (!Object.hasOwn(escapes, escape)) return null;
        value += escapes[escape];
      }
    }
    return { value: value.replace(/[\uD800-\uDBFF]$/, ""), end: source.length, complete: false };
  }
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "{" || source[i] === "[") depth++;
    else if (source[i] === "}" || source[i] === "]") depth--;
    else if (source[i] === '"') {
      const key = stringAt(i);
      if (!key?.complete) return "";
      let next = key.end;
      while (/\s/.test(source[next] || "") && next < source.length) next++;
      if (depth === 1 && key.value === field && source[next] === ":") {
        next++;
        while (/\s/.test(source[next] || "") && next < source.length) next++;
        return source[next] === '"' ? stringAt(next)?.value || "" : "";
      }
      i = key.end - 1;
    }
  }
  return "";
}

export async function readOllamaStream(response, onContent) {
  if (!response.headers.get("content-type")?.includes("ndjson")) {
    const payload = await response.json();
    if (payload.message?.content) onContent(payload.message.content);
    return payload;
  }
  const decoder = new TextDecoder();
  let pending = "", content = "", completed;
  const line = raw => {
    if (!raw.trim()) return;
    const event = JSON.parse(raw);
    if (event.error) throw new Error(event.error);
    if (event.message?.content) {
      content += event.message.content;
      if (content.length > 2_000_000) throw new Error("The local model response was too large.");
      onContent(content);
    }
    if (event.done) completed = event;
  };
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    if (pending.length > 2_000_000) throw new Error("The local model stream was too large.");
    let end;
    while ((end = pending.indexOf("\n")) >= 0) { line(pending.slice(0, end)); pending = pending.slice(end + 1); }
  }
  pending += decoder.decode();
  line(pending);
  if (!completed) throw new Error("The local model stream ended before completing the reply.");
  return { ...completed, message: { ...completed.message, content } };
}
