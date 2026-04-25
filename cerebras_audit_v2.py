#!/usr/bin/env python3
"""Audit scenarios.py, projections.py, debt_schedule.py — writes after each file."""

import time
import requests

API_KEY = "csk-4f6km6nnfxpyy8hxymr5hyvxc24vd644wn2dc246wkyn58ed"
API_URL = "https://api.cerebras.ai/v1/chat/completions"
MODEL   = "qwen-3-235b-a22b-instruct-2507"

FILES = [
    ("scenarios.py",    "/home/user/mridulm/backend/engine/scenarios.py"),
    ("projections.py",  "/home/user/mridulm/backend/engine/projections.py"),
    ("debt_schedule.py","/home/user/mridulm/backend/engine/debt_schedule.py"),
]

SYSTEM_PROMPT = """You are a senior CFA charterholder and LBO modelling expert with 15+ years of private equity experience.
You are reviewing Python code that implements a Leveraged Buyout (LBO) deal engine.

Your job is a LINE-BY-LINE financial logic audit. For every issue you find, you MUST cite:
  • The exact line number(s)
  • The variable or expression involved
  • Why it is wrong from a finance/accounting perspective
  • What the correct formula or logic should be

Focus specifically on:
1. Incorrect financial formulas (e.g., wrong EBITDA bridge, incorrect leverage ratios, flipped signs)
2. DSCR / interest coverage / covenant math errors
3. IRR / money-multiple calculation errors (Newton-Raphson convergence, sign conventions, period timing)
4. Debt schedule amortisation, PIK accrual, cash sweep priority errors
5. Missing edge cases (division by zero on zero EBITDA, negative equity, illiquid exit)
6. Wrong period indexing (off-by-one in year 0 vs year 1 cash flows)
7. Sensitivity / scenario table construction errors (wrong axis, wrong base case reference)
8. Return attribution / value bridge decomposition errors
9. Sign errors in free cash flow, capex, working capital
10. Tax shield mis-application or circular dependency issues

Be exhaustive. If a line is correct, skip it. Only report genuine errors or strong suspicions.
Format each finding as:

FINDING [N]:
  File: <filename>
  Line(s): <line numbers>
  Code: <exact code snippet>
  Issue: <financial explanation of what is wrong>
  Fix: <corrected code or formula>

After all findings, output a SUMMARY section listing the most critical issues first."""

REPORT = "/home/user/mridulm/audit_report_part2.md"


def audit_file(filename, filepath, retries=6):
    with open(filepath) as f:
        raw = f.read()
    numbered = "\n".join(f"{i+1:4d} | {l}" for i, l in enumerate(raw.splitlines()))
    user_content = (
        f"Audit the following Python file from an LBO deal engine: **{filename}**\n\n"
        f"```python\n{numbered}\n```\n\n"
        "Perform a thorough line-by-line financial logic audit as instructed."
    )
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_content},
        ],
        "max_completion_tokens": 8192,
        "temperature": 0.2,
    }
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

    for attempt in range(retries):
        t0 = time.time()
        try:
            resp = requests.post(API_URL, headers=headers, json=payload, timeout=120)
        except Exception as e:
            print(f"  [{filename}] Network error: {e}. Retrying in 15s...")
            time.sleep(15)
            continue

        elapsed = time.time() - t0

        if resp.status_code == 200:
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            tok = data.get("usage", {})
            print(f"  [{filename}] OK in {elapsed:.1f}s | in={tok.get('prompt_tokens')} out={tok.get('completion_tokens')}")
            return content
        elif resp.status_code == 429:
            wait = 20 * (2 ** attempt)
            print(f"  [{filename}] Rate limited (attempt {attempt+1}/{retries}) — waiting {wait}s...")
            time.sleep(wait)
        else:
            return f"ERROR {resp.status_code}: {resp.text}"

    return "ERROR: Failed after all retries (persistent rate limit)"


def main():
    with open(REPORT, "w") as f:
        f.write("# Audit Part 2 — scenarios.py / projections.py / debt_schedule.py\n\n")
        f.write(f"Model: {MODEL}  |  {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}\n\n---\n\n")

    for i, (filename, filepath) in enumerate(FILES):
        if i > 0:
            print("  Pausing 20s between files...")
            time.sleep(20)
        lines = sum(1 for _ in open(filepath))
        print(f"\nAuditing {filename} ({lines} lines)...")
        content = audit_file(filename, filepath)

        # Write immediately so we don't lose results
        with open(REPORT, "a") as f:
            f.write(f"## {filename}\n\n{content}\n\n---\n\n")
        print(f"  Saved {filename} to {REPORT}")

    print(f"\nDone. Full results in {REPORT}")

    # Print consolidated output
    print("\n" + "=" * 70)
    with open(REPORT) as f:
        print(f.read())


if __name__ == "__main__":
    main()
