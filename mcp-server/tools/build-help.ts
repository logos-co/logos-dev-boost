import * as fs from "node:fs";
import * as path from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const buildHelpTool: Tool = {
  name: "logos_build_help",
  description:
    "Provides context-aware build commands, troubleshooting tips, and the code generation pipeline explanation for the current Logos project. Detects project type and suggests appropriate commands.",
  inputSchema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        description: "What you want to do: 'build', 'test', 'run', 'package', 'develop', 'troubleshoot'",
      },
      error: {
        type: "string",
        description: "Build error message to troubleshoot (optional)",
      },
      directory: {
        type: "string",
        description: "Project directory (defaults to current directory)",
      },
    },
  },
};

function detectProjectType(dir: string): {
  isUniversal: boolean;
  isUiApp: boolean;
  name: string;
  hasFlake: boolean;
} {
  const result = { isUniversal: false, isUiApp: false, name: "unknown", hasFlake: false };

  const metadataPath = path.join(dir, "metadata.json");
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    result.name = metadata.name || "unknown";
    result.isUniversal = metadata.interface === "universal";
    result.isUiApp = metadata.type === "ui";
  }

  result.hasFlake = fs.existsSync(path.join(dir, "flake.nix"));

  return result;
}

export function handleBuildHelp(args: Record<string, unknown>) {
  const action = (args.action as string) || "build";
  const error = args.error as string | undefined;
  const dir = (args.directory as string) || process.cwd();

  const project = detectProjectType(dir);
  const sections: string[] = [];

  if (error) {
    sections.push(troubleshoot(error, project));
  }

  switch (action) {
    case "build":
      sections.push(buildHelp(project));
      break;
    case "test":
      sections.push(testHelp(project));
      break;
    case "run":
      sections.push(runHelp(project));
      break;
    case "package":
      sections.push(packageHelp(project));
      break;
    case "develop":
      sections.push(developHelp(project));
      break;
    case "troubleshoot":
      sections.push(commonIssues(project));
      break;
    default:
      sections.push(buildHelp(project));
  }

  return {
    content: [{ type: "text" as const, text: sections.join("\n\n") }],
  };
}

function buildHelp(project: { isUniversal: boolean; name: string; hasFlake: boolean }): string {
  const lines = ["## Build Commands\n"];

  lines.push("```bash");
  lines.push("nix build          # Build the module/app");
  lines.push("nix build -L       # Build with streaming logs");
  lines.push("nix build .#lib    # Build just the shared library");
  lines.push("```");

  if (project.isUniversal) {
    lines.push("\n### Universal Module Build Pipeline\n");
    lines.push("This is a universal C++ module. The build process:");
    lines.push("1. `preConfigure` runs `logos-cpp-generator --from-header`");
    lines.push("2. Generator reads `src/" + project.name + "_impl.h` and `metadata.json`");
    lines.push("3. Generator produces `generated_code/" + project.name + "_qt_glue.h` and `" + project.name + "_dispatch.cpp`");
    lines.push("4. CMake compiles your impl + generated code into a Qt plugin");
    lines.push("\n**Important:** Your source code must be pure C++ (std::string, int64_t, etc.). No Qt types.");
  }

  lines.push("\n### In the workspace\n");
  lines.push("```bash");
  lines.push(`ws build logos-${project.name.replace(/_/g, "-")}              # Build`);
  lines.push(`ws build logos-${project.name.replace(/_/g, "-")} --auto-local  # Build with local dep overrides`);
  lines.push("```");

  return lines.join("\n");
}

function testHelp(project: { isUniversal: boolean; name: string }): string {
  const lines = ["## Test Commands\n"];

  if (project.isUniversal) {
    lines.push("### Unit Tests (direct impl class testing)\n");
    lines.push("```bash");
    lines.push("nix flake check -L    # Run Nix-defined checks");
    lines.push("```\n");
    lines.push("Unit tests instantiate `" + project.name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("") + "Impl` directly — no logoscore needed.\n");
  }

  lines.push("### Integration Tests with logoscore\n");
  lines.push("```bash");
  lines.push(`logoscore -m ./result/lib -l ${project.name} -c "${project.name}.methodName(args)"`);
  lines.push("```\n");

  lines.push("### In the workspace\n");
  lines.push("```bash");
  lines.push(`ws test logos-${project.name.replace(/_/g, "-")}`);
  lines.push(`ws test logos-${project.name.replace(/_/g, "-")} --auto-local`);
  lines.push("```");

  return lines.join("\n");
}

