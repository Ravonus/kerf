package dev.weft.spike

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.InsetDrawable
import android.os.SystemClock
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONArray
import org.json.JSONObject

/** A container whose children sit exactly where weft-layout put them. */
open class FrameGroup(context: Context) : ViewGroup(context) {
    override fun onMeasure(w: Int, h: Int) {
        val f = frameOf(this)
        if (f == null) super.onMeasure(w, h)
        else setMeasuredDimension(px(f.w), px(f.contentH))
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        for (i in 0 until childCount) place(getChildAt(i))
    }

    private fun px(dp: Float) = (dp * resources.displayMetrics.density + 0.5f).toInt()

    fun place(child: View) {
        val f = frameOf(child) ?: return
        val x = px(f.x); val y = px(f.y); val w = px(f.x + f.w) - x; val h = px(f.y + f.h) - y
        child.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
        child.layout(x, y, x + w, y + h)
    }
}

class Frame(var x: Float = 0f, var y: Float = 0f, var w: Float = 0f, var h: Float = 0f, var contentW: Float = 0f, var contentH: Float = 0f)

private fun frameOf(v: View) = (v.tag as? Renderer.Node)?.frame

/**
 * Applies op batches to real Android views, mirrors the tree into weft-layout, and positions views from it.
 * The same loop exists in TS (js/src/ops.ts `decode`) and Swift (ios/Sources/Renderer.swift). Units are dp.
 */
class Renderer(private val context: Context, val container: FrameGroup) {
    class Node(val id: Int, val type: Int, val view: View, val content: ViewGroup?) {
        val props = HashMap<Int, Any>()
        val children = ArrayList<Int>()
        var parent = 0
        val frame = Frame()
    }

    private val nodes = HashMap<Int, Node>()
    private var root = 0
    /** Dev-socket actions waiting for the app's answer to land (see `devAct`). */
    private val afterApply = ArrayList<() -> Unit>()
    private val handle = lNew()
    private val density = context.resources.displayMetrics.density
    private val out = FloatArray(6)
    /** Texts each input reported to JS that JS hasn't echoed back yet (see VALUE). */
    private val reported = HashMap<Int, ArrayDeque<String>>()
    private var settingText = false
    var onEvent: ((Int, String, String) -> Unit)? = null
    var log: ((String) -> Unit)? = null
    /** Surfaces (bar, rail) with their colour and absolute frame in dp, so the activity can carry them into the insets they touch. */
    var onSurfaces: ((List<Pair<Frame, Int>>) -> Unit)? = null

    // ---- ops ----

    fun apply(bytes: ByteArray, ops: Int) {
        val start = SystemClock.elapsedRealtimeNanos()
        val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        while (b.hasRemaining()) {
            when (val op = b.int) {
                Op.CREATE -> { val id = b.int; create(id, b.int) }
                Op.REMOVE -> remove(b.int)
                Op.INSERT -> { val p = b.int; val id = b.int; insert(p, id, b.int) }
                Op.SET_BOOL -> { val id = b.int; val prop = b.int; set(id, prop, b.int == 1) }
                Op.SET_NUM -> { val id = b.int; val prop = b.int; set(id, prop, b.double) }
                Op.SET_STR -> {
                    val id = b.int; val prop = b.int; val len = b.int
                    val s = String(bytes, b.position(), len, Charsets.UTF_8)
                    b.position(b.position() + ((len + 3) and 3.inv()))
                    set(id, prop, s)
                }
                Op.LISTEN -> { val id = b.int; listen(id, b.int) }
                Op.ROOT -> { root = b.int; container.addView(nodes[root]!!.view) }
                else -> { log?.invoke("unknown op $op at ${b.position() - 4}"); return }
            }
        }
        layout()
        log?.invoke("apply ops=$ops bytes=${bytes.size} main=%.2fms".format((SystemClock.elapsedRealtimeNanos() - start) / 1e6))
        val waiting = afterApply.toList()
        afterApply.clear()
        waiting.forEach { it() }
    }

