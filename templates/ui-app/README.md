# UI App Template

This template is used by `logos-dev-boost init <name> --type ui-app` to scaffold a new Basecamp UI app.

## Generated files

- `src/<Name>Plugin.h/cpp` — IComponent implementation with createWidget/destroyWidget
- `src/<Name>Backend.h/cpp` — QObject backend exposed to QML
- `src/qml/Main.qml` — QML entry point
- `metadata.json` — `"type": "ui"`
- `CMakeLists.txt` — Qt6 Quick/QuickWidgets dependencies
- `flake.nix` — Standard module builder config

## C++/QML Boundary

The generated code establishes the correct C++/QML boundary:
- Business logic: C++ backend class (Q_PROPERTY + Q_INVOKABLE)
- UI layout: QML with Logos.Theme and Logos.Controls
- Bridge: Backend set as context property on QQuickWidget
