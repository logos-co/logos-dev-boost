import * as fs from "node:fs";
import * as path from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const scaffoldTool: Tool = {
  name: "logos_scaffold",
  description:
    "Generate a new Logos module or UI app project from templates. Creates the directory structure, metadata.json, flake.nix, CMakeLists.txt, and AI context files (AGENTS.md, CLAUDE.md).",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Module/app name in snake_case (e.g., 'crypto_utils', 'notes_app')",
      },
      type: {
        type: "string",
        enum: ["module", "ui-qml", "ui-qml-backend", "full-app"],
        description: "Project type: 'module' for universal C++ module, 'ui-qml' for pure QML UI app, 'ui-qml-backend' for QML + C++ backend UI app, 'full-app' for both module + UI app together",
      },
      description: {
        type: "string",
        description: "Short description of the module/app",
      },
      externalLib: {
        type: "boolean",
        description: "Include external library wrapping scaffold (modules only)",
      },
      directory: {
        type: "string",
        description: "Parent directory to create the project in (defaults to current directory)",
      },
    },
    required: ["name", "type"],
  },
};

function toPascalCase(name: string): string {
  return name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

export function handleScaffold(args: Record<string, unknown>) {
  const name = args.name as string;
  const type = args.type as string;
  const description = (args.description as string) || `Logos ${type === "module" ? "module" : type === "full-app" ? "module + UI app" : "UI app"}`;
  const externalLib = (args.externalLib as boolean) || false;
  const parentDir = (args.directory as string) || process.cwd();

  if (!name || !name.match(/^[a-z][a-z0-9_]*$/)) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: name must be snake_case (e.g., 'crypto_utils')",
        },
      ],
      isError: true,
    };
  }

  const projectDir = path.join(parentDir, `logos-${name.replace(/_/g, "-")}`);

  if (fs.existsSync(projectDir)) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: directory already exists: ${projectDir}`,
        },
      ],
      isError: true,
    };
  }

  const filesCreated: string[] = [];

  if (type === "module") {
    createUniversalModule(projectDir, name, description, externalLib, filesCreated);
  } else if (type === "ui-qml") {
    createQmlApp(projectDir, name, description, filesCreated);
  } else if (type === "ui-qml-backend") {
    createQmlBackendApp(projectDir, name, description, filesCreated);
  } else if (type === "full-app") {
    createFullApp(projectDir, name, description, filesCreated);
  }

  const relFiles = filesCreated.map((f) => path.relative(parentDir, f));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            project_dir: projectDir,
            files_created: relFiles,
            next_steps: type === "full-app"
              ? [
                  `cd ${path.basename(projectDir)}`,
                  "git init && git add -A",
                  "nix build .#module   # build the module",
                  "nix build .#ui       # build the UI app",
                  `logoscore -m ./module/result/lib -l ${name} -c "${name}.echo(hello)"`,
                ]
              : [
                  `cd ${path.basename(projectDir)}`,
                  "git init && git add -A",
                  "nix build",
                  ...(type === "module"
                    ? [
                        "nix build .#unit-tests -L",
                        `logoscore -m ./result/lib -l ${name} -c "${name}.methodName(args)"`,
                      ]
                    : [`nix run .`]),
                ],
          },
          null,
          2
        ),
      },
    ],
  };
}

function writeFile(filePath: string, content: string, filesCreated: string[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  filesCreated.push(filePath);
}

function createUniversalModule(
  dir: string,
  name: string,
  description: string,
  externalLib: boolean,
  filesCreated: string[]
) {
  const pascal = toPascalCase(name);

  writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        description,
        author: "",
        type: "core",
        interface: "universal",
        category: "general",
        main: `${name}_plugin`,
        dependencies: [],
        include: [],
        capabilities: [],
        nix: {
          packages: { build: [], runtime: [] },
          external_libraries: externalLib
            ? [{ name: "mylib", build_command: "make", output_pattern: "build/libmylib.*" }]
            : [],
          cmake: { find_packages: [], extra_sources: [], extra_include_dirs: [], extra_link_libraries: [] },
        },
      },
      null,
      2
    ),
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${name}_impl.h`),
    `#pragma once
#include <string>
#include <vector>
#include <cstdint>

class ${pascal}Impl {
public:
    ${pascal}Impl();
    ~${pascal}Impl();

    std::string echo(const std::string& input);
    // Add your module's public API methods here
    // Only use: std::string, bool, int64_t, uint64_t, double, void, std::vector<T>

private:
    // Private members (not exposed as module API)
};
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${name}_impl.cpp`),
    `#include "${name}_impl.h"

${pascal}Impl::${pascal}Impl() {}
${pascal}Impl::~${pascal}Impl() {}

std::string ${pascal}Impl::echo(const std::string& input) {
    return "echo: " + input;
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "CMakeLists.txt"),
    `cmake_minimum_required(VERSION 3.14)
