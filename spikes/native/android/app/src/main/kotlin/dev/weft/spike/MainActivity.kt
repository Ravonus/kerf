package dev.weft.spike

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import java.io.File

/** Hosts the weft root inside the system-bar insets and writes a log the spike scripts read back. */
class MainActivity : Activity() {
    private lateinit var renderer: Renderer
    private lateinit var js: JsRuntime
    private val main = Handler(Looper.getMainLooper())
    private val logFile by lazy { File(filesDir, "weft.log") }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        logFile.writeText("")
        // The root node's parent: sized to the area inside the system bars, relaid out when that changes.
        val content = object : FrameGroup(this) {
            override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) { if (w != ow || h != oh) post { renderer.layout() } }
        }
        val container = object : ViewGroup(this) {
            var bottomBar: Int? = null
            private val paint = android.graphics.Paint()
            override fun dispatchDraw(canvas: android.graphics.Canvas) {
                bottomBar?.let { paint.color = it; canvas.drawRect(0f, (height - paddingBottom).toFloat(), width.toFloat(), height.toFloat(), paint) }
                super.dispatchDraw(canvas)
            }
            override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(MeasureSpec.getSize(w), MeasureSpec.getSize(h))
            override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
                val w = r - l - paddingLeft - paddingRight; val h = b - t - paddingTop - paddingBottom
                content.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
                content.layout(paddingLeft, paddingTop, paddingLeft + w, paddingTop + h)
            }
        }
        container.setBackgroundColor(Color.WHITE)
        container.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        container.addView(content)
        setContentView(container)
        val dark = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        window.insetsController?.setSystemBarsAppearance(dark, dark) // dark icons on the white background

        renderer = Renderer(this, content)
        renderer.log = ::log
        renderer.onBottomBar = { c -> if (container.bottomBar != c) { container.bottomBar = c; container.invalidate() } }
        js = JsRuntime(onBatch = { bytes, ops -> main.post { renderer.apply(bytes, ops) } }, log = { line -> main.post { log(line) } })
        renderer.onEvent = { id, event, payload -> js.dispatch(id, event, payload) }
        js.start(assets.open("app.js").bufferedReader().readText())

        // Spike hook: dump the laid-out tree for the Node comparison (scripts/compare-layout.mts).
        main.postDelayed({
            File(filesDir, "frames.json").writeText(renderer.dumpFrames())
            log("frames written")
        }, 2000)
    }

    private fun log(line: String) {
        Log.i("weft", line)
        logFile.appendText("${System.currentTimeMillis()} $line\n")
    }
}
