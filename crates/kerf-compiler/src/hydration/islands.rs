//! Islands for hydration.

use std::fmt::Write as _;

use super::{
    Allocator, GetSpan, HashMap, HydrationFacts, ISLAND, Islands, JSXAttributeItem,
    JSXAttributeName, JSXAttributeValue, JSXElement, Parser, Program, SPAN, Scoping,
    SemanticBuilder, Site, SourceType, Span, Visit, VisitMut, attr_kind, attr_name, component_tag,
    has_kids, walk, walk_mut,
};

/// `source` with `$iN` appended for each island: the same text as the call site, with server values and the slot read
/// from `_p`. Parsed separately so `compile` can run on the result as if it were authored.
pub fn hoisted(source: &str, source_type: SourceType, islands: &Islands) -> Option<String> {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if parsed.panicked || !parsed.diagnostics.is_empty() {
        return None;
    }
    let semantic = SemanticBuilder::new().build(&parsed.program).semantic;
    let mut h = Hoist {
        scoping: semantic.scoping(),
        source,
        islands,
        count: 0,
        out: String::new(),
    };
    h.visit_program(&parsed.program);
    Some(h.out)
}

struct Hoist<'s> {
    scoping: &'s Scoping,
    source: &'s str,
    islands: &'s Islands,
    count: u32,
    out: String,
}

impl<'a> Visit<'a> for Hoist<'_> {
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        if component_tag(&it.opening_element.name) {
            let index = self.count;
            self.count += 1;
            if let Some(site) = self.islands.sites.iter().find(|s| s.index == index) {
                let text = |s: Span| &self.source[s.start as usize..s.end as usize];
                let tag = text(it.opening_element.name.span());
                let mut attrs = String::new();
                let mut k = 0;
                for a in &it.opening_element.attributes {
                    let JSXAttributeItem::Attribute(a) = a else {
                        continue;
                    };
                    let name = attr_name(a);
                    if name == "key" {
                        continue;
                    }
                    attrs.push(' ');
                    if attr_kind(self.scoping, a) == "value" {
                        let _ = write!(attrs, "{name}={{_p.v[{k}]}}");
                        k += 1;
                    } else {
                        attrs.push_str(text(a.span));
                    }
                }
                let body = match (&it.closing_element, has_kids(it)) {
                    (Some(close), true) if site.hoist => {
                        text(Span::new(it.opening_element.span.end, close.span.start)).to_string()
                    }
                    (_, true) => "{_p.s}".to_string(),
                    _ => String::new(),
                };
                let _ = writeln!(
                    self.out,
                    "\nexport const $i{index} = (_p) => <{tag}{attrs}>{body}</{tag}>;"
                );
            }
        }
        walk::walk_jsx_element(self, it);
    }
}

/// Mark each island's tag for the SSR back end.
pub fn mark<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    scoping: &Scoping,
    islands: &Islands,
) {
    let mut m = Mark {
        allocator,
        scoping,
        islands,
        count: 0,
    };
    m.visit_program(program);
}

struct Mark<'a, 's> {
    allocator: &'a Allocator,
    scoping: &'s Scoping,
    islands: &'s Islands,
    count: u32,
}

impl<'a> VisitMut<'a> for Mark<'a, '_> {
    fn visit_jsx_element(&mut self, it: &mut JSXElement<'a>) {
        if component_tag(&it.opening_element.name) {
            let index = self.count;
            self.count += 1;
            if let Some(site) = self.islands.sites.iter().find(|s| s.index == index) {
                let values: Vec<String> = it
                    .opening_element
                    .attributes
                    .iter()
                    .filter_map(|a| match a {
                        JSXAttributeItem::Attribute(a)
                            if attr_name(a) != "key" && attr_kind(self.scoping, a) == "value" =>
                        {
                            Some(attr_name(a))
                        }
                        _ => None,
                    })
                    .collect();
                let slot = !site.hoist && has_kids(it);
                let value = format!(
                    "{}#{index}|{}|{}|{}",
                    self.islands.id,
                    values.join(","),
                    if slot { "s" } else { "" },
                    site.when
                );
                let ast = oxc_ast::builder::AstBuilder::new(self.allocator);
                let name = JSXAttributeName::new_identifier(SPAN, ISLAND, &ast);
                let lit = JSXAttributeValue::new_string_literal(
                    SPAN,
                    self.allocator.alloc_str(&value),
                    None,
                    &ast,
                );
                it.opening_element
                    .attributes
                    .push(JSXAttributeItem::new_attribute(SPAN, name, Some(lit), &ast));
            }
        }
        walk_mut::walk_jsx_element(self, it);
    }
}

/// `(id, values, slot, when)` of a marked tag.
pub fn marked(value: &str) -> Option<(String, Vec<String>, bool, String)> {
    let mut parts = value.split('|');
    let id = parts.next()?.to_string();
    let values = parts
        .next()?
        .split(',')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    let slot = parts.next() == Some("s");
    Some((id, values, slot, parts.next().unwrap_or("").to_string()))
}

/// Sites by index, for tests and callers that want one.
pub fn by_index(facts: &HydrationFacts) -> HashMap<u32, &Site> {
    facts
        .nodes
        .iter()
        .flat_map(|n| n.sites.iter().map(|s| (s.index, s)))
        .collect()
}
