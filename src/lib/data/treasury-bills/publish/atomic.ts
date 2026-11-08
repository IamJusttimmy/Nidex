import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PublishRefusal } from "./guards";

/**
 * Write `text` to `target` so that the target is either the old file or the complete new file, never a mix.
 * The text goes to a temporary file beside the target, is read back and checked, and only then renamed over
 * the target. If anything fails, the temporary file is removed and the target is untouched.
 */
export function writeFileAtomic(target: string, text: string, verify: (written: string) => void = () => {}): void {
  mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, text, "utf8");
    const back = readFileSync(temp, "utf8");
    if (back !== text) throw new PublishRefusal("readback_mismatch", "The file read back from disk is not what was written.");
    verify(back);
    renameSync(temp, target);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}