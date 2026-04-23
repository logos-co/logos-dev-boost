# Logos Core Conventions

## Two Component Types

Logos has two fundamentally different types of components. Always identify which you are building before writing code.

**Logos Modules** (`"type": "core"`) — Process-isolated backend services. Pure C++ implementation using standard types. No Qt types in user code. All Qt glue is generated at build time. Loaded by `logoscore` or `liblogos_core`. Each runs in its own `logos_host` subprocess.

**UI Apps** (`"type": "ui_qml"`) — QML-based UI apps displayed as tabs in Basecamp's MDI workspace. Two subtypes: pure QML (no C++, calls modules via `logos.callModule()`) or QML + C++ backend (process-isolated via Qt Remote Objects, QML gets a typed replica via `logos.module()`).

**Rule:** Never mix these. A module is either core (headless, universal interface) or UI (visual, ui_qml). If something needs both backend logic and a UI, create a core module for the logic and a separate UI app that calls it, or use a QML + backend app. The `full-app` scaffold type does exactly this — it creates a `module/` subdirectory (core) and a `ui/` subdirectory (UI app) with a shared root.

## Full App Layout

When a project requires both a module and a UI, use the `full-app` layout:

```
logos-<name>/                      # Open this in your IDE
  <name>-module/                   # Universal C++ module (core backend)
    metadata.json                  # "type": "core", "interface": "universal"
    flake.nix                      # standalone — cd <name>-module && nix build
    src/<name>_impl.h
    src/<name>_impl.cpp
  <name>-ui/                       # Basecamp UI app (frontend)
    metadata.json                  # "type": "ui_qml", "dependencies": ["<name>"]
    flake.nix                      # includes <name>.url = "path:../<name>-module"
    src/<name>_ui_plugin.h/cpp
    src/<Pascal>UiBackend.h/cpp
    src/qml/Main.qml
  project.json                     # { "type": "full-app", "name": "<name>" }
  AGENTS.md / CLAUDE.md / .mcp.json
```

Scaffold with: `logos-dev-boost init <name> --type full-app`

Each sub-project is a standalone flake — build inside the sub-directory:
```bash
cd <name>-module && git init && git add -A && nix build
cd ../<name>-ui && git init && git add -A && nix build
```

## Module Naming

- Module names use `snake_case`: `crypto_utils`, `accounts_module`, `storage_module`
- Impl class is `PascalCase` + `Impl`: `CryptoUtilsImpl`, `AccountsModuleImpl`
- Impl header is `<name>_impl.h`: `crypto_utils_impl.h`
- Plugin binary is `<name>_plugin.so/.dylib`: `crypto_utils_plugin.so`
- The `name` in `metadata.json` must match the binary name prefix exactly

## File Structure

Universal module:
```
my_module/
├── src/
│   ├── my_module_impl.h          # Public API (pure C++ types)
│   └── my_module_impl.cpp        # Implementation
├── metadata.json                 # "interface": "universal", "type": "core"
├── CMakeLists.txt                # logos_module() macro
├── flake.nix                     # preConfigure runs logos-cpp-generator
└── tests/
```

Pure QML app:
```
my_app/
├── Main.qml                      # QML entry point
├── metadata.json                 # "type": "ui_qml", "view": "Main.qml"
└── flake.nix                     # mkLogosQmlModule
```

QML + C++ backend app:
```
my_app/
├── src/
│   ├── my_app.rep                # Qt Remote Objects interface
│   ├── my_app_interface.h        # extends PluginInterface
│   ├── my_app_plugin.h/cpp       # SimpleSource + ViewPluginBase
│   └── qml/Main.qml              # QML frontend (logos.module() replica)
├── metadata.json                 # "type": "ui_qml", "main": "my_app_plugin"
├── CMakeLists.txt                # logos_module() with REP_FILE
└── flake.nix                     # mkLogosQmlModule
```

## metadata.json Is the Source of Truth

Every module and UI app must have a `metadata.json`. It declares identity, type, interface, dependencies, and build configuration. The `name` field must match the binary name prefix. The `dependencies` array must list exact `name` values from dependent modules' own `metadata.json` files.

## Inter-Module Communication

All cross-module calls go through `LogosAPI`:
```cpp
LogosResult result = api->callModule("module_name", "method_name", {arg1, arg2});
if (result.success()) {
    QVariant data = result.data();
}
```

Always handle the case where a target module is not loaded. Always declare dependencies in `metadata.json`.
