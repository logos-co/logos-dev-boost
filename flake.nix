{
  description = "logos-dev-boost — AI-assisted development accelerator for the Logos modular application platform";

  inputs = {
    logos-nix.url = "github:logos-co/logos-nix";
    nixpkgs.follows = "logos-nix/nixpkgs";
  };

  outputs = { self, nixpkgs, logos-nix }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};

          nodejs = pkgs.nodejs_20;

          # Build the TypeScript project
          logos-dev-boost = pkgs.buildNpmPackage {
            pname = "logos-dev-boost";
            version = "0.1.0";
            src = ./.;

            npmDepsHash = "";  # Will be set after first npm install

            nativeBuildInputs = [ nodejs ];

            buildPhase = ''
              npx tsc
            '';

            installPhase = ''
              mkdir -p $out/{bin,lib/logos-dev-boost}
              cp -r dist $out/lib/logos-dev-boost/
              cp -r docs guidelines skills templates $out/lib/logos-dev-boost/
              cp package.json $out/lib/logos-dev-boost/

              # Copy node_modules for runtime deps
              cp -r node_modules $out/lib/logos-dev-boost/ 2>/dev/null || true

              # Create CLI wrapper
              cat > $out/bin/logos-dev-boost <<EOF
              #!/usr/bin/env bash
              exec ${nodejs}/bin/node $out/lib/logos-dev-boost/dist/installer/cli.js "\$@"
              EOF
              chmod +x $out/bin/logos-dev-boost

              # Create MCP server wrapper
              cat > $out/bin/logos-dev-boost-mcp <<EOF
              #!/usr/bin/env bash
              exec ${nodejs}/bin/node $out/lib/logos-dev-boost/dist/mcp-server/index.js "\$@"
              EOF
              chmod +x $out/bin/logos-dev-boost-mcp
            '';

            meta = with pkgs.lib; {
              description = "AI-assisted development accelerator for the Logos modular application platform";
              license = licenses.mit;
            };
          };

          # Docs-only package (no Node.js needed)
          docs = pkgs.runCommand "logos-dev-boost-docs" {} ''
            mkdir -p $out
            cp -r ${./docs} $out/docs
            cp -r ${./guidelines} $out/guidelines
            cp -r ${./skills} $out/skills
            cp -r ${./templates} $out/templates
            ${if builtins.pathExists ./llms.txt then "cp ${./llms.txt} $out/llms.txt" else ""}
          '';
        in
        {
          default = logos-dev-boost;
          inherit docs;
        }
      );

      # CLI apps
      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/logos-dev-boost";
        };
        mcp-server = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/logos-dev-boost-mcp";
        };
      });

      # Dev shell
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            buildInputs = [
              pkgs.nodejs_20
              pkgs.nodePackages.typescript
            ];
          };
        }
      );
    };
}
