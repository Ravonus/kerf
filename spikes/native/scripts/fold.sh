#!/usr/bin/env bash
# A foldable to test against: creates the `weft-fold` AVD (Pixel 9 Pro Fold shape: 2076×2152 inner screen at 390 dpi,
# fold down the middle) from the API 36 image, or drives a running one.
#   scripts/fold.sh create        write ~/.android/avd/weft-fold (no Android Studio or cmdline-tools needed)
#   scripts/fold.sh boot          start it (foreground; Ctrl-C to stop)
#   scripts/fold.sh setup         once per boot: enable the Pixel 9 Pro Fold overlay, which maps the hinge angle to
#                                 postures. Without it WindowManager reports the fold but always as FLAT.
#   scripts/fold.sh book|flat     hinge to 90° (half open: the app splits at the fold) or 180° (open flat: one pane)
#   scripts/fold.sh shot <file>   screenshot the inner display (the overlay adds a second display)
set -euo pipefail
sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
adb="$sdk/platform-tools/adb"
avd="$HOME/.android/avd"

case "${1:-}" in
  create)
    mkdir -p "$avd/weft-fold.avd"
    printf 'avd.ini.encoding=UTF-8\npath=%s/weft-fold.avd\npath.rel=avd/weft-fold.avd\ntarget=android-36\n' "$avd" > "$avd/weft-fold.ini"
    cat > "$avd/weft-fold.avd/config.ini" <<'INI'
AvdId=weft-fold
avd.ini.displayname=weft Pixel 9 Pro Fold shape (API 36)
abi.type=arm64-v8a
hw.cpu.arch=arm64
hw.cpu.ncore=4
image.sysdir.1=system-images/android-36/google_apis/arm64-v8a/
tag.id=google_apis
target=android-36
hw.device.name=pixel_9_pro_fold
hw.device.manufacturer=Google
hw.lcd.width=2076
hw.lcd.height=2152
hw.lcd.density=390
hw.gpu.enabled=yes
hw.gpu.mode=host
hw.keyboard=yes
hw.ramSize=4096
hw.accelerometer=yes
hw.sensors.orientation=yes
hw.mainKeys=no
disk.dataPartition.size=6G
showDeviceFrame=no
hw.sensor.hinge=yes
hw.sensor.hinge.count=1
hw.sensor.hinge.type=1
hw.sensor.hinge.sub_type=0
hw.sensor.hinge.ranges=0-180
hw.sensor.hinge.defaults=180
hw.sensor.hinge.areas=1038-0-0-2152
hw.sensor.posture_list=1, 2, 3
hw.sensor.hinge_angles_posture_definitions=0-30, 30-150, 150-180
hw.sensor.hinge.fold_to_displayRegion.0.1_at_posture=1
hw.displayRegion.0.1.xOffset=0
hw.displayRegion.0.1.yOffset=0
hw.displayRegion.0.1.width=1038
hw.displayRegion.0.1.height=2152
INI
    echo "created weft-fold (needs system-images;android-36;google_apis;arm64-v8a)" ;;
  boot) exec "$sdk/emulator/emulator" -avd weft-fold -no-snapshot -no-boot-anim -gpu host ;;
  setup)
    "$adb" shell cmd overlay enable com.android.internal.emulation.pixel_9_pro_fold
    "$adb" shell cmd overlay enable com.android.systemui.emulation.pixel_9_pro_fold ;;
  book) "$adb" emu sensor set hinge-angle0 90 ;;
  flat) "$adb" emu sensor set hinge-angle0 180 ;;
  shot)
    id=$("$adb" shell dumpsys SurfaceFlinger --display-id | head -1 | awk '{print $2}')
    "$adb" exec-out screencap -d "$id" -p > "${2:?file}" ;;
  *) sed -n 2,10p "$0"; exit 1 ;;
esac
