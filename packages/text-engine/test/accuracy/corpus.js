// Seeded paragraph corpus. latin/emoji/cjk/arabic are byte-identical to research 11's bench (page.js);
// thai, mixed and latin-hard are added for this study.
export function makeCorpus(name, n, seed = 42) {
  let s = seed >>> 0
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  const words = 'the of and a to in is you that it he was for on are as with his they I at be this have from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part interface component render streaming paragraph measure virtualised dashboard kanban accessibility internationalisation'.split(' ')
  const extras = {
    latin: [],
    emoji: ['🚀', '👍🏽', '🎉', '❤️', '👨‍👩‍👧', '✨'],
    cjk: ['春天到了', '中文排版', '日本語のテキスト', '한국어', '、', '。'],
    arabic: ['مرحبا', 'بالعالم', 'بدأت', 'الرحلة'],
    thai: ['สวัสดีครับ', 'ภาษาไทย', 'การจัดวางข้อความ', 'ประเทศไทย'],
    mixed: ['🚀', 'café', 'naïve', '“quoted”', '—', 'mañana', 'Straße', '中文', 'مرحبا', 'שלום', 'Привет', 'Ελληνικά', 'नमस्ते', '1,234.56', 'e.g.', '(see above)', 'https://example.com/a/b?c=d', 'snake_case_identifier', 'don’t', '…'],
    'latin-hard': ['“quoted”', '‘single’', 'don’t', 'it’s', '—', '–', '…', '(parenthetical)', '[bracket]', '{brace}', 'e.g.', 'i.e.,', '1,234.56', '$99.99', '€12', '50%', '10:30', '2026-10-28', 'well-known', 'state-of-the-art', 'co-op', 'https://example.com/path/to/page?q=1&r=2', 'user@example.com', 'a/b/c', 'camelCaseIdentifierThatIsVeryLongIndeed', 'supercalifragilisticexpialidocious', 'Ångström', 'façade', 'naïve', 'jalapeño', 'Øresund', 'œuvre', '#hashtag', '@mention', '“Wait!”', 'yes?', 'no!', 'x;', 'y:', '"straight"', "'apos'", 'A B', '1 000', '«guillemets»', '¿Qué?', '¡Hola!', '±5', '×2', '÷3', '°C', '§4', '¶', '•', '·', '%', '&', '*', '+', '=', '<tag>', '|', '~', '^'],
  }[name]
  const texts = []
  for (let i = 0; i < n; i++) {
    const len = 5 + Math.floor(rnd() * rnd() * 140)
    const out = []
    for (let j = 0; j < len; j++) {
      if (extras.length && rnd() < (name === 'latin-hard' ? 0.3 : 0.15)) out.push(extras[Math.floor(rnd() * extras.length)])
      else out.push(words[Math.floor(rnd() * words.length)])
    }
    let t = out.join(' ')
    if (name === 'cjk') t = t.replace(/ (?=[　-鿿가-힯])/g, '')
    if (name === 'thai') t = t.replace(/ (?=[฀-๿])/g, '')
    texts.push(t.charAt(0).toUpperCase() + t.slice(1) + '.')
  }
  return texts
}
