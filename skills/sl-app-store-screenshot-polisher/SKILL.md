---
name: sl-app-store-screenshot-polisher
description: Polish raw iOS App Store screenshots into upload-ready 6.9-inch marketing screenshots using an image2-capable image editing model. Use when converting simulator/raw screenshots into App Store Connect compliant screenshots, adding tasteful captions/device/background treatment, preserving real app UI, and processing one screenshot first for review before batching the rest.
---

# App Store Screenshot Polisher

Use this skill to turn raw iPhone screenshots into polished App Store assets while keeping the real product UI truthful and legible.

## Rules

- Process **one screenshot first** and ask for review before converting the rest.
- Preserve the actual app UI. Do not invent screens, data, buttons, prices, ratings, or platform claims.
- Output the exact target canvas for App Store iPhone 6.9": **1320 x 2868 PNG**.
- Keep every important UI label readable after treatment.
- Use light, family-friendly styling that fits Luna Bee: warm, calm, practical, polished.
- Avoid dark mode, busy gradients, tiny copy, fake notification badges, and privacy-sensitive personal data.
- Use short caption copy: one clear benefit, usually 3-7 words.
- If the raw screenshot already includes device chrome, do not add a second full device frame.

## Workflow

1. Verify the input screenshot dimensions and orientation.
2. Pick one screenshot role from the App Store plan:
   - Home: family command center.
   - Worksheet: personalized learning.
   - Luna Bee chat: ask AI to add events.
   - Wonder Box: family connection.
   - Wins: challenge progress.
   - Resources: premium resources.
   - Certificate: celebrate completion.
   - Paywall: unlock more family help.
3. Draft a concise image-edit prompt for an image2-capable model.
4. Generate/edit exactly one polished PNG.
5. Validate:
   - final size is 1320 x 2868;
   - screenshot content is real and not distorted;
   - captions do not cover app UI;
   - no App Store policy-sensitive claims were introduced.
6. Show the generated image and wait for feedback before batch conversion.

## Prompt Template

```text
Create an App Store-ready iPhone 6.9-inch screenshot composition from the provided raw Luna Bee app screenshot.

Output: 1320 x 2868 PNG.

Preserve the app screenshot exactly: keep all UI, text, icons, dates, prices, and layout truthful and readable. Do not invent app features or alter the real screen contents.

Design direction: polished, warm, premium family productivity app for busy parents. Light mode only. Soft StarLuna/Luna Bee brand feel, refined typography, calm background, tasteful device/screenshot presentation.

Caption: "<CAPTION>"

Composition requirements:
- Make the real screenshot the main visual.
- Caption should be large enough for App Store browsing but must not cover important app UI.
- Add subtle depth/background treatment only; no clutter, no fake UI, no extra badges.
- Keep safe margins for App Store cropping and phone notches.
- The result should feel professionally designed, not like a raw simulator screenshot.
```

## Validation Checklist

- [ ] PNG is 1320 x 2868.
- [ ] Raw app UI remains accurate and legible.
- [ ] Caption is short and benefit-led.
- [ ] Visual style is light, warm, and consistent with Luna Bee.
- [ ] No unsupported claims such as "best", "#1", guaranteed results, or medical/educational outcomes.
- [ ] Only one screenshot was generated unless the user explicitly approved batch processing.
