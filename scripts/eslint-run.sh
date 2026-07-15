#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/eslint-run.sh <cache-name> <eslint-args...>

Environment:
  STO_KEYBIND_ESLINT_CACHE_ROOT      Root directory for ESLint cache files.
  STO_KEYBIND_ESLINT_CACHE_LOCATION  Explicit cache file path override.
EOF
}

if [[ "$#" -lt 2 ]]; then
  usage >&2
  exit 1
fi

cache_name="$1"
shift

explicit_cache_location="${STO_KEYBIND_ESLINT_CACHE_LOCATION:-}"
default_cache_root="${STO_KEYBIND_ESLINT_CACHE_ROOT:-${HOME}/.cache/sto-tools-keybind-manager/eslint}"
fallback_cache_root="${STO_KEYBIND_ESLINT_FALLBACK_CACHE_ROOT:-${TMPDIR:-/tmp}/sto-tools-keybind-manager/eslint}"

if [[ -n "${explicit_cache_location}" ]]; then
  cache_location="${explicit_cache_location}"
  mkdir -p "$(dirname "${cache_location}")"
else
  cache_location="${default_cache_root}/${cache_name}.eslintcache"
  if ! mkdir -p "$(dirname "${cache_location}")" 2>/dev/null; then
    cache_location="${fallback_cache_root}/${cache_name}.eslintcache"
    mkdir -p "$(dirname "${cache_location}")"
  fi
fi

exec eslint \
  --cache \
  --cache-strategy content \
  --cache-location "${cache_location}" \
  "$@"
