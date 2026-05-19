@tool
extends Control
class_name MultiPatchFrame

const ROLE_RECOLOR_SHADER := """
shader_type canvas_item;

uniform vec4 main_color : source_color = vec4(0.41, 0.72, 0.37, 1.0);
uniform float main_recolor = 0.0;
uniform float main_desaturate = 0.0;
uniform vec4 secondary_color : source_color = vec4(0.79, 0.36, 0.36, 1.0);
uniform float secondary_recolor = 0.0;
uniform float secondary_desaturate = 0.0;

vec3 rgb2hsv(vec3 c) {
	vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
	vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
	vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
	float d = q.x - min(q.w, q.y);
	float e = 0.00001;
	return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 adjust_role(vec3 color, vec3 target_color, float recolor, float desaturate) {
	vec3 source_hsv = rgb2hsv(color);
	vec3 target_hsv = rgb2hsv(target_color);
	vec3 tinted = hsv2rgb(vec3(target_hsv.x, target_hsv.y, source_hsv.z));
	vec3 adjusted = mix(color, tinted, recolor);
	float gray = dot(adjusted, vec3(0.2126, 0.7152, 0.0722));
	return mix(adjusted, vec3(gray), desaturate);
}

void fragment() {
	vec4 tex = texture(TEXTURE, UV);
	vec3 hsv = rgb2hsv(tex.rgb);
	float saturated = step(0.12, hsv.y);
	float main_role = saturated * step(0.16, hsv.x) * (1.0 - step(0.50, hsv.x)) * step(tex.r * 1.04, tex.g) * step(tex.b * 1.04, tex.g);
	float red_hue = max(1.0 - step(0.08, hsv.x), step(0.92, hsv.x));
	float secondary_role = saturated * red_hue * step(tex.g * 1.04, tex.r) * step(tex.b * 1.04, tex.r) * (1.0 - main_role);
	vec3 adjusted = tex.rgb;
	adjusted = mix(adjusted, adjust_role(adjusted, main_color.rgb, main_recolor, main_desaturate), main_role);
	adjusted = mix(adjusted, adjust_role(adjusted, secondary_color.rgb, secondary_recolor, secondary_desaturate), secondary_role);
	COLOR = vec4(adjusted, tex.a);
}
"""

var _role_material: ShaderMaterial

@export var texture: Texture2D:
	set(value):
		texture = value
		queue_redraw()

@export var source_rect: Rect2i:
	set(value):
		source_rect = value
		queue_redraw()

@export var columns: PackedInt32Array = PackedInt32Array([0, 24, 48, 72, 96, 120]):
	set(value):
		columns = value
		queue_redraw()

@export var rows: PackedInt32Array = PackedInt32Array([0, 24, 48, 72, 96, 120]):
	set(value):
		rows = value
		queue_redraw()

@export_enum("tile", "stretch") var rail_mode: String = "tile":
	set(value):
		rail_mode = value
		queue_redraw()

@export var transparent_center: Rect2i:
	set(value):
		transparent_center = value
		queue_redraw()

@export var edge_top: Rect2i:
	set(value):
		edge_top = value
		queue_redraw()

@export var edge_bottom: Rect2i:
	set(value):
		edge_bottom = value
		queue_redraw()

@export var edge_left: Rect2i:
	set(value):
		edge_left = value
		queue_redraw()

@export var edge_right: Rect2i:
	set(value):
		edge_right = value
		queue_redraw()

@export var medallion_top: Rect2i:
	set(value):
		medallion_top = value
		queue_redraw()

@export var medallion_bottom: Rect2i:
	set(value):
		medallion_bottom = value
		queue_redraw()

@export var medallion_left: Rect2i:
	set(value):
		medallion_left = value
		queue_redraw()

@export var medallion_right: Rect2i:
	set(value):
		medallion_right = value
		queue_redraw()

var edge_top_tile_runs: Array[Rect2i] = []
var edge_bottom_tile_runs: Array[Rect2i] = []
var edge_left_tile_runs: Array[Rect2i] = []
var edge_right_tile_runs: Array[Rect2i] = []
var edge_top_fixed_runs: Array[Rect2i] = []
var edge_bottom_fixed_runs: Array[Rect2i] = []
var edge_left_fixed_runs: Array[Rect2i] = []
var edge_right_fixed_runs: Array[Rect2i] = []

@export_enum("tile", "stretch", "mirror") var edge_mode: String = "stretch":
	set(value):
		edge_mode = value
		queue_redraw()

@export var main_color: Color = Color(0.41, 0.72, 0.37, 1.0):
	set(value):
		main_color = value
		queue_redraw()

@export_range(0.0, 1.0, 0.01) var main_recolor := 0.0:
	set(value):
		main_recolor = value
		queue_redraw()

@export_range(0.0, 1.0, 0.01) var main_desaturate := 0.0:
	set(value):
		main_desaturate = value
		queue_redraw()

@export var secondary_color: Color = Color(0.79, 0.36, 0.36, 1.0):
	set(value):
		secondary_color = value
		queue_redraw()

@export_range(0.0, 1.0, 0.01) var secondary_recolor := 0.0:
	set(value):
		secondary_recolor = value
		queue_redraw()

@export_range(0.0, 1.0, 0.01) var secondary_desaturate := 0.0:
	set(value):
		secondary_desaturate = value
		queue_redraw()

@export var use_role_recolor := true:
	set(value):
		use_role_recolor = value
		queue_redraw()


func _ready() -> void:
	resized.connect(queue_redraw)


