# Project: Startup Post-Mortem Matching Tool

## What we're building
A tool that matches failed/struggling startups against a base dataset of
historical startup outcomes, surfacing similar prior post-mortems to draw
lessons from.

## Data
- **Base dataset**: CB Insights Kaggle dataset, 483 companies (startup
  outcomes / post-mortems).
- **Enrichment**: handled by a separate backend component — an automated
  scraper that augments the base dataset with additional fields.

## Roles
- **Backend**: owns the enrichment scraper.
- **Me (this workspace)**: cleaning, matching, and analysis.

## Folder structure
- `data/raw/` — untouched source data (base Kaggle dataset, raw scraper output)
- `data/clean/` — cleaned/normalized data ready for matching
- `data/enriched/` — enriched data (post backend scraper + any joins)
- `src/` — cleaning, matching, and analysis code

## Stack
pandas, numpy, requests, beautifulsoup4, sentence-transformers