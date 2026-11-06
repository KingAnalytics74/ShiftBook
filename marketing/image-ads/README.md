# Shiftbuck image ads

Four still ads, each in two sizes, showing the real app with example figures:

| Ad | Square for feeds (1080×1080) | Vertical for Stories and Reels (1080×1920) | Message |
|---|---|---|---|
| Know your pay | `shiftbuck-pay-1x1.png` | `shiftbuck-pay-9x16.png` | Gross pay for the month, £2,915, before payday |
| Payslip check | `shiftbuck-payslip-1x1.png` | `shiftbuck-payslip-9x16.png` | The payslip check catching £45 not paid |
| Any shift | `shiftbuck-shifts-1x1.png` | `shiftbuck-shifts-9x16.png` | Your own shift types, and a waking night at a £14.50 night rate paying £174 |
| Rest check | `shiftbuck-rest-1x1.png` | `shiftbuck-rest-9x16.png` | "Not resting enough" after 7 days in a row |

Each one ends on "Free for UK care workers" and **shiftbuck.com**, with "Example figures shown." The example carer, Ada, and her service users are made up (`source/seed.js`). On the vertical size, text stays clear of the bottom and right edges, where apps put their buttons.

Run all four as one campaign at first, so the platform shows people the one that works best.

## Captions

**Know your pay**
> See what every shift pays as you log it, sleep-ins included, and know your pay before payday. Free for UK care workers. shiftbuck.com
> #carers #supportworker #carework #ukcarers

**Payslip check**
> Was your payslip short? Log your shifts in Shiftbuck and it checks your payslip against them. Free for UK care workers. shiftbuck.com
> #carers #supportworker #payslip #ukcarers

**Any shift**
> Long days, waking nights, sleep-ins, weekends: set up your own shifts and rates, and see what each one pays. Free for UK care workers. shiftbuck.com
> #carers #supportworker #nightshift #ukcarers

**Rest check**
> 7 days in a row with no day off? Shiftbuck warns you when you're not resting enough, using UK working time rules. Free for UK care workers. shiftbuck.com
> #carers #supportworker #selfcare #ukcarers

The same claims rules apply as for the video ads (`../video-ads/README.md`): keep "Free for UK care workers" true while they run, and don't claim more than the app does.

## Re-render them

You need Node and Playwright with Chromium. From the repository root:

```
python3 -m http.server 8776
node marketing/image-ads/source/capture.js   # refresh the app screens (runs the app in demo mode with seed.js)
node marketing/image-ads/source/render.js    # writes all eight PNGs
```

Wording, crops and highlights are in `source/ads.html` (`ADS`).
