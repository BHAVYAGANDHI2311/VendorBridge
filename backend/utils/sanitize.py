import re

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_TAG_RE = re.compile(r"<[^>]*>")


def sanitize_text(value: str) -> str:
    """Strip control chars and HTML tags to mitigate XSS."""
    if value is None:
        return value
    cleaned = _CONTROL_CHARS.sub("", value.strip())
    return _TAG_RE.sub("", cleaned)
