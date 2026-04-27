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
      libDir: {
        type: "string",
        description: "Path to a directory containing C library files (.h and .c/.so). When provided, --externalLib is implied. The scaffold will parse the header, copy files into lib/, and generate C++ wrapper code.",
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

interface CParam {
  type: string;
  name: string;
}

interface CFunction {
  name: string;
  returnType: string;
  params: CParam[];
}

interface CppMethod {
  cppReturnType: string;
  methodName: string;
  params: { cppType: string; name: string }[];
  cFunc: CFunction;
}

function mapCTypeToCpp(cType: string, isReturn: boolean): string {
  const t = cType.replace(/\s+/g, " ").trim();
  if (t === "const char*" || t === "const char *" || t === "char*" || t === "char *")
    return isReturn ? "std::string" : "const std::string&";
  if (t === "int" || t === "int32_t" || t === "long" || t === "int64_t" || t === "long long")
    return "int64_t";
  if (t === "unsigned int" || t === "uint32_t" || t === "unsigned long" || t === "uint64_t" || t === "unsigned long long")
    return "uint64_t";
  if (t === "double" || t === "float") return "double";
  if (t === "bool" || t === "_Bool") return "bool";
  if (t === "void") return "void";
  return t;
}

function generateCallExpr(func: CFunction, params: { cppType: string; name: string }[]): string {
  const args = func.params.map((p, i) => {
    const cppParam = params[i];
    const ct = p.type.replace(/\s+/g, " ").trim();
    if (ct === "const char*" || ct === "const char *" || ct === "char*" || ct === "char *")
      return `${cppParam.name}.c_str()`;
    if ((ct === "int" || ct === "int32_t") && cppParam.cppType === "int64_t")
      return `static_cast<int>(${cppParam.name})`;
    if ((ct === "unsigned int" || ct === "uint32_t") && cppParam.cppType === "uint64_t")
      return `static_cast<unsigned int>(${cppParam.name})`;
    return cppParam.name;
  }).join(", ");
  return `::${func.name}(${args})`;
}

function generateReturnExpr(func: CFunction, callExpr: string): string {
  const rt = func.returnType.replace(/\s+/g, " ").trim();
  if (rt === "const char*" || rt === "const char *" || rt === "char*" || rt === "char *")
    return `std::string(${callExpr})`;
  if ((rt === "int" || rt === "int32_t") && mapCTypeToCpp(rt, true) === "int64_t")
    return `static_cast<int64_t>(${callExpr})`;
  return callExpr;
}

function parseCHeader(headerContent: string): CFunction[] {
  const lines = headerContent
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .split("\n");

  const functions: CFunction[] = [];
  let buffer = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed === "extern \"C\" {" ||
        trimmed === "}" || trimmed === "{" || trimmed.startsWith("extern") ||
        trimmed.startsWith("typedef") || trimmed.startsWith("struct") ||
        trimmed.startsWith("enum"))
      continue;

    buffer += " " + trimmed;
    if (!buffer.includes(";")) continue;

    const decl = buffer.trim();
    buffer = "";

    const match = decl.match(
      /^([\w\s*]+?)\s+(\w+)\s*\(([^)]*)\)\s*;/
    );
    if (!match) continue;

    const returnType = match[1].trim();
    const funcName = match[2];
    const paramsStr = match[3].trim();

    if (returnType.includes("typedef") || returnType.includes("struct")) continue;

    const params: CParam[] = [];
    if (paramsStr && paramsStr !== "void") {
      for (const p of paramsStr.split(",")) {
        const pt = p.trim();
        const lastSpace = pt.lastIndexOf(" ");
        const lastStar = pt.lastIndexOf("*");
        const splitPos = Math.max(lastSpace, lastStar);
        if (splitPos <= 0) {
          params.push({ type: pt, name: `arg${params.length}` });
        } else {
          const typePart = pt.substring(0, lastStar >= lastSpace ? lastStar + 1 : splitPos).trim();
          const namePart = pt.substring(lastStar >= lastSpace ? lastStar + 1 : splitPos + 1).trim();
          params.push({ type: typePart, name: namePart || `arg${params.length}` });
        }
      }
    }

    functions.push({ name: funcName, returnType, params });
  }

  return functions;
}

