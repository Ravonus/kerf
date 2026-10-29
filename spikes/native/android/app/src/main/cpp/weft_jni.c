// JNI bridge for the Android host: QuickJS (app logic, JS thread) and weft-layout (main thread).
// Every js* entry runs on the JS HandlerThread and drains microtasks before returning, like JavaScriptCore does
// on iOS. Callbacks into Kotlin use the JNIEnv of the call that is currently running.
#include <jni.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "quickjs.h"
#include "../../../../../ios/Sources/weft_layout.h"

// ---------------- QuickJS ----------------

#define MAX_TIMERS 256

typedef struct {
  JSRuntime *rt;
  JSContext *ctx;
  JNIEnv *env;
  jobject host;  // dev.weft.spike.JsRuntime (global ref)
  jmethodID onOps, onLog, schedule, cancel;
  struct { int id; int repeat; JSValue fn; } timers[MAX_TIMERS];
  int next_timer;
} Js;

static Js *js_of(JSContext *ctx) { return (Js *)JS_GetContextOpaque(ctx); }

static void log_line(Js *s, const char *line) {
  jstring str = (*s->env)->NewStringUTF(s->env, line);
  (*s->env)->CallVoidMethod(s->env, s->host, s->onLog, str);
  (*s->env)->DeleteLocalRef(s->env, str);
}

static void report_exception(Js *s) {
  JSValue exc = JS_GetException(s->ctx);
  const char *msg = JS_ToCString(s->ctx, exc);
  JSValue stack = JS_GetPropertyStr(s->ctx, exc, "stack");
  const char *st = JS_ToCString(s->ctx, stack);
  char buf[2048];
  snprintf(buf, sizeof buf, "js error: %s %s", msg ? msg : "?", st ? st : "");
  log_line(s, buf);
  if (st) JS_FreeCString(s->ctx, st);
  if (msg) JS_FreeCString(s->ctx, msg);
  JS_FreeValue(s->ctx, stack);
  JS_FreeValue(s->ctx, exc);
}

static void drain(Js *s) {
  JSContext *c;
  int r;
  while ((r = JS_ExecutePendingJob(s->rt, &c)) != 0) {
    if (r < 0) report_exception(s);
  }
}

// __weftHost.apply(bytes: Uint8Array, ops: number): one copy per flush, into a Java byte[]
static JSValue host_apply(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  Js *s = js_of(ctx);
  size_t len = 0;
  uint8_t *ptr = JS_GetUint8Array(ctx, &len, argv[0]);
  if (!ptr) return JS_EXCEPTION;
  int32_t ops = 0;
  JS_ToInt32(ctx, &ops, argv[1]);
  jbyteArray arr = (*s->env)->NewByteArray(s->env, (jsize)len);
  (*s->env)->SetByteArrayRegion(s->env, arr, 0, (jsize)len, (const jbyte *)ptr);
  (*s->env)->CallVoidMethod(s->env, s->host, s->onOps, arr, ops);
  (*s->env)->DeleteLocalRef(s->env, arr);
  return JS_UNDEFINED;
}

static JSValue host_log(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *str = JS_ToCString(ctx, argv[0]);
  if (str) { char buf[1024]; snprintf(buf, sizeof buf, "js: %s", str); log_line(js_of(ctx), buf); JS_FreeCString(ctx, str); }
  return JS_UNDEFINED;
}

static JSValue set_timer(JSContext *ctx, int argc, JSValueConst *argv, int repeat) {
  Js *s = js_of(ctx);
  double ms = 0;
  if (argc > 1) JS_ToFloat64(ctx, &ms, argv[1]);
  for (int i = 0; i < MAX_TIMERS; i++) {
    if (s->timers[i].id) continue;
    int id = ++s->next_timer;
    s->timers[i].id = id;
    s->timers[i].repeat = repeat;
    s->timers[i].fn = JS_DupValue(ctx, argv[0]);
    (*s->env)->CallVoidMethod(s->env, s->host, s->schedule, id, ms, (jboolean)repeat);
    return JS_NewInt32(ctx, id);
  }
  return JS_ThrowRangeError(ctx, "too many timers");
}
static JSValue js_set_timeout(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) { return set_timer(c, argc, argv, 0); }
static JSValue js_set_interval(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) { return set_timer(c, argc, argv, 1); }

