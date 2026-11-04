//! Component emission.

use super::{
    Emitter, JSXElement, Kid, children, decode_entities, hoist_key, island_mark, js_string,
    list_key, passes_as_value, tag_read,
};

impl Emitter<'_> {
    pub(super) fn component(&mut self, el: &JSXElement<'_>, name: &str) -> String {
        let key = if name == "For" {
            self.uses_for = true;
            list_key(el)
        } else {
            None
        };
        let keyed = key.is_some();
        self.keys.extend(key);
        let island = if self.ssr { island_mark(el) } else { None };
        let mut fields = Vec::new();
        let kids = children(&el.children, self.text);
        match kids.as_slice() {
            [] => {}
            many if island.as_ref().is_some_and(|i| i.2) => {
                // The island's children stay the server's: a slot, rendered where the island reads it.
                let vs: Vec<String> = many.iter().map(|k| self.kid_value(k)).collect();
                let slot = self.helper("slot");
                fields.push(format!(
                    "get children() {{ return {slot}(() => [{}]); }}",
                    vs.join(", ")
                ));
            }
            [Kid::Text(t)] => fields.push(format!("children: {}", js_string(&decode_entities(t)))),
            [Kid::Expr(e)] if passes_as_value(e) => {
                let v = self.expr(e);
                let v = match self.keys.last().filter(|_| keyed && !self.ssr) {
                    Some(read) => hoist_key(v, read),
                    None => v,
                };
                fields.push(format!("children: {v}"));
            }
            [k] => {
                let v = self.kid_value(k);
                fields.push(format!("get children() {{ return {v}; }}"));
            }
            many => {
                let vs: Vec<String> = many.iter().map(|k| self.kid_value(k)).collect();
                fields.push(format!("get children() {{ return [{}]; }}", vs.join(", ")));
            }
        }
        if keyed {
            self.keys.pop();
        }
        let props = self.props(&el.opening_element.attributes, fields, false);
        let component = self.helper("component");
        let callee = match tag_read(el) {
            Some(read) => self.expr(read),
            None => name.to_string(),
        };
        if let Some((id, values, slotted, when)) = island {
            let call = self.helper("island");
            let names =
                serde_json::to_string(&values).expect("a list of strings always serializes");
            let slotted = slotted && !kids.is_empty();
            let tail = match (slotted, when.is_empty()) {
                (true, true) => ", 1".to_string(),
                (false, true) => String::new(),
                (s, false) => format!(", {}, {when:?}", if s { "1" } else { "void 0" }),
            };
            return format!("{call}({id:?}, {names}, {callee}, {props}{tail})");
        }
        // Dev builds name the component, so a <Boundary> can say where an error was thrown.
        match self.origin.get(&el.span.start) {
            Some(&(line, _)) if self.dev && !self.ssr && name != "For" => {
                format!(
                    "{component}({callee}, {props}, {name:?}, {:?})",
                    format!("{}:{line}", self.display)
                )
            }
            _ => format!("{component}({callee}, {props})"),
        }
    }
}
