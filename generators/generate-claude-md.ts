import * as fs from "node:fs";
import * as path from "node:path";

function generateClaudeMd(projectDir: string, boostDir: string): string {
  const agentsPath = path.join(projectDir, "AGENTS.md");

  const lines: string[] = [];

  lines.push("# Logos Development Context (Claude Code)");
  lines.push("");

  if (fs.existsSync(agentsPath)) {
    const agentsContent = fs.readFileSync(agentsPath, "utf-8");
    const stripped = agentsContent
      .replace(/^# .*\n/, "")
      .replace(/^>.*\n/gm, "")
      .trim();
    lines.push(stripped);
  } else {
    lines.push("> Run `logos-dev-boost generate` to populate this file with Logos development context.");
  }

  lines.push("");
  lines.push("## Claude Code Skills");
  lines.push("");
  lines.push("The following skills are available in `.claude/skills/`:");
  lines.push("");

  const skillsDir = path.join(boostDir, "skills");
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir).filter((d) => {
      const skillPath = path.join(skillsDir, d, "SKILL.md");
      return fs.existsSync(skillPath);
    });

    for (const skill of skills) {
      const skillPath = path.join(skillsDir, skill, "SKILL.md");
      const content = fs.readFileSync(skillPath, "utf-8");
      const descMatch = content.match(/^description:\s*(.+)$/m);
      const desc = descMatch ? descMatch[1].trim() : skill;
      lines.push(`- **${skill}** — ${desc}`);
    }
  }

  lines.push("");
  lines.push("## MCP Server");
  lines.push("");
  lines.push("If configured in `.mcp.json`, the `logos-dev-boost` MCP server provides:");
  lines.push("- `logos_project_info` — Project metadata and build targets");
  lines.push("- `logos_search_docs` — Search Logos documentation");
  lines.push("- `logos_api_reference` — API reference for LogosAPI, LogosResult, type system");
  lines.push("- `logos_build_help` — Context-aware build commands and troubleshooting");
  lines.push("- `logos_scaffold` — Generate new module/app from template");

  return lines.join("\n");
}

const projectDir = process.argv[2] || process.cwd();
const boostDir = process.argv[3] || path.resolve(import.meta.dirname, "..", "..");

const content = generateClaudeMd(projectDir, boostDir);
const outputPath = path.join(projectDir, "CLAUDE.md");
fs.writeFileSync(outputPath, content);
console.log(`Generated ${outputPath}`);
