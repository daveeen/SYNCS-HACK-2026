"""Parsing/cleaning helpers for startups_base.csv -> startups_clean.csv."""

import re

import pandas as pd

_FUNDING_RE = re.compile(r"\$\s*([\d,]*\.?\d+)\s*([BMK])?", re.IGNORECASE)
_UNIT_TO_MUSD = {"B": 1000, "M": 1, "K": 0.001}

_YEARS_RANGE_RE = re.compile(r"(\d{4})\s*-\s*(\d{4})")
_YEARS_PREFIX_RE = re.compile(r"^\s*(\d+)")


def parse_funding(value):
    """'$80M (Tastemade)' -> 80.0, '$1B+ (Yahoo)' -> 1000.0, '$1M (est.)' -> 1.0."""
    if pd.isna(value):
        return None
    stripped = re.sub(r"\([^)]*\)", "", str(value))
    match = _FUNDING_RE.search(stripped)
    if not match or not match.group(1):
        return None
    amount = float(match.group(1).replace(",", ""))
    unit = (match.group(2) or "M").upper()
    return amount * _UNIT_TO_MUSD[unit]


def parse_years(value):
    """'5 (2017-2022)' -> (2017, 2022, 5, False); '2012-2017' -> (2012, 2017, 5, False)."""
    if pd.isna(value):
        return (None, None, None, False)
    text = str(value)
    range_match = _YEARS_RANGE_RE.search(text)
    if not range_match:
        return (None, None, None, False)

    founded_year = int(range_match.group(1))
    shutdown_year = int(range_match.group(2))
    computed_duration = shutdown_year - founded_year

    prefix_text = text[: range_match.start()]
    prefix_match = _YEARS_PREFIX_RE.match(prefix_text)

    if prefix_match:
        stated_duration = int(prefix_match.group(1))
        duration_years = stated_duration
        duration_mismatch = stated_duration != computed_duration
    else:
        duration_years = computed_duration
        duration_mismatch = False

    return (founded_year, shutdown_year, duration_years, duration_mismatch)


def clean(df):
    df = df.copy()

    df["funding_musd"] = df["how_much_they_raised"].apply(parse_funding)

    years_parsed = df["years_of_operation"].apply(parse_years)
    df["founded_year"] = years_parsed.apply(lambda t: t[0])
    df["shutdown_year"] = years_parsed.apply(lambda t: t[1])
    df["duration_years"] = years_parsed.apply(lambda t: t[2])
    df["duration_mismatch"] = years_parsed.apply(lambda t: t[3])

    return df


if __name__ == "__main__":
    df = pd.read_csv("data/clean/startups_base.csv")
    df = clean(df)
    df.to_csv("data/clean/startups_clean.csv", index=False)

    print("null counts for funding_musd:", df["funding_musd"].isna().sum())
    print()

    mismatches = df[df["duration_mismatch"]]
    print("rows with duration_mismatch = True:", len(mismatches))
    print(
        mismatches[["name", "years_of_operation", "founded_year", "shutdown_year", "duration_years"]]
        .head(5)
        .to_string()
    )
    print()

    print("final columns:", list(df.columns))