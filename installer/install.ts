import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { execSync } from "node:child_process";

interface DetectedProject {
  name: string;
  type: string;
  interface: string;
  description: string;
}

interface DetectedTools {
  claudeCode: boolean;
  cursor: boolean;
  codex: boolean;
  gemini: boolean;
}

function detectProject(projectDir: string): DetectedProject {
  const result: DetectedProject = {
    name: "unknown",
    type: "unknown",
    interface: "none",
    description: "",
  };

  // Check for full-app root
  const projectJsonPath = path.join(projectDir, "project.json");
  if (fs.existsSync(projectJsonPath)) {
    const proj = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8"));
    if (proj.type === "full-app") {
      result.name = proj.name || "unknown";
      result.type = "Full App (module + UI)";
      result.interface = "N/A";
      result.description = proj.description || "";
      return result;
    }
  }

  // Fallback structural detection
  if (fs.existsSync(path.join(projectDir, "module", "metadata.json")) &&
      fs.existsSync(path.join(projectDir, "ui", "metadata.json"))) {
    const moduleMeta = JSON.parse(fs.readFileSync(path.join(projectDir, "module", "metadata.json"), "utf-8"));
    result.name = moduleMeta.name || "unknown";
    result.type = "Full App (module + UI)";
    result.interface = "N/A";
    result.description = moduleMeta.description || "";
    return result;
  }

  const metadataPath = path.join(projectDir, "metadata.json");
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    result.name = metadata.name || "unknown";
    result.type = metadata.type === "ui" ? "UI App" : "Module";
    result.interface = metadata.interface === "universal" ? "Universal" : "Legacy";
    result.description = metadata.description || "";
  }

  return result;
}

function detectTools(): DetectedTools {
  const tools: DetectedTools = {
    claudeCode: false,
    cursor: false,
    codex: false,
    gemini: false,
  };

  try { execSync("which claude", { stdio: "pipe" }); tools.claudeCode = true; } catch {}
  try { execSync("which cursor", { stdio: "pipe" }); tools.cursor = true; } catch {}
  try { execSync("which codex", { stdio: "pipe" }); tools.codex = true; } catch {}
  try { execSync("which gemini", { stdio: "pipe" }); tools.gemini = true; } catch {}

  // Also check for config directories
  const home = process.env.HOME || "";
  if (fs.existsSync(path.join(home, ".claude"))) tools.claudeCode = true;
  if (fs.existsSync(path.join(home, ".cursor"))) tools.cursor = true;

  return tools;
}

function copySkills(boostDir: string, projectDir: string, targetDir: string) {
  const srcSkills = path.join(boostDir, "skills");
  if (!fs.existsSync(srcSkills)) return;

  const skills = fs.readdirSync(srcSkills).filter((d) => {
    return fs.existsSync(path.join(srcSkills, d, "SKILL.md"));
  });

  for (const skill of skills) {
    const destDir = path.join(projectDir, targetDir, skill);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(
      path.join(srcSkills, skill, "SKILL.md"),
      path.join(destDir, "SKILL.md")
    );
  }
}

function generateMcpJson(projectDir: string, boostDir: string) {
  const mcpConfig: Record<string, unknown> = {
    mcpServers: {
      "logos-dev-boost": {
        command: "node",
        args: [path.join(boostDir, "dist", "mcp-server", "index.js")],
      },
    },
  };

  // Merge with existing .mcp.json if present
  const mcpPath = path.join(projectDir, ".mcp.json");
  if (fs.existsSync(mcpPath)) {
    const existing = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
    if (existing.mcpServers) {
      (mcpConfig.mcpServers as Record<string, unknown>) = {
        ...existing.mcpServers,
        ...(mcpConfig.mcpServers as Record<string, unknown>),
      };
    }
  }

  fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + "\n");
}

export async function runInstall(projectDir: string, boostDir: string) {
  const project = detectProject(projectDir);
  const tools = detectTools();

  console.log("\nlogos-dev-boost install");
  console.log("─".repeat(40));
  console.log(`\nDetected project:`);
  console.log(`  Name:      ${project.name}`);
  console.log(`  Type:      ${project.type}`);
  console.log(`  Interface: ${project.interface}`);
  if (project.description) {
    console.log(`  Desc:      ${project.description}`);
  }

  console.log(`\nDetected AI tools:`);
  console.log(`  Claude Code: ${tools.claudeCode ? "yes" : "not found"}`);
  console.log(`  Cursor:      ${tools.cursor ? "yes" : "not found"}`);
  console.log(`  Codex:       ${tools.codex ? "yes" : "not found"}`);
  console.log(`  Gemini CLI:  ${tools.gemini ? "yes" : "not found"}`);

  const generated: string[] = [];

  // Generate AGENTS.md (universal — works with all tools)
  console.log("\nGenerating context files...");
  try {
    const genDir = path.join(boostDir, "dist", "generators");

    execSync(`node "${path.join(genDir, "generate-agents-md.js")}" "${projectDir}" "${boostDir}"`, { stdio: "pipe" });
    generated.push("AGENTS.md");

    if (tools.claudeCode) {
      execSync(`node "${path.join(genDir, "generate-claude-md.js")}" "${projectDir}" "${boostDir}"`, { stdio: "pipe" });
      generated.push("CLAUDE.md");

      copySkills(boostDir, projectDir, ".claude/skills");
      generated.push(".claude/skills/ (9 skills)");
    }

    if (tools.cursor) {
      execSync(`node "${path.join(genDir, "generate-cursor-rules.js")}" "${projectDir}" "${boostDir}"`, { stdio: "pipe" });
      generated.push(".cursor/rules/logos.mdc");
    }

    // Install skills for non-Claude tools (use .agents/skills/)
    if (tools.codex || tools.gemini) {
      copySkills(boostDir, projectDir, ".agents/skills");
      generated.push(".agents/skills/ (9 skills)");
    }

    // Generate MCP configuration
    generateMcpJson(projectDir, boostDir);
    generated.push(".mcp.json");

  } catch (err) {
    console.log("  (some generators not built yet — run 'npm run build' first)");
  }

  console.log("\nGenerated files:");
  for (const file of generated) {
    console.log(`  ${file}`);
  }

  console.log("\nSetup complete. Your AI tools now have Logos development context.");

  if (tools.claudeCode) {
    console.log("\nClaude Code: CLAUDE.md + skills loaded automatically.");
    console.log("  MCP: should auto-detect from .mcp.json. If not:");
    console.log("  claude mcp add -s local -t stdio logos-dev-boost node " +
      path.join(boostDir, "dist", "mcp-server", "index.js"));
  }

  if (tools.cursor) {
    console.log("\nCursor: AGENTS.md + .cursor/rules loaded automatically.");
    console.log("  MCP: Open Command Palette -> '/open MCP Settings' -> toggle on logos-dev-boost");
  }

  if (tools.codex) {
    console.log("\nCodex: AGENTS.md loaded automatically.");
    console.log("  MCP: codex mcp add logos-dev-boost -- node " +
      path.join(boostDir, "dist", "mcp-server", "index.js"));
  }

  if (tools.gemini) {
    console.log("\nGemini CLI: AGENTS.md loaded automatically.");
    console.log("  MCP: gemini mcp add -s project -t stdio logos-dev-boost node " +
      path.join(boostDir, "dist", "mcp-server", "index.js"));
  }
}
