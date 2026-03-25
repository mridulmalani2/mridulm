"""Excel export engine — three-sheet workbook per Section 7."""

from __future__ import annotations

import io
from typing import Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side, numbers
from openpyxl.utils import get_column_letter

from backend.models.state import ModelState

# Formatting constants
HEADER_FILL = PatternFill(start_color="1a2744", end_color="1a2744", fill_type="solid")
HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
BODY_FONT = Font(name="Calibri", size=10)
SECTION_FONT = Font(name="Calibri", size=11, bold=True, color="1a2744")
ALT_ROW_FILL = PatternFill(start_color="f5f7fa", end_color="f5f7fa", fill_type="solid")
THIN_BORDER = Border(
    bottom=Side(style="thin", color="d0d5dd"),
)
GREEN_FONT = Font(name="Calibri", size=10, color="006100")
RED_FONT = Font(name="Calibri", size=10, color="9C0006")
AMBER_FONT = Font(name="Calibri", size=10, color="9C6500")

CURRENCY_SYMBOLS = {"GBP": "£", "EUR": "€", "USD": "$", "CHF": "CHF "}


def build_excel(state: ModelState) -> bytes:
    """Build a three-sheet Excel workbook and return as bytes."""
    wb = Workbook()
    ccy = CURRENCY_SYMBOLS.get(state.currency, "£")
    hp = state.exit.holding_period

    _build_assumptions_sheet(wb, state, ccy)
    _build_calculations_sheet(wb, state, ccy, hp)
    _build_outputs_sheet(wb, state, ccy, hp)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _style_header_row(ws, row: int, max_col: int):
    for col in range(1, max_col + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center")


def _write_section_header(ws, row: int, title: str, max_col: int) -> int:
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=max_col)
    cell = ws.cell(row=row, column=1, value=title)
    cell.font = SECTION_FONT
    cell.border = Border(bottom=Side(style="medium", color="1a2744"))
    return row + 1


def _write_row(ws, row: int, label: str, values: list, fmt: str = "number", alt: bool = False):
    ws.cell(row=row, column=1, value=label).font = BODY_FONT
    for i, v in enumerate(values):
        cell = ws.cell(row=row, column=i + 2, value=v)
        cell.font = BODY_FONT
        if fmt == "pct":
            cell.number_format = "0.0%"
        elif fmt == "currency":
            cell.number_format = "#,##0.0"
        else:
            cell.number_format = "#,##0.0"
        if alt:
            cell.fill = ALT_ROW_FILL
    return row + 1


# ── Sheet 1: Assumptions ─────────────────────────────────────────────────

