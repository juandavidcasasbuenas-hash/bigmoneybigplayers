import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { CHARACTERS } from "../src/data/characters";
const binary =
  process.env.BLENDER_BIN ||
  (existsSync("/Applications/Blender.app/Contents/MacOS/Blender")
    ? "/Applications/Blender.app/Contents/MacOS/Blender"
    : "blender");
writeFileSync(
  resolve("assets/blender/characters.json"),
  JSON.stringify(CHARACTERS, null, 2) + "\n",
);
for (const script of ["build-characters.py", "prepare-blender-sources.py"]) {
  const result = spawnSync(
    binary,
    [
      "--background",
      "--factory-startup",
      "--python-exit-code",
      "1",
      "--python",
      resolve("scripts", script),
      "--",
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status) process.exit(result.status);
}
