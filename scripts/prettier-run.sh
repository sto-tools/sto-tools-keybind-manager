#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

files=()
while IFS= read -r -d '' file; do
  if [[ -f "${file}" ]]; then
    files+=("${file}")
  fi
done < <(git ls-files --cached --others --exclude-standard -z)

if (( ${#files[@]} == 0 )); then
  exit 0
fi

prettier --ignore-unknown "$@" "${files[@]}"
