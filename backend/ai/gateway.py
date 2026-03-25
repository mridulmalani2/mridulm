"""AI Gateway — proxies to Anthropic Claude API with tool use. Section 4."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import httpx

from backend.ai.intent import Intent, classify_intent
from backend.ai.system_prompt import SYSTEM_PROMPT
from backend.ai.tool_definitions import DEAL_ENGINE_TOOL
from backend.models.state import ModelState

logger = logging.getLogger(__name__)

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-opus-4-5-20250514"


def apply_update(state_dict: dict, path: str, value: Any) -> dict:
    """Apply a dot-notation update to a nested dict.

    e.g. "revenue.growth_rates" -> state_dict["revenue"]["growth_rates"] = value
    e.g. "debt_tranches.0.interest_rate" -> state_dict["debt_tranches"][0]["interest_rate"] = value
    """
    keys = path.split(".")
    current = state_dict
    for key in keys[:-1]:
        if key.isdigit():
            current = current[int(key)]
        else:
            if key not in current:
                current[key] = {}
            current = current[key]
    final_key = keys[-1]
    if final_key.isdigit():
        current[int(final_key)] = value
    else:
        current[final_key] = value
    return state_dict


async def call_ai(
    message: str,
    model_state: ModelState,
    chat_history: list[dict],
    api_key: str,
) -> dict:
    """Call Anthropic Claude API with tool use enforced.

    Returns dict with: updated_state_dict, analysis, assumption_updates, intent
    """
    intent = classify_intent(message)

    # Build messages
    state_json = model_state.model_dump_json(exclude={"chat_history"})
    messages = []
    for msg in chat_history[-10:]:  # last 10 messages for context
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({
        "role": "user",
        "content": f"[Intent: {intent.value}]\n\n[Current Model State]\n{state_json}\n\n[User Message]\n{message}",
    })

    request_body = {
        "model": MODEL,
        "max_tokens": 4096,
        "system": SYSTEM_PROMPT,
        "tools": [DEAL_ENGINE_TOOL],
        "tool_choice": {"type": "tool", "name": "update_deal_model"},
        "messages": messages,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=request_body,
        )

    if response.status_code != 200:
        error_text = response.text
        logger.error("Anthropic API error %d: %s", response.status_code, error_text)
        return {
            "error": f"API error {response.status_code}: {error_text}",
            "intent": intent.value,
        }

    result = response.json()

    # Extract tool_use block
    tool_input = None
    for block in result.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "update_deal_model":
            tool_input = block.get("input", {})
            break

    if tool_input is None:
        return {
            "error": "AI did not return a tool_use block",
            "intent": intent.value,
        }

    # Parse
    assumption_updates = tool_input.get("assumption_updates", {})
    trigger_recalc = tool_input.get("trigger_recalculation", False)
    analysis = tool_input.get("analysis", {})
    scenario_request = tool_input.get("scenario_request")

    # Apply updates to state dict
    state_dict = model_state.model_dump()
    applied_diffs: list[dict] = []
    for path, value in assumption_updates.items():
        try:
            # Record old value
            keys = path.split(".")
            old_val = state_dict
            for k in keys:
                if k.isdigit():
                    old_val = old_val[int(k)]
                else:
                    old_val = old_val.get(k)
            applied_diffs.append({"field": path, "old": old_val, "new": value})
            apply_update(state_dict, path, value)
        except (KeyError, IndexError, TypeError) as e:
            logger.warning("Failed to apply update %s=%s: %s", path, value, e)

    return {
        "updated_state_dict": state_dict,
        "analysis": analysis,
        "assumption_updates": assumption_updates,
        "applied_diffs": applied_diffs,
        "trigger_recalculation": trigger_recalc,
        "scenario_request": scenario_request,
        "intent": intent.value,
    }
