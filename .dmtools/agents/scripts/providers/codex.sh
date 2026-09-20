#!/bin/bash
# OpenAI Codex provider for run-agent.sh
# Uses the Codex CLI (`codex exec`), authenticated one of two ways.
#
# Auth (pick ONE; checked in this priority order):
#   1. CODEX_AUTH_JSON  - subscription auth (ChatGPT Plus/Pro). The raw content
#                         of ~/.codex/auth.json as produced by `codex login`.
#                         Written to $CODEX_HOME/auth.json before the run.
#                         NOTE: the refresh token inside is SINGLE-USE and is
#                         rotated by the CLI whenever the access token is
#                         refreshed, so CI must persist the rotated file back
#                         (see ai-teammate.yml's "Persist rotated Codex auth"
#                         step) or the next run's credentials are dead.
#   2. Existing $CODEX_HOME/auth.json - subscription auth restored by CI or a
#                         previous local `codex login`.
#   3. OPENAI_API_KEY   - API key billed through the OpenAI platform account.
#                         No rotation, safe under concurrency.
# Optional (either auth mode):
#   CODEX_MODEL         - Model slug (default: gpt-5.6-terra). Set this to
#                         override the repo's stable CI default.
#   CODEX_SANDBOX       - Sandbox mode (default: danger-full-access; the agent
#                         must be able to write the repo and outputs/)
#   CODEX_HOME          - Codex state dir (default: $HOME/.codex). Exported so
#                         the CLI and the CI persist step agree on one path —
#                         a mismatch here is the classic cause of a burned
#                         refresh token ("refresh_token already used").
#
# Note: OPENAI_API_KEY / CODEX_HOME are exported inside this function only
# (subprocess scope), matching how claude.sh scopes ANTHROPIC_*.