project(Logos${pascal}Plugin LANGUAGES CXX)

if(DEFINED ENV{LOGOS_MODULE_BUILDER_ROOT})
    include($ENV{LOGOS_MODULE_BUILDER_ROOT}/cmake/LogosModule.cmake)
else()
    message(FATAL_ERROR "LogosModule.cmake not found. Set LOGOS_MODULE_BUILDER_ROOT.")
endif()

configure_file(\${CMAKE_CURRENT_SOURCE_DIR}/metadata.json \${CMAKE_CURRENT_BINARY_DIR}/metadata.json COPYONLY)

logos_module(
    NAME ${name}
    SOURCES
        src/${name}_impl.h
        src/${name}_impl.cpp
        generated_code/${name}_qt_glue.h
        generated_code/${name}_dispatch.cpp
    INCLUDE_DIRS
        \${CMAKE_CURRENT_SOURCE_DIR}/generated_code
)
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "flake.nix"),
    `{
  description = "Logos ${pascal} Module";

  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";
    nix-bundle-lgx.url = "github:logos-co/nix-bundle-lgx";
  };

  outputs = inputs@{ logos-module-builder, ... }:
    logos-module-builder.lib.mkLogosModule {
      src = ./.;
      configFile = ./metadata.json;
      flakeInputs = inputs;
      preConfigure = ''
        logos-cpp-generator --from-header src/${name}_impl.h \\
          --backend qt \\
          --impl-class ${pascal}Impl \\
          --impl-header ${name}_impl.h \\
          --metadata metadata.json \\
          --output-dir ./generated_code
      '';
    };
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "tests/main.cpp"),
    `#include <logos_test.h>

LOGOS_TEST_MAIN()
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `tests/test_${name}.cpp`),
    `#include <logos_test.h>
#include "../src/${name}_impl.h"

LOGOS_TEST(echo_returns_prefixed_input) {
    ${pascal}Impl impl;
    LOGOS_ASSERT_EQ(impl.echo("hello"), std::string("echo: hello"));
}

LOGOS_TEST(echo_handles_empty_input) {
    ${pascal}Impl impl;
    LOGOS_ASSERT_EQ(impl.echo(""), std::string("echo: "));
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "tests/CMakeLists.txt"),
    `cmake_minimum_required(VERSION 3.14)
project(${pascal}Tests LANGUAGES CXX)

include(LogosTest)

logos_test(
    NAME ${name}_tests
    MODULE_SOURCES ../src/${name}_impl.cpp
    TEST_SOURCES
        main.cpp
        test_${name}.cpp
)
`,
    filesCreated
  );
}

function createQmlApp(
  dir: string,
  name: string,
  description: string,
  filesCreated: string[]
) {
  const pascal = toPascalCase(name);
  const flakeEscDescription = description.replace(/"/g, '\\"').replace(/\r?\n/g, " ");

  writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        description,
        type: "ui_qml",
        category: "ui",
        view: "Main.qml",
        icon: null,
        dependencies: [],
        nix: {
          packages: { build: [], runtime: [] },
          external_libraries: [],
          cmake: { find_packages: [], extra_sources: [], extra_include_dirs: [], extra_link_libraries: [] },
        },
      },
      null,
      2
    ),
    filesCreated
  );

  writeFile(
    path.join(dir, ".gitignore"),
    `.DS_Store
