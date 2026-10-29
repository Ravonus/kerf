//! weftc: compile files and print code or diagnostics, or time a corpus.
//!
//!   weftc file.tsx [...]            compiled output (stdout) and diagnostics (stderr)
//!   weftc --json file.tsx [...]     one JSON result per file
//!   weftc --bench N dir             compile every .tsx in dir N times on one thread; print ms per pass
//!   weftc --check ...               diagnostics only (no codegen)

use std::{fs, path::PathBuf, time::Instant};

use weft_compiler::{Options, compile};

fn main() {
    let mut args = std::env::args().skip(1).peekable();
    let (mut json, mut check, mut bench) = (false, false, None);
    let mut paths = Vec::new();
    while let Some(a) = args.next() {
        match a.as_str() {
            "--json" => json = true,
            "--check" => check = true,
            "--bench" => bench = args.next().and_then(|n| n.parse::<usize>().ok()),
            _ => paths.push(PathBuf::from(a)),
        }
    }
    let mut files = Vec::new();
    for p in paths {
        if p.is_dir() {
            let mut entries: Vec<_> = fs::read_dir(&p).unwrap().flatten().map(|e| e.path()).collect();
            entries.sort();
            files.extend(entries.into_iter().filter(|f| f.extension().is_some_and(|x| x == "tsx")));
        } else {
            files.push(p);
        }
    }
    let sources: Vec<(String, String)> =
        files.iter().map(|f| (f.display().to_string(), fs::read_to_string(f).unwrap())).collect();

    if let Some(n) = bench {
        let mut runs = Vec::new();
        let mut diagnostics = 0;
        for _ in 0..n {
            let t = Instant::now();
            for (filename, source) in &sources {
                let out = compile(source, &Options { filename: filename.clone(), check_only: check, ..Default::default() });
                diagnostics += out.diagnostics.len();
                std::hint::black_box(out);
            }
            runs.push(t.elapsed().as_secs_f64() * 1000.0);
        }
        runs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let bytes: usize = sources.iter().map(|(_, s)| s.len()).sum();
        println!(
            "{{\"files\":{},\"bytes\":{},\"runs\":{},\"minMs\":{:.2},\"medianMs\":{:.2},\"maxMs\":{:.2},\"diagnostics\":{}}}",
            sources.len(),
            bytes,
            n,
            runs[0],
            runs[runs.len() / 2],
            runs[runs.len() - 1],
            diagnostics / n.max(1)
        );
        return;
    }

    let mut failed = false;
    for (filename, source) in &sources {
        let out = compile(source, &Options { filename: filename.clone(), check_only: check, ..Default::default() });
        if json {
            println!("{}", serde_json::to_string(&out).unwrap());
            continue;
        }
        for d in &out.diagnostics {
            eprintln!("{filename}:{}:{} {} {:?}: {}\n  help: {}", d.line, d.column, d.code, d.severity, d.message, d.help);
            failed |= d.severity == weft_compiler::Severity::Error;
        }
        if let Some(code) = out.code {
            println!("// {filename}\n{code}");
        }
    }
    std::process::exit(i32::from(failed));
}
