#!/bin/bash
set -euo pipefail

PROVIDERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

source "${PROVIDERS_DIR}/_common.sh"
source "${PROVIDERS_DIR}/codex.sh"

run_provider_case() {
  local case_name="$1"
  local fake_exit_code="$2"
  local fake_output="$3"
  local expected_artifacts="$4"
  local case_dir="${TEST_ROOT}/${case_name}"
  local fake_bin="${case_dir}/bin"
  mkdir -p "${fake_bin}" "${case_dir}/outputs"

  printf '#!/bin/bash\nprintf "%%s\\n" "$FAKE_CODEX_OUTPUT"\nexit "$FAKE_CODEX_EXIT_CODE"\n' > "${fake_bin}/codex"
  chmod +x "${fake_bin}/codex"

  (
    cd "${case_dir}"
    export PATH="${fake_bin}:${PATH}"
    export FAKE_CODEX_OUTPUT="${fake_output}"
    export FAKE_CODEX_EXIT_CODE="${fake_exit_code}"
    export OPENAI_API_KEY="test-key"
    export CODEX_HOME="${case_dir}/.codex"
    export AI_AGENT_USAGE_NAME="story_development"
    export DMTOOLS_CLI_LOG_DIR="${case_dir}/logs"
    PROMPT_ARG="test prompt"
    PROMPT="test prompt"
    PROMPT_BYTES=11
    PASS_ARGS=()

    if [ "${expected_artifacts}" = "usage-only" ]; then
      record_usage_file() { return 23; }
    fi

    actual_exit_code=0
    run_codex >/dev/null 2>&1 || actual_exit_code=$?

    if [ "${actual_exit_code}" -ne "${fake_exit_code}" ]; then
      echo "Expected provider exit ${fake_exit_code}, got ${actual_exit_code}" >&2
      exit 1
    fi

    if [ "${expected_artifacts}" = "usage-and-manifest" ]; then
      test -f outputs/story_development_usage.json
      test -f outputs/token_usage_files.json
      grep -q 'outputs/story_development_usage.json' outputs/token_usage_files.json
    elif [ "${expected_artifacts}" = "usage-only" ]; then
      test -f outputs/story_development_usage.json
      test ! -e outputs/token_usage_files.json
    else
      test ! -e outputs/story_development_usage.json
      test ! -e outputs/token_usage_files.json
    fi
  )
}

VALID_RESULT='{"type":"token_count","info":{"model":"gpt-5-codex","total_token_usage":{"input_tokens":12,"cached_input_tokens":5,"output_tokens":3}}}'
run_provider_case "usage-on-failure" 7 "${VALID_RESULT}" usage-and-manifest
run_provider_case "manifest-failure" 11 "${VALID_RESULT}" usage-only
run_provider_case "missing-usage" 9 '{"type":"item.completed","item":{"text":"done"}}' none

# Either CODEX_AUTH_JSON or OPENAI_API_KEY must be present; with neither, the
# provider must refuse before invoking the CLI at all.
run_missing_auth_case() {
  local case_dir="${TEST_ROOT}/missing-auth"
  local fake_bin="${case_dir}/bin"
  mkdir -p "${fake_bin}" "${case_dir}/outputs"
  printf '#!/bin/bash\ntouch "%s/cli-was-called"\nexit 0\n' "${case_dir}" > "${fake_bin}/codex"
  chmod +x "${fake_bin}/codex"

  (
    cd "${case_dir}"
    export PATH="${fake_bin}:${PATH}"
    export CODEX_HOME="${case_dir}/.codex"
    export DMTOOLS_CLI_LOG_DIR="${case_dir}/logs"
    unset CODEX_AUTH_JSON OPENAI_API_KEY
    PROMPT_ARG="test prompt"
    PROMPT="test prompt"
    PROMPT_BYTES=11
    PASS_ARGS=()

    exit_code=0
    run_codex >/dev/null 2>&1 || exit_code=$?
    if [ "${exit_code}" -eq 0 ]; then
      echo "[missing-auth] expected non-zero exit with no credentials" >&2
      exit 1
    fi
    if [ -e "cli-was-called" ]; then
      echo "[missing-auth] codex CLI must not be invoked without credentials" >&2
      exit 1
    fi
  )
}
run_missing_auth_case

