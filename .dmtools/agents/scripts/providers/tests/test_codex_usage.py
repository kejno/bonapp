#!/usr/bin/env python3
"""Unit tests for codex_usage.py."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import codex_usage  # noqa: E402


def _transcript(*events: dict) -> Path:
    handle = tempfile.NamedTemporaryFile(
        "w", suffix=".log", delete=False, encoding="utf-8"
    )
    with handle:
        for event in events:
            handle.write(json.dumps(event) + "\n")
    return Path(handle.name)


class ExtractUsageTest(unittest.TestCase):
    def test_uses_last_cumulative_total(self) -> None:
        transcript = _transcript(
            {
                "type": "token_count",
                "info": {
                    "model": "gpt-5-codex",
                    "total_token_usage": {
                        "input_tokens": 100,
                        "cached_input_tokens": 40,
                        "output_tokens": 10,
                    },
                },
            },
            {
                "type": "token_count",
                "info": {
                    "model": "gpt-5-codex",
                    "total_token_usage": {
                        "input_tokens": 300,
                        "cached_input_tokens": 200,
                        "output_tokens": 50,
                    },
                },
            },
        )
        usage = codex_usage.extract_usage(transcript)

        self.assertEqual(usage["provider"], "codex")
        self.assertEqual(usage["models"], ["gpt-5-codex"])
        # input_tokens is the grand total; the uncached part is the remainder.
        self.assertEqual(usage["input_other"], 100)
        self.assertEqual(usage["input_cache_read"], 200)
        self.assertEqual(usage["total_input"], 300)
        self.assertEqual(usage["output"], 50)
        self.assertEqual(usage["total_tokens"], 350)
        self.assertEqual(usage["cost_usd"], 0)

    def test_reads_usage_nested_under_msg(self) -> None:
        transcript = _transcript(
            {
                "msg": {
                    "type": "token_count",
                    "total_token_usage": {
                        "input_tokens": 7,
                        "cached_input_tokens": 0,
                        "output_tokens": 3,
                    },
                }
            }
        )
        usage = codex_usage.extract_usage(transcript)
        self.assertEqual(usage["total_tokens"], 10)
        self.assertEqual(usage["models"], [])

    def test_reads_model_from_matching_rollout_when_transcript_omits_it(self) -> None:
        codex_thread_id = "thread-123"
        transcript = _transcript(
            {"type": "thread.started", "thread_id": codex_thread_id},
            {
                "type": "token_count",
                "info": {
                    "total_token_usage": {
                        "input_tokens": 7,
                        "cached_input_tokens": 0,
                        "output_tokens": 3,
                    },
                },
            },
        )
        sessions_dir = transcript.parent / "sessions" / "2026" / "09" / "16"
        sessions_dir.mkdir(parents=True)
        rollout = sessions_dir / f"rollout-{codex_thread_id}.jsonl"
        rollout.write_text(
            json.dumps(
                {
                    "type": "turn_context",
                    "payload": {"model": "gpt-5.3-codex"},
                }
            )
            + "\n",
            encoding="utf-8",
        )

        usage = codex_usage.extract_usage(transcript, transcript.parent / "sessions")
        self.assertEqual(usage["models"], ["gpt-5.3-codex"])

    def test_ignores_non_json_and_unrelated_lines(self) -> None:
        path = _transcript(
            {"type": "item.completed", "item": {"text": "hello"}},
            {
                "type": "token_count",
                "info": {"total_token_usage": {"input_tokens": 5, "output_tokens": 1}},
            },
        )
        with path.open("a", encoding="utf-8") as handle:
            handle.write("Running: codex exec --json ...\n")
        usage = codex_usage.extract_usage(path)
        self.assertEqual(usage["total_tokens"], 6)
        self.assertEqual(usage["input_cache_read"], 0)

    def test_raises_when_no_usage_event(self) -> None:
        transcript = _transcript({"type": "item.completed", "item": {"text": "hi"}})
        with self.assertRaises(codex_usage.UsageNotFoundError):
            codex_usage.extract_usage(transcript)

    def test_cached_greater_than_total_clamps_to_zero(self) -> None:
        transcript = _transcript(
            {
                "type": "token_count",
                "info": {
                    "total_token_usage": {
                        "input_tokens": 10,
                        "cached_input_tokens": 25,
                        "output_tokens": 2,
                    }
                },
            }
        )
        usage = codex_usage.extract_usage(transcript)
        self.assertEqual(usage["input_other"], 0)


if __name__ == "__main__":
    unittest.main()
