# Build and change the browser engine

## Current status

The browser compiles the recovered C++ App, ScriptContext/Lua, physics kernel, Network/RakNet, RbxView, RenderLib, GLG3D, AppDraw, Mesa 6.5 and supporting Boost code into one pthread-enabled WebAssembly module. The original OpenGL renderer runs inside the browser Worker using the repository's Mesa software backend. JavaScript copies its RGBA framebuffer to a canvas; it does not generate meshes, materials, lighting or scene draw calls. The original matching Windows targets remain separate.

| Feature | Verified status |
| --- | --- |
| Roblox Lua | Original ScriptContext, reflection, `game`, `workspace`, `Instance`, services and value types |
| Physics | Original scheduler, gravity, collision and pause/resume |
| Places | Original XML place loader; a simple Workspace/Part fixture is tested |
| Graphics | Original RbxView/RenderLib/GLG3D/Mesa path: stud textures, sky, materials, detailed meshes, transparency, lighting and original game GUI/font rendering |
| Networking | Original NetworkClient/NetworkServer/RakNet; two clients receive the included server's six Parts and replicate property changes through the server |
| Audio | Original Sound/SoundService through a Web Audio compatibility backend; loading, playback, pause/resume, looping, volume and positional attenuation |
| Character and input | Original model, Humanoid, PlayerController, Camera and UIEvent handling; browser events feed the original ControllerService |
| Local server | Included Node-hosted WASM engine, with its own example world |

**This is still an incomplete client port.** The original OpenGL source path is running, with character spawning, movement and jump checked against the included server. The Windows MFC/ATL editor shell and the separate Ogre rendering path are not ported. Some original platform services, editor commands, asset behavior and audio features remain incomplete. This targets the recovered 2007 protocol and does not provide present-day Roblox authentication or matchmaking.

Mesa renders on the CPU in WASM. There is no JavaScript replacement scene renderer and no native program streaming rendered images to the page. Large places can be slow. Browser rendering currently caps the framebuffer at 1280 by 1024 pixels.

The separate `workbench.html` retains the earlier standalone Lua VM and its `browser.*` transport/audio examples. Those bindings are not the main engine's Roblox API.

## 1. Tools

The verified Windows build uses Emscripten **6.0.13**, CMake, Ninja, Python 3.14 and Node 24. MSVC 8 is only needed for matching native builds.

