# NEBULATOR 0.2

A Cemu-based Wii U front end: Cemu's emulation core + its own launcher UI.
Wii U runs today. Switch and Wii are placeholders ("coming soon") in the UI.

## What is in here
- `nebulator-core.patch` – patch for Cemu (base commit a53cf0e, MPL-2.0) that replaces the wxWidgets GUI with
  an SDL3 window system, a localhost control server and a Vulkan-only game window.
- `ui/` – the NEBULATOR interface (plain HTML/CSS/JS, no build step). Goes into `bin/ui/` next to the exe.
- `mock/` – a stand-in API server used to test the UI without the core.

## How it runs
One program, `nebulator-core`. It opens your browser-engine app window (Edge `--app` on Windows) showing the UI,
served from `127.0.0.1` with a per-install token. Pressing play creates the game window in the same process.
When the game closes, the program restarts itself back into the launcher.

## Features
Game carousel · Skylanders portal page (sliding figures, element-tinted background, emulated or real portal) ·
controller binding for players 1–4 with sound effects · graphics packs (browse/enable/presets/download) ·
settings (appearance, display, audio, game folders) · update/DLC viewer for titles you already own.
Themes: Nebula (own), Light, Dark.

## Building (Windows)
Same toolchain as Cemu: Visual Studio 2022, CMake, vcpkg (manifest in the repo, needs SDL3 added), Vulkan SDK.
1. Clone Cemu with submodules, `git checkout a53cf0e`, `git am` / `git apply nebulator-core.patch`.
2. Copy `ui/` to `bin/ui/`.
3. Configure + build target `CemuBin` (output `nebulator-core.exe`).
You also need your own `keys.txt`/game files exactly as for Cemu.

## Honest status
- Compiles and links on Linux against real Cemu sources; the real HTTP server and API routes were exercised
  there (auth, host check, path traversal, Skylander create, key binding). The UI passes 43 automated checks
  against the mock.
- **Never run on Windows or with real hardware or a real game** – I could not do that. Expect a first-build
  fix or two.
- Speed: same emulation core as Cemu, so about the same as Cemu, not faster. Smaller memory/disk footprint only.
- Does not follow Cemu updates automatically. Vulkan only (no OpenGL). No Wiimote/Classic controller support.
- No title download from Nintendo; Updates & DLC only reads what you already have.
- Real Skylanders portal on Windows needs a WinUSB driver (e.g. via Zadig). Element tints for Trap Team /
  SuperChargers figures are partly my guesses.
- Space key etc. may show as `key_32` in the binding list (cosmetic).
