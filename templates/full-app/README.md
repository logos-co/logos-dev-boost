# Full App Template

Scaffolded by `logos-dev-boost init <name> --type full-app`.

A combined project containing a universal C++ module and a Basecamp UI app as sibling subdirectories. Open the root directory in your IDE for a complete AI-assisted development experience covering both the module backend and the UI frontend.

## Output directory structure

```
logos-<name>/
  module/                          # Universal C++ module (the "backend")
    metadata.json                  # type: "core", interface: "universal"
    flake.nix                      # mkLogosModule + logos-cpp-generator preConfigure
    CMakeLists.txt
    src/<name>_impl.h              # Pure C++ impl class — your business logic
    src/<name>_impl.cpp
    tests/test_<name>.cpp
  ui/                              # Basecamp UI app (the "frontend")
    metadata.json                  # type: "ui", dependencies: ["<name>"]
    flake.nix                      # mkLogosModule
    CMakeLists.txt
    interfaces/IComponent.h
    src/<name>_ui_plugin.h
    src/<name>_ui_plugin.cpp
    src/<Pascal>UiBackend.h        # QObject bridge between QML and LogosAPI
    src/<Pascal>UiBackend.cpp
    src/qml/Main.qml
    .gitignore
  flake.nix                        # Root composition flake: packages.module + packages.ui
  project.json                     # { "type": "full-app", "name": "<name>", ... }
  AGENTS.md                        # AI context for the whole project
  CLAUDE.md
  .mcp.json
  .claude/skills/
  .gitignore
```

## Key design points

**Each sub-project is independently buildable.** `cd module && nix build` and `cd ui && nix build` both work on their own. This keeps them compatible with the `ws` workspace tooling when they are eventually split into separate repos.

**Root flake composes both.** `nix build .#module` builds the module, `nix build .#ui` (or just `nix build`) builds the UI app.

**The UI declares the module as a dependency.** `ui/metadata.json` sets `"dependencies": ["<name>"]`. When Basecamp loads the UI plugin it will auto-load the module. The `<Pascal>UiBackend` exposes a `LogosAPI*` pointer that the UI can use to call module methods via `logosAPI->getClient("<name>")->invokeRemoteMethod(...)`.

**AI context lives at the root.** `AGENTS.md`, `CLAUDE.md`, `.mcp.json` and skills are placed in the root directory so that AI tools (Claude Code, Cursor) see both sub-projects when opened at the workspace root.

## Workflow

```bash
logos-dev-boost init myapp --type full-app
cd logos-myapp
git init && git add -A

# Build module
nix build .#module
lm ./module/result/lib/myapp_plugin.so

# Test module
logoscore -m ./module/result/lib -l myapp -c "myapp.echo(hello)"

# Build UI app
nix build .#ui

# Build both (default is UI)
nix build

# Open in IDE with full AI context
cursor .
```

## Naming convention

| Component | Name | Plugin binary |
|-----------|------|---------------|
| Module | `<name>` (e.g., `myapp`) | `<name>_plugin.so` |
| UI app | `<name>_ui` (e.g., `myapp_ui`) | `<name>_ui_plugin.so` |
| Root directory | `logos-<name>` | — |
