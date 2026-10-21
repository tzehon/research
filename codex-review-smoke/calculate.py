"""Disposable fixture for the Codex review workflow smoke test."""


def mean(values):
    """Return the arithmetic mean, or 0.0 for an empty collection."""
    return sum(values) / len(values)