func _draw() -> void:
	if texture == null:
		return
	_update_role_material()
	if _has_edge_format():
		_draw_edge_frame(size)
	elif columns.size() == 6 and rows.size() == 6:
		_draw_multi_patch(size)


func get_minimum_size() -> Vector2:
	if _has_edge_format():
		var bands := _edge_render_bands()
		var corners := _corner_source_areas(bands)
		var top_left: Rect2i = corners["top_left"]
		var top_right: Rect2i = corners["top_right"]
		var bottom_left: Rect2i = corners["bottom_left"]
		var bottom_right: Rect2i = corners["bottom_right"]
		var min_w := maxi(int(bands["left"]) + int(bands["right"]), maxi(top_left.size.x + top_right.size.x, bottom_left.size.x + bottom_right.size.x))
		var min_h := maxi(int(bands["top"]) + int(bands["bottom"]), maxi(top_left.size.y + bottom_left.size.y, top_right.size.y + bottom_right.size.y))
		return Vector2(float(min_w), float(min_h))
	if columns.size() != 6 or rows.size() != 6:
		return Vector2.ZERO
	var fixed_width := columns[1] + (columns[3] - columns[2]) + (columns[5] - columns[4])
	var fixed_height := rows[1] + (rows[3] - rows[2]) + (rows[5] - rows[4])
	return Vector2(fixed_width, fixed_height)


func apply_patch_json(data: Dictionary) -> void:
	if data.has("sourceRect"):
		var r: Array = data["sourceRect"]
		source_rect = Rect2i(int(r[0]), int(r[1]), int(r[2]), int(r[3]))
	if data.has("transparentCenter"):
		transparent_center = _rect_from_array(data["transparentCenter"])
	if data.has("areas"):
		var areas: Dictionary = data["areas"]
		edge_top = _edge_source_rect(areas, "top", edge_top)
		edge_bottom = _edge_source_rect(areas, "bottom", edge_bottom)
		edge_left = _edge_source_rect(areas, "left", edge_left)
		edge_right = _edge_source_rect(areas, "right", edge_right)
		edge_top_tile_runs = _edge_tile_runs(areas, "top")
		edge_bottom_tile_runs = _edge_tile_runs(areas, "bottom")
		edge_left_tile_runs = _edge_tile_runs(areas, "left")
		edge_right_tile_runs = _edge_tile_runs(areas, "right")
		edge_top_fixed_runs = _edge_fixed_runs(areas, "top")
		edge_bottom_fixed_runs = _edge_fixed_runs(areas, "bottom")
		edge_left_fixed_runs = _edge_fixed_runs(areas, "left")
		edge_right_fixed_runs = _edge_fixed_runs(areas, "right")
		if areas.has("top"):
			var top_data: Dictionary = areas["top"]
			edge_mode = String(top_data.get("mode", edge_mode))
		if areas.has("medallions"):
			var medallions: Dictionary = areas["medallions"]
			medallion_top = _optional_rect_from_dict(medallions, "top")
			medallion_bottom = _optional_rect_from_dict(medallions, "bottom")
			medallion_left = _optional_rect_from_dict(medallions, "left")
			medallion_right = _optional_rect_from_dict(medallions, "right")
		else:
			medallion_top = Rect2i()
			medallion_bottom = Rect2i()
			medallion_left = Rect2i()
			medallion_right = Rect2i()
	if data.has("colors"):
		var colors: Dictionary = data["colors"]
		if colors.has("main"):
			var main: Dictionary = colors["main"]
			main_color = Color.html(String(main.get("color", "#68b85f")))
			main_recolor = float(main.get("recolor", main_recolor))
			main_desaturate = float(main.get("desaturate", main_desaturate))
		if colors.has("secondary"):
			var secondary: Dictionary = colors["secondary"]
			secondary_color = Color.html(String(secondary.get("color", "#c95b5b")))
			secondary_recolor = float(secondary.get("recolor", secondary_recolor))
			secondary_desaturate = float(secondary.get("desaturate", secondary_desaturate))
	if data.has("grid"):
		var grid: Dictionary = data["grid"]
		columns = PackedInt32Array(grid.get("columns", columns))
		rows = PackedInt32Array(grid.get("rows", rows))
	if data.has("legacyGrid"):
		var legacy_grid: Dictionary = data["legacyGrid"]
		columns = PackedInt32Array(legacy_grid.get("columns", columns))
		rows = PackedInt32Array(legacy_grid.get("rows", rows))
	if data.has("rails"):
		var rails: Dictionary = data["rails"]
		var preferred := String(rails.get("preferredMode", rail_mode))
		rail_mode = "stretch" if preferred == "stretch" else "tile"
	if data.has("legacyRails"):
		var legacy_rails: Dictionary = data["legacyRails"]
		var legacy_preferred := String(legacy_rails.get("preferredMode", rail_mode))
		rail_mode = "stretch" if legacy_preferred == "stretch" else "tile"
	queue_redraw()


func _update_role_material() -> void:
	if not use_role_recolor:
		if material == _role_material:
			material = null
		return
	if _role_material == null:
		var shader := Shader.new()
		shader.code = ROLE_RECOLOR_SHADER
		_role_material = ShaderMaterial.new()
		_role_material.shader = shader
	if material == null or material == _role_material:
		material = _role_material
	_role_material.set_shader_parameter("main_color", main_color)
	_role_material.set_shader_parameter("main_recolor", main_recolor)
	_role_material.set_shader_parameter("main_desaturate", main_desaturate)
	_role_material.set_shader_parameter("secondary_color", secondary_color)
	_role_material.set_shader_parameter("secondary_recolor", secondary_recolor)
	_role_material.set_shader_parameter("secondary_desaturate", secondary_desaturate)


