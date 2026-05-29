#!/bin/sh
set -eu

repo_owner="raeseoklee"
repo_name="codexus"
ref="${CODEXUS_REF:-main}"
install_dir="${CODEXUS_INSTALL_DIR:-$HOME/.local/share/codexus}"
bin_dir="${CODEXUS_BIN_DIR:-$HOME/.local/bin}"
install_skill="${CODEXUS_INSTALL_CODEX_SKILL:-1}"

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
need_cmd tar

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$node_major" -lt 26 ]; then
  fail "Node.js 26 or newer is required; found $(node --version)"
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/codexus-install.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

copy_tree() {
  src="$1"
  dst="$2"
  rm -rf "$dst"
  mkdir -p "$dst"
  cp -R "$src"/. "$dst"/
  rm -rf "$dst/.git" "$dst/.codex-harness" "$dst/.omx" "$dst/node_modules"
}

if [ "${CODEXUS_SOURCE_DIR:-}" ]; then
  source_dir="$CODEXUS_SOURCE_DIR"
  [ -d "$source_dir" ] || fail "CODEXUS_SOURCE_DIR is not a directory: $source_dir"
  log "Installing Codexus from local source: $source_dir"
else
  need_cmd curl
  archive_kind="tags"
  case "$ref" in
    main|master|develop|trunk)
      archive_kind="heads"
      ;;
  esac
  archive_url="${CODEXUS_ARCHIVE_URL:-https://github.com/$repo_owner/$repo_name/archive/refs/$archive_kind/$ref.tar.gz}"
  archive_path="$tmp_dir/codexus.tar.gz"
  log "Downloading Codexus from $archive_url"
  curl -fsSL "$archive_url" -o "$archive_path"
  tar -xzf "$archive_path" -C "$tmp_dir"
  source_dir="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [ -n "$source_dir" ] || fail "downloaded archive did not contain a source directory"
fi

mkdir -p "$(dirname "$install_dir")"
copy_tree "$source_dir" "$install_dir"

chmod +x "$install_dir/src/cli/main.ts" 2>/dev/null || true
chmod +x "$install_dir/scripts/install-codex-skill.mjs" 2>/dev/null || true
chmod +x "$install_dir/install.sh" 2>/dev/null || true

mkdir -p "$bin_dir"
ln -sfn "$install_dir/src/cli/main.ts" "$bin_dir/cx"
ln -sfn "$install_dir/src/cli/main.ts" "$bin_dir/codexus"
ln -sfn "$install_dir/src/cli/main.ts" "$bin_dir/chx"

if [ "$install_skill" != "0" ]; then
  if node "$install_dir/scripts/install-codex-skill.mjs" --json >/dev/null 2>&1; then
    log "Installed Codexus skill adapter into CODEX_HOME."
  else
    log "Skipped Codexus skill adapter install. Re-run with npm run install:codex-skill from $install_dir for details."
  fi
fi

log "Installed Codexus to $install_dir"
log "Linked cx, codexus, and chx into $bin_dir"

case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) log "Add $bin_dir to PATH to run cx from any shell." ;;
esac

log "Try: $bin_dir/cx doctor --json"
