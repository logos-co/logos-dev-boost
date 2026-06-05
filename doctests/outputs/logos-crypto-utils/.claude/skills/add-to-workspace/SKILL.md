---
name: add-to-workspace
description: Activate when registering a new module in the logos-workspace. Covers adding git submodules, flake.nix inputs with follows declarations, scripts/ws REPOS array, repo groups, and dep-graph.nix regeneration.
---

# Add a Module to logos-workspace

## When to Use

Use this skill when:
- Adding a new module repo as a submodule to the workspace
- Registering a module in the workspace flake.nix
- Updating the ws CLI configuration

## Step 1: Add Git Submodule

```bash
git submodule add git@github.com:logos-co/<repo-name>.git repos/<repo-name>
```

## Step 2: Read the Module's flake.nix

```bash
cat repos/<repo-name>/flake.nix
```

Identify which workspace repos it depends on (logos-module-builder, logos-cpp-sdk, etc.) and what input names it uses.

## Step 3: Add to Workspace flake.nix

Add an input block with `follows` for each workspace dependency:

```nix
<repo-name> = {
  url = "github:logos-co/<repo-name>";
  inputs.logos-module-builder.follows = "logos-module-builder";
  inputs.nix-bundle-lgx.follows = "nix-bundle-lgx";
  # Add follows for each workspace dep the repo uses
};
```

**follows Rules:**
- Left side = input name as declared in the module's own flake.nix
- Right side = workspace flake input name
- These usually match but not always
- External deps (not in workspace) do NOT get follows

Add the repo name to the `repoInputNames` list in the appropriate category.

## Step 4: Add to scripts/ws REPOS Array

```bash
"<repo-name>|<repo-name>|https://github.com/logos-co/<repo-name>.git|yes"
```

Format: `"input_name|directory_name|git_url|has_flake"`

If the repo belongs in a group, also update the `REPO_GROUPS` array.

## Step 5: Regenerate dep-graph.nix

```bash
ws sync-graph
```

This reads every repo's flake.nix, extracts dependencies, and regenerates `nix/dep-graph.nix`.

## Step 6: Verify

```bash
ws build <repo-name>
ws test <repo-name>
ws graph <repo-name>
```

## Checklist

- [ ] `.gitmodules` — submodule registered
- [ ] `flake.nix` inputs — input block with correct `follows`
- [ ] `flake.nix` `repoInputNames` — listed in correct category
- [ ] `scripts/ws` REPOS — entry with `has_flake=yes`
- [ ] `scripts/ws` REPO_GROUPS — added to relevant group (if applicable)
- [ ] `nix/dep-graph.nix` — regenerated via `ws sync-graph`