function stripLibPrefix(funcName: string, libName: string): string {
  const prefix = libName + "_";
  if (funcName.startsWith(prefix)) return funcName.substring(prefix.length);
  return funcName;
}

function cFunctionsToCppMethods(functions: CFunction[], libName: string): CppMethod[] {
  return functions.map((func) => ({
    cppReturnType: mapCTypeToCpp(func.returnType, true),
    methodName: stripLibPrefix(func.name, libName),
    params: func.params.map((p) => ({
      cppType: mapCTypeToCpp(p.type, false),
      name: p.name,
    })),
    cFunc: func,
  }));
}

function detectLibName(headerPath: string): string {
  const basename = path.basename(headerPath, ".h");
  return basename.startsWith("lib") ? basename.substring(3) : basename;
}

function findHeaderInDir(dirPath: string): string | null {
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".h"));
  if (files.length === 0) return null;
  // Prefer headers starting with "lib" (e.g., libcalc.h, libfoo.h)
  const libHeader = files.find((f) => f.startsWith("lib"));
  if (libHeader) return libHeader;
  // Prefer headers matching the directory name
  const dirName = path.basename(dirPath);
  const dirHeader = files.find((f) => f.replace(".h", "") === dirName);
  if (dirHeader) return dirHeader;
  // If only one header, use it
  if (files.length === 1) return files[0];
  // Skip obvious internal headers
  const publicHeaders = files.filter((f) =>
    !f.includes("Int") && !f.includes("internal") && !f.includes("private") &&
    !f.startsWith("test_") && !f.includes("_win") && !f.includes("_setup") &&
    !f.includes("_common") && !f.includes("vxworks") && !f.includes("msvc") &&
    !f.includes("Limit") && !f.endsWith("ext.h")
  );
  return publicHeaders.length > 0 ? publicHeaders[0] : files[0];
}

