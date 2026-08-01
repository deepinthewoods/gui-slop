# Frame Patch Lab → Godot

A browser tool for turning a sprite sheet of ornamental UI frames into
resolution-independent, recolorable nine-patch / multi-patch frames, plus the
Godot runtime that renders them.

## The web tool

Open `index.html` (or run `server.py` for the inpainting backend). Drop a PNG
sheet in, and it detects the individual frames, finds the stretchable edge
regions, lets you tweak colors, and can inpaint the transparent centers.
When using the local server, the image dropdown discovers PNGs in the project
root automatically. Files sharing a base plus a final letter or digit (such as
`clover_a.png` / `clover_b.png` or `roots1.png` / `roots2.png`) appear as one
family and load together as a composed sheet. **Match series saturation** is on
by default: it measures the coloured opaque pixels in each member and raises
less-saturated members to the strongest member's level before composing them.

### Slice Wizard

Select a frame and click **Wizard** to compare a 5×3 generation of 15 slice
settings. Every square option contains a large resized frame with one naturally
sized minimum diagnostic nested inside it. The diagnostic follows the current
Ctrl state, so it redraws without fixed medallions while Ctrl is held.
The candidates mix scan thresholds, long/short
repeat chunks, seam-optimized boundary searches, and tile/stretch/mirror
rendering modes.

- Left-click an option to accept it immediately and advance to the next frame.
  The wizard closes after the final frame. Each accepted area's geometry,
  controls, and rendering mode are retained per frame when selecting sprites on
  the source sheet later.
- Hold **Shift** to reveal T/B/L/R boxes just outside every option. Choose one
  source for each side—sources may come from four different options—and the
  fourth choice assembles, accepts, and advances. Side geometry, repeat runs,
  fixed medallions, rendering modes, and ready provisional inpainting are mixed
  independently. Hold **Ctrl+Shift** while choosing a side to keep that side's
  medallions permanently hidden in the assembled patch; its selected box is
  shown struck through. Once a side is selected, its boxes are hidden on every
  other option and remain visible only on its selected option for unselecting.
  Selected sides survive **Fresh 15**, **Long 15**, and
  **Breed Selected**; the live **L R T B** legend shows which sides are already
  locked, including selections from an earlier generation.
- **Open in Editor** opens that candidate in the normal Areas editor without
  accepting it. Drag or resize its repeat regions, then click **Return to
  Wizard** to accept the edited candidate, promote its provisional inpainting,
  and continue to the next frame.
- Right-click one or more promising options and choose **Breed Selected** to
  keep those parents and fill the grid with mutated children. Press **Space**
  to trigger the same action from anywhere in the wizard.
- Hold **Ctrl** to preview every candidate without its fixed medallion runs;
  release it to restore the medallions. **Ctrl-click** a full option to accept it
  with medallions permanently disabled on all four sides.
- Wizard previews always enable **Center medallions**. Automatic wizard
  detection now looks directly for prominent side features instead of relying
  only on gaps between repeat runs. Enable **Max medallions** to cap the number
  detected on each usable side; a side may contain fewer, and a value of 0
  disables wizard medallions. Repeat regions split and rebalance around any
  detected ornaments.
- **Clear Selected** removes the current breeding-parent marks and mixed-side
  choices; **Escape** is its keyboard shortcut.
- **Fresh 15** explores another random generation; **Backspace** is its
  keyboard shortcut.
- **Long 15** (or **L**) explores randomly positioned repeat regions constrained
  to at least 30% of each usable side. Every batch is randomly shuffled while
  deliberately covering the full 30–100% length range; each card's badge shows
  the actual final run length. Inside/outside inpaint distances are randomized
  independently. Patch Strong runs provisionally in the background and each card
  redraws with its inpainted pixels when ready. These pixels remain local to the
  candidate until it is accepted. Closing and reopening the wizard resumes the
  same generation, kept parents, and edited candidates; provisional processing
  is regenerated as needed. Accepting promotes the exact preview patches to the
  processed sheet. This requires the local `server.py` backend and G'MIC.
- **0.5× / 1× / 2× / 4×** changes preview magnification. At 1×, each
  render pixel maps to one CSS screen pixel; the square tiles stay the same
  responsive size at every setting.

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
