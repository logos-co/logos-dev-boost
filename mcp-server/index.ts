import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { handleProjectInfo, projectInfoTool } from "./tools/project-info.js";
import { handleSearchDocs, searchDocsTool } from "./tools/search-docs.js";
import { handleApiReference, apiReferenceTool } from "./tools/api-reference.js";
import { handleBuildHelp, buildHelpTool } from "./tools/build-help.js";
import { handleScaffold, scaffoldTool } from "./tools/scaffold.js";

const server = new Server(
  {
    name: "logos-dev-boost",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    projectInfoTool,
    searchDocsTool,
    apiReferenceTool,
    buildHelpTool,
    scaffoldTool,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "logos_project_info":
      return handleProjectInfo(args || {});
    case "logos_search_docs":
      return handleSearchDocs(args || {});
    case "logos_api_reference":
      return handleApiReference(args || {});
    case "logos_build_help":
      return handleBuildHelp(args || {});
    case "logos_scaffold":
      return handleScaffold(args || {});
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
