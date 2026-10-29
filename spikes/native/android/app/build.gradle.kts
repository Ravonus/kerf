// The Android host. Kotlin compiles through AGP 9's built-in Kotlin support; there are no library dependencies.
// Before building: scripts/fetch-quickjs.sh, cargo build of weft-layout for aarch64-linux-android, and the JS
// bundle in js/dist (scripts/android.sh does all three).
plugins {
    id("com.android.application")
}

android {
    namespace = "dev.weft.spike"
    compileSdk = 36
    ndkVersion = "28.2.13676358"

    defaultConfig {
        applicationId = "dev.weft.spike"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.0.1"
        ndk { abiFilters += "arm64-v8a" }
        externalNativeBuild { cmake { arguments += "-DANDROID_STL=none" } }
    }

    externalNativeBuild {
        cmake { path = file("src/main/cpp/CMakeLists.txt") }
    }

    sourceSets {
        getByName("main") { assets.directories.add("../../js/dist/android") }
    }
}