static void free_timer(Js *s, int slot) {
  JS_FreeValue(s->ctx, s->timers[slot].fn);
  s->timers[slot].id = 0;
}

static JSValue js_clear_timer(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  Js *s = js_of(ctx);
  int32_t id = 0;
  JS_ToInt32(ctx, &id, argv[0]);
  for (int i = 0; i < MAX_TIMERS; i++) {
    if (s->timers[i].id != id || !id) continue;
    free_timer(s, i);
    (*s->env)->CallVoidMethod(s->env, s->host, s->cancel, id);
  }
  return JS_UNDEFINED;
}

static void def(JSContext *ctx, JSValue obj, const char *name, JSCFunction *fn, int n) {
  JS_SetPropertyStr(ctx, obj, name, JS_NewCFunction(ctx, fn, name, n));
}

JNIEXPORT jlong JNICALL Java_dev_weft_spike_JsRuntime_jsNew(JNIEnv *env, jobject self) {
  Js *s = calloc(1, sizeof(Js));
  s->env = env;
  s->host = (*env)->NewGlobalRef(env, self);
  jclass cls = (*env)->GetObjectClass(env, self);
  s->onOps = (*env)->GetMethodID(env, cls, "onOps", "([BI)V");
  s->onLog = (*env)->GetMethodID(env, cls, "onLog", "(Ljava/lang/String;)V");
  s->schedule = (*env)->GetMethodID(env, cls, "scheduleTimer", "(IDZ)V");
  s->cancel = (*env)->GetMethodID(env, cls, "cancelTimer", "(I)V");
  s->rt = JS_NewRuntime();
  s->ctx = JS_NewContext(s->rt);
  JS_SetContextOpaque(s->ctx, s);

  JSValue global = JS_GetGlobalObject(s->ctx);
  JSValue host = JS_NewObject(s->ctx);
  def(s->ctx, host, "apply", host_apply, 2);
  def(s->ctx, host, "log", host_log, 1);
  JS_SetPropertyStr(s->ctx, global, "__weftHost", host);
  def(s->ctx, global, "setTimeout", js_set_timeout, 2);
  def(s->ctx, global, "setInterval", js_set_interval, 2);
  def(s->ctx, global, "clearTimeout", js_clear_timer, 1);
  def(s->ctx, global, "clearInterval", js_clear_timer, 1);
  JS_FreeValue(s->ctx, global);
  return (jlong)(intptr_t)s;
}

JNIEXPORT void JNICALL Java_dev_weft_spike_JsRuntime_jsEval(JNIEnv *env, jobject self, jlong h, jstring code) {
  Js *s = (Js *)(intptr_t)h;
  s->env = env;
  const char *src = (*env)->GetStringUTFChars(env, code, NULL);
  JSValue r = JS_Eval(s->ctx, src, strlen(src), "app.js", JS_EVAL_TYPE_GLOBAL);
  (*env)->ReleaseStringUTFChars(env, code, src);
  if (JS_IsException(r)) report_exception(s);
  JS_FreeValue(s->ctx, r);
  drain(s);
}

JNIEXPORT void JNICALL Java_dev_weft_spike_JsRuntime_jsDispatch(JNIEnv *env, jobject self, jlong h, jint id, jstring event, jstring payload) {
  Js *s = (Js *)(intptr_t)h;
  s->env = env;
  const char *ev = (*env)->GetStringUTFChars(env, event, NULL);
  const char *pl = (*env)->GetStringUTFChars(env, payload, NULL);
  JSValue global = JS_GetGlobalObject(s->ctx);
  JSValue weft = JS_GetPropertyStr(s->ctx, global, "__weft");
  JSValue fn = JS_GetPropertyStr(s->ctx, weft, "dispatch");
  JSValue args[3] = { JS_NewInt32(s->ctx, id), JS_NewString(s->ctx, ev), JS_NewString(s->ctx, pl) };
  JSValue r = JS_Call(s->ctx, fn, weft, 3, args);
  if (JS_IsException(r)) report_exception(s);
  JS_FreeValue(s->ctx, r);
  for (int i = 0; i < 3; i++) JS_FreeValue(s->ctx, args[i]);
  JS_FreeValue(s->ctx, fn);
  JS_FreeValue(s->ctx, weft);
  JS_FreeValue(s->ctx, global);
  (*env)->ReleaseStringUTFChars(env, event, ev);
  (*env)->ReleaseStringUTFChars(env, payload, pl);
  drain(s);
}

