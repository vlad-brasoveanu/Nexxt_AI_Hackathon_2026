"""Render realistic synthetic Romanian SME onboarding PDFs and load them into the live API.

All companies, people and identifiers are fictional and every page is marked as synthetic.
Requires Google Chrome for PDF rendering.

    .venv/bin/python scripts/demo                # render PDFs + seed cases
    .venv/bin/python scripts/demo --render-only
    .venv/bin/python scripts/demo --ai           # facts proposed by the AI provider, then confirmed
"""
import argparse

from render import render_all
from seeder import seed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--username", default="manager")
    parser.add_argument("--password", default="12345")
    parser.add_argument("--render-only", action="store_true")
    parser.add_argument("--ai", action="store_true", help="propose facts with the configured AI provider instead of the known values")
    args = parser.parse_args()
    plan = render_all()
    if args.render_only:
        return
    seed(plan, args.url, args.username, args.password, use_ai=args.ai)


if __name__ == "__main__":
    main()
