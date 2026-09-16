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


def thread_id(transcript: Path) -> str | None:
    """Return the Codex thread id announced by the CLI transcript."""
    with transcript.open("r", encoding="utf-8") as source:
        for line in source:
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if (
                isinstance(event, dict)
                and event.get("type") == "thread.started"
                and isinstance(event.get("thread_id"), str)
            ):
                return event["thread_id"]
    return None


def session_model(sessions_dir: Path, codex_thread_id: str) -> str | None:
    """Read the effective model from the matching private rollout file."""
    model: str | None = None
    for rollout in sessions_dir.rglob(f"*{codex_thread_id}*.jsonl"):
        with rollout.open("r", encoding="utf-8") as source:
            for line in source:
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(event, dict) or event.get("type") != "turn_context":
                    continue
                payload = event.get("payload")
                if isinstance(payload, dict) and isinstance(payload.get("model"), str):
                    model = payload["model"]
    return model


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
    parser.add_argument("--sessions-dir", type=Path)
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

    effective_model: str | None = None
    if args.sessions_dir is not None:
        try:
            codex_thread_id = thread_id(args.transcript)
            if codex_thread_id is not None:
                effective_model = session_model(args.sessions_dir, codex_thread_id)
        except OSError as exc:
            print(f"Codex model lookup failed: {exc}", file=sys.stderr)

    print(f"Codex effective model: {effective_model or 'unavailable'}")
    print("Codex transcript ends with turn.completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
