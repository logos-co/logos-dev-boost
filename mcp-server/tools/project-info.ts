import * as fs from "node:fs";
import * as path from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const projectInfoTool: Tool = {
  name: "logos_project_info",
  description:
    "Returns structured metadata about the current Logos project: type (module/ui-app), interface (universal/legacy), SDK version, dependencies, build targets, and detected configuration.",
  inputSchema: {
    type: "object" as const,
    properties: {
      directory: {
        type: "string",
        description: "Project directory to inspect (defaults to current directory)",
      },
    },
  },
};

interface ProjectInfo {
  projectType: string;
  interfaceType: string;
  name: string;
  version: string;
  description: string;
  dependencies: string[];
  buildTargets: string[];
  hasTests: boolean;
  hasFlake: boolean;
  hasMetadata: boolean;
  nixInputs: Record<string, string>;
  cmakePackages: string[];
  externalLibraries: string[];
}

export function handleProjectInfo(args: Record<string, unknown>) {
  const dir = (args.directory as string) || process.cwd();
  const info = inspectProject(dir);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(info, null, 2),
      },
    ],
  };
}

function inspectProject(dir: string): ProjectInfo {
  const info: ProjectInfo = {
    projectType: "unknown",
    interfaceType: "none",
    name: "unknown",
    version: "0.0.0",
    description: "",
    dependencies: [],
    buildTargets: ["default"],
    hasTests: false,
    hasFlake: false,
    hasMetadata: false,
    nixInputs: {},
    cmakePackages: [],
    externalLibraries: [],
  };

  const metadataPath = path.join(dir, "metadata.json");
  if (fs.existsSync(metadataPath)) {
    info.hasMetadata = true;
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    info.name = metadata.name || "unknown";
    info.version = metadata.version || "0.0.0";
    info.description = metadata.description || "";
    if (metadata.type === "ui_qml") {
      info.projectType = metadata.main ? "ui-qml-backend" : "ui-qml";
    } else if (metadata.type === "ui") {
      info.projectType = "ui-qml"; // legacy type
    } else {
      info.projectType = "module";
    }
    info.interfaceType = metadata.interface === "universal" ? "universal" : "legacy";
    info.dependencies = metadata.dependencies || [];

    if (metadata.nix?.cmake?.find_packages) {
      info.cmakePackages = metadata.nix.cmake.find_packages;
    }
    if (metadata.nix?.external_libraries) {
      info.externalLibraries = metadata.nix.external_libraries.map(
        (lib: { name: string }) => lib.name
      );
    }
  }

  const flakePath = path.join(dir, "flake.nix");
  if (fs.existsSync(flakePath)) {
    info.hasFlake = true;
    const flakeContent = fs.readFileSync(flakePath, "utf-8");

    const inputMatches = flakeContent.matchAll(
      /(\w[\w-]*)\.url\s*=\s*"([^"]+)"/g
    );
    for (const match of inputMatches) {
      info.nixInputs[match[1]] = match[2];
    }
  }

  const testsDir = path.join(dir, "tests");
  if (fs.existsSync(testsDir)) {
    info.hasTests = true;
    info.buildTargets.push("check");
  }

  return info;
}
