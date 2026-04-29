"""Central chat-model factory.

All Claude calls in the agent go through `get_chat_model()`. Single seam
for model selection and temperature defaults.

`temperature=0` is the default — the within-phase ReAct loops drift far
less when the model is deterministic, which keeps demo runs reproducible
across the engineered alarm fixtures.
"""

from __future__ import annotations

from langchain_anthropic import ChatAnthropic

from noc_copilot.config import get_settings


def get_chat_model(
    *,
    temperature: float = 0.0,
    max_tokens: int = 4096,
    model: str | None = None,
) -> ChatAnthropic:
    """Build a ChatAnthropic configured for the agent."""
    settings = get_settings()
    return ChatAnthropic(
        model=model or settings.anthropic_model,
        temperature=temperature,
        max_tokens=max_tokens,
        api_key=settings.anthropic_api_key,
    )
