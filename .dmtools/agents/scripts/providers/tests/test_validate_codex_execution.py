import json
import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from validate_codex_execution import error_message, terminal_event


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


if __name__ == "__main__":
    unittest.main()
