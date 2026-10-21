import {split} from './sql-expressions.js';

/** Python compiler.expand_templates and SQLite concat_template, in the same order. */
export function expandTemplates(text) {
    if (!text) return text;
    const pattern = /#TEMPLATE\s*\(/g;
    let match;
    while ((match = pattern.exec(text))) {
        let depth = 1, quote = null, end = match.index + match[0].length;
        const start = end;
        for (; end < text.length; end++) {
            const ch = text[end];
            if (quote) { if (ch === quote) quote = null; }
            else if (ch === "'" || ch === '"') quote = ch;
            else if (ch === '(') depth++;
            else if (ch === ')' && --depth === 0) break;
        }
        if (depth) throw new Error('#TEMPLATE: parentesi di chiusura mancante');
        const [literal, ...args] = split(text.slice(start, end));
        const found = /^\s*'((?:[^']|'')*)'\s*$/s.exec(literal);
        if (!found) throw new Error('#TEMPLATE: il primo argomento deve essere un testo quotato');
        const expressions = new Map(), used = new Set(), parts = [];
        for (const argument of args) {
            const named = /^(.*\S)\s+as\s+([\p{L}\p{N}_]+)\s*$/isu.exec(argument.trim());
            if (!named) throw new Error('#TEMPLATE: ogni espressione richiede AS nome');
            if (expressions.has(named[2])) throw new Error(`#TEMPLATE: nome duplicato ${named[2]}`);
            expressions.set(named[2], named[1].trim());
        }
        const template = found[1].replaceAll("''", "'");
        const literalSQL = value => "'" + value.replaceAll("'", "''") + "'";
        let last = 0;
        for (const field of template.matchAll(/\$(?:\{([\p{L}\p{N}_]+)\}|(\$))?/gu)) {
            if (field.index > last) parts.push(literalSQL(template.slice(last, field.index)));
            if (field[2]) parts.push("'$'");
            else if (expressions.has(field[1])) {
                used.add(field[1]);
                parts.push(`COALESCE(CAST((${expressions.get(field[1])}) AS TEXT), '')`);
            } else throw new Error(field[1] ? `#TEMPLATE: argomento mancante ${field[1]}` : '#TEMPLATE: usare $$ per un dollaro letterale');
            last = field.index + field[0].length;
        }
        if (last < template.length) parts.push(literalSQL(template.slice(last)));
        if ([...expressions.keys()].some(name => !used.has(name))) throw new Error('#TEMPLATE: argomenti non usati');
        const sql = `(${parts.join(' || ') || "''"})`;
        text = text.slice(0, match.index) + sql + text.slice(end + 1);
        // Like Python, do not recursively expand macros introduced by an argument.
        pattern.lastIndex = match.index + sql.length;
    }
    return text;
}

/** Inclusive bounds and SQL three-valued logic, including two absent bounds. */
export function expandInRange(text) {
    return text?.replace(/#IN_RANGE\s*\(\s*((?:\$|@|:)?[\p{L}\p{N}_.@]+)\s*,\s*((?:\$|@|:)?[\p{L}\p{N}_.@]+)\s*,\s*((?:\$|@|:)?[\p{L}\p{N}_.@]+)\s*\)\s*/gu,
        (_, value, low, high) => `((${value}>=${low} AND ${value}<=${high} AND ` +
            `${low} IS NOT NULL AND ${high} IS NOT NULL) OR ` +
            `(${low} IS NULL AND ${high} IS NOT NULL AND ${value}<=${high}) OR ` +
            `(${low} IS NOT NULL AND ${high} IS NULL AND ${value}>=${low}) OR ` +
            `(${low} IS NULL AND ${high} IS NULL))`);
}
