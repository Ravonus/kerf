//! Facts for hydration.

use super::{
    BindingPattern, Collect, Declaration, Export, ExportDefaultDeclaration,
    ExportDefaultDeclarationKind, Expression, GetSpan, HydrationFacts, Import,
    ImportDeclarationSpecifier, Loose, Node, Program, Scoping, Statement, TagRefs,
    VariableDeclarator, Visit, hatch, line_col,
};
use oxc_ast::ast::{
    ExportAllDeclaration, ExportFromDeclaration, ExportNamedDeclaration, ImportDeclaration,
};

const NOT_CODE: &[&str] = &[".css", ".scss", ".sass", ".less", ".styl", ".pcss"];

pub fn facts(program: &Program<'_>, scoping: &Scoping, source: &str) -> HydrationFacts {
    let mut out = HydrationFacts::default();
    let mut c = Collect {
        scoping,
        source,
        frames: Vec::new(),
        sites: Vec::new(),
        count: 0,
        handler: 0,
        component: false,
        depth: 0,
        handlers: Vec::new(),
        objects: Vec::new(),
        refs: Vec::new(),
    };
    let mut gap = 0u32;
    for stmt in &program.body {
        let span = stmt.span();
        let force = hatch(source, gap, span.start);
        gap = span.end;
        let line = line_col(source, span.start).0;
        FactItem {
            out: &mut out,
            c: &mut c,
            line,
            force,
        }
        .statement(stmt);
    }
    let mut tags = TagRefs::default();
    tags.visit_program(program);
    let mut loose = Loose {
        scoping,
        tags: tags.0,
        held: false,
        out: Vec::new(),
    };
    loose.visit_program(program);
    out.loose = loose.out;
    out
}

struct FactItem<'a, 's> {
    out: &'a mut HydrationFacts,
    c: &'a mut Collect<'s>,
    line: u32,
    force: Option<String>,
}

