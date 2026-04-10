# logos-dev-boost

AI-assisted development accelerator for the Logos modular application platform. Provides bundled documentation, always-loaded guidelines, on-demand skills, context file generators, and an MCP server that gives AI coding agents (Claude Code, Cursor, Codex, Gemini) accurate knowledge of the Logos SDK, build system, and module development patterns.

## Quick Start

### Create a new Logos module

```bash
nix run github:logos-co/logos-dev-boost -- init my_module --type module
cd logos-my-module
```

This creates a ready-to-build project with source code, Nix build files, and full AI tooling:

```
logos-my-module/
├── src/
│   ├── my_module_impl.h       # Pure C++ interface — your code goes here
│   └── my_module_impl.cpp     # Implementation
├── tests/
│   └── test_my_module.cpp     # Test skeleton
├── metadata.json              # Module identity, deps, build config
├── CMakeLists.txt             # Build config
├── flake.nix                  # Nix build (reproducible, hermetic)
├── AGENTS.md                  # AI context (Codex, Gemini, generic agents)
├── CLAUDE.md                  # AI context (Claude Code)
├── .mcp.json                  # MCP server — auto-detected by AI tools
└── .claude/skills/            # 8 on-demand skills for Claude Code
```

Now open the project in your AI tool:

```bash
# Claude Code
claude

# Cursor
cursor .

# Codex
codex
```

The AI tool automatically picks up `CLAUDE.md`/`AGENTS.md` (always-loaded context), `.mcp.json` (MCP server for live introspection), and `.claude/skills/` (on-demand task knowledge). No `mcp add` or manual configuration needed.

## Commands

### `init` — Scaffold a new project

```bash
logos-dev-boost init <name> --type <module|ui-qml|ui-qml-backend|full-app> [--external-lib]
```

| Option | Description |
|--------|-------------|
| `--type module` | **Universal C++ module** (default). Pure C++ with `std::string`, `int64_t`, `std::vector<T>`. The build system generates all Qt glue via `logos-cpp-generator --from-header`. No Qt in your code. |
| `--type ui-qml` | **Pure QML UI app**. QML-only Basecamp UI app with no C++ compilation. Calls backend modules via `logos.callModule()` bridge. |
| `--type ui-qml-backend` | **QML + C++ backend UI app**. Process-isolated C++ backend (Qt Remote Objects) with QML frontend. Backend runs in `logos_host`, QML gets a typed replica via `logos.module()`. |
| `--type full-app` | **Module + UI app together**. Creates a single root project with a `module/` subdirectory (universal C++ module) and a `ui/` subdirectory (Basecamp UI app). The UI declares the module as a dependency. Ideal when you need both a backend and a frontend. |
| `--external-lib` | Include scaffold for wrapping an external C/C++ library (modules only). Adds Nix packaging for the external dependency and FFI bridge code. |

Examples:

```bash
# Pure C++ module (most common)
nix run github:logos-co/logos-dev-boost -- init crypto_utils --type module

# Module wrapping an external C library (e.g., libsodium, sqlite)
nix run github:logos-co/logos-dev-boost -- init crypto_utils --type module --external-lib

# Pure QML UI app (no C++)
nix run github:logos-co/logos-dev-boost -- init notes_ui --type ui-qml

# QML + C++ backend UI app
nix run github:logos-co/logos-dev-boost -- init notes_app --type ui-qml-backend

# Module + UI app together (opens in IDE with full AI context for both)
nix run github:logos-co/logos-dev-boost -- init notes --type full-app
```

The `full-app` type creates:

```
logos-notes/
├── module/                    # Universal C++ module (backend)
│   ├── src/notes_impl.h/cpp
│   ├── metadata.json
│   └── flake.nix
├── ui/                        # Basecamp UI app (frontend)
│   ├── src/notes_ui_plugin.h/cpp
│   ├── src/NotesUiBackend.h/cpp
│   ├── src/qml/Main.qml
│   ├── metadata.json          # dependencies: ["notes"]
│   └── flake.nix
├── flake.nix                  # nix build .#module / .#ui
├── project.json               # { "type": "full-app", ... }
├── AGENTS.md / CLAUDE.md      # AI context covering both sub-projects
└── .mcp.json / .claude/skills/
```

### `install` — Configure AI tools for an existing project

```bash
nix run github:logos-co/logos-dev-boost -- install
```

Run this inside an existing Logos module or app directory. Detects the project type and generates all AI context files (`AGENTS.md`, `CLAUDE.md`, `.mcp.json`, skills).

### `generate` — Regenerate AI context files

```bash
logos-dev-boost generate [--agents-md] [--claude-md] [--cursor-rules] [--llms-txt]
```

Regenerate specific files, or all of them if no flags are given.

## How AI Integration Works

When you open a scaffolded project in an AI tool, three layers activate automatically:

### 1. Always-loaded context (highest impact)

`AGENTS.md` and `CLAUDE.md` are read by AI tools at the start of every session. They contain a compressed index of the Logos SDK documentation, conventions (pure C++ for modules, Nix builds, the codegen pipeline), and the type system. This prevents the AI from hallucinating wrong patterns (e.g., using Qt types in a universal module, suggesting `cmake --build` instead of `nix build`).

### 2. MCP server (live introspection)

`.mcp.json` registers a local MCP server that AI tools auto-detect. The server provides 5 tools:

| Tool | Description |
|------|-------------|
| `logos_project_info` | Analyze the current project — type, dependencies, build status |
| `logos_search_docs` | Search Logos documentation by keyword or topic |
| `logos_api_reference` | Look up LogosAPI, LogosResult, IPC, and SDK interfaces |
| `logos_build_help` | Diagnose build errors with Logos-specific context |
| `logos_scaffold` | Generate additional files (tests, new methods, packaging config) |

The MCP server starts instantly — it runs as a local Node.js process (no Nix evaluation on each call).

### 3. On-demand skills

Skills are task-specific knowledge modules that activate when the AI works on a particular task. Installed to `.claude/skills/` for Claude Code:

| Skill | Activates when... |
|-------|-------------------|
| `create-universal-module` | Creating a new pure C++ module |
| `wrap-external-lib` | Wrapping an external C/C++ library |
| `create-ui-app` | Creating a Basecamp UI app |
| `inter-module-comm` | Setting up cross-module communication |
| `testing-modules` | Writing tests for modules |
| `package-lgx` | Packaging modules for distribution |
| `nix-flake-setup` | Configuring Nix flake builds |
| `add-to-workspace` | Adding a module to the logos-workspace |

## Two Component Types

**Logos Modules** — Pure C++ "universal interface" modules. You write a plain C++ class with `std::string`, `int64_t`, `std::vector<T>`. The build system generates all Qt glue automatically via `logos-cpp-generator --from-header`. No Qt types in your code. This is the recommended approach for most functionality.

**UI Apps** — QML-based UI apps displayed in the Basecamp workspace. Two subtypes: pure QML (no C++, calls modules via `logos.callModule()`) or QML + C++ backend (process-isolated via Qt Remote Objects, QML gets a typed replica via `logos.module()`).

## Documentation

- [docs/index.md](docs/index.md) — Documentation entry point
- [docs/spec.md](docs/spec.md) — Domain spec: purpose, journeys, features
- [docs/project.md](docs/project.md) — Implementation: repo layout, CLI, APIs