func _has_edge_format() -> bool:
	return transparent_center.size.x > 0 and transparent_center.size.y > 0


func _rect_from_array(value: Variant) -> Rect2i:
	var values: Array = value
	return Rect2i(int(values[0]), int(values[1]), int(values[2]), int(values[3]))


func _edge_source_rect(areas: Dictionary, key: String, fallback: Rect2i) -> Rect2i:
	if not areas.has(key):
		return fallback
	var area: Dictionary = areas[key]
	if not area.has("source"):
		return fallback
	return _rect_from_array(area["source"])


func _edge_tile_runs(areas: Dictionary, key: String) -> Array[Rect2i]:
	var out: Array[Rect2i] = []
	if not areas.has(key):
		return out
	var area: Dictionary = areas[key]
	if not area.has("tileRuns"):
		return out
	var runs: Array = area["tileRuns"]
	for run: Variant in runs:
		out.append(_rect_from_array(run))
	return out


func _edge_fixed_runs(areas: Dictionary, key: String) -> Array[Rect2i]:
	var out: Array[Rect2i] = []
	if not areas.has(key):
		return out
	var area: Dictionary = areas[key]
	if not area.has("fixedRuns"):
		return out
	var runs: Array = area["fixedRuns"]
	for run: Variant in runs:
		out.append(_rect_from_array(run))
	return out


func _optional_rect_from_dict(data: Dictionary, key: String) -> Rect2i:
	if not data.has(key):
		return Rect2i()
	return _rect_from_array(data[key])


func _draw_edge_frame(target_size: Vector2) -> void:
	var bands := _edge_render_bands()
	var left := float(bands["left"])
	var top := float(bands["top"])
	var right := float(bands["right"])
	var bottom := float(bands["bottom"])
	var center_w := float(maxi(1, source_rect.size.x - int(left) - int(right)))
	var center_h := float(maxi(1, source_rect.size.y - int(top) - int(bottom)))
	var src_widths := [left, center_w, right]
	var src_heights := [top, center_h, bottom]
	var dst_widths := _destination_sizes(src_widths, [0, 2], target_size.x)
	var dst_heights := _destination_sizes(src_heights, [0, 2], target_size.y)
	var dst_x := _cumulative(dst_widths)
	var dst_y := _cumulative(dst_heights)
	var corners := _corner_source_areas(bands)
	var corner_dests := _corner_dest_rects(corners, target_size)
	var mode := edge_mode

	var top_area := _edge_side_render_area(edge_top, "top", corners)
	var bottom_area := _edge_side_render_area(edge_bottom, "bottom", corners)
	var left_area := _edge_side_render_area(edge_left, "left", corners)
	var right_area := _edge_side_render_area(edge_right, "right", corners)
	_draw_segmented_edge_region(top_area, _fixed_runs_with_medallion(edge_top_fixed_runs, medallion_top), edge_top_tile_runs, _side_dest_rect(top_area, "top", dst_x, dst_y, dst_widths, dst_heights, bands, corner_dests, target_size), true, false, mode)
	_draw_segmented_edge_region(bottom_area, _fixed_runs_with_medallion(edge_bottom_fixed_runs, medallion_bottom), edge_bottom_tile_runs, _side_dest_rect(bottom_area, "bottom", dst_x, dst_y, dst_widths, dst_heights, bands, corner_dests, target_size), true, false, mode)
	_draw_segmented_edge_region(left_area, _fixed_runs_with_medallion(edge_left_fixed_runs, medallion_left), edge_left_tile_runs, _side_dest_rect(left_area, "left", dst_x, dst_y, dst_widths, dst_heights, bands, corner_dests, target_size), false, true, mode)
	_draw_segmented_edge_region(right_area, _fixed_runs_with_medallion(edge_right_fixed_runs, medallion_right), edge_right_tile_runs, _side_dest_rect(right_area, "right", dst_x, dst_y, dst_widths, dst_heights, bands, corner_dests, target_size), false, true, mode)

	_draw_region_if_valid(_source_rect(corners["top_left"]), corner_dests["top_left"])
	_draw_region_if_valid(_source_rect(corners["top_right"]), corner_dests["top_right"])
	_draw_region_if_valid(_source_rect(corners["bottom_left"]), corner_dests["bottom_left"])
	_draw_region_if_valid(_source_rect(corners["bottom_right"]), corner_dests["bottom_right"])


func _edge_render_bands() -> Dictionary:
	var left := maxi(transparent_center.position.x, edge_left.end.x)
	var right := maxi(source_rect.size.x - transparent_center.end.x, source_rect.size.x - edge_right.position.x)
	var top := maxi(transparent_center.position.y, edge_top.end.y)
	var bottom := maxi(source_rect.size.y - transparent_center.end.y, source_rect.size.y - edge_bottom.position.y)
	var horizontal := _fit_band_pair(left, right, source_rect.size.x)
	var vertical := _fit_band_pair(top, bottom, source_rect.size.y)
	return {
		"left": horizontal.x,
		"right": horizontal.y,
		"top": vertical.x,
		"bottom": vertical.y,
	}


