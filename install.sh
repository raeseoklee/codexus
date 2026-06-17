#!/bin/sh
set -eu

package_spec="${CODEXUS_NPM_SPEC:-codexus}"
npm_prefix="${CODEXUS_NPM_PREFIX:-$HOME/.local}"
bin_dir="${CODEXUS_BIN_DIR:-$npm_prefix/bin}"
install_skill="${CODEXUS_INSTALL_CODEX_SKILL:-1}"
expected_version="${CODEXUS_EXPECTED_VERSION:-}"
case "$install_skill" in
  0|false|False|FALSE|no|No|NO|off|Off|OFF) install_skill=0 ;;
  *) install_skill=1 ;;
esac

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'codexus install: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

usage() {
  cat <<EOF
codexus install — install the Codexus CLI (codexus, cx) globally via npm.

Usage:
  sh install.sh [--help]

Runs \`npm install -g\` for the Codexus package and links the \`codexus\` and
\`cx\` binaries into your bin directory. Configure it through environment
variables (current effective values shown):

  CODEXUS_NPM_SPEC             npm package spec to install        [$package_spec]
  CODEXUS_NPM_PREFIX           npm --prefix install root          [$npm_prefix]
  CODEXUS_BIN_DIR              directory for codexus/cx links      [$bin_dir]
  CODEXUS_INSTALL_CODEX_SKILL  install the Codex skill adapter     [$install_skill]
  CODEXUS_EXPECTED_VERSION     assert the installed version match  [${expected_version:-<none>}]

Examples:
  sh install.sh
  CODEXUS_NPM_PREFIX=/usr/local sh install.sh
  CODEXUS_NPM_SPEC=codexus@0.2.5 sh install.sh
EOF
}

# Parse arguments BEFORE any side effect (node/npm probes, install). --help must
# be non-destructive and must not require node/npm to be present.
while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*) printf 'codexus install: unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
    *) printf 'codexus install: unexpected argument: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

need_cmd node
need_cmd npm

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$node_major" -lt 22 ]; then
  fail "Node.js 22 or newer is required; found $(node --version)"
fi

log "Installing $package_spec with npm prefix $npm_prefix"
CODEXUS_INSTALL_CODEX_SKILL=0 npm install -g "$package_spec" --prefix "$npm_prefix"

prefix_bin="$npm_prefix/bin"
mkdir -p "$bin_dir"
if [ "$bin_dir" != "$prefix_bin" ]; then
  ln -sfn "$prefix_bin/cx" "$bin_dir/cx"
  ln -sfn "$prefix_bin/codexus" "$bin_dir/codexus"
fi

package_root="$(npm root -g --prefix "$npm_prefix")/codexus"
package_json="$package_root/package.json"
[ -f "$package_json" ] || fail "npm install succeeded but Codexus package root was not found: $package_root"
package_version="$(node -e "const fs=require('fs'); const path=process.argv[1]; console.log(JSON.parse(fs.readFileSync(path, 'utf8')).version)" "$package_json")"
if [ -n "$expected_version" ] && [ "$package_version" != "$expected_version" ]; then
  fail "installed codexus@$package_version but expected $expected_version from $package_spec"
fi

if [ "$install_skill" != "0" ]; then
  if node "$package_root/scripts/install-codex-skill.mjs" --json >/dev/null 2>&1; then
    log "Installed Codexus skill adapter into CODEX_HOME."
  else
    log "Skipped Codexus skill adapter install. Re-run with: node $package_root/scripts/install-codex-skill.mjs --json"
  fi
fi

log "Installed Codexus $package_version to $package_root"
if [ "$bin_dir" = "$prefix_bin" ]; then
  log "Linked codexus and cx into $bin_dir"
else
  log "Linked codexus and cx into $bin_dir (targeting $prefix_bin)"
fi

case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) log "Add $bin_dir to PATH to run codexus from any shell." ;;
esac

log "Try: $bin_dir/codexus schema check --json"
