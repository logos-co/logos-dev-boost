# Project Description

## Project Structure

```
logos-dev-boost/
├── docs/                             # Documentation (this directory)
│   ├── index.md                      # Entry point
│   ├── spec.md                       # Domain spec: purpose, journeys, features
│   └── project.md                    # Implementation details (this file)
├── guidelines/                       # Always-loaded AI conventions
│   ├── core.md                       # Two component types, naming, file structure
│   ├── universal-module.md           # Pure C++ impl pattern, type mapping, codegen
│   ├── ui-app.md                     # ui_qml apps: pure QML + QML with C++ backend
│   ├── nix-build.md                  # Flake structure, build commands, overrides
│   ├── testing.md                    # logoscore, unit tests, TEST_GROUPS
│   ├── metadata-json.md              # Full metadata.json schema
│   └── codegen.md                    # logos-cpp-generator pipeline, LIDL, types
├── skills/                           # On-demand task knowledge (agentskills.io)
│   ├── create-universal-module/      # Scaffold + implement a universal C++ module
│   ├── wrap-external-lib/            # Wrap a C/C++ library as a module
│   ├── create-ui-app/                # QML UI app for Basecamp (pure QML or QML + backend)
│   ├── package-lgx/                  # Create + distribute LGX packages
│   ├── inter-module-comm/            # LogosAPI patterns, dependency declaration
│   ├── testing-modules/              # logoscore + unit testing patterns
│   ├── nix-flake-setup/              # Flake config, overrides, workspace integration
│   └── add-to-workspace/             # Register module in logos-workspace
├── templates/                        # Scaffolding templates (used by init command)
│   ├── universal-module/             # Pure C++ module
│   ├── universal-module-extlib/      # With external library wrapping
│   └── ui-app/                       # QML UI app (pure QML + QML with backend)
├── generators/                       # Context file generators (TypeScript)
│   ├── generate-agents-md.ts         # AGENTS.md with compressed docs index
│   ├── generate-claude-md.ts         # CLAUDE.md (imports AGENTS.md content)
│   ├── generate-cursor-rules.ts      # .cursor/rules/logos.mdc
│   └── generate-llms-txt.ts          # llms.txt from docs/
├── mcp-server/                       # MCP server (TypeScript, stdio transport)
│   ├── index.ts                      # Server entry point
│   └── tools/                        # MCP tool implementations
│       ├── project-info.ts           # SDK version, module type, build targets
│       ├── search-docs.ts            # Full-text search over docs/ (fuse.js)
│       ├── api-reference.ts          # Type system, LogosAPI, LogosResult
│       ├── build-help.ts             # Context-aware build commands
│       └── scaffold.ts               # Wraps init templates
├── installer/                        # One-command setup
│   ├── cli.ts                        # CLI entry point (init, install, generate)
│   └── install.ts                    # IDE detection, file generation
├── tests/                            # Tests
├── flake.nix                         # Nix package definition
├── package.json                      # Node.js package
├── tsconfig.json                     # TypeScript configuration
└── README.md
```

## Stack, Frameworks & Dependencies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| MCP server | TypeScript, `@modelcontextprotocol/sdk` | AI agent tool integration via stdio |
| Documentation search | fuse.js | Full-text search over bundled docs |
| Context generators | TypeScript, Node.js | Generate AGENTS.md, CLAUDE.md, .cursor/rules |
| Scaffolding | Nix flake templates, `logos-module-builder` | Project initialization |
| Build/packaging | Nix flakes | Self-contained offline-capable distribution |

### External Logos Dependencies

| Dependency | Role | Source |
|-----------|------|--------|
| logos-module-builder | Nix flake templates for module scaffolding | github:logos-co/logos-module-builder |
| logos-cpp-sdk | SDK headers, code generator (`logos-cpp-generator`) | github:logos-co/logos-cpp-sdk |
| logos-liblogos | Runtime library documentation reference | github:logos-co/logos-liblogos |

## Components

### Guidelines

