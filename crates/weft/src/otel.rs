//! With the `otel` feature, a call's span continues the trace TS started: the app installs an OpenTelemetry layer, and
//! the envelope's `traceparent` becomes the parent. Without one, `trace_id` and `parent_id` are plain span fields.

use opentelemetry::trace::{SpanContext, SpanId, TraceContextExt, TraceFlags, TraceId, TraceState};
use opentelemetry::Context;
use tracing_opentelemetry::OpenTelemetrySpanExt;

pub(crate) fn parent(traceparent: &str) -> Option<SpanContext> {
    let mut parts = traceparent.split('-');
    let (version, trace, span, flags) = (parts.next()?, parts.next()?, parts.next()?, parts.next()?);
    if version != "00" {
        return None;
    }
    let trace = TraceId::from_hex(trace).ok().filter(|t| *t != TraceId::INVALID)?;
    let span = SpanId::from_hex(span).ok().filter(|s| *s != SpanId::INVALID)?;
    let flags = TraceFlags::new(u8::from_str_radix(flags, 16).ok()?);
    Some(SpanContext::new(trace, span, flags, true, TraceState::default()))
}

pub(crate) fn link(span: &tracing::Span, traceparent: Option<&str>) {
    if let Some(remote) = traceparent.and_then(parent) {
        let _ = span.set_parent(Context::new().with_remote_span_context(remote));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_w3c_traceparent() {
        let p = parent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01").unwrap();
        assert_eq!(p.trace_id().to_string(), "4bf92f3577b34da6a3ce929d0e0e4736");
        assert_eq!(p.span_id().to_string(), "00f067aa0ba902b7");
        assert!(p.is_sampled());
        assert!(p.is_remote());
    }

    #[test]
    fn refuses_what_isnt_one() {
        for bad in ["", "junk", "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", "00-00000000000000000000000000000000-00f067aa0ba902b7-01", "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01"] {
            assert!(parent(bad).is_none(), "{bad}");
        }
    }
}
