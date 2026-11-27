file(GLOB_RECURSE ENGINE_SOURCES CONFIGURE_DEPENDS
  "${PROJECT_SOURCE_DIR}/Client/App/*.cpp")
list(FILTER ENGINE_SOURCES EXCLUDE REGEX "/lua-5\\.1\\.1/")
list(FILTER ENGINE_SOURCES EXCLUDE REGEX "/(Http|FileSystem)\\.cpp$")
list(APPEND ENGINE_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/filesystem.cpp" "${CMAKE_CURRENT_SOURCE_DIR}/http.cpp")
add_library(rbx-engine-objects OBJECT EXCLUDE_FROM_ALL ${ENGINE_SOURCES})
set_target_properties(rbx-engine-objects PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED ON)
target_compile_definitions(rbx-engine-objects PRIVATE NDEBUG _RELEASE NO_SSE)
add_library(rbx-engine-platform INTERFACE)
target_compile_options(rbx-engine-platform INTERFACE
  -pthread -fexceptions -fms-extensions -fms-compatibility -fms-compatibility-version=19.00 -fdelayed-template-parsing
  -Wno-ignored-attributes -Wno-deprecated-declarations
  "$<$<COMPILE_LANGUAGE:CXX>:-include;${CMAKE_CURRENT_SOURCE_DIR}/compat.h>")
target_include_directories(rbx-engine-platform INTERFACE
  "${CMAKE_CURRENT_SOURCE_DIR}/include"
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${PROJECT_SOURCE_DIR}/Client/RbxView/include"
  "${PROJECT_SOURCE_DIR}/Client/RbxViewBase"
  "${PROJECT_SOURCE_DIR}/Client/Rendering/Mesa-6.5/include"
  "${PROJECT_SOURCE_DIR}/util"
  "${PROJECT_SOURCE_DIR}/Client/App/include"
  "${PROJECT_SOURCE_DIR}/Client/Network/include"
  "${PROJECT_SOURCE_DIR}/Client/RbxGraphics/include"
  "${PROJECT_SOURCE_DIR}/Client/Rendering/AppDraw/include"
  "${PROJECT_SOURCE_DIR}/Client/Rendering/RenderLib/include"
  "${PROJECT_SOURCE_DIR}/Client/Rendering/g3d/include"
  "${PROJECT_SOURCE_DIR}/Client/Rendering/SDL-1.2.6/include"
  "${PROJECT_SOURCE_DIR}/Client/boost_1_34_1/src"
  "${PROJECT_SOURCE_DIR}/Client/App/lua-5.1.1/src"
  "${PROJECT_SOURCE_DIR}/Client/fmod/api/inc"
  "${PROJECT_SOURCE_DIR}/Client/Network/raknet30/Source")

set(NETWORK_SOURCES)
foreach(unit API Client ClientPhysics NetworkSettings Player Players Replicator Server Streaming)
  list(APPEND NETWORK_SOURCES "${PROJECT_SOURCE_DIR}/Client/Network/${unit}.cpp")
endforeach()
foreach(unit BitStream CheckSum DS_HuffmanEncodingTree DataBlockEncryptor FileOperations GetTime NetworkIDManager PacketLogger PluginInterface RPCMap RakNetTypes RakPeer RakSleep Rand ReliabilityLayer SHA1 SimpleMutex SocketLayer StringCompressor StringTable rijndael)
  list(APPEND NETWORK_SOURCES "${PROJECT_SOURCE_DIR}/Client/Network/raknet30/Source/${unit}.cpp")
endforeach()
add_library(rbx-engine-network STATIC EXCLUDE_FROM_ALL ${NETWORK_SOURCES})
set_target_properties(rbx-engine-network PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED ON)
target_compile_definitions(rbx-engine-network PRIVATE NDEBUG NO_SSE)
target_link_libraries(rbx-engine-network PRIVATE rbx-engine-platform)
target_include_directories(rbx-engine-network PRIVATE "${PROJECT_SOURCE_DIR}/Client/Network")
target_link_libraries(rbx-engine-objects PRIVATE rbx-engine-platform)

set(G3D_ROOT "${PROJECT_SOURCE_DIR}/Client/Rendering/g3d")
file(GLOB G3D_SOURCES CONFIGURE_DEPENDS "${G3D_ROOT}/g3dcpp/*.cpp" "${G3D_ROOT}/ijg/*.c" "${G3D_ROOT}/png/*.c" "${G3D_ROOT}/zlib/*.c")
list(FILTER G3D_SOURCES EXCLUDE REGEX "/NetworkDevice\\.cpp$")
add_library(rbx-engine-g3d STATIC EXCLUDE_FROM_ALL ${G3D_SOURCES})
target_sources(rbx-engine-g3d PRIVATE "${G3D_ROOT}/glg3dcpp/LightingParameters.cpp")
set_target_properties(rbx-engine-g3d PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED ON)
target_compile_definitions(rbx-engine-g3d PRIVATE NDEBUG NO_SSE G3D_BUILDING_LIBRARY_DLL)
target_link_libraries(rbx-engine-g3d PRIVATE rbx-engine-platform)
target_include_directories(rbx-engine-g3d PRIVATE "${G3D_ROOT}/png" "${G3D_ROOT}/ijg" "${G3D_ROOT}/zlib")

set(BOOST_ROOT "${PROJECT_SOURCE_DIR}/Client/boost_1_34_1")
file(GLOB BOOST_SIGNAL_SOURCES "${BOOST_ROOT}/libs/signals/src/*.cpp")
set(BOOST_THREAD_SOURCES)
foreach(unit barrier condition exceptions mutex once recursive_mutex thread tss xtime)
  list(APPEND BOOST_THREAD_SOURCES "${BOOST_ROOT}/libs/thread/src/${unit}.cpp")
endforeach()
add_library(rbx-engine-boost STATIC EXCLUDE_FROM_ALL ${BOOST_SIGNAL_SOURCES} ${BOOST_THREAD_SOURCES}
  "${BOOST_ROOT}/libs/date_time/src/gregorian/greg_month.cpp"
  "${BOOST_ROOT}/libs/date_time/src/gregorian/greg_weekday.cpp"
  "${BOOST_ROOT}/libs/date_time/src/gregorian/date_generators.cpp")
set_target_properties(rbx-engine-boost PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED ON)
target_compile_definitions(rbx-engine-boost PRIVATE BOOST_THREAD_BUILD_LIB=1 BOOST_DATE_TIME_STATIC_LINK DATE_TIME_INLINE NDEBUG)
target_link_libraries(rbx-engine-boost PRIVATE rbx-engine-platform)

set(ENGINE_LUA_SOURCES ${LUA_SOURCES})
set_source_files_properties(${ENGINE_LUA_SOURCES} PROPERTIES LANGUAGE CXX)
add_library(rbx-engine-lua STATIC EXCLUDE_FROM_ALL ${ENGINE_LUA_SOURCES})
set_target_properties(rbx-engine-lua PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED ON)
target_link_libraries(rbx-engine-lua PRIVATE rbx-engine-platform)
target_compile_definitions(rbx-engine-lua PRIVATE NDEBUG NO_SSE)

add_library(rbx-engine-appdraw STATIC EXCLUDE_FROM_ALL
  "${PROJECT_SOURCE_DIR}/Client/Rendering/AppDraw/Draw.cpp"
  "${PROJECT_SOURCE_DIR}/Client/Rendering/AppDraw/DrawAdorn.cpp"
  "${PROJECT_SOURCE_DIR}/Client/Rendering/AppDraw/DrawPrimitives.cpp"
  "${PROJECT_SOURCE_DIR}/Client/Rendering/AppDraw/HitTest.cpp"
  "${PROJECT_SOURCE_DIR}/Client/Rendering/AppDraw/Textures.cpp")
set_target_properties(rbx-engine-appdraw PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED ON)
target_compile_definitions(rbx-engine-appdraw PRIVATE NDEBUG NO_SSE)
target_link_libraries(rbx-engine-appdraw PRIVATE rbx-engine-platform)

file(GLOB ORIGINAL_VIEW_SOURCES CONFIGURE_DEPENDS "${PROJECT_SOURCE_DIR}/Client/RbxView/*.cpp")
file(GLOB ORIGINAL_RENDER_SOURCES CONFIGURE_DEPENDS "${PROJECT_SOURCE_DIR}/Client/Rendering/RenderLib/*.cpp")
list(FILTER ORIGINAL_RENDER_SOURCES EXCLUDE REGEX "/Profiler\\.cpp$")
file(GLOB ORIGINAL_GL_SOURCES CONFIGURE_DEPENDS "${G3D_ROOT}/glg3dcpp/*.cpp")
list(FILTER ORIGINAL_GL_SOURCES EXCLUDE REGEX "/(Win32Window|SDLWindow|DXCaps|LightingParameters)\\.cpp$")
add_library(rbx-original-render OBJECT EXCLUDE_FROM_ALL ${ORIGINAL_VIEW_SOURCES} ${ORIGINAL_RENDER_SOURCES} ${ORIGINAL_GL_SOURCES}
  "${PROJECT_SOURCE_DIR}/Client/Rendering/AppDraw/AdornG3D.cpp"
  "${PROJECT_SOURCE_DIR}/Client/Rendering/AppDraw/Fonts.cpp")
target_link_libraries(rbx-original-render PRIVATE rbx-engine-platform)
target_compile_options(rbx-original-render PRIVATE -Wno-c++11-narrowing)
target_compile_definitions(rbx-original-render PRIVATE NDEBUG _RELEASE NO_SSE)
target_include_directories(rbx-original-render PRIVATE "${PROJECT_SOURCE_DIR}/Client/RbxView/include" "${PROJECT_SOURCE_DIR}/Client/RbxViewBase")
set_target_properties(rbx-original-render PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED ON)

set(MESA_ROOT "${PROJECT_SOURCE_DIR}/Client/Rendering/Mesa-6.5")
file(READ "${MESA_ROOT}/src/mesa/sources" MESA_SOURCE_TEXT)
string(REPLACE "\\" "" MESA_SOURCE_TEXT "${MESA_SOURCE_TEXT}")
string(REPLACE "\n" ";" MESA_SOURCE_LINES "${MESA_SOURCE_TEXT}")
set(MESA_SOURCES)
set(MESA_INCLUDE_GROUP FALSE)
foreach(line ${MESA_SOURCE_LINES})
  if(line MATCHES "^([A-Za-z0-9_-]+)[ \t]*=")
    set(group "${CMAKE_MATCH_1}")
    if(group MATCHES "^(MAIN|GLAPI|MATH|ARRAY_CACHE|SWRAST|SWRAST_SETUP|TNL|SHADER|SLANG|COMMON_DRIVER|OSMESA_DRIVER)_SOURCES$")
      set(MESA_INCLUDE_GROUP TRUE)
    else()
      set(MESA_INCLUDE_GROUP FALSE)
    endif()
  elseif(MESA_INCLUDE_GROUP AND line MATCHES "([A-Za-z0-9_./-]+\\.c)")
    list(APPEND MESA_SOURCES "${MESA_ROOT}/src/mesa/${CMAKE_MATCH_1}")
  endif()
endforeach()
file(GLOB GLU_SOURCES "${MESA_ROOT}/src/glu/sgi/libutil/*.c")
add_library(rbx-original-mesa STATIC ${MESA_SOURCES} ${GLU_SOURCES})
target_compile_options(rbx-original-mesa PRIVATE -pthread -Wno-implicit-function-declaration -Wno-incompatible-pointer-types)
target_compile_definitions(rbx-original-mesa PRIVATE PTHREADS NDEBUG)
target_include_directories(rbx-original-mesa PRIVATE "${MESA_ROOT}/src/glu/sgi/include")
target_include_directories(rbx-original-mesa PRIVATE "${MESA_ROOT}/include" "${MESA_ROOT}/src/mesa" "${MESA_ROOT}/src/mesa/main" "${MESA_ROOT}/src/mesa/glapi" "${MESA_ROOT}/src/mesa/math" "${MESA_ROOT}/src/mesa/tnl" "${MESA_ROOT}/src/mesa/shader" "${MESA_ROOT}/src/mesa/shader/grammar" "${MESA_ROOT}/src/mesa/shader/slang" "${MESA_ROOT}/src/mesa/swrast" "${MESA_ROOT}/src/mesa/swrast_setup")
target_include_directories(rbx-original-render PRIVATE "${MESA_ROOT}/include")

add_executable(rbx-engine engine.cpp platform.cpp audio.cpp "${PROJECT_SOURCE_DIR}/util/decomp.cpp")
if(EXISTS "${PROJECT_SOURCE_DIR}/web/content/fonts/character.rbxm")
  file(GLOB_RECURSE BROWSER_CONTENT CONFIGURE_DEPENDS "${PROJECT_SOURCE_DIR}/web/content/*")
  set_property(TARGET rbx-engine APPEND PROPERTY LINK_DEPENDS ${BROWSER_CONTENT})
  target_link_options(rbx-engine PRIVATE "SHELL:--embed-file \"${PROJECT_SOURCE_DIR}/web/content@/content\"")
else()
  message(FATAL_ERROR "Original content is missing. Run python web/fetch_content.py from the repository root before configuring the engine.")
endif()
set_target_properties(rbx-engine PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED ON SUFFIX ".mjs")
target_link_libraries(rbx-engine PRIVATE rbx-engine-platform rbx-engine-objects rbx-original-render rbx-engine-network rbx-engine-appdraw rbx-engine-g3d rbx-engine-lua rbx-engine-boost rbx-original-mesa)
target_include_directories(rbx-engine PRIVATE "${MESA_ROOT}/include")
target_include_directories(rbx-engine PRIVATE "${PROJECT_SOURCE_DIR}/Client/Network")
target_compile_definitions(rbx-engine PRIVATE NDEBUG NO_SSE)
target_link_options(rbx-engine PRIVATE
  -g2
  "-Wl,--error-limit=0"
  -pthread -fexceptions "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sENVIRONMENT=web,worker,node"
  "-sUSE_SDL=1"
  "-sFETCH=1" "-sPTHREAD_POOL_SIZE=8" "-sALLOW_MEMORY_GROWTH=1" "-sINITIAL_MEMORY=67108864"
  "-sMAXIMUM_MEMORY=536870912" "-sSTACK_SIZE=2097152" "-sNO_EXIT_RUNTIME=1"
  "-sEXPORTED_FUNCTIONS=['_rbx_engine_init','_rbx_engine_render_init','_rbx_engine_render','_rbx_engine_key','_rbx_engine_mouse','_rbx_engine_render_pixels','_rbx_engine_render_triangles','_rbx_engine_execute','_rbx_engine_destroy','_rbx_engine_snapshot','_rbx_engine_part_count','_rbx_engine_camera_frame','_rbx_engine_camera','_rbx_engine_input','_rbx_engine_request_character','_rbx_engine_character_position','_rbx_engine_run','_rbx_engine_time','_rbx_engine_load','_rbx_engine_asset','_rbx_engine_audio_ended','_malloc','_free']"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','HEAPU8','UTF8ToString']")

add_test(NAME wasm-engine COMMAND "${NODE_EXECUTABLE}"
  "${PROJECT_SOURCE_DIR}/web/tests/engine.test.mjs" "$<TARGET_FILE:rbx-engine>")
add_test(NAME wasm-multiplayer COMMAND "${NODE_EXECUTABLE}"
  "${PROJECT_SOURCE_DIR}/web/tests/network-engine.test.mjs" "$<TARGET_FILE:rbx-engine>")
add_test(NAME wasm-original-renderer COMMAND "${NODE_EXECUTABLE}"
  "${PROJECT_SOURCE_DIR}/web/tests/original-render.test.mjs" "$<TARGET_FILE:rbx-engine>")
set_tests_properties(wasm-original-renderer PROPERTIES TIMEOUT 45)
set_tests_properties(wasm-engine wasm-multiplayer PROPERTIES TIMEOUT 45)
set_tests_properties(wasm-multiplayer PROPERTIES ENVIRONMENT "NODE_PATH=${PROJECT_SOURCE_DIR}/web/node_modules")
