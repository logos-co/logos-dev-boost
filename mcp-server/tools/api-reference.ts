import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const apiReferenceTool: Tool = {
  name: "logos_api_reference",
  description:
    "Returns API documentation for Logos interfaces: LogosAPI, LogosResult, LogosProviderBase, PluginInterface, IComponent, metadata.json schema, or the universal type mapping table.",
  inputSchema: {
    type: "object" as const,
    properties: {
      interface: {
        type: "string",
        description: "Which interface to look up: 'LogosAPI', 'LogosResult', 'LogosProviderBase', 'PluginInterface', 'IComponent', 'metadata', 'types', or 'all'",
      },
    },
    required: ["interface"],
  },
};

const API_DOCS: Record<string, string> = {
  LogosAPI: `# LogosAPI

The runtime API that modules use to call other modules and access platform services.

## Key Methods

\`\`\`cpp
// Call a method on another module
LogosResult callModule(const QString& moduleName, const QString& methodName, const QVariantList& args);

// Get a client for direct module access
LogosAPIClient* getClient(const QString& moduleName);
\`\`\`

## Usage in Universal Modules

Universal modules receive LogosAPI via the generated \`onInit(LogosAPI* api)\` hook.
Store the pointer if needed for later use.

## Usage in UI Apps

Passed to \`createWidget(LogosAPI* logosAPI)\`. Store it in your backend class.

## QML Bridge

From QML, use \`logos.callModule(moduleName, methodName, args)\` — this is a thin
wrapper that calls LogosAPI and serializes the result to JSON for QML consumption.`,

  LogosResult: `# LogosResult

Structured return type for all cross-module calls.

## Methods

| Method | Returns | Description |
|--------|---------|-------------|
| \`success()\` | \`bool\` | Whether the call succeeded |
| \`data()\` | \`QVariant\` | Return value (string, int, map, list, etc.) |
| \`errorMessage()\` | \`QString\` | Error description (empty on success) |

## Creating LogosResult (in Q_INVOKABLE methods)

\`\`\`cpp
// Success
return LogosResult{true, QVariant("result_data")};

// Error
return LogosResult{false, QVariant(), "Something went wrong"};

// Success with map
QVariantMap data;
data["id"] = 42;
data["name"] = "test";
return LogosResult{true, data};
\`\`\`

## Checking LogosResult

\`\`\`cpp
LogosResult result = api->callModule("other", "method", {});
if (result.success()) {
    QString value = result.data().toString();
} else {
    qWarning() << "Error:" << result.errorMessage();
}
\`\`\``,

  LogosProviderBase: `# LogosProviderBase

Base class for new-API modules using LOGOS_PROVIDER / LOGOS_METHOD macros.
Universal modules do NOT inherit this directly — the code generator produces a subclass.

## For generated universal modules

The generator creates a ProviderObject class that:
- Inherits LogosProviderBase
- Holds m_impl (your pure C++ impl class)
- Wraps each public method with type conversion
- Implements callMethod() and getMethods() via generated dispatch

## For hand-written provider modules (legacy)

\`\`\`cpp
class MyProvider : public LogosProviderBase {
    LOGOS_PROVIDER(MyProvider, "my_module", "1.0.0")

protected:
    void onInit(LogosAPI* api) override;

public:
    LOGOS_METHOD QString doSomething(const QString& input);
};
\`\`\`

LOGOS_PROVIDER declares providerName/providerVersion and callMethod/getMethods.
LOGOS_METHOD marks methods for the generator (expands to nothing at compile time).`,

  PluginInterface: `# PluginInterface

Base interface for all Logos module plugins (both legacy and universal).

\`\`\`cpp
class PluginInterface {
public:
    virtual ~PluginInterface() {}
    virtual QString name() const = 0;
    virtual QString version() const = 0;
    LogosAPI* logosAPI = nullptr;
};
\`\`\`

Universal modules: the generated Plugin class implements PluginInterface automatically.
Legacy modules: your plugin class inherits both QObject and PluginInterface.`,

  IComponent: `# IComponent

Interface for UI Apps loaded by Logos Basecamp. NOT used by core modules.

\`\`\`cpp
class IComponent {
public:
    virtual ~IComponent() = default;
    virtual QWidget* createWidget(LogosAPI* logosAPI = nullptr) = 0;
    virtual void destroyWidget(QWidget* widget) = 0;
};
\`\`\`

## Plugin Class Pattern

\`\`\`cpp
class MyPlugin : public QObject, public IComponent {
    Q_OBJECT
    Q_INTERFACES(IComponent)
    Q_PLUGIN_METADATA(IID IComponent_iid FILE "metadata.json")
public:
    QWidget* createWidget(LogosAPI* logosAPI = nullptr) override;
    void destroyWidget(QWidget* widget) override;
};
\`\`\`

createWidget() is called once when the plugin is loaded. It should return a QWidget
(typically QQuickWidget for QML-based apps). destroyWidget() is called on unload.`,

  metadata: `# metadata.json Schema

\`\`\`json
{
  "name": "module_name",          // Required: matches binary prefix
  "version": "1.0.0",            // Required: semver
  "description": "...",           // Required
  "author": "...",                // Optional
  "type": "core",                // Required: "core" | "ui"
  "interface": "universal",       // For universal modules only
  "category": "general",          // Optional
  "main": "module_name_plugin",   // Required: binary name without extension
  "dependencies": [],              // Array of module names
  "include": [],                   // Additional include files
  "capabilities": [],              // Capability declarations

  "nix": {
    "packages": {
      "build": [],                 // Build-time nix packages
      "runtime": []                // Runtime nix packages
    },
    "external_libraries": [{       // External C/C++ libraries
      "name": "libname",
      "build_command": "make",
      "output_pattern": "build/lib*",
      "go_build": false            // true for Go CGo libraries
    }],
    "cmake": {
      "find_packages": [],         // CMake find_package() calls
      "extra_sources": [],         // Additional source files
      "extra_include_dirs": [],    // Additional include directories
      "extra_link_libraries": []   // Additional link libraries
    }
  }
}
\`\`\``,

  types: `# Universal Module Type Mapping

The code generator maps between three type systems:

| C++ type (you write) | LIDL type | Qt type (generated) |
|----------------------|-----------|---------------------|
| \`std::string\` / \`const std::string&\` | \`tstr\` | \`QString\` |
| \`bool\` | \`bool\` | \`bool\` |
| \`int64_t\` | \`int\` | \`int\` |
| \`uint64_t\` | \`uint\` | \`int\` |
| \`double\` | \`float64\` | \`double\` |
| \`void\` | \`void\` | \`void\` |
| \`std::vector<std::string>\` | \`[tstr]\` | \`QStringList\` |
| \`std::vector<uint8_t>\` | \`bstr\` | \`QByteArray\` |
| \`std::vector<int64_t>\` | \`[int]\` | \`QVariantList\` |
| \`std::vector<double>\` | \`[float64]\` | \`QVariantList\` |
| \`std::vector<bool>\` | \`[bool]\` | \`QVariantList\` |
| \`LogosMap\` | \`{tstr: any}\` | \`QVariantMap\` |
| \`LogosList\` | \`[any]\` | \`QVariantList\` |
| Anything else | \`any\` | \`QVariant\` |

\`LogosMap\` and \`LogosList\` (from \`<logos_json.h>\`) are \`nlohmann::json\` aliases for returning structured objects/arrays while keeping the impl Qt-free. The generator emits an \`nlohmannToQVariant()\` conversion in the glue layer.

Module authors only use C++ types. The generator handles conversion.
Prefer explicit types from the table for type safety; unknown types map to \`any\`.`,
};

export function handleApiReference(args: Record<string, unknown>) {
  const iface = (args.interface as string) || "all";

  if (iface === "all") {
    const allDocs = Object.entries(API_DOCS)
      .map(([key, doc]) => `## ${key}\n\n${doc}`)
      .join("\n\n---\n\n");
    return {
      content: [{ type: "text" as const, text: allDocs }],
    };
  }

  const doc = API_DOCS[iface];
  if (!doc) {
    const available = Object.keys(API_DOCS).join(", ");
    return {
      content: [
        {
          type: "text" as const,
          text: `Unknown interface: "${iface}". Available: ${available}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: "text" as const, text: doc }],
  };
}
