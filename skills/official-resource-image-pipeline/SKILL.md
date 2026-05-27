---
name: official-resource-image-pipeline
description: Use when creating StarLuna/LunaBee official resource images from an idea: gather the content goal, write and review one image2 prompt, generate a versioned PNG only after approval, store the prompt manifest, upload the approved image to the UAT official-resources Supabase bucket, insert or update the curated resources row, preserve hidden prompt provenance, and verify the iOS Resources screen can view/download it.
---

# Official Resource Image Pipeline

Use this for official StarLuna/LunaBee resources that should appear in the iOS Resources screen, especially image-first PNG resources and one-page printable designs. This is a prompt-first workflow: do not generate images, PDFs, or Supabase rows until the user has approved the prompt and target metadata.

## Start

1. Read project guidance before edits: `README.md`, `CLAUDE.md`, `docs/engineering/supabase-contract.md`, and `docs/plan/resource-template-generation-pipelines.md`.
2. Ask the user what content they want to create if they did not already specify it. Capture:
   - topic/title idea
   - audience age or grade
   - desired format: PNG, one-time PDF, or reproducible template PDF
   - category slug, if known
   - app name, dynamic one-line slogan, and URL to place in the footer
3. If the user gives enough detail, choose sensible defaults:
   - app name: `LunaBee`
   - slogan: generate a short, content-specific one-line slogan that matches the resource's purpose and audience
   - URL: `starluna.app`
   - page: US Letter portrait
   - target print spec: 300 DPI, `2550 x 3300`
   - initial file format: PNG unless the user asks for PDF
4. Create one prompt and show it to the user. Stop there until they approve it.

## Prompt Rules

Prompts must be specific enough for `image2` but honest about model limits. Include the requested print size in the prompt, then verify the actual output dimensions after generation. If the model returns lower resolution, note it and keep the output as design review quality unless the user approves a final print workaround.

Every prompt should include:

- US Letter portrait or chosen page size.
- Full-page printable intent.
- Large, crisp, highly readable text.
- Important content at least 0.5 inches from the edge.
- A light footer with app name, one content-specific one-line slogan, and URL.
- Footer guidance: subtle, small, airy, not a heavy brand banner, and not visually competing with the resource itself.
- Slogan guidance: write the slogan fresh for the resource; it should be short, parent-friendly, and tied to the content, not a fixed global tagline.
- Negative constraints: no QR codes, no external logos, no watermarks, no fake app UI, no tiny decorative text, no clutter.
- Clear English unless the user asks for another language.

For child/family content, keep the tone parent-trustworthy, warm, playful, and practical. Avoid dense poster layouts when the resource is intended to be printed and read.

## Versioning and Files

Use stable versioned slugs and never overwrite older approved versions unless the user explicitly asks.

Pattern:

```text
<topic-slug>-v1.png
<topic-slug>-v2.png
```

Store local artifacts here:

```text
tools/resource-gen/prompts/approved/<slug>.json
tools/resource-gen/output/images/<category>/<slug>.png
tools/resource-gen/output/pdfs/<category>/<slug>.pdf
```

The prompt manifest should include at least:

```json
{
  "slug": "childrens-day-family-game-night-v1",
  "resource_type": "activity_recommendation",
  "category_slug": "seasonal",
  "delivery_format": "png",
  "page_size": "us_letter",
  "orientation": "portrait",
  "dpi": 300,
  "requested_pixel_size": { "width": 2550, "height": 3300 },
  "actual_pixel_size": { "width": 1103, "height": 1426 },
  "pages": 1,
  "age_range": "5-10 years",
  "subjects": ["Family Activities"],
  "difficulty": "Easy",
  "features": ["Printable one-page resource"],
  "footer_app_name": "LunaBee",
  "footer_slogan": "A content-specific one-line slogan.",
  "footer_url": "starluna.app",
  "image2_prompt": "...",
  "negative_prompt": "...",
  "review_status": "approved",
  "approval_notes": "Approved for UAT preview.",
  "intended_output_path": "tools/resource-gen/output/images/seasonal/<slug>.png",
  "created_at": "YYYY-MM-DD"
}
```

## Generate

After prompt approval, use the `image2` model to generate exactly the approved image unless the user approves prompt changes. Save the image under the versioned output path.

