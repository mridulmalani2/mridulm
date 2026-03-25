"""AI tool definition — Section 4.2."""

DEAL_ENGINE_TOOL = {
    "name": "update_deal_model",
    "description": "Update deal model assumptions and/or provide structured investment analysis. Always call this tool. Never respond with plain text only.",
    "input_schema": {
        "type": "object",
        "properties": {
            "assumption_updates": {
                "type": "object",
                "description": "Dictionary of model fields to update. Use dot notation for nested fields. Empty dict if no updates.",
                "additionalProperties": True,
            },
            "trigger_recalculation": {
                "type": "boolean",
                "description": "Whether backend should rerun full model after applying updates",
            },
            "analysis": {
                "type": "object",
                "properties": {
                    "return_decomposition": {
                        "type": "string",
                        "description": "What is currently driving returns. Be specific. Reference numbers.",
                    },
                    "primary_driver": {
                        "type": "string",
                        "description": "Single clearest driver of returns. One sentence.",
                    },
                    "risk_concentration": {
                        "type": "string",
                        "description": "Where the model is most fragile. Name the variable and the threshold.",
                    },
                    "fragility_test": {
                        "type": "string",
                        "description": "What specific change breaks the deal. Quantify the break point.",
                    },
                    "improvement_levers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Ranked list of levers to improve IRR. Actionable. Specific.",
                    },
                    "assumption_rationale": {
                        "type": "string",
                        "description": "If assumptions were updated: explain why these values and not others. Reference sector context.",
                    },
                },
                "required": [
                    "return_decomposition",
                    "primary_driver",
                    "risk_concentration",
                    "fragility_test",
                    "improvement_levers",
                ],
            },
            "scenario_request": {
                "type": "object",
                "nullable": True,
                "description": "If user requested a named scenario, specify it here",
                "properties": {
                    "scenario_name": {"type": "string"},
                    "overrides": {"type": "object"},
                },
            },
        },
        "required": ["assumption_updates", "trigger_recalculation", "analysis"],
    },
}
