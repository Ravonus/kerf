//! Source maps for weft's back end. `emit` builds its output from slices of the pre-pass's printed program, so each
//! slice is wrapped in markers that carry where it came from: `copy` for text copied verbatim (every position maps
//! through codegen's printed → authored map), `lowered` for a JSX node's generated code (it maps to the node). One
//! pass (`decode`) strips the markers and, when asked, writes the map from the final output to the authored file.
//! The markers are private-use characters, which neither the printer nor the emitter writes otherwise.

use oxc_sourcemap::SourceMapBuilder;

const COPY: char = '\u{E000}';
const LOWERED: char = '\u{E001}';
const END: char = '\u{E002}';
const NUM: char = '\u{E003}';

/// `printed[a..b]`, marked as copied from offset `a`.
pub fn copy(printed: &str, a: usize, b: usize) -> String {
    if a == b {
        String::new()
    } else {
        format!("{COPY}{a}{NUM}{}{END}", &printed[a..b])
    }
}

/// `code`, marked as the lowering of the JSX node at printed offset `at`.
pub fn lowered(at: u32, code: &str) -> String {
    format!("{LOWERED}{at}{NUM}{code}{END}")
}

/// `code` without markers (explain entries).
pub fn strip(code: &str) -> String {
    decode(code, None).0
}

/// Codegen's map as (printed byte offset, authored line, authored column), sorted by offset.
pub type Points = Vec<(u32, u32, u32)>;

pub fn points(printed: &str, map: &oxc_sourcemap::SourceMap) -> Points {
    let starts: Vec<usize> = std::iter::once(0)
        .chain(printed.match_indices('\n').map(|(i, _)| i + 1))
        .collect();
    let mut out: Points = map
        .get_tokens()
        .filter_map(|t| {
            let start = *starts.get(t.get_dst_line() as usize)?;
            let line = &printed[start
                ..starts
                    .get(t.get_dst_line() as usize + 1)
                    .map_or(printed.len(), |e| e - 1)];
            // Columns count UTF-16 units.
            let (mut units, mut byte) = (0, 0);
            for c in line.chars() {
                if units >= t.get_dst_col() {
                    break;
                }
                units += c.len_utf16() as u32;
                byte += c.len_utf8();
            }
            let at = (start + byte) as u32;
            // Nodes the pre-pass made have no span and print as 0:0. Only the file's start really is there.
            (at == 0 || t.get_src_line() > 0 || t.get_src_col() > 0)
                .then(|| (at, t.get_src_line(), t.get_src_col()))
        })
        .collect();
    out.sort_by_key(|p| p.0);
    out
}

pub struct Mapping<'a> {
    pub points: &'a Points,
    pub file: &'a str,
    pub source: &'a str,
}

enum Seg {
    Copy(usize),
    Lowered((u32, u32)),
}

fn marker_offset(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) -> usize {
    let mut n = 0usize;
    for d in chars.by_ref() {
        if d == NUM {
            break;
        }
        n = n * 10 + d.to_digit(10).unwrap_or(0) as usize;
    }
    n
}

/// Strip the markers from `marked`; with `mapping`, also return the source map (JSON).
pub fn decode(marked: &str, mapping: Option<Mapping>) -> (String, Option<String>) {
    let mut out = String::with_capacity(marked.len());
    let mut builder = SourceMapBuilder::default();
    let src = mapping
        .as_ref()
        .map(|m| builder.add_source_and_content(m.file, m.source));
    let pts: &[(u32, u32, u32)] = mapping.as_ref().map_or(&[], |m| m.points.as_slice());
    let at_or_before = |q: u32| {
        pts.partition_point(|p| p.0 <= q)
            .checked_sub(1)
            .map(|i| (pts[i].1, pts[i].2))
    };
    let mut stack: Vec<Seg> = Vec::new();
    let (mut line, mut col, mut next) = (0u32, 0u32, 0usize);
    let mut chars = marked.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            COPY | LOWERED => {
                let n = marker_offset(&mut chars);
                if c == COPY {
                    next = pts.partition_point(|p| (p.0 as usize) < n);
                    stack.push(Seg::Copy(n));
                } else {
                    let to = at_or_before(n as u32).unwrap_or((0, 0));
                    if src.is_some() {
                        builder.add_token(line, col, to.0, to.1, src, None);
                    }
                    stack.push(Seg::Lowered(to));
                }
            }
            END => {
                stack.pop();
                match stack.last() {
                    Some(Seg::Lowered(to)) if src.is_some() => {
                        builder.add_token(line, col, to.0, to.1, src, None);
                    }
                    // Back in a copy (it can't hold markers, so this doesn't happen; kept exact anyway).
                    Some(Seg::Copy(p)) => next = pts.partition_point(|x| (x.0 as usize) < *p),
                    _ => {}
                }
            }
            _ => {
                match stack.last_mut() {
                    Some(Seg::Copy(p)) => {
                        while next < pts.len() && pts[next].0 as usize == *p {
                            if src.is_some() {
                                builder.add_token(line, col, pts[next].1, pts[next].2, src, None);
                            }
                            next += 1;
                        }
                        *p += c.len_utf8();
                    }
                    Some(Seg::Lowered(_)) | None => {}
                }
                out.push(c);
                if c == '\n' {
                    line += 1;
                    col = 0;
                    // Each generated line of a lowered node maps to the node.
                    if let (Some(Seg::Lowered(to)), true) = (stack.last(), src.is_some())
                        && !matches!(chars.peek(), Some(&COPY | &LOWERED))
                    {
                        builder.add_token(line, col, to.0, to.1, src, None);
                    }
                } else {
                    col += c.len_utf16() as u32;
                }
            }
        }
    }
    let map = mapping.map(|m| {
        builder.set_file(m.file);
        builder.into_sourcemap().to_json_string()
    });
    (out, map)
}
