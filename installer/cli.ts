import * as path from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log(`logos-dev-boost — AI-assisted development accelerator for Logos

Usage:
  logos-dev-boost init <name> --type <module|ui-qml|ui-qml-backend> [--external-lib]
  logos-dev-boost install
  logos-dev-boost generate [--agents-md] [--claude-md] [--cursor-rules] [--llms-txt]
  logos-dev-boost --help

Commands:
  init        Scaffold a new Logos module or UI app
  install     Configure AI tools for an existing project
  generate    Regenerate AI context files (AGENTS.md, CLAUDE.md, etc.)

Options:
  --type module           Universal C++ module (pure C++, generated Qt glue)
  --type ui-qml           Pure QML UI app for Basecamp (no C++)
  --type ui-qml-backend   QML + process-isolated C++ backend UI app
  --external-lib      Include external library wrapping scaffold (modules only)
  --help              Show this help message
`);
}

async function main() {
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  const boostDir = path.resolve(import.meta.dirname, "..", "..");

  switch (command) {
    case "init": {
      const name = args[1];
      if (!name) {
        console.error("Error: name is required. Usage: logos-dev-boost init <name> --type <module|ui-qml|ui-qml-backend>");
        process.exit(1);
      }

      const typeIdx = args.indexOf("--type");
      const type = typeIdx >= 0 ? args[typeIdx + 1] : "module";
      const externalLib = args.includes("--external-lib");

      if (!["module", "ui-qml", "ui-qml-backend"].includes(type)) {
        console.error("Error: --type must be 'module', 'ui-qml', or 'ui-qml-backend'");
        process.exit(1);
      }

      console.log(`\nScaffolding Logos ${type}: ${name}`);
      console.log("─".repeat(40));

      // Use the MCP scaffold tool logic directly
      const { handleScaffold } = await import("../mcp-server/tools/scaffold.js");
      const result = handleScaffold({
        name,
        type,
        externalLib,
        directory: process.cwd(),
      });

      const text = result.content[0].text;
      if (result.isError) {
        console.error(text);
        process.exit(1);
      }

      const output = JSON.parse(text);
      console.log(`\nCreated ${output.files_created.length} files in ${path.basename(output.project_dir)}/`);
      for (const file of output.files_created) {
        console.log(`  ${file}`);
      }

      // Generate AI context files
      console.log("\nGenerating AI context files...");
      const projectDir = output.project_dir;
      try {
        const genDir = path.join(boostDir, "dist", "generators");
        execSync(`node "${path.join(genDir, "generate-agents-md.js")}" "${projectDir}" "${boostDir}"`, { stdio: "pipe" });
        execSync(`node "${path.join(genDir, "generate-claude-md.js")}" "${projectDir}" "${boostDir}"`, { stdio: "pipe" });
        console.log("  AGENTS.md");
        console.log("  CLAUDE.md");
      } catch {
        console.log("  (skipped — generators not built yet. Run 'npm run build' first)");
      }

      // Generate .mcp.json pointing to the MCP server
      const mcpServerJs = path.join(boostDir, "dist", "mcp-server", "index.js");
      const mcpConfig = {
        mcpServers: {
          "logos-dev-boost": {
            command: process.execPath,
            args: [mcpServerJs],
          },
        },
      };
      const fs = await import("node:fs");
      fs.writeFileSync(
        path.join(projectDir, ".mcp.json"),
        JSON.stringify(mcpConfig, null, 2) + "\n"
      );
      console.log("  .mcp.json (MCP server — auto-detected by Claude Code & Cursor)");

      // Copy skills for Claude Code
      const srcSkills = path.join(boostDir, "skills");
      if (fs.existsSync(srcSkills)) {
        const skills = fs.readdirSync(srcSkills).filter((d: string) =>
          fs.existsSync(path.join(srcSkills, d, "SKILL.md"))
        );
        for (const skill of skills) {
          const destDir = path.join(projectDir, ".claude", "skills", skill);
          fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(
            path.join(srcSkills, skill, "SKILL.md"),
            path.join(destDir, "SKILL.md")
          );
        }
        console.log(`  .claude/skills/ (${skills.length} skills for Claude Code)`);
      }

      console.log("\nNext steps:");
      for (const step of output.next_steps) {
        console.log(`  ${step}`);
      }
      break;
    }

    case "install": {
      const { runInstall } = await import("./install.js");
      await runInstall(process.cwd(), boostDir);
      break;
    }

    case "generate": {
      console.log("Generating AI context files...\n");
      const projectDir = process.cwd();
      const genDir = path.join(boostDir, "dist", "generators");

      const all = !args.includes("--agents-md") && !args.includes("--claude-md") &&
                  !args.includes("--cursor-rules") && !args.includes("--llms-txt");

      if (all || args.includes("--agents-md")) {
        execSync(`node "${path.join(genDir, "generate-agents-md.js")}" "${projectDir}" "${boostDir}"`, { stdio: "inherit" });
      }
      if (all || args.includes("--claude-md")) {
        execSync(`node "${path.join(genDir, "generate-claude-md.js")}" "${projectDir}" "${boostDir}"`, { stdio: "inherit" });
      }
      if (all || args.includes("--cursor-rules")) {
        execSync(`node "${path.join(genDir, "generate-cursor-rules.js")}" "${projectDir}" "${boostDir}"`, { stdio: "inherit" });
      }
      if (all || args.includes("--llms-txt")) {
        execSync(`node "${path.join(genDir, "generate-llms-txt.js")}" "${boostDir}"`, { stdio: "inherit" });
      }

      console.log("\nDone.");
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