Guidelines are Markdown files loaded into the always-on context (AGENTS.md / CLAUDE.md). Each is kept under 2000 tokens to minimize context cost while providing essential conventions.

| Guideline | Content |
|-----------|---------|
| `core.md` | Two component types (Universal Module vs UI App), naming conventions, file structure, `metadata.json` as source of truth |
| `universal-module.md` | Pure C++ impl pattern, type mapping table, `"interface": "universal"`, impl class naming (`<name>_impl.h`), public methods = module API |
| `ui-app.md` | `ui_qml` apps: pure QML (logos.callModule bridge) and QML + C++ backend (Qt Remote Objects, .rep file, SimpleSource + ViewPluginBase, logos.module() replica) |
| `nix-build.md` | Flake structure, `follows` declarations, `preConfigure` for codegen, build commands, `--auto-local` |
| `testing.md` | Unit tests (call impl class directly), logoscore integration tests, `TEST_GROUPS`, `nix flake check` |
| `metadata-json.md` | Full schema including `"interface"`, `"dependencies"`, `"nix"` config, `"external_libraries"`, `"cmake"` settings |
| `codegen.md` | `logos-cpp-generator --from-header` pipeline, C++ to LIDL to Qt type mapping, generated file structure, LIDL format |

### Skills

Skills are on-demand knowledge modules following the agentskills.io specification. Each lives in its own directory with a `SKILL.md` file containing YAML frontmatter (`name`, `description`) and Markdown instructions.

| Skill | Trigger | Content |
|-------|---------|---------|
| `create-universal-module` | Creating a new Logos module | Full scaffold: metadata.json, flake.nix with preConfigure, CMakeLists.txt, impl header template |
| `wrap-external-lib` | Wrapping a C/C++ library | External library config, `extern "C"` patterns, based on logos-accounts-module |
| `create-ui-app` | Creating a Basecamp UI app | Two paths: pure QML (Main.qml + logos.callModule) or QML + C++ backend (.rep, SimpleSource, ViewPluginBase, logos.module replica) |
| `package-lgx` | Packaging for distribution | lgx create/add/verify workflow, portable builds, nix-bundle-lgx |
| `inter-module-comm` | Module-to-module calls | `LogosAPI::callModule()`, dependency declaration, `LogosResult` handling |
| `testing-modules` | Writing tests | Unit tests, logoscore integration, TEST_GROUPS, mock transport |
| `nix-flake-setup` | Nix configuration | Flake template, inputs, follows, preConfigure, override-input |
| `add-to-workspace` | Registering in logos-workspace | flake.nix inputs, scripts/ws REPOS, dep-graph.nix |

### Generators

TypeScript scripts that produce IDE-specific context files from the guidelines and documentation:

| Generator | Output | Description |
|-----------|--------|-------------|
| `generate-agents-md.ts` | `AGENTS.md` | Universal context file. Compressed docs index (~8-15KB), conventions, type system. Works with all AI tools. |
| `generate-claude-md.ts` | `CLAUDE.md` | Claude Code-specific context. Imports AGENTS.md content plus Claude-specific skill references. |
| `generate-cursor-rules.ts` | `.cursor/rules/logos.mdc` | Cursor-specific rules with file glob patterns for activation. |
| `generate-llms-txt.ts` | `llms.txt`, `llms-full.txt` | Machine-readable documentation index following the llms.txt specification. |

Generators detect the project type from `metadata.json` (`"interface": "universal"` vs `"type": "ui_qml"`) and include context specific to that project type.

### MCP Server

TypeScript MCP server using `@modelcontextprotocol/sdk` with stdio transport. Provides live project introspection tools.

| Tool | Input | Output |
|------|-------|--------|
| `logos_project_info` | (none — reads current directory) | Project type, interface type, SDK version, dependencies, build targets |
| `logos_search_docs` | `{ "query": "..." }` | Ranked search results from bundled documentation |
| `logos_api_reference` | `{ "interface": "LogosAPI" }` | Type mapping table, method signatures, usage examples |
| `logos_build_help` | `{ "action": "build" }` | Context-aware build commands, codegen pipeline explanation, troubleshooting |
| `logos_scaffold` | `{ "name": "...", "type": "module" }` | Creates project from template, returns file list and next steps |