result
build/
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "Main.qml"),
    `import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

Item {
    id: root
    width: 400
    height: 300

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 16

        Text {
            Layout.alignment: Qt.AlignHCenter
            text: "${pascal}"
            font.pixelSize: 24
            font.bold: true
            color: "#ffffff"
        }

        Text {
            Layout.alignment: Qt.AlignHCenter
            text: "${description.replace(/"/g, '\\"')}"
            font.pixelSize: 14
            color: "#a0a0a0"
        }

        Button {
            Layout.alignment: Qt.AlignHCenter
            text: "Call Backend Module"
            onClicked: {
                // The logos bridge is injected by the host application.
                // Uncomment to call a backend module:
                // var result = logos.callModule("my_module", "myMethod", ["arg"])
                console.log("Button clicked")
            }
        }
    }
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "flake.nix"),
    `{
  description = "${flakeEscDescription}";

  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";
  };

  outputs = inputs@{ logos-module-builder, ... }:
    logos-module-builder.lib.mkLogosQmlModule {
      src = ./.;
      configFile = ./metadata.json;
      flakeInputs = inputs;
    };
}
`,
    filesCreated
  );
}

function createQmlBackendApp(
  dir: string,
  name: string,
  description: string,
  filesCreated: string[]
) {
  const pascal = toPascalCase(name);
  const flakeEscDescription = description.replace(/"/g, '\\"').replace(/\r?\n/g, " ");

  writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        description,
        type: "ui_qml",
        category: "ui",
        main: `${name}_plugin`,
        view: "qml/Main.qml",
        icon: null,
        dependencies: [],
        nix: {
          packages: { build: [], runtime: [] },
          external_libraries: [],
          cmake: { find_packages: [], extra_sources: [], extra_include_dirs: [], extra_link_libraries: [] },
        },
      },
      null,
      2
    ),
    filesCreated
  );

  writeFile(
    path.join(dir, ".gitignore"),
    `.DS_Store
result
build/
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${name}_interface.h`),
    `#ifndef ${name.toUpperCase()}_INTERFACE_H
#define ${name.toUpperCase()}_INTERFACE_H

#include <QObject>
#include <QString>
#include "interface.h"

class ${pascal}Interface : public PluginInterface
{
public:
    virtual ~${pascal}Interface() = default;
};

#define ${pascal}Interface_iid "org.logos.${pascal}Interface"
Q_DECLARE_INTERFACE(${pascal}Interface, ${pascal}Interface_iid)

#endif // ${name.toUpperCase()}_INTERFACE_H
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${name}.rep`),
    `class ${pascal}
{
    PROP(QString status READWRITE)
    SLOT(int add(int a, int b))
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${name}_plugin.h`),
    `#ifndef ${name.toUpperCase()}_PLUGIN_H
#define ${name.toUpperCase()}_PLUGIN_H

#include <QString>
#include <QVariantList>
#include "${name}_interface.h"
#include "LogosViewPluginBase.h"
#include "rep_${name}_source.h"

class LogosAPI;

class ${pascal}Plugin : public ${pascal}SimpleSource,
                        public ${pascal}Interface,
                        public ${pascal}ViewPluginBase
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID ${pascal}Interface_iid FILE "metadata.json")
    Q_INTERFACES(${pascal}Interface)

public:
    explicit ${pascal}Plugin(QObject* parent = nullptr);
    ~${pascal}Plugin() override;

    QString name()    const override { return "${name}"; }
    QString version() const override { return "1.0.0"; }

    Q_INVOKABLE void initLogos(LogosAPI* api);

    // Slots from ${name}.rep
    int add(int a, int b) override;

signals:
    void eventResponse(const QString& eventName, const QVariantList& args);

private:
    LogosAPI* m_logosAPI = nullptr;
};

#endif // ${name.toUpperCase()}_PLUGIN_H
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${name}_plugin.cpp`),
    `#include "${name}_plugin.h"
#include "logos_api.h"
#include <QDebug>

${pascal}Plugin::${pascal}Plugin(QObject* parent)
    : ${pascal}SimpleSource(parent)
{
    setStatus("Ready");
}

${pascal}Plugin::~${pascal}Plugin() = default;

void ${pascal}Plugin::initLogos(LogosAPI* api)
{
    m_logosAPI = api;
    setBackend(this);
    qDebug() << "${pascal}Plugin: initialized";
}

