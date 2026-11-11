//! kerfc: compile files and print code or diagnostics, or time a corpus.
//!
//!   kerfc file.tsx [...]            compiled output (stdout) and diagnostics (stderr)
//!   kerfc --json file.tsx [...]     one JSON result per file
//!   kerfc --bench N dir             compile every .tsx in dir N times on one thread; print ms per pass
//!   kerfc --check ...               diagnostics only (no codegen)
//!   kerfc --dev ...                 dev output (a `// file:line <tag>` comment per template)
//!   kerfc --explain file.tsx:LINE   what each JSX node starting on LINE becomes

use std::{fs, path::PathBuf, time::Instant};

use kerf_compiler::{Options, compile};

/// A command line that can't run. Exit 1 is taken: it means the code has errors.
fn die(message: &str) -> ! {
    eprintln!("kerfc: {message}");
    std::process::exit(2)
}

fn main() {
    let mut args = std::env::args().skip(1).peekable();
    let (mut json, mut check, mut bench) = (false, false, None);
    let (mut dev, mut explain) = (false, None::<u32>);
    let mut paths = Vec::new();
    while let Some(a) = args.next() {
        match a.as_str() {
            "--json" => json = true,
            "--check" => check = true,
            "--dev" => dev = true,
            "--explain" => {
                let at = args.next().unwrap_or_default();
                let Some((file, Ok(line))) = at.rsplit_once(':').map(|(f, l)| (f, l.parse()))
                else {
                    die("--explain takes file.tsx:LINE")
                };
                explain = Some(line);
                paths.push(PathBuf::from(file));
            }
            "--bench" => bench = args.next().and_then(|n| n.parse::<usize>().ok()),
            _ => paths.push(PathBuf::from(a)),
        }
    }
    let mut seen = std::collections::HashSet::new();
    paths.retain(|p| seen.insert(p.clone())); // `kerfc a.tsx --explain a.tsx:3` names a.tsx once
    let mut files = Vec::new();
    for p in paths {
        if p.is_dir() {
            let dir = fs::read_dir(&p).unwrap_or_else(|e| die(&format!("{}: {e}", p.display())));
            let mut entries: Vec<_> = dir.flatten().map(|e| e.path()).collect();
            entries.sort();
            files.extend(
                entries
                    .into_iter()
                    .filter(|f| f.extension().is_some_and(|x| x == "tsx")),
            );
        } else {
            files.push(p);
        }
    }
    let sources: Vec<(String, String)> = files
        .iter()
        .map(|f| {
            let name = f.display().to_string();
            let source = fs::read_to_string(f).unwrap_or_else(|e| die(&format!("{name}: {e}")));
            (name, source)
        })
        .collect();

    if let Some(n) = bench {
        benchmark(&sources, n, check);
        return;
    }
    let failed = print_results(&sources, json, check, dev, explain);
    std::process::exit(i32::from(failed));
}

fn benchmark(sources: &[(String, String)], n: usize, check: bool) {
    let mut runs = Vec::new();
    let mut diagnostics = 0;
    for _ in 0..n {
        let t = Instant::now();
        for (filename, source) in sources {
            let out = compile(
                source,
                &Options {
                    filename: filename.clone(),
                    check_only: check,
                    ..Default::default()
                },
            );
            diagnostics += out.diagnostics.len();
            std::hint::black_box(out);
        }
        runs.push(t.elapsed().as_secs_f64() * 1000.0);
    }
    runs.sort_by(f64::total_cmp);
    let (min, median, max) = match runs.as_slice() {
        [] => (0.0, 0.0, 0.0),
        r => (r[0], r[r.len() / 2], r[r.len() - 1]),
    };
    let bytes: usize = sources.iter().map(|(_, s)| s.len()).sum();
    println!(
        "{{\"files\":{},\"bytes\":{},\"runs\":{},\"minMs\":{:.2},\"medianMs\":{:.2},\"maxMs\":{:.2},\"diagnostics\":{}}}",
        sources.len(),
        bytes,
        n,
        min,
        median,
        max,
        diagnostics / n.max(1)
    );
}

fn print_results(
    sources: &[(String, String)],
    json: bool,
    check: bool,
    dev: bool,
    explain: Option<u32>,
) -> bool {
    let mut failed = false;
    for (filename, source) in sources {
        let out = compile(
            source,
            &Options {
                filename: filename.clone(),
                check_only: check,
                dev,
                explain: explain.is_some(),
                ..Default::default()
            },
        );
        if let Some(line) = explain {
            let found: Vec<_> = out
                .explain
                .iter()
                .flatten()
                .filter(|x| x.line == line)
                .collect();
            if json {
                println!(
                    "{}",
                    serde_json::to_string(&found).expect("serializable output")
                );
            } else if found.is_empty() {
                eprintln!("{filename}:{line}: no JSX starts on this line");
                failed = true;
            }
            for x in found.iter().filter(|_| !json) {
                println!(
                    "{filename}:{}:{} {} becomes:\n  {}\n",
                    x.line, x.column, x.node, x.code
                );
            }
            continue;
        }
        if json {
            println!(
                "{}",
                serde_json::to_string(&out).expect("serializable output")
            );
            continue;
        }
        for d in &out.diagnostics {
            eprintln!(
                "{filename}:{}:{} {} {:?}: {}\n  help: {}",
                d.line, d.column, d.code, d.severity, d.message, d.help
            );
            failed |= d.severity == kerf_compiler::Severity::Error;
        }
        if let Some(code) = out.code {
            println!("// {filename}\n{code}");
        }
    }
    failed
}
