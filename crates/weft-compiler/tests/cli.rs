//! weftc on a command line that can't run: a one-line error and exit 2, never a panic.
#![allow(clippy::unwrap_used, reason = "a panic in a test is the failure report")]

use std::process::{Command, Output};

fn weftc(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_weftc")).args(args).output().unwrap()
}

fn refused(args: &[&str], message: &str) {
    let out = weftc(args);
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert_eq!(out.status.code(), Some(2), "{stderr}");
    assert!(stderr.starts_with("weftc: ") && stderr.contains(message), "{stderr}");
    assert!(!stderr.contains("panicked"), "{stderr}");
}

#[test]
fn a_missing_file_is_an_error_not_a_panic() {
    refused(&["no/such/file.tsx"], "no/such/file.tsx");
}

#[test]
fn a_bad_explain_target_says_what_it_takes() {
    refused(&["--explain", "file.tsx"], "file.tsx:LINE");
    refused(&["--explain", "file.tsx:x"], "file.tsx:LINE");
    refused(&["--explain"], "file.tsx:LINE");
}

#[test]
fn bench_with_no_runs_reports_zeros() {
    let out = weftc(&["--bench", "0"]);
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    assert!(stdout.contains("\"runs\":0,\"minMs\":0.00"), "{stdout}");
}
