#!/bin/bash
# Claude Code provider for run-agent.sh
# Uses Anthropic Claude Code CLI (claude -p), authenticated one of three ways.
#
# Auth (pick ONE; checked in this priority order):
#   1. CLAUDE_CODE_OAUTH_TOKEN - subscription-based auth (Pro/Max plan token,
#                                same as `claude setup-token` / claude-code-action).
#                                No API billing account needed.
#   2. CLAUDE_CODE_API_KEY     - Anthropic API key (or proxy API key), billed
#                                via the Anthropic Console.
# Optional (only meaningful with CLAUDE_CODE_API_KEY):
#   CLAUDE_CODE_BASE_URL  - Base URL of a proxy. Omit to call the Anthropic
#                           API directly with CLAUDE_CODE_API_KEY.
# Optional (either auth mode):
#   CLAUDE_CODE_MODEL     - Model ID (default: claude-sonnet-4-6)
#   CLAUDE_CODE_MAX_TURNS - Max agentic turns (default: 10)
#
# Optional multi-account fallback (oauth mode only):
#   CLAUDE_CODE_OAUTH_TOKEN_2 - a second Pro/Max subscription's token. If the
#                               first token's account hits its Claude usage
#                               limit mid-run, the CLI prints the literal
#                               string "Claude AI usage limit reached" (see
#                               anthropics/claude-code#2087, #9046) — this is
#                               currently the only detectable signal for
#                               subscription-limit exhaustion, there is no
#                               dedicated exit code or stream-json subtype for
#                               it. On that signal, the whole run is retried
#                               once from scratch against the second account.
#                               If the second account ALSO hits the same
#                               limit, run_claude_code returns non-zero and
#                               the job fails — ai-teammate.yml then reports
#                               failure and sm-agent.yml's next cycle will
#                               naturally re-queue this ticket once a human
#                               notices and a token has capacity again; there
#                               is no automatic third retry or backoff here by
#                               design, to avoid silently burning through a
#                               fully exhausted pair of accounts on every SM
#                               cycle.
#
# Note: ANTHROPIC_*/CLAUDE_CODE_OAUTH_TOKEN vars are set locally inside this
# script only (required by the Claude Code CLI). They are never exported at
# the workflow level to avoid conflicts with DMTools ANTHROPIC_* vars.

# Literal substring the Claude Code CLI prints (stdout/stderr and inside the
# stream-json result text) when the authenticated account's Claude
# subscription usage limit (5-hour or weekly window) is exhausted. Not a
# structured field — see anthropics/claude-code#2087, #9046, #50321.
readonly CLAUDE_USAGE_LIMIT_MARKER="usage limit reached"

