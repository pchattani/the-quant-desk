# The Quant Desk

The public dashboard of every systematic macro strategy on this research
platform, categorised by style, in the Quant Macro family's design. Built by
`scripts/build_desk_site.py`; served by GitHub Pages from
`pchattani/the-quant-desk`.

    uv run python scripts/build_desk_site.py        # runs every strategy, writes this folder
    uv run python scripts/deploy_desk_site.py       # mirrors this folder into the public repo

`index.html` loads `assets/` and reads `data/*.json`; one file per data block,
one per strategy under `data/strategy/`. Nothing here references the private
code or the data stores; the page carries its own data. `data/dbmf_raw.json` is
the builder's cache of the benchmark proxy and is not published.

The daily job is `scripts/run_desk_daily.ps1` (Norgate prices, the carry panel,
the Kraken perpetuals, the build, the publish), registered as a scheduled task
by `scripts/register_desk_task.ps1`.
