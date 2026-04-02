import * as fs from "node:fs";
import * as path from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const searchDocsTool: Tool = {
  name: "logos_search_docs",
  description:
    "Search Logos ecosystem documentation. Returns relevant documentation sections matching the query, ranked by relevance. Covers module development, build system, code generation, packaging, testing, and API reference.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search query (e.g., 'how to create a universal module', 'type mapping table', 'logoscore testing')",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (default: 5)",
      },
    },
    required: ["query"],
  },
};

interface DocSection {
  source: string;
  heading: string;
  content: string;
}

function loadDocs(boostDir: string): DocSection[] {
  const sections: DocSection[] = [];
  const dirs = ["docs", "guidelines"];

  for (const dir of dirs) {
    const fullDir = path.join(boostDir, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(fullDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const source = `${dir}/${file}`;

      const parts = content.split(/^## /m);
      for (const part of parts) {
        const lines = part.trim().split("\n");
        if (lines.length === 0) continue;
        const heading = lines[0].replace(/^#+\s*/, "").trim();
        const body = lines.slice(1).join("\n").trim();
        if (heading && body) {
          sections.push({ source, heading, content: body });
        }
      }
    }
  }

  // Also load skills
  const skillsDir = path.join(boostDir, "skills");
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir);
    for (const skill of skills) {
      const skillPath = path.join(skillsDir, skill, "SKILL.md");
      if (!fs.existsSync(skillPath)) continue;
      const content = fs.readFileSync(skillPath, "utf-8");
      const bodyStart = content.indexOf("---", 3);
      const body = bodyStart > 0 ? content.slice(bodyStart + 3).trim() : content;
      sections.push({
        source: `skills/${skill}/SKILL.md`,
        heading: skill,
        content: body,
      });
    }
  }

  return sections;
}

function simpleSearch(sections: DocSection[], query: string, maxResults: number): DocSection[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const scored = sections.map((section) => {
    const text = `${section.heading} ${section.content}`.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      const headingCount = (section.heading.toLowerCase().match(new RegExp(term, "g")) || []).length;
      const contentCount = (text.match(new RegExp(term, "g")) || []).length;
      score += headingCount * 3 + contentCount;
    }

    const allTermsPresent = queryTerms.every((term) => text.includes(term));
    if (allTermsPresent) score *= 2;

    return { section, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.section);
}

export function handleSearchDocs(args: Record<string, unknown>) {
  const query = args.query as string;
  if (!query) {
    return {
      content: [{ type: "text" as const, text: "Error: query is required" }],
      isError: true,
    };
  }

  const maxResults = (args.maxResults as number) || 5;
  const boostDir = path.resolve(import.meta.dirname, "../../..");
  const sections = loadDocs(boostDir);
  const results = simpleSearch(sections, query, maxResults);

  if (results.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No results found for: "${query}". Try broader terms or check available guidelines and skills.`,
        },
      ],
    };
  }

  const output = results.map((r, i) => {
    const truncated =
      r.content.length > 500 ? r.content.slice(0, 500) + "..." : r.content;
    return `### ${i + 1}. ${r.heading}\n**Source:** ${r.source}\n\n${truncated}`;
  });

  return {
    content: [
      {
        type: "text" as const,
        text: output.join("\n\n---\n\n"),
      },
    ],
  };
}