# A pre-restored auth.json must be sufficient by itself. This is how the
# workflow invokes the provider: it restores the secret to CODEX_HOME once,
# then deliberately does not pass CODEX_AUTH_JSON to avoid overwriting a token
# rotated by the CLI.
run_existing_auth_file_case() {
  local case_dir="${TEST_ROOT}/existing-auth-file"
  local fake_bin="${case_dir}/bin"
  mkdir -p "${fake_bin}" "${case_dir}/outputs" "${case_dir}/.codex"
  cat > "${fake_bin}/codex" << 'BINEOF'
#!/bin/bash
printf '%s' "${OPENAI_API_KEY-<unset>}" > "${CODEX_HOME}/observed-api-key"
printf '%s\n' "$@" > "${CODEX_HOME}/observed-args"
echo '{"type":"token_count","info":{"model":"gpt-5-codex","total_token_usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1}}}'
exit 0
BINEOF
  chmod +x "${fake_bin}/codex"
  printf '%s' '{"tokens":{"refresh_token":"rt-existing"}}' > "${case_dir}/.codex/auth.json"

  (
    cd "${case_dir}"
    export PATH="${fake_bin}:${PATH}"
    export CODEX_HOME="${case_dir}/.codex"
    export DMTOOLS_CLI_LOG_DIR="${case_dir}/logs"
    export AI_AGENT_USAGE_NAME="existing_auth_file"
    unset CODEX_AUTH_JSON OPENAI_API_KEY CODEX_MODEL
    PROMPT_ARG="test prompt"
    PROMPT="test prompt"
    PROMPT_BYTES=11
    PASS_ARGS=()

    if ! run_codex > provider-output.log 2>&1; then
      cat provider-output.log >&2
      echo "[existing-auth-file] provider rejected a valid pre-restored auth.json" >&2
      exit 1
    fi
    test "$(cat "${CODEX_HOME}/observed-api-key")" = "<unset>" \
      || { echo "[existing-auth-file] API key should remain unset" >&2; exit 1; }
    grep -qx -- '--model' "${CODEX_HOME}/observed-args" \
      || { echo "[existing-auth-file] expected default --model argument" >&2; exit 1; }
    grep -qx -- 'gpt-5.6-terra' "${CODEX_HOME}/observed-args" \
      || { echo "[existing-auth-file] default model was not passed to Codex CLI" >&2; exit 1; }
  )
}
run_existing_auth_file_case

# OAuth mode must materialize auth.json inside CODEX_HOME (the path the CI
# persist step reads back) with owner-only permissions, and must clear any
# OPENAI_API_KEY so the CLI cannot silently prefer API billing over the
# restored subscription credentials.
run_oauth_restore_case() {
  local case_dir="${TEST_ROOT}/oauth-restore"
  local fake_bin="${case_dir}/bin"
  mkdir -p "${fake_bin}" "${case_dir}/outputs"
  cat > "${fake_bin}/codex" << 'BINEOF'
#!/bin/bash
printf '%s' "${OPENAI_API_KEY-<unset>}" > "${CODEX_HOME}/observed-api-key"
printf '%s\n' "$@" > "${CODEX_HOME}/observed-args"
echo '{"type":"token_count","info":{"total_token_usage":{"input_tokens":1,"output_tokens":1}}}'
exit 0
BINEOF
  chmod +x "${fake_bin}/codex"

  (
    cd "${case_dir}"
    export PATH="${fake_bin}:${PATH}"
    export CODEX_HOME="${case_dir}/.codex"
    export DMTOOLS_CLI_LOG_DIR="${case_dir}/logs"
    export CODEX_AUTH_JSON='{"tokens":{"refresh_token":"rt-1"}}'
    export OPENAI_API_KEY="should-be-ignored"
    export CODEX_MODEL="test-codex-model"
    PROMPT_ARG="test prompt"
    PROMPT="test prompt"
    PROMPT_BYTES=11
    PASS_ARGS=()

    run_codex >/dev/null 2>&1 || true

    test -f "${CODEX_HOME}/auth.json" \
      || { echo "[oauth-restore] auth.json was not written to CODEX_HOME" >&2; exit 1; }
    grep -q 'rt-1' "${CODEX_HOME}/auth.json" \
      || { echo "[oauth-restore] auth.json content was mangled" >&2; exit 1; }

    perms="$(ls -l "${CODEX_HOME}/auth.json" | cut -c1-10)"
    if [ "${perms}" != "-rw-------" ]; then
      echo "[oauth-restore] expected 0600 on auth.json, got ${perms}" >&2
      exit 1
    fi

    observed="$(cat "${CODEX_HOME}/observed-api-key")"
    if [ "${observed}" != "<unset>" ]; then
      echo "[oauth-restore] OPENAI_API_KEY must be unset in OAuth mode, saw '${observed}'" >&2
      exit 1
    fi
    grep -qx -- '--model' "${CODEX_HOME}/observed-args" \
      || { echo "[oauth-restore] expected explicit --model argument" >&2; exit 1; }
    grep -qx -- 'test-codex-model' "${CODEX_HOME}/observed-args" \
      || { echo "[oauth-restore] configured model was not passed to Codex CLI" >&2; exit 1; }
  )
}
run_oauth_restore_case

