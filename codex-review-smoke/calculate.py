"""Disposable fixture for the Codex review workflow smoke test."""


def mean(values):
    """Return the arithmetic mean, or 0.0 for an empty collection."""
    if not values:
        return 0.0
    return sum(values) / len(values)
