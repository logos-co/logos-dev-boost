# logos-dev-boost

AI-assisted development accelerator for the Logos modular application platform. Provides bundled documentation, always-loaded guidelines, on-demand skills, context file generators, and an MCP server that gives AI coding agents (Claude Code, Cursor, Codex, Gemini) accurate knowledge of the Logos SDK, build system, and module development patterns.

## Quick Start

### Scaffold a new module

```bash
nix run github:logos-co/logos-dev-boost -- init my_module --type module
```

### Configure AI tools for an existing project

```bash
nix run github:logos-co/logos-dev-boost -- install
```

### What it generates

- `AGENTS.md` / `CLAUDE.md` — Always-loaded context with compressed docs index
- `.cursor/rules/logos.mdc` — Cursor-specific rules
- `.claude/skills/` or `.agents/skills/` — On-demand task knowledge
- `.mcp.json` — MCP server registration for live project introspection

## Architecture

logos-dev-boost operates at three levels:

1. **Always-loaded context** (AGENTS.md / CLAUDE.md) — Compressed documentation index, conventions, type system. Loaded automatically by AI tools at session start. Highest impact based on Next.js research (100% eval pass rate vs 79% for skills-only).

2. **On-demand skills** — Detailed step-by-step guides activated when the agent works on a specific task (creating a module, packaging, testing). Follows the [Agent Skills](https://agentskills.io) specification.

3. **MCP server** — Live project introspection tools: project info, doc search, API reference, build help, scaffolding. Connects via stdio transport.

## Two Component Types

Logos has two types of components, and logos-dev-boost teaches AI agents the correct patterns for each:

**Logos Modules** — Pure C++ "universal interface" modules. You write a plain C++ class with `std::string`, `int64_t`, `std::vector<T>`. The build system generates all Qt glue automatically via `logos-cpp-generator --from-header`. No Qt types in your code.

**UI Apps** — Qt plugins loaded by Logos Basecamp. C++ backend (`IComponent` + `QObject`) with QML frontend. These provide graphical interfaces in the Basecamp MDI workspace.

## Documentation

- [docs/index.md](docs/index.md) — Documentation entry point
- [docs/spec.md](docs/spec.md) — Domain spec: purpose, journeys, features
- [docs/project.md](docs/project.md) — Implementation: repo layout, CLI, APIs
