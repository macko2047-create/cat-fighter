# CF-3D-04 — P1 Visual Fidelity Pass

This is the CF-3D-03 production master after a visual-only fidelity pass against the approved P1 2D Normal reference at `../CF-L1-ART-02/p1-normal-master.png`. It does not modify gameplay or game integration.

## Deliverables

- `p1_production_master.gd` — one shared, named-component P1 master with rounded layered fuselage, thick elliptical wing halves, tapered tail, recessed cockpit, seated big-head orange tabby pilot, cowling-connected propeller, integrated gun mounts and restrained paw marks.
- `render_p1_production.gd` — builds precisely one master instance and sequentially captures all five poses.
- `p1-normal.png`, `p1-roll-left.png`, `p1-roll-right.png`, `p1-pitch-up.png`, `p1-pitch-down.png` — 512×512 RGBA transparent renders.
- `p1-production-review.png` — five-pose review sheet.
- `p1-gameplay-size-preview.png` — five 72×72 inspection cells on a non-production, neutral sea-like review background.

## Locked capture values (unchanged from CF-3D-03)

| Setting | Exact value |
| --- | --- |
| Projection / camera position | Orthographic / `(0, 6.8, 4.8)` |
| Camera target and model pivot | `(0, 0, 0)` |
| Orthographic size / source canvas | `5.5` / 512×512 transparent RGBA |
| Model heading | local `-Z`, screen-up |
| Key light | directional `(-52°, 36°, 0°)`, `#fff1d4`, energy `2.0` |
| Ambient fill | `#6f8293`, energy `0.45` |
| Normal | X `0°`, Y `0°`, Z `0°` |
| Roll Left / Right | X `0°`, Y `0°`, Z `-28°` / `+28°` |
| Pitch Up / Down | X `+10°` / `-10°`, Y `0°`, Z `0°` |

## Visual improvements

- Replaced the block-like body with overlapping rounded fuselage volumes: compact core, forward blend, red cowling, metal ring and nose cone make a coherent nose-to-tail taper.
- Replaced flat rectangular wing and tail blocks with thick, overlapping elliptical forms. Wing tips now overlap the silver wing surface as painted red caps, while the wide wing-root blends preserve Roll foreshortening.
- Recessed the dark cockpit and added a rim, seat back and scarf so the pilot is visibly seated. The pilot head remains deliberately oversized (`0.76 × 0.54 × 0.69`) with two ears and fixed rear tabby stripes.
- Reduced and nested the propeller blur disc at the cowling axis; hub, cap and disc share the same local nose origin.
- Tuned metallic / roughness values to give the fixed upper-right light readable silver volume rather than changing the light rig.

## Short 2D comparison

The approved illustration has a more hand-drawn, almost vertical wing planform and a clearer black-and-red striped canopy. This 3D master now matches its primary read — silver/red prop fighter, broad rounded wings, rear/top oversized orange tabby head, paw marks and a compact arcade silhouette — while retaining true wing thickness and 3D curvature for locked Roll and Pitch validation. It intentionally remains a simplified low/medium-complexity model: no micro-rivets, painted panel texture, or baked shadow have been added.

## Validation

1. All five captures reuse one `P1ProductionMaster` instance; no pose-specific geometry or pilot scaling exists.
2. Yaw is hard-set to zero. Roll changes Z only; Pitch changes X only.
3. Camera, pivot, orthographic size, global light, canvas size and transparent background are assigned once and never modified by pose capture.
4. The five-pose review shows clear ±28° Roll wing foreshortening / light response and subtle ±10° Pitch; no image edge clipping is visible.
5. The 72px preview retains the orange head and ears as the primary identity cue, with silver/red separation, readable wing span, restrained propeller and non-cluttered paw marks.

## Re-render

```zsh
'/Applications/Godot.app/Contents/MacOS/Godot' --rendering-method gl_compatibility --path assets/art-review/CF-3D-04 --script res://render_p1_production.gd
```