def _build_assumptions_sheet(wb: Workbook, state: ModelState, ccy: str):
    ws = wb.active
    ws.title = "Assumptions"
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 18

    row = 1
    ai_fields = set(state.ai_toggle_fields)

    def _add(label: str, value, field_path: str = ""):
        nonlocal row
        prefix = "[AI] " if field_path in ai_fields else ""
        ws.cell(row=row, column=1, value=f"{prefix}{label}").font = BODY_FONT
        cell = ws.cell(row=row, column=2, value=value)
        cell.font = BODY_FONT
        if isinstance(value, float) and value < 1:
            cell.number_format = "0.0%"
        elif isinstance(value, float):
            cell.number_format = "#,##0.0"
        row += 1

    # Entry
    row = _write_section_header(ws, row, "ENTRY ASSUMPTIONS", 2)
    _add("Deal Name", state.deal_name)
    _add("Sector", state.sector)
    _add("Currency", state.currency)
    _add("LTM Revenue", state.revenue.base_revenue)
    _add("LTM EBITDA Margin", state.margins.base_ebitda_margin, "margins.base_ebitda_margin")
    _add("Entry EBITDA Multiple", state.entry.entry_ebitda_multiple)
    _add("Enterprise Value", state.entry.enterprise_value)
    _add("Entry Revenue Multiple", state.entry.entry_revenue_multiple)
    _add("Total Debt Raised", state.entry.total_debt_raised)
    _add("Leverage Ratio", state.entry.leverage_ratio, "entry.leverage_ratio")
    _add("Equity Check", state.entry.equity_check)
    row += 1

    # Debt
    row = _write_section_header(ws, row, "DEBT STRUCTURE", 2)
    for i, t in enumerate(state.debt_tranches):
        _add(f"Tranche: {t.name}", "")
        _add("  Principal", t.principal)
        _add("  Rate Type", t.rate_type)
        _add("  Interest Rate", t.interest_rate)
        _add("  Amortization", t.amortization_type)
        if t.pik_rate > 0:
            _add("  PIK Rate", t.pik_rate)
    row += 1

    # Revenue
    row = _write_section_header(ws, row, "REVENUE ASSUMPTIONS", 2)
    for yr, g in enumerate(state.revenue.growth_rates, 1):
        _add(f"Year {yr} Growth", g, "revenue.growth_rates")
    _add("Churn Rate", state.revenue.churn_rate)
    row += 1

    # Margins
    row = _write_section_header(ws, row, "MARGIN ASSUMPTIONS", 2)
    _add("Target EBITDA Margin", state.margins.target_ebitda_margin, "margins.target_ebitda_margin")
    _add("Trajectory", state.margins.margin_trajectory, "margins.margin_trajectory")
    _add("D&A % Revenue", state.margins.da_pct_revenue)
    _add("Capex % Revenue", state.margins.capex_pct_revenue)
    _add("NWC % Revenue", state.margins.nwc_pct_revenue)
    row += 1

    # Fees
    row = _write_section_header(ws, row, "FEES & TAX", 2)
    _add("Entry Fee %", state.fees.entry_fee_pct)
    _add("Exit Fee %", state.fees.exit_fee_pct)
    _add("Monitoring Fee (p.a.)", state.fees.monitoring_fee_annual, "fees.monitoring_fee_annual")
    _add("Financing Fee %", state.fees.financing_fee_pct)
    _add("Transaction Costs", state.fees.transaction_costs)
    _add("Tax Rate", state.tax.tax_rate)
    _add("NOL Carryforward", state.tax.nol_carryforward)
    row += 1

    # Exit
    row = _write_section_header(ws, row, "EXIT ASSUMPTIONS", 2)
    _add("Holding Period", state.exit.holding_period, "exit.holding_period")
    _add("Exit EBITDA Multiple", state.exit.exit_ebitda_multiple, "exit.exit_ebitda_multiple")
    _add("Exit Method", state.exit.exit_method)
    row += 1

    # MIP
    row = _write_section_header(ws, row, "MANAGEMENT INCENTIVE", 2)
    _add("MIP Pool %", state.mip.mip_pool_pct)
    _add("Hurdle MOIC", state.mip.hurdle_moic)
    _add("Vesting Years", state.mip.vesting_years)
    _add("Sweet Equity %", state.mip.sweet_equity_pct)


# ── Sheet 2: Calculations ────────────────────────────────────────────────

