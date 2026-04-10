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
  isFullApp: boolean;
  name: string;
  moduleDir: string;
  uiDir: string;
  hasFlake: boolean;
} {
  const result = { isUniversal: false, isUiApp: false, isFullApp: false, name: "unknown", moduleDir: "", uiDir: "", hasFlake: false };

  // Check for full-app
  const projectJsonPath = path.join(dir, "project.json");
  if (fs.existsSync(projectJsonPath)) {
    const proj = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8"));
    if (proj.type === "full-app") {
      result.isFullApp = true;
      result.name = proj.name || "unknown";
      result.moduleDir = proj.module || `${proj.name}-module`;
      result.uiDir = proj.ui || `${proj.name}-ui`;
      result.hasFlake = false;
      return result;
    }
  }

  // Fallback structural detection
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const moduleEntry = entries.find((e: string) => e.endsWith("-module") &&
    fs.existsSync(path.join(dir, e, "metadata.json")));
  const uiEntry = entries.find((e: string) => e.endsWith("-ui") &&
    fs.existsSync(path.join(dir, e, "metadata.json")));
  if (moduleEntry && uiEntry) {
    const moduleMeta = JSON.parse(fs.readFileSync(path.join(dir, moduleEntry, "metadata.json"), "utf-8"));
    result.isFullApp = true;
    result.name = moduleMeta.name || "unknown";
    result.moduleDir = moduleEntry;
    result.uiDir = uiEntry;
    result.hasFlake = false;
    return result;
  }

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

function buildHelp(project: { isUniversal: boolean; isFullApp: boolean; name: string; moduleDir: string; uiDir: string; hasFlake: boolean }): string {
  const lines = ["## Build Commands\n"];

  if (project.isFullApp) {
    lines.push("Each sub-project is a standalone flake. Build them independently:");
    lines.push("```bash");
    lines.push(`cd ${project.moduleDir} && git init && git add -A && nix build   # build the module`);
    lines.push(`cd ${project.uiDir} && git init && git add -A && nix build       # build the UI app`);
    lines.push("nix build -L   # (run inside sub-project dir) Build with streaming logs");
    lines.push("```");
    lines.push("\n### In the workspace\n");
    lines.push("```bash");
    lines.push(`ws build logos-${project.name.replace(/_/g, "-")}    # module`);
    lines.push(`ws build logos-${project.name.replace(/_/g, "-")}-ui # UI app`);
    lines.push("```");
    return lines.join("\n");
  }

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

function testHelp(project: { isUniversal: boolean; isFullApp: boolean; name: string; moduleDir: string; uiDir: string }): string {
  const lines = ["## Test Commands\n"];
  const pascal = project.name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

  if (project.isFullApp) {
    lines.push("### Module unit tests\n");
    lines.push("```bash");
    lines.push(`cd ${project.moduleDir} && nix flake check -L`);
    lines.push("```\n");
    lines.push("### Integration test with logoscore\n");
    lines.push("```bash");
    lines.push(`logoscore -m ./${project.moduleDir}/result/lib -l ${project.name} -c "${project.name}.methodName(args)"`);
    lines.push("```\n");
    lines.push("### In the workspace\n");
    lines.push("```bash");
    lines.push(`ws test logos-${project.name.replace(/_/g, "-")}`);
    lines.push(`ws test logos-${project.name.replace(/_/g, "-")}-ui`);
    lines.push("```");
    return lines.join("\n");
  }

  if (project.isUniversal) {
    lines.push("### Unit Tests (logos-test-framework)\n");
    lines.push("```bash");
    lines.push("nix build .#unit-tests -L    # Build and run unit tests");
    lines.push("nix flake check -L           # Run all Nix checks including tests");
    lines.push("```\n");
    lines.push(`Unit tests instantiate \`${pascal}Impl\` directly — no logoscore needed.\n`);
    lines.push("Tests use `LOGOS_TEST()` macros and `LogosTestContext` for mocking.");
    lines.push("Test files live in `tests/` with `CMakeLists.txt` using `logos_test()`.");
    lines.push("`logos-module-builder` auto-detects `tests/CMakeLists.txt` and creates the `unit-tests` target.\n");
    lines.push("### Test Runner CLI\n");
    lines.push("```bash");
    lines.push(`./${project.name}_tests --filter <pattern>   # Run matching tests only`);
    lines.push(`./${project.name}_tests --json               # JSON output for CI/agents`);
    lines.push(`./${project.name}_tests --no-color           # Disable colored output`);
    lines.push("```\n");
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

function runHelp(project: { isUniversal: boolean; isUiApp: boolean; isFullApp: boolean; name: string; moduleDir: string; uiDir: string }): string {
  if (project.isFullApp) {
    return `## Run Full App

\`\`\`bash
# Build and test module
cd ${project.moduleDir} && nix build
logoscore -m ./${project.moduleDir}/result/lib -l ${project.name} -c "${project.name}.echo(hello)"

# Build UI app
cd ${project.uiDir} && nix build

# Install both and launch in Basecamp
cp -r ${project.moduleDir}/result/lib/* ~/.local/share/Logos/LogosBasecampDev/modules/
cp -r ${project.uiDir}/result/* ~/.local/share/Logos/LogosBasecampDev/plugins/${project.name}_ui/
\`\`\`

The UI app declares the module as a dependency — Basecamp will auto-load the module when the UI plugin is activated.`;
  }
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

function packageHelp(project: { name: string; isFullApp?: boolean; moduleDir?: string; uiDir?: string }): string {
  if (project.isFullApp) {
    return `## Package for Distribution

\`\`\`bash
# Build sub-projects
cd ${project.moduleDir} && nix build && cd ..
cd ${project.uiDir} && nix build && cd ..

# Package the module
lgx create ${project.name}
lgx add ${project.name}.lgx -v linux-x86_64 -f ./${project.moduleDir}/result/lib/${project.name}_plugin.so
lgx add ${project.name}.lgx -v darwin-arm64 -f ./${project.moduleDir}/result/lib/${project.name}_plugin.dylib
lgx verify ${project.name}.lgx

# Package the UI app
lgx create ${project.name}_ui
lgx add ${project.name}_ui.lgx -v linux-x86_64 -f ./${project.uiDir}/result/lib/${project.name}_ui_plugin.so
lgx add ${project.name}_ui.lgx -v darwin-arm64 -f ./${project.uiDir}/result/lib/${project.name}_ui_plugin.dylib
lgx verify ${project.name}_ui.lgx
\`\`\``;
  }
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
  } else if (errorLower.includes("logostest") || errorLower.includes("logos_test") || errorLower.includes("logos_test.h")) {
    lines.push("**Fix:** Test framework not found. Ensure `tests/CMakeLists.txt` uses `include(LogosTest)` and that `logos-module-builder` is your flake input (it provides the test framework automatically).");
  } else if (errorLower.includes("unit-tests") || errorLower.includes("unit_tests")) {
    lines.push("**Fix:** The `unit-tests` target requires `tests/CMakeLists.txt` in your project root. Create it with `include(LogosTest)` and `logos_test()`. The builder auto-detects it.");
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

function commonIssues(project: { isUniversal: boolean; isFullApp?: boolean }): string {
  const lines = ["## Common Issues\n"];

  lines.push("1. **'Not a git repository'** — Run `git init && git add -A`");
  lines.push("2. **cmake outside nix** — Always use `nix build` or `nix develop` first");
  lines.push("3. **Qt version mismatch** — Qt comes from logos-cpp-sdk, never install separately");
  lines.push("4. **Missing dependencies** — Add to `metadata.json` `nix.packages.runtime`");
  lines.push("5. **Binary name mismatch** — `name` in metadata.json must match the binary prefix");

  if (project.isFullApp) {
    lines.push("6. **Each sub-project needs its own git init** — Run `git init && git add -A` inside each sub-directory before `nix build`");
    lines.push("7. **Module input not found** — The ui flake.nix includes the module as an input via `path:../<name>-module`. Ensure the module dir exists at that relative path and is git-tracked.");
  }

  if (project.isUniversal) {
    lines.push("6. **Generated files not found** — Check `preConfigure` runs logos-cpp-generator");
    lines.push("7. **Unknown type mapped to any** — Use types from the supported mapping table");
    lines.push("8. **Impl class not found** — `--impl-class` must exactly match the class name");
    lines.push("9. **unit-tests not found** — Add `tests/CMakeLists.txt` with `include(LogosTest)` + `logos_test()`");
    lines.push("10. **LogosTest.cmake not found** — Ensure you build via `nix build .#unit-tests`, not raw cmake");
  }

  return lines.join("\n");
}
