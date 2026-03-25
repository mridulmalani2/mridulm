"""IRR solver edge cases — test cases from Section 12."""

import pytest
from backend.engine.returns import _solve_irr


class TestIRRSolver:
    """IRR solver must handle all spec test cases."""

    def test_2x_moic_5yr(self):
        """CF: [-100, 0, 0, 0, 0, 200] → IRR ≈ 14.87%"""
        irr = _solve_irr([-100, 0, 0, 0, 0, 200])
        assert irr is not None
        assert abs(irr - 0.1487) < 0.001

    def test_3x_moic_5yr(self):
        """CF: [-100, 0, 0, 0, 0, 300] → IRR ≈ 24.57%"""
        irr = _solve_irr([-100, 0, 0, 0, 0, 300])
        assert irr is not None
        assert abs(irr - 0.2457) < 0.001

    def test_1x_moic_5yr(self):
        """CF: [-100, 0, 0, 0, 0, 100] → IRR = 0%"""
        irr = _solve_irr([-100, 0, 0, 0, 0, 100])
        assert irr is not None
        assert abs(irr) < 0.001

    def test_1_5x_moic_3yr(self):
        """CF: [-100, 0, 0, 150] → IRR ≈ 14.47%"""
        irr = _solve_irr([-100, 0, 0, 150])
        assert irr is not None
        assert abs(irr - 0.1447) < 0.001

    def test_all_negative_returns_none(self):
        """Non-convergent: all negative CFs → must return None."""
        irr = _solve_irr([-100, -50, -50, -50])
        assert irr is None

    def test_all_positive_returns_none(self):
        """No sign change → None."""
        irr = _solve_irr([100, 50, 50])
        assert irr is None

    def test_empty_returns_none(self):
        irr = _solve_irr([])
        assert irr is None

    def test_single_cashflow(self):
        irr = _solve_irr([-100])
        assert irr is None

    def test_high_return(self):
        """10x in 3 years."""
        irr = _solve_irr([-100, 0, 0, 1000])
        assert irr is not None
        assert irr > 0.5
