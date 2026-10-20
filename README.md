# NEBULATOR — get your Setup.exe

I (Claude) work in a Linux sandbox, so I can't compile a Windows program there. Instead this folder
contains everything needed for GitHub to build the Windows installer **for you, for free, in your browser**.
You don't install Visual Studio, CMake or anything else on your PC.

## Steps (about 10 minutes of clicking, then wait)
1. Make a free account at github.com and click **New repository** (name it `nebulator`, Private is fine).
2. On the new repo page click **uploading an existing file**, then drag in **everything inside this folder**
   (the `.github` folder, `installer`, `ui`, and `nebulator-core.patch`). Click **Commit changes**.
   - If the `.github` folder doesn't upload, use *Add file → Create new file*, name it
     `.github/workflows/build-nebulator.yml` and paste the file's contents.
3. Open the **Actions** tab → **Build NEBULATOR** → **Run workflow**. The first build takes roughly 40–70 minutes
   (it compiles all libraries); later ones are much faster.
4. When it turns green, open the run and download **NEBULATOR-Setup** (the installer) at the bottom.
   **NEBULATOR-portable** is a no-install zip version.
5. Unzip the download, run `NEBULATOR-Setup.exe`.

## What the installer does
- Installs per-user by default (no admin needed), Start Menu + optional desktop shortcut, uninstaller.
- Checks for what NEBULATOR really needs and tells you if it's missing: a Vulkan graphics driver
  (comes with NVIDIA/AMD/Intel drivers) and Microsoft Edge (falls back to your browser).
- Nothing else to install: the program is built fully static, so no Visual C++ redistributable, .NET, etc.
- Everything lives in one program: games, Skylanders portal page, controller binding, graphics packs,
  settings and updates/DLC are all pages inside NEBULATOR. Your data is stored in `%APPDATA%\NEBULATOR`
  (portable zip keeps it beside the program).

## Be aware
- The Windows build has never been run by me. If the workflow fails, open the failed step, copy the red error
  text and send it to me; I'll fix it.
- You still supply your own game files and Wii U `keys.txt`; NEBULATOR doesn't include or download games.
- See `CORE-NOTES.md` for what is and isn't verified.