def _build_calculations_sheet(wb: Workbook, state: ModelState, ccy: str, hp: int):
    ws = wb.create_sheet("Calculations")
    ws.column_dimensions["A"].width = 28
    for c in range(2, hp + 3):
        ws.column_dimensions[get_column_letter(c)].width = 14

    years = state.projections.years
    if not years:
        ws.cell(row=1, column=1, value="No projections calculated")
        return

    # Year headers
    row = 1
    ws.cell(row=row, column=1, value="").font = BODY_FONT
    for i in range(hp):
        ws.cell(row=row, column=i + 2, value=f"Year {i + 1}").font = HEADER_FONT
    _style_header_row(ws, row, hp + 1)
    row += 1

    # P&L
    row = _write_section_header(ws, row, "INCOME STATEMENT", hp + 1)
    row = _write_row(ws, row, "Revenue", [y.revenue for y in years], "currency")
    row = _write_row(ws, row, "Revenue Growth", [y.revenue_growth for y in years], "pct", True)
    row = _write_row(ws, row, "EBITDA", [y.ebitda for y in years], "currency")
    row = _write_row(ws, row, "EBITDA Margin", [y.ebitda_margin for y in years], "pct", True)
    row = _write_row(ws, row, "Monitoring Fee Adj.", [-state.fees.monitoring_fee_annual] * hp, "currency")
    row = _write_row(ws, row, "EBITDA Adjusted", [y.ebitda_adj for y in years], "currency", True)
    row = _write_row(ws, row, "D&A", [-y.da for y in years], "currency")
    row = _write_row(ws, row, "EBIT", [y.ebit for y in years], "currency", True)
    row = _write_row(ws, row, "Interest Expense", [-y.interest_expense for y in years], "currency")
    row = _write_row(ws, row, "EBT", [y.ebt for y in years], "currency", True)
    row = _write_row(ws, row, "Tax", [-y.tax for y in years], "currency")
    row = _write_row(ws, row, "Net Income", [y.net_income for y in years], "currency", True)
    row += 1

    # FCF Build
    row = _write_section_header(ws, row, "FREE CASH FLOW", hp + 1)
    row = _write_row(ws, row, "EBITDA Adjusted", [y.ebitda_adj for y in years], "currency")
    row = _write_row(ws, row, "Tax", [-y.tax for y in years], "currency", True)
    row = _write_row(ws, row, "Maintenance Capex", [-y.maintenance_capex for y in years], "currency")
    row = _write_row(ws, row, "Growth Capex", [-y.growth_capex for y in years], "currency", True)
    row = _write_row(ws, row, "Change in NWC", [-y.delta_nwc for y in years], "currency")
    row = _write_row(ws, row, "FCF Pre-Debt", [y.fcf_pre_debt for y in years], "currency", True)
    row = _write_row(ws, row, "FCF to Equity", [y.fcf_to_equity for y in years], "currency")
    row += 1

    # Debt Schedule
    row = _write_section_header(ws, row, "DEBT SCHEDULE", hp + 1)
    ds = state.debt_schedule
    for t_idx, tranche_sched in enumerate(ds.tranche_schedules):
        name = tranche_sched[0].tranche_name if tranche_sched else f"Tranche {t_idx+1}"
        row = _write_row(ws, row, f"{name} — Beg Balance", [y.beginning_balance for y in tranche_sched], "currency")
        row = _write_row(ws, row, f"  Cash Interest", [-y.cash_interest for y in tranche_sched], "currency", True)
        row = _write_row(ws, row, f"  PIK Accrual", [y.pik_accrual for y in tranche_sched], "currency")
        row = _write_row(ws, row, f"  Repayment", [-y.total_repayment for y in tranche_sched], "currency", True)
        row = _write_row(ws, row, f"  End Balance", [y.ending_balance for y in tranche_sched], "currency")
        row += 1

    # Aggregate metrics
    row = _write_row(ws, row, "Total Debt", ds.total_debt_by_year, "currency")
    row = _write_row(ws, row, "Leverage Ratio", ds.leverage_ratio_by_year, "number", True)
    row = _write_row(ws, row, "Interest Coverage", ds.interest_coverage_by_year, "number")
    row = _write_row(ws, row, "DSCR", ds.dscr_by_year, "number", True)


# ── Sheet 3: Outputs ─────────────────────────────────────────────────────

