#!/usr/bin/env bash
# Keep DMTools-generated Jira cache from blocking checkout of an older branch
# that tracks the same path. Never delete cache files or touch tracked files.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

[[ -d .dmtools/cacheBasicJiraClient ]] || exit 0

backup_dir=""
while IFS= read -r -d '' cache_file; do
  if [[ -z "$backup_dir" ]]; then
    backup_dir="$(mktemp -d "${TMPDIR:-/tmp}/bonapp-jira-cache.XXXXXX")"
  fi
  destination="$backup_dir/$cache_file"
  mkdir -p "$(dirname "$destination")"
  mv -- "$cache_file" "$destination"
  printf 'Preserved untracked Jira cache: %s -> %s\n' "$cache_file" "$destination"
done < <(git ls-files --others --exclude-standard -z -- .dmtools/cacheBasicJiraClient/)