int ${pascal}Plugin::add(int a, int b)
{
    int result = a + b;
    setStatus(QStringLiteral("%1 + %2 = %3").arg(a).arg(b).arg(result));
    return result;
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "src/qml/Main.qml"),
    `import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root

    // Typed replica — auto-synced properties and callable slots.
    readonly property var backend: logos.module("${name}")
    readonly property bool ready: backend !== null && logos.isViewModuleReady("${name}")

    // "status" property from the .rep file, auto-updated via QTRO.
    readonly property string status: backend ? backend.status : ""

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 16

        Text {
            text: "${pascal} (C++ backend)"
            font.pixelSize: 20
            color: "#ffffff"
            Layout.alignment: Qt.AlignHCenter
        }

        // Connection status
        Text {
            text: root.ready ? "Connected" : "Connecting to backend..."
            color: root.ready ? "#56d364" : "#f0883e"
            font.pixelSize: 12
        }

        RowLayout {
            spacing: 12
            Layout.fillWidth: true

            TextField {
                id: inputA
                placeholderText: "a"
                Layout.preferredWidth: 80
                validator: IntValidator {}
            }

            TextField {
                id: inputB
                placeholderText: "b"
                Layout.preferredWidth: 80
                validator: IntValidator {}
            }

            Button {
                text: "Add"
                enabled: root.ready
                onClicked: {
                    logos.watch(backend.add(
                        parseInt(inputA.text) || 0, parseInt(inputB.text) || 0
                    ),
                        function(value) { resultText.text = "Result: " + value },
                        function(error) { resultText.text = "Error: " + error }
                    )
                }
            }
        }

        Text {
            id: resultText
            text: "Press Add to call the backend"
            color: "#56d364"
            font.pixelSize: 15
        }

        Text {
            text: "Backend status: " + root.status
            color: "#8b949e"
            font.pixelSize: 13
        }

        Item { Layout.fillHeight: true }
    }
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "CMakeLists.txt"),
    `cmake_minimum_required(VERSION 3.14)
project(${pascal}Plugin LANGUAGES CXX)

if(DEFINED ENV{LOGOS_MODULE_BUILDER_ROOT})
    include($ENV{LOGOS_MODULE_BUILDER_ROOT}/cmake/LogosModule.cmake)
else()
    message(FATAL_ERROR "LogosModule.cmake not found. Set LOGOS_MODULE_BUILDER_ROOT.")
endif()

logos_module(
    NAME ${name}
    REP_FILE src/${name}.rep
    SOURCES
        src/${name}_interface.h
        src/${name}_plugin.h
        src/${name}_plugin.cpp
)
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "flake.nix"),
    `{
  description = "${flakeEscDescription}";

  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";
    # Add core module dependencies as inputs (must match metadata.json "dependencies"), e.g.:
    # some_module.url = "github:logos-co/logos-some-module";
  };

  outputs = inputs@{ logos-module-builder, ... }:
    logos-module-builder.lib.mkLogosQmlModule {
      src = ./.;
      configFile = ./metadata.json;
      flakeInputs = inputs;
    };
}
`,
    filesCreated
  );
}

function createFullApp(
  dir: string,
  name: string,
  description: string,
  filesCreated: string[]
) {
  const pascal = toPascalCase(name);
  const uiName = `${name}_ui`;

  // Scaffold the module sub-project
  createUniversalModule(path.join(dir, "module"), name, description, false, filesCreated);

  // Scaffold the UI sub-project (named <name>_ui)
  createQmlBackendApp(path.join(dir, "ui"), uiName, description, filesCreated);

  // Patch ui/metadata.json to declare the module as a dependency
  const uiMetadataPath = path.join(dir, "ui", "metadata.json");
  const uiMetadata = JSON.parse(fs.readFileSync(uiMetadataPath, "utf-8"));
  uiMetadata.dependencies = [name];
  fs.writeFileSync(uiMetadataPath, JSON.stringify(uiMetadata, null, 2) + "\n");

  // Root flake.nix — composes both sub-flakes
  writeFile(
    path.join(dir, "flake.nix"),
    `{
  description = "Logos ${pascal} — module + UI app";

  inputs = {
    module.url = "path:./module";
    ui.url = "path:./ui";
  };

  outputs = { module, ui, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: builtins.listToAttrs (map (s: { name = s; value = f s; }) systems);
    in {
      packages = forAllSystems (system: {
        module = module.packages.\${system}.default;
        ui = ui.packages.\${system}.default;
        default = ui.packages.\${system}.default;
      });
    };
}
`,
    filesCreated
  );

  // Root project.json — metadata for AI context generators
  writeFile(
    path.join(dir, "project.json"),
    JSON.stringify(
      {
        type: "full-app",
        name,
        description,
        module: "module/",
        ui: "ui/",
      },
      null,
      2
    ) + "\n",
    filesCreated
  );

  // Root .gitignore
  writeFile(
    path.join(dir, ".gitignore"),
    `.DS_Store
result
build/
`,
    filesCreated
  );
}
