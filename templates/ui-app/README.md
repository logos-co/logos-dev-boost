# UI App Templates

This documents what `logos-dev-boost init <name>` scaffolds for UI apps (implemented in `mcp-server/tools/scaffold.ts`).

## Pure QML (`--type ui-qml`)

### Generated files

- `Main.qml` — QML entry point, uses `logos.callModule()` to call backend modules
- `metadata.json` — `"type": "ui_qml"`, `"view": "Main.qml"`, no `"main"` field
- `flake.nix` — `mkLogosQmlModule` (no preConfigure, no compilation)
- `.gitignore` — `result`, `build/`, `.DS_Store`

### No C++ files

Pure QML apps have no CMakeLists.txt, no C++ source files, and no compilation step. The QML is loaded directly by the host application.

### Calling backend modules

```qml
var result = logos.callModule("module_name", "method", ["arg1", "arg2"])
```

The `logos` bridge is injected by the host (Basecamp or standalone runner).

---

## QML + C++ Backend (`--type ui-qml-backend`)

### Generated files

- `src/<name>.rep` — Qt Remote Objects interface definition (PROP + SLOT declarations)
- `src/<name>_interface.h` — extends `PluginInterface`, declares Qt plugin interface IID
- `src/<name>_plugin.h` / `src/<name>_plugin.cpp` — plugin class inheriting `<Pascal>SimpleSource` + `<Pascal>Interface` + `<Pascal>ViewPluginBase`; uses `initLogos()` + `setBackend(this)`
- `src/qml/Main.qml` — QML frontend using `logos.module("name")` for typed replica, `logos.watch()` for async calls
- `metadata.json` — `"type": "ui_qml"`, `"main": "<name>_plugin"`, `"view": "qml/Main.qml"`
- `CMakeLists.txt` — `logos_module()` with `REP_FILE` for Qt Remote Objects code generation
- `flake.nix` — `mkLogosQmlModule`
- `.gitignore` — `result`, `build/`, `.DS_Store`

### Architecture

The C++ backend runs in a **separate isolated process** (`logos_host`), communicating with the QML frontend via Qt Remote Objects IPC. Properties defined in the `.rep` file auto-sync to QML replicas. Slots are callable from QML via `logos.watch()`.

### QML API

- `logos.module("name")` — returns a typed Qt Remote Objects replica
- `logos.isViewModuleReady("name")` — checks backend connection status
- `logos.watch(pendingReply, onSuccess, onError)` — handles async slot calls
