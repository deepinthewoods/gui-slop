#!/usr/bin/env bash

set -euo pipefail

if (( $# != 0 )); then
  printf 'Usage: %s\n' "$(basename -- "$0")" >&2
  exit 2
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
output_dir=$(dirname -- "$script_dir")
done_dir="$script_dir/done"

if command -v magick >/dev/null 2>&1; then
  imagemagick=(magick)
elif command -v convert >/dev/null 2>&1; then
  imagemagick=(convert)
else
  printf 'ImageMagick was not found. Install ImageMagick and try again.\n' >&2
  exit 1
fi

shopt -s nullglob nocaseglob
input_images=("$script_dir"/*.png)
shopt -u nocaseglob

if (( ${#input_images[@]} == 0 )); then
  printf 'No PNG images found in: %s\n' "$script_dir" >&2
  exit 1
fi

mkdir -p -- "$done_dir"

for input_image in "${input_images[@]}"; do
  done_path="$done_dir/$(basename -- "$input_image")"
  if [[ -e $done_path ]]; then
    printf 'Cannot process images: archive file already exists: %s\n' "$done_path" >&2
    exit 1
  fi
done

primary_channels_tmp=
cleanup() {
  if [[ -n $primary_channels_tmp ]]; then
    rm -f -- "$primary_channels_tmp"
  fi
}
trap cleanup EXIT

for input_image in "${input_images[@]}"; do
  input_name=$(basename -- "$input_image")
  input_stem=${input_name%.*}

  binary_output="$output_dir/${input_stem}_primary_channels_binary_max_cutoff12.png"
  unpremultiplied_output="$output_dir/${input_stem}_primary_channels_unpremultiplied_maxrgb_cutoff16.png"
  primary_channels_tmp=$(mktemp "${TMPDIR:-/tmp}/primary-channels.XXXXXX.miff")

  # Collapse every non-black pixel into exactly one recoloring channel while
  # preserving its strongest-channel brightness. Red wins orange/yellow-red;
  # green also wins cyan whose green component is at least 80% of blue.
  "${imagemagick[@]}" \
    \( "$input_image" -colorspace sRGB -alpha off -write mpr:source +delete \) \
    \( mpr:source -fx 'r>=g && r>=b ? max(r,max(g,b)) : 0' \) \
    \( mpr:source -fx '!(r>=g && r>=b) && g>=0.8*b ? max(r,max(g,b)) : 0' \) \
    \( mpr:source -fx '!(r>=g && r>=b) && g<0.8*b ? max(r,max(g,b)) : 0' \) \
    -set colorspace sRGB -combine \
    "$primary_channels_tmp"

  # Technique 1: pixels below the approximately 12/255 max-RGB cutoff are fully
  # transparent; all pixels above it remain fully opaque.
  "${imagemagick[@]}" "$primary_channels_tmp" \
    \( +clone -separate -evaluate-sequence max -threshold 4.7% \) \
    -alpha off -compose CopyOpacity -composite \
    "$binary_output"

  # Technique 2: remove the black matte from RGB, make max-RGB values through
  # approximately 16/255 transparent, and map brighter values smoothly to alpha.
  "${imagemagick[@]}" "$primary_channels_tmp" \
    \( +clone -separate -evaluate-sequence max -write mpr:max_rgb +delete \) \
    mpr:max_rgb -compose DivideSrc -composite \
    \( mpr:max_rgb -level 6.3%,100% \) \
    -alpha off -compose CopyOpacity -composite \
    "$unpremultiplied_output"

  rm -f -- "$primary_channels_tmp"
  primary_channels_tmp=
  mv -- "$input_image" "$done_dir/$input_name"

  printf 'Created:\n  %s\n  %s\nArchived original:\n  %s\n' \
    "$binary_output" "$unpremultiplied_output" "$done_dir/$input_name"
done
