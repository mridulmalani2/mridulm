"""Add-on acquisition engine (Python mirror of lib/engine/addOns.ts) — D.

Injects bolt-on revenue/EBITDA into the projection (via acquisition_revenue) and
bolt-on acquisition debt into the debt schedule (as synthetic tranches drawn in the
acquisition year). The sponsor-equity portion of equity/mixed-funded bolt-ons is
surfaced via ``equity_deployed_by_year`` and charged in returns (see returns.py).

Previously Python had no add-on engine at all (a documented divergence); this brings
it to parity with the TypeScript source of truth.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.models.state import ModelState
from backend.models.debt import DebtTranche


@dataclass
class AddOnImpact:
    revenue_by_year: list[float] = field(default_factory=list)
    ebitda_by_year: list[float] = field(default_factory=list)
    equity_deployed_by_year: list[float] = field(default_factory=list)
    debt_added_by_year: list[float] = field(default_factory=list)
    integration_cost_by_year: list[float] = field(default_factory=list)
    synergy_revenue_by_year: list[float] = field(default_factory=list)
    cost_synergies_by_year: list[float] = field(default_factory=list)


def compute_add_on_impact(state: ModelState) -> AddOnImpact:
    hp = state.exit.holding_period
    add_ons = state.add_on_acquisitions or []

    revenue_by_year = [0.0] * hp
    ebitda_by_year = [0.0] * hp
    equity_by_year = [0.0] * hp
    debt_by_year = [0.0] * hp
    integration_by_year = [0.0] * hp
    synergy_rev_by_year = [0.0] * hp
    cost_syn_by_year = [0.0] * hp

    growth = state.revenue.growth_rates or []

    for addon in add_ons:
        acq_year = addon.year  # 1-indexed
        if acq_year < 1 or acq_year > hp:
            continue

        purchase_price = addon.revenue * addon.ebitda_margin * addon.purchase_multiple
        if addon.funding == "debt":
            debt_portion = purchase_price
        elif addon.funding == "equity":
            debt_portion = 0.0
        else:  # mixed
            debt_portion = purchase_price * addon.debt_pct
        equity_portion = purchase_price - debt_portion

        yr_idx = acq_year - 1
        equity_by_year[yr_idx] += equity_portion
        debt_by_year[yr_idx] += debt_portion
        integration_by_year[yr_idx] += addon.integration_cost

        for i in range(yr_idx, hp):
            years_owned = i - yr_idx
            # Add-on revenue grows at the base business growth rate.
            add_on_growth = 1.0
            if years_owned > 0 and i < len(growth):
                for g in growth[yr_idx:i]:
                    add_on_growth *= 1 + g

            # Synergy ramp (P4-12): phase in linearly over synergy_ramp_years;
            # absent ⇒ full synergy from the year after acquisition.
            ramp = addon.synergy_ramp_years
            if ramp and ramp > 0:
                synergy_fraction = min(1.0, years_owned / ramp)
            else:
                synergy_fraction = 1.0 if years_owned > 0 else 0.0

            revenue_by_year[i] += addon.revenue * add_on_growth + addon.synergy_revenue * synergy_fraction
            ebitda_by_year[i] += addon.revenue * add_on_growth * addon.ebitda_margin + addon.synergy_cost * synergy_fraction
            if synergy_fraction > 0:
                synergy_rev_by_year[i] += addon.synergy_revenue * synergy_fraction
                cost_syn_by_year[i] += addon.synergy_cost * synergy_fraction

    return AddOnImpact(
        revenue_by_year=revenue_by_year,
        ebitda_by_year=ebitda_by_year,
        equity_deployed_by_year=equity_by_year,
        debt_added_by_year=debt_by_year,
        integration_cost_by_year=integration_by_year,
        synergy_revenue_by_year=synergy_rev_by_year,
        cost_synergies_by_year=cost_syn_by_year,
    )


def build_add_on_debt_tranches(state: ModelState, impact: AddOnImpact) -> list[DebtTranche]:
    """Synthetic bullet tranches for add-on acquisition debt — one per year with
    incremental debt, drawn in that year (draw_year_index) and carried to exit."""
    hp = state.exit.holding_period
    ref = next((t for t in state.debt_tranches if t.tranche_type == "senior"), None)
    if ref is None and state.debt_tranches:
        ref = state.debt_tranches[0]

    out: list[DebtTranche] = []
    for yr_idx, amt in enumerate(impact.debt_added_by_year):
        if amt <= 0:
            continue
        out.append(DebtTranche(
            name=f"Add-on Debt (Yr {yr_idx + 1})",
            tranche_type="senior",
            principal=amt,
            interest_rate=ref.interest_rate if ref else 0.08,
            rate_type=ref.rate_type if ref else "fixed",
            base_rate=ref.base_rate if ref else 0.0,
            spread=ref.spread if ref else 0.0,
            amortization_type="bullet",
            amortization_schedule=[0.0] * hp,
            pik_rate=0.0,
            cash_interest=True,
            commitment_fee=0.0,
            floor=ref.floor if ref else 0.0,
            cash_sweep_pct=0.0,
            draw_year_index=yr_idx,
            synthetic_addon=True,
        ))
    return out


def strip_synthetic_add_on_tranches(state: ModelState) -> None:
    if any(getattr(t, "synthetic_addon", False) for t in state.debt_tranches):
        state.debt_tranches = [t for t in state.debt_tranches if not getattr(t, "synthetic_addon", False)]


def inject_add_ons(state: ModelState) -> tuple[AddOnImpact, list[DebtTranche]]:
    """Strip stale synthetic tranches, inject add-on revenue, and append synthetic
    acquisition-debt tranches. Returns (impact, original non-synthetic tranches);
    callers MUST restore state.debt_tranches = original after computing the schedule."""
    base_tranches = [t for t in state.debt_tranches if not getattr(t, "synthetic_addon", False)]
    state.debt_tranches = base_tranches

    impact = compute_add_on_impact(state)
    state.revenue.acquisition_revenue = impact.revenue_by_year

    synthetic = build_add_on_debt_tranches(state, impact)
    if synthetic:
        state.debt_tranches = base_tranches + synthetic
    return impact, base_tranches
