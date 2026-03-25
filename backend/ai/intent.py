"""Intent classification — Section 4.5."""

from enum import Enum
import re


class Intent(Enum):
    MODIFY_ASSUMPTION = "modify_assumption"
    RUN_SCENARIO = "run_scenario"
    REQUEST_CRITIQUE = "request_critique"
    EXPLAIN_OUTPUT = "explain_output"
    STRESS_TEST = "stress_test"
    GENERATE_ASSUMPTIONS = "generate_assumptions"
    COMPARE_SCENARIOS = "compare_scenarios"


_PATTERNS: list[tuple[re.Pattern, Intent]] = [
    # MODIFY_ASSUMPTION
    (re.compile(r"(set|change|reduce|increase|lower|raise|adjust|make|put)\b", re.I), Intent.MODIFY_ASSUMPTION),
    (re.compile(r"\b(growth|margin|multiple|leverage|rate|capex|nwc)\b.*\b(to|at|of)\b", re.I), Intent.MODIFY_ASSUMPTION),
    # RUN_SCENARIO
    (re.compile(r"\b(bear|bull|stress|scenario|downside|upside)\b", re.I), Intent.RUN_SCENARIO),
    # REQUEST_CRITIQUE
    (re.compile(r"\b(critique|risk|flag|issue|problem|concern|weak)\b", re.I), Intent.REQUEST_CRITIQUE),
    # EXPLAIN_OUTPUT
    (re.compile(r"\b(why|explain|how come|what drives|sensitive)\b", re.I), Intent.EXPLAIN_OUTPUT),
    # STRESS_TEST
    (re.compile(r"\b(break|stress|worst|collapse|fail|what if)\b", re.I), Intent.STRESS_TEST),
    # GENERATE_ASSUMPTIONS
    (re.compile(r"\b(fill|generate|suggest|missing|ai decide|auto)\b", re.I), Intent.GENERATE_ASSUMPTIONS),
    # COMPARE_SCENARIOS
    (re.compile(r"\b(compare|vs|versus|base vs|side by side)\b", re.I), Intent.COMPARE_SCENARIOS),
]


def classify_intent(message: str) -> Intent:
    """Simple keyword/pattern matching for intent classification."""
    for pattern, intent in _PATTERNS:
        if pattern.search(message):
            return intent
    return Intent.REQUEST_CRITIQUE  # default: critique the deal
