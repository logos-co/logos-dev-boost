#!/usr/bin/env bash
#
# Execute the dev-boost module-scaffold doc-test end-to-end and regenerate its
# Markdown.
#
# The runner is the shared `doctest` CLI
# (https://github.com/logos-co/logos-doctest), invoked directly via its flake.
# `doctest run` executes every command in a temp directory (scaffolding a
# crypto_utils module with this dev-boost commit, building it, introspecting it
# with lm, running its unit tests, and calling it through logoscore) and asserts
# on the output; `doctest generate` renders the same spec to Markdown under
# outputs/; `doctest clean` strips build artifacts so only the generated docs
# remain.
#
# To run against a local logos-doctest checkout instead of the published flake,
# set DOCTEST, e.g.:  DOCTEST="nix run path:../../logos-doctest --" ./run.sh
#
set -euo pipefail

# Run from this doctests/ directory regardless of where the script is invoked from.
cd "$(dirname "$0")"

# The doctest CLI. Override by exporting DOCTEST (space-separated command).
read -r -a DOCTEST <<< "${DOCTEST:-nix run github:logos-co/logos-doctest --}"
OUTPUT_DIR="./outputs"
SPEC="dev-boost-scaffold-module.test.yaml"

# Build the doc-test against THIS repo's current commit rather than the latest
# published flake. The spec scaffolds with
# `github:logos-co/logos-dev-boost{release}`, and the pin below makes {release}
# expand to $COMMIT — so the scaffold under test is the one this checkout emits.
# Override by exporting COMMIT (e.g. a tag), or set COMMIT="" to fall back to
# latest master.
#
# Note: nix fetches the commit from the GitHub remote, so $COMMIT must be pushed
# to logos-co/logos-dev-boost. A local-only / uncommitted HEAD won't resolve;
# export COMMIT="" (or push first) in that case.
COMMIT="${COMMIT-$(git rev-parse HEAD)}"
RELEASE_FOR=()
if [ -n "${COMMIT}" ]; then
  RELEASE_FOR=(--release-for "logos-dev-boost=${COMMIT}")
  echo "==> Pinning logos-dev-boost to ${COMMIT}"
else
  echo "==> COMMIT empty; building against latest logos-dev-boost master"
fi

echo "==> Clearing previous ${OUTPUT_DIR}/"
# A prior run copies module artifacts out of the read-only nix store, so the
# directories land read-only (r-x) too. `rm -rf` can't delete files inside a
# directory it can't write to, so restore write permission first.
if [ -e "${OUTPUT_DIR}" ]; then
  chmod -R u+w "${OUTPUT_DIR}" 2>/dev/null || true
fi
rm -rf "${OUTPUT_DIR}"

echo "==> Running ${SPEC} into ${OUTPUT_DIR}/"
# ${RELEASE_FOR[@]+...} guards the expansion so an empty array doesn't trip
# `set -u` on older bash (e.g. macOS's stock 3.2).
"${DOCTEST[@]}" run "${SPEC}" \
  --verbose \
  --continue-on-fail \
  ${RELEASE_FOR[@]+"${RELEASE_FOR[@]}"} \
  --output-dir "${OUTPUT_DIR}/"

echo "==> Generating ${OUTPUT_DIR}/dev-boost-scaffold-module.md"
mkdir -p "${OUTPUT_DIR}"
"${DOCTEST[@]}" generate "${SPEC}" \
  ${RELEASE_FOR[@]+"${RELEASE_FOR[@]}"} \
  -o "${OUTPUT_DIR}/dev-boost-scaffold-module.md"

if [ ! -d "${OUTPUT_DIR}" ]; then
  echo "==> No ${OUTPUT_DIR}/ produced; nothing to clean."
  exit 0
fi

echo "==> Cleaning build artifacts from ${OUTPUT_DIR}/"
"${DOCTEST[@]}" clean "${OUTPUT_DIR}" --verbose

echo "==> Done. Rendered doc is in ${OUTPUT_DIR}/dev-boost-scaffold-module.md"
