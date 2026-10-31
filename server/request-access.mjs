import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const loopback = hostname => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname.toLowerCase());

export async function discoverLocalProxyOrigins(run = promisify(execFile)) {
  try {
    const executable = process.platform === "win32"
      ? path.join(process.env.ProgramFiles || "C:/Program Files", "Tailscale", "tailscale.exe") : "tailscale";
    const { stdout } = await run(executable, ["status", "--json"], { timeout: 750, maxBuffer: 1024 * 1024, windowsHide: true });
    const name = String(JSON.parse(stdout)?.Self?.DNSName || "").replace(/\.$/, "").toLowerCase();
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\.ts\.net$/.test(name) ? [`https://${name}`] : [];
  } catch { return []; }
}

// Browser origin protection, not device authentication. LAN access is still an
// explicit runtime choice; private reverse proxies may forward the original Host.
export function requestAccess(request, { port, development = false, interfaces = os.networkInterfaces(), hostname = os.hostname(), allowedOrigins = [] } = {}) {
  const localNames = new Set(["localhost", "127.0.0.1", "[::1]", hostname.toLowerCase(), `${hostname.toLowerCase()}.local`]);
  for (const addresses of Object.values(interfaces)) for (const address of addresses || []) {
    localNames.add(address.family === "IPv6" ? `[${address.address.split("%")[0]}]` : address.address);
  }
  const explicit = new Set(allowedOrigins.map(value => new URL(value).origin));
  let target;
  try {
    target = new URL(`http://${request.headers.host || ""}`);
    if (target.username || target.password || target.pathname !== "/" || target.search || target.hash) return { allowed: false };
  } catch { return { allowed: false }; }
  const remote = request.socket?.remoteAddress || "";
  const localProxy = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote);
  const knownHost = localNames.has(target.hostname.toLowerCase())
    || (localProxy && [...explicit].some(origin => new URL(origin).host === target.host));
  if (!knownHost) return { allowed: false };
  const originHeader = request.headers.origin;
  const referer = request.headers.referer;
  if (!originHeader && !referer) return { allowed: request.headers["sec-fetch-site"] !== "cross-site" };
  let origin;
  try {
    origin = new URL(originHeader || referer);
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || (originHeader && origin.origin !== originHeader)) return { allowed: false };
  } catch { return { allowed: false }; }
  const sameHost = origin.host === target.host;
  const devFrontend = development && origin.protocol === "http:" && origin.port === "5173"
    && loopback(origin.hostname) && loopback(target.hostname)
    && Number(target.port) === Number(port);
  const allowed = sameHost || devFrontend || explicit.has(origin.origin);
  return { allowed, ...(allowed && originHeader ? { origin: origin.origin } : {}) };
}
