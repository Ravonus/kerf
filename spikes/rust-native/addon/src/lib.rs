// One addon, built twice with a different VERSION, to see what a process does with the second copy.
use std::sync::atomic::{AtomicU32, Ordering};
use napi::bindgen_prelude::*;
use napi_derive::napi;

const VERSION: &str = env!("SPIKE_VERSION");
static CALLS: AtomicU32 = AtomicU32::new(0);

#[napi]
pub fn version() -> String { format!("{VERSION}:{}", CALLS.fetch_add(1, Ordering::SeqCst)) }

pub struct Slow(u32);
impl Task for Slow {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> Result<String> {
        std::thread::sleep(std::time::Duration::from_millis(self.0 as u64));
        Ok(VERSION.to_string())
    }
    fn resolve(&mut self, _: Env, v: String) -> Result<String> { Ok(v) }
}

#[napi]
pub fn slow(ms: u32) -> AsyncTask<Slow> { AsyncTask::new(Slow(ms)) }

#[napi]
pub fn noop(s: String) -> u32 { s.len() as u32 }

pub struct Echo(String);
impl Task for Echo {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> Result<String> { Ok(std::mem::take(&mut self.0)) }
    fn resolve(&mut self, _: Env, v: String) -> Result<String> { Ok(v) }
}
#[napi]
pub fn echo(s: String) -> AsyncTask<Echo> { AsyncTask::new(Echo(s)) }
