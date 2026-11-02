//! React prop names on native elements. The tables run at compile time, so the output carries plain attribute names
//! and the runtime pays nothing for them. A `{...spread}` isn't known here: `attrName` in @weft-js/core/dom covers the same
//! names at run time (`packages/weft/test/react-props.test.tsx` checks the two agree).
//!
//! Names not listed pass through. SVG's other camelCase attributes (`viewBox`, `gradientUnits`) are spelled that way.

/// camelCase props whose attribute is the same word in lowercase. An HTML element would lowercase these itself; an
/// SVG element keeps the case, and a mixed-case attribute there does nothing.
const LOWERED: &[&str] = &[
    "accessKey",
    "allowFullScreen",
    "autoCapitalize",
    "autoComplete",
    "autoCorrect",
    "autoFocus",
    "autoPlay",
    "autoSave",
    "cellPadding",
    "cellSpacing",
    "charSet",
    "classID",
    "colSpan",
    "contentEditable",
    "contextMenu",
    "controlsList",
    "crossOrigin",
    "dateTime",
    "encType",
    "enterKeyHint",
    "fetchPriority",
    "formAction",
    "formEncType",
    "formMethod",
    "formNoValidate",
    "formTarget",
    "frameBorder",
    "hrefLang",
    "imageSizes",
    "imageSrcSet",
    "inputMode",
    "isMap",
    "itemID",
    "itemProp",
    "itemRef",
    "itemScope",
    "itemType",
    "marginHeight",
    "marginWidth",
    "maxLength",
    "mediaGroup",
    "minLength",
    "noModule",
    "noValidate",
    "playsInline",
    "popoverTarget",
    "popoverTargetAction",
    "radioGroup",
    "readOnly",
    "referrerPolicy",
    "rowSpan",
    "spellCheck",
    "srcDoc",
    "srcLang",
    "srcSet",
    "tabIndex",
    "useMap",
];

/// SVG presentation and font attributes, which are written with dashes (`strokeWidth` → `stroke-width`).
const DASHED: &[&str] = &[
    "accentHeight",
    "alignmentBaseline",
    "arabicForm",
    "baselineShift",
    "capHeight",
    "clipPath",
    "clipRule",
    "colorInterpolation",
    "colorInterpolationFilters",
    "colorProfile",
    "colorRendering",
    "dominantBaseline",
    "enableBackground",
    "fillOpacity",
    "fillRule",
    "floodColor",
    "floodOpacity",
    "fontFamily",
    "fontSize",
    "fontSizeAdjust",
    "fontStretch",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "glyphName",
    "glyphOrientationHorizontal",
    "glyphOrientationVertical",
    "horizAdvX",
    "horizOriginX",
    "imageRendering",
    "letterSpacing",
    "lightingColor",
    "markerEnd",
    "markerMid",
    "markerStart",
    "overlinePosition",
    "overlineThickness",
    "paintOrder",
    "panose1",
    "pointerEvents",
    "renderingIntent",
    "shapeRendering",
    "stopColor",
    "stopOpacity",
    "strikethroughPosition",
    "strikethroughThickness",
    "strokeDasharray",
    "strokeDashoffset",
    "strokeLinecap",
    "strokeLinejoin",
    "strokeMiterlimit",
    "strokeOpacity",
    "strokeWidth",
    "textAnchor",
    "textDecoration",
    "textRendering",
    "transformOrigin",
    "underlinePosition",
    "underlineThickness",
    "unicodeBidi",
    "unicodeRange",
    "unitsPerEm",
    "vAlphabetic",
    "vHanging",
    "vIdeographic",
    "vMathematical",
    "vectorEffect",
    "vertAdvY",
    "vertOriginX",
    "vertOriginY",
    "wordSpacing",
    "writingMode",
    "xHeight",
];

const RENAMED: &[(&str, &str)] =
    &[("acceptCharset", "accept-charset"), ("className", "class"), ("htmlFor", "for"), ("httpEquiv", "http-equiv")];

/// The attribute a JSX prop on a native element writes.
pub fn attribute(name: &str) -> String {
    if !name.bytes().any(|c| c.is_ascii_uppercase()) {
        return if name == "panose1" { "panose-1".into() } else { name.into() };
    }
    if let Some((_, to)) = RENAMED.iter().find(|(from, _)| *from == name) {
        return (*to).into();
    }
    if LOWERED.contains(&name) {
        return name.to_ascii_lowercase();
    }
    if DASHED.contains(&name) {
        return name.chars().fold(String::new(), |mut out, c| {
            if c.is_ascii_uppercase() {
                out.push('-');
            }
            out.push(c.to_ascii_lowercase());
            out
        });
    }
    // `xlinkHref`, `xmlLang`, `xmlnsXlink`
    for prefix in ["xlink", "xmlns", "xml"] {
        if let Some(rest) = name.strip_prefix(prefix).filter(|r| r.starts_with(|c: char| c.is_ascii_uppercase())) {
            return format!("{prefix}:{}", rest.to_ascii_lowercase());
        }
    }
    name.into()
}

/// Attributes whose states are the words `true`/`false`, so `false` can't mean a missing attribute. `data-*` isn't
/// one: weft's `data-x={flag}` is a presence flag, which `[data-x]` selectors depend on (docs/react-props.md).
pub fn takes_words(name: &str) -> bool {
    name.starts_with("aria-") || matches!(name, "contenteditable" | "draggable" | "focusable" | "spellcheck")
}

/// `onClick` → (`click`, false); `onClickCapture` → (`click`, true); lowercase `onkeydown` is an attribute, not an
/// event. `onChange` stays `change`: the back end gives it React's meaning (see `change` in @weft-js/core/dom).
pub fn event(name: &str) -> Option<(String, bool)> {
    let rest = name.strip_prefix("on")?;
    rest.chars().next().filter(|c| c.is_ascii_uppercase())?;
    let bare = rest.strip_suffix("Capture").filter(|r| !r.ends_with("Pointer"));
    let event = bare.unwrap_or(rest).to_ascii_lowercase();
    let capture = bare.is_some();
    Some(match event.as_str() {
        "doubleclick" => ("dblclick".into(), capture),
        "change" if capture => ("input".into(), true),
        _ => (event, capture),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        for (react, attr) in [
            ("tabIndex", "tabindex"),
            ("strokeWidth", "stroke-width"),
            ("clipPath", "clip-path"),
            ("className", "class"),
            ("httpEquiv", "http-equiv"),
            ("xlinkHref", "xlink:href"),
            ("xmlLang", "xml:lang"),
            ("xmlnsXlink", "xmlns:xlink"),
            ("horizAdvX", "horiz-adv-x"),
            ("panose1", "panose-1"),
            // negative controls: case-sensitive SVG attributes and unknown names pass through
            ("viewBox", "viewBox"),
            ("clipPathUnits", "clipPathUnits"),
            ("gradientUnits", "gradientUnits"),
            ("fooBar", "fooBar"),
        ] {
            assert_eq!(attribute(react), attr);
        }
    }

    #[test]
    fn events() {
        assert_eq!(event("onClick"), Some(("click".into(), false)));
        assert_eq!(event("onDoubleClick"), Some(("dblclick".into(), false)));
        assert_eq!(event("onDoubleClickCapture"), Some(("dblclick".into(), true)));
        assert_eq!(event("onGotPointerCapture"), Some(("gotpointercapture".into(), false)));
        assert_eq!(event("onchange"), None);
    }
}
