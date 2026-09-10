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
# Note: ANTHROPIC_*/CLAUDE_CODE_OAUTH_TOKEN vars are set locally inside this
# script only (required by the Claude Code CLI). They are never exported at
# the workflow level to avoid conflicts with DMTools ANTHROPIC_* vars.

run_claude_code() {
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
