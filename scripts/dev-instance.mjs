import fs from "node:fs";
import net from "node:net";

export function claimDevPid(file, pid = process.pid, isAlive = candidate => {
  try { process.kill(candidate, 0); return true; } catch (error) { return error.code === "EPERM"; }
}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, String(pid), { flag: "wx" });
      return () => {
        try { if (fs.readFileSync(file, "utf8").trim() === String(pid)) fs.unlinkSync(file); } catch {}
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const previous = fs.readFileSync(file, "utf8").trim();
      const owner = Number(previous);
      if (owner > 0 && isAlive(owner)) throw new Error("AniMessenger is already running. Use its existing tray to restart it.");
      if (fs.readFileSync(file, "utf8").trim() === previous) fs.unlinkSync(file);
    }
  }
  throw new Error("Another AniMessenger launch is in progress.");
}

export function portIsOccupied(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = occupied => { socket.destroy(); resolve(occupied); };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1500, () => finish(true));
  });
}
