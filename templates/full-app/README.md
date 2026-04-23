# Full App Template

Scaffolded by `logos-dev-boost init <name> --type full-app`.

A combined project containing a universal C++ module and a Basecamp UI app as sibling subdirectories with name-suffixed folder names. Open the root directory in your IDE for a complete AI-assisted development experience covering both the module backend and the UI frontend.

## Output directory structure

```
logos-<name>/
  <name>-module/                   # Universal C++ module (the "backend")
    metadata.json                  # type: "core", interface: "universal"
    flake.nix                      # mkLogosModule + logos-cpp-generator preConfigure
    CMakeLists.txt
    src/<name>_impl.h              # Pure C++ impl class — your business logic
    src/<name>_impl.cpp
    tests/test_<name>.cpp
  <name>-ui/                       # Basecamp UI app (the "frontend")
    metadata.json                  # type: "ui", dependencies: ["<name>"]
    flake.nix                      # mkLogosModule; includes <name>.url = "path:../<name>-module"
    CMakeLists.txt
    interfaces/IComponent.h
    src/<name>_ui_plugin.h/cpp
    src/<Pascal>UiBackend.h/cpp    # QObject bridge between QML and LogosAPI
    src/qml/Main.qml
    .gitignore
  project.json                     # { "type": "full-app", "name": "<name>", "module": "<name>-module", "ui": "<name>-ui" }
  AGENTS.md                        # AI context covering both sub-projects
  CLAUDE.md
  .mcp.json
  .claude/skills/
  .gitignore
```

## Key design points

**Each sub-project is a standalone flake.** `cd <name>-module && nix build` and `cd <name>-ui && nix build` both work independently. Each sub-directory has its own `git init`. This keeps them compatible with the `ws` workspace tooling when they are eventually split into separate repos.

**No root flake.nix.** The root directory holds only AI context files (`project.json`, `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, skills, `.gitignore`). There is no compositor flake — each sub-project builds on its own.

**The UI flake includes the module as an input.** `<name>-ui/flake.nix` declares `<name>.url = "path:../<name>-module"` so that logos-module-builder can resolve the runtime dependency when building the `#install` target. The module sub-directory must be git-tracked for this `path:` input to work.

**The UI declares the module as a runtime dependency.** `<name>-ui/metadata.json` sets `"dependencies": ["<name>"]`. When Basecamp loads the UI plugin it will auto-load the module. The `<Pascal>UiBackend` exposes a `LogosAPI*` pointer that the UI can use to call module methods via `logosAPI->getClient("<name>")->invokeRemoteMethod(...)`.

**AI context lives at the root.** `AGENTS.md`, `CLAUDE.md`, `.mcp.json` and skills are placed in the root directory so that AI tools (Claude Code, Cursor) see both sub-projects when opened at the workspace root.

## Workflow

```bash
logos-dev-boost init myapp --type full-app
cd logos-myapp

# Init and build module
cd myapp-module && git init && git add -A && nix build
lm ./result/lib/myapp_plugin.so

# Test module
logoscore -m ./result/lib -l myapp -c "myapp.echo(hello)"

cd ..

# Build UI app (module must be git-tracked for the path: flake input)
cd myapp-ui && git init && git add -A && nix build

# Open root in IDE with full AI context
cd ../..
cursor logos-myapp
```

## Naming convention

| Component | Name | Folder | Plugin binary |
|-----------|------|--------|---------------|
| Module | `<name>` (e.g., `myapp`) | `myapp-module/` | `<name>_plugin.so` |
| UI app | `<name>_ui` (e.g., `myapp_ui`) | `myapp-ui/` | `<name>_ui_plugin.so` |
| Root directory | — | `logos-<name>/` | — |
