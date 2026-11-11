//! Emit each function's types, errors, trait method and dispatch entry.

use std::fmt::Write as _;

use typify::TypeSpace;

use super::{Spec, add, alias};

pub(super) fn function(
    s: &Spec<'_>,
    space: &mut TypeSpace,
    extra: &mut String,
    body: &mut String,
    methods: &mut String,
    table: &mut String,
) -> Result<(), String> {
    let name = &s.type_name;
    let input = match &s.input {
        Some(schema) => {
            *extra += &alias(
                &format!("{name}Input"),
                &add(space, schema, &format!("{name}Input"))?,
            );
            format!(", input: {name}Input")
        }
        None => String::new(),
    };
    *extra += &alias(
        &format!("{name}Output"),
        &add(space, &s.output, &format!("{name}Output"))?,
    );

    let error = error(s, space, extra, body)?;

    let _ = writeln!(
        methods,
        "/// `{id}`\nfn {method}(&self, ctx: ::kerf::{ctx}{input}) -> impl ::std::future::Future<Output = ::std::result::Result<{name}Output, {error}>> + Send;",
        id = s.id,
        method = s.method,
        ctx = s.ctx,
    );
    let (param, args) = if s.input.is_some() {
        (format!("input: {name}Input"), "ctx, input")
    } else {
        ("_: ()".to_string(), "ctx")
    };
    let _ = writeln!(
        table,
        ".add({id:?}, {{ let s = service.clone(); move |ctx: ::kerf::{ctx}, {param}| {{ let s = s.clone(); async move {{ s.{method}({args}).await }} }} }})",
        id = s.id,
        ctx = s.ctx,
        method = s.method,
    );
    Ok(())
}

fn error(
    s: &Spec<'_>,
    space: &mut TypeSpace,
    extra: &mut String,
    body: &mut String,
) -> Result<String, String> {
    let name = &s.type_name;
    Ok(if s.errors.is_empty() {
        "::kerf::Error".to_string()
    } else {
        let mut variants = String::new();
        for (code, schema) in &s.errors {
            let data = format!("{name}{code}");
            *extra += &alias(&data, &add(space, schema, &data)?);
            let _ = writeln!(variants, "{code}({data}),");
        }
        let _ = write!(
            *body,
            r#"
/// `{id}`'s declared errors, and `Internal` for the rest: any `std::error::Error` converts, so `?` works.
#[derive(Debug, ::serde::Serialize)]
#[serde(tag = "code", content = "data")]
pub enum {name}Error {{
    {variants}
    #[serde(skip)]
    Internal(::std::string::String),
}}
impl<E: ::std::error::Error> ::std::convert::From<E> for {name}Error {{
    fn from(e: E) -> Self {{ Self::Internal(e.to_string()) }}
}}
impl ::kerf::Failure for {name}Error {{
    fn failed(self) -> ::kerf::Failed {{
        match self {{
            Self::Internal(detail) => ::kerf::Failed::Internal(detail),
            typed => match ::serde_json::to_value(typed) {{
                Ok(v) => ::kerf::Failed::Typed(v),
                Err(e) => ::kerf::Failed::Internal(e.to_string()),
            }},
        }}
    }}
}}
"#,
            id = s.id,
        );
        format!("{name}Error")
    })
}
