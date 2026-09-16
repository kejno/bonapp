#!/usr/bin/env python3
"""Validate a Codex CLI JSONL transcript using terminal protocol events."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def terminal_event(transcript: Path) -> dict[str, Any] | None:
    """Return the last top-level turn.completed/turn.failed event."""
    terminal: dict[str, Any] | None = None
    with transcript.open("r", encoding="utf-8") as source:
        for line in source:
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict) and event.get("type") in {
                "turn.completed",
                "turn.failed",
            }:
                terminal = event
    return terminal


def error_message(event: dict[str, Any]) -> str:
    error = event.get("error")
    if isinstance(error, dict) and isinstance(error.get("message"), str):
        return error["message"]
    if isinstance(error, str):
        return error
    return "Codex reported turn.failed"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("transcript", type=Path)
    args = parser.parse_args()

    try:
        event = terminal_event(args.transcript)
    except OSError as exc:
        print(f"Codex transcript could not be read: {exc}", file=sys.stderr)
        return 2

    if event is None:
        print(
            "Codex transcript has no terminal turn.completed/turn.failed event",
            file=sys.stderr,
        )
        return 2
    if event["type"] == "turn.failed":
        print(error_message(event), file=sys.stderr)
        return 1

    print("Codex transcript ends with turn.completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
