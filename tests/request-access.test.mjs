import test from "node:test";
import assert from "node:assert/strict";
import { discoverLocalProxyOrigins, requestAccess } from "../server/request-access.mjs";

// Documentation-only addresses simulate local interfaces without real machine data.
const options = { port: 5174, hostname: "test-pc", interfaces: { test: [{ address: "192.0.2.20", family: "IPv4" }, { address: "100.64.0.2", family: "IPv4" }] } };
const request = (host, origin, extra = {}, remoteAddress = "127.0.0.1") => ({ headers: { host, ...(origin !== undefined ? { origin } : {}), ...extra }, socket: { remoteAddress } });

test("rejects unrelated websites, opaque origins and origin lookalikes", () => {
  for (const origin of ["https://untrusted.example", "null", "http://localhost.attacker.example:5174", "http://localhost:5174/", "http://user@localhost:5174"]) {
    assert.equal(requestAccess(request("localhost:5174", origin), options).allowed, false, origin);
  }
});

test("allows installed local, LAN and Tailscale IP interfaces from their own origin", () => {
  for (const host of ["localhost:5174", "127.0.0.1:5174", "[::1]:5174", "192.0.2.20:5174", "100.64.0.2:5174", "test-pc:5174"]) {
    const access = requestAccess(request(host, `http://${host}`), options);
    assert.equal(access.allowed, true, host);
    assert.equal(access.origin, `http://${host}`);
  }
});

test("supports the development frontend without granting arbitrary localhost ports", () => {
  assert.equal(requestAccess(request("127.0.0.1:5174", "http://localhost:5173"), { ...options, development: true }).allowed, true);
  assert.equal(requestAccess(request("127.0.0.1:5174", "http://localhost:5173"), options).allowed, false);
  assert.equal(requestAccess(request("127.0.0.1:5174", "http://localhost:9999"), { ...options, development: true }).allowed, false);
  assert.equal(requestAccess(request("192.0.2.20:5173", "http://192.0.2.20:5173"), options).allowed, true);
});

test("supports same-origin HTTPS Tailscale Serve through a local proxy", () => {
  const configured = { ...options, allowedOrigins: ["https://test.tailnet.ts.net"] };
  assert.equal(requestAccess(request("test.tailnet.ts.net", "https://test.tailnet.ts.net"), configured).allowed, true);
  assert.equal(requestAccess(request("127.0.0.1:5173", "https://test.tailnet.ts.net"), configured).allowed, true);
  assert.equal(requestAccess(request("test.tailnet.ts.net", "https://other.tailnet.ts.net"), configured).allowed, false);
  assert.equal(requestAccess(request("test.tailnet.ts.net", "https://test.tailnet.ts.net", {}, "192.0.2.30"), configured).allowed, false);
  assert.equal(requestAccess(request("other.tailnet.ts.net", "https://other.tailnet.ts.net"), configured).allowed, false);
});

test("Tailscale discovery trusts only this computer's DNS name and fails closed", async () => {
  assert.deepEqual(await discoverLocalProxyOrigins(async () => ({ stdout: JSON.stringify({ Self: { DNSName: "test.tailnet.ts.net." }, Peer: { other: { DNSName: "other.tailnet.ts.net." } } }) })), ["https://test.tailnet.ts.net"]);
  assert.deepEqual(await discoverLocalProxyOrigins(async () => { throw new Error("not installed"); }), []);
  assert.deepEqual(await discoverLocalProxyOrigins(async () => ({ stdout: '{"Self":{"DNSName":"untrusted.example"}}' })), []);
});

test("rejects unknown and malformed Host headers including DNS rebinding targets", () => {
  for (const host of ["untrusted.example:5174", "bad host", "localhost:5174/path", "localhost:5174#fragment", "user@localhost:5174", ""]) {
    assert.equal(requestAccess(request(host), options).allowed, false, host);
  }
});

test("checks referers and cross-site metadata when Origin is absent", () => {
  assert.equal(requestAccess(request("localhost:5174", undefined, { referer: "https://untrusted.example/page" }), options).allowed, false);
  assert.equal(requestAccess(request("localhost:5174", undefined, { "sec-fetch-site": "cross-site" }), options).allowed, false);
  assert.equal(requestAccess(request("localhost:5174", undefined, { referer: "http://localhost:5174/page" }), options).allowed, true);
  assert.equal(requestAccess(request("localhost:5174"), options).allowed, true);
});

test("additional proxy origins require an exact explicit entry", () => {
  const configured = { ...options, allowedOrigins: ["https://my-private-proxy.example"] };
  assert.equal(requestAccess(request("localhost:5174", "https://my-private-proxy.example"), configured).allowed, true);
  assert.equal(requestAccess(request("localhost:5174", "https://other.my-private-proxy.example"), configured).allowed, false);
});
