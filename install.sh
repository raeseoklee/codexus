#!/bin/sh
set -eu

package_spec="${CODEXUS_NPM_SPEC:-codexus@next}"
npm_prefix="${CODEXUS_NPM_PREFIX:-$HOME/.local}"
bin_dir="${CODEXUS_BIN_DIR:-$npm_prefix/bin}"
install_skill="${CODEXUS_INSTALL_CODEX_SKILL:-1}"
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
if [ "$install_skill" != "0" ]; then
  if node "$package_root/scripts/install-codex-skill.mjs" --json >/dev/null 2>&1; then
    log "Installed Codexus skill adapter into CODEX_HOME."
  else
    log "Skipped Codexus skill adapter install. Re-run with: node $package_root/scripts/install-codex-skill.mjs --json"
  fi
fi

log "Installed Codexus package to $package_root"
log "Linked cx and codexus into $prefix_bin"

case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) log "Add $bin_dir to PATH to run cx from any shell." ;;
esac

log "Try: $bin_dir/cx schema check --json"