run_claude_code() {
  if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${CLAUDE_CODE_API_KEY:-}" ]; then
    echo "Error: either CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CODE_API_KEY is required for claude-code provider" >&2
    return 1
  fi

  # Build the ordered list of oauth tokens to try. API-key auth has no
  # concept of a second account here (billed usage, not a plan quota), so it
  # always gets exactly one attempt.
  local -a claude_token_attempts=()
  if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    claude_token_attempts+=("${CLAUDE_CODE_OAUTH_TOKEN}")
    if [ -n "${CLAUDE_CODE_OAUTH_TOKEN_2:-}" ]; then
      claude_token_attempts+=("${CLAUDE_CODE_OAUTH_TOKEN_2}")
    fi
  else
    claude_token_attempts+=("")  # placeholder: api-key mode ignores this value
  fi

  local claude_attempt_idx=0
  local claude_attempt_total=${#claude_token_attempts[@]}
  local claude_final_exit_code=0
  for claude_current_token in "${claude_token_attempts[@]}"; do
    claude_attempt_idx=$((claude_attempt_idx + 1))
    if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
      export CLAUDE_CODE_OAUTH_TOKEN="${claude_current_token}"
      # Identify which account is in use by the last 6 chars of its token
      # (never the full token) — lets you correlate a run in the Actions log
      # with which of your accounts actually took the quota hit, without
      # exposing the secret itself.
      local claude_token_fingerprint="...${claude_current_token: -6}"
      echo "🔑 Claude Code account ${claude_attempt_idx}/${claude_attempt_total} (token ending ${claude_token_fingerprint})"
    fi

    _run_claude_code_once
    claude_final_exit_code=$?

    if [ "$claude_final_exit_code" -eq 0 ]; then
      return 0
    fi

    if [ "${CLAUDE_USAGE_LIMIT_HIT:-false}" != "true" ]; then
      # Failed for a reason other than usage-limit exhaustion — do not burn
      # the second account on an unrelated failure (bad prompt, tool error,
      # network blip); surface it immediately as-is.
      return "$claude_final_exit_code"
    fi

    if [ "$claude_attempt_idx" -lt "$claude_attempt_total" ]; then
      echo "⚠️  Account ${claude_attempt_idx} hit its Claude usage limit — switching to the next configured account and retrying this job from scratch."
      # A saved session id belongs to the account that created it — resuming
      # it under a different account's token would either fail outright or
      # (worse) silently mix state across two unrelated Claude accounts.
      # Drop it so the next attempt starts a genuinely fresh session.
      rm -f .claude-session-id
    fi
  done

  if [ "${CLAUDE_USAGE_LIMIT_HIT:-false}" = "true" ]; then
    echo "🛑 All configured Claude Code accounts (${claude_attempt_total}) are usage-limited — stopping this job. It will be retried automatically once sm-agent's next cycle re-scans this ticket and a token has capacity again." >&2
  fi
  return "$claude_final_exit_code"
}

# Single end-to-end attempt against whichever token run_claude_code just
# exported. Sets CLAUDE_USAGE_LIMIT_HIT=true when the failure specifically
# matches CLAUDE_USAGE_LIMIT_MARKER, so the caller can decide whether a
# retry against a different account is warranted.
_run_claude_code_once() {
  CLAUDE_USAGE_LIMIT_HIT=false

  local claude_auth_mode=""
  if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    claude_auth_mode="oauth"
  elif [ -n "${CLAUDE_CODE_API_KEY:-}" ]; then
    claude_auth_mode="api-key"
  else
    echo "Error: either CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CODE_API_KEY is required for claude-code provider" >&2
    return 1
  fi

  local claude_code_model="${CLAUDE_CODE_MODEL:-claude-sonnet-4-6}"
  local claude_code_max_turns="${CLAUDE_CODE_MAX_TURNS:-10}"

  if ! command -v claude >/dev/null 2>&1; then
    echo "Error: claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code" >&2
    return 1
  fi

  if [ "${claude_auth_mode}" = "oauth" ]; then
    export CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN}"
  else
    # Map CLAUDE_CODE_* → ANTHROPIC_* required by Claude Code SDK (subprocess scope only).
    # CLAUDE_CODE_BASE_URL is optional — unset it, and the CLI talks to the
    # Anthropic API directly using CLAUDE_CODE_API_KEY as ANTHROPIC_API_KEY.
    if [ -n "${CLAUDE_CODE_BASE_URL:-}" ]; then
      export ANTHROPIC_BASE_URL="${CLAUDE_CODE_BASE_URL}"
    fi
    export ANTHROPIC_API_KEY="${CLAUDE_CODE_API_KEY}"
  fi
  export ANTHROPIC_MODEL="${claude_code_model}"

  echo "Claude Code Configuration:"
  echo "  Auth mode:   ${claude_auth_mode}"
  echo "  Model:       ${claude_code_model}"
  echo "  Base URL:    ${CLAUDE_CODE_BASE_URL:-(default: api.anthropic.com)}"
  echo "  Max turns:   ${claude_code_max_turns}"
  echo "Working directory: $(pwd)"
  echo ""

  local claude_code_exit_code=0
  local claude_code_log
  claude_code_log="$(new_agent_log_file "claude-code")"
  # Session resume: if .claude-session-id exists from a previous run, continue that session.
  local claude_resume_args=()
  local claude_is_resuming=false
  if [ -f ".claude-session-id" ]; then
    local prev_session_id
    prev_session_id="$(cat .claude-session-id | tr -d '[:space:]')"
    if [ -n "${prev_session_id}" ]; then
      claude_resume_args=(--resume "${prev_session_id}")
      claude_is_resuming=true
      echo "♻️  Resuming Claude session: ${prev_session_id}"
    fi
  fi

  set +e
  if [ "${claude_is_resuming}" = "true" ]; then
    # On a genuine resume, don't paste the full prompt back into the message
    # body — a resumed model can pattern-match repeated text as "already
    # seen" and skim past it. Instead point it at the actual prompt file on
    # disk and require it to Read that file fresh. See ensure_prompt_file()
    # and resumed_session_reread_pointer_notice() in _common.sh.
    local claude_prompt_file claude_cleanup_prompt_file=false
    claude_prompt_file="$(ensure_prompt_file)"
    if [ ! -f "${PROMPT_ARG}" ]; then
      claude_cleanup_prompt_file=true
    fi
    local claude_prompt_stdin_file
    claude_prompt_stdin_file="$(mktemp)"
    resumed_session_reread_pointer_notice "${claude_prompt_file}" > "${claude_prompt_stdin_file}"
    echo "Running: claude --permission-mode bypassPermissions --output-format stream-json --verbose --model ${claude_code_model} --max-turns ${claude_code_max_turns} -p (resumed session: pointer to ${claude_prompt_file})"
    echo ""
    claude --permission-mode bypassPermissions \
      --output-format stream-json \
      --verbose \
      --model "${claude_code_model}" \
      --max-turns "${claude_code_max_turns}" \
      ${claude_resume_args[@]+"${claude_resume_args[@]}"} \
      ${PASS_ARGS[@]+"${PASS_ARGS[@]}"} \
      -p < "${claude_prompt_stdin_file}" \
      2>&1 | tee "${claude_code_log}"
    claude_code_exit_code=${PIPESTATUS[0]}
    rm -f "${claude_prompt_stdin_file}"
    if [ "${claude_cleanup_prompt_file}" = "true" ]; then
      rm -f "${claude_prompt_file}"
    fi
  elif [ -f "${PROMPT_ARG}" ]; then
    echo "Running: claude --permission-mode bypassPermissions --output-format stream-json --verbose --model ${claude_code_model} --max-turns ${claude_code_max_turns} -p (prompt: ${PROMPT_BYTES} bytes via stdin)"
    echo ""
    # Use stdin redirect to avoid "Argument list too long" for large prompts (E2BIG).
    claude --permission-mode bypassPermissions \
      --output-format stream-json \
      --verbose \
      --model "${claude_code_model}" \
      --max-turns "${claude_code_max_turns}" \
      ${claude_resume_args[@]+"${claude_resume_args[@]}"} \
      ${PASS_ARGS[@]+"${PASS_ARGS[@]}"} \
      -p < "${PROMPT_ARG}" \
      2>&1 | tee "${claude_code_log}"
    claude_code_exit_code=${PIPESTATUS[0]}
  else
    echo "Running: claude --permission-mode bypassPermissions --output-format stream-json --verbose --model ${claude_code_model} --max-turns ${claude_code_max_turns} -p (inline prompt: ${PROMPT_BYTES} bytes)"
    echo ""
    claude --permission-mode bypassPermissions \
      --output-format stream-json \
      --verbose \
      --model "${claude_code_model}" \
      --max-turns "${claude_code_max_turns}" \
      ${claude_resume_args[@]+"${claude_resume_args[@]}"} \
      ${PASS_ARGS[@]+"${PASS_ARGS[@]}"} \
      -p "${PROMPT}" \
      2>&1 | tee "${claude_code_log}"
    claude_code_exit_code=${PIPESTATUS[0]}
  fi
  set -e

  if [ "$claude_code_exit_code" -ne 0 ] && [ -f "${claude_code_log}" ] \
     && grep -qi "${CLAUDE_USAGE_LIMIT_MARKER}" "${claude_code_log}"; then
    CLAUDE_USAGE_LIMIT_HIT=true
    echo "⚠️  Detected Claude subscription usage-limit exhaustion in this account's output (matched \"${CLAUDE_USAGE_LIMIT_MARKER}\")."
  fi

  record_codegraph_usage "${claude_code_log}"

  # Claude Code's stream-json output carries aggregate usage in the final
  # result.modelUsage object. Normalize it to the same provider-neutral JSON
  # schema used by the Jira token-usage comment helper. Reporting is strictly
  # best-effort and must never replace the Claude process exit code.
  local provider_script_dir usage_name usage_file usage_exit_code manifest_exit_code
  provider_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  usage_name="${AI_AGENT_USAGE_NAME:-claude-code}"
  usage_file="outputs/${usage_name}_usage.json"
  rm -f "${usage_file}" 2>/dev/null || true
  usage_exit_code=0
  python3 "${provider_script_dir}/claude_usage.py" "${claude_code_log}" "${usage_file}" || usage_exit_code=$?
  if [ "${usage_exit_code}" -eq 0 ]; then
    manifest_exit_code=0
    record_usage_file "${usage_file}" || manifest_exit_code=$?
    if [ "${manifest_exit_code}" -ne 0 ]; then
      echo "⚠️  Claude token usage was extracted but could not be added to the manifest (exit ${manifest_exit_code}); continuing with agent exit ${claude_code_exit_code}."
    fi
  else
    echo "⚠️  Claude token usage could not be recorded (extractor exit ${usage_exit_code}); continuing with agent exit ${claude_code_exit_code}."
  fi

  # Save session ID for the next run to resume from.
  local saved_session_id
  saved_session_id="$(grep -o '"session_id":"[^"]*"' "${claude_code_log}" 2>/dev/null | head -1 | grep -o '"[^"]*"$' | tr -d '"')"
  if [ -n "${saved_session_id}" ]; then
    echo "${saved_session_id}" > .claude-session-id
    echo "💾 Claude session saved: ${saved_session_id}"
  fi

  echo "Full transcript saved to: ${claude_code_log}"

  echo ""
  echo "=== Agent completed with exit code: $claude_code_exit_code ==="
  return $claude_code_exit_code
}
