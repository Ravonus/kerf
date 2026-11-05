//! Collect components that can have a shape variant.

use std::collections::HashMap;

use oxc_ast::ast::{
    BindingPattern, Declaration, ExportDefaultDeclarationKind, Expression, Function, Program,
    Statement, VariableDeclaration,
};

use super::{Comp, arrow_body, has_jsx, is_component_name, returned, strip};

fn function<'b, 'a>(f: &'b Function<'a>, exported: Vec<String>) -> Option<Comp<'b, 'a>> {
    let b = f.body.as_ref()?;
    Some(Comp {
        local: f
            .id
            .as_ref()
            .map_or("Default", |i| i.name.as_str())
            .to_string(),
        exported,
        params: &f.params,
        statements: &b.statements,
        expression: None,
    })
}

pub(super) fn collect<'b, 'a>(program: &'b Program<'a>) -> Vec<Comp<'b, 'a>> {
    let mut comps = Vec::new();
    let mut vars = Vec::new();
    let mut names: HashMap<String, Vec<String>> = HashMap::new();
    for s in &program.body {
        match s {
            Statement::FunctionDeclaration(f) => comps.extend(function(f, Vec::new())),
            Statement::VariableDeclaration(d) => vars.push((&**d, false)),
            Statement::ExportDeclaration(e) => match &e.declaration {
                Declaration::FunctionDeclaration(f) => {
                    comps.extend(function(
                        f,
                        f.id.iter().map(|i| i.name.to_string()).collect(),
                    ));
                }
                Declaration::VariableDeclaration(d) => vars.push((&**d, true)),
                _ => {}
            },
            Statement::ExportNamedDeclaration(e) => {
                for sp in &e.specifiers {
                    names
                        .entry(sp.local.name().to_string())
                        .or_default()
                        .push(sp.exported.name().to_string());
                }
            }
            Statement::ExportDefaultDeclaration(e) => match &e.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
                    comps.extend(function(f, vec!["default".into()]));
                }
                ExportDefaultDeclarationKind::ArrowFunctionExpression(f) => {
                    let (statements, expression) = arrow_body(f);
                    comps.push(Comp {
                        local: "Default".into(),
                        exported: vec!["default".into()],
                        params: &f.params,
                        statements,
                        expression,
                    });
                }
                ExportDefaultDeclarationKind::Identifier(i) => {
                    names
                        .entry(i.name.to_string())
                        .or_default()
                        .push("default".into());
                }
                _ => {}
            },
            _ => {}
        }
    }
    collect_variables(vars, &mut comps);
    for c in &mut comps {
        if let Some(more) = names.remove(&c.local) {
            c.exported.extend(more);
        }
    }
    comps.retain(|c| {
        is_component_name(&c.local) && returned(c.statements, c.expression).is_some_and(has_jsx)
    });
    comps
}

fn collect_variables<'b, 'a>(
    vars: Vec<(&'b VariableDeclaration<'a>, bool)>,
    comps: &mut Vec<Comp<'b, 'a>>,
) {
    for (d, exported) in vars {
        for v in &d.declarations {
            let BindingPattern::BindingIdentifier(id) = &v.id else {
                continue;
            };
            let exported: Vec<String> = exported.then(|| id.name.to_string()).into_iter().collect();
            let local = id.name.to_string();
            match v.init.as_ref().map(strip) {
                Some(Expression::ArrowFunctionExpression(f)) => {
                    let (statements, expression) = arrow_body(f);
                    comps.push(Comp {
                        local,
                        exported,
                        params: &f.params,
                        statements,
                        expression,
                    });
                }
                Some(Expression::FunctionExpression(f)) => {
                    if let Some(b) = &f.body {
                        comps.push(Comp {
                            local,
                            exported,
                            params: &f.params,
                            statements: &b.statements,
                            expression: None,
                        });
                    }
                }
                _ => {}
            }
        }
    }
}