impl FactItem<'_, '_> {
    fn node(&mut self, name: String, value: bool, visit: &dyn Fn(&mut Collect<'_>)) {
        self.c.component = !value && name.starts_with(|l: char| l.is_ascii_uppercase());
        let f = self.c.framed(|c| visit(c));
        self.out.nodes.push(Node {
            name,
            line: self.line,
            own: f.own,
            passes: f.passes,
            force: self.force.clone(),
            uses: f.uses,
            sites: std::mem::take(&mut self.c.sites),
            value,
            early: f.early,
            globals: f.globals,
            calls: f.calls,
        });
    }

    fn statement(&mut self, stmt: &Statement<'_>) {
        match stmt {
            Statement::ImportDeclaration(i) => self.import(i),
            Statement::FunctionDeclaration(_)
            | Statement::VariableDeclaration(_)
            | Statement::ClassDeclaration(_) => self.direct(stmt),
            Statement::ExportDefaultDeclaration(e) => self.default_export(e),
            Statement::ExportDeclaration(e) => self.export_declaration(&e.declaration),
            Statement::ExportNamedDeclaration(e) => self.named_export(e),
            Statement::ExportFromDeclaration(e) => self.export_from(e),
            Statement::ExportAllDeclaration(e) => self.all_export(e),
            Statement::TSTypeAliasDeclaration(_)
            | Statement::TSInterfaceDeclaration(_)
            | Statement::TSEnumDeclaration(_)
            | Statement::EmptyStatement(_) => {}
            other => {
                self.out
                    .effects
                    .get_or_insert(format!("a top-level statement (line {})", self.line));
                self.node("(module)".into(), false, &|c| c.visit_statement(other));
            }
        }
    }

    fn import(&mut self, i: &ImportDeclaration<'_>) {
        if i.import_kind.is_type() {
            return;
        }
        let source_name = i.source.value.to_string();
        match &i.specifiers {
            None => {}
            Some(list) if list.is_empty() => {}
            Some(list) => {
                for s in list {
                    let (imported, kind_type) = match s {
                        ImportDeclarationSpecifier::ImportSpecifier(n) => {
                            (n.imported.name().to_string(), n.import_kind.is_type())
                        }
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => {
                            ("default".to_string(), false)
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => {
                            ("*".to_string(), false)
                        }
                    };
                    if !kind_type {
                        self.out.imports.push(Import {
                            local: s.local().name.to_string(),
                            source: source_name.clone(),
                            imported,
                        });
                    }
                }
                return;
            }
        }
        let plain = source_name.split('?').next().unwrap_or("");
        if !NOT_CODE.iter().any(|x| plain.ends_with(x))
            && !source_name.starts_with("weft:")
            && !source_name.starts_with("virtual:")
        {
            self.out.side.push(source_name.clone());
        }
    }

    fn direct(&mut self, stmt: &Statement<'_>) {
        match stmt {
            Statement::FunctionDeclaration(f) => {
                let name =
                    f.id.as_ref()
                        .map_or("(function)".to_string(), |i| i.name.to_string());
                self.node(name, false, &|c| {
                    c.visit_function(f, oxc_syntax::scope::ScopeFlags::empty());
                });
            }

            Statement::VariableDeclaration(v) => {
                for d in &v.declarations {
                    let names = binding_names(&d.id);
                    let name = names.first().cloned().unwrap_or_default();
                    self.node(name, holds_value(d), &|c| {
                        c.visit_variable_declarator(d);
                    });
                }
            }

            Statement::ClassDeclaration(k) => {
                let name =
                    k.id.as_ref()
                        .map_or("(class)".to_string(), |i| i.name.to_string());
                self.node(name, false, &|c| c.visit_class(k));
            }
            _ => unreachable!("only direct declarations"),
        }
    }

    fn default_export(&mut self, e: &ExportDefaultDeclaration<'_>) {
        match &e.declaration {
            ExportDefaultDeclarationKind::Identifier(id) => {
                self.out.exports.push(Export {
                    exported: "default".into(),
                    local: Some(id.name.to_string()),
                    ..Default::default()
                });
            }
            ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
                let name =
                    f.id.as_ref()
                        .map_or("default".to_string(), |i| i.name.to_string());
                self.out.exports.push(Export {
                    exported: "default".into(),
                    local: Some(name.clone()),
                    ..Default::default()
                });
                self.node(name, false, &|c| {
                    c.visit_function(f, oxc_syntax::scope::ScopeFlags::empty());
                });
            }
            ExportDefaultDeclarationKind::ClassDeclaration(k) => {
                self.out.exports.push(Export {
                    exported: "default".into(),
                    local: Some("default".into()),
                    ..Default::default()
                });
                self.node("default".into(), false, &|c| c.visit_class(k));
            }
            d => {
                if let Some(x) = d.as_expression() {
                    self.out.exports.push(Export {
                        exported: "default".into(),
                        local: Some("default".into()),
                        ..Default::default()
                    });
                    self.node("default".into(), false, &|c| c.visit_expression(x));
                }
            }
        }
    }

    fn export_declaration(&mut self, d: &Declaration<'_>) {
        match d {
            Declaration::FunctionDeclaration(f) => {
                let name = f.id.as_ref().map_or(String::new(), |i| i.name.to_string());
                self.out.exports.push(Export {
                    exported: name.clone(),
                    local: Some(name.clone()),
                    ..Default::default()
                });
                self.node(name, false, &|c| {
                    c.visit_function(f, oxc_syntax::scope::ScopeFlags::empty());
                });
            }
            Declaration::VariableDeclaration(v) => {
                for d in &v.declarations {
                    let names = binding_names(&d.id);
                    for n in &names {
                        self.out.exports.push(Export {
                            exported: n.clone(),
                            local: Some(n.clone()),
                            ..Default::default()
                        });
                    }
                    self.node(
                        names.first().cloned().unwrap_or_default(),
                        holds_value(d),
                        &|c| {
                            c.visit_variable_declarator(d);
                        },
                    );
                }
            }
            Declaration::ClassDeclaration(k) => {
                let name = k.id.as_ref().map_or(String::new(), |i| i.name.to_string());
                self.out.exports.push(Export {
                    exported: name.clone(),
                    local: Some(name.clone()),
                    ..Default::default()
                });
                self.node(name, false, &|c| c.visit_class(k));
            }
            Declaration::TSEnumDeclaration(k) => {
                let name = k.id.name.to_string();
                self.out.exports.push(Export {
                    exported: name.clone(),
                    local: Some(name),
                    ..Default::default()
                });
            }
            _ => {}
        }
    }

    fn named_export(&mut self, e: &ExportNamedDeclaration<'_>) {
        if e.export_kind.is_type() {
            return;
        }
        for s in &e.specifiers {
            if s.export_kind.is_type() {
                continue;
            }
            let exported = s.exported.name().to_string();
            let name = s.local.name().to_string();
            self.out.exports.push(Export {
                exported,
                local: Some(name),
                ..Default::default()
            });
        }
    }

    fn export_from(&mut self, e: &ExportFromDeclaration<'_>) {
        if !e.export_kind.is_type() {
            for s in &e.specifiers {
                if !s.export_kind.is_type() {
                    self.out.exports.push(Export {
                        exported: s.exported.name().to_string(),
                        local: None,
                        source: Some(e.source.value.to_string()),
                        imported: Some(s.local.name().to_string()),
                    });
                }
            }
        }
    }

    fn all_export(&mut self, e: &ExportAllDeclaration<'_>) {
        if !e.export_kind.is_type() {
            match &e.exported {
                Some(n) => self.out.exports.push(Export {
                    exported: n.name().to_string(),
                    local: None,
                    source: Some(e.source.value.to_string()),
                    imported: Some("*".into()),
                }),
                None => self.out.stars.push(e.source.value.to_string()),
            }
        }
    }
}

fn holds_value(d: &VariableDeclarator<'_>) -> bool {
    !d.init.as_ref().is_some_and(|e| {
        matches!(
            e.get_inner_expression(),
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)
        )
    })
}

fn binding_names(p: &BindingPattern<'_>) -> Vec<String> {
    match p {
        BindingPattern::BindingIdentifier(id) => vec![id.name.to_string()],
        BindingPattern::ObjectPattern(o) => o
            .properties
            .iter()
            .flat_map(|x| binding_names(&x.value))
            .collect(),
        BindingPattern::ArrayPattern(a) => a
            .elements
            .iter()
            .flatten()
            .flat_map(binding_names)
            .collect(),
        BindingPattern::AssignmentPattern(a) => binding_names(&a.left),
    }
}
