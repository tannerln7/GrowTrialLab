import { constants, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

async function ensureWritableDevCache() {
  const nextDir = path.resolve(process.cwd(), ".next");
  const devDir = path.join(nextDir, "dev");

  await fs.mkdir(nextDir, { recursive: true });
  if (!existsSync(devDir)) {
    return;
  }

  const isPosix = typeof process.getuid === "function";
  const currentUid = isPosix ? process.getuid() : null;
  const stat = await fs.stat(devDir);

  let writable = true;
  try {
    await fs.access(devDir, constants.W_OK);
  } catch {
    writable = false;
  }

  const ownedByAnotherUser =
    isPosix && currentUid !== null ? stat.uid !== currentUid : false;
  if (!ownedByAnotherUser && writable) {
    return;
  }

  const quarantineDir = path.join(nextDir, `dev-stale-${Date.now()}`);
  await fs.rename(devDir, quarantineDir);
  console.warn(
    `[dev-cache] moved .next/dev to ${path.relative(process.cwd(), quarantineDir)} ` +
      "to avoid lockfile permission errors.",
  );
}

ensureWritableDevCache().catch((error) => {
  console.error("[dev-cache] failed to prepare .next/dev cache", error);
  process.exitCode = 1;
});
