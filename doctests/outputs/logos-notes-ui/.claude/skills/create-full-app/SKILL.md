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
- `<name>-module/` — universal C++ module (the backend, `"type": "core"`)
- `<name>-ui/` — Basecamp UI app (the frontend, `"type": "ui"`)
- Root `project.json` identifying the full-app layout
- `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `.claude/skills/` at the root

## After scaffolding

Each sub-project is a **standalone flake** that builds independently. Build them one at a time:

```bash
cd logos-<name>

# 1. Init and build the module
cd <name>-module
git init && git add -A
nix build
lm ./result/lib/<name>_plugin.so
logoscore -m ./result/lib -l <name> -c "<name>.echo(hello)"
cd ..

# 2. Build the UI app (module must be git-tracked for the path: flake input)
cd <name>-ui
git init && git add -A
nix build
cd ..
```

## How the UI connects to the module

The `<name>-ui/flake.nix` declares the module as a flake input:

```nix
<name>.url = "path:../<name>-module";
```

And `<name>-ui/metadata.json` declares it as a runtime dependency:
```json
"dependencies": ["<name>"]
```

Basecamp will auto-load the module when the UI plugin is activated.

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
  myapp-module/
    metadata.json        "type": "core", "interface": "universal"
    flake.nix            standalone — cd myapp-module && nix build
    src/myapp_impl.h     Pure C++ API
    src/myapp_impl.cpp
    tests/test_myapp.cpp
  myapp-ui/
    metadata.json        "type": "ui", "dependencies": ["myapp"]
    flake.nix            includes myapp.url = "path:../myapp-module"
    src/myapp_ui_plugin.h/cpp
    src/MyappUiBackend.h/cpp
    src/qml/Main.qml
  project.json           { "type": "full-app", "name": "myapp", "module": "myapp-module", "ui": "myapp-ui" }
  AGENTS.md / CLAUDE.md / .mcp.json
```

## Building for Basecamp

```bash
# After building both sub-projects:
cp -r myapp-module/result/lib/* ~/.local/share/Logos/LogosBasecampDev/modules/
cp -r myapp-ui/result/* ~/.local/share/Logos/LogosBasecampDev/plugins/myapp_ui/
# Launch Basecamp
```
