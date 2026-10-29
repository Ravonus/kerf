package dev.weft.spike

import android.os.Handler
import android.os.Looper
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import org.json.JSONObject

/**
 * Debug-only dev socket for `weft device` (scripts/device.mts): line-delimited JSON over TCP on the loopback
 * interface, first free port from 9301. Reach it from the Mac with `adb forward tcp:9301 tcp:9301` (the CLI does
 * this). Requests on one connection are answered in order; each is handled on the main thread.
 */
class DevServer(private val log: (String) -> Unit, private val handle: (JSONObject, (JSONObject) -> Unit) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    var port = 0
        private set
    @Volatile private var server: ServerSocket? = null
    @Volatile private var stopped = false

    fun start(first: Int = 9301, last: Int = 9310) = thread(name = "weft-dev", isDaemon = true) {
        val server = (first..last).firstNotNullOfOrNull { p ->
            runCatching { ServerSocket(p, 4, InetAddress.getLoopbackAddress()) }.getOrNull()?.also { port = p }
        } ?: return@thread log("dev socket: no free port")
        this.server = server
        if (stopped) server.close() else log("dev socket 127.0.0.1:$port")
        while (true) {
            val s = runCatching { server.accept() }.getOrNull() ?: break
            thread(isDaemon = true) { serve(s) }
        }
    }

    /** Frees the port; accept() then throws and the loop ends. */
    fun stop() { stopped = true; server?.close() }

    private fun serve(s: Socket) = s.use {
        val input = BufferedReader(InputStreamReader(s.getInputStream(), Charsets.UTF_8))
        val out = s.getOutputStream()
        while (true) {
            val line = input.readLine() ?: break
            val reply = ArrayBlockingQueue<JSONObject>(1)
            val req = runCatching { JSONObject(line) }.getOrNull()
            if (req == null) reply.put(JSONObject().put("ok", false).put("error", "not a JSON object"))
            else main.post { handle(req) { reply.offer(it) } }
            val res = reply.poll(10, TimeUnit.SECONDS) ?: JSONObject().put("ok", false).put("error", "timed out")
            out.write((res.toString() + "\n").toByteArray(Charsets.UTF_8))
            out.flush()
        }
    }
}