function runHelp(project: { isUniversal: boolean; isUiApp: boolean; name: string }): string {
  if (project.isUiApp) {
    return `## Run UI App

\`\`\`bash
nix build
cp -r result/* ~/.local/share/Logos/LogosBasecampDev/plugins/${project.name}/
# Launch Basecamp
\`\`\`

QML changes hot-reload in dev mode. C++ changes require rebuild.`;
  }

  return `## Run Module with logoscore

\`\`\`bash
nix build
logoscore -m ./result/lib -l ${project.name}
\`\`\`

To call a method:
\`\`\`bash
logoscore -m ./result/lib -l ${project.name} -c "${project.name}.methodName(args)"
\`\`\``;
}

function packageHelp(project: { name: string }): string {
  return `## Package for Distribution

\`\`\`bash
# Build
nix build

# Create LGX package
lgx create ${project.name}
lgx add ${project.name}.lgx -v linux-x86_64 -f ./result/lib/${project.name}_plugin.so
lgx add ${project.name}.lgx -v darwin-arm64 -f ./result/lib/${project.name}_plugin.dylib
lgx verify ${project.name}.lgx

# Install locally
lgpm --modules-dir ./test-modules install --file ${project.name}.lgx

# Test installed package
logoscore -m ./test-modules -l ${project.name} -c "${project.name}.methodName(args)"
\`\`\``;
}

function developHelp(project: { name: string }): string {
  return `## Development Shell

\`\`\`bash
nix develop                           # Enter dev shell
cmake -B build -GNinja && cmake --build build   # Build with CMake directly
\`\`\`

The dev shell provides Qt, the SDK, and all build dependencies.`;
}

function troubleshoot(error: string, project: { isUniversal: boolean; name: string }): string {
  const lines = ["## Troubleshooting\n"];
  const errorLower = error.toLowerCase();

  if (errorLower.includes("logosmodule.cmake not found") || errorLower.includes("logos_module_builder_root")) {
    lines.push("**Fix:** This means you're running CMake outside of Nix. Use `nix build` or `nix develop` first.");
  } else if (errorLower.includes("q_plugin_metadata") || errorLower.includes("metadata.json")) {
    lines.push("**Fix:** Ensure `metadata.json` is copied to the build directory. Add to CMakeLists.txt:");
    lines.push("```cmake");
    lines.push("configure_file(${CMAKE_CURRENT_SOURCE_DIR}/metadata.json ${CMAKE_CURRENT_BINARY_DIR}/metadata.json COPYONLY)");
    lines.push("```");
  } else if (errorLower.includes("qt_glue") || errorLower.includes("dispatch.cpp") || errorLower.includes("generated_code")) {
    lines.push("**Fix:** The code generator hasn't run. Check that `preConfigure` in flake.nix runs:");
    lines.push("```bash");
    lines.push(`logos-cpp-generator --from-header src/${project.name}_impl.h --backend qt --impl-class ${project.name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("")}Impl --impl-header ${project.name}_impl.h --metadata metadata.json --output-dir ./generated_code`);
    lines.push("```");
  } else if (errorLower.includes("find_package") || errorLower.includes("could not find")) {
    lines.push("**Fix:** Add the missing package to metadata.json `nix.cmake.find_packages` and `nix.packages.runtime`.");
  } else if (errorLower.includes("/nix/store")) {
    lines.push("**Fix:** Store references in the output mean it's a dev build, not portable. Use `nix build .#portable` for distribution.");
  } else if (errorLower.includes("git") || errorLower.includes("not a git")) {
    lines.push("**Fix:** Nix flakes require git tracking. Run `git add -A` before `nix build`.");
  } else {
    lines.push("**General tips:**");
    lines.push("- Build with `-L` for full logs: `nix build -L`");
    lines.push("- Ensure all files are git-tracked: `git add -A`");
    lines.push("- Check that metadata.json `name` matches the binary prefix");
    if (project.isUniversal) {
      lines.push("- Verify the impl class name matches `--impl-class` in flake.nix preConfigure");
      lines.push("- Ensure all C++ types in the impl header are in the supported type mapping");
    }
  }

  lines.push("\n**Error:** " + error);
  return lines.join("\n");
}

function commonIssues(project: { isUniversal: boolean }): string {
  const lines = ["## Common Issues\n"];

  lines.push("1. **'Not a git repository'** — Run `git init && git add -A`");
  lines.push("2. **cmake outside nix** — Always use `nix build` or `nix develop` first");
  lines.push("3. **Qt version mismatch** — Qt comes from logos-cpp-sdk, never install separately");
  lines.push("4. **Missing dependencies** — Add to `metadata.json` `nix.packages.runtime`");
  lines.push("5. **Binary name mismatch** — `name` in metadata.json must match the binary prefix");

  if (project.isUniversal) {
    lines.push("6. **Generated files not found** — Check `preConfigure` runs logos-cpp-generator");
    lines.push("7. **Unknown type mapped to any** — Use types from the supported mapping table");
    lines.push("8. **Impl class not found** — `--impl-class` must exactly match the class name");
  }

  return lines.join("\n");
}
