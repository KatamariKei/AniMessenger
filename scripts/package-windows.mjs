import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "release", "AniMessenger-Windows");

await fs.rm(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
await fs.mkdir(path.join(output, "scripts"), { recursive: true });
for (const folder of ["dist", "server", "workflows"]) {
  await fs.cp(path.join(root, folder), path.join(output, folder), { recursive: true });
}
await Promise.all([
  fs.copyFile(path.join(root, "scripts", "launch.mjs"), path.join(output, "scripts", "launch.mjs")),
  fs.copyFile(path.join(root, "installer", "AniMessenger.cmd"), path.join(output, "AniMessenger.cmd")),
  fs.copyFile(path.join(root, "installer", "AniMessenger.vbs"), path.join(output, "AniMessenger.vbs")),
  fs.copyFile(path.join(root, "installer", "Install-AniMessenger.ps1"), path.join(output, "Install-AniMessenger.ps1")),
  fs.copyFile(path.join(root, "LICENSE"), path.join(output, "LICENSE")),
  fs.copyFile(path.join(root, "docs", "WINDOWS-INSTALLER.md"), path.join(output, "README-INSTALL.txt")),
]);
console.log("Windows package prepared at " + output);
