# UI App Development

## IComponent Pattern

UI Apps are Qt plugins loaded directly by Basecamp. They implement `IComponent`:

```cpp
class IComponent {
public:
    virtual ~IComponent() = default;
    virtual QWidget* createWidget(LogosAPI* logosAPI = nullptr) = 0;
    virtual void destroyWidget(QWidget* widget) = 0;
};
```

The plugin class inherits both `QObject` and `IComponent`, and uses `Q_PLUGIN_METADATA`:

```cpp
class MyPlugin : public QObject, public IComponent {
    Q_OBJECT
    Q_INTERFACES(IComponent)
    Q_PLUGIN_METADATA(IID IComponent_iid FILE "metadata.json")
public:
    QWidget* createWidget(LogosAPI* logosAPI = nullptr) override;
    void destroyWidget(QWidget* widget) override;
};
```

## C++/QML Boundary Rules

This is the most important convention for UI apps. Every piece of logic must go in the right layer:

| Concern | C++ (backend class) | QML |
|---------|---------------------|-----|
| Data models, state | `Q_PROPERTY` on `QObject` | Bind to `backend.property` |
| Business logic | Methods on backend class | Never — no JS business logic |
| Module calls | `LogosAPI::callModule()` | `logos.callModule()` (thin wrapper) |
| File I/O, networking | Always C++ | Never |
| UI layout, styling | Never | Always use `Logos.Theme`, `Logos.Controls` |
| User interactions | `Q_INVOKABLE` slots | `onClicked: backend.doThing()` |
| Plugin lifecycle | `IComponent::createWidget/destroyWidget` | N/A |

## Backend Class Pattern

The backend is a `QObject` subclass exposed to QML as a context property:

```cpp
class MyBackend : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList items READ items NOTIFY itemsChanged)
public:
    explicit MyBackend(LogosAPI* api, QObject* parent = nullptr);
    QVariantList items() const;

    Q_INVOKABLE void addItem(const QString& name);
    Q_INVOKABLE void removeItem(int index);

signals:
    void itemsChanged();

private:
    LogosAPI* m_api;
    QVariantList m_items;
};
```

In `createWidget()`, set the backend as a context property on the QML engine:

```cpp
QWidget* MyPlugin::createWidget(LogosAPI* logosAPI) {
    auto* widget = new QQuickWidget;
    auto* backend = new MyBackend(logosAPI, widget);
    widget->rootContext()->setContextProperty("backend", backend);
    widget->setSource(QUrl("qrc:/qml/Main.qml"));
    return widget;
}
```

## QML Conventions

- Entry point is always `Main.qml`
- Use `Logos.Theme` for all colors: `Logos.Theme.backgroundColor`, `Logos.Theme.textColor`
- Use `Logos.Controls` for interactive elements: `LogosButton`, `LogosText`
- Never hardcode colors — always use theme properties
- Access the backend via the `backend` context property
- Use declarative bindings over imperative JavaScript
- Root element should use `anchors.fill: parent`

## Calling Logos Modules

From C++ backend:
```cpp
QVariant result = m_api->callModule("storage", "save", {key, value});
```

From QML (via LogosQmlBridge):
```qml
logos.callModule("storage", "save", [key, value])
```

Always declare module dependencies in `metadata.json` so they are loaded before the UI app.

## metadata.json for UI Apps

```json
{
  "name": "my_app",
  "type": "ui",
  "version": "1.0.0",
  "description": "My UI application",
  "icon": "icon.png",
  "category": "tools",
  "dependencies": ["storage_module"]
}
```
