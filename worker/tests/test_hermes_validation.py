from unittest.mock import MagicMock

from auditlayer_worker.hermes import ChatResult, Usage, validate_hermes


def test_validate_hermes_uses_bounded_nontruncating_budget() -> None:
    client = MagicMock()
    client.api_base = "http://127.0.0.1:8642/v1"
    client.chat.return_value = ChatResult(
        content="OK",
        usage=Usage(tokens_in=1, tokens_out=1),
        model="deepseek-v4-flash",
    )

    result = validate_hermes(client, "deepseek-v4-flash")

    assert result.ok is True
    assert client.chat.call_args.kwargs["max_tokens"] == 256
    assert client.chat.call_args.kwargs["stream"] is False
