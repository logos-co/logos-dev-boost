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
        in
        {
          default = pkgs.buildNpmPackage {
            pname = "logos-dev-boost";
            version = "0.1.0";
            src = ./.;

            npmDepsHash = "sha256-gYlu6L6CgYAa8c6xsCExogTcrn2bZVd7IropWQe+I8g=";

            nativeBuildInputs = [ nodejs pkgs.makeWrapper ];

            buildPhase = ''
              runHook preBuild
              npx tsc
              runHook postBuild
            '';

            dontNpmPack = true;

            installPhase = ''
              runHook preInstall

              mkdir -p $out/lib/logos-dev-boost
              cp -r dist docs guidelines skills templates node_modules package.json $out/lib/logos-dev-boost/

              mkdir -p $out/bin
              makeWrapper ${nodejs}/bin/node $out/bin/logos-dev-boost \
                --add-flags "$out/lib/logos-dev-boost/dist/installer/cli.js"

              makeWrapper ${nodejs}/bin/node $out/bin/logos-dev-boost-mcp \
                --add-flags "$out/lib/logos-dev-boost/dist/mcp-server/index.js"

              runHook postInstall
            '';

            meta = with pkgs.lib; {
              description = "AI-assisted development accelerator for the Logos modular application platform";
              license = licenses.mit;
              mainProgram = "logos-dev-boost";
            };
          };

          docs = pkgs.runCommand "logos-dev-boost-docs" {} ''
            mkdir -p $out
            cp -r ${./docs} $out/docs
            cp -r ${./guidelines} $out/guidelines
            cp -r ${./skills} $out/skills
            cp -r ${./templates} $out/templates
          '';
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/logos-dev-boost";
        };
        # Alias for `nix run .#app` (same as default)
        app = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/logos-dev-boost";
        };
        mcp-server = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/logos-dev-boost-mcp";
        };
      });

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
