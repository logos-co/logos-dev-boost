import * as fs from "node:fs";
import * as path from "node:path";

function generateCursorRules(projectDir: string, boostDir: string): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push("description: Logos module and UI app development conventions");
  lines.push("globs: ['**/*.h', '**/*.cpp', '**/*.qml', '**/*.nix', '**/metadata.json', '**/CMakeLists.txt']");
  lines.push("alwaysApply: true");
  lines.push("---");
  lines.push("");
  lines.push("# Logos Development Rules");
  lines.push("");

  const guidelinesDir = path.join(boostDir, "guidelines");
  if (fs.existsSync(guidelinesDir)) {
    const priority = [
      "core.md",
      "universal-module.md",
      "ui-app.md",
      "codegen.md",
      "nix-build.md",
      "metadata-json.md",
      "testing.md",
    ];

    for (const file of priority) {
      const filePath = path.join(guidelinesDir, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        lines.push(content.trim());
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

const projectDir = process.argv[2] || process.cwd();
const boostDir = process.argv[3] || path.resolve(import.meta.dirname, "..", "..");

const content = generateCursorRules(projectDir, boostDir);

const cursorDir = path.join(projectDir, ".cursor", "rules");
fs.mkdirSync(cursorDir, { recursive: true });

const outputPath = path.join(cursorDir, "logos.mdc");
fs.writeFileSync(outputPath, content);
console.log(`Generated ${outputPath}`);