export function handleScaffold(args: Record<string, unknown>) {
  const name = args.name as string;
  const type = args.type as string;
  const description = (args.description as string) || `Logos ${type === "module" ? "module" : type === "full-app" ? "module + UI app" : "UI app"}`;
  const libDir = (args.libDir as string) || null;
  const externalLib = (args.externalLib as boolean) || !!libDir;
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

  if (libDir && !fs.existsSync(libDir)) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: --lib-dir path does not exist: ${libDir}`,
        },
      ],
      isError: true,
    };
  }

  if (libDir) {
    const header = findHeaderInDir(libDir);
    if (!header) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: no .h header file found in --lib-dir: ${libDir}`,
          },
        ],
        isError: true,
      };
    }
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
    createUniversalModule(projectDir, name, description, externalLib, filesCreated, libDir);
  } else if (type === "ui-qml") {
    createQmlApp(projectDir, name, description, filesCreated);
  } else if (type === "ui-qml-backend") {
    createQmlBackendApp(projectDir, name, description, filesCreated);
  } else if (type === "full-app") {
    createFullApp(projectDir, name, description, externalLib, filesCreated, libDir);
  }

  const relFiles = filesCreated.map((f) => path.relative(parentDir, f));

  // Pick a representative method name for next_steps hints
  let sampleCall = `${name}.echo(hello)`;
  if (libDir) {
    const header = findHeaderInDir(libDir);
    if (header) {
      const funcs = parseCHeader(fs.readFileSync(path.join(libDir, header), "utf-8"));
      const libName = detectLibName(header);
      const methods = cFunctionsToCppMethods(funcs, libName);
      if (methods.length > 0) {
        const m = methods[0];
        const sampleArgs = m.params.map((p) =>
          p.cppType.includes("string") ? "hello" : "42"
        ).join(", ");
        sampleCall = `${name}.${m.methodName}(${sampleArgs})`;
      }
    }
  }

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
                  `cd ${name}-module && git init && git add -A && nix build`,
                  `cd ../${name}-ui && git init && git add -A && nix build`,
                  `logoscore -m ./${name}-module/result/lib -l ${name} -c "${sampleCall}"`,
                ]
              : [
                  `cd ${path.basename(projectDir)}`,
                  "git init && git add -A",
                  "nix build",
                  ...(type === "module"
                    ? [
                        "nix build .#unit-tests -L",
                        `logoscore -m ./result/lib -l ${name} -c "${sampleCall}"`,
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
  filesCreated: string[],
  libDir?: string | null
) {
  const pascal = toPascalCase(name);

  let libName = "";
  let methods: CppMethod[] = [];
  let headerFileName = "";

  if (libDir) {
    const headerFile = findHeaderInDir(libDir);
    if (headerFile) {
      headerFileName = headerFile;
      libName = detectLibName(headerFile);
      const headerContent = fs.readFileSync(path.join(libDir, headerFile), "utf-8");
      const functions = parseCHeader(headerContent);
      methods = cFunctionsToCppMethods(functions, libName);

      // Copy library files into the project's lib/ directory
      // Only copy: the chosen header, its matching .c source, and any pre-built binaries
      const libDestDir = path.join(dir, "lib");
      fs.mkdirSync(libDestDir, { recursive: true });
      const allFiles = fs.readdirSync(libDir);
      const headerBase = headerFile.replace(".h", "");
      for (const file of allFiles) {
        const ext = path.extname(file);
        const base = path.basename(file, ext);
        const shouldCopy =
          file === headerFile ||
          (ext === ".c" && (base === headerBase || base === `lib${libName}`)) ||
          (ext === ".so" || ext === ".dylib" || ext === ".a");
        if (shouldCopy) {
          const src = path.join(libDir, file);
          const dest = path.join(libDestDir, file);
          fs.copyFileSync(src, dest);
          filesCreated.push(dest);
        }
      }
    }
  }

  const hasExtLib = externalLib && (!!libDir || !libDir);
  const extLibEntry = libDir && libName
    ? { name: libName, vendor_path: "lib" }
    : externalLib
      ? { name: "mylib", vendor_path: "lib" }
      : null;

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
          external_libraries: extLibEntry ? [extLibEntry] : [],
          cmake: {
            find_packages: [],
            extra_sources: [],
            extra_include_dirs: extLibEntry ? ["lib"] : [],
            extra_link_libraries: [],
          },
        },
      },
      null,
      2
    ),
    filesCreated
  );

  // Generate _impl.h
  if (methods.length > 0) {
    const methodDecls = methods.map((m) => {
      const params = m.params.map((p) => `${p.cppType} ${p.name}`).join(", ");
      return `    ${m.cppReturnType} ${m.methodName}(${params});`;
    }).join("\n");

    writeFile(
      path.join(dir, `src/${name}_impl.h`),
      `#pragma once
#include <string>
#include <vector>
#include <cstdint>

extern "C" {
    #include "lib/${headerFileName}"
}

class ${pascal}Impl {
public:
    ${pascal}Impl();
    ~${pascal}Impl();

${methodDecls}

private:
    // Private members
};
`,
      filesCreated
    );
  } else {
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

private:
    // Private members
};
`,
      filesCreated
    );
  }

  // Generate _impl.cpp
  if (methods.length > 0) {
    const methodImpls = methods.map((m) => {
      const params = m.params.map((p) => `${p.cppType} ${p.name}`).join(", ");
      const callExpr = generateCallExpr(m.cFunc, m.params);
      const returnExpr = generateReturnExpr(m.cFunc, callExpr);
      if (m.cppReturnType === "void") {
        return `void ${pascal}Impl::${m.methodName}(${params}) {\n    ${callExpr};\n}`;
      }
      return `${m.cppReturnType} ${pascal}Impl::${m.methodName}(${params}) {\n    return ${returnExpr};\n}`;
    }).join("\n\n");

    writeFile(
      path.join(dir, `src/${name}_impl.cpp`),
      `#include "${name}_impl.h"

${pascal}Impl::${pascal}Impl() {}
${pascal}Impl::~${pascal}Impl() {}

