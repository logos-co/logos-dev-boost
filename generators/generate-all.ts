import * as path from "node:path";
import { execSync } from "node:child_process";

const projectDir = process.argv[2] || process.cwd();
const boostDir = process.argv[3] || path.resolve(import.meta.dirname, "..", "..");

const generators = [
  "generate-agents-md.js",
  "generate-claude-md.js",
  "generate-cursor-rules.js",
  "generate-llms-txt.js",
];

for (const gen of generators) {
  const genPath = path.join(import.meta.dirname, gen);
  console.log(`Running ${gen}...`);
  execSync(`node "${genPath}" "${projectDir}" "${boostDir}"`, {
    stdio: "inherit",
  });
}

console.log("\nAll context files generated.");