func _fit_band_pair(start: int, end: int, total: int) -> Vector2i:
	var max_total := maxi(0, total - 1)
	var a := clampi(start, 0, max_total)
	var b := clampi(end, 0, max_total)
	if a + b <= max_total:
		return Vector2i(a, b)
	var scale := float(max_total) / float(maxi(1, a + b))
	a = int(floor(float(a) * scale))
	b = maxi(0, max_total - a)
	return Vector2i(a, b)


func _corner_source_areas(bands: Dictionary) -> Dictionary:
	var top_end := clampi(edge_top.end.x, 0, source_rect.size.x)
	var bottom_end := clampi(edge_bottom.end.x, 0, source_rect.size.x)
	var left_end := clampi(edge_left.end.y, 0, source_rect.size.y)
	var right_end := clampi(edge_right.end.y, 0, source_rect.size.y)
	var top_left_w := clampi(edge_top.position.x, 0, source_rect.size.x)
	var bottom_left_w := clampi(edge_bottom.position.x, 0, source_rect.size.x)
	var top_left_h := clampi(edge_left.position.y, 0, source_rect.size.y)
	var top_right_h := clampi(edge_right.position.y, 0, source_rect.size.y)
	if edge_top.size.x <= 0:
		top_left_w = int(bands["left"])
		top_end = source_rect.size.x - int(bands["right"])
	if edge_bottom.size.x <= 0:
		bottom_left_w = int(bands["left"])
		bottom_end = source_rect.size.x - int(bands["right"])
	if edge_left.size.y <= 0:
		top_left_h = int(bands["top"])
		left_end = source_rect.size.y - int(bands["bottom"])
	if edge_right.size.y <= 0:
		top_right_h = int(bands["top"])
		right_end = source_rect.size.y - int(bands["bottom"])
	return {
		"top_left": Rect2i(0, 0, top_left_w, top_left_h),
		"top_right": Rect2i(top_end, 0, source_rect.size.x - top_end, top_right_h),
		"bottom_left": Rect2i(0, left_end, bottom_left_w, source_rect.size.y - left_end),
		"bottom_right": Rect2i(bottom_end, right_end, source_rect.size.x - bottom_end, source_rect.size.y - right_end),
	}


func _corner_dest_rects(corners: Dictionary, target_size: Vector2) -> Dictionary:
	var top_left: Rect2i = corners["top_left"]
	var top_right: Rect2i = corners["top_right"]
	var bottom_left: Rect2i = corners["bottom_left"]
	var bottom_right: Rect2i = corners["bottom_right"]
	var top_scale := minf(1.0, target_size.x / float(maxi(1, top_left.size.x + top_right.size.x)))
	var bottom_scale := minf(1.0, target_size.x / float(maxi(1, bottom_left.size.x + bottom_right.size.x)))
	var left_scale := minf(1.0, target_size.y / float(maxi(1, top_left.size.y + bottom_left.size.y)))
	var right_scale := minf(1.0, target_size.y / float(maxi(1, top_right.size.y + bottom_right.size.y)))
	var top_left_dst := Rect2(0.0, 0.0, float(top_left.size.x) * top_scale, float(top_left.size.y) * left_scale)
	var top_right_dst := Rect2(target_size.x - float(top_right.size.x) * top_scale, 0.0, float(top_right.size.x) * top_scale, float(top_right.size.y) * right_scale)
	var bottom_left_dst := Rect2(0.0, target_size.y - float(bottom_left.size.y) * left_scale, float(bottom_left.size.x) * bottom_scale, float(bottom_left.size.y) * left_scale)
	var bottom_right_dst := Rect2(target_size.x - float(bottom_right.size.x) * bottom_scale, target_size.y - float(bottom_right.size.y) * right_scale, float(bottom_right.size.x) * bottom_scale, float(bottom_right.size.y) * right_scale)
	return {
		"top_left": top_left_dst,
		"top_right": top_right_dst,
		"bottom_left": bottom_left_dst,
		"bottom_right": bottom_right_dst,
	}


func _edge_side_render_area(area: Rect2i, side: String, corners: Dictionary) -> Rect2i:
	var middle: Rect2i
	if side == "top":
		var top_left: Rect2i = corners["top_left"]
		var top_right: Rect2i = corners["top_right"]
		middle = Rect2i(top_left.end.x, area.position.y, maxi(1, top_right.position.x - top_left.end.x), area.size.y)
	elif side == "bottom":
		var bottom_left: Rect2i = corners["bottom_left"]
		var bottom_right: Rect2i = corners["bottom_right"]
		middle = Rect2i(bottom_left.end.x, area.position.y, maxi(1, bottom_right.position.x - bottom_left.end.x), area.size.y)
	elif side == "left":
		var left_top: Rect2i = corners["top_left"]
		var left_bottom: Rect2i = corners["bottom_left"]
		middle = Rect2i(area.position.x, left_top.end.y, area.size.x, maxi(1, left_bottom.position.y - left_top.end.y))
	else:
		var right_top: Rect2i = corners["top_right"]
		var right_bottom: Rect2i = corners["bottom_right"]
		middle = Rect2i(area.position.x, right_top.end.y, area.size.x, maxi(1, right_bottom.position.y - right_top.end.y))
	var clipped := _rect_intersection(area, middle)
	return clipped if clipped.size.x > 0 and clipped.size.y > 0 else area


