# UI App Development

## IComponent Pattern

UI apps are Qt plugins loaded directly by Basecamp. They implement `IComponent`, which is **vendored locally** in every project (not provided by the SDK):

`interfaces/IComponent.h`:

```cpp
#pragma once

#include <QObject>
#include <QWidget>
#include <QtPlugin>

class LogosAPI;

class IComponent {
public:
    virtual ~IComponent() = default;
    virtual QWidget* createWidget(LogosAPI* logosAPI = nullptr) = 0;
    virtual void destroyWidget(QWidget* widget) = 0;
};

#define IComponent_iid "com.logos.component.IComponent"
Q_DECLARE_INTERFACE(IComponent, IComponent_iid)
```

The plugin class inherits both `QObject` and `IComponent`, and uses `Q_PLUGIN_METADATA`:

```cpp
class MyPlugin : public QObject, public IComponent {
    Q_OBJECT
    Q_INTERFACES(IComponent)
    Q_PLUGIN_METADATA(IID IComponent_iid FILE "../metadata.json")
public:
    QWidget* createWidget(LogosAPI* logosAPI = nullptr) override;
    void destroyWidget(QWidget* widget) override;
};
```

## CMakeLists.txt Requirements

```cmake
set(CMAKE_AUTOMOC ON)   # not AUTORCC

logos_module(
    NAME my_app
    SOURCES ...
    INCLUDE_DIRS
        ${CMAKE_CURRENT_SOURCE_DIR}/interfaces   # required for #include <IComponent.h>
)

find_package(Qt6 REQUIRED COMPONENTS Widgets Quick QuickWidgets QuickControls2)

qt_add_resources(my_app_module_plugin ui_qml_resources
    PREFIX "/"
    FILES src/qml/Main.qml
)
```

QML is embedded via `qt_add_resources` (no `.qrc` file needed). The embedded path is `qrc:/src/qml/Main.qml`.

## C++/QML Boundary Rules

Every piece of logic must go in the right layer:


| Concern              | C++ (backend class)                      | QML                                    |
| -------------------- | ---------------------------------------- | -------------------------------------- |
| Data models, state   | `Q_PROPERTY` on `QObject`                | Bind to `backend.property`             |
| Business logic       | Methods on backend class                 | Never — no JS business logic           |
| Module calls         | Via `LogosAPI*`                          | Never                                  |
| File I/O, networking | Always C++                               | Never                                  |
| UI layout, styling   | Never                                    | QML; use `Logos.Theme` inside Basecamp |
| User interactions    | `Q_INVOKABLE` slots                      | `onClicked: backend.doThing()`         |
| Plugin lifecycle     | `IComponent::createWidget/destroyWidget` | N/A                                    |


## Plugin `createWidget()` Pattern

```cpp
QWidget* MyPlugin::createWidget(LogosAPI* logosAPI) {
    QQuickStyle::setStyle("Basic");   // consistent cross-platform rendering

    auto* quickWidget = new QQuickWidget();
    quickWidget->setMinimumSize(800, 600);
    quickWidget->setResizeMode(QQuickWidget::SizeRootObjectToView);

    auto* backend = new MyBackend(logosAPI, quickWidget);
    quickWidget->rootContext()->setContextProperty("backend", backend);

    // Dev mode: export QML_PATH=$PWD/src/qml to load Main.qml from disk
    const QString devSource = QString::fromUtf8(qgetenv("QML_PATH"));
    const QUrl qmlUrl = devSource.isEmpty()
        ? QUrl("qrc:/src/qml/Main.qml")
        : QUrl::fromLocalFile(QDir(devSource).filePath("Main.qml"));

    quickWidget->setSource(qmlUrl);

    if (quickWidget->status() == QQuickWidget::Error) {
        qWarning() << "MyPlugin: failed to load QML from" << qmlUrl;
        for (const auto& e : quickWidget->errors())
            qWarning() << e.toString();
    }

    return quickWidget;
}
```

## Backend Class Pattern

```cpp
class MyBackend : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList items    READ items         NOTIFY itemsChanged)
    Q_PROPERTY(int   itemCount       READ itemCount      NOTIFY itemCountChanged)
    Q_PROPERTY(QString statusMessage READ statusMessage  NOTIFY statusMessageChanged)
public:
    explicit MyBackend(LogosAPI* api, QObject* parent = nullptr);

    QVariantList items() const;
    int itemCount() const;
    QString statusMessage() const;

    Q_INVOKABLE void addItem(const QString& text);
    Q_INVOKABLE void removeItem(int index);

signals:
    void itemsChanged();
    void itemCountChanged();
    void statusMessageChanged();

private:
    LogosAPI* m_api;
    QVariantList m_items;
    QString m_statusMessage;
};
```

- Expose every QML-bound value with a `Q_PROPERTY` + NOTIFY signal
- `statusMessage` is useful for feedback displayed in a status bar
- Actions go in `Q_INVOKABLE` methods
- Call other modules via `LogosAPI*` inside the backend

## QML Conventions

- Entry point is always `src/qml/Main.qml`, embedded at `qrc:/src/qml/Main.qml`
- Root element: `Rectangle { anchors.fill: parent }`
- React to backend signals via `Connections { target: backend }`
- Inside Basecamp: use `Logos.Theme` for colors, `Logos.Controls` for components
- When running standalone (`nix run .`): use plain QtQuick; `Logos.Theme` is not available
- Never hardcode UI logic in JavaScript

## Dev Mode

```bash
export QML_PATH=$PWD/src/qml
nix run .   # loads Main.qml from disk; restart app to pick up QML changes
```

C++ changes always require `nix build`.

## Standalone Test

```bash
nix build
nix run .        # or: nix run .#app
```

`mkLogosModule` with `"type": "ui"` automatically wires up `apps.default` — no manual flake setup needed.

## Calling Logos Modules

From C++ backend:

```cpp
auto* client = m_logosAPI->getClient("storage_module");
QVariant result = client->invokeRemoteMethod("storage_module", "save", key, value);
```

Or with generated typed wrappers (recommended when available):

```cpp
#include "logos_sdk.h"   // generated at build time from metadata.json dependencies
LogosModules logos(m_logosAPI);
logos.storage_module.save(key, value);
```

Always declare module dependencies in `metadata.json` `"dependencies"` so they are loaded before the UI app.

## metadata.json for UI Apps

```json
{
  "name": "my_app",
  "type": "ui",
  "version": "1.0.0",
  "description": "My UI application",
  "icon": "icons/my_app.png",
  "category": "tools",
  "main": "my_app_plugin",
  "dependencies": ["storage_module"],
  "nix": {
    "packages": { "build": [], "runtime": ["qt6.qtdeclarative"] },
    "external_libraries": [],
    "cmake": { "find_packages": [], "extra_sources": [] }
  }
}
```