def _build_outputs_sheet(wb: Workbook, state: ModelState, ccy: str, hp: int):
    ws = wb.create_sheet("Outputs")
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 18
    ws.column_dimensions["C"].width = 18

    row = 1
    ret = state.returns

    # Returns Summary
    row = _write_section_header(ws, row, "RETURNS SUMMARY", 3)

    def _irr_font(irr: Optional[float]) -> Font:
        if irr is None:
            return BODY_FONT
        if irr > 0.25:
            return GREEN_FONT
        if irr >= 0.15:
            return AMBER_FONT
        return RED_FONT

    def _add_metric(label: str, value, fmt: str = "0.0%"):
        nonlocal row
        ws.cell(row=row, column=1, value=label).font = BODY_FONT
        cell = ws.cell(row=row, column=2, value=value)
        cell.number_format = fmt
        if "IRR" in label and isinstance(value, (int, float)):
            cell.font = _irr_font(value)
        else:
            cell.font = BODY_FONT
        row += 1

    _add_metric("Equity IRR", ret.irr)
    _add_metric("Gross IRR", ret.irr_gross)
    _add_metric("Levered IRR", ret.irr_levered)
    _add_metric("Unlevered IRR", ret.irr_unlevered)
    _add_metric("MOIC", ret.moic, "0.00x")
    _add_metric("Payback (years)", ret.payback_years, "0.0")
    _add_metric("Cash Yield (avg)", ret.cash_yield_avg)
    _add_metric("Entry Equity", ret.entry_equity, "#,##0.0")
    _add_metric("Exit Equity", ret.exit_equity, "#,##0.0")
    _add_metric("Exit EV", ret.exit_ev, "#,##0.0")
    _add_metric("MIP Payout", ret.mip_payout, "#,##0.0")
    row += 1

    # Value Driver Bridge
    vd = state.value_drivers
    row = _write_section_header(ws, row, "VALUE DRIVER BRIDGE", 3)
    ws.cell(row=row, column=1, value="Driver").font = HEADER_FONT
    ws.cell(row=row, column=2, value=f"{ccy}m").font = HEADER_FONT
    ws.cell(row=row, column=3, value="% Contribution").font = HEADER_FONT
    _style_header_row(ws, row, 3)
    row += 1

    bridges = [
        ("Entry Equity", vd.entry_equity, ""),
        ("Revenue Growth", vd.revenue_growth_contribution_abs, vd.revenue_growth_contribution_pct),
        ("Margin Expansion", vd.margin_expansion_contribution_abs, vd.margin_expansion_contribution_pct),
        ("Multiple Expansion", vd.multiple_expansion_contribution_abs, vd.multiple_expansion_contribution_pct),
        ("Debt Paydown", vd.debt_paydown_contribution_abs, vd.debt_paydown_contribution_pct),
        ("Fees Drag", vd.fees_drag_contribution_abs, vd.fees_drag_contribution_pct),
        ("Exit Equity", vd.exit_equity, ""),
    ]
    for label, abs_val, pct_val in bridges:
        ws.cell(row=row, column=1, value=label).font = BODY_FONT
        ws.cell(row=row, column=2, value=abs_val).number_format = "#,##0.0"
        if isinstance(pct_val, (int, float)):
            ws.cell(row=row, column=3, value=pct_val / 100).number_format = "0.0%"
        row += 1
    row += 1

    # Scenarios
    if state.scenarios:
        row = _write_section_header(ws, row, "SCENARIO COMPARISON", 6)
        headers = ["Metric"] + [s.name.upper() for s in state.scenarios]
        for i, h in enumerate(headers):
            ws.cell(row=row, column=i + 1, value=h).font = HEADER_FONT
        _style_header_row(ws, row, len(headers))
        row += 1

        ws.cell(row=row, column=1, value="IRR").font = BODY_FONT
        for i, s in enumerate(state.scenarios):
            cell = ws.cell(row=row, column=i + 2, value=s.irr)
            cell.number_format = "0.0%"
            cell.font = _irr_font(s.irr)
        row += 1

        ws.cell(row=row, column=1, value="MOIC").font = BODY_FONT
        for i, s in enumerate(state.scenarios):
            ws.cell(row=row, column=i + 2, value=s.moic).number_format = "0.00x"
        row += 1

        ws.cell(row=row, column=1, value="Exit Multiple").font = BODY_FONT
        for i, s in enumerate(state.scenarios):
            ws.cell(row=row, column=i + 2, value=s.exit_multiple).number_format = "0.0x"
        row += 1
        row += 1

    # Exit Reality Check
    rc = state.exit_reality_check
    row = _write_section_header(ws, row, "EXIT REALITY CHECK", 4)
    ws.cell(row=row, column=1, value="Verdict").font = SECTION_FONT
    verdict_cell = ws.cell(row=row, column=2, value=rc.verdict.upper())
    if rc.verdict == "aggressive":
        verdict_cell.font = RED_FONT
    elif rc.verdict == "conservative":
        verdict_cell.font = AMBER_FONT
    else:
        verdict_cell.font = GREEN_FONT
    row += 1

    if rc.implied_buyer_irr is not None:
        ws.cell(row=row, column=1, value="Implied Buyer IRR").font = BODY_FONT
        cell = ws.cell(row=row, column=2, value=rc.implied_buyer_irr)
        cell.number_format = "0.0%"
        cell.font = _irr_font(rc.implied_buyer_irr)
        row += 1

    row += 1
    if rc.flags:
        ws.cell(row=row, column=1, value="Rule").font = HEADER_FONT
        ws.cell(row=row, column=2, value="Severity").font = HEADER_FONT
        ws.cell(row=row, column=3, value="Description").font = HEADER_FONT
        ws.cell(row=row, column=4, value="Impact").font = HEADER_FONT
        _style_header_row(ws, row, 4)
        row += 1

        for flag in rc.flags:
            ws.cell(row=row, column=1, value=flag.flag_type).font = BODY_FONT
            sev_cell = ws.cell(row=row, column=2, value=flag.severity.upper())
            sev_cell.font = RED_FONT if flag.severity == "critical" else AMBER_FONT
            ws.cell(row=row, column=3, value=flag.description).font = BODY_FONT
            ws.cell(row=row, column=4, value=flag.quantified_impact).font = BODY_FONT
            row += 1
