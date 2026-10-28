"""Romanian number formats used in statements and bank exports: 7.900.000 · 244466,67 · (151.200) for negatives."""
import re

# A grouped integer (7.900.000), an optional decimal part, optional parentheses or minus for negatives.
TOKEN = re.compile(r"\(?-?\d{1,3}(?:\.\d{3})+(?:,\d+)?\)?|\(?-?\d+(?:,\d+)?\)?")


def parse_ro(text: str) -> float | None:
    """Parse one Romanian-formatted number; None when the text is not a number."""
    s = text.strip().replace(" ", "").replace(" ", "")
    negative = (s.startswith("(") and s.endswith(")")) or s.startswith("-")
    s = s.strip("()").lstrip("-")
    if not re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?", s):
        return None
    value = float(s.replace(".", "").replace(",", "."))
    return -value if negative else value


def fmt_ro(value: float, decimals: int = 0) -> str:
    text = f"{abs(value):,.{decimals}f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return ("-" if value < 0 and round(abs(value), decimals) else "") + text


def fmt_ron(value: float) -> str:
    return f"{fmt_ro(round(value))} RON"


def fmt_pct(value: float, decimals: int = 1) -> str:
    return f"{fmt_ro(value, decimals)}%"


def fmt_x(value: float) -> str:
    return f"{fmt_ro(value, 2)}x"
