import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The data side (the checker, the publisher and the script that runs them) must not depend on the website.
 * It may import only its own files under src/lib/data/treasury-bills and Node's built-in modules. No React,
 * no Next.js, no components, no pages, no "@/" alias.
 */
const root = path.resolve(__dirname, "..", "..", "..", "..", "..", ".."); // __tests__ is six folders below the project root
const allowedRoot = path.join(root, "src", "lib", "data", "treasury-bills");

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") found.push(...sourceFiles(full));
    } else if (/\.ts$/.test(name) && !/\.test\./.test(name)) {
      found.push(full);
    }
  }
  return found;
}

/** Module names in import and export-from statements (real statements only, not words inside comments). */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const fromStatements = [...text.matchAll(/^\s*(?:import|export)\s[^;"']*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1] as string);
  const bareImports = [...text.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1] as string);
  const dynamic = [...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] as string);
  return [...fromStatements, ...bareImports, ...dynamic];
}

describe("the data side is independent of the website", () => {
  const files = [...sourceFiles(allowedRoot), path.join(root, "scripts", "fetch-ntb.ts")];

  it("really sees imports (a check that finds nothing would pass for the wrong reason)", () => {
    const specs = importsOf(path.join(allowedRoot, "publish", "plan.ts"));
    expect(specs).toContain("../quality");
    expect(specs).toContain("./guards");
    expect(importsOf(path.join(root, "scripts", "fetch-ntb.ts"))).toContain("node:fs");
  });

  it("finds the files it is supposed to check", () => {
    const names = files.map((f) => path.basename(f));
    expect(names).toContain("fetch-ntb.ts");
    expect(names).toContain("classify.ts");
    expect(names).toContain("plan.ts");
  });

  it.each(files.map((f) => [path.relative(root, f), f]))("%s imports only its own data files and Node built-ins", (_name, file) => {
    for (const spec of importsOf(file as string)) {
      if (spec.startsWith("node:")) continue;
      expect(spec.startsWith("."), `${spec} is a package or alias import`).toBe(true);
      const target = path.resolve(path.dirname(file as string), spec);
      const inside = target === allowedRoot || target.startsWith(allowedRoot + path.sep);
      expect(inside, `${spec} reaches outside src/lib/data/treasury-bills`).toBe(true);
    }
  });
});