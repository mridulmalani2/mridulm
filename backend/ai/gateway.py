"""AI Gateway — multi-provider support for Anthropic, OpenAI, Google, Mistral, Groq."""

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

# ── Provider configuration ────────────────────────────────────────────────

PROVIDER_CONFIGS = {
    "anthropic": {
        "api_url": "https://api.anthropic.com/v1/messages",
        "model": "claude-sonnet-4-20250514",
    },
    "openai": {
        "api_url": "https://api.openai.com/v1/chat/completions",
        "model": "gpt-4o",
    },
    "google": {
        "api_url": "https://generativelanguage.googleapis.com/v1beta/models",
        "model": "gemini-2.0-flash",
    },
    "mistral": {
        "api_url": "https://api.mistral.ai/v1/chat/completions",
        "model": "mistral-large-latest",
    },
    "groq": {
        "api_url": "https://api.groq.com/openai/v1/chat/completions",
        "model": "llama-3.3-70b-versatile",
    },
}


def detect_provider(api_key: str) -> str:
    """Auto-detect provider from API key prefix."""
    if api_key.startswith("sk-ant-"):
        return "anthropic"
    if api_key.startswith("gsk_"):
        return "groq"
    if api_key.startswith("AIza"):
        return "google"
    if api_key.startswith("sk-"):
        return "openai"
    return "openai"


def apply_update(state_dict: dict, path: str, value: Any) -> dict:
    """Apply a dot-notation update to a nested dict."""
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


# ── Provider-specific request builders ────────────────────────────────────

def _build_anthropic_request(messages: list[dict], api_key: str, config: dict) -> dict:
    """Build Anthropic Claude API request."""
    return {
        "url": config["api_url"],
        "headers": {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        "body": {
            "model": config["model"],
            "max_tokens": 4096,
            "system": SYSTEM_PROMPT,
            "tools": [DEAL_ENGINE_TOOL],
            "tool_choice": {"type": "tool", "name": "update_deal_model"},
            "messages": messages,
        },
    }


def _build_openai_request(messages: list[dict], api_key: str, config: dict) -> dict:
    """Build OpenAI-compatible request (OpenAI, Mistral, Groq)."""
    openai_tool = {
        "type": "function",
        "function": {
            "name": DEAL_ENGINE_TOOL["name"],
            "description": DEAL_ENGINE_TOOL["description"],
            "parameters": DEAL_ENGINE_TOOL["input_schema"],
        },
    }
    openai_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
    return {
        "url": config["api_url"],
        "headers": {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        "body": {
            "model": config["model"],
            "max_tokens": 4096,
            "messages": openai_messages,
            "tools": [openai_tool],
            "tool_choice": {"type": "function", "function": {"name": "update_deal_model"}},
        },
    }


def _build_google_request(messages: list[dict], api_key: str, config: dict) -> dict:
    """Build Google Gemini request."""
    contents = [
        {
            "role": "model" if m["role"] == "assistant" else "user",
            "parts": [{"text": m["content"]}],
        }
        for m in messages
    ]
    func_decl = {
        "name": DEAL_ENGINE_TOOL["name"],
        "description": DEAL_ENGINE_TOOL["description"],
        "parameters": DEAL_ENGINE_TOOL["input_schema"],
    }
    return {
        "url": f"{config['api_url']}/{config['model']}:generateContent?key={api_key}",
        "headers": {"Content-Type": "application/json"},
        "body": {
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": contents,
            "tools": [{"functionDeclarations": [func_decl]}],
            "tool_config": {
                "function_calling_config": {
                    "mode": "ANY",
                    "allowed_function_names": ["update_deal_model"],
                },
            },
            "generationConfig": {"maxOutputTokens": 4096},
        },
    }


# ── Provider-specific response parsers ────────────────────────────────────

def _parse_anthropic_response(result: dict) -> Optional[dict]:
    """Extract tool_use block from Anthropic response."""
    for block in result.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "update_deal_model":
            return block.get("input", {})
    return None


def _parse_openai_response(result: dict) -> Optional[dict]:
    """Extract function call from OpenAI-compatible response."""
    choices = result.get("choices", [])
    if not choices:
        return None
    message = choices[0].get("message", {})
    tool_calls = message.get("tool_calls", [])
    for tc in tool_calls:
        fn = tc.get("function", {})
        if fn.get("name") == "update_deal_model":
            args = fn.get("arguments", "{}")
            return json.loads(args) if isinstance(args, str) else args
    return None


def _parse_google_response(result: dict) -> Optional[dict]:
    """Extract function call from Gemini response."""
    candidates = result.get("candidates", [])
    if not candidates:
        return None
    content = candidates[0].get("content", {})
    parts = content.get("parts", [])
    for part in parts:
        fc = part.get("functionCall")
        if fc and fc.get("name") == "update_deal_model":
            return fc.get("args", {})
    return None


# ── Main AI call ──────────────────────────────────────────────────────────

async def call_ai(
    message: str,
    model_state: ModelState,
    chat_history: list[dict],
    api_key: str,
    provider: Optional[str] = None,
) -> dict:
    """Call AI provider with tool use enforced.

    Returns dict with: updated_state_dict, analysis, assumption_updates, intent
    """
    if provider is None:
        provider = detect_provider(api_key)

    config = PROVIDER_CONFIGS.get(provider, PROVIDER_CONFIGS["openai"])
    intent = classify_intent(message)

    # Build messages
    state_json = model_state.model_dump_json(exclude={"chat_history"})
    messages = []
    for msg in chat_history[-10:]:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({
        "role": "user",
        "content": f"[Intent: {intent.value}]\n\n[Current Model State]\n{state_json}\n\n[User Message]\n{message}",
    })

    # Build provider-specific request
    if provider == "anthropic":
        req = _build_anthropic_request(messages, api_key, config)
    elif provider == "google":
        req = _build_google_request(messages, api_key, config)
    else:
        req = _build_openai_request(messages, api_key, config)

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            req["url"],
            headers=req["headers"],
            json=req["body"],
        )

    if response.status_code != 200:
        error_text = response.text
        logger.error("%s API error %d: %s", provider, response.status_code, error_text)
        return {
            "error": f"API error {response.status_code}: {error_text}",
            "intent": intent.value,
        }

    result = response.json()

    # Parse provider-specific response
    if provider == "anthropic":
        tool_input = _parse_anthropic_response(result)
    elif provider == "google":
        tool_input = _parse_google_response(result)
    else:
        tool_input = _parse_openai_response(result)

    if tool_input is None:
        return {
            "error": "AI did not return a tool call",
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
