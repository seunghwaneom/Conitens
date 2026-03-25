# Application Icons

Place platform-specific icon files here before running `pnpm electron:dist`.

## Required Files

| File | Size | Platform |
|------|------|----------|
| `win/icon.ico` | 256×256 (multi-resolution ICO) | Windows |
| `mac/icon.icns` | 1024×1024 (ICNS bundle) | macOS |
| `linux/512x512.png` | 512×512 PNG | Linux |
| `linux/256x256.png` | 256×256 PNG | Linux |
| `linux/128x128.png` | 128×128 PNG | Linux |

## Generating Icons from a Single Source PNG

If you have a 1024×1024 source PNG (`icon.png`), you can generate all
platform icons with the following tools:

```bash
# Install icon-gen (cross-platform)
npm install -g icon-gen

# Generate all icons from source PNG
icon-gen -i icon.png -o . --report
```

Or using ImageMagick:

```bash
# Windows ICO (multiple resolutions)
convert icon.png -resize 256x256 win/icon.ico

# macOS ICNS
# Requires macOS with iconutil:
mkdir icon.iconset
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o mac/icon.icns

# Linux PNGs
convert icon.png -resize 512x512 linux/512x512.png
convert icon.png -resize 256x256 linux/256x256.png
convert icon.png -resize 128x128 linux/128x128.png
```

## Development / CI

If icons are missing, electron-builder will use the default Electron icon
for development builds. Production distribution requires proper icons.

The `build/icons/` directory is git-ignored for binary files but `.gitkeep`
preserves the directory structure.
