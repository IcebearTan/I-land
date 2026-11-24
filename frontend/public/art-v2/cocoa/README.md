# Cocoa art add-on

`cocoa-art-1.0.0` · `warm-drink-03` · 2026-11-07 · Requires accepted `art-v2.1.0`.

Load the independent `atlas.png` / `atlas.json` using key `cocoa-art`, with `manifest.json` as the authoritative interface. Individual original-resolution PNGs are in `frames/`. Existing characters/home atlases, their manifest and map are not replaced.

All actor layers remain 32×32, origin `(0.5,0.90625)`, foot anchor `(16,29)`, sprite scale 1. Each action has body, hands and complete-pose frames. Workstation rendering must put body behind the counter and hands above it. Cup frames are separate and use the action's explicit grip point and horizontal-flip flag. The receive pose is empty-handed until confirmed acceptance.

The package contains 62 action keyframes × 3 layers plus 50 day/night prop frames: 236 atlas entries in total. Counter geometry, workstations, stand points and paired action positions are relative proposals. No absolute room placement or demonstration characters are baked into prop resources.

Use service-confirmed participants, operations, cup ownership and social events. Animations never advance gameplay or transfer ownership by themselves. Reduced-motion mappings are supplied; steam stays at constant opacity 0.8.

Editable source and illustrated notes: `docs/planning/designs/cocoa-03-art/`. Frozen handoff: `docs/planning/evaluations/warm-drink-03/art/READY.json`. No delivery hashes or checksums are generated.
