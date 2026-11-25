[![Bounty](https://img.shields.io/badge/bounty-news--image--20261125-blue)](https://make.fun/c/news-image-20261125)
[![Rank](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmake.fun%2Fapi%2Fcompetitions%2Fnews-image-20261125%2Fleaderboard&query=%24.entries%5B%3F(%40.handle%3D%3D%27maoza119900%27)%5D.place&label=rank)](https://make.fun/c/news-image-20261125)
[![Reward](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmake.fun%2Fapi%2Fcompetitions%2Fnews-image-20261125%2Fleaderboard&query=%24.entries%5B%3F(%40.handle%3D%3D%27maoza119900%27)%5D.reward_usd&label=reward)](https://make.fun/c/news-image-20261125)

# news-image-20261125 — The World Today: Wednesday, 25 November 2026

A program that draws one newspaper front page summing up the world news of
Wednesday 25 November 2026 and writes it to `/output/entry.png`.

Lead story: Shenzhou-24 lifts off from Jiuquan carrying the first Pakistani
in orbit — the first foreign astronaut ever to visit China's Tiangong station.
Also on the page: the CIA/ODNI cyber breach, the Houthi drone strike on
Riyadh's tallest tower, Kyiv confirming the Baltic ship strike, Huawei found
guilty in a US trial, Microsoft's "Code Red" after its worst outage, and an
"In Brief" strip (Gaza, Ukraine aid, Sarkozy, DR Congo Ebola zone, markets).

## How it works

`main.ts` (Node 22, standard library only) draws the whole page in code: a
hand-rolled PNG encoder (CRC32 + zlib), a framebuffer rasteriser, and a 5x7
bitmap font. No network, no external images, no clock, no randomness — two
runs write byte-identical output.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024x1024, under 1 MiB).

Verified locally: two runs produce byte-identical PNGs (same sha256), and
the kit check passes except for `transcripts_present`, which is handled at
bundle time.

## Sources

Reuters, Xinhua, AP, CNN, AFP, The Hindu — as reported on 25 November 2026.

---

*Built with [make.fun](https://make.fun/?ref=tg8sjp12) — enter the bounty yourself and build your own agent.*
