const IDENT = '[A-Za-z_][A-Za-z0-9_]*';
const own = (o, k) => Object.hasOwn(o, k);
const q = value => {
    if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('Identificatore non valido');
    return `"${value.replaceAll('"', '""')}"`;
};
const scalar = value => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
    throw new Error('Parametro non supportato: usare null, stringa, booleano o numero finito sicuro');
};
const record = value => {
    if (!value || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        throw new Error('È richiesto un oggetto di attributi');
    }
    return value;
};
const columnName = c => c.a.sqlname || c.a.x_sql_name || c.a.name;
const tableSQL = t => `${q(t.sqlschema)}.${q(t.sqlname)}`;

// Identify quoted SQL and comments. Callers decide whether to preserve or adapt
// protected tokens to reproduce the Python compiler's legacy semantics.
function tokens(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Espressione SQL vuota');
    const out = [];
    for (let i = 0; i < text.length;) {
        const rest = text.slice(i);
        const pattern = /^(?:'(?:''|[^'])*'|"(?:\"\"|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)/;
        const quotedField = /^\$"((?:""|[^"])*)"/.exec(rest);
        if (quotedField) {
            out.push({kind: 'field', text: quotedField[0], field: quotedField[1].replaceAll('""', '"'), start: i});
            i += quotedField[0].length;
        } else {
            const protectedToken = pattern.exec(rest);
            if (protectedToken) {
                out.push({kind: 'protected', text: protectedToken[0], start: i});
                i += protectedToken[0].length;
            } else {
                if ("'\"`[".includes(text[i]) || rest.startsWith('/*')) throw new Error('Stringa o commento SQL non terminato');
                const previous = out.at(-1);
                if (previous?.kind === 'code') previous.text += text[i];
                else out.push({kind: 'code', text: text[i], start: i});
                i++;
            }
        }
    }
    return out;
}
function split(text) {
    const result = [], source = tokens(text);
    let depth = 0, start = 0;
    for (const token of source) if (token.kind === 'code') {
        for (let i = 0; i < token.text.length; i++) {
            const ch = token.text[i], position = token.start + i;
            if (ch === '(') depth++;
            if (ch === ')' && --depth < 0) throw new Error('Parentesi SQL non bilanciate');
            if (ch === ',' && !depth) { result.push(text.slice(start, position).trim()); start = position + 1; }
        }
    }
    if (depth) throw new Error('Parentesi SQL non bilanciate');
    result.push(text.slice(start).trim());
    if (result.some(s => !s)) throw new Error('Espressione vuota');
    return result;
}
function projectionAlias(text) {
    let depth = 0, found = null;
    for (const token of tokens(text)) if (token.kind === 'code') {
        for (let i = 0; i < token.text.length; i++) {
            if (token.text[i] === '(') depth++;
            else if (token.text[i] === ')') depth--;
            else if (!depth && /^AS\b/i.test(token.text.slice(i)) && (i === 0 || /\s/.test(token.text[i - 1]))) found = token.start + i;
        }
    }
    if (found == null) return [text, null];
    const alias = text.slice(found + 2).trim();
    if (new RegExp(`^${IDENT}$`).test(alias)) return [text.slice(0, found).trim(), alias];
    if (/^"(?:\"\"|[^"])*"$/.test(alias)) return [text.slice(0, found).trim(), alias.slice(1, -1).replaceAll('""', '"')];
    throw new Error('Alias di proiezione non valido');
}
const fieldReference = text => {
    const simple = new RegExp(`^\\$(${IDENT})$`).exec(text);
    if (simple) return simple[1];
    const quoted = /^\$"((?:""|[^"])*)"$/.exec(text);
    return quoted ? quoted[1].replaceAll('""', '"') : null;
};
export {IDENT, own, q, scalar, record, columnName, tableSQL, tokens, split, projectionAlias, fieldReference};
