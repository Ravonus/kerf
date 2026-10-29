//! The hook for `weft check`'s project view. Each file's compile reports W014 on its own: an error when the
//! spread-built box is rendered as a keyed list in the same file, a warning when the box leaves it as a component
//! prop. The facts below say where it goes (`spread_props`) and which component props a file renders by key
//! (`keyed_props`); `link_w014` joins them across files and upgrades the warnings that do reach a keyed list.

use serde::{Deserialize, Serialize};

use crate::{Diagnostic, Severity};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Facts {
    pub spread_props: Vec<SpreadProp>,
    pub keyed_props: Vec<KeyedProp>,
    /// Style groups this file defines, and its group call sites (style.rs), for the Vite plugin's CSS.
    #[serde(default)]
    pub groups: Vec<crate::style::GroupDef>,
    #[serde(default)]
    pub group_uses: Vec<crate::style::GroupUse>,
}

/// A W014 warning's box passed as `<component prop={box…}>`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpreadProp {
    /// Span of the W014 diagnostic.
    pub start: u32,
    pub end: u32,
    /// The component's exported name (the imported name when it comes from another module).
    pub component: String,
    /// Module specifier it is imported from; `None` when it is declared in the same file.
    pub import: Option<String>,
    pub prop: String,
}

/// `component` renders its `prop` as a keyed list (at `line`).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyedProp {
    pub component: String,
    pub prop: String,
    pub line: u32,
}

/// One file of the project view.
pub struct FileView<'f> {
    pub path: &'f str,
    pub facts: &'f Facts,
    pub diagnostics: &'f mut Vec<Diagnostic>,
}

/// Upgrade W014 warnings whose box reaches a keyed list in another component. `resolve(from, specifier)` maps an
/// import to a file path (the project view owns module resolution); a same-file component needs none.
pub fn link_w014(files: &mut [FileView<'_>], resolve: impl Fn(&str, &str) -> Option<String>) {
    let keyed: Vec<(String, KeyedProp)> = files
        .iter()
        .flat_map(|f| f.facts.keyed_props.iter().map(|k| (f.path.to_string(), k.clone())))
        .collect();
    for file in files.iter_mut() {
        for spread in &file.facts.spread_props {
            let target = match &spread.import {
                Some(spec) => match resolve(file.path, spec) {
                    Some(path) => path,
                    None => continue,
                },
                None => file.path.to_string(),
            };
            let Some((_, hit)) = keyed
                .iter()
                .find(|(path, k)| *path == target && k.component == spread.component && k.prop == spread.prop)
            else {
                continue;
            };
            let Some(d) = file
                .diagnostics
                .iter_mut()
                .find(|d| d.code == "W014" && d.start == spread.start && d.severity == Severity::Warning)
            else {
                continue;
            };
            d.severity = Severity::Error;
            d.message = format!(
                "`.map(p => ({{ ...p, … }}))` gives every item a new identity on each update, and `<{} {}>` renders \
                 it as a keyed list ({target}:{}): every row re-runs on every change.",
                spread.component, spread.prop, hit.line
            );
        }
    }
}