${methodImpls}
`,
      filesCreated
    );
  } else {
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
  }

  // Generate CMakeLists.txt
  // Detect .c source files in lib/ to compile as part of the plugin
  let cSourceFiles: string[] = [];
  if (libDir) {
    cSourceFiles = fs.readdirSync(path.join(dir, "lib"))
      .filter((f) => f.endsWith(".c"))
      .map((f) => `lib/${f}`);
  }
  const hasCSources = cSourceFiles.length > 0;
  const hasPrebuiltLib = libDir ? fs.readdirSync(path.join(dir, "lib"))
    .some((f) => f.endsWith(".so") || f.endsWith(".dylib") || f.endsWith(".a")) : false;
  const languages = hasCSources ? "C CXX" : "CXX";
  const cSourceLines = cSourceFiles.map((f) => `        ${f}`).join("\n");
  const extLibsCmake = extLibEntry && (hasPrebuiltLib || !hasCSources)
    ? `\n    EXTERNAL_LIBS\n        ${extLibEntry.name}` : "";
  const extIncDirs = extLibEntry ? `\n        \${CMAKE_CURRENT_SOURCE_DIR}/lib` : "";

  writeFile(
    path.join(dir, "CMakeLists.txt"),
    `cmake_minimum_required(VERSION 3.14)
project(Logos${pascal}Plugin LANGUAGES ${languages})

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
        generated_code/${name}_dispatch.cpp${hasCSources ? "\n" + cSourceLines : ""}
    INCLUDE_DIRS
        \${CMAKE_CURRENT_SOURCE_DIR}/generated_code${extIncDirs}${extLibsCmake}
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

  // Generate tests
  writeFile(
    path.join(dir, "tests/main.cpp"),
    `#include <logos_test.h>

LOGOS_TEST_MAIN()
`,
    filesCreated
  );

  if (methods.length > 0) {
    const testCases = methods.map((m) => {
      const testName = `${m.methodName}_works`;
      if (m.cppReturnType === "void") {
        const args = m.params.map((p) =>
          p.cppType.includes("string") ? `std::string("test")` : "1"
        ).join(", ");
        return `LOGOS_TEST(${testName}) {\n    ${pascal}Impl impl;\n    impl.${m.methodName}(${args});\n}`;
      }
      const args = m.params.map((p) =>
        p.cppType.includes("string") ? `std::string("test")` : "1"
      ).join(", ");
      return `LOGOS_TEST(${testName}) {\n    ${pascal}Impl impl;\n    auto result = impl.${m.methodName}(${args});\n    (void)result;\n}`;
    }).join("\n\n");

    writeFile(
      path.join(dir, `tests/test_${name}.cpp`),
      `#include <logos_test.h>
#include "../src/${name}_impl.h"

${testCases}
`,
      filesCreated
    );
  } else {
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
  }

  const testCSourceLines = cSourceFiles.map((f) => `        ../${f}`).join("\n");
  const testModuleSources = hasCSources
    ? `../src/${name}_impl.cpp\n${testCSourceLines}`
    : `../src/${name}_impl.cpp`;

  writeFile(
    path.join(dir, "tests/CMakeLists.txt"),
    `cmake_minimum_required(VERSION 3.14)
project(${pascal}Tests LANGUAGES ${languages})

include(LogosTest)

logos_test(
    NAME ${name}_tests
    MODULE_SOURCES ${testModuleSources}
    TEST_SOURCES
        main.cpp
        test_${name}.cpp${hasCSources ? `\n    EXTRA_INCLUDES\n        \${CMAKE_CURRENT_SOURCE_DIR}/../lib` : ""}${hasPrebuiltLib && extLibEntry ? `\n    EXTRA_LINK_LIBS\n        \${CMAKE_CURRENT_SOURCE_DIR}/../lib/lib${extLibEntry.name}.so` : ""}
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

function cppTypeToQtRepType(cppType: string): string {
  if (cppType === "const std::string&" || cppType === "std::string") return "QString";
  if (cppType === "int" || cppType === "int64_t") return "int";
  if (cppType === "uint64_t") return "int";
  if (cppType === "double") return "double";
  if (cppType === "bool") return "bool";
  if (cppType === "void") return "void";
  return "QString";
}

function cppTypeToQtType(cppType: string): string {
  if (cppType === "const std::string&" || cppType === "std::string") return "QString";
  if (cppType === "int" || cppType === "int64_t") return "int";
  if (cppType === "uint64_t") return "int";
  if (cppType === "double") return "double";
  if (cppType === "bool") return "bool";
  if (cppType === "void") return "void";
  return "QString";
}

function patchUiForExtLib(uiDir: string, uiName: string, moduleName: string, methods: CppMethod[]) {
  const pascal = toPascalCase(uiName);

  // Overwrite .rep file with methods from the library
  const repSlots = methods
    .filter((m) => m.cppReturnType !== "void")
    .slice(0, 8) // limit to avoid overly complex UI
    .map((m) => {
      const retType = cppTypeToQtRepType(m.cppReturnType);
      const params = m.params.map((p) => `${cppTypeToQtRepType(p.cppType)} ${p.name}`).join(", ");
      return `    SLOT(${retType} ${m.methodName}(${params}))`;
    }).join("\n");

  fs.writeFileSync(
    path.join(uiDir, `src/${uiName}.rep`),
    `class ${pascal}
{
    PROP(QString status READWRITE)
${repSlots}
}
`
  );

  // Overwrite plugin.h with methods from the library
  const slotDecls = methods
    .filter((m) => m.cppReturnType !== "void")
    .slice(0, 8)
    .map((m) => {
      const retType = cppTypeToQtType(m.cppReturnType);
      const params = m.params.map((p) => `${cppTypeToQtType(p.cppType)} ${p.name}`).join(", ");
      return `    ${retType} ${m.methodName}(${params}) override;`;
    }).join("\n");

  fs.writeFileSync(
    path.join(uiDir, `src/${uiName}_plugin.h`),
    `#ifndef ${uiName.toUpperCase()}_PLUGIN_H
#define ${uiName.toUpperCase()}_PLUGIN_H

#include <QString>
#include <QVariantList>
#include "${uiName}_interface.h"
#include "LogosViewPluginBase.h"
#include "rep_${uiName}_source.h"

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

    QString name()    const override { return "${uiName}"; }
    QString version() const override { return "1.0.0"; }

    Q_INVOKABLE void initLogos(LogosAPI* api);

${slotDecls}

signals:
    void eventResponse(const QString& eventName, const QVariantList& args);

private:
    LogosAPI* m_logosAPI = nullptr;
};