run_codex() {
  export CODEX_HOME="${CODEX_HOME:-${HOME}/.codex}"
  mkdir -p "${CODEX_HOME}"

  local codex_auth_mode=""
  if [ -n "${CODEX_AUTH_JSON:-}" ]; then
    codex_auth_mode="oauth-env"
  elif [ -s "${CODEX_HOME}/auth.json" ]; then
    codex_auth_mode="oauth-file"
  elif [ -n "${OPENAI_API_KEY:-}" ]; then
    codex_auth_mode="api-key"
  else
    echo "Error: Codex authentication is required (CODEX_AUTH_JSON, ${CODEX_HOME}/auth.json, or OPENAI_API_KEY)" >&2
    return 1
  fi

  local codex_model="${CODEX_MODEL:-gpt-5.6-terra}"
  local codex_model_args=()
  codex_model_args=(--model "${codex_model}")
  local codex_sandbox="${CODEX_SANDBOX:-danger-full-access}"

  # `run-agent.sh --continue <prompt>` is the provider-neutral feedback-loop
  # interface. Codex does not have a top-level `--continue` option: resuming is
  # expressed as the `codex exec resume <session-id>` subcommand, which this
  # provider already selects below when `.codex-session-id` and its rollout
  # file are available. Do not forward the generic flag to Codex itself; doing
  # so makes every quality-gate retry fail before the model starts.
  local codex_pass_args=()
  local pass_arg
  if [ "${#PASS_ARGS[@]}" -gt 0 ]; then
    for pass_arg in "${PASS_ARGS[@]}"; do
      case "${pass_arg}" in
        --continue) ;;
        *) codex_pass_args+=("${pass_arg}") ;;
      esac
    done
  fi

  if ! command -v codex >/dev/null 2>&1; then
    echo "Error: codex CLI not found. Install with: npm install -g @openai/codex" >&2
    return 1
  fi

  if [ "${codex_auth_mode}" = "oauth-env" ]; then
    # printf, not echo: auth.json is a single-line JSON blob and must land on
    # disk byte-identical to what `codex login` wrote — a trailing newline is
    # tolerated by the CLI but any shell mangling of the value is not.
    printf '%s' "${CODEX_AUTH_JSON}" > "${CODEX_HOME}/auth.json"
    chmod 600 "${CODEX_HOME}/auth.json"
    # An API key in the environment takes precedence inside the Codex CLI and
    # would silently bypass the subscription credentials we just restored.
    unset OPENAI_API_KEY
  elif [ "${codex_auth_mode}" = "oauth-file" ]; then
    # The workflow has already restored auth.json. Do not rewrite it from an
    # absent environment variable, and keep subscription auth ahead of an API
    # key that may happen to exist in the runner environment.
    chmod 600 "${CODEX_HOME}/auth.json"
    unset OPENAI_API_KEY
  else
    export OPENAI_API_KEY="${OPENAI_API_KEY}"
  fi

  echo "Codex Configuration:"
  echo "  Auth mode:   ${codex_auth_mode}"
  echo "  Model:       ${codex_model}"
  echo "  Sandbox:     ${codex_sandbox}"
  echo "  CODEX_HOME:  ${CODEX_HOME}"
  echo "Working directory: $(pwd)"
  echo ""

  local codex_exit_code=0
  local codex_log
  codex_log="$(new_agent_log_file "codex")"

  # Session resume: if .codex-session-id exists from a previous run in this
  # same workspace, continue that conversation. On an ephemeral CI runner the
  # rollout file under $CODEX_HOME/sessions is gone between jobs, so this only
  # ever fires for local/sequential runs — same practical scope as claude.sh's
  # .claude-session-id.
  local codex_resume_args=()
  local codex_is_resuming=false
  if [ -f ".codex-session-id" ]; then
    local prev_session_id
    prev_session_id="$(cat .codex-session-id | tr -d '[:space:]')"
    if [ -n "${prev_session_id}" ] && [ -n "$(find "${CODEX_HOME}/sessions" -name "*${prev_session_id}*" -print -quit 2>/dev/null)" ]; then
      codex_resume_args=(resume "${prev_session_id}")
      codex_is_resuming=true
      echo "♻️  Resuming Codex session: ${prev_session_id}"
    elif [ -n "${prev_session_id}" ]; then
      echo "ℹ️  Saved Codex session ${prev_session_id} has no rollout file under ${CODEX_HOME}/sessions (fresh runner) — starting a new session."
    fi
  fi

  # `codex exec -` reads the prompt from stdin, which avoids "Argument list too
  # long" (E2BIG) on the large DMTools prompts, exactly like claude.sh's
  # `-p < file`.
  set +e
  if [ "${codex_is_resuming}" = "true" ]; then
    # On a genuine resume, don't paste the full prompt back into the message
    # body — see the same reasoning in claude.sh / _common.sh.
    local codex_prompt_file codex_cleanup_prompt_file=false
    codex_prompt_file="$(ensure_prompt_file)"
    if [ ! -f "${PROMPT_ARG}" ]; then
      codex_cleanup_prompt_file=true
    fi
    local codex_prompt_stdin_file
    codex_prompt_stdin_file="$(mktemp)"
    resumed_session_reread_pointer_notice "${codex_prompt_file}" > "${codex_prompt_stdin_file}"
    echo "Running: codex exec resume --json${codex_model:+ --model ${codex_model}} --sandbox ${codex_sandbox} - (resumed session: pointer to ${codex_prompt_file})"
    echo ""
    codex exec \
      ${codex_resume_args[@]+"${codex_resume_args[@]}"} \
      --json \
      ${codex_model_args[@]+"${codex_model_args[@]}"} \
      --sandbox "${codex_sandbox}" \
      --skip-git-repo-check \
      ${codex_pass_args[@]+"${codex_pass_args[@]}"} \
      - < "${codex_prompt_stdin_file}" \
      2>&1 | tee "${codex_log}"
    codex_exit_code=${PIPESTATUS[0]}
    rm -f "${codex_prompt_stdin_file}"
    if [ "${codex_cleanup_prompt_file}" = "true" ]; then
      rm -f "${codex_prompt_file}"
    fi
  elif [ -f "${PROMPT_ARG}" ]; then
    echo "Running: codex exec --json${codex_model:+ --model ${codex_model}} --sandbox ${codex_sandbox} - (prompt: ${PROMPT_BYTES} bytes via stdin)"
    echo ""
    codex exec \
      --json \
      ${codex_model_args[@]+"${codex_model_args[@]}"} \
      --sandbox "${codex_sandbox}" \
      --skip-git-repo-check \
      ${codex_pass_args[@]+"${codex_pass_args[@]}"} \
      - < "${PROMPT_ARG}" \
      2>&1 | tee "${codex_log}"
    codex_exit_code=${PIPESTATUS[0]}
  else
    echo "Running: codex exec --json${codex_model:+ --model ${codex_model}} --sandbox ${codex_sandbox} - (inline prompt: ${PROMPT_BYTES} bytes via stdin)"
    echo ""
    # Materialize the prompt and redirect it in, rather than piping it: with a
    # `printf ... | codex ... | tee` pipeline, PIPESTATUS[0] is printf's exit
    # code, so the CLI's real exit status would be silently swallowed.
    local codex_inline_prompt_file
    codex_inline_prompt_file="$(mktemp)"
    printf '%s' "${PROMPT}" > "${codex_inline_prompt_file}"
    codex exec \
      --json \
      ${codex_model_args[@]+"${codex_model_args[@]}"} \
      --sandbox "${codex_sandbox}" \
      --skip-git-repo-check \
      ${codex_pass_args[@]+"${codex_pass_args[@]}"} \
      - < "${codex_inline_prompt_file}" \
      2>&1 | tee "${codex_log}"
    codex_exit_code=${PIPESTATUS[0]}
    rm -f "${codex_inline_prompt_file}"
  fi
  set -e

  record_codegraph_usage "${codex_log}"

  # Tell the postJSAction whether this was a real run. A Codex turn that dies
  # on a usage limit still exits through the same path as a successful one and
  # leaves an empty outputs/ behind, which a postJSAction would otherwise read
  # as "the agent had nothing to write" and act on — moving the ticket and
  # stamping labels for work that never happened. See record_agent_failure().
  clear_agent_failure
  local codex_failure_reason=""
  if [ "${codex_exit_code}" -ne 0 ]; then
    codex_failure_reason="Codex CLI exited ${codex_exit_code}"
  else
    # The CLI can report a failed turn while still exiting 0, so the
    # transcript's own terminal event is the authoritative signal.
    local codex_turn_error
    codex_turn_error="$(python3 - "${codex_log}" << 'PYEOF'
