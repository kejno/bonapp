import json
import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from validate_codex_execution import (
    error_message,
    session_model,
    terminal_event,
    thread_id,
)


class ValidateCodexExecutionTests(unittest.TestCase):
    def write_transcript(self, events: list[object]) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "codex.log"
        with path.open("w", encoding="utf-8") as output:
            for event in events:
                if isinstance(event, str):
                    output.write(event + "\n")
                else:
                    output.write(json.dumps(event) + "\n")
        return path

    def test_completed_ignores_error_words_in_command_output(self):
        transcript = self.write_transcript(
            [
                {
                    "type": "item.completed",
                    "item": {
                        "aggregated_output": (
                            "pattern='rate limit|refresh_token|invalid_grant'"
                        )
                    },
                },
                {"type": "turn.completed", "usage": {"input_tokens": 1}},
            ]
        )
        self.assertEqual(terminal_event(transcript)["type"], "turn.completed")

    def test_failed_returns_error_message(self):
        transcript = self.write_transcript(
            [
                {"type": "turn.started"},
                {
                    "type": "turn.failed",
                    "error": {"message": "model is unavailable"},
                },
            ]
        )
        event = terminal_event(transcript)
        self.assertEqual(event["type"], "turn.failed")
        self.assertEqual(error_message(event), "model is unavailable")

    def test_missing_terminal_event(self):
        transcript = self.write_transcript(
            ["not json", {"type": "turn.started"}, {"type": "item.completed"}]
        )
        self.assertIsNone(terminal_event(transcript))

    def test_last_terminal_event_wins(self):
        transcript = self.write_transcript(
            [{"type": "turn.failed"}, {"type": "turn.completed"}]
        )
        self.assertEqual(terminal_event(transcript)["type"], "turn.completed")

    def test_reads_effective_model_from_matching_rollout(self):
        codex_thread_id = "thread-123"
        transcript = self.write_transcript(
            [
                {"type": "thread.started", "thread_id": codex_thread_id},
                {"type": "turn.completed"},
            ]
        )
        sessions_dir = transcript.parent / "sessions" / "2026" / "09" / "16"
        sessions_dir.mkdir(parents=True)
        rollout = sessions_dir / f"rollout-{codex_thread_id}.jsonl"
        rollout.write_text(
            json.dumps(
                {
                    "type": "turn_context",
                    "payload": {"model": "gpt-test-codex"},
                }
            )
            + "\n",
            encoding="utf-8",
        )

        self.assertEqual(thread_id(transcript), codex_thread_id)
        self.assertEqual(
            session_model(transcript.parent / "sessions", codex_thread_id),
            "gpt-test-codex",
        )

    def test_model_is_unknown_without_matching_rollout(self):
        transcript = self.write_transcript(
            [{"type": "thread.started", "thread_id": "missing-thread"}]
        )
        sessions_dir = transcript.parent / "sessions"
        sessions_dir.mkdir()
        self.assertIsNone(session_model(sessions_dir, thread_id(transcript)))


if __name__ == "__main__":
    unittest.main()