    private fun create(id: Int, type: Int) {
        var content: ViewGroup? = null
        val view: View = when (type) {
            NodeType.STACK, NodeType.ROW -> FrameGroup(context)
            NodeType.SCROLL -> ScrollView(context).apply {
                isVerticalScrollBarEnabled = true
                val inner = FrameGroup(context)
                content = inner
                addView(inner)
            }
            NodeType.TEXT -> TextView(context).apply { setTextColor(Color.BLACK); applyRole(this, "body") }
            NodeType.BUTTON -> Button(context).apply {
                isAllCaps = false
                minWidth = 0; minimumWidth = 0; minHeight = 0; minimumHeight = 0
                stateListAnimator = null
                val padX = (BUTTON_PAD_X * density).toInt(); val padY = (10 * density).toInt()
                setPadding(padX, padY, padX, padY)
                applyRole(this, "body")
                tone(this, "plain")
            }
            NodeType.INPUT -> EditText(context).apply {
                isSingleLine = true
                inputType = InputType.TYPE_CLASS_TEXT
                applyRole(this, "body")
                background = GradientDrawable().apply { cornerRadius = 8 * density; setStroke(density.toInt(), Color.rgb(200, 200, 204)) }
                setPadding((12 * density).toInt(), 0, (12 * density).toInt(), 0)
                gravity = Gravity.CENTER_VERTICAL
            }
            else -> View(context)
        }
        val node = Node(id, type, view, content)
        view.tag = node
        content?.tag = node // the scroll's content group sizes itself from the same frame (width × content height)
        nodes[id] = node
        lNode(handle, id, type == NodeType.TEXT || type == NodeType.BUTTON || type == NodeType.INPUT)
        if (type == NodeType.ROW) lSet(handle, id, LayoutKey.DIRECTION, 1f)
        if (type == NodeType.SCROLL) lSet(handle, id, LayoutKey.SCROLL, 1f)
    }

    private fun groupOf(n: Node): ViewGroup = n.content ?: n.view as ViewGroup

    private fun remove(id: Int) {
        val n = nodes[id] ?: return
        detach(n)
        (n.view.parent as? ViewGroup)?.removeView(n.view)
        fun drop(x: Int) { nodes.remove(x)?.children?.forEach(::drop) }
        drop(id)
        lRemove(handle, id)
    }

    private fun detach(n: Node) {
        nodes[n.parent]?.children?.remove(n.id)
        n.parent = 0
        (n.view.parent as? ViewGroup)?.removeView(n.view)
    }

    private fun insert(parent: Int, id: Int, before: Int) {
        val p = nodes[parent] ?: return
        val n = nodes[id] ?: return
        detach(n)
        val at = if (before != 0) p.children.indexOf(before) else -1
        val group = groupOf(p)
        if (at >= 0) {
            p.children.add(at, id)
            group.addView(n.view, group.indexOfChild(nodes[before]!!.view))
        } else {
            p.children.add(id)
            group.addView(n.view)
        }
        n.parent = parent
        lInsert(handle, parent, id, before)
    }

