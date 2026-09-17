# CF-3D-03 — P1 Production 3D Master

This folder is the reusable, production-grade P1 source. It replaces the CF-3D-01/02 blockout while retaining their validated coordinate system, camera, world lighting, transparent 512×512 capture and fixed pivot.

## Deliverables

- `p1_production_master.gd` — one named-component Godot 3D master: fuselage, main wings, tailplane, vertical tail, cockpit, propeller hub/disc, guns, seat, upper body, oversized tabby head/ears and tail.
- `render_p1_production.gd` — creates exactly one master instance and captures every pose from it.
- `p1-normal.png`, `p1-roll-left.png`, `p1-roll-right.png`, `p1-pitch-up.png`, `p1-pitch-down.png` — transparent production renders.
- `p1-production-review.png` — five-pose comparison sheet.
- `p1-gameplay-size-preview.png` — five 72×72 gameplay-size checks on a neutral sea-like review background; it is not a production sprite.

## Locked capture values

| Setting | Exact value |
| --- | --- |
| Projection | Orthographic |
| Camera position | `(0, 6.8, 4.8)` |
| Camera target / model pivot | `(0, 0, 0)` |
| Orthographic size | `5.5` |
| Source canvas | 512×512 RGBA, transparent |
| Longitudinal / nose axis | local `-Z`, screen-up |
| Key light | directional, rotation `(-52°, 36°, 0°)`, `#fff1d4`, energy `2.0` |
| Ambient fill | `#6f8293`, energy `0.45` |

## Exact poses

| Render | Root rotation `(X pitch, Y yaw, Z roll)` |
| --- | --- |
| Normal | `(0°, 0°, 0°)` |
| Roll Left | `(0°, 0°, -28°)` |
| Roll Right | `(0°, 0°, +28°)` |
| Pitch Up | `(+10°, 0°, 0°)` |
| Pitch Down | `(-10°, 0°, 0°)` |

The pilot, camera, light and model-local propeller origin never change between captures. There are no pose meshes, 2D rotations, yaw poses, baked backgrounds or baked drop shadows.

## Re-render

```zsh
'/Applications/Godot.app/Contents/MacOS/Godot' --rendering-method gl_compatibility --path assets/art-review/CF-3D-03 --script res://render_p1_production.gd
```

## Validation checklist

1. One `P1ProductionMaster` instance is sequentially reused for all five captures.
2. The orange tabby head, ears, upper body and tail are model-local, fixed-scale components.
3. Nose remains local `-Z` / screen-up; roll uses only `Z`, pitch uses only subtle `X`, and yaw is always zero.
4. Camera, target, orthographic scale, pivot and both lighting values are set once and never changed by capture code.
5. Each output uses the same 512px transparent frame; no world shadow is rendered.
6. The model leaves safe transparent margins in the fixed 512px frame; review the generated five-pose sheet and 72px preview after each source revision.