func _side_dest_rect(area: Rect2i, side: String, dst_x: Array, dst_y: Array, dst_widths: Array, dst_heights: Array, bands: Dictionary, corner_dests: Dictionary, target_size: Vector2) -> Rect2:
	if side == "top":
		var top_y := _map_fixed_axis(area.position.y, area.size.y, 0, int(bands["top"]), dst_y[0], dst_heights[0])
		var top_left: Rect2 = corner_dests["top_left"]
		var top_right: Rect2 = corner_dests["top_right"]
		return Rect2(top_left.size.x, top_y.x, maxf(0.0, target_size.x - top_left.size.x - top_right.size.x), top_y.y)
	if side == "bottom":
		var bottom_y := _map_fixed_axis(area.position.y, area.size.y, source_rect.size.y - int(bands["bottom"]), int(bands["bottom"]), dst_y[2], dst_heights[2])
		var bottom_left: Rect2 = corner_dests["bottom_left"]
		var bottom_right: Rect2 = corner_dests["bottom_right"]
		return Rect2(bottom_left.size.x, bottom_y.x, maxf(0.0, target_size.x - bottom_left.size.x - bottom_right.size.x), bottom_y.y)
	if side == "left":
		var left_x := _map_fixed_axis(area.position.x, area.size.x, 0, int(bands["left"]), dst_x[0], dst_widths[0])
		var left_top: Rect2 = corner_dests["top_left"]
		var left_bottom: Rect2 = corner_dests["bottom_left"]
		return Rect2(left_x.x, left_top.size.y, left_x.y, maxf(0.0, target_size.y - left_top.size.y - left_bottom.size.y))
	var right_x := _map_fixed_axis(area.position.x, area.size.x, source_rect.size.x - int(bands["right"]), int(bands["right"]), dst_x[2], dst_widths[2])
	var right_top: Rect2 = corner_dests["top_right"]
	var right_bottom: Rect2 = corner_dests["bottom_right"]
	return Rect2(right_x.x, right_top.size.y, right_x.y, maxf(0.0, target_size.y - right_top.size.y - right_bottom.size.y))


func _map_fixed_axis(source_start: int, source_size: int, band_start: int, band_size: int, dest_start: float, dest_size: float) -> Vector2:
	if band_size <= 0:
		return Vector2(dest_start, maxf(0.0, dest_size))
	var scale := dest_size / float(band_size)
	return Vector2(dest_start + float(source_start - band_start) * scale, float(source_size) * scale)


func _fixed_runs_with_medallion(runs: Array[Rect2i], medallion: Rect2i) -> Array[Rect2i]:
	var out: Array[Rect2i] = []
	for run: Rect2i in runs:
		if run.size.x > 0 and run.size.y > 0:
			out.append(run)
	if out.is_empty() and medallion.size.x > 0 and medallion.size.y > 0:
		out.append(medallion)
	return out


func _draw_segmented_edge_region(area: Rect2i, fixed_runs: Array[Rect2i], tile_runs: Array[Rect2i], dst: Rect2, tile_x: bool, tile_y: bool, mode: String) -> void:
	if area.size.x <= 0 or area.size.y <= 0 or dst.size.x <= 0.0 or dst.size.y <= 0.0:
		return

	var axis_x := tile_x
	var normalized_fixed := _normalize_fixed_runs(area, fixed_runs, axis_x)
	if normalized_fixed.is_empty():
		_draw_edge_region(area, dst, tile_x, tile_y, mode, tile_runs)
		return

	var segments := _edge_segments(area, normalized_fixed, axis_x)
	var sizes := _edge_segment_dest_sizes(segments, dst.size.x if axis_x else dst.size.y, axis_x)
	var position := dst.position.x if axis_x else dst.position.y
	for i in range(segments.size()):
		var segment: Dictionary = segments[i]
		var segment_rect: Rect2i = segment["rect"]
		var size := float(sizes[i])
		if size <= 0.0:
			continue
		if axis_x:
			if bool(segment["fixed"]):
				var cross_y := _map_sub_axis(segment_rect.position.y, segment_rect.size.y, area.position.y, area.size.y, dst.position.y, dst.size.y)
				_draw_region_if_valid(_source_rect(segment_rect), Rect2(position, cross_y.x, size, cross_y.y))
			else:
				_draw_edge_region(segment_rect, Rect2(position, dst.position.y, size, dst.size.y), tile_x, tile_y, mode, _clip_tile_runs_to_area(tile_runs, segment_rect))
		else:
			if bool(segment["fixed"]):
				var cross_x := _map_sub_axis(segment_rect.position.x, segment_rect.size.x, area.position.x, area.size.x, dst.position.x, dst.size.x)
				_draw_region_if_valid(_source_rect(segment_rect), Rect2(cross_x.x, position, cross_x.y, size))
			else:
				_draw_edge_region(segment_rect, Rect2(dst.position.x, position, dst.size.x, size), tile_x, tile_y, mode, _clip_tile_runs_to_area(tile_runs, segment_rect))
		position += size


func _normalize_fixed_runs(area: Rect2i, runs: Array[Rect2i], axis_x: bool) -> Array[Rect2i]:
	var clipped: Array[Rect2i] = []
	for run: Rect2i in runs:
		var rect := _rect_intersection(run, area)
		if rect.size.x > 0 and rect.size.y > 0:
			clipped.append(rect)
	_sort_rects_by_axis(clipped, axis_x)
	var merged: Array[Rect2i] = []
	for rect: Rect2i in clipped:
		if merged.is_empty():
			merged.append(rect)
			continue
		var previous := merged[merged.size() - 1]
		if _rect_axis_start(rect, axis_x) <= _rect_axis_end(previous, axis_x) + 1:
			merged[merged.size() - 1] = _rect_union(previous, rect)
		else:
			merged.append(rect)
	return merged


