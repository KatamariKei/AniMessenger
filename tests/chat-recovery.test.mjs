import assert from "node:assert/strict";
import test from "node:test";
import { recoverClientTurn } from "../server/chat-recovery.mjs";

test("a retry resumes an accepted user turn without appending it twice", () => {
  const messages = [
    { id: "before", from: "character", text: "Hi" },
    { id: "client-123", from: "user", text: "Hello" },
  ];
  const recovered = recoverClientTurn(messages, "client-123");
  assert.equal(recovered.index, 1);
  assert.equal(recovered.userMessage, messages[1]);
  assert.equal(recovered.reply, null);
});

test("a retry returns an already completed reply after a dropped response", () => {
  const reply = { id: "reply", from: "character", text: "Got it" };
  const messages = [
    { id: "client-123", from: "user", text: "Hello" },
    reply,
  ];
  assert.equal(recoverClientTurn(messages, "client-123").reply, reply);
});

test("a later unrelated reply is not mistaken for the failed turn's reply", () => {
  const messages = [
    { id: "client-123", from: "user", text: "First" },
    { id: "client-456", from: "user", text: "Second" },
    { id: "reply", from: "character", text: "Second reply" },
  ];
  assert.equal(recoverClientTurn(messages, "client-123").reply, null);
});
