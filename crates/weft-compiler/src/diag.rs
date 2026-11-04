//! Diagnostics: stable code, one line of why, a fix, and an autofix when it is mechanical (§2 rule 5).

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Clone, Debug, Serialize)]
pub struct Edit {
    pub start: u32,
    pub end: u32,
    pub text: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Fix {
    pub description: String,
    /// `true` when applying the edits can't change meaning, so `weft fix` may apply them unasked.
    pub safe: bool,
    pub edits: Vec<Edit>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Diagnostic {
    pub code: &'static str,
    pub severity: Severity,
    pub message: String,
    pub help: String,
    pub start: u32,
    pub end: u32,
    pub line: u32,
    pub column: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix: Option<Fix>,
}

impl Diagnostic {
    pub fn new(
        source: &str,
        code: &'static str,
        severity: Severity,
        (start, end): (u32, u32),
        message: impl Into<String>,
        help: impl Into<String>,
    ) -> Self {
        let (line, column) = line_col(source, start);
        Self {
            code,
            severity,
            message: message.into(),
            help: help.into(),
            start,
            end,
            line,
            column,
            fix: None,
        }
    }

    #[must_use]
    pub fn with_fix(mut self, fix: Fix) -> Self {
        self.fix = Some(fix);
        self
    }

    pub fn syntax(source: &str, message: String, offset: Option<usize>) -> Self {
        let at = offset.unwrap_or(0) as u32;
        Self::new(
            source,
            "W000",
            Severity::Error,
            (at, at),
            message,
            "Fix the syntax error first.",
        )
    }
}

/// 1-based line and column (in UTF-16 units, as editors count) of a byte offset.
pub fn line_col(source: &str, offset: u32) -> (u32, u32) {
    let before = &source[..(offset as usize).min(source.len())];
    let line = before.matches('\n').count() as u32 + 1;
    let line_start = before.rfind('\n').map_or(0, |i| i + 1);
    let column = before[line_start..].encode_utf16().count() as u32 + 1;
    (line, column)
}
