package dev.weft.spike

import android.os.Handler
import android.os.HandlerThread

/**
 * Runs the app bundle in QuickJS on its own thread. Op batches go to the main thread; user events come back here.
 * The native side drains microtasks at the end of every entry (eval, dispatch, timer).
 */
class JsRuntime(private val onBatch: (ByteArray, Int) -> Unit, private val log: (String) -> Unit) {
    private val thread = HandlerThread("weft.js").apply { start() }
    private val js = Handler(thread.looper)
    private val timers = HashMap<Int, Runnable>()
    private var handle = 0L

    fun start(bundle: String) = js.post {
        handle = jsNew()
        jsEval(handle, bundle)
    }

    /** Called from the main thread. */
    fun dispatch(id: Int, event: String, payload: String = "") = js.post { jsDispatch(handle, id, event, payload) }

    // ---- called from native, on the JS thread ----

    @Suppress("unused") fun onOps(bytes: ByteArray, ops: Int) = onBatch(bytes, ops)
    @Suppress("unused") fun onLog(line: String) = log(line)

    @Suppress("unused")
    fun scheduleTimer(id: Int, ms: Double, repeat: Boolean) {
        val delay = ms.toLong().coerceAtLeast(0)
        val run = object : Runnable {
            override fun run() {
                if (repeat) js.postDelayed(this, delay) else timers.remove(id)
                jsFireTimer(handle, id)
            }
        }
        timers[id] = run
        js.postDelayed(run, delay)
    }

    @Suppress("unused")
    fun cancelTimer(id: Int) { timers.remove(id)?.let(js::removeCallbacks) }

    private external fun jsNew(): Long
    private external fun jsEval(handle: Long, code: String)
    private external fun jsDispatch(handle: Long, id: Int, event: String, payload: String)
    private external fun jsFireTimer(handle: Long, id: Int)

    companion object { init { System.loadLibrary("weft") } }
}
