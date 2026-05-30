@tool
extends RefCounted
class_name MultiPatchFrameLoader

## Helper for consuming a Frame Patch Lab export (a `<image>.processed.png`
## sheet plus a `<image>.patches.json` file) and turning it into
## [MultiPatchFrame] nodes.
##
## The sheet PNG is the texture for every frame; each frame's `sourceRect`
## (stored in the JSON) selects its region out of that one sheet, so you load
## the sheet once and reuse it for all frames.
##
## Example:
## [codeblock]
## var data := MultiPatchFrameLoader.load_patches("res://frames/r2.patches.json")
## var sheet := load("res://frames/r2.processed.png") as Texture2D
## var frame := MultiPatchFrameLoader.make_frame_by_name(sheet, data, "Frame 1")
## frame.size = Vector2(300, 120)
## add_child(frame)
## [/codeblock]


## Reads and parses a `*.patches.json` file. Returns the top-level dictionary
## (with a `frames` array), or an empty dictionary on failure.
static func load_patches(json_path: String) -> Dictionary:
	if not FileAccess.file_exists(json_path):
		push_error("MultiPatchFrameLoader: file not found: %s" % json_path)
		return {}
	var text := FileAccess.get_file_as_string(json_path)
	if text.is_empty():
		push_error("MultiPatchFrameLoader: could not read %s" % json_path)
		return {}
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("MultiPatchFrameLoader: %s is not a patches.json document" % json_path)
		return {}
	return parsed


## Returns the array of per-frame patch dictionaries from a parsed document.
static func get_frames(patches: Dictionary) -> Array:
	var frames: Variant = patches.get("frames", [])
	return frames if typeof(frames) == TYPE_ARRAY else []


## Builds a single [MultiPatchFrame] from one frame's patch dictionary. The
## `patch` argument is one entry of the `frames` array, or the whole contents
## of a single-frame `*.patch.json` file.
static func make_frame(texture: Texture2D, patch: Dictionary) -> MultiPatchFrame:
	var frame := MultiPatchFrame.new()
	frame.texture = texture
	frame.apply_patch_json(patch)
	return frame


## Builds the frame whose `name` matches. Returns `null` if none match.
static func make_frame_by_name(texture: Texture2D, patches: Dictionary, frame_name: String) -> MultiPatchFrame:
	for entry: Variant in get_frames(patches):
		if typeof(entry) == TYPE_DICTIONARY and String(entry.get("name", "")) == frame_name:
			return make_frame(texture, entry)
	push_error("MultiPatchFrameLoader: no frame named '%s'" % frame_name)
	return null


## Builds the frame at `index` in the `frames` array. Returns `null` if out of range.
static func make_frame_at(texture: Texture2D, patches: Dictionary, index: int) -> MultiPatchFrame:
	var frames := get_frames(patches)
	if index < 0 or index >= frames.size():
		push_error("MultiPatchFrameLoader: frame index %d out of range (0..%d)" % [index, frames.size() - 1])
		return null
	return make_frame(texture, frames[index])


## Builds every frame in the document, in order.
static func make_all(texture: Texture2D, patches: Dictionary) -> Array[MultiPatchFrame]:
	var out: Array[MultiPatchFrame] = []
	for entry: Variant in get_frames(patches):
		if typeof(entry) == TYPE_DICTIONARY:
			out.append(make_frame(texture, entry))
	return out


## Convenience: load a sheet + patches.json in one call and return all frames.
static func load_all(sheet_path: String, json_path: String) -> Array[MultiPatchFrame]:
	var texture := load(sheet_path) as Texture2D
	if texture == null:
		push_error("MultiPatchFrameLoader: could not load sheet %s" % sheet_path)
		return []
	return make_all(texture, load_patches(json_path))
