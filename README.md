# Frame Patch Lab → Godot

A browser tool for turning a sprite sheet of ornamental UI frames into
resolution-independent, recolorable nine-patch / multi-patch frames, plus the
Godot runtime that renders them.

## The web tool

Open `index.html` (or run `server.py` for the inpainting backend). Drop a PNG
sheet in, and it detects the individual frames, finds the stretchable edge
regions, lets you tweak colors, and can inpaint the transparent centers.

### Exporting

The **Export** panel has several buttons:

| Button | Output |
| --- | --- |
| **Export All** | A single `.zip` containing everything below (recommended). |
| **PNG Sheet** | `<image>.processed.png` — the full keyed/inpainted sheet. |
| **PNG Crop** | The selected frame as its own PNG. |
| **Patch JSON** | The selected frame's `<frame>.patch.json`. |
| **All JSON** | `<image>.patches.json` — every frame in one file. |

**Use Export All.** It bundles the sheet, one crop per frame, and the combined
`patches.json` into one archive. (Earlier this fired one browser download per
file; browsers throttle download bursts, so most of the per-frame PNGs were
silently dropped — the ZIP avoids that entirely.)

## Using the frames in Godot

The runtime is `MultiPatchFrame.gd` — a `@tool extends Control` node that draws
a frame as a smart nine-patch: corners stay fixed, edges stretch/tile/mirror,
and the green/red art is recolored live by a built-in HSV shader.

> **Important:** `MultiPatchFrame` draws from the **sheet** (`*.processed.png`),
> not from the per-frame crops. Each frame's `sourceRect` indexes into the
> sheet, so feed it the sheet texture. The crop PNGs are just raw images for
> other uses.

### Setup

1. Copy `MultiPatchFrame.gd` and `MultiPatchFrameLoader.gd` into your project.
2. Import the exported `<image>.processed.png` and `<image>.patches.json`.

### Spawn a frame by name

```gdscript
var data := MultiPatchFrameLoader.load_patches("res://frames/r2.patches.json")
var sheet := load("res://frames/r2.processed.png") as Texture2D

var frame := MultiPatchFrameLoader.make_frame_by_name(sheet, data, "Frame 1")
frame.size = Vector2(300, 120)        # render at any size; edges adapt
add_child(frame)
```

### Spawn every frame

```gdscript
for frame in MultiPatchFrameLoader.load_all(
        "res://frames/r2.processed.png",
        "res://frames/r2.patches.json"):
    add_child(frame)
```

### Without the loader

```gdscript
var frame := MultiPatchFrame.new()
frame.texture = load("res://frames/r2.processed.png")
var data = JSON.parse_string(FileAccess.get_file_as_string("res://frames/r2.patches.json"))
frame.apply_patch_json(data["frames"][0])
add_child(frame)
```

A single-frame `*.patch.json` is itself a patch dictionary, so you can pass it
straight to `apply_patch_json()` / `MultiPatchFrameLoader.make_frame()`.

### Recoloring at runtime

The patch JSON carries the colors you picked in the tool, but you can override
them on the node — they drive the recolor shader:

```gdscript
frame.main_color = Color("4f8fd6")      # retint the green role
frame.main_recolor = 1.0                # 0 = original, 1 = full retint
frame.secondary_color = Color("d6b24f") # retint the red role
frame.use_role_recolor = false          # disable retinting entirely
```

### Minimum size

`MultiPatchFrame.get_minimum_size()` returns the smallest size the frame can
render without crushing its corners — useful when putting one inside a
`Container`.
