# CF-3D-02 — P1 Pitch Motion Prototype

This is a review-only continuation of CF-3D-01. `render_p1_pitch.gd` is copied from the CF-3D-01 master and retains the exact same `make_p1()` geometry, camera, origin, target canvas, and lighting setup. Only the capture pose changes.

## Captures

| Output | Pitch | Root rotation |
| --- | ---: | --- |
| `p1-pitch-up.png` | +10° | X = +10°, Y = 0°, Z = 0° |
| `p1-neutral.png` | 0° | X = 0°, Y = 0°, Z = 0° |
| `p1-pitch-down.png` | -10° | X = -10°, Y = 0°, Z = 0° |

The aircraft lateral wing-to-wing axis is X; its screen-up nose is `-Z`. Yaw is therefore held at zero in all captures.

## Shared CF-3D-01 capture values

- Projection: orthographic
- Camera position: `(0, 6.8, 4.8)`
- Orthographic size: `5.5`
- Origin / model pivot: `(0, 0, 0)`
- Canvas: 512×512 RGBA, transparent
- Key light: fixed directional rotation `(-52°, 36°, 0°)`, fixed ambient fill

## Validation

1. **Same model:** all three poses call the unchanged `make_p1()` master geometry; there are no pose-specific meshes.
2. **No geometry or pilot-scale drift:** one P1 root is reused sequentially; only `model.rotation.x` changes. Pilot, cat head, ears, cockpit and propeller remain model-local children.
3. **Heading / yaw:** `rotation.y` is hard-set to zero; the `-Z` nose remains screen-up.
4. **Subtle pitch:** +10° / -10° remain within the requested test band and retain a top-down shooter read.
5. **Camera / light / pivot:** capture setup is copied unchanged from CF-3D-01; no pose modifies it.
6. **Clipping:** visual inspection of the 512×512 renders found no canvas-edge clipping.

Re-render:

```zsh
'/Applications/Godot.app/Contents/MacOS/Godot' --rendering-method gl_compatibility --path assets/art-review/CF-3D-02 --script res://render_p1_pitch.gd
```
