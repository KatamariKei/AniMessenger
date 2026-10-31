import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import ts from "typescript";
import { visibleDraft, readOllamaStream, enableChatStream, finishChatStream } from "../server/chat-stream.mjs";

const source = await fs.readFile(new URL("../src/chat-stream.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { readChatResponse } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const encoded = text => new TextEncoder().encode(text);
const streamResponse = (text, width = 1, contentType = "application/x-ndjson") => new Response(new ReadableStream({
  start(controller) { const bytes = encoded(text); for (let i = 0; i < bytes.length; i += width) controller.enqueue(bytes.slice(i, i + width)); controller.close(); },
}), { headers: { "content-type": contentType } });

test("draft extraction buffers partial escapes and unicode, and ignores nested or unrelated metadata", () => {
  const text = 'She says "Hello."\nA café, a backslash \\, and a star 🌟.';
  const json = JSON.stringify({ scene: { reply: "PRIVATE METADATA" }, unrelated: 'a "reply" label', narration: text, reply: "Other visible field" });
  let previous = "";
  for (let i = 0; i <= json.length; i++) {
    const draft = visibleDraft(json.slice(0, i), "narration");
    assert.ok(text.startsWith(draft));
    assert.ok(draft.startsWith(previous));
    assert.doesNotMatch(draft, /PRIVATE METADATA/);
    previous = draft;
  }
  assert.equal(previous, text);
  assert.equal(visibleDraft('{"narration":"A \\uD83C', "narration"), "A ");
  assert.equal(visibleDraft('{"narration":"A \\uD83C\\uDF1F', "narration"), "A 🌟");
  assert.equal(visibleDraft('{"narration":"bad\\x', "narration"), "");
  assert.equal(visibleDraft('{"scene":{"reply":"secret"},"reply":"Hi"}', "reply"), "Hi");
  assert.equal(visibleDraft('{"reply":null}', "reply"), "");
});

test("Ollama stream survives every UTF-8 boundary and retains completion metrics without exposing thinking", async () => {
  const events = [{ message: { thinking: "PRIVATE THINKING", content: '{"narration":"Café 🌟' } },
    { message: { content: ' says \\"hi\\"."}' } }, { done: true, done_reason: "stop", prompt_eval_count: 1200, eval_count: 40 }];
  const drafts = [];
  const result = await readOllamaStream(streamResponse(events.map(event => JSON.stringify(event)).join("\n")), content => drafts.push(content));
  assert.equal(result.prompt_eval_count, 1200);
  assert.equal(result.eval_count, 40);
  assert.equal(result.message.content, events.slice(0, 2).map(event => event.message.content).join(""));
  assert.doesNotMatch(JSON.stringify(drafts), /PRIVATE THINKING/);
  await assert.rejects(readOllamaStream(streamResponse('{"message":{"content":"partial"}}\n'), () => {}), /before completing/);
  await assert.rejects(readOllamaStream(streamResponse('{"error":"synthetic failure"}\n'), () => {}), /synthetic failure/);
  const fallback = await readOllamaStream(Response.json({ message: { content: "complete fallback" }, done: true }), () => {});
  assert.equal(fallback.message.content, "complete fallback");
});

class FakeResponse extends EventEmitter {
  headersSent = false; destroyed = false; writableEnded = false; accept = true; chunks = [];
  writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; }
  write(chunk) { this.chunks.push(chunk); return this.accept; }
  end() { this.writableEnded = true; }
}
test("chat transport bounds slow-client drafts, filters final fields and delivers final errors", () => {
  const response = new FakeResponse();
  const draft = enableChatStream(response, (key, value) => key === "privateScore" ? undefined : value);
  response.accept = false;
  draft("First draft");
  draft("Skipped under backpressure");
  assert.equal(response.chunks.length, 1);
  response.accept = true; response.emit("drain");
  draft("");
  assert.equal(finishChatStream(response, 200, { thread: { privateScore: 123, messages: [] } }), true);
  assert.equal(response.writableEnded, true);
  const events = response.chunks.map(chunk => JSON.parse(chunk));
  assert.deepEqual(events.map(event => event.type), ["draft", "draft", "complete"]);
  assert.doesNotMatch(response.chunks.join(""), /privateScore|Skipped/);
  assert.equal(finishChatStream(response, 200, {}), false);
  const failed = new FakeResponse(); enableChatStream(failed); finishChatStream(failed, 409, { error: "Conversation replaced" });
  assert.equal(JSON.parse(failed.chunks[0]).status, 409);
  const closed = new FakeResponse(); const late = enableChatStream(closed); closed.emit("close"); late("late draft");
  assert.equal(closed.chunks.length, 0);
});

test("phone reader keeps drafts separate from final payload, clears on reset and rejects undelivered streams", async () => {
  const drafts = [];
  const final = { thread: { messages: [{ text: "Validated final" }] } };
  const events = [{ type: "draft", text: "Draft café 🌟" }, { type: "draft", text: "" }, { type: "draft", text: "Replacement" }, { type: "complete", payload: final }];
  assert.deepEqual(await readChatResponse(streamResponse(events.map(event => JSON.stringify(event)).join("\n")), text => drafts.push(text)), final);
  assert.deepEqual(drafts, ["Draft café 🌟", "", "Replacement"]);
  await assert.rejects(readChatResponse(streamResponse('{"type":"draft","text":"not saved"}\n')), /before delivery/);
  await assert.rejects(readChatResponse(streamResponse('{"type":"error","error":"Viewpoint repair failed"}\n')), /Viewpoint repair failed/);
  await assert.rejects(readChatResponse(streamResponse('{"type":"complete","payload":{}}\n{"type":"draft","text":"late"}\n')), /after completion/);
});