# A saved session id whose rollout file is gone (fresh CI runner) must start a
# NEW session rather than passing `resume <id>` to a CLI that cannot find it.
run_stale_session_case() {
  local case_dir="${TEST_ROOT}/stale-session"
  local fake_bin="${case_dir}/bin"
  mkdir -p "${fake_bin}" "${case_dir}/outputs"
  cat > "${fake_bin}/codex" << 'BINEOF'
#!/bin/bash
printf '%s\n' "$*" > "${CAPTURED_ARGS_FILE}"
echo '{"type":"token_count","info":{"total_token_usage":{"input_tokens":1,"output_tokens":1}}}'
exit 0
BINEOF
  chmod +x "${fake_bin}/codex"

  (
    cd "${case_dir}"
    export PATH="${fake_bin}:${PATH}"
    export OPENAI_API_KEY="test-key"
    export CODEX_HOME="${case_dir}/.codex"
    export CAPTURED_ARGS_FILE="${case_dir}/args.txt"
    export DMTOOLS_CLI_LOG_DIR="${case_dir}/logs"
    echo "gone-session-id" > .codex-session-id
    PROMPT_ARG="nonexistent-file"
    PROMPT="test prompt"
    PROMPT_BYTES=11
    PASS_ARGS=()

    run_codex >/dev/null 2>&1 || true

    if grep -q 'resume' "${CAPTURED_ARGS_FILE}"; then
      echo "[stale-session] must not resume a session with no rollout file" >&2
      exit 1
    fi
  )
}
run_stale_session_case

# The feedback loop calls the provider-neutral wrapper with `--continue`.
# Codex must translate that into its `exec resume <session-id>` form instead
# of forwarding an unsupported top-level option to the CLI.
run_continue_translation_case() {
  local case_dir="${TEST_ROOT}/continue-translation"
  local fake_bin="${case_dir}/bin"
  local session_id="feedback-session-id"
  mkdir -p "${fake_bin}" "${case_dir}/outputs" "${case_dir}/.codex/sessions/2026/09/21"
  cat > "${fake_bin}/codex" << 'BINEOF'
#!/bin/bash
printf '%s\n' "$@" > "${CAPTURED_ARGS_FILE}"
echo '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
exit 0
BINEOF
  chmod +x "${fake_bin}/codex"
  touch "${case_dir}/.codex/sessions/2026/09/21/rollout-${session_id}.jsonl"

  (
    cd "${case_dir}"
    export PATH="${fake_bin}:${PATH}"
    export OPENAI_API_KEY="test-key"
    export CODEX_HOME="${case_dir}/.codex"
    export CAPTURED_ARGS_FILE="${case_dir}/args.txt"
    export DMTOOLS_CLI_LOG_DIR="${case_dir}/logs"
    echo "${session_id}" > .codex-session-id
    PROMPT_ARG="test prompt"
    PROMPT="test prompt"
    PROMPT_BYTES=11
    PASS_ARGS=(--continue)

    run_codex >/dev/null 2>&1 || true

    grep -qx -- 'resume' "${CAPTURED_ARGS_FILE}" \
      || { echo "[continue-translation] expected Codex resume subcommand" >&2; exit 1; }
    grep -qx -- "${session_id}" "${CAPTURED_ARGS_FILE}" \
      || { echo "[continue-translation] expected saved session id" >&2; exit 1; }
    if grep -qx -- '--continue' "${CAPTURED_ARGS_FILE}"; then
      echo "[continue-translation] unsupported --continue was forwarded to Codex" >&2
      exit 1
    fi
  )
}
run_continue_translation_case

