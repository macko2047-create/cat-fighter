# CF-3D-01 — P1 3D Motion Prototype

This review-only prototype renders one reusable P1 mesh in three poses: Normal, Roll Left, and Roll Right. It does not modify game code or gameplay.

## Invariants encoded in `render_p1_prototype.gd`

- Single `P1_Master_Geometry` model: no per-pose geometry or pilot changes.
- Fixed orthographic camera at `(0, 6.8, 4.8)`, orthographic size `5.5`.
- Shared origin `(0, 0, 0)` and 512×512 transparent canvas.
- Nose axis is `-Z` (screen-up). Poses change only root `rotation.z` (`0°`, `-42°`, `+42°`): no yaw.
- One fixed directional key from the upper-right plus fixed ambient fill.
- Propeller hub/disc remains at the same model-local nose origin.

## Files

- `p1-normal.png`
- `p1-roll-left.png`
- `p1-roll-right.png`
- `p1-motion-review.png` — the three transparent renders side-by-side on a neutral review background.

## Validation

1. **Identity:** all three renders are from `make_p1()`; colour roles, paw marks, propeller disc, fighter silhouette and pilot are shared.
2. **Geometry / pilot stability:** there is one `P1_Master_Geometry` instance, so poses cannot introduce independent geometry or pilot-scale edits.
3. **Heading:** the model nose is fixed on `-Z`, which projects screen-up. The pose function changes no yaw component.
4. **Roll without 2D rotation:** only the aircraft's longitudinal roll component is changed (`rotation.z`); the camera, its orthographic scale and image canvas are never changed. Wing foreshortening and light response make the roll observable.
5. **Lighting:** one key light is created once at `(-52°, 36°, 0°)` and remains untouched during all three captures.
6. **Framing / pivot:** each capture uses the shared world origin, 512×512 target, and the same camera at `(0, 6.8, 4.8)` with orthographic size `5.5`.

Re-render with:

```zsh
'/Applications/Godot.app/Contents/MacOS/Godot' --rendering-method gl_compatibility --path assets/art-review/CF-3D-01 --script res://render_p1_prototype.gd
```
