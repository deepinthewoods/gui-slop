const BUILTIN_IMAGES = [
  "test.png",
  "frame_11.png",
  "frame_13.png",
  "image_20260517_193318.png",
  "image_20260517_164554.png",
];

const els = {
  statusText: document.getElementById("statusText"),
  imageSelect: document.getElementById("imageSelect"),
  fileInput: document.getElementById("fileInput"),
  mainColor: document.getElementById("mainColor"),
  mainTint: document.getElementById("mainTint"),
  mainDesaturate: document.getElementById("mainDesaturate"),
  secondaryColor: document.getElementById("secondaryColor"),
  secondaryTint: document.getElementById("secondaryTint"),
  secondaryDesaturate: document.getElementById("secondaryDesaturate"),
  mainTintOut: document.getElementById("mainTintOut"),
  mainDesaturateOut: document.getElementById("mainDesaturateOut"),
  secondaryTintOut: document.getElementById("secondaryTintOut"),
  secondaryDesaturateOut: document.getElementById("secondaryDesaturateOut"),
  colorStats: document.getElementById("colorStats"),
  autoColorsBtn: document.getElementById("autoColorsBtn"),
  detectBtn: document.getElementById("detectBtn"),
  alphaThreshold: document.getElementById("alphaThreshold"),
  mergeGap: document.getElementById("mergeGap"),
  framePadding: document.getElementById("framePadding"),
  minArea: document.getElementById("minArea"),
  alphaOut: document.getElementById("alphaOut"),
  mergeOut: document.getElementById("mergeOut"),
  padOut: document.getElementById("padOut"),
  manualFrameBtn: document.getElementById("manualFrameBtn"),
  frameList: document.getElementById("frameList"),
  sourceView: document.getElementById("sourceView"),
  sourceCanvas: document.getElementById("sourceCanvas"),
  editorCanvas: document.getElementById("editorCanvas"),
  editorContextMenu: document.getElementById("editorContextMenu"),
  autoGuidesBtn: document.getElementById("autoGuidesBtn"),
  autoSideInputs: [...document.querySelectorAll("[data-auto-side]")],
  sliceThreshold: document.getElementById("sliceThreshold"),
  sliceThresholdOut: document.getElementById("sliceThresholdOut"),
  sliceBridgeGap: document.getElementById("sliceBridgeGap"),
  sliceBridgeOut: document.getElementById("sliceBridgeOut"),
  sliceCornerGuard: document.getElementById("sliceCornerGuard"),
  sliceCornerOut: document.getElementById("sliceCornerOut"),
  sliceLengthLimit: document.getElementById("sliceLengthLimit"),
  sliceLengthOut: document.getElementById("sliceLengthOut"),
  areaStats: document.getElementById("areaStats"),
  selectionStats: document.getElementById("selectionStats"),
  gridViewBtn: document.getElementById("gridViewBtn"),
  gridViewModal: document.getElementById("gridViewModal"),
  gridViewCloseBtn: document.getElementById("gridViewCloseBtn"),
  gridApplyCurrentBtn: document.getElementById("gridApplyCurrentBtn"),
  gridFrameCount: document.getElementById("gridFrameCount"),
  gridViewGrid: document.getElementById("gridViewGrid"),
  processSliceReadout: document.getElementById("processSliceReadout"),
  processInsidePx: document.getElementById("processInsidePx"),
  processOutsidePx: document.getElementById("processOutsidePx"),
  processStatus: document.getElementById("processStatus"),
  resetSliceProcessBtn: document.getElementById("resetSliceProcessBtn"),
  resetFrameProcessBtn: document.getElementById("resetFrameProcessBtn"),
  previewGrid: document.getElementById("previewGrid"),
  downloadAllBtn: document.getElementById("downloadAllBtn"),
  downloadCropBtn: document.getElementById("downloadCropBtn"),
  downloadSheetBtn: document.getElementById("downloadSheetBtn"),
  downloadJsonBtn: document.getElementById("downloadJsonBtn"),
  downloadAllJsonBtn: document.getElementById("downloadAllJsonBtn"),
};

const state = {
  imageName: "",
  sourceImage: null,
  originalCanvas: document.createElement("canvas"),
  keyedCanvas: document.createElement("canvas"),
  maskCanvas: document.createElement("canvas"),
  originalData: null,
  keyedData: null,
  colorStats: null,
  sourceHasAlpha: false,
  frames: [],
  selectedId: null,
  selectedSlice: null,
  patches: new Map(),
  edgeAreas: new Map(),
  frameSettings: new Map(),
  processedPatches: new Map(),
  processedCanvas: document.createElement("canvas"),
  hasProcessedPatches: false,
  processingBusy: false,
  gridView: {
    active: false,
    visible: false,
  },
  sliceScans: new Map(),
  manualMode: false,
  sourceDrag: null,
  areaDrag: null,
  editorZoom: 2,
  previewMode: "stretch",
  autoMode: "sliceScan",
};

const EDGE_SIDES = ["top", "bottom", "left", "right"];
const EDITOR_ZOOM_MIN = 1;
const EDITOR_ZOOM_MAX = 12;
const PROCESS_PRESETS = {
  fastAverage: "Fast Avg",
  fastMedian: "Fast Median",
  patchSmall: "Patch Small",
  patchStrong: "Patch Strong",
  matchPatch: "MatchPatch",
  pdeSmooth: "PDE Smooth",
  morphological: "Morpho",
};
const STORAGE_KEY = "frame-patch-lab:v2";
const IMPORTED_IMAGE_GAP = 12;
const IMAGE_FILE_EXTENSION_RE = /\.(apng|avif|bmp|gif|jpe?g|png|webp)$/i;
let pendingSaveTimer = null;
let pendingFileImportToken = 0;
let pendingImageLoadToken = 0;
let windowFileDragDepth = 0;

const sourceCtx = els.sourceCanvas.getContext("2d", { willReadFrequently: true });
const editorCtx = els.editorCanvas.getContext("2d", { willReadFrequently: true });

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

function hueToRgb(p, q, t) {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  };
}

function mixRgb(a, b, amount) {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

function luminance({ r, g, b }) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function formatRect(rect) {
  return `${rect.x}, ${rect.y}, ${rect.w}x${rect.h}`;
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function drawChecker(ctx, w, h, size = 12) {
  ctx.save();
  ctx.fillStyle = "#171a14";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#2d3128";
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      if (((x / size) + (y / size)) % 2 === 0) {
        ctx.fillRect(x, y, size, size);
      }
    }
  }
  ctx.restore();
}

function initImageOptions() {
  els.imageSelect.innerHTML = "";
  for (const name of BUILTIN_IMAGES) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    els.imageSelect.append(option);
  }
}

function imageElementWidth(image) {
  return image.naturalWidth || image.width || 0;
}

function imageElementHeight(image) {
  return image.naturalHeight || image.height || 0;
}

function activateImage(image, name, alreadyFlushed = false) {
  const width = imageElementWidth(image);
  const height = imageElementHeight(image);
  if (width <= 0 || height <= 0) {
    setStatus(`Could not load ${name}`);
    return;
  }

  pendingImageLoadToken += 1;
  if (!alreadyFlushed) flushPendingSave();
  state.imageName = name;
  state.sourceImage = image;
  state.originalCanvas.width = width;
  state.originalCanvas.height = height;
  state.keyedCanvas.width = width;
  state.keyedCanvas.height = height;
  state.maskCanvas.width = width;
  state.maskCanvas.height = height;
  resizeCanvasBitmap(els.sourceCanvas, width, height);

  const ctx = state.originalCanvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0);
  state.originalData = ctx.getImageData(0, 0, width, height);
  state.frames = [];
  state.patches.clear();
  state.edgeAreas.clear();
  state.frameSettings.clear();
  state.selectedSlice = null;
  clearProcessedPatches(false);
  state.sliceScans.clear();
  state.selectedId = null;
  closeGridView(true);
  state.sourceHasAlpha = detectExistingAlpha(state.originalData);

  const roleColors = sampleRoleColors(state.originalData);
  els.mainColor.value = rgbToHex(roleColors.main);
  els.secondaryColor.value = rgbToHex(roleColors.secondary);
  applyUiSettings(getStoredImageRecord()?.settings);
  setStatus(`${name} loaded, ${width}x${height}`);
  processImage();
  detectFrames();
}

function revokeUrls(urls) {
  for (const url of urls || []) URL.revokeObjectURL(url);
}

function loadImage(src, name, cleanupUrls = []) {
  pendingFileImportToken += 1;
  const loadToken = ++pendingImageLoadToken;
  flushPendingSave();
  setStatus(`Loading ${name}...`);
  const img = new Image();
  img.onload = () => {
    if (loadToken !== pendingImageLoadToken) {
      revokeUrls(cleanupUrls);
      return;
    }
    activateImage(img, name, true);
    revokeUrls(cleanupUrls);
  };
  img.onerror = () => {
    if (loadToken === pendingImageLoadToken) setStatus(`Could not load ${name}`);
    revokeUrls(cleanupUrls);
  };
  img.src = src;
}

function isImageFile(file) {
  if (!file) return false;
  return file.type.startsWith("image/") || IMAGE_FILE_EXTENSION_RE.test(file.name || "");
}

function imageFilesFromList(fileList) {
  return Array.from(fileList || []).filter(isImageFile);
}

