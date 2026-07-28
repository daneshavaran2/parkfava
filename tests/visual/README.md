# Visual Regression

Pixel-diff smoke tests for the exhibition surfaces. Runs against a live dev
server on `http://localhost:8080` and compares screenshots to committed
baselines in `tests/visual/baseline/`.

## Coverage

| Route                                 | 320 | 375 | 414 | 768 | 1024 | 1280 |
| ------------------------------------- | :-: | :-: | :-: | :-: | :--: | :--: |
| `/exhibition` → first company profile |  ✓  |  ✓  |  ✓  |  ✓  |  ✓   |  ✓   |
| First product detail page             |  ✓  |  ✓  |  ✓  |  ✓  |  ✓   |  ✓   |

- **320 (`mobile-xs`)** — کف پشتیبانی (iPhone SE 1st gen، Android low-end). زیر breakpoint `sm` تیلویند؛ رگرشن overflow افقی را می‌گیرد.
- **375 (`mobile`) / 414 (`mobile-lg`)** — دو گلاس اصلی iPhone استاندارد و Plus/Pro Max.
- **768 (`tablet`, mobile/tablet breakpoint)** — دقیقاً روی breakpoint `md:` تیلویند. رگرشن‌های سوییچ single-column → two-column در گرید ادمین و پروفایل شرکت، و همچنین باز/بسته شدن ناوبری موبایل، در این عرض ظاهر می‌شوند. کاور هر دو مسیر company و product الزامی است.
- **1024 (`tablet-lg`)** — iPad landscape؛ مرز بین tablet و desktop، جایی که grid از دو به سه ستون می‌رود.
- **1280 (`desktop`)** — layout پیش‌فرض دسکتاپ.


## Running

```bash
bun dev                    # in one terminal
bun run test:visual        # in another
```

Failures produce a diff PNG under `tests/visual/diff/`. In CI, that directory
is uploaded as an artifact so reviewers can eyeball the regression.

## Updating baselines

After an intentional visual change:

```bash
UPDATE_BASELINE=1 bun run test:visual
```

Review the diff visually in your commit, then include the updated PNGs in
the same PR as the code change. A baseline update without an accompanying
code change is a code-review smell.

## Tolerance

We tolerate up to **1%** of pixels differing per screenshot to absorb
font-hinting and anti-alias jitter between local machines and CI runners.
Larger differences fail the run.
