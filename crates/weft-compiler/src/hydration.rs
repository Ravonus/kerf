//! Partial hydration (PLAN §11). One read of a file for the project's view, and two small edits once that view has
//! decided which component call sites are islands.
//!
//! `facts` lists each top-level binding: why it needs the client by itself (a handler, a `ref`, a top-level side
//! effect), which top-level bindings it reads, and its component call sites with each prop's kind. It says nothing
//! about reactivity by name: a box can only reach a function through a binding that made one, or from a caller that
//! holds one, so the reads are enough (`weft/node/hydration.mjs` follows them across files).
//!
//! Call sites are numbered in source order. For a site the project made an island:
//!
//! | Output | What it gets |
//! |---|---|
//! | SSR | `<T _$i="id|a,b|s|w">`: `emit` wraps the component in `_$island`, sending props `a` and `b` as JSON; `w` is when it loads |
//! | DOM | `export const $iN = (_p) => <T …/>` appended to the source, so every pass treats it as authored code |
//!
//! A prop that is a literal or reads only module-level names is client code (`$iN` keeps its text); any other is a
//! server value (`_p.v[k]`). A prop that holds a function over local names can't be either, so the caller stays on the
//! client. Children that are plain markup stay the server's (`_p.s`, the slot), and children that need the client are
//! kept in `$iN` as written.
//!
//! When an island may load is the project's call too, so `facts` also says what could make waiting wrong: the globals a
//! binding touches outside handlers (`window.x` counts as `x`), the methods that move focus or scroll, what it calls while
//! rendering, and `early`, what must run with the page (`autofocus`, a `ref` callback that does more than keep the node).
//!
//! A handler or spread on an element that can only hold what a call site wrote is `passes`, not `own`: a site that gives
//! a handler is an island by itself. That holds only for a module-level function with a capital name, reading a prop
//! given under a handler's name or the rest of them, untouched since, and only if JSX tags are all that reach the
//! function, so `loose` names what's read as a value and could be called with anything.

mod escapes;
mod facts;
mod islands;
mod loose;
mod scan;
mod traverse;
mod visit;

use self::escapes::Escapes;
pub use self::facts::facts;
pub use self::islands::{by_index, hoisted, mark, marked};
use self::loose::{Loose, TagRefs, calls, hatch};
use self::scan::{attr_kind, attr_name, component_tag, has_kids, is_handler, kids_closed};
use self::visit::{Calls, Collect, Frame, MOVES, WINDOW, add};

use std::collections::{HashMap, HashSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ArrowFunctionExpression, AssignmentTarget, BindingIdentifier, BindingPattern, CallExpression,
    Class, ComputedMemberExpression, Declaration, ExportDefaultDeclaration,
    ExportDefaultDeclarationKind, ExportSpecifier, Expression, FormalParameters, Function,
    IdentifierReference, ImportDeclarationSpecifier, ImportExpression, JSXAttribute,
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXClosingElement, JSXElement,
    JSXElementName, JSXFragment, JSXMemberExpressionObject, JSXSpreadAttribute, NewExpression,
    ObjectPropertyKind, Program, SimpleAssignmentTarget, SpreadElement, Statement,
    StaticMemberExpression, TSType, TaggedTemplateExpression, ThisExpression, VariableDeclarator,
};
use oxc_ast_visit::{Visit, VisitMut, walk, walk_mut};
use oxc_parser::Parser;
use oxc_semantic::{Scoping, SemanticBuilder};
use oxc_span::{GetSpan, SPAN, SourceType, Span};
use oxc_syntax::reference::ReferenceId;
use oxc_syntax::symbol::SymbolId;
use serde::{Deserialize, Serialize};

use crate::diag::line_col;

/// The attribute the marking adds to an island's tag: `id|prop,prop|s|when`.
pub const ISLAND: &str = "_$i";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydrationFacts {
    pub nodes: Vec<Node>,
    pub imports: Vec<Import>,
    pub exports: Vec<Export>,
    /// `export * from "…"`.
    pub stars: Vec<String>,
    /// What this module does as it loads (a client that skips the module would skip it).
    pub effects: Option<String>,
    /// Modules it imports only to run them: an effect if they have one, which the project's view can tell.
    pub side: Vec<String>,
    /// Module-level names read as something other than a tag, or a table of tags.
    pub loose: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub name: String,
    pub line: u32,
    /// Why this binding needs the client, on its own.
    pub own: Option<String>,
    /// A handler or spread that holds only what a call site wrote: `own`, unless something other than a tag reaches this.
    pub passes: Option<String>,
    /// The `@weft client` / `@weft static` / `@weft visible` / `@weft interaction` comment above it.
    pub force: Option<String>,
    pub uses: Vec<String>,
    pub sites: Vec<Site>,
    /// A variable holding a value, not a function: what it holds is shared by everything that reads it.
    pub value: bool,
    /// Why this can't wait for the page to settle.
    pub early: Option<String>,
    /// Globals and page-moving methods (`.focus`) touched outside handlers.
    pub globals: Vec<String>,
    /// Module-level names called outside handlers.
    pub calls: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub index: u32,
    pub line: u32,
    /// The tag's module-level name; empty when it's a local value (`<props.icon />`).
    pub tag: String,
    /// `<ns.Tag />`: `Tag`.
    pub member: Option<String>,
    /// The tag gets a handler or `ref`, or a spread that could hold one, so this site needs the client whatever the tag is.
    pub handler: bool,
    pub attrs: Vec<Attr>,
    pub kids: Kids,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attr {
    pub name: String,
    /// `lit`, `closed` (module-level names only), `value` (the server sends it), `closure` (a function over local
    /// names) or `spread`.
    pub kind: String,
    pub uses: Vec<String>,
    pub own: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Kids {
    pub present: bool,
    /// Reads only module-level names, so `$iN` can hold them.
    pub closed: bool,
    /// A function child, or something in them needing the client by itself.
    pub own: Option<String>,
    pub uses: Vec<String>,
    /// The call sites inside.
    pub sites: Vec<u32>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Import {
    pub local: String,
    pub source: String,
    /// `default`, `*` or the export's name.
    pub imported: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Export {
    pub exported: String,
    pub local: Option<String>,
    /// `export { a as b } from "…"`.
    pub source: Option<String>,
    pub imported: Option<String>,
}

/// One site the project made an island (`Options::islands`).
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandSite {
    pub index: u32,
    /// Keep the children in `$iN`; otherwise they are the server's.
    pub hoist: bool,
    /// `v` (when visible) or `i` (on interaction). Empty: with the page.
    #[serde(default)]
    pub when: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Islands {
    /// The file's project-relative path: an island's id is `<id>#<site>`.
    pub id: String,
    pub sites: Vec<IslandSite>,
}