JNIEXPORT void JNICALL Java_dev_weft_spike_JsRuntime_jsFireTimer(JNIEnv *env, jobject self, jlong h, jint id) {
  Js *s = (Js *)(intptr_t)h;
  s->env = env;
  for (int i = 0; i < MAX_TIMERS; i++) {
    if (s->timers[i].id != id) continue;
    JSValue fn = JS_DupValue(s->ctx, s->timers[i].fn);
    if (!s->timers[i].repeat) free_timer(s, i);
    JSValue r = JS_Call(s->ctx, fn, JS_UNDEFINED, 0, NULL);
    if (JS_IsException(r)) report_exception(s);
    JS_FreeValue(s->ctx, r);
    JS_FreeValue(s->ctx, fn);
    break;
  }
  drain(s);
}

// ---------------- weft-layout ----------------

typedef struct {
  Tree *tree;
  JNIEnv *env;
  jobject renderer;  // dev.weft.spike.Renderer (global ref)
  jmethodID measure;
} Layout;

// Renderer.measure(id, knownW, knownH, availW) returns both sizes packed: high 32 bits width, low 32 bits height.
static void measure_cb(void *user, uint32_t id, float kw, float kh, float aw, float ah, float *out) {
  Layout *l = user;
  jlong packed = (*l->env)->CallLongMethod(l->env, l->renderer, l->measure, (jint)id, kw, kh, aw);
  uint32_t wb = (uint32_t)((uint64_t)packed >> 32), hb = (uint32_t)packed;
  memcpy(&out[0], &wb, 4);
  memcpy(&out[1], &hb, 4);
}

#define L(h) ((Layout *)(intptr_t)(h))

JNIEXPORT jlong JNICALL Java_dev_weft_spike_Renderer_lNew(JNIEnv *env, jobject self) {
  Layout *l = calloc(1, sizeof(Layout));
  l->renderer = (*env)->NewGlobalRef(env, self);
  l->measure = (*env)->GetMethodID(env, (*env)->GetObjectClass(env, self), "measure", "(IFFF)J");
  l->tree = wl_tree_new(measure_cb, l);
  return (jlong)(intptr_t)l;
}
JNIEXPORT void JNICALL Java_dev_weft_spike_Renderer_lNode(JNIEnv *e, jobject o, jlong h, jint id, jboolean m) { wl_node(L(h)->tree, id, m); }
JNIEXPORT void JNICALL Java_dev_weft_spike_Renderer_lRemove(JNIEnv *e, jobject o, jlong h, jint id) { wl_remove(L(h)->tree, id); }
JNIEXPORT void JNICALL Java_dev_weft_spike_Renderer_lInsert(JNIEnv *e, jobject o, jlong h, jint p, jint id, jint b) { wl_insert(L(h)->tree, p, id, b); }
JNIEXPORT void JNICALL Java_dev_weft_spike_Renderer_lSet(JNIEnv *e, jobject o, jlong h, jint id, jint k, jfloat v) { wl_set(L(h)->tree, id, k, v); }
JNIEXPORT void JNICALL Java_dev_weft_spike_Renderer_lDirty(JNIEnv *e, jobject o, jlong h, jint id) { wl_dirty(L(h)->tree, id); }

JNIEXPORT void JNICALL Java_dev_weft_spike_Renderer_lCompute(JNIEnv *env, jobject o, jlong h, jint root, jfloat w, jfloat hh) {
  L(h)->env = env;
  wl_compute(L(h)->tree, root, w, hh);
}

JNIEXPORT jboolean JNICALL Java_dev_weft_spike_Renderer_lFrame(JNIEnv *env, jobject o, jlong h, jint id, jfloatArray out) {
  float f[6];
  if (!wl_frame(L(h)->tree, id, f)) return JNI_FALSE;
  (*env)->SetFloatArrayRegion(env, out, 0, 6, f);
  return JNI_TRUE;
}
