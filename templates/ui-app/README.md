# UI App Template

This template documents what `logos-dev-boost init <name> --type ui-app` scaffolds (implemented in `mcp-server/tools/scaffold.ts`).

## Generated files

- `interfaces/IComponent.h` — vendored `IComponent` interface (same pattern as `logos-package-manager-ui` and other Basecamp UI plugins)
- `src/<name>_plugin.h` / `src/<name>_plugin.cpp` — `IComponent` implementation: `QQuickWidget`, `QQuickStyle::setStyle("Basic")`, optional `QML_PATH` dev mode, loads `qrc:/src/qml/Main.qml` or `Main.qml` from `QML_PATH`
- `src/<Pascal>Backend.h` / `src/<Pascal>Backend.cpp` — QObject backend with `Q_PROPERTY` / `Q_INVOKABLE` / signals (sample notes list + status line)
- `src/qml/Main.qml` — dark-themed QML (toolbar, list, status bar)
- `metadata.json` — `"type": "ui"`, `main`: `<name>_plugin`
- `CMakeLists.txt` — `INCLUDE_DIRS` for `interfaces/`, `qt_add_resources` for QML, Qt6 Widgets/Quick/QuickWidgets/QuickControls2
- `flake.nix` — `mkLogosModule` with `nix-bundle-lgx` input; adds `apps.<system>.app` as an alias of `default` so `nix run .#app` works
- `.gitignore` — `result`, `build/`, `.DS_Store`

## Dev mode (QML without rebuild)

```bash
export QML_PATH=$PWD/src/qml
nix run .
```

## C++/QML boundary

- Business logic: C++ backend (`Q_PROPERTY`, `Q_INVOKABLE`, signals)
- UI: QML (`QtQuick` / `Controls` / `Layouts`); inside Basecamp you can also use `Logos.Theme` and `Logos.Controls`
- Bridge: `backend` context property on the `QQuickWidget` root context