func _sort_rects_by_axis(rects: Array[Rect2i], axis_x: bool) -> void:
	for i in range(1, rects.size()):
		var item := rects[i]
		var j := i - 1
		while j >= 0 and _rect_axis_start(rects[j], axis_x) > _rect_axis_start(item, axis_x):
			rects[j + 1] = rects[j]
			j -= 1
		rects[j + 1] = item


func _edge_segments(area: Rect2i, fixed_runs: Array[Rect2i], axis_x: bool) -> Array:
	var source_start := _rect_axis_start(area, axis_x)
	var source_end := _rect_axis_end(area, axis_x)
	var segments: Array = []
	var cursor := source_start
	for fixed: Rect2i in fixed_runs:
		var fixed_start := clampi(_rect_axis_start(fixed, axis_x), source_start, source_end)
		var fixed_end := clampi(_rect_axis_end(fixed, axis_x), fixed_start, source_end)
		if fixed_end <= fixed_start:
			continue
		if fixed_start > cursor:
			segments.append({"fixed": false, "rect": _rect_from_axis_span(area, axis_x, cursor, fixed_start)})
		segments.append({"fixed": true, "rect": _rect_from_axis_span(fixed, axis_x, fixed_start, fixed_end)})
		cursor = maxi(cursor, fixed_end)
	if cursor < source_end:
		segments.append({"fixed": false, "rect": _rect_from_axis_span(area, axis_x, cursor, source_end)})
	return segments


func _edge_segment_dest_sizes(segments: Array, dest_axis_size: float, axis_x: bool) -> Array:
	var out: Array = []
	var source_sizes: Array = []
	var fixed_total := 0.0
	var flex_total := 0.0
	for segment: Dictionary in segments:
		var rect: Rect2i = segment["rect"]
		var source_size := float(maxi(0, _rect_axis_end(rect, axis_x) - _rect_axis_start(rect, axis_x)))
		source_sizes.append(source_size)
		if bool(segment["fixed"]):
			fixed_total += source_size
		else:
			flex_total += maxf(source_size, 1.0)
	if dest_axis_size <= 0.0:
		for _segment: Dictionary in segments:
			out.append(0.0)
		return out
	if flex_total <= 0.0 or dest_axis_size <= fixed_total:
		var scale_total := fixed_total
		if scale_total <= 0.0:
			for size: float in source_sizes:
				scale_total += size
		var scale := dest_axis_size / scale_total if scale_total > 0.0 else 0.0
		for size: float in source_sizes:
			out.append(size * scale)
		return out
	var remaining := maxf(0.0, dest_axis_size - fixed_total)
	for i in range(segments.size()):
		var segment: Dictionary = segments[i]
		var source_size: float = source_sizes[i]
		if bool(segment["fixed"]):
			out.append(source_size)
		else:
			out.append(remaining * (maxf(source_size, 1.0) / flex_total))
	return out


func _rect_axis_start(rect: Rect2i, axis_x: bool) -> int:
	return rect.position.x if axis_x else rect.position.y


func _rect_axis_end(rect: Rect2i, axis_x: bool) -> int:
	return rect.end.x if axis_x else rect.end.y


func _rect_from_axis_span(rect: Rect2i, axis_x: bool, start: int, end: int) -> Rect2i:
	if axis_x:
		return Rect2i(start, rect.position.y, end - start, rect.size.y)
	return Rect2i(rect.position.x, start, rect.size.x, end - start)


func _rect_union(a: Rect2i, b: Rect2i) -> Rect2i:
	var x := mini(a.position.x, b.position.x)
	var y := mini(a.position.y, b.position.y)
	var x2 := maxi(a.end.x, b.end.x)
	var y2 := maxi(a.end.y, b.end.y)
	return Rect2i(x, y, x2 - x, y2 - y)


