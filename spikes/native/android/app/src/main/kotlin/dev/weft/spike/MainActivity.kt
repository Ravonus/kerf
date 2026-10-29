package dev.weft.spike

import android.app.Activity
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import androidx.core.util.Consumer
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import java.io.File
import kotlin.math.abs

/**
 * Hosts the weft root inside the system-bar and cutout insets, tells the app its window (size and any separating
 * fold or hinge, from Jetpack WindowManager), and writes a log the spike scripts read back. The activity handles
 * rotation, folding and resizing itself (manifest `configChanges`), so app state survives them.
 */
class MainActivity : Activity() {
    private lateinit var renderer: Renderer
    private lateinit var js: JsRuntime
    private val main = Handler(Looper.getMainLooper())
    private val logFile by lazy { File(filesDir, "weft.log") }
    private val density by lazy { resources.displayMetrics.density }
    private lateinit var content: FrameGroup
    private lateinit var container: Container
    private var fold: FoldingFeature? = null
    private var haveLayoutInfo = false // the first report waits for WindowManager, so a half-open fold never mounts as one pane
    private var lastViewport = ""
    private var dev: DevServer? = null
    private val tracker by lazy { WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(this)) }
    private val onLayoutInfo = Consumer<WindowLayoutInfo> { info ->
        log("window layout ${info.displayFeatures}")
        fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull { it.isSeparating }
        haveLayoutInfo = true
        reportViewport()
    }

    /** The root node's parent sits inside the insets; surfaces that touch an inset edge are painted on into it. */
    private inner class Container : ViewGroup(this@MainActivity) {
        var surfaces: List<Pair<Frame, Int>> = emptyList()
        private val paint = Paint()

        override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(MeasureSpec.getSize(w), MeasureSpec.getSize(h))
        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            val w = r - l - paddingLeft - paddingRight; val h = b - t - paddingTop - paddingBottom
            content.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
            content.layout(paddingLeft, paddingTop, paddingLeft + w, paddingTop + h)
        }
        override fun dispatchDraw(canvas: Canvas) {
            val cw = content.width / density; val ch = content.height / density
            for ((f, color) in surfaces) {
                paint.color = color
                val near = { a: Float, b: Float -> abs(a - b) < 0.5f }
                canvas.drawRect(
                    if (near(f.x, 0f)) 0f else paddingLeft + f.x * density,
                    if (near(f.y, 0f)) 0f else paddingTop + f.y * density,
                    if (near(f.x + f.w, cw)) width.toFloat() else paddingLeft + (f.x + f.w) * density,
                    if (near(f.y + f.h, ch)) height.toFloat() else paddingTop + (f.y + f.h) * density,
                    paint,
                )
            }
            super.dispatchDraw(canvas)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        logFile.writeText("")
        content = object : FrameGroup(this) {
            override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
                if (w != ow || h != oh) post { renderer.layout(); reportViewport() }
            }
        }
        container = Container()
        container.setBackgroundColor(Color.WHITE)
        container.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        container.addView(content)
        setContentView(container)
        val dark = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        window.insetsController?.setSystemBarsAppearance(dark, dark) // dark icons on the light background

        renderer = Renderer(this, content)
        renderer.log = ::log
        renderer.onSurfaces = { s -> container.surfaces = s; container.invalidate() }
        js = JsRuntime(onBatch = { bytes, ops -> main.post { renderer.apply(bytes, ops) } }, log = { line -> main.post { log(line) } })
        renderer.onEvent = { id, event, payload -> js.dispatch(id, event, payload) }
        js.start(assets.open("app.js").bufferedReader().readText())

        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            val dev = DevServer(::log) { req, reply ->
                val viewport = runCatching { org.json.JSONObject(lastViewport) }.getOrDefault(org.json.JSONObject())
                when (req.optString("cmd")) {
                    "hello" -> reply(org.json.JSONObject().put("ok", true).put("os", "android").put("device", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}").put("port", dev?.port))
                    "viewport" -> reply(org.json.JSONObject().put("ok", true).put("viewport", viewport))
                    "snapshot" -> reply(org.json.JSONObject().put("ok", true).put("viewport", viewport).put("root", renderer.devSnapshot()))
                    "frames" -> reply(org.json.JSONObject().put("ok", true).put("frames", renderer.dumpFrames().put("viewport", viewport)))
                    "tap", "type", "select" -> renderer.devAct(req, reply)
                    else -> reply(org.json.JSONObject().put("ok", false).put("error", "unknown cmd; try hello, viewport, snapshot, frames, tap, type, select"))
                }
            }
            this.dev = dev.also { it.start() }
        }
    }

    // A recreated activity (a config change it doesn't handle, a relaunch) must give up its port, or the CLI keeps
    // talking to the old one: detached views, frames at 0,0, a viewport that never changes.
    override fun onDestroy() {
        dev?.stop()
        super.onDestroy()
    }

    override fun onStart() {
        super.onStart()
        tracker.addWindowLayoutInfoListener(this, mainExecutor, onLayoutInfo)
    }

    override fun onStop() {
        tracker.removeWindowLayoutInfoListener(onLayoutInfo)
        super.onStop()
    }

    /**
     * Sends the window to the app as `dispatch(0, "viewport", json)`: the content size in dp and, when a fold or hinge
     * separates it (a foldable half open, a Surface Duo spanned), that hinge in the same coordinates.
     */
    private fun reportViewport() {
        if (content.width == 0 || !haveLayoutInfo) return
        val w = content.width / density; val h = content.height / density
        val json = StringBuilder("{\"w\":$w,\"h\":$h")
        fold?.let { f ->
            val at = IntArray(2).also(content::getLocationInWindow)
            val x = ((f.bounds.left - at[0]) / density).coerceIn(0f, w); val y = ((f.bounds.top - at[1]) / density).coerceIn(0f, h)
            val r = ((f.bounds.right - at[0]) / density).coerceIn(0f, w); val b = ((f.bounds.bottom - at[1]) / density).coerceIn(0f, h)
            // A vertical fold spans the content's height; a horizontal one its width (insets clip the bounds).
            val (hx, hy, hw, hh) = if (f.orientation == FoldingFeature.Orientation.VERTICAL) listOf(x, 0f, r - x, h) else listOf(0f, y, w, b - y)
            json.append(",\"hinge\":{\"x\":$hx,\"y\":$hy,\"w\":$hw,\"h\":$hh}")
        }
        json.append("}")
        if (json.toString() == lastViewport) return
        lastViewport = json.toString()
        log("viewport $lastViewport")
        js.dispatch(0, "viewport", lastViewport)
        // Spike hook: dump the laid-out tree for the Node comparison (scripts/compare-layout.mts) once it settles.
        main.removeCallbacks(dumpFrames)
        main.postDelayed(dumpFrames, 1500)
    }

    private val dumpFrames = Runnable {
        val dump = renderer.dumpFrames().put("viewport", org.json.JSONObject(lastViewport))
        File(filesDir, "frames.json").writeText(dump.toString())
        log("frames written")
    }

    private fun log(line: String) {
        Log.i("weft", line)
        logFile.appendText("${System.currentTimeMillis()} $line\n")
    }
}