Validate immediately:

- `file <path>` confirms PNG/PDF type.
- Image dimensions are recorded in the manifest.
- The footer is visible but quiet and uses `LunaBee`, a content-specific slogan, and `starluna.app`.
- Text is readable enough for design review.
- The design matches the requested audience and topic.

If output quality is not acceptable, create a new version (`v2`, `v3`) and keep the previous version for comparison.

## PDF Modes

Use PNG delivery for image resources. Use PDF only when requested or when the resource should be printable/downloaded as a PDF.

For one-time static PDFs:

1. Generate one image per page with `image2`.
2. Convert image pages to PDF with Python tooling such as `img2pdf` or Pillow.
3. For multiple pages, prefer one multi-page PDF; if easier, create single-page PDFs and combine with `pypdf`.

For reproducible template PDFs:

1. Use `image2` only for the approved base template/background.
2. Define overlay coordinates for dynamic text/questions.
3. Draw deterministic content with a PDF/image library such as ReportLab/Pillow.
4. Keep the base template prompt and overlay spec together so future regenerations remain coordinated.

## UAT Supabase Upload

Backend source of truth is `/Users/sl/Projects/supabase`. The iOS repo is the consumer and should keep `docs/engineering/supabase-contract.md` in sync.

UAT project ref:

```text
ozzplxtasqeraivncmwt
```

Official resource storage bucket:

```text
official-resources
```

Use public storage paths:

```text
images/<category>/<slug>.png
pdfs/<category>/<slug>.pdf
```

For generated PNG resources, `resources.file_url` and `resources.image_url` can both point to the public object URL:

```text
https://ozzplxtasqeraivncmwt.supabase.co/storage/v1/object/public/official-resources/images/<category>/<slug>.png
```

Insert or update the `resources` row with:

- `category_id` resolved from `resource_categories.slug`
- `title`
- `description`
- `file_url`
- `image_url`
- `file_format`: `PNG` or `PDF`
- `pages`
- `age_range`
- `difficulty`
- `subjects[]`
- `features[]`
- `credits`
- `active = true`

Keep the full approved prompt out of the public iOS read model. Store it in the private backend table `resource_generation_metadata` with the resource id, slug, model (`image2`), prompt, negative prompt, requested dimensions, actual dimensions, output path, review notes, and creation metadata. This supports future semantic search, regeneration, and audit without exposing prompt internals in the app.

Schema or RLS changes belong in `/Users/sl/Projects/supabase/migrations/`. If a new schema change is needed, stop and confirm with the user before applying it.

## iOS Verification

After UAT upload and row insert, verify on iPhone simulator using accessibility-based UI testing from `docs/engineering/ui-testing-pattern.md`.

Use UAT runtime env, not local Supabase:

```text
STARLUNA_ENVIRONMENT=development
STARLUNA_AUTH_MODE=supabaseRemote
STARLUNA_DEMO_EMAIL=parent@starluna.app
STARLUNA_DEMO_PASSWORD=demo
SUPABASE_URL=https://ozzplxtasqeraivncmwt.supabase.co
SUPABASE_PUBLISHABLE_KEY=<uat publishable key>
SUPABASE_REDIRECT_URL=starluna://auth-callback
```

Expected verification:

1. Demo user signs in.
2. Resources screen is unlocked for subscribed UAT demo account.
3. The new resource appears in its category.
4. Detail sheet shows the correct format (`PNG` or `PDF`).
5. Download opens iOS Quick Look.
6. The downloaded simulator file preserves the correct extension.

If the Resources screen is still locked for the demo account, check the backend entitlement bridge first. The subscription RPC returns `is_paid`; iOS should decode that field and apply backend entitlement in addition to StoreKit transactions.

## Successful Reference Run

The first validated resource was:

```text
slug: childrens-day-family-game-night-v1
category: seasonal
format: PNG
storage: official-resources/images/seasonal/childrens-day-family-game-night-v1.png
title: Children's Day Family Game Night
age_range: 5-10 years
subjects: Family Activities, Social Skills, Creative Play
actual image: 1103 x 1426 PNG
```

The generated resource appeared in the UAT iOS Resources screen and downloaded into Quick Look as `childrens-day-family-game-night-v1.png`.
