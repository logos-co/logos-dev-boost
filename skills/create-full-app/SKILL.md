---
name: create-full-app
description: Create a Logos full app — a combined module + UI app project in a single root directory
---

# Skill: Create a Logos Full App

Use this skill when the user wants to scaffold a project that has **both** a C++ backend module **and** a Basecamp UI frontend.

## When to use this skill

- User asks for a "full app", "complete app", "module with UI", or similar
- User wants a UI that calls a backend module
- User is unsure whether to create a module or a UI app and wants both

## Scaffolding command

```bash
logos-dev-boost init <name> --type full-app
```

This creates `logos-<name>/` containing:
- `module/` — universal C++ module (the backend, `"type": "core"`)
- `ui/` — Basecamp UI app (the frontend, `"type": "ui"`)
- Root `flake.nix` composing both
- Root `project.json` identifying the full-app layout
- `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `.claude/skills/` at the root

## After scaffolding

```bash
cd logos-<name>
git init && git add -A

# Build and test
nix build .#module
logoscore -m ./module/result/lib -l <name> -c "<name>.echo(hello)"
nix build .#ui
```

## Module backend (`module/`)

- Edit `module/src/<name>_impl.h` — add `Q_INVOKABLE`-style public methods using **pure C++ types only** (`std::string`, `int64_t`, `bool`, etc.)
- The code generator (`logos-cpp-generator`) runs at build time to produce Qt glue from your header
- Add new methods to the header, then `nix build .#module` to rebuild

## UI frontend (`ui/`)

- Edit `ui/src/<Pascal>UiBackend.h/cpp` — add `Q_INVOKABLE` slots that call the module via `LogosAPI`
- Edit `ui/src/qml/Main.qml` — the QML view, bound to `backend` context property
- `ui/metadata.json` declares `"dependencies": ["<name>"]` — Basecamp auto-loads the module

## Calling the module from the UI

In `<Pascal>UiBackend.cpp`:

```cpp
#include <LogosAPI.h>

void MyBackend::doSomething(const QString& input) {
    if (!m_api) return;
    auto* client = m_api->getClient("myapp");
    QVariant result = client->invokeRemoteMethod("myapp", "echo", input);
    setStatusMessage(result.toString());
}
```

## File structure reference

```
logos-myapp/
  module/
    metadata.json        "type": "core", "interface": "universal"
    src/myapp_impl.h     Pure C++ API
    src/myapp_impl.cpp
    tests/test_myapp.cpp
  ui/
    metadata.json        "type": "ui", "dependencies": ["myapp"]
    src/myapp_ui_plugin.h/cpp
    src/MyappUiBackend.h/cpp
    src/qml/Main.qml
  flake.nix              packages.module + packages.ui
  project.json
```

## Building for Basecamp

```bash
nix build .#module .#ui
cp -r module/result/lib/* ~/.local/share/Logos/LogosBasecampDev/modules/
cp -r ui/result/* ~/.local/share/Logos/LogosBasecampDev/plugins/myapp_ui/
# Launch Basecamp
```
