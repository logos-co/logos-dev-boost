# Logos Core Conventions

## Two Component Types

Logos has two fundamentally different types of components. Always identify which you are building before writing code.

**Logos Modules** (`"type": "core"`) — Process-isolated backend services. Pure C++ implementation using standard types. No Qt types in user code. All Qt glue is generated at build time. Loaded by `logoscore` or `liblogos_core`. Each runs in its own `logos_host` subprocess.

**UI Apps** (`"type": "ui"`) — Qt plugins loaded directly by Basecamp. Provide a graphical widget in the MDI workspace. Use `IComponent` for C++ plugins or QML packages. Run in the Basecamp process.

**Rule:** Never mix these. A module is either core (headless, universal interface) or UI (visual, IComponent). If something needs both backend logic and a UI, create a core module for the logic and a separate UI app that calls it via LogosAPI.

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

UI app:
```
my_app/
├── src/
│   ├── MyAppPlugin.h/cpp         # IComponent implementation
│   ├── MyAppBackend.h/cpp        # QObject backend
│   └── qml/Main.qml              # QML UI
├── metadata.json                 # "type": "ui"
├── CMakeLists.txt
└── flake.nix
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
