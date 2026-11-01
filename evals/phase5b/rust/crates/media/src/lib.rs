weft::contract!();
use contract::*;

struct Media;

fn photo(seed: u32, width: usize, height: usize) -> Vec<u8> {
    let mut tile = vec![0u8; 64 * 64 * 4];
    let mut x = seed | 1;
    for b in &mut tile {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        *b = x as u8;
    }
    let mut image = Vec::with_capacity(width * height * 4);
    for y in 0..height {
        let row = &tile[(y & 63) * 64 * 4..((y & 63) * 64 + 64) * 4];
        let mut left = width * 4;
        while left > 0 {
            let n = left.min(row.len());
            image.extend_from_slice(&row[..n]);
            left -= n;
        }
    }
    image
}

/// 1 4 6 4 1 across each row. Five slices of one length: the compiler proves the bounds and vectorizes it.
fn blur_rows(src: &[u8], dst: &mut [u8], width: usize) {
    let stride = width * 4;
    let n = stride - 16;
    dst.copy_from_slice(src);
    for (s, d) in src.chunks_exact(stride).zip(dst.chunks_exact_mut(stride)) {
        let (a, b, c, e, f) = (&s[..n], &s[4..4 + n], &s[8..8 + n], &s[12..12 + n], &s[16..16 + n]);
        for (i, o) in d[8..8 + n].iter_mut().enumerate() {
            let sum = a[i] as u16 + 4 * b[i] as u16 + 6 * c[i] as u16 + 4 * e[i] as u16 + f[i] as u16;
            *o = ((sum + 8) >> 4) as u8;
        }
    }
}

/// 1 4 6 4 1 down each column.
fn blur_columns(src: &[u8], dst: &mut [u8], width: usize, height: usize) {
    let s = width * 4;
    dst.copy_from_slice(src);
    for y in 2..height - 2 {
        let (a, b, c, e, f) = (&src[(y - 2) * s..][..s], &src[(y - 1) * s..][..s], &src[y * s..][..s], &src[(y + 1) * s..][..s], &src[(y + 2) * s..][..s]);
        for (i, o) in dst[y * s..][..s].iter_mut().enumerate() {
            let sum = a[i] as u16 + 4 * b[i] as u16 + 6 * c[i] as u16 + 4 * e[i] as u16 + f[i] as u16;
            *o = ((sum + 8) >> 4) as u8;
        }
    }
}

/// The mean of each `factor`-square cell.
fn shrink(src: &[u8], width: usize, height: usize, factor: usize) -> Vec<u8> {
    let (w, h) = (width / factor, height / factor);
    let mut out = vec![0u8; w * h * 4];
    let mut sums = vec![0u32; w * 4];
    let cell = (factor * factor) as u32;
    for cy in 0..h {
        sums.fill(0);
        for y in 0..factor {
            let row = &src[(cy * factor + y) * width * 4..][..w * factor * 4];
            for (pixels, sum) in row.chunks_exact(factor * 4).zip(sums.chunks_exact_mut(4)) {
                for p in pixels.chunks_exact(4) {
                    for c in 0..4 {
                        sum[c] += p[c] as u32;
                    }
                }
            }
        }
        for (o, s) in out[cy * w * 4..][..w * 4].iter_mut().zip(&sums) {
            *o = (s / cell) as u8;
        }
    }
    out
}

impl Service for Media {
    async fn thumbnail(&self, _ctx: weft::Ctx, input: ThumbnailInput) -> Result<ThumbnailOutput, weft::Error> {
        let (width, height) = (input.width as usize, input.height as usize);
        let mut a = photo(input.seed as u32, width, height);
        let mut b = vec![0u8; a.len()];
        for _ in 0..input.passes.get() {
            blur_rows(&a, &mut b, width);
            blur_columns(&b, &mut a, width, height);
        }
        let out = shrink(&a, width, height, input.factor.get() as usize);
        let mut hash = 0x811c9dc5u32;
        let mut mean = [0u64; 4];
        for (i, &v) in out.iter().enumerate() {
            hash = (hash ^ v as u32).wrapping_mul(0x01000193);
            mean[i & 3] += v as u64;
        }
        let pixels = (out.len() / 4) as u64;
        Ok(ThumbnailOutput { checksum: format!("{hash:08x}"), mean: mean.iter().map(|m| (m / pixels) as i64).collect(), thumb: out[..16].iter().map(|&v| v as i64).collect() })
    }

    async fn guarded(&self, _ctx: weft::Ctx, input: GuardedInput) -> Result<GuardedOutput, GuardedError> {
        let pixels = input.width.get() as i64 * input.height.get() as i64;
        if pixels > 100_000_000 {
            return Err(GuardedError::TooLarge(GuardedTooLarge { pixels }));
        }
        Ok(GuardedOutput { pixels })
    }

    async fn stats(&self, ctx: weft::SharedCtx) -> Result<StatsOutput, weft::Error> {
        ctx.touch("images");
        ctx.tag("images:all");
        Ok(StatsOutput { images: 3 })
    }

    async fn boom(&self, _ctx: weft::Ctx) -> Result<BoomOutput, weft::Error> {
        panic!("the eval asked for this")
    }

    async fn spin(&self, ctx: weft::Ctx) -> Result<SpinOutput, weft::Error> {
        while !ctx.cancelled() {
            std::hint::spin_loop();
        }
        // Past the deadline, so TS's gives up first. WASM can't sleep: it holds the thread anyway.
        #[cfg(not(target_family = "wasm"))]
        std::thread::sleep(std::time::Duration::from_millis(100));
        Ok(())
    }
}

weft::native!(contract::functions(Media));
