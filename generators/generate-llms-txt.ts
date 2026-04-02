import * as fs from "node:fs";
import * as path from "node:path";

function generateLlmsTxt(boostDir: string): string {
  const lines: string[] = [];

  lines.push("# Logos Development Platform");
  lines.push("");
  lines.push("> Logos is a modular application platform built with C++17, Qt 6, and Nix.");
  lines.push("> Modules are independently developed plugins that provide backend services");
  lines.push("> or graphical interfaces within the Logos ecosystem. Core modules use a");
  lines.push("> pure C++ universal interface with generated Qt glue. UI apps use IComponent.");
  lines.push("");

  lines.push("## Getting Started");
  lines.push("- [Module Development Guide](docs/spec.md): How to create Logos modules and UI apps");
  lines.push("- [Project Structure](docs/project.md): Repo layout, CLI reference, extension points");
  lines.push("");

  lines.push("## Guidelines");

  const guidelinesDir = path.join(boostDir, "guidelines");
  if (fs.existsSync(guidelinesDir)) {
    const files = fs.readdirSync(guidelinesDir).filter((f) => f.endsWith(".md")).sort();
    for (const file of files) {
      const name = file.replace(".md", "").replace(/-/g, " ");
      lines.push(`- [${name}](guidelines/${file}): ${getGuidelineDescription(file)}`);
    }
  }
  lines.push("");

  lines.push("## Skills");

  const skillsDir = path.join(boostDir, "skills");
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir).filter((d) => {
      return fs.existsSync(path.join(skillsDir, d, "SKILL.md"));
    });
    for (const skill of skills) {
      const skillPath = path.join(skillsDir, skill, "SKILL.md");
      const content = fs.readFileSync(skillPath, "utf-8");
      const descMatch = content.match(/^description:\s*(.+)$/m);
      const desc = descMatch ? descMatch[1].trim() : skill;
      lines.push(`- [${skill}](skills/${skill}/SKILL.md): ${desc}`);
    }
  }
  lines.push("");

  lines.push("## Optional");
  lines.push("- [Full Documentation](docs/spec.md): Complete spec with user journeys");
  lines.push("- [MCP Server](docs/project.md#mcp-server): Live project introspection tools");

  return lines.join("\n");
}

function getGuidelineDescription(filename: string): string {
  const descriptions: Record<string, string> = {
    "codegen.md": "logos-cpp-generator pipeline, type mapping, LIDL format",
    "core.md": "Two component types, naming conventions, file structure",
    "metadata-json.md": "Full metadata.json schema and field reference",
    "nix-build.md": "Nix flake patterns, build commands, overrides",
    "testing.md": "Unit tests, logoscore integration, TEST_GROUPS",
    "ui-app.md": "IComponent pattern, C++/QML boundary, design system",
    "universal-module.md": "Pure C++ impl pattern, type mapping, codegen pipeline",
  };
  return descriptions[filename] || filename;
}

function generateLlmsFullTxt(boostDir: string): string {
  const sections: string[] = [];

  sections.push("# Logos Development Platform — Full Documentation\n");

  const docsDir = path.join(boostDir, "docs");
  if (fs.existsSync(docsDir)) {
    for (const file of ["spec.md", "project.md"]) {
      const filePath = path.join(docsDir, file);
      if (fs.existsSync(filePath)) {
        sections.push(fs.readFileSync(filePath, "utf-8"));
        sections.push("\n---\n");
      }
    }
  }

  const guidelinesDir = path.join(boostDir, "guidelines");
  if (fs.existsSync(guidelinesDir)) {
    const files = fs.readdirSync(guidelinesDir).filter((f) => f.endsWith(".md")).sort();
    for (const file of files) {
      sections.push(fs.readFileSync(path.join(guidelinesDir, file), "utf-8"));
      sections.push("\n---\n");
    }
  }

  return sections.join("\n");
}

const boostDir = process.argv[2] || path.resolve(import.meta.dirname, "..", "..");

const llmsTxt = generateLlmsTxt(boostDir);
fs.writeFileSync(path.join(boostDir, "llms.txt"), llmsTxt);
console.log(`Generated llms.txt`);

const llmsFullTxt = generateLlmsFullTxt(boostDir);
fs.writeFileSync(path.join(boostDir, "llms-full.txt"), llmsFullTxt);
console.log(`Generated llms-full.txt`);