### Installer

The installer (`install.ts`) performs interactive setup:

1. Detects project type from `flake.nix` inputs and `metadata.json`
2. Detects installed AI tools (checks for `.claude/`, `.cursor/`, presence of `claude`/`codex`/`gemini` in PATH)
3. Generates appropriate context files per detected tool
4. Builds MCP server locally (via Nix) to `.logos-dev-boost/`
5. Writes `.mcp.json` pointing to the built MCP server binary
6. Installs skills to tool-specific directories

## CLI Reference

### `logos-dev-boost init`

Scaffold a new Logos project.

```bash
nix run github:logos-co/logos-dev-boost -- init <name> --type <module|ui-qml|ui-qml-backend> [--external-lib]
```

| Argument | Description |
|----------|-------------|
| `<name>` | Project name (snake_case, e.g., `crypto_utils`) |
| `--type module` | Universal C++ module (default) |
| `--type ui-qml` | Pure QML UI app for Basecamp (no C++) |
| `--type ui-qml-backend` | QML + process-isolated C++ backend UI app |
| `--external-lib` | Add external library wrapping scaffold (modules only) |

Creates the directory, generates the appropriate template (mkLogosModule for modules, mkLogosQmlModule for UI apps), adds AI context files, and initializes git.

### `logos-dev-boost install`

Configure AI tools for an existing Logos project.

```bash
nix run github:logos-co/logos-dev-boost -- install
```

Interactive prompt asks which AI tools to configure. Generates context files and MCP server registration.

### `logos-dev-boost generate`

Regenerate context files (useful after updating dependencies or documentation).

```bash
nix run github:logos-co/logos-dev-boost -- generate [--agents-md] [--claude-md] [--cursor-rules] [--llms-txt]
```

Without flags, regenerates all context files. With flags, regenerates only the specified files.

## Operational

### Building logos-dev-boost

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Or via Nix (produces self-contained package)
nix build
```

### Testing

```bash
# Run tests
npm test

# Via Nix
nix flake check
```

### Nix Package Outputs

```nix
packages.default       # Full logos-dev-boost (docs + guidelines + skills + generators + MCP server)
packages.docs          # Documentation bundle only
apps.default           # CLI entry point (init, install, generate)
apps.mcp-server        # MCP server only
```

## Extension Points

### Custom Guidelines

Add `.md` files to your project's `.ai/guidelines/` directory. These are merged with logos-dev-boost guidelines when generating AGENTS.md / CLAUDE.md.

### Custom Skills

Add `SKILL.md` files to your project's `.ai/skills/<skill-name>/` directory. These are installed alongside logos-dev-boost skills.

### Third-Party Module Skills

Module authors can ship skills in their repos at `resources/boost/skills/<skill-name>/SKILL.md`. When a project depends on that module and runs `logos-dev-boost install`, these skills are automatically discovered and installed.

## Relationship to logos-module-builder

logos-dev-boost wraps `logos-module-builder` for scaffolding — it does not duplicate its templates. The `init` command calls `nix flake init -t logos-module-builder` (appropriate variant) and then layers on:

- Universal module impl header template (for `--type module`)
- Pure QML template (for `--type ui-qml`) or QML + C++ backend template (for `--type ui-qml-backend`)
- AI context files (AGENTS.md, CLAUDE.md, .mcp.json)
- Test skeleton

This means logos-dev-boost always uses the latest logos-module-builder templates for Nix/CMake scaffolding.

## Consumers

- AI coding agents (Claude Code, Cursor, Copilot, Codex, Gemini) via AGENTS.md, CLAUDE.md, skills, and MCP
- Human developers via documentation, scaffolding, and generated project structure
- CI/CD pipelines via `logos-dev-boost check` (Phase 4)
