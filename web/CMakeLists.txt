set(LUA_DIR "${PROJECT_SOURCE_DIR}/Client/App/lua-5.1.1/src")
set(LUA_UNITS
  lapi lauxlib lbaselib lcode ldebug ldo ldump lfunc lgc llex lmathlib
  lmem lobject lopcodes lparser lstate lstring lstrlib ltable ltablib ltm
  lundump lvm lzio
)
set(LUA_SOURCES)
foreach(unit IN LISTS LUA_UNITS)
  list(APPEND LUA_SOURCES "${LUA_DIR}/${unit}.c")
endforeach()
set_source_files_properties(${LUA_SOURCES} PROPERTIES LANGUAGE CXX)
add_executable(rbx-runtime runtime.cpp ${LUA_SOURCES})
target_include_directories(rbx-runtime PRIVATE
  "${LUA_DIR}" "${PROJECT_SOURCE_DIR}/Client/boost_1_34_1/src")
target_compile_features(rbx-runtime PRIVATE cxx_std_11)
target_compile_options(rbx-runtime PRIVATE -fexceptions)
target_link_options(rbx-runtime PRIVATE
  -fexceptions
  "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sENVIRONMENT=web,worker,node"
  "-sALLOW_MEMORY_GROWTH=1" "-sMAXIMUM_MEMORY=134217728"
  "-sSTACK_SIZE=1048576" "-sNO_EXIT_RUNTIME=1"
  "-sEXPORTED_FUNCTIONS=['_rbx_init','_rbx_execute','_rbx_event','_rbx_destroy','_malloc','_free']"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString','HEAPU8']"
)
set_target_properties(rbx-runtime PROPERTIES SUFFIX ".mjs")
foreach(asset index.html workbench.html app.mjs worker.mjs platform.mjs style.css engine-app.mjs engine-worker.mjs renderer.mjs engine-audio.mjs)
  configure_file("${asset}" "${CMAKE_CURRENT_BINARY_DIR}/${asset}" COPYONLY)
endforeach()

enable_testing()
find_program(NODE_EXECUTABLE NAMES node nodejs REQUIRED)
add_test(NAME wasm-lua COMMAND "${NODE_EXECUTABLE}"
  "${CMAKE_CURRENT_SOURCE_DIR}/tests/runtime.test.mjs"
  "$<TARGET_FILE:rbx-runtime>")
add_test(NAME browser-platform COMMAND "${NODE_EXECUTABLE}" --test
  "${CMAKE_CURRENT_SOURCE_DIR}/tests/platform.test.mjs")
add_test(NAME engine-audio COMMAND "${NODE_EXECUTABLE}" --test
  "${CMAKE_CURRENT_SOURCE_DIR}/tests/engine-audio.test.mjs")

add_subdirectory(engine)