func _draw_split_edge_region(area: Rect2i, medallion: Rect2i, tile_runs: Array[Rect2i], dst: Rect2, tile_x: bool, tile_y: bool, mode: String) -> void:
	if area.size.x <= 0 or area.size.y <= 0 or dst.size.x <= 0.0 or dst.size.y <= 0.0:
		return
	if medallion.size.x <= 0 or medallion.size.y <= 0:
		_draw_edge_region(area, dst, tile_x, tile_y, mode, tile_runs)
		return

	var axis_x := tile_x
	var source_start := float(area.position.x if axis_x else area.position.y)
	var source_end := float(area.end.x if axis_x else area.end.y)
	var medal_start := clampf(float(medallion.position.x if axis_x else medallion.position.y), source_start, source_end)
	var medal_end := clampf(float(medallion.end.x if axis_x else medallion.end.y), medal_start, source_end)
	if medal_end <= medal_start:
		_draw_edge_region(area, dst, tile_x, tile_y, mode, tile_runs)
		return

	var before_source := maxf(0.0, medal_start - source_start)
	var after_source := maxf(0.0, source_end - medal_end)
	var medal_source_size := maxf(1.0, medal_end - medal_start)
	var dst_axis_size := dst.size.x if axis_x else dst.size.y
	var medal_dst_size := minf(dst_axis_size, medal_source_size)
	var stretch_dst_size := maxf(0.0, dst_axis_size - medal_dst_size)
	var source_run_total := before_source + after_source
	if source_run_total <= 0.0:
		source_run_total = 1.0
	var before_dst := stretch_dst_size * (before_source / source_run_total)
	var after_dst := stretch_dst_size - before_dst

	if axis_x:
		var medal_cross_y := _map_sub_axis(medallion.position.y, medallion.size.y, area.position.y, area.size.y, dst.position.y, dst.size.y)
		if before_source > 0.0 and before_dst > 0.0:
			var before_area_x := Rect2i(area.position.x, area.position.y, int(before_source), area.size.y)
			_draw_edge_region(before_area_x, Rect2(dst.position.x, dst.position.y, before_dst, dst.size.y), tile_x, tile_y, mode, _clip_tile_runs_to_area(tile_runs, before_area_x))
		if after_source > 0.0 and after_dst > 0.0:
			var after_area_x := Rect2i(int(medal_end), area.position.y, int(after_source), area.size.y)
			_draw_edge_region(after_area_x, Rect2(dst.position.x + before_dst + medal_dst_size, dst.position.y, after_dst, dst.size.y), tile_x, tile_y, mode, _clip_tile_runs_to_area(tile_runs, after_area_x))
		_draw_region_if_valid(_source_rect(medallion), Rect2(dst.position.x + before_dst, medal_cross_y.x, medal_dst_size, medal_cross_y.y))
	else:
		var medal_cross_x := _map_sub_axis(medallion.position.x, medallion.size.x, area.position.x, area.size.x, dst.position.x, dst.size.x)
		if before_source > 0.0 and before_dst > 0.0:
			var before_area_y := Rect2i(area.position.x, area.position.y, area.size.x, int(before_source))
			_draw_edge_region(before_area_y, Rect2(dst.position.x, dst.position.y, dst.size.x, before_dst), tile_x, tile_y, mode, _clip_tile_runs_to_area(tile_runs, before_area_y))
		if after_source > 0.0 and after_dst > 0.0:
			var after_area_y := Rect2i(area.position.x, int(medal_end), area.size.x, int(after_source))
			_draw_edge_region(after_area_y, Rect2(dst.position.x, dst.position.y + before_dst + medal_dst_size, dst.size.x, after_dst), tile_x, tile_y, mode, _clip_tile_runs_to_area(tile_runs, after_area_y))
		_draw_region_if_valid(_source_rect(medallion), Rect2(medal_cross_x.x, dst.position.y + before_dst, medal_cross_x.y, medal_dst_size))


func _map_sub_axis(source_start: int, source_size: int, parent_start: int, parent_size: int, dest_start: float, dest_size: float) -> Vector2:
	if parent_size <= 0:
		return Vector2(dest_start, maxf(0.0, dest_size))
	var scale := dest_size / float(parent_size)
	return Vector2(dest_start + float(source_start - parent_start) * scale, float(source_size) * scale)


func _source_rect(local_rect: Rect2i) -> Rect2:
	return Rect2(
		Vector2(source_rect.position.x + local_rect.position.x, source_rect.position.y + local_rect.position.y),
		Vector2(local_rect.size.x, local_rect.size.y)
	)


func _draw_edge_region(local_rect: Rect2i, dst: Rect2, tile_x: bool, tile_y: bool, mode: String, tile_runs: Array[Rect2i] = []) -> void:
	var src := _source_rect(local_rect)
	if src.size.x <= 0.0 or src.size.y <= 0.0 or dst.size.x <= 0.0 or dst.size.y <= 0.0:
		return
	if mode == "stretch":
		draw_texture_rect_region(texture, dst, src)
	elif tile_runs.size() > 0:
		_draw_tiled_runs(tile_runs, dst, tile_x, tile_y, mode == "mirror")
	else:
		_draw_tiled_region(src, dst, tile_x, tile_y, mode == "mirror")


func _draw_region_if_valid(src: Rect2, dst: Rect2) -> void:
	if src.size.x <= 0.0 or src.size.y <= 0.0 or dst.size.x <= 0.0 or dst.size.y <= 0.0:
		return
	draw_texture_rect_region(texture, dst, src)


func _draw_multi_patch(target_size: Vector2) -> void:
	var src_widths := _slice_sizes(columns)
	var src_heights := _slice_sizes(rows)
	var dst_widths := _destination_sizes(src_widths, [0, 2, 4], target_size.x)
	var dst_heights := _destination_sizes(src_heights, [0, 2, 4], target_size.y)
	var dst_x := _cumulative(dst_widths)
	var dst_y := _cumulative(dst_heights)

	for row in range(5):
		for col in range(5):
			if not (row == 0 or row == 4 or col == 0 or col == 4):
				continue
			var src := Rect2(
				source_rect.position.x + columns[col],
				source_rect.position.y + rows[row],
				src_widths[col],
				src_heights[row]
			)
			var dst := Rect2(dst_x[col], dst_y[row], dst_widths[col], dst_heights[row])
			if src.size.x <= 0.0 or src.size.y <= 0.0 or dst.size.x <= 0.0 or dst.size.y <= 0.0:
				continue
			var horizontal_rail := (row == 0 or row == 4) and (col == 1 or col == 3)
			var vertical_rail := (col == 0 or col == 4) and (row == 1 or row == 3)
			if rail_mode == "tile" and (horizontal_rail or vertical_rail):
				_draw_tiled_region(src, dst, horizontal_rail, vertical_rail)
			else:
				draw_texture_rect_region(texture, dst, src)


func _slice_sizes(values: PackedInt32Array) -> Array:
	var out: Array = []
	for i in range(values.size() - 1):
		out.append(float(values[i + 1] - values[i]))
	return out


