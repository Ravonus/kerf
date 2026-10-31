// The same inverted index and tf-idf ranking as evals/phase5a/ts/src/server/rank.ts, as a sidecar. The types and the
// `Service` trait are generated from the TS declarations; nothing here names a schema.
use std::collections::{HashMap, HashSet};
use std::sync::RwLock;

use serde::Deserialize;

weft::contract!();
use contract::*;

#[derive(Clone, Deserialize)]
struct Doc {
    id: String,
    title: String,
    body: String,
}

#[derive(Default)]
struct Index {
    docs: Vec<Doc>,
    postings: HashMap<String, Vec<(u32, u32)>>,
}

fn words(text: &str) -> Vec<String> {
    text.to_lowercase().split(|c: char| !c.is_ascii_alphanumeric()).filter(|w| !w.is_empty()).map(str::to_string).collect()
}

impl Index {
    fn add(&mut self, doc: Doc) {
        let at = self.docs.len() as u32;
        let mut counts = HashMap::<String, u32>::new();
        for w in words(&format!("{} {}", doc.title, doc.body)) {
            *counts.entry(w).or_default() += 1;
        }
        for (w, n) in counts {
            self.postings.entry(w).or_default().push((at, n));
        }
        self.docs.push(doc);
    }

    fn rank(&self, q: &str, limit: usize) -> Vec<(u32, f64)> {
        let mut scores = HashMap::<u32, f64>::new();
        for w in words(q).into_iter().collect::<HashSet<_>>() {
            let Some(list) = self.postings.get(&w) else { continue };
            let idf = (1.0 + self.docs.len() as f64 / list.len() as f64).ln();
            for (d, n) in list {
                *scores.entry(*d).or_default() += *n as f64 * idf;
            }
        }
        let mut hits: Vec<_> = scores.into_iter().collect();
        hits.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| self.docs[a.0 as usize].id.cmp(&self.docs[b.0 as usize].id)));
        hits.truncate(limit);
        hits
    }
}

struct Search {
    index: RwLock<Index>,
}

impl Service for Search {
    async fn search_docs(&self, ctx: weft::Ctx, input: SearchDocsInput) -> Result<SearchDocsOutput, weft::Error> {
        ctx.touch("docs");
        let index = self.index.read().expect("index");
        Ok(index
            .rank(input.q.as_str(), input.limit.get() as usize)
            .into_iter()
            .map(|(d, s)| {
                let doc = &index.docs[d as usize];
                SearchDocsOutputItem { id: doc.id.clone(), title: doc.title.clone(), score: (s * 1e6).round() / 1e6 }
            })
            .collect())
    }

    async fn popular(&self, ctx: weft::SharedCtx, input: PopularInput) -> Result<PopularOutput, weft::Error> {
        ctx.touch("docs");
        let index = self.index.read().expect("index");
        Ok(index.docs.iter().take(input.limit.get() as usize).map(|d| PopularOutputItem { id: d.id.clone(), title: d.title.clone() }).collect())
    }

    async fn get_doc(&self, ctx: weft::Ctx, input: GetDocInput) -> Result<GetDocOutput, GetDocError> {
        ctx.touch("docs");
        let index = self.index.read().expect("index");
        let id = input.id.to_string();
        ctx.tag(format!("doc:{id}"));
        match index.docs.iter().find(|d| d.id == id) {
            Some(d) => Ok(GetDocOutput { id: d.id.clone(), title: d.title.clone(), body: d.body.clone() }),
            None => Err(GetDocError::NotFound(GetDocNotFound { id })),
        }
    }

    async fn add_doc(&self, ctx: weft::Ctx, input: AddDocInput) -> Result<AddDocOutput, weft::Error> {
        ctx.touch("docs");
        let mut index = self.index.write().expect("index");
        let id = format!("added-{}", index.docs.len());
        index.add(Doc { id: id.clone(), title: input.title.to_string(), body: input.body.to_string() });
        Ok(AddDocOutput { id })
    }
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let docs: Vec<Doc> = serde_json::from_str(include_str!("../../../src/server/corpus.json"))?;
    let mut index = Index::default();
    docs.into_iter().for_each(|d| index.add(d));
    weft::serve(weft::router(contract::functions(Search { index: RwLock::new(index) }))).await
}