#endif // ${uiName.toUpperCase()}_PLUGIN_H
`
  );

  // Overwrite plugin.cpp — each method calls the backend module via LogosAPI
  const slotImpls = methods
    .filter((m) => m.cppReturnType !== "void")
    .slice(0, 8)
    .map((m) => {
      const retType = cppTypeToQtType(m.cppReturnType);
      const params = m.params.map((p) => `${cppTypeToQtType(p.cppType)} ${p.name}`).join(", ");
      const invokeArgs = m.params.map((p) => `QVariant::fromValue(${p.name})`).join(", ");
      const convert = retType === "QString" ? `.toString()` : retType === "int" ? `.toInt()` : retType === "double" ? `.toDouble()` : retType === "bool" ? `.toBool()` : `.toString()`;
      return `${retType} ${pascal}Plugin::${m.methodName}(${params})
{
    auto* client = m_logosAPI->getClient("${moduleName}");
    QVariant result = client->invokeRemoteMethod("${moduleName}", "${m.methodName}"${m.params.length > 0 ? ", " + invokeArgs : ""});
    setStatus(QStringLiteral("${m.methodName} called"));
    return result${convert};
}`;
    }).join("\n\n");

  fs.writeFileSync(
    path.join(uiDir, `src/${uiName}_plugin.cpp`),
    `#include "${uiName}_plugin.h"
#include "logos_api.h"
#include "logos_api_client.h"
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

