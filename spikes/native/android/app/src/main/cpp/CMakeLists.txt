cmake_minimum_required(VERSION 3.22)
project(weft_spike C)

# QuickJS-ng (fetched by scripts/fetch-quickjs.sh), core library only.
set(QJS_BUILD_LIBC OFF CACHE BOOL "" FORCE)
set(QJS_ENABLE_INSTALL OFF CACHE BOOL "" FORCE)
add_subdirectory(../../../../third_party/quickjs quickjs EXCLUDE_FROM_ALL)

# weft-layout, built by cargo for this ABI (see app/build.gradle.kts).
set(WEFT_LAYOUT_LIB ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../../../crates/weft-layout/target/aarch64-linux-android/release/libweft_layout.a)

add_library(weft SHARED weft_jni.c)
target_link_libraries(weft qjs ${WEFT_LAYOUT_LIB} log m dl)