import json
import sys

terminal = None
try:
    with open(sys.argv[1], "r", encoding="utf-8") as transcript:
        for line in transcript:
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(event, dict):
                continue
            if event.get("type") in {"turn.completed", "turn.failed"}:
                terminal = event
            elif event.get("type") == "error" and terminal is None:
                terminal = event
except OSError:
    sys.exit(0)

if terminal is None:
    print("Codex produced no terminal turn event (the run did not finish)")
elif terminal.get("type") != "turn.completed":
    error = terminal.get("error")
    message = ""
    if isinstance(error, dict):
        message = str(error.get("message") or "")
    if not message:
        message = str(terminal.get("message") or "")
    print(message.strip() or "Codex turn did not complete")
PYEOF
)"
    if [ -n "${codex_turn_error}" ]; then
      codex_failure_reason="${codex_turn_error}"
    fi
  fi
  if [ -n "${codex_failure_reason}" ]; then
    record_agent_failure "codex" "${codex_exit_code}" "${codex_failure_reason}"
  fi

  # Codex's --json stream carries cumulative token counts on token_count
  # events. Normalize to the same provider-neutral schema the Jira token-usage
  # comment helper consumes. Best-effort: never replaces the CLI exit code.
  local provider_script_dir usage_name usage_file usage_exit_code manifest_exit_code
  provider_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  usage_name="${AI_AGENT_USAGE_NAME:-codex}"
  usage_file="outputs/${usage_name}_usage.json"
  rm -f "${usage_file}" 2>/dev/null || true
  usage_exit_code=0
  python3 "${provider_script_dir}/codex_usage.py" "${codex_log}" "${usage_file}" --sessions-dir "${CODEX_HOME}/sessions" || usage_exit_code=$?
  if [ "${usage_exit_code}" -eq 0 ]; then
    manifest_exit_code=0
    record_usage_file "${usage_file}" || manifest_exit_code=$?
    if [ "${manifest_exit_code}" -ne 0 ]; then
      echo "⚠️  Codex token usage was extracted but could not be added to the manifest (exit ${manifest_exit_code}); continuing with agent exit ${codex_exit_code}."
    fi
  else
    echo "⚠️  Codex token usage could not be recorded (extractor exit ${usage_exit_code}); continuing with agent exit ${codex_exit_code}."
  fi

  # Save session ID for the next run to resume from.
  local saved_session_id
  saved_session_id="$(grep -o '"session_id":"[^"]*"' "${codex_log}" 2>/dev/null | head -1 | grep -o '"[^"]*"$' | tr -d '"')"
  if [ -n "${saved_session_id}" ]; then
    echo "${saved_session_id}" > .codex-session-id
    echo "💾 Codex session saved: ${saved_session_id}"
  fi

  echo "Full transcript saved to: ${codex_log}"

  echo ""
  echo "=== Agent completed with exit code: $codex_exit_code ==="
  return $codex_exit_code
}
