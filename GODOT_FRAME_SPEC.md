# Spec: rendering "transparent-edge frame" assets in Godot

## What this is

I have a browser tool that analyzes a PNG sprite of an **ornamented UI frame/panel**
(think fantasy-game border with gems/medallions on the edges and decorative corners)
and exports JSON describing how to **redraw that frame at any arbitrary size without
distorting the ornaments**. It's an "extended nine-slice": corners stay fixed, edges
have a mix of *stretchable* strips and *fixed* ornaments (medallions), and the center
is transparent (it's where panel content goes).

I need a Godot `Control` (or drawing routine) that consumes this JSON + the source
texture and draws the frame at a requested `(width, height)`.

## Coordinate conventions

- The source art lives in one texture (an atlas/sprite sheet).
- `sourceRect = [x, y, w, h]` is the frame's rectangle **within the source texture**
  (absolute, in source pixels).
- **Every other rect** in the file (`[x, y, w, h]`) is in **frame-relative** pixels —
  origin at the frame's top-left, i.e. relative to `sourceRect`'s origin. To sample the
  texture, add `sourceRect.x/y`.
- Sides: `top` and `bottom` are **horizontal** edges (they stretch along the **x** axis).
  `left` and `right` are **vertical** edges (stretch along **y**). The file calls this
  each side's `axis` (`"x"` or `"y"`).

## The export format

```jsonc
{
  "format": "transparent-edge-frame",
  "version": 1,
  "name": "...",
  "sourceRect": [x, y, w, h],          // frame within the source texture
  "transparentCenter": [x, y, w, h],   // the hole; content area
  "backgroundRect": [x, y, w, h],      // full transparent extent (may sit under ornaments)
  "insideRect": [x, y, w, h],          // content-safe rect (won't collide with frame)
  "centerMedallions": true,            // layout flag — see algorithm below
  "areas": {
    "top":    { "source": [x,y,w,h], "axis": "x", "mode": "stretch",
                "tileRuns": [[x,y,w,h], ...],     // optional
                "fixedRuns": [[x,y,w,h], ...] },  // optional (medallions on this edge)
    "bottom": { ... "axis": "x" ... },
    "left":   { ... "axis": "y" ... },
    "right":  { ... "axis": "y" ... },
    "corners": {
      "topLeft": [x,y,w,h], "topRight": [x,y,w,h],
      "bottomLeft": [x,y,w,h], "bottomRight": [x,y,w,h]
    },
    "medallions": { "top": [x,y,w,h], ... }  // representative single ornament per side (optional)
  }
}
```

Field meaning:
- **`areas.<side>.source`** — the full source strip for that edge (between the corners).
- **`fixedRuns`** — rectangles on the edge that must be drawn **at native size, never
  stretched** (the medallions/gems/ornaments). Exported expanded to their full
  cross-thickness so they can overhang the thin edge strip. May be absent.
- **`tileRuns`** — sub-rectangles of the edge that should **repeat (tile)** rather than
  smooth-stretch, when `mode` is a tiling mode. May be absent.
- **`corners`** — drawn at fixed native size, one per corner, never scaled.
- **`mode`** — how stretchable regions fill space: `"stretch"` (smooth scale),
  `"tile"` (repeat), `"mirror"` (repeat, alternating flipped), `"tile_stretch"`
  (repeat an integer number of times, lightly scaling tiles to fit exactly).

## The layout / draw algorithm

Given a target size `(W, H)`:

1. **Draw the 4 corners** at their native size into the four corners of the target rect.
   The corners' widths/heights define the edge insets.

2. **For each edge**, you have a length to fill = target dimension minus the two corner
   sizes along that axis (W minus left/right corner widths for top/bottom; H minus
   top/bottom corner heights for left/right).

3. **Split the edge into an alternating sequence of segments** along its axis:
   - **`fixed` segments** = the `fixedRuns` (medallions). They render at **native source
     size** (never scaled along the axis).
   - **`flex` segments** = the gaps between/around the fixed runs. These absorb all the
     stretching/tiling, using `mode`.

4. **Distribute the leftover space** (target length − sum of fixed-segment native sizes)
   among the `flex` segments by a **weight**:
   - **`centerMedallions == false`:** weight = the flex segment's **source size**.
     (Bigger source region grabs proportionally more stretch — this is the natural
     default, but it lets medallions drift off-center when the slices around them differ
     in size.)
   - **`centerMedallions == true`:** **every flex segment gets equal weight.** So the
     stretch is split evenly on each side of a fixed run, which keeps a medallion
     centered regardless of the source slice sizes. (With multiple medallions, this
     spaces them evenly.)
   - Formula: `flexDestSize_i = remaining * (weight_i / sum_of_flex_weights)`.
   - Edge case: if the target length is smaller than the sum of fixed sizes, scale
     everything down proportionally instead.

5. **Render each segment** into its computed destination rectangle:
   - `fixed` → draw the medallion's source rect into its dest (size preserved along the
     axis; the cross axis maps proportionally so overhanging ornaments scale with edge
     thickness).
   - `flex` → fill per `mode`: smooth-stretch the source strip, or tile/mirror the
     `tileRuns` that fall inside this segment.

6. **Center** (`transparentCenter`) is left transparent; panel content goes there. Use
   `insideRect` as the content-safe inner bounds (margins for a child container).

## Godot implementation notes

- Godot's built-in `NinePatchRect` is **not enough** — it only does 3×3 with a single
  stretchable middle and can't keep mid-edge ornaments unscaled. Implement a custom
  `Control` with a `_draw()` override.
- Load the source texture once. For each piece, draw with
  `draw_texture_rect_region(texture, dest_rect: Rect2, src_rect: Rect2)` (src in absolute
  texture coords = frame-relative rect + `sourceRect` origin). For tiling/mirror, loop
  and optionally flip via negative-size `Rect2` or `draw_texture_rect` with flip flags.
- Call `queue_redraw()` on resize.
- The `colors`/`alpha` blocks (if present) describe an optional recolor: two source roles
  (green/red channels) tinted toward target colors — implement only if you need runtime
  recoloring, otherwise ignore.

The single most important behavior to get right is **step 4** — that weight distribution,
and honoring `centerMedallions` to keep ornaments centered.