func _destination_sizes(src_sizes: Array, fixed_indexes: Array, target: float) -> Array:
	var out: Array = []
	out.resize(src_sizes.size())
	out.fill(0.0)
	var fixed_total := 0.0
	for i in fixed_indexes:
		fixed_total += src_sizes[i]
	if target <= fixed_total:
		if fixed_total <= 0.0:
			return out
		var scale := target / fixed_total
		for i in fixed_indexes:
			out[i] = src_sizes[i] * scale
		return out

	for i in fixed_indexes:
		out[i] = src_sizes[i]
	var run_total := 0.0
	for i in range(src_sizes.size()):
		if not fixed_indexes.has(i):
			run_total += maxf(src_sizes[i], 1.0)
	var used := fixed_total
	for i in range(src_sizes.size()):
		if fixed_indexes.has(i):
			continue
		out[i] = (target - fixed_total) * (maxf(src_sizes[i], 1.0) / run_total)
		used += out[i]
	return out


func _cumulative(values: Array) -> Array:
	var out: Array = [0.0]
	for value in values:
		out.append(out.back() + value)
	return out


func _clip_tile_runs_to_area(runs: Array[Rect2i], area: Rect2i) -> Array[Rect2i]:
	var out: Array[Rect2i] = []
	for run: Rect2i in runs:
		var clipped := _rect_intersection(run, area)
		if clipped.size.x > 0 and clipped.size.y > 0:
			out.append(clipped)
	return out


func _rect_intersection(a: Rect2i, b: Rect2i) -> Rect2i:
	var x := maxi(a.position.x, b.position.x)
	var y := maxi(a.position.y, b.position.y)
	var x2 := mini(a.end.x, b.end.x)
	var y2 := mini(a.end.y, b.end.y)
	if x2 <= x or y2 <= y:
		return Rect2i()
	return Rect2i(x, y, x2 - x, y2 - y)


func _draw_tiled_runs(runs: Array[Rect2i], dst: Rect2, tile_x: bool, tile_y: bool, mirror := false) -> void:
	var valid_runs: Array[Rect2i] = []
	for run: Rect2i in runs:
		if run.size.x > 0 and run.size.y > 0:
			valid_runs.append(run)
	if valid_runs.is_empty():
		return

	var horizontal := tile_x
	var dst_start := dst.position.x if horizontal else dst.position.y
	var dst_end := dst.end.x if horizontal else dst.end.y
	var position := dst_start
	var tile_index := 0
	while position < dst_end - 0.01:
		var run := valid_runs[tile_index % valid_runs.size()]
		var step := float(run.size.x if horizontal else run.size.y)
		if step <= 0.0:
			break
		var draw_size := minf(step, dst_end - position)
		var source_size := minf(step, draw_size)
		var source_rect := _source_rect(run)
		if horizontal:
			if mirror and tile_index % 2 == 1:
				source_rect.position.x = float(source_rect.end.x) - source_size
				source_rect.size.x = source_size
				draw_set_transform(Vector2(position + draw_size, dst.position.y), 0.0, Vector2(-1.0, 1.0))
				draw_texture_rect_region(texture, Rect2(0.0, 0.0, draw_size, dst.size.y), source_rect)
				draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			else:
				source_rect.size.x = source_size
				draw_texture_rect_region(texture, Rect2(position, dst.position.y, draw_size, dst.size.y), source_rect)
		else:
			if mirror and tile_index % 2 == 1:
				source_rect.position.y = float(source_rect.end.y) - source_size
				source_rect.size.y = source_size
				draw_set_transform(Vector2(dst.position.x, position + draw_size), 0.0, Vector2(1.0, -1.0))
				draw_texture_rect_region(texture, Rect2(0.0, 0.0, dst.size.x, draw_size), source_rect)
				draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			else:
				source_rect.size.y = source_size
				draw_texture_rect_region(texture, Rect2(dst.position.x, position, dst.size.x, draw_size), source_rect)
		position += draw_size
		tile_index += 1


func _draw_tiled_region(src: Rect2, dst: Rect2, tile_x: bool, tile_y: bool, mirror := false) -> void:
	var step_x := src.size.x if tile_x else dst.size.x
	var step_y := src.size.y if tile_y else dst.size.y
	var tile_index := 0
	var y := dst.position.y
	while y < dst.end.y - 0.01:
		var x := dst.position.x
		while x < dst.end.x - 0.01:
			var draw_w := minf(step_x, dst.end.x - x)
			var draw_h := minf(step_y, dst.end.y - y)
			var source_w := minf(src.size.x, draw_w) if tile_x else src.size.x
			var source_h := minf(src.size.y, draw_h) if tile_y else src.size.y
			var source_rect := Rect2(src.position, Vector2(source_w, source_h))
			if mirror and tile_index % 2 == 1 and tile_x:
				draw_set_transform(Vector2(x + draw_w, y), 0.0, Vector2(-1.0, 1.0))
				draw_texture_rect_region(texture, Rect2(0.0, 0.0, draw_w, draw_h), source_rect)
				draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			elif mirror and tile_index % 2 == 1 and tile_y:
				draw_set_transform(Vector2(x, y + draw_h), 0.0, Vector2(1.0, -1.0))
				draw_texture_rect_region(texture, Rect2(0.0, 0.0, draw_w, draw_h), source_rect)
				draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			else:
				draw_texture_rect_region(texture, Rect2(x, y, draw_w, draw_h), source_rect)
			tile_index += 1
			x += step_x
		y += step_y