function loadFileImage(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ file, img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load ${file.name}`));
    };
    img.src = url;
  });
}

function importedImageName(files) {
  if (files.length === 1) return files[0].name;
  const basenames = files.map((file) => file.name.replace(/\.[^.]+$/, ""));
  if (basenames.length <= 3) return `${basenames.join(" + ")}.png`;
  return `${basenames[0]} + ${basenames.length - 1} more.png`;
}

function composeImageSheet(images) {
  const columns = images.length <= 2 ? images.length : Math.ceil(Math.sqrt(images.length));
  const rows = Math.ceil(images.length / columns);
  const columnWidths = Array(columns).fill(1);
  const rowHeights = Array(rows).fill(1);

  images.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    columnWidths[column] = Math.max(columnWidths[column], imageElementWidth(entry.img));
    rowHeights[row] = Math.max(rowHeights[row], imageElementHeight(entry.img));
  });

  const xOffsets = [];
  const yOffsets = [];
  let width = 0;
  let height = 0;
  for (let column = 0; column < columns; column += 1) {
    xOffsets[column] = width;
    width += columnWidths[column] + (column < columns - 1 ? IMPORTED_IMAGE_GAP : 0);
  }
  for (let row = 0; row < rows; row += 1) {
    yOffsets[row] = height;
    height += rowHeights[row] + (row < rows - 1 ? IMPORTED_IMAGE_GAP : 0);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  images.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const imageWidth = imageElementWidth(entry.img);
    const imageHeight = imageElementHeight(entry.img);
    const x = xOffsets[column] + Math.floor((columnWidths[column] - imageWidth) / 2);
    const y = yOffsets[row] + Math.floor((rowHeights[row] - imageHeight) / 2);
    ctx.drawImage(entry.img, x, y);
  });
  return canvas;
}

async function loadImageFiles(fileList) {
  const files = imageFilesFromList(fileList);
  if (files.length === 0) {
    setStatus("No image files found.");
    return;
  }

  const importToken = ++pendingFileImportToken;
  pendingImageLoadToken += 1;
  setStatus(`Loading ${files.length} image${files.length === 1 ? "" : "s"}...`);
  const results = await Promise.allSettled(files.map(loadFileImage));
  const images = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failedCount = results.length - images.length;

  if (importToken !== pendingFileImportToken) {
    revokeUrls(images.map((entry) => entry.url));
    return;
  }
  if (images.length === 0) {
    setStatus(`Could not load ${files.length === 1 ? files[0].name : "those images"}.`);
    return;
  }

  const image = images.length === 1 ? images[0].img : composeImageSheet(images);
  const name = importedImageName(images.map((entry) => entry.file));
  activateImage(image, name);
  revokeUrls(images.map((entry) => entry.url));
  if (failedCount > 0) {
    setStatus(`${name}: loaded ${images.length} image${images.length === 1 ? "" : "s"}, skipped ${failedCount}.`);
  }
}

function classifyColorRole(r, g, b, a) {
  if (a <= 8) return null;
  const hsl = rgbToHsl(r, g, b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (hsl.s < 0.12 || max - min < 12) return null;
  if (hsl.h >= 0.16 && hsl.h <= 0.50 && g >= r * 1.04 && g >= b * 1.04) return "main";
  if ((hsl.h <= 0.08 || hsl.h >= 0.92) && r >= g * 1.04 && r >= b * 1.04) return "secondary";
  return null;
}

function sampleRoleColors(imageData) {
  const data = imageData.data;
  const totals = {
    main: { weight: 0, r: 0, g: 0, b: 0 },
    secondary: { weight: 0, r: 0, g: 0, b: 0 },
  };
  const stride = Math.max(1, Math.floor(Math.sqrt((imageData.width * imageData.height) / 350000)));
  for (let y = 0; y < imageData.height; y += stride) {
    for (let x = 0; x < imageData.width; x += stride) {
      const i = (y * imageData.width + x) * 4;
      const a = data[i + 3];
      const role = classifyColorRole(data[i], data[i + 1], data[i + 2], a);
      if (!role) continue;
      const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      const weight = (a / 255) * Math.max(0.2, hsl.s);
      totals[role].weight += weight;
      totals[role].r += data[i] * weight;
      totals[role].g += data[i + 1] * weight;
      totals[role].b += data[i + 2] * weight;
    }
  }

  const averaged = (role, fallback) => {
    const total = totals[role];
    if (total.weight <= 0) return fallback;
    return {
      r: Math.round(total.r / total.weight),
      g: Math.round(total.g / total.weight),
      b: Math.round(total.b / total.weight),
    };
  };

  return {
    main: averaged("main", { r: 104, g: 184, b: 95 }),
    secondary: averaged("secondary", { r: 201, g: 91, b: 91 }),
  };
}

function getColorSettings() {
  return {
    main: {
      color: hexToRgb(els.mainColor.value),
      tint: Number(els.mainTint.value) / 100,
      desaturate: Number(els.mainDesaturate.value) / 100,
    },
    secondary: {
      color: hexToRgb(els.secondaryColor.value),
      tint: Number(els.secondaryTint.value) / 100,
      desaturate: Number(els.secondaryDesaturate.value) / 100,
    },
  };
}

function applyRoleColor(r, g, b, settings) {
  let color = { r, g, b };
  if (settings.tint > 0) {
    const source = rgbToHsl(r, g, b);
    const target = rgbToHsl(settings.color.r, settings.color.g, settings.color.b);
    const tinted = hslToRgb(target.h, target.s, source.l);
    color = mixRgb(color, tinted, settings.tint);
  }
  if (settings.desaturate > 0) {
    const gray = luminance(color);
    color = mixRgb(color, { r: gray, g: gray, b: gray }, settings.desaturate);
  }
  return {
    r: clamp(Math.round(color.r), 0, 255),
    g: clamp(Math.round(color.g), 0, 255),
    b: clamp(Math.round(color.b), 0, 255),
  };
}

function processImage() {
  if (!state.originalData) return;
  updateControlLabels();
  const settings = getColorSettings();
  const src = state.originalData.data;
  const out = new ImageData(state.originalData.width, state.originalData.height);
  const mask = new ImageData(state.originalData.width, state.originalData.height);
  let transparent = 0;
  let partial = 0;
  let main = 0;
  let secondary = 0;
  let neutral = 0;

  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    const role = classifyColorRole(src[i], src[i + 1], src[i + 2], a);
    const adjusted = role ? applyRoleColor(src[i], src[i + 1], src[i + 2], settings[role]) : {
      r: src[i],
      g: src[i + 1],
      b: src[i + 2],
    };

    out.data[i] = adjusted.r;
    out.data[i + 1] = adjusted.g;
    out.data[i + 2] = adjusted.b;
    out.data[i + 3] = a;
    mask.data[i] = a;
    mask.data[i + 1] = a;
    mask.data[i + 2] = a;
    mask.data[i + 3] = 255;
    if (a === 0) transparent += 1;
    else if (a < 255) partial += 1;
    if (role === "main") main += 1;
    else if (role === "secondary") secondary += 1;
    else if (a > 8) neutral += 1;
  }

  state.keyedData = out;
  state.colorStats = {
    transparent,
    partial,
    main,
    secondary,
    neutral,
    total: state.originalData.width * state.originalData.height,
    sourceHasAlpha: state.sourceHasAlpha,
  };
  state.keyedCanvas.getContext("2d").putImageData(out, 0, 0);
  state.maskCanvas.getContext("2d").putImageData(mask, 0, 0);
  clearProcessedPatches(false);
  renderAll();
}

function updateControlLabels() {
  els.mainTintOut.value = `${els.mainTint.value}%`;
  els.mainDesaturateOut.value = `${els.mainDesaturate.value}%`;
  els.secondaryTintOut.value = `${els.secondaryTint.value}%`;
  els.secondaryDesaturateOut.value = `${els.secondaryDesaturate.value}%`;
  els.alphaOut.value = els.alphaThreshold.value;
  els.mergeOut.value = els.mergeGap.value;
  els.padOut.value = els.framePadding.value;
  if (els.sliceThresholdOut) els.sliceThresholdOut.value = `${els.sliceThreshold.value}%`;
  if (els.sliceBridgeOut) els.sliceBridgeOut.value = `${els.sliceBridgeGap.value}%`;
  if (els.sliceCornerOut) els.sliceCornerOut.value = `${els.sliceCornerGuard.value}%`;
  if (els.sliceLengthOut) els.sliceLengthOut.value = `${els.sliceLengthLimit.value} px`;
}

function getRenderCanvas() {
  return state.hasProcessedPatches ? state.processedCanvas : state.keyedCanvas;
}

function syncProcessedCanvasSize() {
  if (state.processedCanvas.width !== state.keyedCanvas.width) state.processedCanvas.width = state.keyedCanvas.width;
  if (state.processedCanvas.height !== state.keyedCanvas.height) state.processedCanvas.height = state.keyedCanvas.height;
}

function rebuildProcessedCanvas(shouldRender = true) {
  syncProcessedCanvasSize();
  const ctx = state.processedCanvas.getContext("2d");
  ctx.clearRect(0, 0, state.processedCanvas.width, state.processedCanvas.height);
  ctx.drawImage(state.keyedCanvas, 0, 0);
  for (const patch of state.processedPatches.values()) {
    ctx.drawImage(patch.canvas, patch.x, patch.y);
  }
  state.hasProcessedPatches = state.processedPatches.size > 0;
  if (shouldRender) renderAll();
}

function clearProcessedPatches(shouldRender = true) {
  state.processedPatches.clear();
  state.hasProcessedPatches = false;
  syncProcessedCanvasSize();
  state.processedCanvas.getContext("2d").clearRect(0, 0, state.processedCanvas.width, state.processedCanvas.height);
  if (shouldRender) renderAll();
}

function clearProcessedFrame(frameId, shouldRender = true) {
  for (const key of [...state.processedPatches.keys()]) {
    if (key.startsWith(`${frameId}:`)) state.processedPatches.delete(key);
  }
  rebuildProcessedCanvas(shouldRender);
}

function clearProcessedSlice(frameId, side, index, shouldRender = true) {
  state.processedPatches.delete(slicePatchKey(frameId, side, index));
  rebuildProcessedCanvas(shouldRender);
}

function setInputValue(input, value) {
  if (!input || value === undefined || value === null) return;
  input.value = String(value);
}

function syncModeButtons(selector, attr, activeValue) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("active", button.dataset[attr] === activeValue);
  });
}

function normalizeAutoMode() {
  return "sliceScan";
}

function normalizeAutoSideFlags(flags) {
  const normalized = {};
  for (const side of EDGE_SIDES) {
    normalized[side] = flags?.[side] !== false;
  }
  return normalized;
}

function getAutoSideFlags() {
  const flags = normalizeAutoSideFlags(null);
  for (const input of els.autoSideInputs || []) {
    const side = input.dataset.autoSide;
    if (EDGE_SIDES.includes(side)) flags[side] = input.checked;
  }
  return flags;
}

function setAutoSideFlags(flags) {
  const normalized = normalizeAutoSideFlags(flags);
  for (const input of els.autoSideInputs || []) {
    const side = input.dataset.autoSide;
    if (EDGE_SIDES.includes(side)) input.checked = normalized[side];
  }
}

function hasDisabledAutoSides(flags = getAutoSideFlags()) {
  return EDGE_SIDES.some((side) => flags[side] === false);
}

function getUiSettings() {
  return {
    colors: {
      mainColor: els.mainColor.value,
      mainTint: Number(els.mainTint.value),
      mainDesaturate: Number(els.mainDesaturate.value),
      secondaryColor: els.secondaryColor.value,
      secondaryTint: Number(els.secondaryTint.value),
      secondaryDesaturate: Number(els.secondaryDesaturate.value),
    },
    detection: {
      alphaThreshold: Number(els.alphaThreshold.value),
      mergeGap: Number(els.mergeGap.value),
      framePadding: Number(els.framePadding.value),
      minArea: Number(els.minArea.value),
    },
    areas: {
      autoMode: state.autoMode,
      autoSides: getAutoSideFlags(),
      sliceThreshold: Number(els.sliceThreshold.value),
      sliceBridgeGap: Number(els.sliceBridgeGap.value),
      sliceCornerGuard: Number(els.sliceCornerGuard.value),
      sliceLengthLimit: Number(els.sliceLengthLimit.value),
    },
    previewMode: state.previewMode,
  };
}

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings));
}

function applyAreaUiSettings(settings) {
  if (!settings) return;
  setInputValue(els.sliceThreshold, settings.areas?.sliceThreshold);
  setInputValue(els.sliceBridgeGap, settings.areas?.sliceBridgeGap);
  setInputValue(els.sliceCornerGuard, settings.areas?.sliceCornerGuard);
  setInputValue(els.sliceLengthLimit, settings.areas?.sliceLengthLimit);
  setAutoSideFlags(settings.areas?.autoSides);
  if (settings.areas?.autoMode) state.autoMode = normalizeAutoMode(settings.areas.autoMode);
  if (settings.previewMode) state.previewMode = settings.previewMode;
  syncModeButtons("[data-preview-mode]", "previewMode", state.previewMode);
  updateControlLabels();
}

function applyFrameAreaSettings(frame) {
  if (!frame) return;
  applyAreaUiSettings(state.frameSettings.get(frame.id));
}

function applyUiSettings(settings) {
  if (!settings) return;
  setInputValue(els.mainColor, settings.colors?.mainColor);
  setInputValue(els.mainTint, settings.colors?.mainTint);
  setInputValue(els.mainDesaturate, settings.colors?.mainDesaturate);
  setInputValue(els.secondaryColor, settings.colors?.secondaryColor);
  setInputValue(els.secondaryTint, settings.colors?.secondaryTint);
  setInputValue(els.secondaryDesaturate, settings.colors?.secondaryDesaturate);
  setInputValue(els.alphaThreshold, settings.detection?.alphaThreshold);
  setInputValue(els.mergeGap, settings.detection?.mergeGap);
  setInputValue(els.framePadding, settings.detection?.framePadding);
  setInputValue(els.minArea, settings.detection?.minArea);
  setInputValue(els.sliceThreshold, settings.areas?.sliceThreshold);
  setInputValue(els.sliceBridgeGap, settings.areas?.sliceBridgeGap);
  setInputValue(els.sliceCornerGuard, settings.areas?.sliceCornerGuard);
  setInputValue(els.sliceLengthLimit, settings.areas?.sliceLengthLimit);
  setAutoSideFlags(settings.areas?.autoSides);
  if (settings.areas?.autoMode) state.autoMode = normalizeAutoMode(settings.areas.autoMode);
  if (settings.previewMode) state.previewMode = settings.previewMode;
  syncModeButtons("[data-preview-mode]", "previewMode", state.previewMode);
  updateControlLabels();
}

function readStorageRoot() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { images: {} };
  } catch {
    return { images: {} };
  }
}

function writeStorageRoot(root) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    setStatus("Could not save settings in this browser session.");
  }
}

function getStoredImageRecord(root = readStorageRoot()) {
  return root.images?.[state.imageName] || null;
}

function getWritableImageRecord(root) {
  root.images ||= {};
  root.images[state.imageName] ||= { settings: null, frames: {} };
  root.images[state.imageName].frames ||= {};
  return root.images[state.imageName];
}

function frameStorageKey(frame) {
  return [frame.x, frame.y, frame.w, frame.h].map((value) => Math.round(value)).join(",");
}

function serializeRunCollection(collection) {
  const out = {};
  for (const side of EDGE_SIDES) {
    const runs = collection?.[side] || [];
    if (runs.length > 0) out[side] = runs.map(rectToArray);
  }
  return Object.keys(out).length > 0 ? out : null;
}

function serializeRectMap(rects) {
  const out = {};
  for (const [side, rect] of Object.entries(rects || {})) {
    if (rect) out[side] = rectToArray(rect);
  }
  return Object.keys(out).length > 0 ? out : null;
}

function serializeSideFlags(flags) {
  const out = {};
  for (const side of EDGE_SIDES) {
    if (flags?.[side] === true) out[side] = true;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function serializePatchForStorage(patch) {
  if (!patch) return null;
  return {
    v: { ...patch.v },
    h: { ...patch.h },
    mode: patch.mode || "tile",
  };
}

function serializeAreasForStorage(areas) {
  if (!areas) return null;
  return {
    center: rectToArray(areas.center),
    top: rectToArray(areas.top),
    bottom: rectToArray(areas.bottom),
    left: rectToArray(areas.left),
    right: rectToArray(areas.right),
    tileRuns: serializeRunCollection(areas.tileRuns),
    fixedRuns: serializeRunCollection(areas.fixedRuns),
    fixedRunsExplicit: areas.fixedRunsExplicit === true,
    fixedRunsExplicitSides: serializeSideFlags(areas.fixedRunsExplicitSides),
    medallions: serializeRectMap(areas.medallions),
  };
}

function rectFromArray(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const rect = {
    x: Number(value[0]),
    y: Number(value[1]),
    w: Number(value[2]),
    h: Number(value[3]),
  };
  return Object.values(rect).every(Number.isFinite) && rect.w > 0 && rect.h > 0 ? rect : null;
}

function deserializeRunCollection(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const side of EDGE_SIDES) {
    const runs = Array.isArray(value[side]) ? value[side].map(rectFromArray).filter(Boolean) : [];
    if (runs.length > 0) out[side] = runs;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function deserializeRectMap(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const side of EDGE_SIDES) {
    const rect = rectFromArray(value[side]);
    if (rect) out[side] = rect;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function deserializeSideFlags(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const side of EDGE_SIDES) {
    if (value[side] === true) out[side] = true;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function deserializePatchForStorage(frame, value) {
  if (!value?.v || !value?.h) return null;
  const patch = {
    v: { ...value.v },
    h: { ...value.h },
    mode: value.mode || "tile",
  };
  return constrainPatch(frame, patch);
}

function deserializeAreasForStorage(frame, value) {
  if (!value) return null;
  const center = rectFromArray(value.center);
  const top = rectFromArray(value.top);
  const bottom = rectFromArray(value.bottom);
  const left = rectFromArray(value.left);
  const right = rectFromArray(value.right);
  if (!center || !top || !bottom || !left || !right) return null;
  const areas = {
    center,
    top,
    bottom,
    left,
    right,
    tileRuns: deserializeRunCollection(value.tileRuns),
    fixedRuns: deserializeRunCollection(value.fixedRuns),
    fixedRunsExplicit: value.fixedRunsExplicit === true,
    fixedRunsExplicitSides: deserializeSideFlags(value.fixedRunsExplicitSides),
    medallions: deserializeRectMap(value.medallions),
  };
  return constrainEdgeAreas(frame, areas);
}

function rememberFrameSettings(frame = getSelectedFrame()) {
  if (!frame) return;
  state.frameSettings.set(frame.id, getUiSettings());
}

function saveCurrentImageState() {
  if (!state.imageName) return;
  const root = readStorageRoot();
  const record = getWritableImageRecord(root);
  record.settings = getUiSettings();
  const selected = getSelectedFrame();
  record.selectedFrameKey = selected ? frameStorageKey(selected) : record.selectedFrameKey || null;
  for (const frame of state.frames) {
    const areas = state.edgeAreas.get(frame.id);
    const patch = state.patches.get(frame.id);
    if (!areas && !patch) continue;
    const key = frameStorageKey(frame);
    record.frames[key] = {
      name: frame.name,
      sourceRect: [frame.x, frame.y, frame.w, frame.h],
      manual: frame.id.startsWith("manual"),
      patch: serializePatchForStorage(patch),
      areas: serializeAreasForStorage(areas),
      settings: state.frameSettings.get(frame.id) || record.frames[key]?.settings || getUiSettings(),
      updatedAt: new Date().toISOString(),
    };
  }
  writeStorageRoot(root);
}

function scheduleSaveCurrentImageState() {
  clearTimeout(pendingSaveTimer);
  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    saveCurrentImageState();
  }, 120);
}

function flushPendingSave() {
  if (!pendingSaveTimer) return;
  clearTimeout(pendingSaveTimer);
  pendingSaveTimer = null;
  saveCurrentImageState();
}

function restoreSavedManualFrames() {
  const record = getStoredImageRecord();
  if (!record?.frames) return;
  const existing = new Set(state.frames.map(frameStorageKey));
  let restoredCount = 0;
  for (const saved of Object.values(record.frames)) {
    if (!saved?.manual) continue;
    const rect = rectFromArray(saved.sourceRect);
    if (!rect || existing.has(frameStorageKey(rect))) continue;
    const frame = {
      id: `manual_saved_${restoredCount + 1}`,
      name: saved.name || `Manual ${restoredCount + 1}`,
      x: clamp(rect.x, 0, state.keyedData.width - 1),
      y: clamp(rect.y, 0, state.keyedData.height - 1),
      w: clamp(rect.w, 1, state.keyedData.width - rect.x),
      h: clamp(rect.h, 1, state.keyedData.height - rect.y),
      area: rect.w * rect.h,
    };
    state.frames.push(frame);
    existing.add(frameStorageKey(frame));
    restoredCount += 1;
  }
  if (restoredCount > 0) state.frames.sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

function restoreSavedFrameSettings(previousSelectedKey = null) {
  const record = getStoredImageRecord();
  if (!record?.frames) return null;
  const preferredKey = previousSelectedKey || record.selectedFrameKey || null;
  let restoredSelectedId = null;
  for (const frame of state.frames) {
    const saved = record.frames[frameStorageKey(frame)];
    if (!saved) continue;
    if (saved.name) frame.name = saved.name;
    const patch = deserializePatchForStorage(frame, saved.patch);
    if (patch) state.patches.set(frame.id, patch);
    const areas = deserializeAreasForStorage(frame, saved.areas);
    if (areas) state.edgeAreas.set(frame.id, areas);
    state.frameSettings.set(frame.id, saved.settings || record.settings || getUiSettings());
    if (preferredKey && frameStorageKey(frame) === preferredKey) restoredSelectedId = frame.id;
  }
  return restoredSelectedId;
}

function detectExistingAlpha(imageData) {
  const data = imageData.data;
  let transparentish = 0;
  const total = imageData.width * imageData.height;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) transparentish += 1;
  }
  return transparentish / total > 0.01;
}

function detectFrames() {
  if (!state.keyedData) return;
  closeGridView(true);
  updateControlLabels();
  const previousSelectedKey = getSelectedFrame() ? frameStorageKey(getSelectedFrame()) : null;
  state.sliceScans.clear();
  const width = state.keyedData.width;
  const height = state.keyedData.height;
  const alphaThreshold = Number(els.alphaThreshold.value);
  const minArea = Math.max(1, Number(els.minArea.value));
  const data = state.keyedData.data;
  const seen = new Uint8Array(width * height);
  const labels = new Int32Array(width * height);
  labels.fill(-1);
  const stack = new Int32Array(width * height);
  const components = [];
  const componentNoiseFloor = Math.max(1, Math.min(64, minArea));

  for (let idx = 0; idx < width * height; idx += 1) {
    if (seen[idx] || data[idx * 4 + 3] <= alphaThreshold) continue;
    const label = components.length;
    let top = 0;
    stack[top++] = idx;
    seen[idx] = 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const pixels = [];

    while (top > 0) {
      const p = stack[--top];
      labels[p] = label;
      pixels.push(p);
      const x = p % width;
      const y = (p / width) | 0;
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        if (ny < 0 || ny >= height) continue;
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || nx >= width || (nx === x && ny === y)) continue;
          const np = ny * width + nx;
          if (!seen[np] && data[np * 4 + 3] > alphaThreshold) {
            seen[np] = 1;
            stack[top++] = np;
          }
        }
      }
    }

    if (area >= componentNoiseFloor) {
      components.push({ area, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, pixels });
    } else {
      pixels.forEach((p) => labels[p] = -1);
    }
  }

  const merged = mergeComponents(components, Number(els.mergeGap.value), labels, width, height)
    .filter((box) => box.area >= minArea);
  const pad = Number(els.framePadding.value);
  state.frames = merged
    .map((box, index) => ({
      id: `frame_${index + 1}`,
      x: clamp(box.x - pad, 0, width - 1),
      y: clamp(box.y - pad, 0, height - 1),
      w: clamp(box.w + pad * 2, 1, width - clamp(box.x - pad, 0, width - 1)),
      h: clamp(box.h + pad * 2, 1, height - clamp(box.y - pad, 0, height - 1)),
      area: box.area,
      name: `Frame ${index + 1}`,
    }))
    .filter((frame) => frame.w > 8 && frame.h > 8)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));

  state.frames.forEach((frame, index) => {
    frame.id = `frame_${index + 1}`;
    frame.name = `Frame ${index + 1}`;
    if (!state.patches.has(frame.id)) {
      state.patches.set(frame.id, suggestPatch(frame));
    }
    state.edgeAreas.set(frame.id, suggestEdgeAreas(frame));
    state.frameSettings.set(frame.id, getUiSettings());
  });

  restoreSavedManualFrames();
  state.frames.forEach((frame) => {
    if (!state.patches.has(frame.id)) state.patches.set(frame.id, suggestPatch(frame));
    if (!state.edgeAreas.has(frame.id)) state.edgeAreas.set(frame.id, suggestEdgeAreas(frame));
    if (!state.frameSettings.has(frame.id)) state.frameSettings.set(frame.id, getUiSettings());
  });
  const restoredSelectedId = restoreSavedFrameSettings(previousSelectedKey);
  state.selectedId = restoredSelectedId || state.frames[0]?.id || null;
  clearSelectedSlice(false);
  setStatus(`${state.imageName}: detected ${state.frames.length} frame${state.frames.length === 1 ? "" : "s"}`);
  renderAll();
  scheduleSaveCurrentImageState();
}

function mergeComponents(components, gap, labels, width, height) {
  if (components.length <= 1) return components;
  const parent = components.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const boxesNear = (a, b, amount) => (
    a.x - amount <= b.x + b.w &&
    a.x + a.w + amount >= b.x &&
    a.y - amount <= b.y + b.h &&
    a.y + a.h + amount >= b.y
  );

  if (labels && width > 0 && height > 0) {
    const radius = Math.max(0, Math.round(gap)) + 1;
    for (let i = 0; i < components.length; i += 1) {
      for (let j = i + 1; j < components.length; j += 1) {
        if (!boxesNear(components[i], components[j], gap)) continue;
        const sourceIndex = components[i].area <= components[j].area ? i : j;
        const targetIndex = sourceIndex === i ? j : i;
        if (componentsWithinPixelGap(components[sourceIndex], components[targetIndex], targetIndex, labels, width, height, radius)) {
          join(i, j);
        }
      }
    }
  }

  const groups = new Map();
  components.forEach((component, i) => {
    const root = find(i);
    let group = groups.get(root);
    if (!group) {
      group = { x: component.x, y: component.y, x2: component.x + component.w, y2: component.y + component.h, area: 0 };
      groups.set(root, group);
    }
    group.x = Math.min(group.x, component.x);
    group.y = Math.min(group.y, component.y);
    group.x2 = Math.max(group.x2, component.x + component.w);
    group.y2 = Math.max(group.y2, component.y + component.h);
    group.area += component.area;
  });

  return [...groups.values()].map((group) => ({
    x: group.x,
    y: group.y,
    w: group.x2 - group.x,
    h: group.y2 - group.y,
    area: group.area,
  }));
}

function componentsWithinPixelGap(source, target, targetLabel, labels, width, height, radius) {
  for (const p of source.pixels || []) {
    const x = p % width;
    const y = (p / width) | 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const ny = y + dy;
      if (ny < target.y || ny >= target.y + target.h || ny < 0 || ny >= height) continue;
      const row = ny * width;
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        if (nx < target.x || nx >= target.x + target.w || nx < 0 || nx >= width) continue;
        if (labels[row + nx] === targetLabel) return true;
      }
    }
  }
  return false;
}

function getSelectedFrame() {
  return state.frames.find((frame) => frame.id === state.selectedId) || null;
}

function selectFrameById(frameId, options = {}) {
  const frame = state.frames.find((candidate) => candidate.id === frameId);
  if (!frame) return null;
  if (state.selectedId !== frame.id) clearSelectedSlice(false);
  state.selectedId = frame.id;
  if (options.applyStoredSettings !== false) applyFrameAreaSettings(frame);
  scheduleSaveCurrentImageState();
  if (options.render !== false) renderAll();
  return frame;
}

function getSelectedPatch() {
  const frame = getSelectedFrame();
  return frame ? state.patches.get(frame.id) : null;
}

function getSelectedAreas() {
  const frame = getSelectedFrame();
  return frame ? state.edgeAreas.get(frame.id) : null;
}

function slicePatchKey(frameId, side, index = "area") {
  return `${frameId}:${side}:${index ?? "area"}`;
}

function getSelectedSliceRun() {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  const selection = state.selectedSlice;
  if (!frame || !areas || !selection || selection.frameId !== frame.id) return null;
  const isAreaSelection = selection.kind === "area";
  const rect = isAreaSelection
    ? areas[selection.side]
    : areas.tileRuns?.[selection.side]?.[selection.index];
  if (!rect) return null;
  const index = isAreaSelection ? null : selection.index;
  return {
    frame,
    areas,
    side: selection.side,
    index,
    kind: isAreaSelection ? "area" : "slice",
    name: isAreaSelection ? `${selection.side} area` : `${selection.side} slice ${selection.index + 1}`,
    rect,
    key: slicePatchKey(frame.id, selection.side, index),
  };
}

function selectSliceHit(hit, shouldRender = true) {
  const frame = getSelectedFrame();
  if (!frame || !hit || hit.kind !== "slice") return;
  state.selectedSlice = { frameId: frame.id, side: hit.side, index: hit.index, kind: "slice" };
  if (shouldRender) renderAll();
}

function selectAreaSliceHit(hit, shouldRender = true) {
  const frame = getSelectedFrame();
  if (!frame || !hit || hit.kind !== "area") return;
  state.selectedSlice = { frameId: frame.id, side: hit.side, index: null, kind: "area" };
  if (shouldRender) renderAll();
}

function clearSelectedSlice(shouldRender = true) {
  if (!state.selectedSlice) return;
  state.selectedSlice = null;
  if (shouldRender) renderAll();
}

function cloneRect(rect) {
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
}

function cloneRunCollection(collection) {
  const out = {};
  for (const side of EDGE_SIDES) {
    const runs = collection?.[side] || [];
    if (runs.length > 0) out[side] = runs.map(cloneRect);
  }
  return Object.keys(out).length > 0 ? out : null;
}

function cloneRectMap(rects) {
  const out = {};
  for (const side of EDGE_SIDES) {
    if (rects?.[side]) out[side] = cloneRect(rects[side]);
  }
  return Object.keys(out).length > 0 ? out : null;
}

function cloneSideFlags(flags) {
  const out = {};
  for (const side of EDGE_SIDES) {
    if (flags?.[side] === true) out[side] = true;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function cloneAreas(areas) {
  return {
    center: cloneRect(areas.center),
    top: cloneRect(areas.top),
    bottom: cloneRect(areas.bottom),
    left: cloneRect(areas.left),
    right: cloneRect(areas.right),
    tileRuns: cloneRunCollection(areas.tileRuns),
    fixedRuns: cloneRunCollection(areas.fixedRuns),
    fixedRunsExplicit: areas.fixedRunsExplicit === true,
    fixedRunsExplicitSides: cloneSideFlags(areas.fixedRunsExplicitSides),
    medallions: cloneRectMap(areas.medallions),
  };
}

function rectToArray(rect) {
  return [rect.x, rect.y, rect.w, rect.h];
}

function rectEndX(rect) {
  return rect.x + rect.w;
}

function rectEndY(rect) {
  return rect.y + rect.h;
}

function rectPrimaryStart(rect, axis) {
  return axis === "x" ? rect.x : rect.y;
}

function rectPrimaryEnd(rect, axis) {
  return axis === "x" ? rectEndX(rect) : rectEndY(rect);
}

function rectFromPrimarySpan(area, axis, start, end) {
  return axis === "x"
    ? { x: start, y: area.y, w: end - start, h: area.h }
    : { x: area.x, y: start, w: area.w, h: end - start };
}

function sideAxis(side) {
  return side === "top" || side === "bottom" ? "x" : "y";
}

function normalizeRect(frame, rect, minSize = 1) {
  const x = clamp(Math.round(rect.x), 0, Math.max(0, frame.w - minSize));
  const y = clamp(Math.round(rect.y), 0, Math.max(0, frame.h - minSize));
  return {
    x,
    y,
    w: clamp(Math.round(rect.w), minSize, frame.w - x),
    h: clamp(Math.round(rect.h), minSize, frame.h - y),
  };
}

function findTransparentCenterRect(frame) {
  if (!state.keyedData) return { x: 0, y: 0, w: frame.w, h: frame.h };
  const alphaThreshold = Number(els.alphaThreshold.value);
  const data = state.keyedData.data;
  const width = state.keyedData.width;
  const centerX = Math.floor(frame.w / 2);
  const centerY = Math.floor(frame.h / 2);
  const heights = new Array(frame.w).fill(0);
  let best = null;

  const consider = (x, y, w, h) => {
    if (w <= 0 || h <= 0) return;
    if (!(x <= centerX && x + w > centerX && y <= centerY && y + h > centerY)) return;
    const area = w * h;
    if (!best || area > best.area) best = { x, y, w, h, area };
  };

  for (let y = 0; y < frame.h; y += 1) {
    for (let x = 0; x < frame.w; x += 1) {
      const alpha = data[((frame.y + y) * width + frame.x + x) * 4 + 3];
      heights[x] = alpha <= alphaThreshold ? heights[x] + 1 : 0;
    }

    const stack = [];
    for (let x = 0; x <= frame.w; x += 1) {
      const current = x < frame.w ? heights[x] : 0;
      while (stack.length > 0 && current < heights[stack[stack.length - 1]]) {
        const topIndex = stack.pop();
        const h = heights[topIndex];
        const left = stack.length > 0 ? stack[stack.length - 1] + 1 : 0;
        const w = x - left;
        consider(left, y - h + 1, w, h);
      }
      stack.push(x);
    }
  }

  if (best) {
    delete best.area;
    return best;
  }

  return {
    x: clamp(centerX, 0, Math.max(0, frame.w - 1)),
    y: clamp(centerY, 0, Math.max(0, frame.h - 1)),
    w: 1,
    h: 1,
  };
}

// Bounding box of the connected transparent region INSIDE the frame (flood-filled
// from the centre; the opaque border blocks leaks to the exterior). This is the
// hole the background fills. Unlike findTransparentCenterRect (a largest-inscribed
// rect) it captures the full extent of a non-rectangular hole (rounded/V tops), so
// it may overdraw slightly under those edges — acceptable; the border paints on top.
function findInteriorTransparentBounds(frame) {
  if (!state.keyedData) return { x: 0, y: 0, w: frame.w, h: frame.h };
  const alphaThreshold = Number(els.alphaThreshold.value);
  const data = state.keyedData.data;
  const width = state.keyedData.width;
  const fw = frame.w;
  const fh = frame.h;
  const transparent = (x, y) => data[((frame.y + y) * width + frame.x + x) * 4 + 3] <= alphaThreshold;

  // Seed: nearest transparent pixel to the centre (rings outward).
  const cx = Math.floor(fw / 2);
  const cy = Math.floor(fh / 2);
  let seed = null;
  const maxR = Math.max(fw, fh);
  for (let r = 0; r <= maxR && !seed; r += 1) {
    for (let dy = -r; dy <= r && !seed; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= fw || y >= fh) continue;
        if (transparent(x, y)) { seed = { x, y }; break; }
      }
    }
  }
  if (!seed) return { x: cx, y: cy, w: 1, h: 1 };

  const visited = new Uint8Array(fw * fh);
  const stack = [seed.y * fw + seed.x];
  visited[seed.y * fw + seed.x] = 1;
  let minX = seed.x;
  let maxX = seed.x;
  let minY = seed.y;
  let maxY = seed.y;
  const push = (nx, ny) => {
    if (nx < 0 || ny < 0 || nx >= fw || ny >= fh) return;
    const ni = ny * fw + nx;
    if (visited[ni] || !transparent(nx, ny)) return;
    visited[ni] = 1;
    stack.push(ni);
  };
  while (stack.length > 0) {
    const idx = stack.pop();
    const x = idx % fw;
    const y = (idx - x) / fw;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Expand a run/medallion rect's CROSS extent (perpendicular to its edge) to the
// ornament's full opaque bounds within the side margin, keeping its along-span.
// Detected fixed runs are clamped to the thin edge strip, which clips a gem so it
// can't stick out past the border; the runtime draws what we export here.
function expandRunFullCross(frame, side, m, center) {
  if (!state.keyedData || !center) return m;
  const horizontal = side === "top" || side === "bottom";
  const data = state.keyedData.data;
  const width = state.keyedData.width;
  const threshold = Number(els.alphaThreshold.value);
  const opaque = (x, y) => data[((frame.y + y) * width + frame.x + x) * 4 + 3] > threshold;
  let s0;
  let s1;
  if (side === "top") { s0 = 0; s1 = Math.max(1, Math.round(center.y)); }
  else if (side === "bottom") { s0 = Math.round(center.y + center.h); s1 = frame.h; }
  else if (side === "left") { s0 = 0; s1 = Math.max(1, Math.round(center.x)); }
  else { s0 = Math.round(center.x + center.w); s1 = frame.w; }
  const a0 = Math.round(horizontal ? m.x : m.y);
  const a1 = Math.round(horizontal ? m.x + m.w : m.y + m.h);
  let lo = -1;
  let hi = -1;
  for (let c = clamp(s0, 0, frame.h); c < clamp(s1, 0, horizontal ? frame.h : frame.w); c += 1) {
    let op = false;
    for (let a = a0; a < a1; a += 1) {
      if (horizontal ? opaque(a, c) : opaque(c, a)) { op = true; break; }
    }
    if (op) { if (lo < 0) lo = c; hi = c; }
  }
  if (lo < 0) return m;
  return horizontal
    ? { x: m.x, y: lo, w: m.w, h: hi - lo + 1 }
    : { x: lo, y: m.y, w: hi - lo + 1, h: m.h };
}

function sideDefaultRect(frame, center, side) {
  const centerRight = center.x + center.w;
  const centerBottom = center.y + center.h;
  if (side === "top") {
    return { x: center.x, y: 0, w: center.w, h: Math.max(1, center.y) };
  }
  if (side === "bottom") {
    return { x: center.x, y: centerBottom, w: center.w, h: Math.max(1, frame.h - centerBottom) };
  }
  if (side === "left") {
    return { x: 0, y: center.y, w: Math.max(1, center.x), h: center.h };
  }
  return { x: centerRight, y: center.y, w: Math.max(1, frame.w - centerRight), h: center.h };
}

function suggestEdgeAreas(frame) {
  const sliceAreas = suggestSliceScanAreas(frame);
  if (sliceAreas) return sliceAreas;
  const center = findTransparentCenterRect(frame);
  const areas = {
    center: normalizeRect(frame, center, 1),
    top: sideDefaultRect(frame, center, "top"),
    bottom: sideDefaultRect(frame, center, "bottom"),
    left: sideDefaultRect(frame, center, "left"),
    right: sideDefaultRect(frame, center, "right"),
  };
  return constrainEdgeAreas(frame, areas);
}

function suggestAutoEdgeAreas(frame, sideFlags = getAutoSideFlags()) {
  const suggested = suggestEdgeAreas(frame);
  const existing = state.edgeAreas.get(frame.id);
  return applyAutoSideMask(frame, suggested, existing, sideFlags);
}

function suggestAutoPatch(frame, areas) {
  return areas ? constrainPatch(frame, patchFromSliceScanAreas(frame, areas)) : suggestPatch(frame);
}

function applyAutoSideMask(frame, suggested, existing, sideFlags) {
  if (!suggested || !existing || !hasDisabledAutoSides(sideFlags)) return suggested;
  const merged = cloneAreas(suggested);
  for (const side of EDGE_SIDES) {
    if (sideFlags[side] !== false) continue;
    copyAutoSideFromExisting(merged, existing, side);
  }
  return constrainEdgeAreas(frame, merged);
}

function copyAutoSideFromExisting(target, source, side) {
  if (source[side]) target[side] = cloneRect(source[side]);
  setRunCollectionSide(target, "tileRuns", side, source.tileRuns?.[side] || []);
  setRunCollectionSide(target, "fixedRuns", side, source.fixedRuns?.[side] || []);
  if (source.medallions?.[side]) {
    target.medallions ||= {};
    target.medallions[side] = cloneRect(source.medallions[side]);
  } else if (target.medallions) {
    delete target.medallions[side];
    if (Object.keys(target.medallions).length === 0) delete target.medallions;
  }
  setExplicitFixedSide(target, side, source.fixedRunsExplicit === true || source.fixedRunsExplicitSides?.[side] === true);
}

function edgeAreasFromPatch(frame, center, patch) {
  const horizontalX = clamp(patch.v.left, 0, Math.max(0, frame.w - 1));
  const horizontalRight = clamp(patch.v.right, horizontalX + 1, frame.w);
  const verticalY = clamp(patch.h.top, 0, Math.max(0, frame.h - 1));
  const verticalBottom = clamp(patch.h.bottom, verticalY + 1, frame.h);
  const areas = {
    center: normalizeRect(frame, center, 1),
    top: {
      x: horizontalX,
      y: 0,
      w: horizontalRight - horizontalX,
      h: Math.max(1, patch.h.top),
    },
    bottom: {
      x: horizontalX,
      y: verticalBottom,
      w: horizontalRight - horizontalX,
      h: Math.max(1, frame.h - verticalBottom),
    },
    left: {
      x: 0,
      y: verticalY,
      w: Math.max(1, patch.v.left),
      h: verticalBottom - verticalY,
    },
    right: {
      x: horizontalRight,
      y: verticalY,
      w: Math.max(1, frame.w - horizontalRight),
      h: verticalBottom - verticalY,
    },
  };
  areas.top = fitAreaToAlpha(frame, "top", areas.top, areas.center);
  areas.bottom = fitAreaToAlpha(frame, "bottom", areas.bottom, areas.center);
  areas.left = fitAreaToAlpha(frame, "left", areas.left, areas.center);
  areas.right = fitAreaToAlpha(frame, "right", areas.right, areas.center);
  areas.medallions = detectMedallions(frame, areas);
  return areas;
}

function getSideSearchRegion(frame, side, center) {
  const centerRight = rectEndX(center);
  const centerBottom = rectEndY(center);
  if (side === "top") return { x: 0, y: 0, w: frame.w, h: Math.max(1, center.y) };
  if (side === "bottom") return { x: 0, y: centerBottom, w: frame.w, h: Math.max(1, frame.h - centerBottom) };
  if (side === "left") return { x: 0, y: center.y, w: Math.max(1, center.x), h: center.h };
  return { x: centerRight, y: center.y, w: Math.max(1, frame.w - centerRight), h: center.h };
}

function alphaBoundsInRect(frame, rect) {
  if (!state.keyedData) return null;
  const threshold = Number(els.alphaThreshold.value);
  const data = state.keyedData.data;
  const width = state.keyedData.width;
  const search = normalizeRect(frame, rect, 1);
  let minX = frame.w;
  let minY = frame.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = search.y; y < search.y + search.h; y += 1) {
    for (let x = search.x; x < search.x + search.w; x += 1) {
      const alpha = data[((frame.y + y) * width + frame.x + x) * 4 + 3];
      if (alpha <= threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function fitAreaToAlpha(frame, side, rect, center) {
  const normalized = normalizeRect(frame, rect, 1);
  const region = getSideSearchRegion(frame, side, center);
  const search = side === "top" || side === "bottom"
    ? {
        x: normalized.x,
        y: region.y,
        w: normalized.w,
        h: region.h,
      }
    : {
        x: region.x,
        y: normalized.y,
        w: region.w,
        h: normalized.h,
      };
  const bounds = alphaBoundsInRect(frame, search);
  if (!bounds) return normalized;
  if (side === "top" || side === "bottom") {
    return normalizeRect(frame, { x: normalized.x, y: bounds.y, w: normalized.w, h: bounds.h }, 1);
  }
  return normalizeRect(frame, { x: bounds.x, y: normalized.y, w: bounds.w, h: normalized.h }, 1);
}

function detectMedallions(frame, areas) {
  const medallions = {};
  for (const side of ["top", "bottom", "left", "right"]) {
    const rect = detectSideMedallion(frame, side, areas);
    if (rect) medallions[side] = rect;
  }
  return medallions;
}

function detectSideMedallion(frame, side, areas) {
  const center = areas.center;
  const region = getSideSearchRegion(frame, side, center);
  if (region.w <= 1 || region.h <= 1) return null;
  const horizontal = side === "top" || side === "bottom";
  const length = horizontal ? frame.w : frame.h;
  const counts = projectAlphaCounts(frame, region, horizontal ? "x" : "y");
  const area = areas[side];
  const lowGuard = horizontal ? area.x : area.y;
  const highGuard = horizontal ? rectEndX(area) : rectEndY(area);
  const band = findCenterFeatureBand(counts, length, lowGuard, highGuard);
  if (!band) return null;

  const search = horizontal
    ? { x: band.start, y: region.y, w: band.end - band.start, h: region.h }
    : { x: region.x, y: band.start, w: region.w, h: band.end - band.start };
  const bounds = alphaBoundsInRect(frame, search);
  if (!bounds) return null;

  const minPrimary = Math.max(5, Math.round(length * 0.025));
  const primary = horizontal ? bounds.w : bounds.h;
  const cross = horizontal ? bounds.h : bounds.w;
  if (primary < minPrimary || cross < 3) return null;
  return bounds;
}

function projectAlphaCounts(frame, rect, axis) {
  const threshold = Number(els.alphaThreshold.value);
  const data = state.keyedData.data;
  const width = state.keyedData.width;
  const length = axis === "x" ? frame.w : frame.h;
  const counts = new Array(length).fill(0);
  const search = normalizeRect(frame, rect, 1);
  for (let y = search.y; y < search.y + search.h; y += 1) {
    for (let x = search.x; x < search.x + search.w; x += 1) {
      const alpha = data[((frame.y + y) * width + frame.x + x) * 4 + 3];
      if (alpha <= threshold) continue;
      counts[axis === "x" ? x : y] += 1;
    }
  }
  return counts;
}

function findCenterFeatureBand(counts, length, lowGuard, highGuard) {
  const innerStart = clamp(Math.round(lowGuard), 0, Math.max(0, length - 2));
  const innerEnd = clamp(Math.round(highGuard), innerStart + 1, length);
  const smooth = smoothCounts(counts, 4);
  const inner = smooth.slice(innerStart, innerEnd).filter((value) => value > 0);
  if (inner.length < 3) return null;
  const sorted = [...inner].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const upper = sorted[Math.floor(sorted.length * 0.85)] || median;
  const max = Math.max(...inner, 1);
  if (max < 3 || max < median + 2) return null;
  const threshold = Math.max(median * 1.55, upper * 1.12, max * 0.48);
  const middle = length / 2;
  let best = null;
  let start = null;
  for (let i = innerStart; i < innerEnd; i += 1) {
    if (smooth[i] >= threshold) {
      if (start === null) start = i;
    } else if (start !== null) {
      best = chooseCenterRun(best, { start, end: i }, middle);
      start = null;
    }
  }
  if (start !== null) best = chooseCenterRun(best, { start, end: innerEnd }, middle);
  if (!best || best.end - best.start < Math.max(3, Math.round(length * 0.015))) return null;
  return {
    start: clamp(best.start - 3, innerStart, innerEnd - 1),
    end: clamp(best.end + 3, innerStart + 1, innerEnd),
  };
}

function constrainEdgeAreas(frame, areas) {
  const center = normalizeRect(frame, areas.center || findTransparentCenterRect(frame), 1);
  const constrained = {
    center,
    top: normalizeRect(frame, areas.top || sideDefaultRect(frame, center, "top"), 1),
    bottom: normalizeRect(frame, areas.bottom || sideDefaultRect(frame, center, "bottom"), 1),
    left: normalizeRect(frame, areas.left || sideDefaultRect(frame, center, "left"), 1),
    right: normalizeRect(frame, areas.right || sideDefaultRect(frame, center, "right"), 1),
  };
  if (areas.fixedRunsExplicit === true) constrained.fixedRunsExplicit = true;
  const explicitFixedSides = areas.fixedRunsExplicitSides || {};
  const constrainedExplicitFixedSides = {};
  const sourceTileRuns = areas.tileRuns || {};
  const tileRuns = {};
  for (const side of ["top", "bottom", "left", "right"]) {
    const runs = sourceTileRuns[side] || [];
    const axis = sideAxis(side);
    const normalizedRuns = runs
      .map((rect) => normalizeRect(frame, rect, 1))
      .map((rect) => rectIntersection(rect, constrained[side]))
      .filter((rect) => rect && rect.w > 0 && rect.h > 0)
      .sort((a, b) => rectPrimaryStart(a, axis) - rectPrimaryStart(b, axis));
    if (normalizedRuns.length > 0) tileRuns[side] = normalizedRuns;
  }
  if (Object.keys(tileRuns).length > 0) constrained.tileRuns = tileRuns;
  const sourceFixedRuns = areas.fixedRuns || {};
  const sourceMedallions = areas.medallions || {};
  const fixedRuns = {};
  for (const side of ["top", "bottom", "left", "right"]) {
    const axis = sideAxis(side);
    const useExplicitFixedRuns = areas.fixedRunsExplicit === true || explicitFixedSides[side] === true;
    if (explicitFixedSides[side] === true) constrainedExplicitFixedSides[side] = true;
    const gapRuns = fixedRunsForTileGaps(constrained[side], tileRuns[side] || [], axis);
    const sourceRuns = [
      ...(sourceFixedRuns[side] || []),
      ...(sourceMedallions[side] ? [sourceMedallions[side]] : []),
    ];
    const normalizedRuns = useExplicitFixedRuns || (gapRuns.length === 0 && !tileRuns[side]?.length)
      ? sourceRuns
          .map((rect) => rectIntersection(normalizeRect(frame, rect, 1), constrained[side]))
          .filter((rect) => rect && rect.w > 0 && rect.h > 0)
      : gapRuns;
    const clippedRuns = removeFixedRunTileOverlaps(normalizedRuns, tileRuns[side] || [], axis);
    const mergedRuns = mergeFixedRunsForArea(clippedRuns, axis);
    if (mergedRuns.length > 0) fixedRuns[side] = mergedRuns;
  }
  if (Object.keys(constrainedExplicitFixedSides).length > 0) constrained.fixedRunsExplicitSides = constrainedExplicitFixedSides;
  if (Object.keys(fixedRuns).length > 0) constrained.fixedRuns = fixedRuns;
  const medallions = representativeFixedMedallions(fixedRuns, constrained);
  if (Object.keys(medallions).length > 0) constrained.medallions = medallions;
  return constrained;
}

function getEdgeInsets(frame, areas) {
  const center = areas.center;
  return {
    left: center.x,
    top: center.y,
    right: Math.max(0, frame.w - center.x - center.w),
    bottom: Math.max(0, frame.h - center.y - center.h),
  };
}

function getEdgeRenderBands(frame, areas) {
  const insets = getEdgeInsets(frame, areas);
  let left = Math.max(insets.left, rectEndX(areas.left || { x: 0, w: 0 }));
  let right = Math.max(
    insets.right,
    frame.w - (areas.right?.x ?? frame.w),
  );
  let top = Math.max(insets.top, rectEndY(areas.top || { y: 0, h: 0 }));
  let bottom = Math.max(
    insets.bottom,
    frame.h - (areas.bottom?.y ?? frame.h),
  );
  [left, right] = fitBandPair(left, right, frame.w);
  [top, bottom] = fitBandPair(top, bottom, frame.h);
  return {
    left,
    right,
    top,
    bottom,
    centerW: Math.max(1, frame.w - left - right),
    centerH: Math.max(1, frame.h - top - bottom),
  };
}

function fitBandPair(start, end, total) {
  const maxTotal = Math.max(0, total - 1);
  let a = clamp(Math.round(start), 0, maxTotal);
  let b = clamp(Math.round(end), 0, maxTotal);
  if (a + b <= maxTotal) return [a, b];
  const scale = maxTotal / Math.max(1, a + b);
  a = Math.floor(a * scale);
  b = Math.max(0, maxTotal - a);
  return [a, b];
}

function edgeCornerBasis(areas, side) {
  const runs = areas.tileRuns?.[side] || [];
  if (runs.length === 0) return areas[side] || null;
  return runs.reduce((basis, run) => basis ? rectUnion(basis, run) : cloneRect(run), null);
}

function getCornerSourceAreas(frame, areas, bands = getEdgeRenderBands(frame, areas)) {
  const topBasis = edgeCornerBasis(areas, "top");
  const bottomBasis = edgeCornerBasis(areas, "bottom");
  const leftBasis = edgeCornerBasis(areas, "left");
  const rightBasis = edgeCornerBasis(areas, "right");
  const topEnd = clamp(rectEndX(topBasis || { x: bands.left, w: Math.max(1, frame.w - bands.left - bands.right) }), 0, frame.w);
  const bottomEnd = clamp(rectEndX(bottomBasis || { x: bands.left, w: Math.max(1, frame.w - bands.left - bands.right) }), 0, frame.w);
  const leftEnd = clamp(rectEndY(leftBasis || { y: bands.top, h: Math.max(1, frame.h - bands.top - bands.bottom) }), 0, frame.h);
  const rightEnd = clamp(rectEndY(rightBasis || { y: bands.top, h: Math.max(1, frame.h - bands.top - bands.bottom) }), 0, frame.h);
  const topLeftW = clamp(topBasis?.x ?? bands.left, 0, frame.w);
  const bottomLeftW = clamp(bottomBasis?.x ?? bands.left, 0, frame.w);
  const topLeftH = clamp(leftBasis?.y ?? bands.top, 0, frame.h);
  const topRightH = clamp(rightBasis?.y ?? bands.top, 0, frame.h);
  return {
    topLeft: { x: 0, y: 0, w: topLeftW, h: topLeftH },
    topRight: { x: topEnd, y: 0, w: frame.w - topEnd, h: topRightH },
    bottomLeft: { x: 0, y: leftEnd, w: bottomLeftW, h: frame.h - leftEnd },
    bottomRight: { x: bottomEnd, y: rightEnd, w: frame.w - bottomEnd, h: frame.h - rightEnd },
  };
}

function suggestSliceScanAreas(frame) {
  const suggestion = createSliceScanSuggestion(frame);
  return suggestion ? suggestion.areas : null;
}

function suggestSliceScanPatch(frame) {
  const suggestion = createSliceScanSuggestion(frame);
  if (!suggestion) return null;
  return constrainPatch(frame, patchFromSliceScanAreas(frame, suggestion.areas));
}

function createSliceScanSuggestion(frame) {
  if (!state.originalData || !state.keyedData) return null;
  const center = normalizeRect(frame, findTransparentCenterRect(frame), 1);
  const scans = {};
  for (const side of ["top", "bottom", "left", "right"]) {
    scans[side] = buildSideSliceScan(frame, center, side);
  }

  const areas = {
    center,
    top: sideAreaFromSliceScan(frame, center, "top", scans.top),
    bottom: sideAreaFromSliceScan(frame, center, "bottom", scans.bottom),
    left: sideAreaFromSliceScan(frame, center, "left", scans.left),
    right: sideAreaFromSliceScan(frame, center, "right", scans.right),
  };

  areas.tileRuns = buildSliceScanTileRuns(areas, scans);
  areas.fixedRuns = buildSliceScanFixedRuns(areas);
  areas.medallions = representativeFixedMedallions(areas.fixedRuns, areas);

  const constrained = constrainEdgeAreas(frame, areas);
  state.sliceScans.set(frame.id, scans);
  return { areas: constrained, scans };
}

function buildSideSliceScan(frame, center, side) {
  const length = sidePrimaryLength(frame, side);
  const validRange = sideValidPrimaryRange(center, side);
  const thickness = sideCrossThickness(frame, center, side);
  const alphaThreshold = Number(els.alphaThreshold.value);
  const width = state.originalData.width;
  const source = state.originalData.data;
  const profiles = new Array(length);
  const mass = new Array(length).fill(0);
  const validInside = new Array(length).fill(false);
  const alphaStart = new Array(length).fill(null);
  const alphaEnd = new Array(length).fill(null);
  const alphaLength = new Array(length).fill(0);
  const transparentInside = new Array(length).fill(false);

  for (let primary = 0; primary < length; primary += 1) {
    const sample = makeSideSliceProfile(frame, center, side, primary, thickness, width, source);
    profiles[primary] = sample.profile;
    mass[primary] = sample.mass;
    alphaStart[primary] = sample.alphaStart;
    alphaEnd[primary] = sample.alphaEnd;
    alphaLength[primary] = sample.alphaLength;
    transparentInside[primary] = primary >= validRange.start &&
      primary < validRange.end &&
      sampleInsideTransparent(frame, center, side, primary, alphaThreshold);
  }
  const lengthGate = buildSliceLengthGate(alphaStart, alphaEnd, alphaLength, transparentInside);
  for (let primary = 0; primary < length; primary += 1) {
    validInside[primary] = transparentInside[primary] && sliceWithinLengthGate(primary, alphaStart, alphaEnd, alphaLength, lengthGate);
  }

  const forward = new Array(Math.max(0, length - 1)).fill(Number.POSITIVE_INFINITY);
  const backward = new Array(length).fill(Number.POSITIVE_INFINITY);
  const pairScores = [];
  for (let i = 0; i < length - 1; i += 1) {
    const distance = compareSliceProfiles(profiles[i], profiles[i + 1], alphaThreshold);
    forward[i] = distance.score;
    backward[i + 1] = distance.score;
    if (validInside[i] && validInside[i + 1] && mass[i] > 0 && mass[i + 1] > 0) {
      pairScores.push(distance.score);
    }
  }

  const supportMassFloor = adaptiveMassFloor(mass, transparentInside);
  const supportDrawable = mass.map((value, i) => transparentInside[i] && value >= supportMassFloor);
  const massFloor = adaptiveMassFloor(mass, validInside);
  const drawable = mass.map((value, i) => validInside[i] && value >= massFloor);
  const baseThreshold = adaptiveLowThreshold(pairScores);
  const threshold = baseThreshold * getSliceThresholdScale();
  const stableRuns = findSliceStableRuns({
    forward,
    drawable,
    threshold,
    validStart: validRange.start,
    validEnd: validRange.end,
  });

  return {
    side,
    thickness,
    validStart: validRange.start,
    validEnd: validRange.end,
    profiles,
    mass,
    supportMassFloor,
    massFloor,
    supportDrawable,
    validInside,
    drawable,
    alphaStart,
    alphaEnd,
    alphaLength,
    lengthGate,
    forward,
    backward,
    baseThreshold,
    threshold,
    stableRuns,
  };
}

function getSliceThresholdScale() {
  return clamp(Number(els.sliceThreshold?.value || 70) / 100, 0.05, 1.6);
}

function getSliceBridgeGapRatio() {
  return clamp(Number(els.sliceBridgeGap?.value || 20) / 100, 0, 0.8);
}

function getSliceCornerGuardRatio() {
  return clamp(Number(els.sliceCornerGuard?.value || 12) / 100, 0, 0.4);
}

function getSliceLengthLimit() {
  return clamp(Number(els.sliceLengthLimit?.value ?? 2), 0, 20);
}

function makeSideSliceProfile(frame, center, side, primary, thickness, width, source) {
  const profile = new Float32Array((thickness + 2) * 4);
  let out = 4;
  let mass = 0;
  let alphaStart = null;
  let alphaEnd = null;
  const alphaThreshold = Number(els.alphaThreshold.value);
  for (let cross = 0; cross < thickness; cross += 1) {
    const point = sideProfilePoint(frame, center, side, primary, cross);
    const index = (point.y * width + point.x) * 4;
    const alpha = source[index + 3];
    if (alpha > alphaThreshold) {
      if (alphaStart === null) alphaStart = cross;
      alphaEnd = cross + 1;
    }
    const premultiply = alpha / 255;
    profile[out++] = source[index] * premultiply;
    profile[out++] = source[index + 1] * premultiply;
    profile[out++] = source[index + 2] * premultiply;
    profile[out++] = alpha;
    mass += alpha / 255;
  }
  return {
    profile,
    mass,
    alphaStart,
    alphaEnd,
    alphaLength: alphaStart === null ? 0 : alphaEnd - alphaStart,
  };
}

function buildSliceLengthGate(alphaStart, alphaEnd, alphaLength, transparentInside) {
  const starts = [];
  const ends = [];
  const lengths = [];
  for (let i = 0; i < alphaLength.length; i += 1) {
    if (!transparentInside[i] || alphaLength[i] <= 0 || alphaStart[i] === null || alphaEnd[i] === null) continue;
    starts.push(alphaStart[i]);
    ends.push(alphaEnd[i]);
    lengths.push(alphaLength[i]);
  }
  if (lengths.length < 3) return null;
  starts.sort((a, b) => a - b);
  ends.sort((a, b) => a - b);
  lengths.sort((a, b) => a - b);
  return {
    limit: getSliceLengthLimit(),
    start: percentileSorted(starts, 0.5),
    end: percentileSorted(ends, 0.5),
    length: percentileSorted(lengths, 0.5),
  };
}

function sliceWithinLengthGate(index, alphaStart, alphaEnd, alphaLength, gate) {
  if (!gate || alphaLength[index] <= 0 || alphaStart[index] === null || alphaEnd[index] === null) return alphaLength[index] > 0;
  const limit = gate.limit;
  return alphaStart[index] >= gate.start - limit &&
    alphaEnd[index] <= gate.end + limit &&
    alphaLength[index] <= gate.length + limit;
}

function sideProfilePoint(frame, center, side, primary, cross) {
  if (side === "top") return { x: frame.x + primary, y: frame.y + cross };
  if (side === "bottom") return { x: frame.x + primary, y: frame.y + frame.h - 1 - cross };
  if (side === "left") return { x: frame.x + cross, y: frame.y + primary };
  return { x: frame.x + frame.w - 1 - cross, y: frame.y + primary };
}

function sampleInsideTransparent(frame, center, side, primary, alphaThreshold) {
  const width = state.keyedData.width;
  const data = state.keyedData.data;
  let x = frame.x + primary;
  let y = frame.y + primary;
  if (side === "top") {
    y = frame.y + center.y;
  } else if (side === "bottom") {
    y = frame.y + rectEndY(center) - 1;
  } else if (side === "left") {
    x = frame.x + center.x;
  } else {
    x = frame.x + rectEndX(center) - 1;
  }
  if (x < frame.x || x >= frame.x + frame.w || y < frame.y || y >= frame.y + frame.h) return false;
  return data[(y * width + x) * 4 + 3] <= alphaThreshold;
}

function compareSliceProfiles(a, b, alphaThreshold) {
  if (!a || !b || a.length !== b.length) return { score: Number.POSITIVE_INFINITY, mean: Number.POSITIVE_INFINITY, p95: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY };
  const pixelCount = a.length / 4;
  const diffs = new Array(pixelCount);
  let sum = 0;
  let max = 0;
  let alphaMismatches = 0;
  for (let i = 0, pixel = 0; i < a.length; i += 4, pixel += 1) {
    const alphaA = a[i + 3];
    const alphaB = b[i + 3];
    const colorDiff = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    const alphaDiff = Math.abs(alphaA - alphaB);
    const diff = ((alphaDiff * 0.65) + (colorDiff * 0.35)) / 255 * 100;
    diffs[pixel] = diff;
    sum += diff;
    if (diff > max) max = diff;
    if ((alphaA > alphaThreshold) !== (alphaB > alphaThreshold)) alphaMismatches += 1;
  }
  diffs.sort((x, y) => x - y);
  const mean = sum / pixelCount;
  const p95 = diffs[Math.min(diffs.length - 1, Math.floor(diffs.length * 0.95))] || 0;
  const alphaMismatch = alphaMismatches / pixelCount * 100;
  return {
    score: mean * 0.42 + p95 * 0.46 + alphaMismatch * 0.12,
    mean,
    p95,
    max,
  };
}

function adaptiveMassFloor(mass, validInside) {
  const values = mass.filter((value, i) => validInside[i] && value > 0.01).sort((a, b) => a - b);
  if (values.length === 0) return 0.01;
  const p15 = percentileSorted(values, 0.15);
  const median = percentileSorted(values, 0.5);
  return Math.max(0.35, Math.min(median * 0.48, p15 * 0.9 + 0.15));
}

function adaptiveLowThreshold(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return Number.POSITIVE_INFINITY;
  if (sorted.length < 4) return percentileSorted(sorted, 0.75);
  const q20 = percentileSorted(sorted, 0.2);
  const q35 = percentileSorted(sorted, 0.35);
  const q50 = percentileSorted(sorted, 0.5);
  const q78 = percentileSorted(sorted, 0.78);
  const deviations = sorted.map((value) => Math.abs(value - q50)).sort((a, b) => a - b);
  const mad = percentileSorted(deviations, 0.5);
  const threshold = Math.max(q20 + 0.45, q35, q50 + mad * 1.55);
  return clamp(Math.min(q78, threshold), 0.6, 32);
}

function percentileSorted(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function findSliceStableRuns(scan) {
  const runs = [];
  const minLength = Math.max(3, Math.round((scan.validEnd - scan.validStart) * 0.025));
  let start = null;
  for (let i = scan.validStart; i < scan.validEnd - 1; i += 1) {
    const low = scan.drawable[i] && scan.drawable[i + 1] && scan.forward[i] <= scan.threshold;
    if (low && start === null) start = i;
    if ((!low || i === scan.validEnd - 2) && start !== null) {
      const end = low && i === scan.validEnd - 2 ? i + 2 : i + 1;
      if (end - start >= minLength) {
        const scores = scan.forward.slice(start, Math.max(start + 1, end - 1)).filter(Number.isFinite);
        const score = scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length);
        runs.push({ start, end, score });
      }
      start = null;
    }
  }
  return mergeSliceRuns(runs, 2);
}

function mergeSliceRuns(runs, maxGap) {
  if (runs.length <= 1) return runs;
  const merged = [runs[0]];
  for (let i = 1; i < runs.length; i += 1) {
    const previous = merged[merged.length - 1];
    const current = runs[i];
    if (current.start - previous.end <= maxGap) {
      const previousLength = previous.end - previous.start;
      const currentLength = current.end - current.start;
      previous.end = current.end;
      previous.score = ((previous.score * previousLength) + (current.score * currentLength)) / (previousLength + currentLength);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function sideAreaFromSliceScan(frame, center, side, scan) {
  const support = selectSideAreaSupport(scan);
  const cross = selectSideCrossSpan(scan);
  const centerBottom = rectEndY(center);
  const centerRight = rectEndX(center);
  const crossStart = cross?.start ?? 0;
  const crossSize = cross ? Math.max(1, cross.end - cross.start) : null;
  let rect;
  if (side === "top") {
    rect = { x: support.start, y: crossStart, w: support.end - support.start, h: crossSize ?? Math.max(1, center.y) };
  } else if (side === "bottom") {
    const h = crossSize ?? Math.max(1, frame.h - centerBottom);
    rect = { x: support.start, y: cross ? frame.h - cross.end : centerBottom, w: support.end - support.start, h };
  } else if (side === "left") {
    rect = { x: crossStart, y: support.start, w: crossSize ?? Math.max(1, center.x), h: support.end - support.start };
  } else {
    const w = crossSize ?? Math.max(1, frame.w - centerRight);
    rect = { x: cross ? frame.w - cross.end : centerRight, y: support.start, w, h: support.end - support.start };
  }
  return normalizeRect(frame, rect, 1);
}

function selectSideAreaSupport(scan) {
  const fallback = {
    start: scan.validStart,
    end: Math.max(scan.validStart + 1, scan.validEnd),
  };
  if (scan.validEnd <= scan.validStart + 1) return fallback;
  return drawableSpan(scan, scan.supportDrawable || scan.drawable) || fallback;
}

function selectSideCrossSpan(scan) {
  if (!scan || scan.thickness <= 0) return null;
  const drawable = scan.supportDrawable || scan.drawable;
  const starts = [];
  const ends = [];
  for (let i = scan.validStart; i < scan.validEnd; i += 1) {
    if (!drawable[i] || scan.alphaLength[i] <= 0 || scan.alphaStart[i] === null || scan.alphaEnd[i] === null) continue;
    starts.push(scan.alphaStart[i]);
    ends.push(scan.alphaEnd[i]);
  }
  if (starts.length === 0) return null;
  starts.sort((a, b) => a - b);
  ends.sort((a, b) => a - b);
  const start = clamp(Math.floor(percentileSorted(starts, 0.5)), 0, Math.max(0, scan.thickness - 1));
  const end = clamp(Math.ceil(percentileSorted(ends, 0.5)), start + 1, scan.thickness);
  return { start, end };
}

function selectSliceSupport(scan) {
  const fallback = {
    start: scan.validStart,
    end: Math.max(scan.validStart + 1, scan.validEnd),
  };
  if (scan.validEnd <= scan.validStart + 1) return fallback;

  const supportDrawable = scan.supportDrawable || scan.drawable;
  const massSpan = drawableSpan(scan, supportDrawable) || fallback;
  const usefulRuns = scan.stableRuns.filter((run) => run.end > massSpan.start && run.start < massSpan.end);
  if (usefulRuns.length === 0) return bestFallbackSliceSupport(scan, massSpan, supportDrawable);

  const groups = groupSliceRunsByBridge(usefulRuns, massSpan);
  const selected = selectSliceRunGroup(groups, massSpan);
  const first = selected[0];
  const last = selected[selected.length - 1];
  const margin = Math.max(1, Math.round((massSpan.end - massSpan.start) * 0.015));
  return {
    start: clamp(first.start - margin, massSpan.start, massSpan.end - 1),
    end: clamp(last.end + margin, massSpan.start + 1, massSpan.end),
  };
}

function bestFallbackSliceSupport(scan, span, drawable = scan.drawable) {
  let best = null;
  for (let i = span.start; i < span.end; i += 1) {
    if (!drawable[i]) continue;
    const left = i > span.start && drawable[i - 1] && Number.isFinite(scan.forward[i - 1]) ? scan.forward[i - 1] : null;
    const right = i < span.end - 1 && drawable[i + 1] && Number.isFinite(scan.forward[i]) ? scan.forward[i] : null;
    if (left === null || right === null) continue;
    const score = Math.max(left, right) * 0.7 + ((left + right) / 2) * 0.3;
    if (!best || score < best.score) {
      best = { index: i, score };
    }
  }
  if (best) return onePixelSpanAround(best.index, span);

  for (let i = span.start; i < span.end; i += 1) {
    if (!drawable[i]) continue;
    const left = i > span.start && drawable[i - 1] && Number.isFinite(scan.forward[i - 1]) ? scan.forward[i - 1] : null;
    const right = i < span.end - 1 && drawable[i + 1] && Number.isFinite(scan.forward[i]) ? scan.forward[i] : null;
    const score = Math.min(left ?? Number.POSITIVE_INFINITY, right ?? Number.POSITIVE_INFINITY);
    if (!Number.isFinite(score)) continue;
    if (!best || score < best.score) best = { index: i, score };
  }
  if (best) return onePixelSpanAround(best.index, span);

  for (let i = span.start; i < span.end - 1; i += 1) {
    if (!Number.isFinite(scan.forward[i])) continue;
    if (!best || scan.forward[i] < best.score) {
      best = { index: i, score: scan.forward[i] };
    }
  }
  if (best) return onePixelSpanAround(best.index, span);

  return onePixelSpanAround(span.start, span);
}

function onePixelSpanAround(index, span) {
  if (span.end <= span.start) return span;
  const start = clamp(Math.round(index), span.start, span.end - 1);
  return { start, end: start + 1 };
}

function groupSliceRunsByBridge(runs, span) {
  const maxBridge = Math.round((span.end - span.start) * getSliceBridgeGapRatio());
  const sorted = runs
    .map((run) => ({
      start: clamp(run.start, span.start, span.end),
      end: clamp(run.end, span.start, span.end),
      score: run.score,
    }))
    .filter((run) => run.end > run.start)
    .sort((a, b) => a.start - b.start);
  if (sorted.length <= 1) return sorted.length === 1 ? [sorted] : [];

  const groups = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = groups[groups.length - 1][groups[groups.length - 1].length - 1];
    const current = sorted[i];
    if (current.start - previous.end <= maxBridge) {
      groups[groups.length - 1].push(current);
    } else {
      groups.push([current]);
    }
  }
  return groups;
}

function selectSliceRunGroup(groups, span) {
  if (groups.length === 0) return [{ ...span, score: 0 }];
  const middle = (span.start + span.end) / 2;
  return groups
    .map((group) => {
      const first = group[0];
      const last = group[group.length - 1];
      const stableLength = group.reduce((sum, run) => sum + (run.end - run.start), 0);
      const coveredLength = last.end - first.start;
      const center = (first.start + last.end) / 2;
      const score = stableLength * 2 + coveredLength * 0.15 - Math.abs(center - middle) * 0.05;
      return { group, score };
    })
    .sort((a, b) => b.score - a.score)[0].group;
}

function drawableSpan(scan, drawable = scan.drawable) {
  let start = null;
  let end = null;
  for (let i = scan.validStart; i < scan.validEnd; i += 1) {
    if (!drawable[i]) continue;
    if (start === null) start = i;
    end = i + 1;
  }
  return start === null ? null : { start, end };
}

function buildSliceScanTileRuns(areas, scans) {
  const tileRuns = {};
  for (const side of ["top", "bottom", "left", "right"]) {
    const scan = scans[side];
    const area = areas[side];
    if (!scan || !area) continue;
    const axis = sideAxis(side);
    const areaStart = rectPrimaryStart(area, axis);
    const areaEnd = rectPrimaryEnd(area, axis);
    const areaSize = Math.max(1, areaEnd - areaStart);
    const minSize = Math.min(areaSize, Math.max(2, Math.round(areaSize * 0.015)));
    let primaryRuns = scan.stableRuns
      .map((run) => ({
        start: clamp(run.start, areaStart, areaEnd),
        end: clamp(run.end, areaStart, areaEnd),
      }))
      .filter((run) => run.end - run.start >= minSize);
    if (primaryRuns.length === 0) {
      const fallback = bestFallbackSliceSupport(scan, { start: areaStart, end: areaEnd }, scan.supportDrawable || scan.drawable);
      primaryRuns = [{
        start: clamp(fallback.start, areaStart, areaEnd),
        end: clamp(fallback.end, areaStart, areaEnd),
      }].filter((run) => run.end > run.start);
    }
    const runs = primaryRuns.map((run) => rectFromPrimarySpan(area, axis, run.start, run.end));
    if (runs.length > 0) tileRuns[side] = runs;
  }
  return tileRuns;
}

function buildSliceScanFixedRuns(areas) {
  const fixedRuns = {};
  for (const side of ["top", "bottom", "left", "right"]) {
    const area = areas[side];
    if (!area) continue;
    const axis = sideAxis(side);
    const mergedRuns = mergeFixedRunsForArea(fixedRunsForTileGaps(area, areas.tileRuns?.[side] || [], axis), axis);
    if (mergedRuns.length > 0) fixedRuns[side] = mergedRuns;
  }
  return fixedRuns;
}

function fixedRunsForTileGaps(area, tileRuns, axis) {
  if (!area || tileRuns.length < 2) return [];
  const areaStart = rectPrimaryStart(area, axis);
  const areaEnd = rectPrimaryEnd(area, axis);
  const runs = mergeOverlappingPrimaryRuns(tileRuns
    .map((run) => rectIntersection(run, area))
    .filter((run) => run && run.w > 0 && run.h > 0), axis);
  const gaps = [];
  for (let i = 0; i < runs.length - 1; i += 1) {
    const start = clamp(rectPrimaryEnd(runs[i], axis), areaStart, areaEnd);
    const end = clamp(rectPrimaryStart(runs[i + 1], axis), areaStart, areaEnd);
    if (end > start) gaps.push(rectFromPrimarySpan(area, axis, start, end));
  }
  return gaps;
}

function mergeOverlappingPrimaryRuns(runs, axis) {
  const sorted = runs
    .filter((rect) => rect && rect.w > 0 && rect.h > 0)
    .map(cloneRect)
    .sort((a, b) => rectPrimaryStart(a, axis) - rectPrimaryStart(b, axis));
  if (sorted.length <= 1) return sorted;
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = merged[merged.length - 1];
    const current = sorted[i];
    if (rectPrimaryStart(current, axis) <= rectPrimaryEnd(previous, axis)) {
      merged[merged.length - 1] = rectUnion(previous, current);
    } else {
      merged.push(current);
    }
  }
  return merged;
}

function removeFixedRunTileOverlaps(fixedRuns, tileRuns, axis) {
  const blockers = mergeOverlappingPrimaryRuns(tileRuns, axis);
  if (blockers.length === 0) return fixedRuns;
  const clipped = [];
  for (const fixed of fixedRuns) {
    let spans = [{ start: rectPrimaryStart(fixed, axis), end: rectPrimaryEnd(fixed, axis) }];
    for (const blocker of blockers) {
      const blockStart = rectPrimaryStart(blocker, axis);
      const blockEnd = rectPrimaryEnd(blocker, axis);
      spans = spans.flatMap((span) => {
        if (blockEnd <= span.start || blockStart >= span.end) return [span];
        const pieces = [];
        if (blockStart > span.start) pieces.push({ start: span.start, end: blockStart });
        if (blockEnd < span.end) pieces.push({ start: blockEnd, end: span.end });
        return pieces;
      });
      if (spans.length === 0) break;
    }
    for (const span of spans) {
      if (span.end <= span.start) continue;
      clipped.push(axis === "x"
        ? { x: span.start, y: fixed.y, w: span.end - span.start, h: fixed.h }
        : { x: fixed.x, y: span.start, w: fixed.w, h: span.end - span.start });
    }
  }
  return clipped;
}

function representativeFixedMedallions(fixedRuns, areas) {
  const medallions = {};
  for (const side of ["top", "bottom", "left", "right"]) {
    const runs = fixedRuns?.[side] || [];
    if (runs.length === 0) continue;
    const area = areas[side];
    const axis = sideAxis(side);
    const middle = (rectPrimaryStart(area, axis) + rectPrimaryEnd(area, axis)) / 2;
    const best = runs
      .map((rect) => {
        const start = rectPrimaryStart(rect, axis);
        const end = rectPrimaryEnd(rect, axis);
        const size = end - start;
        const center = (start + end) / 2;
        return { rect, rank: size - Math.abs(center - middle) * 0.08 };
      })
      .sort((a, b) => b.rank - a.rank)[0];
    if (best) medallions[side] = best.rect;
  }
  return medallions;
}

function patchFromSliceScanAreas(frame, areas) {
  const center = areas.center;
  const horizontalFeature = areas.medallions?.top || areas.medallions?.bottom || null;
  const verticalFeature = areas.medallions?.left || areas.medallions?.right || null;
  const xBand = axisFeatureBand(center.x, rectEndX(center), horizontalFeature, "x");
  const yBand = axisFeatureBand(center.y, rectEndY(center), verticalFeature, "y");
  return {
    v: {
      left: center.x,
      centerStart: xBand.start,
      centerEnd: xBand.end,
      right: rectEndX(center),
    },
    h: {
      top: center.y,
      centerStart: yBand.start,
      centerEnd: yBand.end,
      bottom: rectEndY(center),
    },
    mode: "tile",
  };
}

function axisFeatureBand(start, end, feature, axis) {
  if (feature) {
    const featureStart = axis === "x" ? feature.x : feature.y;
    const featureEnd = axis === "x" ? rectEndX(feature) : rectEndY(feature);
    return {
      start: clamp(featureStart, start + 1, end - 2),
      end: clamp(featureEnd, start + 2, end - 1),
    };
  }
  const center = Math.round((start + end) / 2);
  return {
    start: clamp(center - 1, start + 1, end - 2),
    end: clamp(center + 1, start + 2, end - 1),
  };
}

function sidePrimaryLength(frame, side) {
  return side === "top" || side === "bottom" ? frame.w : frame.h;
}

function sideValidPrimaryRange(center, side) {
  return side === "top" || side === "bottom"
    ? { start: center.x, end: rectEndX(center) }
    : { start: center.y, end: rectEndY(center) };
}

function sideCrossThickness(frame, center, side) {
  if (side === "top") return Math.max(0, center.y);
  if (side === "bottom") return Math.max(0, frame.h - rectEndY(center));
  if (side === "left") return Math.max(0, center.x);
  return Math.max(0, frame.w - rectEndX(center));
}

function suggestPatch(frame) {
  return suggestSliceScanPatch(frame);
}

function expandGuidesBySimilarity(frame, axis, guides, crossGuides) {
  const ranges = getAxisRailRanges(axis, guides);
  const crossRanges = getAxisCrossRanges(frame, axis, crossGuides);
  const context = createAxisSimilarityContext(frame, axis, ranges, crossRanges);
  if (!context) return { ...guides };

  const threshold = Number(els.similarityThreshold?.value || 3);
  const length = axis === "x" ? frame.w : frame.h;
  const minCenter = 1;
  const first = { ...ranges[0] };
  const second = { ...ranges[1] };

  while (first.start > 1 && context.distance(first.start - 1) <= threshold) {
    first.start -= 1;
  }
  while (first.end < second.start - minCenter && context.distance(first.end) <= threshold) {
    first.end += 1;
  }
  while (second.start > first.end + minCenter && context.distance(second.start - 1) <= threshold) {
    second.start -= 1;
  }
  while (second.end < length - 1 && context.distance(second.end) <= threshold) {
    second.end += 1;
  }

  return axis === "x"
    ? {
        left: first.start,
        centerStart: first.end,
        centerEnd: second.start,
        right: second.end,
      }
    : {
        top: first.start,
        centerStart: first.end,
        centerEnd: second.start,
        bottom: second.end,
      };
}

function getAxisRailRanges(axis, guides) {
  return axis === "x"
    ? [
        { start: guides.left, end: guides.centerStart },
        { start: guides.centerEnd, end: guides.right },
      ]
    : [
        { start: guides.top, end: guides.centerStart },
        { start: guides.centerEnd, end: guides.bottom },
      ];
}

function getAxisCrossRanges(frame, axis, crossGuides) {
  const ranges = axis === "x"
    ? [
        { start: 0, end: crossGuides.top },
        { start: crossGuides.bottom, end: frame.h },
      ]
    : [
        { start: 0, end: crossGuides.left },
        { start: crossGuides.right, end: frame.w },
      ];
  const crossLength = axis === "x" ? frame.h : frame.w;
  const normalized = ranges
    .map((range) => ({
      start: clamp(Math.round(range.start), 0, crossLength),
      end: clamp(Math.round(range.end), 0, crossLength),
    }))
    .filter((range) => range.end > range.start);
  return normalized.length > 0 ? normalized : [{ start: 0, end: crossLength }];
}

function createAxisSimilarityContext(frame, axis, ranges, crossRanges) {
  const width = state.originalData.width;
  const data = state.originalData.data;
  const seedIndexes = [];

  for (const range of ranges) {
    for (let i = range.start; i < range.end; i += 1) {
      seedIndexes.push(i);
    }
  }
  if (seedIndexes.length === 0) return null;

  const template = makeAxisProfile(frame, axis, seedIndexes[0], crossRanges, width, data);
  template.fill(0);
  for (const index of seedIndexes) {
    const profile = makeAxisProfile(frame, axis, index, crossRanges, width, data);
    for (let i = 0; i < template.length; i += 1) template[i] += profile[i];
  }
  for (let i = 0; i < template.length; i += 1) template[i] /= seedIndexes.length;

  return {
    distance(index) {
      const profile = makeAxisProfile(frame, axis, index, crossRanges, width, data);
      let total = 0;
      for (let i = 0; i < template.length; i += 1) {
        total += Math.abs(profile[i] - template[i]);
      }
      return (total / template.length / 255) * 100;
    },
  };
}

function makeAxisProfile(frame, axis, primary, crossRanges, width, data) {
  const length = crossRanges.reduce((sum, range) => sum + (range.end - range.start), 0) * 4;
  const profile = new Float32Array(length);
  let out = 0;
  for (const range of crossRanges) {
    for (let secondary = range.start; secondary < range.end; secondary += 1) {
      const x = axis === "x" ? frame.x + primary : frame.x + secondary;
      const y = axis === "x" ? frame.y + secondary : frame.y + primary;
      const index = (y * width + x) * 4;
      const alpha = guideAlphaAt(index, data);
      const premultiply = alpha / 255;
      profile[out++] = data[index] * premultiply;
      profile[out++] = data[index + 1] * premultiply;
      profile[out++] = data[index + 2] * premultiply;
      profile[out++] = alpha;
    }
  }
  return profile;
}

function guideAlphaAt(index, data) {
  return data[index + 3];
}

function smoothCounts(counts, radius) {
  return counts.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(counts.length - 1, i + radius); j += 1) {
      sum += counts[j];
      n += 1;
    }
    return sum / n;
  });
}

function chooseCenterRun(best, candidate, middle) {
  const candidateCenter = (candidate.start + candidate.end) / 2;
  const candidateScore = Math.abs(candidateCenter - middle) - (candidate.end - candidate.start) * 0.2;
  if (!best) return { ...candidate, score: candidateScore };
  return candidateScore < best.score ? { ...candidate, score: candidateScore } : best;
}

function constrainPatch(frame, patch) {
  const v = patch.v;
  const h = patch.h;
  v.left = clamp(Math.round(v.left), 1, Math.max(1, frame.w - 8));
  v.centerStart = clamp(Math.round(v.centerStart), v.left + 1, frame.w - 6);
  v.centerEnd = clamp(Math.round(v.centerEnd), v.centerStart + 1, frame.w - 4);
  v.right = clamp(Math.round(v.right), v.centerEnd + 1, frame.w - 1);

  h.top = clamp(Math.round(h.top), 1, Math.max(1, frame.h - 8));
  h.centerStart = clamp(Math.round(h.centerStart), h.top + 1, frame.h - 6);
  h.centerEnd = clamp(Math.round(h.centerEnd), h.centerStart + 1, frame.h - 4);
  h.bottom = clamp(Math.round(h.bottom), h.centerEnd + 1, frame.h - 1);
  return patch;
}

function renderAll() {
  updateControlLabels();
  renderColorStats();
  drawSource();
  renderFrameList();
  drawEditor();
  bindAreaInputs();
  renderProcessingPane();
  renderPreviews();
}

function renderColorStats() {
  if (!state.colorStats) return;
  const pct = (n) => `${((n / state.colorStats.total) * 100).toFixed(1)}%`;
  els.colorStats.innerHTML = [
    state.colorStats.sourceHasAlpha ? "<strong>Source alpha</strong> preserved" : "<strong>No source alpha</strong> detected",
    `${pct(state.colorStats.transparent)} transparent, ${pct(state.colorStats.partial)} partial alpha`,
    `${pct(state.colorStats.main)} main, ${pct(state.colorStats.secondary)} secondary, ${pct(state.colorStats.neutral)} neutral`,
  ].join("<br>");
}

function drawSource() {
  if (!state.sourceImage) return;
  const canvas = els.sourceCanvas;
  const ctx = sourceCtx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (els.sourceView.value === "original") {
    ctx.drawImage(state.originalCanvas, 0, 0);
  } else if (els.sourceView.value === "mask") {
    ctx.drawImage(state.maskCanvas, 0, 0);
  } else {
    drawChecker(ctx, canvas.width, canvas.height, 16);
    ctx.drawImage(getRenderCanvas(), 0, 0);
  }

  ctx.save();
  ctx.lineWidth = Math.max(2, canvas.width / 700);
  state.frames.forEach((frame) => {
    ctx.strokeStyle = frame.id === state.selectedId ? "#83bd6b" : "rgba(103, 168, 255, 0.82)";
    ctx.strokeRect(frame.x + 0.5, frame.y + 0.5, frame.w - 1, frame.h - 1);
  });
  if (state.sourceDrag) {
    const rect = dragRect(state.sourceDrag.start, state.sourceDrag.current);
    ctx.strokeStyle = "#d1a943";
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w, rect.h);
  }
  ctx.restore();
}

function renderFrameList() {
  els.frameList.innerHTML = "";
  for (const frame of state.frames) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `frame-item${frame.id === state.selectedId ? " selected" : ""}`;
    item.addEventListener("click", () => {
      selectFrameById(frame.id);
    });
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 82;
    const ctx = canvas.getContext("2d");
    drawChecker(ctx, canvas.width, canvas.height, 8);
    const scale = Math.min(canvas.width / frame.w, canvas.height / frame.h);
    const w = Math.max(1, frame.w * scale);
    const h = Math.max(1, frame.h * scale);
    ctx.drawImage(getRenderCanvas(), frame.x, frame.y, frame.w, frame.h, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    const label = document.createElement("span");
    label.textContent = `${frame.name} ${frame.w}x${frame.h}`;
    item.append(canvas, label);
    els.frameList.append(item);
  }
}

function drawEditor() {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas) {
    setCanvasSourceSize(els.editorCanvas, 1, 1);
    resizeCanvasBitmap(els.editorCanvas, 1, 1);
    setCanvasDisplayScale(els.editorCanvas, 1, 1, state.editorZoom);
    editorCtx.clearRect(0, 0, 1, 1);
    els.areaStats.textContent = "";
    els.selectionStats.textContent = "No frame selected.";
    return;
  }

  setCanvasSourceSize(els.editorCanvas, frame.w, frame.h);
  resizeCanvasBitmap(
    els.editorCanvas,
    Math.max(1, Math.round(frame.w * state.editorZoom)),
    Math.max(1, Math.round(frame.h * state.editorZoom)),
  );
  setCanvasDisplayScale(els.editorCanvas, frame.w, frame.h, state.editorZoom);
  editorCtx.setTransform(1, 0, 0, 1, 0, 0);
  editorCtx.clearRect(0, 0, els.editorCanvas.width, els.editorCanvas.height);
  editorCtx.imageSmoothingEnabled = false;
  editorCtx.save();
  editorCtx.scale(els.editorCanvas.width / frame.w, els.editorCanvas.height / frame.h);
  drawChecker(editorCtx, frame.w, frame.h, 10);
  editorCtx.drawImage(getRenderCanvas(), frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);

  editorCtx.save();
  editorCtx.lineWidth = onePixelLine(editorCtx);
  drawAreaRect(editorCtx, areas.center, "#d1a943", [8, 5], "center");
  drawTileRuns(editorCtx, areas.tileRuns || {});
  drawFixedRuns(editorCtx, areas.fixedRuns || {}, areas.medallions || {});
  drawSelectedSliceOutline(editorCtx);
  editorCtx.restore();
  editorCtx.restore();

  const insets = getEdgeInsets(frame, areas);
  const minW = insets.left + insets.right;
  const minH = insets.top + insets.bottom;
  const tileRunCount = Object.values(areas.tileRuns || {}).reduce((sum, runs) => sum + runs.length, 0);
  const fixedRunCount = Object.values(areas.fixedRuns || {}).reduce((sum, runs) => sum + runs.length, 0);
  els.areaStats.innerHTML = [
    `<strong>Transparent center</strong> ${formatRect(areas.center)}`,
    `Insets L${insets.left} T${insets.top} R${insets.right} B${insets.bottom}`,
    `Slices ${tileRunCount} / Medallion spans ${fixedRunCount}`,
  ].join("<br>");
  els.selectionStats.innerHTML = [
    `<strong>${frame.name}</strong> ${formatRect(frame)}`,
    `Full minimum ${minW}x${minH}`,
    `Top ${formatRect(areas.top)} / Bottom ${formatRect(areas.bottom)}`,
    `Left ${formatRect(areas.left)} / Right ${formatRect(areas.right)}`,
    `Source area ${frame.area.toLocaleString()} px`,
  ].join("<br>");
}

function sideHasTileRuns(areas, side) {
  return (areas.tileRuns?.[side] || []).length > 0;
}

function drawAreaRect(ctx, rect, color, dash, label) {
  if (rect.w <= 0 || rect.h <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.setLineDash(dash);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.w - 1), Math.max(0, rect.h - 1));
  ctx.globalAlpha = 0.15;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 1;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(label, rect.x + 3, rect.y + 3);
  drawAreaResizeHandles(ctx, rect, label);
  ctx.restore();
}

function drawAreaResizeHandles(ctx, rect, label) {
  if (label === "center") return;
  const handles = getAreaHandlePoints(label, rect);
  ctx.save();
  ctx.fillStyle = "#eef2e4";
  ctx.strokeStyle = "#10130e";
  for (const handle of handles) {
    ctx.fillRect(handle.x - 3, handle.y - 3, 7, 7);
    ctx.strokeRect(handle.x - 3.5, handle.y - 3.5, 8, 8);
  }
  ctx.restore();
}

function drawTileRuns(ctx, tileRuns) {
  ctx.save();
  ctx.lineWidth = onePixelLine(ctx);
  ctx.strokeStyle = "#d1a943";
  ctx.fillStyle = "rgba(209, 169, 67, 0.14)";
  ctx.setLineDash([3, 3]);
  for (const [side, runs] of Object.entries(tileRuns || {})) {
    runs.forEach((rect, index) => {
      drawEditableRunRect(ctx, side, rect, `${side} slice ${index + 1}`, false);
    });
  }
  ctx.restore();
}

function drawOverlayLabel(ctx, rect, label, color) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = "10px system-ui, sans-serif";
  ctx.textBaseline = "top";
  const x = clamp(rect.x + 3, 0, Math.max(0, canvasSourceWidth(ctx.canvas) - 8));
  const y = clamp(rect.y + 3, 0, Math.max(0, canvasSourceHeight(ctx.canvas) - 12));
  ctx.lineWidth = onePixelLine(ctx) * 3;
  ctx.strokeStyle = "rgba(12, 15, 10, 0.85)";
  ctx.strokeText(label, x, y);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
  ctx.restore();
}

function drawSelectedSliceOutline(ctx) {
  const selected = getSelectedSliceRun();
  if (!selected) return;
  const rect = selected.rect;
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = onePixelLine(ctx);
  ctx.strokeStyle = "#eef2e4";
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.w - 1), Math.max(0, rect.h - 1));
  if (selected.kind === "slice") drawRectEdgeHandles(ctx, rect);
  ctx.restore();
}

function drawFixedRuns(ctx, fixedRuns, medallions) {
  const hasFixedRuns = Object.values(fixedRuns).some((runs) => runs.length > 0);
  if (hasFixedRuns) {
    ctx.save();
    ctx.lineWidth = onePixelLine(ctx);
    ctx.strokeStyle = "#ff6d6d";
    ctx.fillStyle = "rgba(255, 109, 109, 0.13)";
    ctx.setLineDash([4, 3]);
    for (const [side, runs] of Object.entries(fixedRuns)) {
      runs.forEach((rect, index) => {
        const label = runs.length === 1 ? `${side} medallion` : `${side} medallion ${index + 1}`;
        drawEditableRunRect(ctx, side, rect, label, false, "#ffb1b1");
      });
    }
    ctx.restore();
    return;
  }
  drawMedallions(ctx, medallions);
}

function drawEditableRunRect(ctx, side, rect, label, handles = true, labelColor = "#eef2e4") {
  if (!rect || rect.w <= 0 || rect.h <= 0) return;
  const runFill = ctx.fillStyle;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.w - 1), Math.max(0, rect.h - 1));
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = labelColor;
  ctx.fillText(label, rect.x + 3, rect.y + 3);
  ctx.fillStyle = runFill;
  if (handles) drawEditableRunResizeHandles(ctx, side, rect);
}

function drawEditableRunResizeHandles(ctx, side, rect) {
  const handles = getAreaHandlePoints(side, rect);
  const previousDash = ctx.getLineDash();
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = "#eef2e4";
  ctx.strokeStyle = "#10130e";
  for (const handle of handles) {
    ctx.fillRect(handle.x - 3, handle.y - 3, 7, 7);
    ctx.strokeRect(handle.x - 3.5, handle.y - 3.5, 8, 8);
  }
  ctx.restore();
  ctx.setLineDash(previousDash);
}

function drawRectEdgeHandles(ctx, rect) {
  ctx.save();
  ctx.fillStyle = "#eef2e4";
  ctx.strokeStyle = "#10130e";
  for (const handle of getRectEdgeHandlePoints(rect)) {
    ctx.fillRect(handle.x - 3, handle.y - 3, 7, 7);
    ctx.strokeRect(handle.x - 3.5, handle.y - 3.5, 8, 8);
  }
  ctx.restore();
}

function drawMedallions(ctx, medallions) {
  ctx.save();
  ctx.lineWidth = onePixelLine(ctx);
  ctx.strokeStyle = "#ff6d6d";
  ctx.fillStyle = "rgba(255, 109, 109, 0.13)";
  ctx.setLineDash([4, 3]);
  for (const [side, rect] of Object.entries(medallions || {})) {
    drawEditableRunRect(ctx, side, rect, `${side} medallion`, false, "#ffb1b1");
  }
  ctx.restore();
}

function getAreaHandlePoints(side, rect) {
  if (side === "top" || side === "bottom") {
    const y = rect.y + rect.h / 2;
    return [
      { handle: "start", x: rect.x, y },
      { handle: "end", x: rect.x + rect.w, y },
    ];
  }
  const x = rect.x + rect.w / 2;
  return [
    { handle: "start", x, y: rect.y },
    { handle: "end", x, y: rect.y + rect.h },
  ];
}

function getRectEdgeHandlePoints(rect) {
  const midX = rect.x + rect.w / 2;
  const midY = rect.y + rect.h / 2;
  return [
    { handle: "left", x: rect.x, y: midY },
    { handle: "right", x: rect.x + rect.w, y: midY },
    { handle: "top", x: midX, y: rect.y },
    { handle: "bottom", x: midX, y: rect.y + rect.h },
  ];
}

function drawGuideLine(ctx, axis, value, length, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (axis === "v") {
    ctx.moveTo(value + 0.5, 0);
    ctx.lineTo(value + 0.5, length);
    ctx.stroke();
    ctx.fillRect(value - 3, 2, 7, 7);
    ctx.fillRect(value - 3, Math.round(length / 2) - 3, 7, 7);
    ctx.fillRect(value - 3, length - 9, 7, 7);
  } else {
    ctx.moveTo(0, value + 0.5);
    ctx.lineTo(length, value + 0.5);
    ctx.stroke();
    ctx.fillRect(2, value - 3, 7, 7);
    ctx.fillRect(Math.round(length / 2) - 3, value - 3, 7, 7);
    ctx.fillRect(length - 9, value - 3, 7, 7);
  }
}

function bindAreaInputs() {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  document.querySelectorAll("[data-area]").forEach((input) => {
    if (!frame || !areas) {
      input.value = "";
      input.disabled = true;
      return;
    }
    input.disabled = false;
    const [side, name] = input.dataset.area.split(".");
    input.max = name === "x" || name === "w" ? frame.w : frame.h;
    input.value = areas[side][name];
  });
}

function renderProcessingPane() {
  const selected = getSelectedSliceRun();
  const frame = getSelectedFrame();
  if (els.processSliceReadout) {
    els.processSliceReadout.innerHTML = selected
      ? `<strong>${selected.frame.name}</strong> ${selected.name}<br>${formatRect(selected.rect)}`
      : "Select a slice or side area in Areas.";
  }
  const controlsDisabled = state.processingBusy || !selected;
  document.querySelectorAll("[data-process-preset]").forEach((button) => {
    button.disabled = controlsDisabled;
  });
  if (els.processInsidePx) els.processInsidePx.disabled = state.processingBusy;
  if (els.processOutsidePx) els.processOutsidePx.disabled = state.processingBusy;
  if (els.resetSliceProcessBtn) {
    els.resetSliceProcessBtn.disabled = state.processingBusy || !selected || !state.processedPatches.has(selected.key);
  }
  if (els.resetFrameProcessBtn) {
    const hasFramePatch = Boolean(frame && [...state.processedPatches.keys()].some((key) => key.startsWith(`${frame.id}:`)));
    els.resetFrameProcessBtn.disabled = state.processingBusy || !hasFramePatch;
  }
}

function renderPreviews() {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  els.previewGrid.innerHTML = "";
  if (!frame || !areas) return;

  const fullMin = getEdgePreviewSize(frame, areas, "full");
  const cornersMin = getEdgePreviewSize(frame, areas, "corners");
  const preview = getPreviewFrameLayout(frame, areas, fullMin, cornersMin);

  const previewFrame = document.createElement("div");
  previewFrame.className = "preview-frame";
  const title = document.createElement("div");
  title.className = "preview-title";
  title.innerHTML = `<strong>Outer Box</strong><span>${preview.w}x${preview.h}</span>`;

  const stage = document.createElement("div");
  stage.className = "preview-stage";
  stage.style.width = `${preview.w}px`;
  stage.style.height = `${preview.h}px`;

  const outerCanvas = createPatchPreviewCanvas(frame, areas, { w: preview.w, h: preview.h });
  outerCanvas.className = "preview-outer-canvas";

  const stack = document.createElement("div");
  stack.className = "preview-inner-stack";
  stack.style.left = `${preview.innerX}px`;
  stack.style.top = `${preview.innerY}px`;
  stack.append(
    createPreviewMini(frame, areas, { name: "Minimum", w: fullMin.w, h: fullMin.h }),
    createPreviewMini(frame, areas, { name: "Corners", w: cornersMin.w, h: cornersMin.h, variant: "corners" })
  );

  stage.append(outerCanvas, stack);
  previewFrame.append(title, stage);
  els.previewGrid.append(previewFrame);
}

function applyCurrentSettingsToGridFrames() {
  if (state.frames.length === 0) return;
  const settings = cloneSettings(getUiSettings());
  const sideFlags = getAutoSideFlags();
  state.sliceScans.clear();
  for (const frame of state.frames) {
    const areas = suggestAutoEdgeAreas(frame, sideFlags);
    const patch = suggestAutoPatch(frame, areas);
    if (areas) state.edgeAreas.set(frame.id, areas);
    if (patch) state.patches.set(frame.id, patch);
    state.frameSettings.set(frame.id, cloneSettings(settings));
  }
  clearSelectedSlice(false);
  scheduleSaveCurrentImageState();
  renderAll();
}

function openGridView() {
  if (state.frames.length === 0) {
    setStatus("Detect frames before opening Grid View.");
    return;
  }
  hideEditorContextMenu();
  if (!state.gridView.active) {
    applyCurrentSettingsToGridFrames();
    state.gridView.active = true;
  }
  state.gridView.visible = true;
  if (els.gridViewModal) els.gridViewModal.hidden = false;
  document.body.classList.add("modal-open");
  renderGridView();
}

function closeGridView(endSession = false) {
  state.gridView.visible = false;
  if (endSession) state.gridView.active = false;
  if (els.gridViewModal) els.gridViewModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function selectGridFrame(frameId) {
  const frame = selectFrameById(frameId);
  if (!frame) return;
  closeGridView(false);
  setStatus(`${frame.name} selected. Adjust Areas, then open Grid View to return.`);
}

function renderGridView() {
  if (!els.gridViewGrid || !state.gridView.visible) return;
  els.gridViewGrid.innerHTML = "";
  if (els.gridFrameCount) {
    els.gridFrameCount.textContent = `${state.frames.length} frame${state.frames.length === 1 ? "" : "s"}`;
  }
  if (state.frames.length === 0) {
    const empty = document.createElement("div");
    empty.className = "grid-empty";
    empty.textContent = "No frames detected.";
    els.gridViewGrid.append(empty);
    return;
  }

  for (const frame of state.frames) {
    const areas = state.edgeAreas.get(frame.id) || suggestEdgeAreas(frame);
    if (!state.edgeAreas.has(frame.id)) state.edgeAreas.set(frame.id, areas);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `grid-frame-card${frame.id === state.selectedId ? " selected" : ""}`;
    card.addEventListener("click", () => selectGridFrame(frame.id));

    const title = document.createElement("div");
    title.className = "grid-card-title";
    const name = document.createElement("strong");
    name.textContent = frame.name;
    const size = document.createElement("span");
    size.textContent = `${frame.w}x${frame.h}`;
    title.append(name, size);

    const preview = document.createElement("div");
    preview.className = "grid-card-preview";
    preview.append(
      createGridMini(frame, areas, "Minimum", "full"),
      createGridMini(frame, areas, "Corners", "corners"),
    );
    card.append(title, preview);
    els.gridViewGrid.append(card);
  }
}

// Renders one labeled, self-contained preview for a grid card. Each variant gets
// its own canvas/box so the sections sit side by side instead of overlapping.
function createGridMini(frame, areas, label, variant) {
  const size = getEdgePreviewSize(frame, areas, variant);
  const maxW = 110;
  const maxH = 150;
  const scale = Math.min(maxW / Math.max(1, size.w), maxH / Math.max(1, size.h), 2);
  const canvas = document.createElement("canvas");
  canvas.className = "grid-mini-canvas";
  canvas.width = Math.max(1, Math.round(size.w * scale));
  canvas.height = Math.max(1, Math.round(size.h * scale));
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  renderEdgeFrame(ctx, frame, areas, size.w, size.h, state.previewMode, variant);

  const cell = document.createElement("div");
  cell.className = "grid-mini";
  const title = document.createElement("div");
  title.className = "grid-mini-title";
  title.innerHTML = `<strong>${label}</strong><span>${size.w}x${size.h}</span>`;
  const stage = document.createElement("div");
  stage.className = "grid-mini-stage";
  stage.append(canvas);
  cell.append(title, stage);
  return cell;
}

function getPreviewFrameLayout(frame, areas, fullMin, cornersMin) {
  const contentPad = 18;
  const labelHeight = 17;
  const stackGap = 10;
  const innerW = Math.max(fullMin.w, cornersMin.w);
  const innerH = labelHeight + fullMin.h + stackGap + labelHeight + cornersMin.h;
  const bands = getEdgeRenderBands(frame, areas);
  const leftBorder = bands.left;
  const rightBorder = bands.right;
  const topBorder = bands.top;
  const bottomBorder = bands.bottom;
  const w = Math.max(
    frame.w,
    Math.round(fullMin.w * 3),
    Math.round(cornersMin.w * 3),
    leftBorder + innerW + rightBorder + contentPad * 2
  );
  const h = Math.max(
    frame.h,
    topBorder + innerH + bottomBorder + contentPad * 2
  );
  const innerX = Math.round(leftBorder + (w - leftBorder - rightBorder - innerW) / 2);
  const innerY = Math.round(topBorder + contentPad);
  return { w, h, innerX, innerY };
}

function createPreviewMini(frame, areas, preset) {
  const item = document.createElement("div");
  item.className = "preview-mini";
  const title = document.createElement("div");
  title.className = "preview-mini-title";
  title.innerHTML = `<strong>${preset.name}</strong><span>${preset.w}x${preset.h}</span>`;
  item.append(title, createPatchPreviewCanvas(frame, areas, preset));
  return item;
}

function createPatchPreviewCanvas(frame, areas, preset) {
  const variant = preset.variant || "full";
  const canvas = document.createElement("canvas");
  canvas.width = preset.w;
  canvas.height = preset.h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, preset.w, preset.h);
  renderEdgeFrame(ctx, frame, areas, preset.w, preset.h, state.previewMode, variant);
  return canvas;
}

function getEdgePreviewSize(frame, areas, variant = "full") {
  const bands = getEdgeRenderBands(frame, areas);
  const corners = getCornerSourceAreas(frame, areas, bands);
  const centerW = variant === "full" ? Math.max(1, Math.round(areas.center.w * 0.35)) : 0;
  const centerH = variant === "full" ? Math.max(1, Math.round(areas.center.h * 0.35)) : 0;
  return {
    w: Math.max(
      1,
      bands.left + centerW + bands.right,
      corners.topLeft.w + centerW + corners.topRight.w,
      corners.bottomLeft.w + centerW + corners.bottomRight.w,
    ),
    h: Math.max(
      1,
      bands.top + centerH + bands.bottom,
      corners.topLeft.h + centerH + corners.bottomLeft.h,
      corners.topRight.h + centerH + corners.bottomRight.h,
    ),
  };
}

function renderEdgeFrame(ctx, frame, areas, dw, dh, mode, variant = "full") {
  const bands = getEdgeRenderBands(frame, areas);
  const sourceWidths = [bands.left, bands.centerW, bands.right];
  const sourceHeights = [bands.top, bands.centerH, bands.bottom];
  const destWidths = makeDestSlices(sourceWidths, [0, 2], dw);
  const destHeights = makeDestSlices(sourceHeights, [0, 2], dh);
  const dx = cumulative(destWidths);
  const dy = cumulative(destHeights);
  const corners = getCornerSourceAreas(frame, areas, bands);
  const cornerDests = getCornerDestRects(corners, dw, dh);
  const drawSource = (source, dest) => {
    if (source.w <= 0 || source.h <= 0 || dest.w <= 0 || dest.h <= 0) return;
    ctx.drawImage(
      getRenderCanvas(),
      frame.x + source.x,
      frame.y + source.y,
      source.w,
      source.h,
      dest.x,
      dest.y,
      dest.w,
      dest.h,
    );
  };

  if (variant !== "corners") {
    const edgeMode = mode === "mirror" ? "mirror" : mode;
    for (const side of ["top", "bottom", "left", "right"]) {
      const axis = sideAxis(side);
      const drawArea = edgeSideRenderArea(frame, areas, side, corners);
      drawSegmentedEdgeArea(ctx, frame, areas, side, sideDestRect(frame, areas, side, dx, dy, destWidths, destHeights, bands, drawArea, cornerDests, dw, dh), axis, edgeMode, drawArea);
    }
  }

  drawSource(corners.topLeft, cornerDests.topLeft);
  drawSource(corners.topRight, cornerDests.topRight);
  drawSource(corners.bottomLeft, cornerDests.bottomLeft);
  drawSource(corners.bottomRight, cornerDests.bottomRight);
}

function getCornerDestRects(corners, dw, dh) {
  const topScale = Math.min(1, dw / Math.max(1, corners.topLeft.w + corners.topRight.w));
  const bottomScale = Math.min(1, dw / Math.max(1, corners.bottomLeft.w + corners.bottomRight.w));
  const leftScale = Math.min(1, dh / Math.max(1, corners.topLeft.h + corners.bottomLeft.h));
  const rightScale = Math.min(1, dh / Math.max(1, corners.topRight.h + corners.bottomRight.h));
  const topLeft = {
    x: 0,
    y: 0,
    w: corners.topLeft.w * topScale,
    h: corners.topLeft.h * leftScale,
  };
  const topRight = {
    x: dw - corners.topRight.w * topScale,
    y: 0,
    w: corners.topRight.w * topScale,
    h: corners.topRight.h * rightScale,
  };
  const bottomLeft = {
    x: 0,
    y: dh - corners.bottomLeft.h * leftScale,
    w: corners.bottomLeft.w * bottomScale,
    h: corners.bottomLeft.h * leftScale,
  };
  const bottomRight = {
    x: dw - corners.bottomRight.w * bottomScale,
    y: dh - corners.bottomRight.h * rightScale,
    w: corners.bottomRight.w * bottomScale,
    h: corners.bottomRight.h * rightScale,
  };
  return { topLeft, topRight, bottomLeft, bottomRight };
}

function edgeSideRenderArea(frame, areas, side, corners) {
  const area = areas[side];
  const middle = side === "top"
    ? { x: rectEndX(corners.topLeft), y: area.y, w: Math.max(1, corners.topRight.x - rectEndX(corners.topLeft)), h: area.h }
    : side === "bottom"
      ? { x: rectEndX(corners.bottomLeft), y: area.y, w: Math.max(1, corners.bottomRight.x - rectEndX(corners.bottomLeft)), h: area.h }
      : side === "left"
        ? { x: area.x, y: rectEndY(corners.topLeft), w: area.w, h: Math.max(1, corners.bottomLeft.y - rectEndY(corners.topLeft)) }
        : { x: area.x, y: rectEndY(corners.topRight), w: area.w, h: Math.max(1, corners.bottomRight.y - rectEndY(corners.topRight)) };
  return rectIntersection(area, middle) || area;
}

function sideDestRect(frame, areas, side, dx, dy, destWidths, destHeights, bands = getEdgeRenderBands(frame, areas), area = areas[side], cornerDests = null, dw = 0, dh = 0) {
  if (side === "top") {
    const y = mapFixedAxis(area.y, area.h, 0, bands.top, dy[0], destHeights[0]);
    const left = cornerDests?.topLeft?.w ?? dx[1];
    const right = cornerDests?.topRight?.w ?? destWidths[2];
    return { x: left, y: y.start, w: Math.max(0, dw - left - right), h: y.size };
  }
  if (side === "bottom") {
    const y = mapFixedAxis(area.y, area.h, frame.h - bands.bottom, bands.bottom, dy[2], destHeights[2]);
    const left = cornerDests?.bottomLeft?.w ?? dx[1];
    const right = cornerDests?.bottomRight?.w ?? destWidths[2];
    return { x: left, y: y.start, w: Math.max(0, dw - left - right), h: y.size };
  }
  if (side === "left") {
    const x = mapFixedAxis(area.x, area.w, 0, bands.left, dx[0], destWidths[0]);
    const top = cornerDests?.topLeft?.h ?? dy[1];
    const bottom = cornerDests?.bottomLeft?.h ?? destHeights[2];
    return { x: x.start, y: top, w: x.size, h: Math.max(0, dh - top - bottom) };
  }
  const x = mapFixedAxis(area.x, area.w, frame.w - bands.right, bands.right, dx[2], destWidths[2]);
  const top = cornerDests?.topRight?.h ?? dy[1];
  const bottom = cornerDests?.bottomRight?.h ?? destHeights[2];
  return { x: x.start, y: top, w: x.size, h: Math.max(0, dh - top - bottom) };
}

function mapFixedAxis(sourceStart, sourceSize, bandStart, bandSize, destStart, destSize) {
  if (bandSize <= 0) return { start: destStart, size: Math.max(0, destSize) };
  const scale = destSize / bandSize;
  return {
    start: destStart + (sourceStart - bandStart) * scale,
    size: sourceSize * scale,
  };
}

function drawSegmentedEdgeArea(ctx, frame, areas, side, dest, axis, mode, sourceArea = areas[side]) {
  const area = sourceArea;
  const tileRuns = areas.tileRuns?.[side] || [];
  const explicitFixedRuns = areas.fixedRuns?.[side] || [];
  const fixedRuns = normalizedFixedRunsForRender(area, explicitFixedRuns, areas.medallions?.[side], axis);
  if (fixedRuns.length === 0) {
    drawEdgeArea(ctx, frame, area, dest, axis, mode, tileRuns);
    return;
  }

  const segments = buildEdgeSegments(area, fixedRuns, axis);
  const sizes = edgeSegmentDestSizes(segments, axis === "x" ? dest.w : dest.h, axis);
  let position = axis === "x" ? dest.x : dest.y;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const size = sizes[i] || 0;
    if (size <= 0) continue;
    if (axis === "x") {
      if (segment.kind === "fixed") {
        const cross = mapSubAxis(segment.rect.y, segment.rect.h, area.y, area.h, dest.y, dest.h);
        drawFixedRegion(ctx, frame, segment.rect, { x: position, y: cross.start, w: size, h: cross.size });
      } else {
        drawEdgeArea(ctx, frame, segment.rect, { x: position, y: dest.y, w: size, h: dest.h }, axis, mode, clipTileRunsToArea(tileRuns, segment.rect));
      }
    } else if (segment.kind === "fixed") {
      const cross = mapSubAxis(segment.rect.x, segment.rect.w, area.x, area.w, dest.x, dest.w);
      drawFixedRegion(ctx, frame, segment.rect, { x: cross.start, y: position, w: cross.size, h: size });
    } else {
      drawEdgeArea(ctx, frame, segment.rect, { x: dest.x, y: position, w: dest.w, h: size }, axis, mode, clipTileRunsToArea(tileRuns, segment.rect));
    }
    position += size;
  }
}

function normalizedFixedRunsForRender(area, fixedRuns, fallbackMedallion, axis) {
  const source = fixedRuns.length > 0 ? fixedRuns : (fallbackMedallion ? [fallbackMedallion] : []);
  const clipped = source
    .map((rect) => rectIntersection(rect, area))
    .filter((rect) => rect && rect.w > 0 && rect.h > 0);
  return mergeFixedRunsForArea(clipped, axis);
}

function buildEdgeSegments(area, fixedRuns, axis) {
  const sourceStart = rectPrimaryStart(area, axis);
  const sourceEnd = rectPrimaryEnd(area, axis);
  const segments = [];
  let cursor = sourceStart;
  for (const fixed of fixedRuns) {
    const fixedStart = clamp(rectPrimaryStart(fixed, axis), sourceStart, sourceEnd);
    const fixedEnd = clamp(rectPrimaryEnd(fixed, axis), fixedStart, sourceEnd);
    if (fixedEnd <= fixedStart) continue;
    if (fixedStart > cursor) {
      segments.push({ kind: "flex", rect: rectFromPrimarySpan(area, axis, cursor, fixedStart) });
    }
    segments.push({ kind: "fixed", rect: axis === "x"
      ? { x: fixedStart, y: fixed.y, w: fixedEnd - fixedStart, h: fixed.h }
      : { x: fixed.x, y: fixedStart, w: fixed.w, h: fixedEnd - fixedStart } });
    cursor = Math.max(cursor, fixedEnd);
  }
  if (cursor < sourceEnd) {
    segments.push({ kind: "flex", rect: rectFromPrimarySpan(area, axis, cursor, sourceEnd) });
  }
  return segments;
}

function edgeSegmentDestSizes(segments, destAxisSize, axis) {
  const sourceSizes = segments.map((segment) => Math.max(0, rectPrimaryEnd(segment.rect, axis) - rectPrimaryStart(segment.rect, axis)));
  const fixedTotal = segments.reduce((sum, segment, i) => sum + (segment.kind === "fixed" ? sourceSizes[i] : 0), 0);
  const flexTotal = segments.reduce((sum, segment, i) => sum + (segment.kind === "flex" ? Math.max(sourceSizes[i], 1) : 0), 0);
  if (destAxisSize <= 0) return segments.map(() => 0);
  if (flexTotal <= 0 || destAxisSize <= fixedTotal) {
    const scaleTotal = fixedTotal > 0 ? fixedTotal : sourceSizes.reduce((sum, size) => sum + size, 0);
    const scale = scaleTotal > 0 ? destAxisSize / scaleTotal : 0;
    return sourceSizes.map((size) => size * scale);
  }
  const remaining = Math.max(0, destAxisSize - fixedTotal);
  return segments.map((segment, i) => (
    segment.kind === "fixed"
      ? sourceSizes[i]
      : remaining * (Math.max(sourceSizes[i], 1) / flexTotal)
  ));
}

function drawSplitEdgeArea(ctx, frame, areas, side, dest, axis, mode) {
  const area = areas[side];
  const medallion = areas.medallions?.[side];
  const tileRuns = areas.tileRuns?.[side] || [];
  if (!medallion || !rectsOverlapOnAxis(area, medallion, axis)) {
    drawEdgeArea(ctx, frame, area, dest, axis, mode, tileRuns);
    return;
  }

  const sourceStart = axis === "x" ? area.x : area.y;
  const sourceEnd = axis === "x" ? rectEndX(area) : rectEndY(area);
  const medStart = clamp(axis === "x" ? medallion.x : medallion.y, sourceStart, sourceEnd);
  const medEnd = clamp(axis === "x" ? rectEndX(medallion) : rectEndY(medallion), medStart, sourceEnd);
  const beforeSource = Math.max(0, medStart - sourceStart);
  const afterSource = Math.max(0, sourceEnd - medEnd);
  const medSourceSize = Math.max(1, medEnd - medStart);
  const medDestSize = Math.min(axis === "x" ? dest.w : dest.h, medSourceSize);
  const stretchDestSize = Math.max(0, (axis === "x" ? dest.w : dest.h) - medDestSize);
  const sourceRunTotal = beforeSource + afterSource || 1;
  const beforeDest = stretchDestSize * (beforeSource / sourceRunTotal);
  const afterDest = stretchDestSize - beforeDest;

  if (axis === "x") {
    const medCross = mapSubAxis(medallion.y, medallion.h, area.y, area.h, dest.y, dest.h);
    if (beforeSource > 0 && beforeDest > 0) {
      const beforeArea = { x: area.x, y: area.y, w: beforeSource, h: area.h };
      drawEdgeArea(ctx, frame, beforeArea, { x: dest.x, y: dest.y, w: beforeDest, h: dest.h }, axis, mode, clipTileRunsToArea(tileRuns, beforeArea));
    }
    if (afterSource > 0 && afterDest > 0) {
      const afterArea = { x: medEnd, y: area.y, w: afterSource, h: area.h };
      drawEdgeArea(ctx, frame, afterArea, { x: dest.x + beforeDest + medDestSize, y: dest.y, w: afterDest, h: dest.h }, axis, mode, clipTileRunsToArea(tileRuns, afterArea));
    }
    drawFixedRegion(ctx, frame, medallion, { x: dest.x + beforeDest, y: medCross.start, w: medDestSize, h: medCross.size });
  } else {
    const medCross = mapSubAxis(medallion.x, medallion.w, area.x, area.w, dest.x, dest.w);
    if (beforeSource > 0 && beforeDest > 0) {
      const beforeArea = { x: area.x, y: area.y, w: area.w, h: beforeSource };
      drawEdgeArea(ctx, frame, beforeArea, { x: dest.x, y: dest.y, w: dest.w, h: beforeDest }, axis, mode, clipTileRunsToArea(tileRuns, beforeArea));
    }
    if (afterSource > 0 && afterDest > 0) {
      const afterArea = { x: area.x, y: medEnd, w: area.w, h: afterSource };
      drawEdgeArea(ctx, frame, afterArea, { x: dest.x, y: dest.y + beforeDest + medDestSize, w: dest.w, h: afterDest }, axis, mode, clipTileRunsToArea(tileRuns, afterArea));
    }
    drawFixedRegion(ctx, frame, medallion, { x: medCross.start, y: dest.y + beforeDest, w: medCross.size, h: medDestSize });
  }
}

function mapSubAxis(sourceStart, sourceSize, parentStart, parentSize, destStart, destSize) {
  if (parentSize <= 0) return { start: destStart, size: Math.max(0, destSize) };
  const scale = destSize / parentSize;
  return {
    start: destStart + (sourceStart - parentStart) * scale,
    size: sourceSize * scale,
  };
}

function rectsOverlapOnAxis(a, b, axis) {
  if (axis === "x") return b.x < rectEndX(a) && rectEndX(b) > a.x;
  return b.y < rectEndY(a) && rectEndY(b) > a.y;
}

function drawEdgeArea(ctx, frame, area, dest, axis, mode, tileRuns = []) {
  const src = {
    x: frame.x + area.x,
    y: frame.y + area.y,
    w: area.w,
    h: area.h,
  };
  if (src.w <= 0 || src.h <= 0 || dest.w <= 0 || dest.h <= 0) return;
  if (mode === "stretch") {
    ctx.drawImage(getRenderCanvas(), src.x, src.y, src.w, src.h, dest.x, dest.y, dest.w, dest.h);
  } else if (tileRuns.length > 0) {
    drawTiledEdgeRuns(ctx, frame, tileRuns, dest, axis, mode === "mirror", mode === "tile_stretch");
  } else {
    drawTiledRegion(ctx, src, dest, axis === "x", axis === "y", mode === "mirror", mode === "tile_stretch");
  }
}

function clipTileRunsToArea(runs, area) {
  return runs
    .map((run) => rectIntersection(run, area))
    .filter((run) => run && run.w > 0 && run.h > 0);
}

function rectIntersection(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(rectEndX(a), rectEndX(b));
  const y2 = Math.min(rectEndY(a), rectEndY(b));
  if (x2 <= x || y2 <= y) return null;
  return { x, y, w: x2 - x, h: y2 - y };
}

function rectUnion(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(rectEndX(a), rectEndX(b));
  const y2 = Math.max(rectEndY(a), rectEndY(b));
  return { x, y, w: x2 - x, h: y2 - y };
}

function mergeFixedRunsForArea(runs, axis) {
  const sorted = runs
    .filter((rect) => rect && rect.w > 0 && rect.h > 0)
    .map(cloneRect)
    .sort((a, b) => rectPrimaryStart(a, axis) - rectPrimaryStart(b, axis));
  if (sorted.length <= 1) return sorted;
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = merged[merged.length - 1];
    const current = sorted[i];
    if (rectPrimaryStart(current, axis) <= rectPrimaryEnd(previous, axis) + 1) {
      merged[merged.length - 1] = rectUnion(previous, current);
    } else {
      merged.push(current);
    }
  }
  return merged;
}

function runPrimarySize(run, horizontal) {
  return horizontal ? run.w : run.h;
}

function repeatedRunSourceSize(runs, count, horizontal) {
  const cycleSize = runs.reduce((sum, run) => sum + runPrimarySize(run, horizontal), 0);
  const fullCycles = Math.floor(count / runs.length);
  let total = cycleSize * fullCycles;
  for (let i = 0; i < count % runs.length; i += 1) {
    total += runPrimarySize(runs[i], horizontal);
  }
  return total;
}

function chooseTileStretchCount(destSize, tileSize) {
  if (destSize <= 0 || tileSize <= 0) return 1;
  return Math.max(1, Math.round(destSize / tileSize));
}

function chooseTileStretchRunCount(runs, destSize, horizontal) {
  const cycleSize = runs.reduce((sum, run) => sum + runPrimarySize(run, horizontal), 0);
  if (destSize <= 0 || cycleSize <= 0) return 1;
  const averageSize = cycleSize / runs.length;
  const estimate = Math.max(1, Math.round(destSize / averageSize));
  const start = Math.max(1, estimate - runs.length - 2);
  const end = Math.max(start, estimate + runs.length + 2);
  let bestCount = start;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let count = start; count <= end; count += 1) {
    const sourceSize = repeatedRunSourceSize(runs, count, horizontal);
    const diff = Math.abs(sourceSize - destSize);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestCount = count;
    }
  }
  return bestCount;
}

function drawTileStretchEdgeRuns(ctx, frame, runs, dest, axis) {
  const validRuns = runs.filter((run) => run.w > 0 && run.h > 0);
  if (validRuns.length === 0 || dest.w <= 0 || dest.h <= 0) return;
  const horizontal = axis === "x";
  const destStart = horizontal ? dest.x : dest.y;
  const destSize = horizontal ? dest.w : dest.h;
  const count = chooseTileStretchRunCount(validRuns, destSize, horizontal);
  const sourceSize = repeatedRunSourceSize(validRuns, count, horizontal);
  if (sourceSize <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(dest.x, dest.y, dest.w, dest.h);
  ctx.clip();

  const scale = destSize / sourceSize;
  const destEnd = destStart + destSize;
  let position = destStart;
  for (let tileIndex = 0; tileIndex < count; tileIndex += 1) {
    const run = validRuns[tileIndex % validRuns.length];
    const step = runPrimarySize(run, horizontal);
    const drawSize = tileIndex === count - 1 ? destEnd - position : step * scale;
    const source = {
      x: frame.x + run.x,
      y: frame.y + run.y,
      w: run.w,
      h: run.h,
    };
    const draw = horizontal
      ? { x: position, y: dest.y, w: drawSize, h: dest.h }
      : { x: dest.x, y: position, w: dest.w, h: drawSize };
    ctx.drawImage(getRenderCanvas(), source.x, source.y, source.w, source.h, draw.x, draw.y, draw.w, draw.h);
    position += drawSize;
  }
  ctx.restore();
}

function drawTiledEdgeRuns(ctx, frame, runs, dest, axis, mirror, stretchTiles = false) {
  const validRuns = runs.filter((run) => run.w > 0 && run.h > 0);
  if (validRuns.length === 0 || dest.w <= 0 || dest.h <= 0) return;
  if (stretchTiles) {
    drawTileStretchEdgeRuns(ctx, frame, validRuns, dest, axis);
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(dest.x, dest.y, dest.w, dest.h);
  ctx.clip();

  const horizontal = axis === "x";
  const destStart = horizontal ? dest.x : dest.y;
  const destEnd = horizontal ? dest.x + dest.w : dest.y + dest.h;
  let position = destStart;
  let tileIndex = 0;
  while (position < destEnd - 0.01) {
    const run = validRuns[tileIndex % validRuns.length];
    const step = horizontal ? run.w : run.h;
    if (step <= 0) break;
    const drawSize = Math.min(step, destEnd - position);
    const sourceSize = Math.min(step, drawSize);
    const source = horizontal
      ? { x: frame.x + run.x, y: frame.y + run.y, w: sourceSize, h: run.h }
      : { x: frame.x + run.x, y: frame.y + run.y, w: run.w, h: sourceSize };
    const draw = horizontal
      ? { x: position, y: dest.y, w: drawSize, h: dest.h }
      : { x: dest.x, y: position, w: dest.w, h: drawSize };

    if (mirror && tileIndex % 2 === 1) {
      ctx.save();
      if (horizontal) {
        ctx.translate(draw.x + draw.w, draw.y);
        ctx.scale(-1, 1);
        ctx.drawImage(getRenderCanvas(), frame.x + run.x + run.w - sourceSize, source.y, sourceSize, source.h, 0, 0, draw.w, draw.h);
      } else {
        ctx.translate(draw.x, draw.y + draw.h);
        ctx.scale(1, -1);
        ctx.drawImage(getRenderCanvas(), source.x, frame.y + run.y + run.h - sourceSize, source.w, sourceSize, 0, 0, draw.w, draw.h);
      }
      ctx.restore();
    } else {
      ctx.drawImage(getRenderCanvas(), source.x, source.y, source.w, source.h, draw.x, draw.y, draw.w, draw.h);
    }

    position += drawSize;
    tileIndex += 1;
  }
  ctx.restore();
}

function drawFixedRegion(ctx, frame, source, dest) {
  if (source.w <= 0 || source.h <= 0 || dest.w <= 0 || dest.h <= 0) return;
  ctx.drawImage(
    getRenderCanvas(),
    frame.x + source.x,
    frame.y + source.y,
    source.w,
    source.h,
    dest.x,
    dest.y,
    dest.w,
    dest.h,
  );
}

function getPatchSlices(frame, patch) {
  const xs = [0, patch.v.left, patch.v.centerStart, patch.v.centerEnd, patch.v.right, frame.w];
  const ys = [0, patch.h.top, patch.h.centerStart, patch.h.centerEnd, patch.h.bottom, frame.h];
  return {
    xs,
    ys,
    sw: xs.slice(1).map((x, i) => x - xs[i]),
    sh: ys.slice(1).map((y, i) => y - ys[i]),
  };
}

function getPreviewVariantConfig(variant = "full") {
  if (variant === "corners") {
    return {
      cols: [0, 4],
      rows: [0, 4],
      fixedCols: [0, 4],
      fixedRows: [0, 4],
      minUsesRuns: false,
    };
  }
  return {
    cols: [0, 1, 2, 3, 4],
    rows: [0, 1, 2, 3, 4],
    fixedCols: [0, 2, 4],
    fixedRows: [0, 2, 4],
    minRunSize: 0,
  };
}

function getPreviewVariantSize(frame, patch, variant = "full") {
  const slices = getPatchSlices(frame, patch);
  const config = getPreviewVariantConfig(variant);
  const runCols = config.cols.filter((col) => !config.fixedCols.includes(col));
  const runRows = config.rows.filter((row) => !config.fixedRows.includes(row));
  return {
    w: Math.max(1, Math.round(
      config.fixedCols.reduce((sum, col) => sum + slices.sw[col], 0) +
      runCols.length * (config.minRunSize || 0),
    )),
    h: Math.max(1, Math.round(
      config.fixedRows.reduce((sum, row) => sum + slices.sh[row], 0) +
      runRows.length * (config.minRunSize || 0),
    )),
  };
}

function makeDestSlices(sourceSizes, fixedIndexes, destSize) {
  const fixedTotal = fixedIndexes.reduce((sum, i) => sum + sourceSizes[i], 0);
  const runIndexes = sourceSizes.map((_, i) => i).filter((i) => !fixedIndexes.includes(i));
  const result = new Array(sourceSizes.length).fill(0);
  if (destSize <= fixedTotal) {
    const scale = destSize / fixedTotal;
    fixedIndexes.forEach((i) => result[i] = sourceSizes[i] * scale);
    return result;
  }
  fixedIndexes.forEach((i) => result[i] = sourceSizes[i]);
  const runTotal = runIndexes.reduce((sum, i) => sum + sourceSizes[i], 0) || runIndexes.length;
  let used = fixedTotal;
  runIndexes.forEach((i, n) => {
    result[i] = n === runIndexes.length - 1 ? destSize - used : (destSize - fixedTotal) * ((sourceSizes[i] || 1) / runTotal);
    used += result[i];
  });
  return result;
}

function makeVariantDestLayout(sourceSizes, activeIndexes, fixedSourceIndexes, destSize) {
  const activeSizes = activeIndexes.map((index) => sourceSizes[index]);
  const fixedActiveIndexes = activeIndexes
    .map((sourceIndex, activeIndex) => fixedSourceIndexes.includes(sourceIndex) ? activeIndex : -1)
    .filter((index) => index >= 0);
  const destSizes = makeDestSlices(activeSizes, fixedActiveIndexes, destSize);
  const destPositions = cumulative(destSizes);
  const layout = new Map();
  activeIndexes.forEach((sourceIndex, activeIndex) => {
    layout.set(sourceIndex, {
      x: destPositions[activeIndex],
      w: destSizes[activeIndex],
    });
  });
  return layout;
}

function cumulative(sizes) {
  const values = [0];
  for (const size of sizes) values.push(values[values.length - 1] + size);
  return values;
}

function renderTwentyFivePatch(ctx, frame, patch, dw, dh, mode, variant = "full") {
  const { xs, ys, sw, sh } = getPatchSlices(frame, patch);
  const config = getPreviewVariantConfig(variant);
  const xLayout = makeVariantDestLayout(sw, config.cols, config.fixedCols, dw);
  const yLayout = makeVariantDestLayout(sh, config.rows, config.fixedRows, dh);

  for (const row of config.rows) {
    for (const col of config.cols) {
      if (!(row === 0 || row === 4 || col === 0 || col === 4)) continue;
      const colLayout = xLayout.get(col);
      const rowLayout = yLayout.get(row);
      if (!colLayout || !rowLayout) continue;
      const src = {
        x: frame.x + xs[col],
        y: frame.y + ys[row],
        w: sw[col],
        h: sh[row],
      };
      const dst = {
        x: colLayout.x,
        y: rowLayout.x,
        w: colLayout.w,
        h: rowLayout.w,
      };
      if (src.w <= 0 || src.h <= 0 || dst.w <= 0 || dst.h <= 0) continue;
      const horizontalRail = (row === 0 || row === 4) && (col === 1 || col === 3);
      const verticalRail = (col === 0 || col === 4) && (row === 1 || row === 3);
      if (mode === "stretch" || (!horizontalRail && !verticalRail)) {
        ctx.drawImage(getRenderCanvas(), src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h);
      } else {
        drawTiledRegion(ctx, src, dst, horizontalRail, verticalRail, mode === "mirror", mode === "tile_stretch");
      }
    }
  }
}

function renderNinePatch(ctx, frame, patch, dw, dh) {
  const xs = [0, patch.v.left, patch.v.right, frame.w];
  const ys = [0, patch.h.top, patch.h.bottom, frame.h];
  const sw = xs.slice(1).map((x, i) => x - xs[i]);
  const sh = ys.slice(1).map((y, i) => y - ys[i]);
  const dwParts = makeDestSlices(sw, [0, 2], dw);
  const dhParts = makeDestSlices(sh, [0, 2], dh);
  const dx = cumulative(dwParts);
  const dy = cumulative(dhParts);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (row === 1 && col === 1) continue;
      ctx.drawImage(
        getRenderCanvas(),
        frame.x + xs[col],
        frame.y + ys[row],
        sw[col],
        sh[row],
        dx[col],
        dy[row],
        dwParts[col],
        dhParts[row],
      );
    }
  }
}

function drawTileStretchRegion(ctx, src, dst, tileX, tileY) {
  if (src.w <= 0 || src.h <= 0 || dst.w <= 0 || dst.h <= 0) return;
  if (!tileX && !tileY) {
    ctx.drawImage(getRenderCanvas(), src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h);
    return;
  }
  const countX = tileX ? chooseTileStretchCount(dst.w, src.w) : 1;
  const countY = tileY ? chooseTileStretchCount(dst.h, src.h) : 1;
  const tileW = tileX ? dst.w / countX : dst.w;
  const tileH = tileY ? dst.h / countY : dst.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(dst.x, dst.y, dst.w, dst.h);
  ctx.clip();
  for (let row = 0; row < countY; row += 1) {
    for (let col = 0; col < countX; col += 1) {
      const x = dst.x + col * tileW;
      const y = dst.y + row * tileH;
      const w = col === countX - 1 ? dst.x + dst.w - x : tileW;
      const h = row === countY - 1 ? dst.y + dst.h - y : tileH;
      ctx.drawImage(getRenderCanvas(), src.x, src.y, src.w, src.h, x, y, w, h);
    }
  }
  ctx.restore();
}

function drawTiledRegion(ctx, src, dst, tileX, tileY, mirror, stretchTiles = false) {
  if (stretchTiles) {
    drawTileStretchRegion(ctx, src, dst, tileX, tileY);
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(dst.x, dst.y, dst.w, dst.h);
  ctx.clip();
  const stepX = tileX ? src.w : dst.w;
  const stepY = tileY ? src.h : dst.h;
  let tileIndex = 0;
  for (let y = dst.y; y < dst.y + dst.h - 0.01; y += stepY) {
    for (let x = dst.x; x < dst.x + dst.w - 0.01; x += stepX) {
      const w = Math.min(stepX, dst.x + dst.w - x);
      const h = Math.min(stepY, dst.y + dst.h - y);
      const sourceW = tileX ? Math.min(src.w, w) : src.w;
      const sourceH = tileY ? Math.min(src.h, h) : src.h;
      if (mirror && tileIndex % 2 === 1 && tileX) {
        ctx.save();
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(getRenderCanvas(), src.x + src.w - sourceW, src.y, sourceW, sourceH, 0, 0, w, h);
        ctx.restore();
      } else if (mirror && tileIndex % 2 === 1 && tileY) {
        ctx.save();
        ctx.translate(x, y + h);
        ctx.scale(1, -1);
        ctx.drawImage(getRenderCanvas(), src.x, src.y + src.h - sourceH, sourceW, sourceH, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(getRenderCanvas(), src.x, src.y, sourceW, sourceH, x, y, w, h);
      }
      tileIndex += 1;
    }
  }
  ctx.restore();
}

function resizeCanvasBitmap(canvas, width, height) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function setCanvasSourceSize(canvas, width, height) {
  canvas.dataset.sourceWidth = String(Math.max(1, Math.round(width)));
  canvas.dataset.sourceHeight = String(Math.max(1, Math.round(height)));
}

function canvasSourceWidth(canvas) {
  return Number(canvas.dataset.sourceWidth) || canvas.width;
}

function canvasSourceHeight(canvas) {
  return Number(canvas.dataset.sourceHeight) || canvas.height;
}

function setCanvasDisplayScale(canvas, width, height, scale) {
  canvas.style.width = `${Math.max(1, width * scale)}px`;
  canvas.style.height = `${Math.max(1, height * scale)}px`;
}

function onePixelLine(ctx) {
  const transform = ctx.getTransform();
  const scale = Math.max(Math.abs(transform.a) || 1, Math.abs(transform.d) || 1);
  return 1 / scale;
}

function setEditorZoom(value, anchorEvent = null) {
  const canvas = els.editorCanvas;
  const wrap = canvas.closest(".editor-canvas-wrap");
  const zoom = clamp(value, EDITOR_ZOOM_MIN, EDITOR_ZOOM_MAX);
  if (!wrap || Math.abs(zoom - state.editorZoom) < 0.001) return;

  const wrapRect = wrap.getBoundingClientRect();
  const anchorX = anchorEvent ? anchorEvent.clientX - wrapRect.left : wrap.clientWidth / 2;
  const anchorY = anchorEvent ? anchorEvent.clientY - wrapRect.top : wrap.clientHeight / 2;
  const sourceX = (wrap.scrollLeft + anchorX) / state.editorZoom;
  const sourceY = (wrap.scrollTop + anchorY) / state.editorZoom;

  state.editorZoom = zoom;
  drawEditor();
  requestAnimationFrame(() => {
    wrap.scrollLeft = sourceX * state.editorZoom - anchorX;
    wrap.scrollTop = sourceY * state.editorZoom - anchorY;
  });
}

function setProcessingStatus(message) {
  if (els.processStatus) els.processStatus.textContent = message || "";
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function cropCanvas(source, rect) {
  const canvas = createCanvas(rect.w, rect.h);
  canvas.getContext("2d").drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return canvas;
}

function frameSheetRect(frame, rect) {
  return { x: frame.x + rect.x, y: frame.y + rect.y, w: rect.w, h: rect.h };
}

function offsetCanvas1d(source, axis, amount) {
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  const span = axis === "x" ? source.width : source.height;
  if (span <= 1) {
    ctx.drawImage(source, 0, 0);
    return canvas;
  }
  const offset = ((Math.round(amount) % span) + span) % span;
  if (axis === "x") {
    ctx.drawImage(source, offset, 0);
    ctx.drawImage(source, offset - span, 0);
  } else {
    ctx.drawImage(source, 0, offset);
    ctx.drawImage(source, 0, offset - span);
  }
  return canvas;
}

function createBandMask(width, height, axis, bands) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  for (const band of bands) {
    const start = Math.round(band.start);
    const end = Math.round(band.end);
    if (end <= start) continue;
    if (axis === "x") {
      ctx.fillRect(start, 0, end - start, canvas.height);
    } else {
      ctx.fillRect(0, start, canvas.width, end - start);
    }
  }
  return canvas;
}

function createInsideMask(width, height, axis, pixels) {
  const span = axis === "x" ? width : height;
  const px = clamp(Math.round(pixels), 0, Math.max(0, span));
  if (px <= 0) return null;
  const center = Math.floor(span / 2);
  const start = clamp(center - px, 0, span - 1);
  const end = clamp(center + px, start + 1, span);
  return createBandMask(width, height, axis, [{ start, end }]);
}

function createOutsideMask(width, height, axis, sliceInBounds, pixels) {
  const span = axis === "x" ? width : height;
  const px = clamp(Math.round(pixels), 0, span);
  if (px <= 0) return null;
  const sliceStart = axis === "x" ? sliceInBounds.x : sliceInBounds.y;
  const sliceEnd = axis === "x" ? sliceInBounds.x + sliceInBounds.w : sliceInBounds.y + sliceInBounds.h;
  const bands = [
    { start: Math.max(0, sliceStart - px), end: Math.max(0, sliceStart) },
    { start: Math.min(span, sliceEnd), end: Math.min(span, sliceEnd + px) },
  ].filter((band) => band.end > band.start);
  return bands.length > 0 ? createBandMask(width, height, axis, bands) : null;
}

function loadCanvasFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Could not load processed image returned by GMIC."));
    img.src = dataUrl;
  });
}

async function runGmicInpaint(imageCanvas, maskCanvas, preset) {
  const response = await fetch("/api/gmic/inpaint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: imageCanvas.toDataURL("image/png"),
      mask: maskCanvas.toDataURL("image/png"),
      preset,
    }),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error || "GMIC processing failed.");
  }
  return loadCanvasFromDataUrl(payload.image);
}

function selectedSliceProcessBounds(frame, side, rect, outsidePx) {
  const axis = sideAxis(side);
  const sheet = frameSheetRect(frame, rect);
  if (axis === "x") {
    const x = Math.max(0, sheet.x - outsidePx);
    const x2 = Math.min(state.keyedCanvas.width, sheet.x + sheet.w + outsidePx);
    return {
      bounds: { x, y: sheet.y, w: Math.max(1, x2 - x), h: sheet.h },
      slice: { x: sheet.x - x, y: 0, w: sheet.w, h: sheet.h },
    };
  }
  const y = Math.max(0, sheet.y - outsidePx);
  const y2 = Math.min(state.keyedCanvas.height, sheet.y + sheet.h + outsidePx);
  return {
    bounds: { x: sheet.x, y, w: sheet.w, h: Math.max(1, y2 - y) },
    slice: { x: 0, y: sheet.y - y, w: sheet.w, h: sheet.h },
  };
}

async function processSelectedSlice(preset) {
  const selected = getSelectedSliceRun();
  if (!selected || state.processingBusy) return;
  const label = PROCESS_PRESETS[preset] || preset;
  const insidePx = clamp(Number(els.processInsidePx?.value || 0), 0, 128);
  const outsidePx = clamp(Number(els.processOutsidePx?.value || 0), 0, 128);
  const axis = sideAxis(selected.side);
  const offsetSpan = axis === "x" ? selected.rect.w : selected.rect.h;
  const offset = Math.floor(offsetSpan / 2);

  state.processingBusy = true;
  renderProcessingPane();
  setProcessingStatus(`${label}: preparing ${selected.name}...`);

  try {
    state.processedPatches.delete(selected.key);
    rebuildProcessedCanvas(false);
    const sourceCanvas = getRenderCanvas();
    const sheetRect = frameSheetRect(selected.frame, selected.rect);
    let seamlessSlice = cropCanvas(sourceCanvas, sheetRect);

    const insideMask = createInsideMask(seamlessSlice.width, seamlessSlice.height, axis, insidePx);
    if (insideMask && offset > 0) {
      setProcessingStatus(`${label}: making slice seamless...`);
      const offsetSlice = offsetCanvas1d(seamlessSlice, axis, offset);
      const inpaintedOffset = await runGmicInpaint(offsetSlice, insideMask, preset);
      seamlessSlice = offsetCanvas1d(inpaintedOffset, axis, -offset);
    }

    const { bounds, slice } = selectedSliceProcessBounds(selected.frame, selected.side, selected.rect, outsidePx);
    let patchCanvas = cropCanvas(sourceCanvas, bounds);
    patchCanvas.getContext("2d").drawImage(seamlessSlice, slice.x, slice.y);

    const outsideMask = createOutsideMask(patchCanvas.width, patchCanvas.height, axis, slice, outsidePx);
    if (outsideMask) {
      setProcessingStatus(`${label}: blending outside pixels...`);
      patchCanvas = await runGmicInpaint(patchCanvas, outsideMask, preset);
    }

    state.processedPatches.set(selected.key, {
      frameId: selected.frame.id,
      side: selected.side,
      index: selected.index,
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      canvas: patchCanvas,
      preset,
      insidePx,
      outsidePx,
    });
    rebuildProcessedCanvas(false);
    setProcessingStatus(`${label}: applied to ${selected.name}.`);
  } catch (error) {
    rebuildProcessedCanvas(false);
    const hint = location.protocol === "file:"
      ? " Start the local server with python3 server.py and open the local URL."
      : "";
    setProcessingStatus(`${error.message}${hint}`);
  } finally {
    state.processingBusy = false;
    renderAll();
  }
}

function fittedCanvasRect(canvas) {
  const rect = canvas.getBoundingClientRect();
  const canvasRatio = canvas.width / Math.max(1, canvas.height);
  const elementRatio = rect.width / Math.max(1, rect.height);
  let width = rect.width;
  let height = rect.height;
  let x = rect.left;
  let y = rect.top;

  if (elementRatio > canvasRatio) {
    width = height * canvasRatio;
    x += (rect.width - width) / 2;
  } else if (elementRatio < canvasRatio) {
    height = width / canvasRatio;
    y += (rect.height - height) / 2;
  }
  return { x, y, width, height };
}

function canvasPoint(event, canvas) {
  const rect = fittedCanvasRect(canvas);
  const sourceWidth = canvasSourceWidth(canvas);
  const sourceHeight = canvasSourceHeight(canvas);
  return {
    x: clamp(Math.round((event.clientX - rect.x) * (sourceWidth / rect.width)), 0, sourceWidth),
    y: clamp(Math.round((event.clientY - rect.y) * (sourceHeight / rect.height)), 0, sourceHeight),
    inside: event.clientX >= rect.x && event.clientX <= rect.x + rect.width && event.clientY >= rect.y && event.clientY <= rect.y + rect.height,
  };
}

function isFileDrag(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes("Files");
}

function isWindowDragLeave(event) {
  return event.clientX <= 0 ||
    event.clientY <= 0 ||
    event.clientX >= window.innerWidth ||
    event.clientY >= window.innerHeight;
}

function dragRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

function addManualFrame(rect) {
  if (rect.w < 8 || rect.h < 8) return;
  const id = `manual_${Date.now()}`;
  const frame = {
    id,
    name: `Manual ${state.frames.filter((f) => f.id.startsWith("manual")).length + 1}`,
    x: clamp(rect.x, 0, state.keyedData.width - 1),
    y: clamp(rect.y, 0, state.keyedData.height - 1),
    w: clamp(rect.w, 1, state.keyedData.width - rect.x),
    h: clamp(rect.h, 1, state.keyedData.height - rect.y),
    area: rect.w * rect.h,
  };
  state.frames.push(frame);
  state.frames.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  state.patches.set(id, suggestPatch(frame));
  state.edgeAreas.set(id, suggestEdgeAreas(frame));
  state.frameSettings.set(id, getUiSettings());
  state.selectedId = id;
  clearSelectedSlice(false);
  scheduleSaveCurrentImageState();
}

function selectFrameAt(point) {
  const hits = state.frames.filter((frame) => (
    point.x >= frame.x &&
    point.x <= frame.x + frame.w &&
    point.y >= frame.y &&
    point.y <= frame.y + frame.h
  ));
  if (hits.length === 0) return;
  hits.sort((a, b) => (a.w * a.h) - (b.w * b.h));
  selectFrameById(hits[0].id);
}

function findNearestGuide(point) {
  const frame = getSelectedFrame();
  const patch = getSelectedPatch();
  if (!frame || !patch) return null;
  const threshold = Math.max(5, Math.max(frame.w, frame.h) / 80);
  const candidates = [
    { axis: "v", name: "left", value: patch.v.left, distance: Math.abs(point.x - patch.v.left) },
    { axis: "v", name: "centerStart", value: patch.v.centerStart, distance: Math.abs(point.x - patch.v.centerStart) },
    { axis: "v", name: "centerEnd", value: patch.v.centerEnd, distance: Math.abs(point.x - patch.v.centerEnd) },
    { axis: "v", name: "right", value: patch.v.right, distance: Math.abs(point.x - patch.v.right) },
    { axis: "h", name: "top", value: patch.h.top, distance: Math.abs(point.y - patch.h.top) },
    { axis: "h", name: "centerStart", value: patch.h.centerStart, distance: Math.abs(point.y - patch.h.centerStart) },
    { axis: "h", name: "centerEnd", value: patch.h.centerEnd, distance: Math.abs(point.y - patch.h.centerEnd) },
    { axis: "h", name: "bottom", value: patch.h.bottom, distance: Math.abs(point.y - patch.h.bottom) },
  ];
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0].distance <= threshold ? candidates[0] : null;
}

function pointInExpandedRect(point, rect, padding = 0) {
  return point.x >= rect.x - padding &&
    point.x <= rect.x + rect.w + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.h + padding;
}

function findRectEdgeHandle(point, rect, threshold) {
  const candidates = [
    {
      handle: "left",
      distance: Math.abs(point.x - rect.x),
      inSpan: point.y >= rect.y - threshold && point.y <= rect.y + rect.h + threshold,
    },
    {
      handle: "right",
      distance: Math.abs(point.x - rect.x - rect.w),
      inSpan: point.y >= rect.y - threshold && point.y <= rect.y + rect.h + threshold,
    },
    {
      handle: "top",
      distance: Math.abs(point.y - rect.y),
      inSpan: point.x >= rect.x - threshold && point.x <= rect.x + rect.w + threshold,
    },
    {
      handle: "bottom",
      distance: Math.abs(point.y - rect.y - rect.h),
      inSpan: point.x >= rect.x - threshold && point.x <= rect.x + rect.w + threshold,
    },
  ].filter((candidate) => candidate.inSpan && candidate.distance <= threshold);
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.handle || null;
}

function findAreaSideAtPoint(point, areas) {
  const candidates = EDGE_SIDES
    .map((side) => ({ side, rect: areas[side] }))
    .filter(({ rect }) => rect && pointInExpandedRect(point, rect, 3));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.rect.w * a.rect.h) - (b.rect.w * b.rect.h));
  return candidates[0].side;
}

function editableRunEntries(runsBySide) {
  const entries = [];
  for (const side of EDGE_SIDES) {
    const runs = runsBySide?.[side] || [];
    runs.forEach((rect, index) => {
      entries.push({ side, index, rect });
    });
  }
  return entries;
}

function findEditableEntryHit(point, entries, kind, handleThreshold) {
  let bestHandle = null;
  const edgeThreshold = Math.min(handleThreshold, 3);
  for (const entry of entries) {
    const handle = findRectEdgeHandle(point, entry.rect, edgeThreshold);
    if (!handle) continue;
    const distance = handle === "left" || handle === "right"
      ? Math.abs(point.x - (handle === "left" ? entry.rect.x : entry.rect.x + entry.rect.w))
      : Math.abs(point.y - (handle === "top" ? entry.rect.y : entry.rect.y + entry.rect.h));
    if (!bestHandle || distance < bestHandle.distance) {
      bestHandle = { ...entry, kind, handle, distance };
    }
  }
  if (bestHandle) {
    const { distance, ...hit } = bestHandle;
    return { ...hit, rect: cloneRect(hit.rect), start: point };
  }

  const bodies = entries.filter((entry) => pointInExpandedRect(point, entry.rect, 3));
  if (bodies.length === 0) return null;
  bodies.sort((a, b) => (a.rect.w * a.rect.h) - (b.rect.w * b.rect.h));
  const hit = bodies[0];
  return { ...hit, kind, handle: "move", rect: cloneRect(hit.rect), start: point };
}

function findEditableRunHit(point, runsBySide, kind, handleThreshold) {
  return findEditableEntryHit(point, editableRunEntries(runsBySide), kind, handleThreshold);
}

function findAreaHit(point) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas) return null;
  const handleThreshold = Math.max(5, Math.max(frame.w, frame.h) / 90);
  const medallionHit = findEditableRunHit(point, areas.fixedRuns || {}, "medallion", handleThreshold);
  if (medallionHit) return medallionHit;
  const sliceHit = findEditableRunHit(point, areas.tileRuns || {}, "slice", handleThreshold);
  if (sliceHit) return sliceHit;
  for (const side of EDGE_SIDES) {
    if (sideHasTileRuns(areas, side)) continue;
    const rect = areas[side];
    for (const handle of getAreaHandlePoints(side, rect)) {
      if (Math.hypot(point.x - handle.x, point.y - handle.y) <= handleThreshold) {
        return { kind: "area", side, handle: handle.handle, rect: cloneRect(rect), start: point };
      }
    }
  }
  const candidates = EDGE_SIDES
    .filter((side) => !sideHasTileRuns(areas, side))
    .map((side) => ({ side, rect: areas[side] }))
    .filter(({ rect }) => pointInExpandedRect(point, rect, 3));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.rect.w * a.rect.h) - (b.rect.w * b.rect.h));
  const hit = candidates[0];
  return { kind: "area", side: hit.side, handle: "move", rect: cloneRect(hit.rect), start: point };
}

function updateGuide(axis, name, value) {
  const frame = getSelectedFrame();
  const patch = getSelectedPatch();
  if (!frame || !patch) return;
  patch[axis][name] = value;
  constrainPatch(frame, patch);
  rememberFrameSettings(frame);
  scheduleSaveCurrentImageState();
  renderAll();
}

function refreshAutoMedallions(frame, areas) {
  if (areas.fixedRunsExplicit === true) return;
  const detected = detectMedallions(frame, areas);
  for (const side of EDGE_SIDES) {
    if (areas.fixedRunsExplicitSides?.[side] === true && areas.medallions?.[side]) {
      detected[side] = areas.medallions[side];
    }
  }
  areas.medallions = detected;
}

function updateArea(side, name, value) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas[side]) return;
  if (state.hasProcessedPatches) clearProcessedFrame(frame.id, false);
  areas[side][name] = value;
  areas[side] = fitAreaToAlpha(frame, side, areas[side], areas.center);
  refreshAutoMedallions(frame, areas);
  state.edgeAreas.set(frame.id, constrainEdgeAreas(frame, areas));
  rememberFrameSettings(frame);
  scheduleSaveCurrentImageState();
  renderAll();
}

function moveArea(side, dx, dy, sourceRect) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas[side]) return;
  if (state.hasProcessedPatches) clearProcessedFrame(frame.id, false);
  areas[side] = normalizeRect(frame, {
    ...sourceRect,
    x: sourceRect.x + dx,
    y: sourceRect.y + dy,
  }, 1);
  areas[side] = fitAreaToAlpha(frame, side, areas[side], areas.center);
  refreshAutoMedallions(frame, areas);
  state.edgeAreas.set(frame.id, constrainEdgeAreas(frame, areas));
  rememberFrameSettings(frame);
  scheduleSaveCurrentImageState();
  renderAll();
}

function resizeArea(side, handle, point, sourceRect) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas[side]) return;
  if (state.hasProcessedPatches) clearProcessedFrame(frame.id, false);
  let next = cloneRect(sourceRect);
  if (side === "top" || side === "bottom") {
    if (handle === "start") {
      const end = rectEndX(sourceRect);
      next.x = clamp(point.x, 0, end - 1);
      next.w = end - next.x;
    } else {
      const end = clamp(point.x, sourceRect.x + 1, frame.w);
      next.w = end - sourceRect.x;
    }
  } else if (handle === "start") {
    const end = rectEndY(sourceRect);
    next.y = clamp(point.y, 0, end - 1);
    next.h = end - next.y;
  } else {
    const end = clamp(point.y, sourceRect.y + 1, frame.h);
    next.h = end - sourceRect.y;
  }
  areas[side] = fitAreaToAlpha(frame, side, next, areas.center);
  refreshAutoMedallions(frame, areas);
  state.edgeAreas.set(frame.id, constrainEdgeAreas(frame, areas));
  rememberFrameSettings(frame);
  scheduleSaveCurrentImageState();
  renderAll();
}

function clampRectInside(rect, bounds) {
  const maxW = Math.max(1, bounds.w);
  const maxH = Math.max(1, bounds.h);
  const w = clamp(Math.round(rect.w), 1, maxW);
  const h = clamp(Math.round(rect.h), 1, maxH);
  return {
    x: clamp(Math.round(rect.x), bounds.x, rectEndX(bounds) - w),
    y: clamp(Math.round(rect.y), bounds.y, rectEndY(bounds) - h),
    w,
    h,
  };
}

function defaultEditableRunRect(areas, side, point) {
  const area = areas[side];
  const axis = sideAxis(side);
  const areaStart = rectPrimaryStart(area, axis);
  const areaEnd = rectPrimaryEnd(area, axis);
  const span = Math.max(1, areaEnd - areaStart);
  const maxSize = Math.max(1, Math.min(span, 28));
  const minSize = Math.min(span, 3);
  const ratio = 0.16;
  const size = clamp(Math.round(span * ratio), minSize, maxSize);
  const primary = axis === "x" ? point.x : point.y;
  const start = clamp(Math.round(primary - size / 2), areaStart, areaEnd - size);
  return axis === "x"
    ? { x: start, y: area.y, w: size, h: area.h }
    : { x: area.x, y: start, w: area.w, h: size };
}

function setConstrainedAreas(frame, areas) {
  if (state.hasProcessedPatches) clearProcessedFrame(frame.id, false);
  state.edgeAreas.set(frame.id, constrainEdgeAreas(frame, areas));
  rememberFrameSettings(frame);
  scheduleSaveCurrentImageState();
  renderAll();
}

function cleanRunCollection(collection, side) {
  if (!collection) return;
  if (collection[side]?.length === 0) delete collection[side];
  if (Object.keys(collection).length === 0) return null;
  return collection;
}

function setRunCollectionSide(areas, key, side, runs) {
  if (runs.length > 0) {
    areas[key] ||= {};
    areas[key][side] = runs.map(cloneRect);
    return;
  }
  if (!areas[key]) return;
  delete areas[key][side];
  if (Object.keys(areas[key]).length === 0) delete areas[key];
}

function setMedallionForSide(areas, side, fixedRuns) {
  const medallion = representativeFixedMedallions({ [side]: fixedRuns }, areas)[side];
  if (medallion) {
    areas.medallions ||= {};
    areas.medallions[side] = cloneRect(medallion);
    return;
  }
  if (!areas.medallions) return;
  delete areas.medallions[side];
  if (Object.keys(areas.medallions).length === 0) delete areas.medallions;
}

function setExplicitFixedSide(areas, side, explicit) {
  if (explicit) {
    areas.fixedRunsExplicitSides ||= {};
    areas.fixedRunsExplicitSides[side] = true;
    return;
  }
  if (!areas.fixedRunsExplicitSides) return;
  delete areas.fixedRunsExplicitSides[side];
  if (Object.keys(areas.fixedRunsExplicitSides).length === 0) delete areas.fixedRunsExplicitSides;
}

function addSliceAt(side, point) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas[side]) return;
  clearProcessedFrame(frame.id, false);
  const rect = defaultEditableRunRect(areas, side, point);
  areas.tileRuns ||= {};
  areas.tileRuns[side] ||= [];
  areas.tileRuns[side].push(rect);
  setConstrainedAreas(frame, areas);
}

function setSliceRun(side, index, rect) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas[side] || !areas.tileRuns?.[side]?.[index]) return;
  clearProcessedSlice(frame.id, side, index, false);
  const runs = areas.tileRuns[side].map(cloneRect);
  runs[index] = clampRectInside(rect, areas[side]);
  areas.tileRuns[side] = runs;
  setConstrainedAreas(frame, areas);
}

function deleteSliceRun(side, index) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas.tileRuns?.[side]?.[index]) return;
  clearProcessedFrame(frame.id, false);
  if (state.selectedSlice?.kind === "slice" && state.selectedSlice?.frameId === frame.id && state.selectedSlice.side === side && state.selectedSlice.index === index) {
    clearSelectedSlice(false);
  }
  areas.tileRuns[side].splice(index, 1);
  areas.tileRuns = cleanRunCollection(areas.tileRuns, side);
  setConstrainedAreas(frame, areas);
}

function addMedallionAt(side, point) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas[side]) return;
  const rect = defaultEditableRunRect(areas, side, point);
  areas.fixedRuns ||= {};
  areas.fixedRuns[side] ||= [];
  areas.fixedRuns[side].push(rect);
  areas.fixedRunsExplicit = true;
  delete areas.medallions;
  setConstrainedAreas(frame, areas);
}

function setMedallionRun(side, index, rect) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas[side] || !areas.fixedRuns?.[side]?.[index]) return;
  const runs = areas.fixedRuns[side].map(cloneRect);
  runs[index] = clampRectInside(rect, areas[side]);
  areas.fixedRuns[side] = runs;
  areas.fixedRunsExplicit = true;
  delete areas.medallions;
  setConstrainedAreas(frame, areas);
}

function deleteMedallionRun(side, index) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas.fixedRuns?.[side]?.[index]) return;
  areas.fixedRuns[side].splice(index, 1);
  areas.fixedRuns = cleanRunCollection(areas.fixedRuns, side);
  areas.fixedRunsExplicit = true;
  delete areas.medallions;
  setConstrainedAreas(frame, areas);
}

function moveEditableRun(drag, point) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas[drag.side]) return;
  const next = clampRectInside({
    ...drag.rect,
    x: drag.rect.x + point.x - drag.start.x,
    y: drag.rect.y + point.y - drag.start.y,
  }, areas[drag.side]);
  if (drag.kind === "slice") {
    setSliceRun(drag.side, drag.index, next);
  } else if (drag.kind === "medallion") {
    setMedallionRun(drag.side, drag.index, next);
  }
}

function resizePrimaryRunRect(side, handle, point, sourceRect, bounds) {
  const next = cloneRect(sourceRect);
  if (side === "top" || side === "bottom") {
    if (handle === "start") {
      const end = rectEndX(sourceRect);
      next.x = clamp(point.x, bounds.x, end - 1);
      next.w = end - next.x;
    } else {
      const end = clamp(point.x, sourceRect.x + 1, rectEndX(bounds));
      next.w = end - sourceRect.x;
    }
  } else if (handle === "start") {
    const end = rectEndY(sourceRect);
    next.y = clamp(point.y, bounds.y, end - 1);
    next.h = end - next.y;
  } else {
    const end = clamp(point.y, sourceRect.y + 1, rectEndY(bounds));
    next.h = end - sourceRect.y;
  }
  return clampRectInside(next, bounds);
}

function resizeRectEdge(sourceRect, handle, point, bounds) {
  const next = cloneRect(sourceRect);
  if (handle === "left") {
    const end = rectEndX(sourceRect);
    next.x = clamp(point.x, bounds.x, end - 1);
    next.w = end - next.x;
  } else if (handle === "right") {
    const end = clamp(point.x, sourceRect.x + 1, rectEndX(bounds));
    next.w = end - sourceRect.x;
  } else if (handle === "top") {
    const end = rectEndY(sourceRect);
    next.y = clamp(point.y, bounds.y, end - 1);
    next.h = end - next.y;
  } else if (handle === "bottom") {
    const end = clamp(point.y, sourceRect.y + 1, rectEndY(bounds));
    next.h = end - sourceRect.y;
  }
  return clampRectInside(next, bounds);
}

function resizeEditableRun(drag, point) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas || !areas[drag.side]) return;
  const next = ["left", "right", "top", "bottom"].includes(drag.handle)
    ? resizeRectEdge(drag.rect, drag.handle, point, areas[drag.side])
    : resizePrimaryRunRect(drag.side, drag.handle, point, drag.rect, areas[drag.side]);
  if (drag.kind === "slice") {
    setSliceRun(drag.side, drag.index, next);
  } else if (drag.kind === "medallion") {
    setMedallionRun(drag.side, drag.index, next);
  }
}

function expandSelectedAxis(axis) {
  const frame = getSelectedFrame();
  const patch = getSelectedPatch();
  if (!frame || !patch) return;
  if (axis === "x") {
    patch.v = expandGuidesBySimilarity(frame, "x", patch.v, patch.h);
  } else {
    patch.h = expandGuidesBySimilarity(frame, "y", patch.h, patch.v);
  }
  constrainPatch(frame, patch);
  renderAll();
}

function getFrameExportSettings(frame) {
  const current = getUiSettings();
  const saved = state.frameSettings.get(frame.id);
  if (!saved) return current;
  return {
    colors: current.colors,
    detection: current.detection,
    areas: saved.areas || current.areas,
    previewMode: current.previewMode,
  };
}

function serializePatch(frame) {
  const patch = state.patches.get(frame.id) || suggestPatch(frame);
  const areas = state.edgeAreas.get(frame.id) || suggestEdgeAreas(frame);
  const corners = getCornerSourceAreas(frame, areas);
  const mode = state.previewMode === "mirror" ? "mirror" : state.previewMode;
  return {
    format: "transparent-edge-frame",
    version: 1,
    name: frame.name,
    image: state.imageName,
    sourceRect: [frame.x, frame.y, frame.w, frame.h],
    transparentCenter: rectToArray(areas.center),
    backgroundRect: rectToArray(findInteriorTransparentBounds(frame)),
    areas: {
      top: serializeEdgeSide(frame, areas, "top", "x", mode),
      bottom: serializeEdgeSide(frame, areas, "bottom", "x", mode),
      left: serializeEdgeSide(frame, areas, "left", "y", mode),
      right: serializeEdgeSide(frame, areas, "right", "y", mode),
      corners: {
        topLeft: rectToArray(corners.topLeft),
        topRight: rectToArray(corners.topRight),
        bottomLeft: rectToArray(corners.bottomLeft),
        bottomRight: rectToArray(corners.bottomRight),
      },
      medallions: Object.fromEntries(
        Object.entries(areas.medallions || {}).map(([side, rect]) => [side, rectToArray(expandRunFullCross(frame, side, rect, areas.center))]),
      ),
    },
    colors: {
      main: {
        sourceRole: "green",
        color: els.mainColor.value,
        recolor: Number(els.mainTint.value) / 100,
        desaturate: Number(els.mainDesaturate.value) / 100,
      },
      secondary: {
        sourceRole: "red",
        color: els.secondaryColor.value,
        recolor: Number(els.secondaryTint.value) / 100,
        desaturate: Number(els.secondaryDesaturate.value) / 100,
      },
    },
    alpha: {
      threshold: Number(els.alphaThreshold.value),
      source: "png-alpha",
    },
    settings: getFrameExportSettings(frame),
    legacyGrid: {
      columns: [0, patch.v.left, patch.v.centerStart, patch.v.centerEnd, patch.v.right, frame.w],
      rows: [0, patch.h.top, patch.h.centerStart, patch.h.centerEnd, patch.h.bottom, frame.h],
    },
    legacyFixed: {
      columns: [0, 2, 4],
      rows: [0, 2, 4],
    },
    legacyRails: {
      preferredMode: mode,
      horizontalCells: [[1, 0], [3, 0], [1, 4], [3, 4]],
      verticalCells: [[0, 1], [0, 3], [4, 1], [4, 3]],
    },
  };
}

function serializeEdgeSide(frame, areas, side, axis, mode) {
  const data = { source: rectToArray(areas[side]), axis, mode };
  const runs = areas.tileRuns?.[side] || [];
  if (runs.length > 0) data.tileRuns = runs.map(rectToArray);
  // Fixed runs (ornaments/gems) are exported at their FULL cross height so the
  // runtime can draw them sticking out past the thin edge strip without scanning
  // pixels itself. The detected runs are clamped to the strip, so expand here.
  const fixedRuns = (areas.fixedRuns?.[side] || []).map((r) => expandRunFullCross(frame, side, r, areas.center));
  if (fixedRuns.length > 0) data.fixedRuns = fixedRuns.map(rectToArray);
  return data;
}

function fileSlug(value, fallback = "export") {
  const slug = String(value || fallback)
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function imageFileBase() {
  return fileSlug(state.imageName, "image");
}

function frameFileBase(frame) {
  return fileSlug(frame.name, "frame");
}

function downloadBlob(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

function frameCropCanvas(frame) {
  const canvas = document.createElement("canvas");
  canvas.width = frame.w;
  canvas.height = frame.h;
  canvas.getContext("2d").drawImage(getRenderCanvas(), frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  return canvas;
}

function canvasToPngBytes(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      resolve(blob ? new Uint8Array(await blob.arrayBuffer()) : null);
    }, "image/png");
  });
}

function downloadFrameCrop(frame, prefix = "") {
  if (!frame) return;
  frameCropCanvas(frame).toBlob((blob) => {
    if (blob) downloadBlob(`${prefix}${frameFileBase(frame)}.png`, blob);
  }, "image/png");
}

// Minimal store-only (no compression) ZIP writer. PNGs/JSON are bundled into one
// file so a single download fires instead of a burst the browser would throttle.
const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function zipCrc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = ZIP_CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipBlob(entries) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff, true); return b; };
  const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; };
  const DOS_TIME = 0;
  const DOS_DATE = 0x21; // 1980-01-01, a valid placeholder date

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = zipCrc32(data);
    const localHeader = [
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes,
    ];
    let headerLen = 0;
    for (const part of localHeader) { chunks.push(part); headerLen += part.length; }
    chunks.push(data);
    central.push([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]);
    offset += headerLen + data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const record of central) {
    for (const part of record) { chunks.push(part); centralSize += part.length; }
  }
  const eocd = [
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralSize), u32(centralStart), u16(0),
  ];
  for (const part of eocd) chunks.push(part);
  return new Blob(chunks, { type: "application/zip" });
}

function downloadCurrentCrop() {
  downloadFrameCrop(getSelectedFrame());
}

function downloadTransparentSheet() {
  const canvas = getRenderCanvas();
  if (!canvas.width || !canvas.height) return;
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(`${imageFileBase()}.processed.png`, blob);
  }, "image/png");
}

function downloadCurrentJson() {
  const frame = getSelectedFrame();
  if (!frame) return;
  rememberFrameSettings(frame);
  flushPendingSave();
  downloadBlob(
    `${frameFileBase(frame)}.patch.json`,
    new Blob([JSON.stringify(serializePatch(frame), null, 2)], { type: "application/json" }),
  );
}

function downloadAllJson() {
  flushPendingSave();
  const payload = {
    image: state.imageName,
    generatedBy: "Frame Patch Lab",
    settings: getUiSettings(),
    frames: state.frames.map((frame) => serializePatch(frame)),
  };
  downloadBlob(
    `${imageFileBase()}.patches.json`,
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
  );
}

const ZIP_README = `Frame Patch Lab export
======================

Files in this archive:
  <image>.processed.png   The full keyed/inpainted sheet. Use THIS as the
                          texture in Godot — MultiPatchFrame indexes into it
                          via each frame's sourceRect.
  <image>.<frame>.png     One cropped PNG per detected frame (raw images, not
                          needed by MultiPatchFrame which uses the sheet).
  <image>.patches.json    Every frame's patch data ({ frames: [ ... ] }).

Godot usage:
  1. Copy MultiPatchFrame.gd (and MultiPatchFrameLoader.gd) into your project.
  2. Import <image>.processed.png and <image>.patches.json.
  3. var data = MultiPatchFrameLoader.load_patches("res://.../<image>.patches.json")
     var sheet = load("res://.../<image>.processed.png")
     var frame = MultiPatchFrameLoader.make_frame_by_name(sheet, data, "Frame 1")
     frame.size = Vector2(300, 120)
     add_child(frame)

See README.md in the Frame Patch Lab repo for full details.
`;

async function downloadAll() {
  flushPendingSave();
  setStatus("Bundling export...");
  const base = imageFileBase();
  const entries = [];

  const sheet = getRenderCanvas();
  if (sheet.width && sheet.height) {
    const bytes = await canvasToPngBytes(sheet);
    if (bytes) entries.push({ name: `${base}.processed.png`, data: bytes });
  }

  for (const frame of state.frames) {
    const bytes = await canvasToPngBytes(frameCropCanvas(frame));
    if (bytes) entries.push({ name: `${base}.${frameFileBase(frame)}.png`, data: bytes });
  }

  const payload = {
    image: state.imageName,
    generatedBy: "Frame Patch Lab",
    settings: getUiSettings(),
    frames: state.frames.map((frame) => serializePatch(frame)),
  };
  const encoder = new TextEncoder();
  entries.push({ name: `${base}.patches.json`, data: encoder.encode(JSON.stringify(payload, null, 2)) });
  entries.push({ name: "README.txt", data: encoder.encode(ZIP_README) });

  if (entries.length === 0) {
    setStatus("Nothing to export.");
    return;
  }
  downloadBlob(`${base}.zip`, buildZipBlob(entries));
  setStatus(`Exported ${base}.zip — sheet, ${state.frames.length} crop${state.frames.length === 1 ? "" : "s"}, and JSON.`);
}

function updateSliceScanControls() {
  updateControlLabels();
  const frame = getSelectedFrame();
  if (!frame) return;
  const sideFlags = getAutoSideFlags();
  const areas = suggestAutoEdgeAreas(frame, sideFlags);
  const patch = suggestAutoPatch(frame, areas);
  if (patch) state.patches.set(frame.id, patch);
  if (areas) state.edgeAreas.set(frame.id, areas);
  renderAll();
}

function editorMenuContext(point) {
  const frame = getSelectedFrame();
  const areas = getSelectedAreas();
  if (!frame || !areas) return { point, side: null, sliceHit: null, medallionHit: null };
  const handleThreshold = Math.max(5, Math.max(frame.w, frame.h) / 90);
  const sliceHit = findEditableRunHit(point, areas.tileRuns || {}, "slice", handleThreshold);
  const medallionHit = findEditableRunHit(point, areas.fixedRuns || {}, "medallion", handleThreshold);
  const side = medallionHit?.side || sliceHit?.side || findAreaSideAtPoint(point, areas);
  return { point, side, sliceHit, medallionHit };
}

function hideEditorContextMenu() {
  if (!els.editorContextMenu) return;
  els.editorContextMenu.hidden = true;
  els.editorContextMenu.innerHTML = "";
}

function addContextMenuButton(menu, label, enabled, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = !enabled;
  if (enabled) {
    button.addEventListener("click", () => {
      hideEditorContextMenu();
      action();
    });
  }
  menu.append(button);
}

function showEditorContextMenu(event) {
  event.preventDefault();
  const point = canvasPoint(event, els.editorCanvas);
  if (!point.inside || !els.editorContextMenu) {
    hideEditorContextMenu();
    return;
  }

  const context = editorMenuContext(point);
  const sliceLabel = context.sliceHit
    ? `Delete ${context.sliceHit.side} slice ${context.sliceHit.index + 1}`
    : "Delete Slice";
  const medallionLabel = context.medallionHit
    ? `Delete ${context.medallionHit.side} medallion ${context.medallionHit.index + 1}`
    : "Delete Medallion";
  const sideLabel = context.side ? `${context.side} ` : "";
  const menu = els.editorContextMenu;
  menu.innerHTML = "";
  addContextMenuButton(menu, `Add ${sideLabel}slice`, Boolean(context.side), () => addSliceAt(context.side, context.point));
  addContextMenuButton(menu, `Add ${sideLabel}medallion`, Boolean(context.side), () => addMedallionAt(context.side, context.point));
  addContextMenuButton(menu, sliceLabel, Boolean(context.sliceHit), () => deleteSliceRun(context.sliceHit.side, context.sliceHit.index));
  addContextMenuButton(menu, medallionLabel, Boolean(context.medallionHit), () => deleteMedallionRun(context.medallionHit.side, context.medallionHit.index));

  menu.hidden = false;
  const margin = 6;
  const left = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - margin);
  const top = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - margin);
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
}

function installEvents() {
  els.imageSelect.addEventListener("change", () => loadImage(els.imageSelect.value, els.imageSelect.value));
  els.fileInput.addEventListener("change", () => {
    loadImageFiles(els.fileInput.files);
    els.fileInput.value = "";
  });
  els.autoColorsBtn.addEventListener("click", () => {
    if (!state.originalData) return;
    const roleColors = sampleRoleColors(state.originalData);
    els.mainColor.value = rgbToHex(roleColors.main);
    els.secondaryColor.value = rgbToHex(roleColors.secondary);
    processImage();
    rememberFrameSettings();
    scheduleSaveCurrentImageState();
  });
  els.mainColor.addEventListener("input", () => {
    if (Number(els.mainTint.value) === 0) els.mainTint.value = 100;
    processImage();
    rememberFrameSettings();
    scheduleSaveCurrentImageState();
  });
  els.secondaryColor.addEventListener("input", () => {
    if (Number(els.secondaryTint.value) === 0) els.secondaryTint.value = 100;
    processImage();
    rememberFrameSettings();
    scheduleSaveCurrentImageState();
  });
  [els.mainTint, els.mainDesaturate, els.secondaryTint, els.secondaryDesaturate].forEach((input) => {
    input.addEventListener("input", () => {
      processImage();
      rememberFrameSettings();
      scheduleSaveCurrentImageState();
    });
  });
  [els.alphaThreshold, els.mergeGap, els.framePadding, els.minArea].forEach((input) => {
    input.addEventListener("input", () => {
      updateControlLabels();
      rememberFrameSettings();
      scheduleSaveCurrentImageState();
    });
  });
  [els.sliceThreshold, els.sliceBridgeGap, els.sliceCornerGuard, els.sliceLengthLimit].forEach((input) => {
    input?.addEventListener("input", () => {
      updateSliceScanControls();
      rememberFrameSettings();
      scheduleSaveCurrentImageState();
    });
  });
  els.autoSideInputs?.forEach((input) => {
    input.addEventListener("change", () => {
      rememberFrameSettings();
      scheduleSaveCurrentImageState();
    });
  });
  els.detectBtn.addEventListener("click", detectFrames);
  els.sourceView.addEventListener("change", drawSource);
  els.manualFrameBtn.addEventListener("click", () => {
    state.manualMode = !state.manualMode;
    els.manualFrameBtn.classList.toggle("active", state.manualMode);
  });
  els.autoGuidesBtn.addEventListener("click", () => {
    const frame = getSelectedFrame();
    if (!frame) return;
    const sideFlags = getAutoSideFlags();
    const areas = suggestAutoEdgeAreas(frame, sideFlags);
    const patch = suggestAutoPatch(frame, areas);
    if (patch) state.patches.set(frame.id, patch);
    if (areas) state.edgeAreas.set(frame.id, areas);
    rememberFrameSettings(frame);
    scheduleSaveCurrentImageState();
    renderAll();
  });
  els.gridViewBtn?.addEventListener("click", openGridView);
  els.gridViewCloseBtn?.addEventListener("click", () => closeGridView(true));
  els.gridApplyCurrentBtn?.addEventListener("click", () => {
    applyCurrentSettingsToGridFrames();
    state.gridView.active = true;
    state.gridView.visible = true;
    renderGridView();
    setStatus(`Applied current Areas settings to ${state.frames.length} frame${state.frames.length === 1 ? "" : "s"}.`);
  });
  document.querySelectorAll("[data-area]").forEach((input) => {
    input.addEventListener("change", () => {
      const [side, name] = input.dataset.area.split(".");
      updateArea(side, name, Number(input.value));
    });
  });
  document.querySelectorAll("[data-preview-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.previewMode = button.dataset.previewMode;
      document.querySelectorAll("[data-preview-mode]").forEach((b) => b.classList.toggle("active", b === button));
      rememberFrameSettings();
      scheduleSaveCurrentImageState();
      renderPreviews();
    });
  });
  els.downloadAllBtn.addEventListener("click", downloadAll);
  els.downloadCropBtn.addEventListener("click", downloadCurrentCrop);
  els.downloadSheetBtn.addEventListener("click", downloadTransparentSheet);
  els.downloadJsonBtn.addEventListener("click", downloadCurrentJson);
  els.downloadAllJsonBtn.addEventListener("click", downloadAllJson);
  document.querySelectorAll("[data-process-preset]").forEach((button) => {
    button.addEventListener("click", () => processSelectedSlice(button.dataset.processPreset));
  });
  els.resetSliceProcessBtn?.addEventListener("click", () => {
    const selected = getSelectedSliceRun();
    if (!selected) return;
    clearProcessedSlice(selected.frame.id, selected.side, selected.index);
    setProcessingStatus(`Reset ${selected.name}.`);
  });
  els.resetFrameProcessBtn?.addEventListener("click", () => {
    const frame = getSelectedFrame();
    if (!frame) return;
    clearProcessedFrame(frame.id);
    setProcessingStatus(`Reset processed slices for ${frame.name}.`);
  });

  els.sourceCanvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const point = canvasPoint(event, els.sourceCanvas);
    if (!point.inside) return;
    if (state.manualMode) {
      state.sourceDrag = { start: point, current: point };
      els.sourceCanvas.setPointerCapture(event.pointerId);
    } else {
      selectFrameAt(point);
    }
  });
  els.sourceCanvas.addEventListener("pointermove", (event) => {
    if (!state.sourceDrag) return;
    event.preventDefault();
    state.sourceDrag.current = canvasPoint(event, els.sourceCanvas);
    drawSource();
  });
  els.sourceCanvas.addEventListener("pointerup", (event) => {
    if (!state.sourceDrag) return;
    event.preventDefault();
    state.sourceDrag.current = canvasPoint(event, els.sourceCanvas);
    const rect = dragRect(state.sourceDrag.start, state.sourceDrag.current);
    state.sourceDrag = null;
    addManualFrame(rect);
    renderAll();
    flushPendingSave();
  });

  els.editorCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    hideEditorContextMenu();
    event.preventDefault();
    const point = canvasPoint(event, els.editorCanvas);
    if (!point.inside) return;
    const hit = findAreaHit(point);
    if (!hit) {
      clearSelectedSlice();
      return;
    }
    if (hit.kind === "slice") {
      selectSliceHit(hit);
    } else if (hit.kind === "area") {
      selectAreaSliceHit(hit);
    } else {
      clearSelectedSlice();
    }
    state.areaDrag = hit;
    els.editorCanvas.setPointerCapture(event.pointerId);
  });
  els.editorCanvas.addEventListener("pointermove", (event) => {
    if (!state.areaDrag) return;
    event.preventDefault();
    const point = canvasPoint(event, els.editorCanvas);
    if (state.areaDrag.handle === "move") {
      if (state.areaDrag.kind === "area") {
        moveArea(
          state.areaDrag.side,
          point.x - state.areaDrag.start.x,
          point.y - state.areaDrag.start.y,
          state.areaDrag.rect,
        );
      } else {
        moveEditableRun(state.areaDrag, point);
      }
    } else if (state.areaDrag.kind === "area") {
      resizeArea(state.areaDrag.side, state.areaDrag.handle, point, state.areaDrag.rect);
    } else {
      resizeEditableRun(state.areaDrag, point);
    }
  });
  els.editorCanvas.addEventListener("pointerup", (event) => {
    if (!state.areaDrag) return;
    event.preventDefault();
    state.areaDrag = null;
    flushPendingSave();
  });
  els.editorCanvas.addEventListener("pointercancel", () => {
    state.areaDrag = null;
    flushPendingSave();
  });
  els.editorCanvas.addEventListener("wheel", (event) => {
    const point = canvasPoint(event, els.editorCanvas);
    if (!point.inside) return;
    event.preventDefault();
    hideEditorContextMenu();
    const direction = event.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? 1.18 : 1 / 1.18;
    setEditorZoom(state.editorZoom * factor, event);
  }, { passive: false });
  els.editorCanvas.addEventListener("contextmenu", showEditorContextMenu);
  document.addEventListener("pointerdown", (event) => {
    if (els.editorContextMenu?.hidden || els.editorContextMenu?.contains(event.target)) return;
    hideEditorContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (state.gridView.visible) {
      closeGridView(true);
      return;
    }
    hideEditorContextMenu();
  });
  window.addEventListener("dragenter", (event) => {
    if (!isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    windowFileDragDepth += 1;
    document.body.classList.add("drag-over");
  });
  window.addEventListener("dragover", (event) => {
    if (!isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (event) => {
    if (!isFileDrag(event.dataTransfer)) return;
    windowFileDragDepth = isWindowDragLeave(event) ? 0 : Math.max(0, windowFileDragDepth - 1);
    if (windowFileDragDepth === 0) document.body.classList.remove("drag-over");
  });
  window.addEventListener("drop", (event) => {
    if (!isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    windowFileDragDepth = 0;
    document.body.classList.remove("drag-over");
    loadImageFiles(event.dataTransfer.files);
  });
  window.addEventListener("resize", hideEditorContextMenu);
  window.addEventListener("beforeunload", flushPendingSave);
}

initImageOptions();
installEvents();
loadImage(BUILTIN_IMAGES[0], BUILTIN_IMAGES[0]);