Install Emscripten using its [official instructions](https://emscripten.org/docs/getting_started/downloads.html). In **Command Prompt**:

```bat
git clone https://github.com/emscripten-core/emsdk.git C:\emsdk
cd /d C:\emsdk
emsdk.bat install 6.0.13
emsdk.bat activate 6.0.13
emsdk_env.bat
```

Use the existing SDK directory if it is already installed. Run `emsdk_env.bat` in each new Command Prompt. Ensure `cmake`, `ninja`, `python`, `node` and `emcc` are on PATH. Emscripten's Node distribution includes npm; a separate Node installation also works.

## 2. Build

In the Emscripten-enabled Command Prompt:

```bat
cd /d C:\RBXDecomp-Web
python web/fetch_content.py
emcmake cmake -S . -B build-web -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-web --parallel 8
npm install --prefix web --ignore-scripts --no-audit --no-fund
```

The content setup downloads the client archive linked by the root README, verifies the complete archive SHA-256 and the recorded executable hash, then extracts 295 content files into the ignored `web/content/` directory. It does not install or run the original executable or DLLs. CMake embeds these files into the WASM filesystem; the full engine target requires this setup step. To use an existing ZIP, pass `python web/fetch_content.py --archive C:/path/to/client.zip`.

The npm dependency is pinned `ws`, used by the included Node game server and the multiplayer test. It is not downloaded by the browser.

If Ninja is available only through Visual Studio, pass its path when configuring:

```bat
emcmake cmake -S . -B build-web -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_MAKE_PROGRAM="C:/Program Files/Microsoft Visual Studio/2022/Community/Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe"
```

For the SDK already installed at `C:\emsdk`, the equivalent configuration in **PowerShell** is:

```powershell
cd C:\RBXDecomp-Web
python web/fetch_content.py
& C:\emsdk\upstream\emscripten\emcmake.exe cmake -S . -B build-web -G Ninja -DCMAKE_BUILD_TYPE=Release '-DCMAKE_MAKE_PROGRAM=C:/Program Files/Microsoft Visual Studio/2022/Community/Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe'
cmake --build build-web --parallel 8
npm.cmd install --prefix web --ignore-scripts --no-audit --no-fund
```

On Linux/macOS, install the same SDK, CMake, Ninja and Python, activate `source /path/to/emsdk/emsdk_env.sh`, then run the same configure/build/npm commands from the repository root. Only the Windows host has been independently verified here.

Generated output is under `build-web/web/`. The full engine is `engine/rbx-engine.mjs` plus `engine/rbx-engine.wasm`; the smaller `rbx-runtime.*` files belong to the separate Lua workbench. Do not mix this CMake cache with the native MSVC build cache.

## 3. Start the page and included game server

From **the repository root**:

```powershell
cd C:\RBXDecomp-Web
python web/serve.py --game-server
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000), wait for **Engine ready**, then click **Join local server**. The viewport should report **6 Parts** and display the server world, then **12 Parts · Character ready** after spawning. Click the viewport, use **WASD / arrows** to walk and **Space** to jump. The original camera follows the character; right-drag to look and use the wheel to zoom. The button resets the client and starts simulation before connecting. The default local Player ID is 0 for anonymous test clients. For positive IDs, use a different ID in each active client; the original engine removes duplicate account IDs.

You do not need to obtain a server. The command starts the included headless engine server at `ws://127.0.0.1:53640`. Both services listen on loopback. Ctrl+C stops both.

To use two terminals instead:

```powershell
python web/serve.py
```

```powershell
node web/server.mjs
```

If your current terminal is `C:\RBXDecomp-Web\build-web`, use:

```powershell
python ../web/serve.py --game-server
```

Do not append a backslash to `serve.py`. The server finds the default build output relative to its source location, so the second command works from the build directory too.

Use `--port 8001` if HTTP port 8000 is already occupied. The optional `--game-port 53641` changes the game server port; update the browser endpoint and connection script fields to match. **Join local server** always selects the default port 53640.

Restart an older development server after updating this checkout. The engine requires the COOP/COEP headers sent by `serve.py` for shared memory and pthreads. Opening `index.html` directly or using a plain HTTP server will not work. For remote hosting use HTTPS, shared-memory headers, and a TLS WebSocket endpoint; the included loopback server is a development fixture.

## 4. Scripts, physics, places and sound

For a local physics demo, reset, click **Load physics demo**, **Run script**, then **Run simulation**. The script creates actual engine Parts; the original physics code makes them fall and collide. **Pause** stops simulation time. Right-drag the viewport to look and use the wheel to zoom.

The script editor uses the original 2007 API. For example:

```lua
local brick = Instance.new("Part")
brick.Name = "MyBrick"
brick.Position = Vector3.new(0, 20, 0)
brick.Parent = workspace
print(brick.Name, brick.Position)
```

Use **Load XML place** for a compatible XML place file. Binary modern place files are not supported. Loading a place uses the original serializer and can reset script state; reset the engine before loading an unrelated place.

For sound, click **Enable audio**, choose a browser-supported audio file, and run the generated script:

```lua
sound = Instance.new("Sound")
sound.SoundId = "file:///content/upload-1.wav"
sound.Volume = 0.5
sound.Parent = workspace
sound:Play()
-- sound:Pause()
-- sound:Play()
-- sound:Stop()
```

The actual uploaded filename is written into the editor. PCM WAV is a useful first test. With embedded original content, you can also use `sound.SoundId = "rbxasset://sounds/electronicpingshort.wav"` without importing a file. Positional sounds parented to Parts use a Web Audio panner. Remote HTTP assets must satisfy browser CORS and isolation restrictions. Imported files and filesystem caches are in memory and disappear on reset. Reverb, custom FMOD DSP settings, Doppler velocity effects and full FMOD codec compatibility are not implemented. Compressed HTTP uploads and persistent filesystem storage are also not implemented.

A script that fails to return within five seconds causes the page to terminate its engine Worker. This also discards that session. The editor is for your own trusted scripts, not an isolation boundary for hostile code.

## 5. Other compatible UDP servers

The included server speaks WebSocket directly through Emscripten's socket emulation. A native UDP server instead needs the supplied gateway:

```powershell
python -m venv .venv-web
.venv-web/Scripts/python -m pip install -r web/requirements.txt
.venv-web/Scripts/python web/gateway.py --emscripten --upstream 127.0.0.1 --upstream-port 53640
```

Set **Gateway URL** to `ws://127.0.0.1:8765`, reset the engine, fill in the actual native server IP/port and user ID, then load and run the connection script. `--emscripten` consumes the socket emulation's initial port announcement. The gateway forwards one binary WebSocket message per datagram to its fixed upstream. Without that option it remains usable by the old workbench transport example.

The gateway defaults to allowing page origins `http://127.0.0.1:8000` and `http://localhost:8000`. Supply `--origin http://127.0.0.1:8001` for a page on port 8001. A real native 2007 server has not been independently tested; the automated multiplayer fixture uses the included WASM server. WebSocket/TCP transport timing differs from raw UDP.

## 6. Change the implementation

The rendering call chain is `rbx_engine_render` -> `RBX::View::View::render` -> `RBX::Render::RenderScene::render` -> `G3D::RenderDevice` -> Mesa/OSMesa. The original `DataModel::renderPass3dAdorn` and `renderPass2d` also run with `AdornG3D`. The page displays the resulting pixels with `putImageData`.

The browser join launcher starts simulation, creates NetworkClient **before** CreateLocalPlayer, and waits until `Replicator::isSerializePending(localPlayer)` clears before sending the original `RequestCharacter` packet. Creating the Player before NetworkClient incorrectly puts that Player into backend processing. A request sent before its instance data can also reach the server before the Player exists there.

| Source | Purpose |
| --- | --- |
| `web/engine/CMakeLists.txt` | Engine source selection, pthread and WASM settings |
| `web/engine/engine.cpp` | DataModel lifetime, original View/RenderDevice rendering, GUI passes, ScriptContext, input and place loading |
| `web/engine/browser_window.h`, `browser_input.h` | Browser window/framebuffer and hardware-input adapters for the original GWindow and UserInputBase interfaces |
| `Client/RbxView/`, `Client/Rendering/RenderLib/` | Original mesh selection, materials, scene management and rendering |
| `Client/Rendering/g3d/glg3dcpp/` | Original GLG3D RenderDevice, textures, sky and fonts |
| `Client/Rendering/Mesa-6.5/` | Original portable OpenGL/GLU implementation compiled to WASM |
| `web/engine/compat.h`, `web/engine/include/windows.h` | MSVC/Win32 platform compatibility |
| `web/engine/http.cpp`, `filesystem.cpp` | Browser HTTP and in-memory filesystem |
| `web/engine/audio.cpp` | FMOD API compatibility layer calling the browser host |
| `web/engine-worker.mjs` | Engine module loading and commands in a Worker |
| `web/engine-audio.mjs` | Web Audio playback and positional sound |
| `web/renderer.mjs` | Canvas presentation of the C++ RGBA framebuffer and forwarding mouse events |
| `web/engine-app.mjs`, `index.html`, `style.css` | Engine page and controls |
| `web/server-runtime.mjs` | Included server's example world |
| `web/fetch_content.py` | Download and verify original content assets |
| `web/gateway.py`, `serve.py` | UDP relay and HTTP development server |

After source or UI changes:

```powershell
cmake --build build-web --parallel 8
```

CMake copies page assets into the output directory. Reload the page after rebuilding and restart the Node server after engine/server changes. Edit source files, not generated files in `build-web`. Use a separate build folder with `-DCMAKE_BUILD_TYPE=Debug` for debugging. WASM function names are also retained in the current Release link to make engine failures identifiable.

## 7. Verify

After building and installing the npm dependency:

```powershell
ctest --test-dir build-web --output-on-failure
python -m pip install -r web/requirements.txt
python -m unittest web.tests.test_gateway web.tests.test_serve -v
```

CTest checks the Lua workbench, browser adapters, Web Audio channel behavior, the actual engine's Lua/physics/pause/XML/Sound bridge, and two-client server replication including a client property change reaching the other client, original character spawning, walking and jumping, with the original renderer and GUI attached. A separate renderer test checks textured geometry, sky, fonts, material changes, the HeadMesh path, removal and resizing. Multiplayer tests launch and stop their own local server. They need loopback sockets and permission to create worker threads. Browser verification additionally checks the original rendered character, stud textures, sky, game UI, native PlayerController keyboard movement and original sound playback through Web Audio; automated tests do not assert speaker hardware output.

These are browser-port checks. Native MSVC/reccmp scores and the original seven matching checks have not been run for this work. No new binary matching claims or annotation promotions are made. Native portability branches must still be reviewed and checked under the original toolchain before an upstream contribution.
