# F14 prototype hero artwork provenance

- Generation tool: built-in Codex `image_gen` tool. The tool output did not expose a model name.
- Generated: 2026-10-31.
- Use: prototype-only showcase artwork; served only through the showcase-gated route.
- Edits: generated separately in landscape and portrait; converted from the original PNG outputs to WebP with the repository's existing `sharp` dependency (quality 84, effort 6). No crop or resize was applied.
- Desktop source: `exec-16f2724d-ff96-4319-904a-8f0927bb2350.png`, 1672 × 941. Final `desktop.webp`: 1672 × 941, 142,098 bytes.
- Mobile source: `exec-43439f6e-a8ee-49d2-8de6-e2c35d8cea3c.png`, 1086 × 1448. Final `mobile.webp`: 1086 × 1448, 122,944 bytes.

## Exact desktop prompt

```text
Use case: photorealistic-natural
Asset type: background artwork for a prototype fitness registration page
Primary request: A premium, cinematic gym interior with a single large strength-training rack and a textured heavy bag or weight equipment, composed for a wide 16:9 web hero. No people.
Scene/backdrop: refined private training studio with matte graphite walls, concrete, rubber flooring, subtle structural details.
Subject: physical interest concentrated on the left 40 percent: a large sculptural squat rack with hanging plates and a heavy bag in the near foreground; no people or human silhouettes.
Style/medium: high-end editorial fitness photography, natural material detail, restrained realism.
Composition/framing: very wide landscape 16:9. Left third has an elegant, clearly readable equipment silhouette and light falloff; right 40 percent is calm, low-detail negative space with simple dark wall and faint floor only, suitable behind a UI card. No strong lines or equipment behind the right side.
Lighting/mood: dim cinematic softbox side light from upper left, controlled narrow rim highlights across metal and leather, deep shadows with retained detail; elegant, quiet, premium.
Color palette: near-monochrome charcoal and graphite, at most a faint cool-neutral cast, no saturated colors.
Materials/textures: detailed but low-noise matte concrete, brushed dark metal, subtly worn black leather, fine rubber floor.
Constraints: no text, no logos, no brand marks, no watermarks; no recognizable people, no faces, no body parts; background only, no user interface.
```

## Exact mobile prompt

```text
Use case: photorealistic-natural
Asset type: portrait background artwork for a prototype fitness registration page
Primary request: A premium cinematic gym interior with one sculptural strength-training rack and hanging heavy bag, no people, composed as a portrait 3:4 background.
Scene/backdrop: refined private training studio with matte graphite walls, concrete and rubber flooring.
Subject: physical interest is in the upper 60 percent, a large strength rack and hanging heavy bag seen from a calm slightly low angle; no people or human silhouettes.
Style/medium: high-end editorial fitness photography, natural material detail, restrained realism.
Composition/framing: vertical 3:4. The rack and bag feel prominent but remain comfortably inside the frame; keep the lower 35 percent quiet and low-detail with dark floor/wall transition for a page fade. No critical equipment clipped at the sides. No text or interface.
Lighting/mood: dim cinematic side light from high left with subtle narrow rim highlights; deep shadows but retained detail, elegant and quiet.
Color palette: near-monochrome charcoal and graphite, at most a faint cool-neutral cast, no saturated colors.
Materials/textures: matte concrete, brushed dark metal, subtly worn black leather, fine rubber floor, detailed but low-noise.
Constraints: no text, logos, brand marks, watermarks, recognizable people, faces or body parts.
```
