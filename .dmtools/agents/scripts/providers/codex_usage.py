#!/usr/bin/env python3
"""Extract normalized token usage from a Codex CLI --json transcript.

Codex emits `token_count` events whose `info.total_token_usage` is cumulative
for the session, so the LAST such event carries the run total. Unlike Claude
Code, Codex reports no cost, so `cost_usd` is always 0 — subscription runs are
not metered per-token anyway.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


class UsageNotFoundError(ValueError):
    """Raised when a transcript has no Codex token-count event."""


def _number(value: Any) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    return value


def _walk(node: Any):
    """Yield every dict nested anywhere inside node.

    Codex has moved the token-count payload between top level, `msg`, and
    `info` across CLI versions, so match on shape rather than on one path.
    """
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value)


def _looks_like_usage(candidate: dict[str, Any]) -> bool:
    return "input_tokens" in candidate and "output_tokens" in candidate


def find_last_usage(lines: list[str]) -> tuple[dict[str, Any], str | None]:
    """Return the last cumulative usage payload and the model that produced it."""
    usage: dict[str, Any] | None = None
    model: str | None = None

    for line in lines:
        try:
            event = json.loads(line)
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(event, dict):
            continue

        for node in _walk(event):
            candidate = node.get("total_token_usage")
            if isinstance(candidate, dict) and _looks_like_usage(candidate):
                usage = candidate
            elif _looks_like_usage(node) and usage is None:
                # Fallback for transcripts that report a flat usage object
                # with no cumulative wrapper.
                usage = node
            if isinstance(node.get("model"), str):
                model = node["model"]

    if usage is None:
        raise UsageNotFoundError("no token_count event with token totals was found")
    return usage, model


def normalize_usage(usage: dict[str, Any], model: str | None) -> dict[str, Any]:
    """Normalize Codex's counters into the provider-neutral schema."""
    # Codex's `input_tokens` is the grand total of input, with the cached
    # portion broken out separately in `cached_input_tokens` — so the
    # uncached remainder is the difference, not the raw field.
    total_input = _number(usage.get("input_tokens"))
    input_cache_read = _number(usage.get("cached_input_tokens"))
    input_other = max(total_input - input_cache_read, 0)
    output = _number(usage.get("output_tokens"))

    return {
        "provider": "codex",
        "models": [model] if model else [],
        "input_other": input_other,
        "input_cache_read": input_cache_read,
        # Codex has no prompt-cache write counter; kept for schema parity.
        "input_cache_creation": 0,
        "output": output,
        "total_input": total_input,
        "total_tokens": total_input + output,
        # Subscription runs are not per-token billed and the CLI reports no
        # cost, so this stays 0 rather than being guessed from a price table.
        "cost_usd": 0,
    }


def extract_usage(transcript_path: Path) -> dict[str, Any]:
    with transcript_path.open("r", encoding="utf-8") as transcript:
        usage, model = find_last_usage(list(transcript))
    return normalize_usage(usage, model)


def write_usage(output_path: Path, usage: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as output:
        json.dump(usage, output, indent=2)
        output.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("transcript", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    try:
        usage = extract_usage(args.transcript)
    except (OSError, UsageNotFoundError) as error:
        print(f"Codex token usage unavailable: {error}", file=sys.stderr)
        return 2

    write_usage(args.output, usage)
    print("=== Codex Token Usage Summary ===")
    print(f"  Model(s): {', '.join(usage['models']) or '(not reported)'}")
    print(f"  Input (other):          {usage['input_other']:,}")
    print(f"  Input (cache read):     {usage['input_cache_read']:,}")
    print(f"  Output:                 {usage['output']:,}")
    print(f"  Total input:            {usage['total_input']:,}")
    print(f"  Total tokens:           {usage['total_tokens']:,}")
    print("=================================")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