# A run that never really happened must leave outputs/agent_failure.json
# behind, so the postJSAction can refuse to advance the ticket — an empty
# outputs/ folder alone is indistinguishable from "the agent had nothing to
# write". A genuine run must leave no marker.
run_failure_marker_case() {
  local case_name="$1"
  local fake_exit_code="$2"
  local fake_output="$3"
  local expect_marker="$4"
  local expect_reason="$5"
  local case_dir="${TEST_ROOT}/${case_name}"
  local fake_bin="${case_dir}/bin"
  mkdir -p "${fake_bin}" "${case_dir}/outputs"

  printf '#!/bin/bash\nprintf "%%s\\n" "$FAKE_CODEX_OUTPUT"\nexit "$FAKE_CODEX_EXIT_CODE"\n' > "${fake_bin}/codex"
  chmod +x "${fake_bin}/codex"

  (
    cd "${case_dir}"
    export PATH="${fake_bin}:${PATH}"
    export FAKE_CODEX_OUTPUT="${fake_output}"
    export FAKE_CODEX_EXIT_CODE="${fake_exit_code}"
    export OPENAI_API_KEY="test-key"
    export CODEX_HOME="${case_dir}/.codex"
    export DMTOOLS_CLI_LOG_DIR="${case_dir}/logs"
    PROMPT_ARG="test prompt"
    PROMPT="test prompt"
    PROMPT_BYTES=11
    PASS_ARGS=()

    # A marker left by an earlier run must never be mistaken for this run's.
    echo '{"provider":"stale"}' > outputs/agent_failure.json

    run_codex >/dev/null 2>&1 || true

    if [ "${expect_marker}" = "yes" ]; then
      test -f outputs/agent_failure.json \
        || { echo "[${case_name}] expected outputs/agent_failure.json" >&2; exit 1; }
      grep -q "${expect_reason}" outputs/agent_failure.json \
        || { echo "[${case_name}] marker reason did not match '${expect_reason}': $(cat outputs/agent_failure.json)" >&2; exit 1; }
      grep -q '"provider": "codex"' outputs/agent_failure.json \
        || { echo "[${case_name}] marker did not record the provider" >&2; exit 1; }
    else
      test ! -e outputs/agent_failure.json \
        || { echo "[${case_name}] a successful run must leave no failure marker, found: $(cat outputs/agent_failure.json)" >&2; exit 1; }
    fi
  )
}

COMPLETED_TURN='{"type":"thread.started","thread_id":"t-1"}
{"type":"turn.completed","usage":{"input_tokens":5,"output_tokens":1}}'

# The exact shape Codex emitted on BNP-158: exit 0, but the turn failed on a
# subscription usage limit.
USAGE_LIMIT_TURN='{"type":"thread.started","thread_id":"t-1"}
{"type":"error","message":"You'"'"'ve hit your usage limit. Upgrade to Pro"}
{"type":"turn.failed","error":{"message":"You'"'"'ve hit your usage limit. Upgrade to Pro"}}'

run_failure_marker_case "marker-on-usage-limit" 0 "${USAGE_LIMIT_TURN}" yes "usage limit"
run_failure_marker_case "marker-on-nonzero-exit" 3 "${COMPLETED_TURN}" yes "exited 3"
run_failure_marker_case "marker-on-no-terminal-event" 0 '{"type":"thread.started","thread_id":"t-1"}' yes "did not finish"
run_failure_marker_case "no-marker-on-success" 0 "${COMPLETED_TURN}" no ""

echo "Codex provider integration tests passed"