    private fun listen(id: Int, event: Int) {
        val n = nodes[id] ?: return
        when (event) {
            EventKind.TAP -> n.view.setOnClickListener { onEvent?.invoke(id, "tap", "") }
            EventKind.INPUT -> (n.view as? EditText)?.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    if (settingText) return
                    val text = s?.toString() ?: ""
                    reported.getOrPut(id) { ArrayDeque() }.addLast(text)
                    onEvent?.invoke(id, "input", text)
                }
            })
        }
    }

    private fun set(id: Int, prop: Int, value: Any) {
        val n = nodes[id] ?: return
        n.props[prop] = value
        val v = n.view
        when (prop) {
            Prop.TEXT -> {
                (v as? TextView)?.text = value as String
                lDirty(handle, id)
            }
            Prop.ROLE -> { (v as? TextView)?.let { applyRole(it, value as String) }; lDirty(handle, id) }
            Prop.VALUE -> {
                // The field owns its text. A value matching a report JS hasn't caught up with is a late echo and is
                // dropped (with the older reports); any other value is a real JS write and wins.
                val f = v as? EditText ?: return
                val s = value as String
                val pending = reported.getOrPut(id) { ArrayDeque() }
                val at = pending.indexOf(s)
                if (at >= 0) repeat(at + 1) { pending.removeFirst() }
                else {
                    pending.clear()
                    if (f.text.toString() != s) { settingText = true; f.setText(s); f.setSelection(s.length); settingText = false }
                }
            }
            Prop.PLACEHOLDER -> (v as? EditText)?.hint = value as String
            Prop.LABEL -> v.contentDescription = value as String
            Prop.DISABLED -> { v.isEnabled = value != true; v.alpha = if (value == true) 0.4f else 1f }
            Prop.TONE -> { (v as? Button)?.let { tone(it, value as String) }; lDirty(handle, id) }
            Prop.SURFACE -> SURFACES[value]?.let(v::setBackgroundColor)
            Prop.WIDTH -> lSet(handle, id, LayoutKey.WIDTH, (value as Double).toFloat())
            Prop.HEIGHT -> lSet(handle, id, LayoutKey.HEIGHT, (value as Double).toFloat())
            Prop.OPTIONS, Prop.SELECTED -> log?.invoke("Choice ${n.id}: no native segmented control on Android; the idiom table never sends one")
            Prop.GAP -> lSet(handle, id, LayoutKey.GAP, spaceTokens[value] ?: 0f)
            Prop.PAD -> lSet(handle, id, LayoutKey.PAD, spaceTokens[value] ?: 0f)
            Prop.GROW -> lSet(handle, id, LayoutKey.GROW, (value as Double).toFloat())
            Prop.ALIGN -> lSet(handle, id, LayoutKey.ALIGN, alignTokens[value] ?: 3f)
            Prop.JUSTIFY -> lSet(handle, id, LayoutKey.JUSTIFY, alignTokens[value] ?: 0f)
        }
    }

    private fun applyRole(t: TextView, role: String) {
        val r = textRoles[role] ?: textRoles["body"]!!
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, r.size)
        t.typeface = Typeface.create(Typeface.DEFAULT, r.weight, false)
    }

    private fun tone(b: Button, tone: String) {
        // Material 3 values from its baseline scheme: chips are 32dp tall with an 8dp radius, the navigation bar's
        // active indicator is a 64×32dp pill. The touch target stays 44dp; the drawing is inset inside it.
        fun shape(fill: Int, radius: Float, stroke: Int? = null, insetX: Float = 0f, insetY: Float = 0f) =
            InsetDrawable(GradientDrawable().apply {
                cornerRadius = radius * density
                color = ColorStateList.valueOf(fill)
                stroke?.let { setStroke(density.toInt(), it) }
            }, (insetX * density).toInt(), (insetY * density).toInt(), (insetX * density).toInt(), (insetY * density).toInt())
        val (bg, fg, weight) = when (tone) {
            "accent" -> Triple(shape(Color.rgb(0, 122, 255), 10f), Color.WHITE, 400)
            "chip" -> Triple(shape(Color.WHITE, 8f, Color.rgb(0x79, 0x74, 0x7E), insetY = 6f), Color.rgb(0x49, 0x45, 0x4F), 500)
            "chip-on" -> Triple(shape(Color.rgb(0xE8, 0xDE, 0xF8), 8f, insetY = 6f), Color.rgb(0x1D, 0x19, 0x2B), 500)
            "nav", "rail" -> Triple(null, Color.rgb(0x49, 0x45, 0x4F), 500)
            "nav-on", "rail-on" -> Triple(shape(Color.rgb(0xE8, 0xDE, 0xF8), 16f, insetX = 12f, insetY = 6f), Color.rgb(0x1D, 0x19, 0x2B), 700)
            else -> Triple(shape(Color.rgb(233, 233, 235), 10f), Color.BLACK, 400)
        }
        // An InsetDrawable reports its insets as padding, which would replace the button's; keep the button's.
        val (l, t, r, btm) = listOf(b.paddingLeft, b.paddingTop, b.paddingRight, b.paddingBottom)
        b.background = bg
        b.setPadding(l, t, r, btm)
        b.setTextColor(fg)
        b.typeface = Typeface.create(Typeface.DEFAULT, weight, false)
    }

    // ---- layout ----

    /** Called by weft-layout (via JNI) for measured leaves. Returns width and height in dp, packed. */
    @Suppress("unused")
    fun measure(id: Int, knownW: Float, knownH: Float, availW: Float): Long {
        val (w, h) = measureLeaf(id, if (knownW.isNaN()) availW else knownW)
        val fw = if (knownW.isNaN()) w else knownW
        val fh = if (knownH.isNaN()) h else knownH
        return (fw.toRawBits().toLong() shl 32) or (fh.toRawBits().toLong() and 0xffffffffL)
    }

    /** Platform measurement in dp, so wrapping matches what Android draws. */
    private fun measureLeaf(id: Int, availW: Float): Pair<Float, Float> {
        val n = nodes[id] ?: return 0f to 0f
        val bounded = availW.isFinite() && availW > 0
        if (n.type == NodeType.INPUT) return (if (bounded) availW else 200f) to CONTROL_MIN_HEIGHT
        if (n.type == NodeType.TEXT && (n.props[Prop.TEXT] as? String).isNullOrEmpty()) return 0f to 0f
        val spec = if (bounded) View.MeasureSpec.makeMeasureSpec((availW * density).toInt(), View.MeasureSpec.AT_MOST)
        else View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        n.view.measure(spec, View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
        val w = Math.ceil((n.view.measuredWidth / density).toDouble()).toFloat()
        val h = Math.ceil((n.view.measuredHeight / density).toDouble()).toFloat()
        // A touch target is at least square: 48dp each way (a "−" button is narrower than that on its own).
        return if (n.type == NodeType.BUTTON) maxOf(CONTROL_MIN_HEIGHT, w) to maxOf(CONTROL_MIN_HEIGHT, h) else w to h
    }

    fun layout() {
        if (root == 0 || container.width == 0) return
        lCompute(handle, root, container.width / density, container.height / density)
        for (n in nodes.values) {
            if (!lFrame(handle, n.id, out)) continue
            n.frame.apply { x = out[0]; y = out[1]; w = out[2]; h = out[3]; contentW = out[4]; contentH = out[5] }
        }
        container.requestLayout()
        // Layout runs inside the system-bar insets. A navigation bar or rail on an edge carries its colour on into the
        // inset there (edge-to-edge, as Material's NavigationBar and NavigationRail do) without changing any frame.
        onSurfaces?.invoke(nodes.values.mapNotNull { n ->
            val color = SURFACES[n.props[Prop.SURFACE]] ?: return@mapNotNull null
            absoluteFrame(n) to color
        })
        fun relayout(id: Int) {
            val n = nodes[id] ?: return
            (n.content ?: n.view as? FrameGroup)?.requestLayout()
            n.children.forEach(::relayout)
        }
        relayout(root)
    }

    private fun absoluteFrame(n: Node): Frame {
        var x = n.frame.x; var y = n.frame.y
        var p = nodes[n.parent]
        while (p != null) { x += p.frame.x; y += p.frame.y - (if (p.content != null) (p.view.scrollY / density) else 0f); p = nodes[p.parent] }
        return Frame().also { it.x = x; it.y = y; it.w = n.frame.w; it.h = n.frame.h }
    }

    /** Frames, types, labels and natural leaf sizes as JSON (dp), for comparing against the Node layout. */
    fun dumpFrames(): JSONObject {
        val list = JSONArray()
        fun walk(id: Int) {
            val n = nodes[id] ?: return
            val o = JSONObject()
                .put("id", id).put("type", typeName(n.type))
                .put("label", n.props[Prop.LABEL] as? String ?: "").put("text", n.props[Prop.TEXT] as? String ?: "")
                .put("x", n.frame.x).put("y", n.frame.y).put("w", n.frame.w).put("h", n.frame.h).put("contentH", n.frame.contentH)
            if (n.type == NodeType.TEXT || n.type == NodeType.BUTTON || n.type == NodeType.INPUT) {
                val (w, h) = measureLeaf(id, Float.POSITIVE_INFINITY)
                o.put("natW", w).put("natH", h)
            }
            list.put(o)
            n.children.forEach(::walk)
        }
        walk(root)
        return JSONObject().put("width", container.width / density).put("height", container.height / density).put("nodes", list)
    }

    // ---- dev socket (weft device) ----

    /** On-screen frame in the content area's dp, after scrolling. */
    private fun screenFrame(v: View): FloatArray {
        val at = IntArray(2).also(v::getLocationInWindow); val c = IntArray(2).also(container::getLocationInWindow)
        return floatArrayOf((at[0] - c[0]) / density, (at[1] - c[1]) / density, v.width / density, v.height / density)
    }
    private fun onScreen(f: FloatArray) = f[0] < container.width / density && f[0] + f[2] > 0 && f[1] < container.height / density && f[1] + f[3] > 0

    /** The host's own view tree as the app's semantics, the same shape the iOS host and the Node host return. */
    fun devSnapshot(): JSONObject {
        fun walk(id: Int): JSONObject? {
            val n = nodes[id] ?: return null
            val f = screenFrame(n.view)
            val o = JSONObject().put("id", id).put("type", typeName(n.type)).put("frame", JSONArray(f.map(Float::toDouble)))
                .put("visible", n.view.visibility == View.VISIBLE && onScreen(f))
            for ((k, p) in listOf("label" to Prop.LABEL, "text" to Prop.TEXT, "tone" to Prop.TONE, "role" to Prop.ROLE, "surface" to Prop.SURFACE))
                (n.props[p] as? String)?.takeIf { it.isNotEmpty() }?.let { o.put(k, it) }
            (n.view as? EditText)?.let { o.put("value", it.text.toString()) }
            if (!n.view.isEnabled) o.put("disabled", true)
            val kids = JSONArray(n.children.mapNotNull(::walk))
            if (kids.length() > 0) o.put("children", kids)
            return o
        }
        return walk(root) ?: JSONObject()
    }

    /** tap / type through the real view (`performClick`, `setText`), the path a finger or keyboard takes. Replies once
     *  the app's answer has been applied, or after 500 ms for actions that change nothing. */
    fun devAct(req: JSONObject, done: (JSONObject) -> Unit) {
        val cmd = req.optString("cmd")
        val matches = when {
            req.has("id") -> listOf(req.getInt("id")).filter(nodes::containsKey)
            req.has("label") -> nodes.filterValues { it.props[Prop.LABEL] == req.getString("label") }.keys.sorted()
            else -> return done(JSONObject().put("ok", false).put("error", "$cmd needs a label or an id"))
        }
        val what = if (req.has("label")) "labelled \"${req.getString("label")}\"" else "with id ${req.opt("id")}"
        if (matches.size != 1) return done(JSONObject().put("ok", false).put("error",
            if (matches.isEmpty()) "no node $what" else "${matches.size} nodes $what: ids $matches; pass an id"))
        val n = nodes[matches[0]]!!
        var settled = false
        val finish = {
            if (!settled) { settled = true; done(JSONObject().put("ok", true).put("id", n.id).put("visible", onScreen(screenFrame(n.view)))) }
        }
        when {
            cmd == "tap" && n.type == NodeType.BUTTON -> {
                if (!n.view.isEnabled) return done(JSONObject().put("ok", false).put("error", "${n.id} is disabled"))
                afterApply += finish; n.view.performClick()
            }
            cmd == "type" && n.view is EditText -> { afterApply += finish; (n.view as EditText).setText(req.optString("text")) }
            else -> return done(JSONObject().put("ok", false).put("error", "can't $cmd a ${typeName(n.type)}" +
                if (cmd == "select") " (Android draws choices as chips: tap the chip's label)" else ""))
        }
        container.postDelayed(finish, 500)
    }

    private fun typeName(t: Int) = when (t) {
        NodeType.STACK -> "Stack"; NodeType.ROW -> "Row"; NodeType.TEXT -> "Text"
        NodeType.BUTTON -> "Button"; NodeType.INPUT -> "Input"; NodeType.SCROLL -> "Scroll"; else -> "?"
    }

    private external fun lNew(): Long
    private external fun lNode(h: Long, id: Int, measured: Boolean)
    private external fun lRemove(h: Long, id: Int)
    private external fun lInsert(h: Long, parent: Int, id: Int, before: Int)
    private external fun lSet(h: Long, id: Int, key: Int, v: Float)
    private external fun lDirty(h: Long, id: Int)
    private external fun lCompute(h: Long, root: Int, w: Float, hh: Float)
    private external fun lFrame(h: Long, id: Int, out: FloatArray): Boolean

    companion object {
        init { System.loadLibrary("weft") }
        /** Material 3 baseline: the navigation bar sits on surface container, the rail on surface. */
        val SURFACES = mapOf("bar" to Color.rgb(0xF3, 0xED, 0xF7), "rail" to Color.rgb(0xFE, 0xF7, 0xFF))
    }
}