${slotImpls}
`
  );

  // Overwrite QML to show the first method as example
  const firstMethod = methods.filter((m) => m.cppReturnType !== "void")[0];
  if (!firstMethod) return;

  const hasIntParams = firstMethod.params.some((p) => p.cppType === "int" || p.cppType === "int64_t" || p.cppType === "uint64_t" || p.cppType === "double");
  const hasStringParams = firstMethod.params.some((p) => p.cppType.includes("string"));

  // Build input fields and call args based on first method's params
  const inputFields = firstMethod.params.map((p, i) => {
    const id = `input${String.fromCharCode(65 + i)}`;
    const isInt = p.cppType === "int" || p.cppType === "int64_t" || p.cppType === "uint64_t" || p.cppType === "double";
    return `            TextField {
                id: ${id}
                placeholderText: "${p.name}"
                Layout.preferredWidth: 80
${isInt ? "                validator: IntValidator {}\n" : ""}            }`;
  }).join("\n\n");

  const callArgs = firstMethod.params.map((p, i) => {
    const id = `input${String.fromCharCode(65 + i)}`;
    const isInt = p.cppType === "int" || p.cppType === "int64_t" || p.cppType === "uint64_t" || p.cppType === "double";
    return isInt ? `parseInt(${id}.text) || 0` : `${id}.text`;
  }).join(", ");

  fs.writeFileSync(
    path.join(uiDir, "src/qml/Main.qml"),
    `import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root

    readonly property var backend: logos.module("${uiName}")
    readonly property bool ready: backend !== null && logos.isViewModuleReady("${uiName}")
    readonly property string status: backend ? backend.status : ""

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 16

        Text {
            text: "${toPascalCase(uiName)} (C++ backend)"
            font.pixelSize: 20
            color: "#ffffff"
            Layout.alignment: Qt.AlignHCenter
        }

        Text {
            text: root.ready ? "Connected" : "Connecting to backend..."
            color: root.ready ? "#56d364" : "#f0883e"
            font.pixelSize: 12
        }

        RowLayout {
            spacing: 12
            Layout.fillWidth: true

${inputFields}

            Button {
                text: "${firstMethod.methodName}"
                enabled: root.ready
                onClicked: {
                    logos.watch(backend.${firstMethod.methodName}(${callArgs}),
                        function(value) { resultText.text = "Result: " + value },
                        function(error) { resultText.text = "Error: " + error }
                    )
                }
            }
        }

        Text {
            id: resultText
            text: "Press ${firstMethod.methodName} to call the backend"
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
`
  );
}

function createFullApp(
  dir: string,
  name: string,
  description: string,
  externalLib: boolean,
  filesCreated: string[],
  libDir?: string | null
) {
  const uiName = `${name}_ui`;
  const moduleDir = path.join(dir, `${name}-module`);
  const uiDir = path.join(dir, `${name}-ui`);

  // Scaffold the module sub-project (with external lib if provided)
  createUniversalModule(moduleDir, name, description, externalLib, filesCreated, libDir);

  // Scaffold the UI sub-project (named <name>_ui)
  createQmlBackendApp(uiDir, uiName, description, filesCreated);

  // If external lib provided, patch UI to expose library methods via the backend
  if (libDir) {
    const headerFile = findHeaderInDir(libDir);
    if (headerFile) {
      const libName = detectLibName(headerFile);
      const headerContent = fs.readFileSync(path.join(libDir, headerFile), "utf-8");
      const functions = parseCHeader(headerContent);
      const methods = cFunctionsToCppMethods(functions, libName);
      if (methods.length > 0) {
        patchUiForExtLib(uiDir, uiName, name, methods);
      }
    }
  }

  // Patch ui/metadata.json to declare the module as a runtime dependency
  const uiMetadataPath = path.join(uiDir, "metadata.json");
  const uiMetadata = JSON.parse(fs.readFileSync(uiMetadataPath, "utf-8"));
  uiMetadata.dependencies = [name];
  fs.writeFileSync(uiMetadataPath, JSON.stringify(uiMetadata, null, 2) + "\n");

  // Overwrite ui/flake.nix to add the module as a flake input so
  // logos-module-builder can resolve the runtime dependency declaration.
  const flakeEscDescription = description.replace(/"/g, '\\"').replace(/\r?\n/g, " ");
  // Use fs.writeFileSync directly (not writeFile) to avoid a duplicate entry in
  // filesCreated — createUiApp() already tracked this path.
  fs.writeFileSync(
    path.join(uiDir, "flake.nix"),
    `{
  description = "${flakeEscDescription}";

  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";
    nix-bundle-lgx.url = "github:logos-co/nix-bundle-lgx";
    ${name}.url = "path:../${name}-module";
  };

  outputs = inputs@{ logos-module-builder, ... }:
    let
      base = logos-module-builder.lib.mkLogosQmlModule {
        src = ./.;
        configFile = ./metadata.json;
        flakeInputs = inputs;
      };
    in
    base // (
      if base ? apps then {
        apps = builtins.mapAttrs (_system: apps:
          apps // { app = apps.default; }
        ) base.apps;
      } else {}
    );
}
`
  );

  // Root project.json — metadata for AI context generators
  writeFile(
    path.join(dir, "project.json"),
    JSON.stringify(
      {
        type: "full-app",
        name,
        description,
        module: `${name}-module`,
        ui: `${name}-ui`,
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
