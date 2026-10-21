"""Disposable fixture for the direct CLI review workflow smoke test."""


def mean(values):
    """Return the arithmetic mean, or 0.0 for an empty collection."""
    return sum(values) / len(values)
