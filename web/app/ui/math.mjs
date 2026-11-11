// Native MathML for the compact mathematical notation used in the prepared deck.
// All text is escaped. No HTML, TeX commands, remote scripts or fonts are executed.
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const row = parts => `<mrow>${parts.join('')}</mrow>`;
const token = (tag, value) => `<${tag}>${escape(value)}</${tag}>`;
const SUB = Object.fromEntries([... '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'].map((c, i) => [c, [...'0123456789+−=()aehijklmnoprstuvx'][i]]));
const SUP = { '⁰':'0', '¹':'1', '²':'2', '³':'3', '⁴':'4', '⁵':'5', '⁶':'6', '⁷':'7', '⁸':'8', '⁹':'9', '⁺':'+', '⁻':'−', 'ᵃ':'a', 'ᵏ':'k', 'ⁿ':'n', 'ᵗ':'t' };

function content(source) {
  const chars = [...source];
  let i = 0;
  const skip = () => { while (/\s/.test(chars[i] || '') && i < chars.length) i++; };
  const script = mapping => {
    let value = '';
    while (mapping[chars[i]] || chars[i] === '′' || chars[i] === "'") {
      value += mapping[chars[i]] || '′'; i++;
    }
    return content(value);
  };
  function atom() {
    skip();
    const c = chars[i++];
    if (!c) return row([]);
    let base, operator = false, sub = '', sup = '';
    if ('([{'.includes(c)) {
      const closing = { '(':')', '[':']', '{':'}' }[c];
      const inner = expression(closing);
      base = row([token('mo', c), inner, token('mo', closing)]);
    } else if (/\d/.test(c)) {
      let value = c;
      while (/[\d.]/.test(chars[i] || '') && i < chars.length) value += chars[i++];
      base = token('mn', value);
    } else {
      const rest = c + chars.slice(i).join('');
      const name = /^(argmax|max|min|sign|ReLU|Pub|Pass|Sleep|FB|C[123])/.exec(rest)?.[0];
      if (name) {
        i += name.length - 1;
        operator = ['max','min','argmax'].includes(name);
        base = `<mi mathvariant="normal">${escape(name)}</mi>`;
        if (operator && chars[i] === 'π') { sub = token('mi', chars[i++]); }
      } else if (c === 'Σ' || c === '∑') {
        base = '<mo largeop="true" movablelimits="true">∑</mo>'; operator = true;
      } else if (/[\p{L}]/u.test(c)) {
        base = token('mi', c);
        if (chars[i] === 'π' && /[vqEPR]/.test(c)) {
          const policy = token('mi', chars[i++]);
          if (/[PR]/.test(c)) sup = policy; else sub = policy;
        }
      } else base = token('mo', c === '-' ? '−' : c === '…' ? '⋯' : c);
    }
    while (i < chars.length) {
      if (SUB[chars[i]]) sub = script(SUB);
      else if (SUP[chars[i]]) sup = script(SUP);
      else if (chars[i] === '*' || chars[i] === '′' || chars[i] === "'") sup = token('mo', chars[i++] === '*' ? '∗' : '′');
      else if (operator && chars[i] === '∞') sup = token('mo', chars[i++]);
      else break;
    }
    if (sub && sup) return `<${operator ? 'munderover' : 'msubsup'}>${base}${sub}${sup}</${operator ? 'munderover' : 'msubsup'}>`;
    if (sub) return `<${operator ? 'munder' : 'msub'}>${base}${sub}</${operator ? 'munder' : 'msub'}>`;
    if (sup) return `<msup>${base}${sup}</msup>`;
    return base;
  }
  function expression(stop) {
    const parts = [];
    while (i < chars.length) {
      skip();
      if (i >= chars.length) break;
      if (stop && chars[i] === stop) { i++; break; }
      if (chars[i] === '/' && parts.length) {
        i++;
        parts.push(`<mfrac>${parts.pop()}${atom()}</mfrac>`);
      } else parts.push(atom());
    }
    return row(parts);
  }
  return expression();
}

export function renderMath(value, { display = false } = {}) {
  const text = String(value ?? '').trim();
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display ? 'block' : 'inline'}" aria-label="${escape(text)}">${content(text)}</math>`;
}

export function mathBlock(value) {
  return `<div class="formula" tabindex="0" role="group" aria-label="Mathematical formula">${renderMath(value, { display: true })}</div>`;
}
