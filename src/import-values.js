import {fromTytx, isDecimal} from '@genrojs/tytx';
import {record} from './sql-expressions.js';

// Keep SQLite's civil/decimal spelling: JS Date alone loses offsets and microseconds.
const spellings = new WeakMap();
function dateText(text) {
    let m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(text);
    if (!m) throw new Error('Invalid ISO date');
    const [, y, mo, d] = m, dt = new Date(0);
    dt.setUTCFullYear(+y, +mo - 1, +d); dt.setUTCHours(0, 0, 0, 0);
    if (+y < 1 || dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) throw new Error('Invalid ISO date');
    return `${y}-${mo}-${d}`;
}
function timeText(text) {
    const m = /^T?(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?(?:[.,](\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(text);
    if (!m || +m[1] > 23 || +(m[2] ?? 0) > 59 || +(m[3] ?? 0) > 59) throw new Error('Invalid ISO time');
    const fraction = (m[4] ?? '').slice(0, 6).padEnd(6, '0');
    let zone = m[5] ?? '';
    if (zone === 'Z') zone = '+00:00';
    else if (zone) {
        const parts = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(zone);
        if (+parts[2] > 23 || +(parts[3] ?? 0) > 59) throw new Error('Invalid ISO time zone');
        zone = `${parts[1]}${parts[2]}:${parts[3] ?? '00'}`;
    }
    return `${m[1]}:${m[2] ?? '00'}:${m[3] ?? '00'}${+fraction ? '.' + fraction : ''}${zone}`;
}
function decimalText(text) {
    const clean = text.replaceAll('_', '');
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(clean);
    if (!m || !(m[2] || m[3])) {
        if (/^[+-]?(?:Infinity|NaN|sNaN)$/i.test(clean)) return clean.replace(/^\+/, '');
        throw new Error('Invalid decimal');
    }
    const sign = m[1] === '-' ? '-' : '', digits = (m[2] + (m[3] ?? '')).replace(/^0+(?=\d)/, '') || '0';
    const exponent = +(m[4] ?? 0) - (m[3]?.length ?? 0), adjusted = exponent + digits.length - 1;
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100000) throw new Error('Exponent out of range');
    if (exponent > 0 || adjusted < -6) return `${sign}${digits[0]}${digits.length > 1 ? '.' + digits.slice(1) : ''}E${adjusted >= 0 ? '+' : ''}${adjusted}`;
    const point = digits.length + exponent;
    return sign + (exponent === 0 ? digits : point > 0 ? digits.slice(0, point) + '.' + digits.slice(point) : '0.' + '0'.repeat(-point) + digits);
}
function typedText(text, dtype) {
    let spelling;
    if (['D', 'DATE'].includes(dtype)) spelling = dateText(text);
    else if (['H', 'HZ', 'TIME'].includes(dtype)) spelling = timeText(text);
    else if (['DH', 'DHZ', 'DATETIME', 'DT'].includes(dtype)) {
        const m = /^(\d{4}-?\d{2}-?\d{2})(?:.(.+))?$/.exec(text);
        if (!m) throw new Error('Invalid ISO timestamp');
        spelling = dateText(m[1]) + 'T' + timeText(m[2] ?? '00:00:00');
    } else spelling = decimalText(text);
    // Decoder supplied by the existing TYTX package; the spelling is retained separately.
    const tag = ['N', 'NUMERIC', 'DECIMAL'].includes(dtype) ? 'N' : ['D', 'DATE'].includes(dtype) ? 'D' : ['H', 'HZ', 'TIME'].includes(dtype) ? 'H' : 'DHZ';
    const value = fromTytx(`${spelling}::${tag}`);
    if (value && typeof value === 'object') { spellings.set(value, spelling); return value; }
    return spelling;
}
const typed = new Set(['N', 'NUMERIC', 'DECIMAL', 'D', 'DATE', 'DH', 'DHZ', 'DATETIME', 'DT', 'H', 'HZ', 'TIME']);
export function adaptRecord(table, values) {
    record(values);
    for (const [name, value] of Object.entries(values)) {
        const column = table.columns.get(name);
        if (!column) throw new Error(`${name}: not a column of ${table.key}`);
        if (typeof value !== 'string') continue;
        const dtype = column.a.dtype, text = value.trim();
        try {
            if (dtype === 'B') {
                if (!text) values[name] = null;
                else if (['TRUE','YES','Y','1','FALSE','NO','N','0'].includes(text.toUpperCase())) values[name] = ['TRUE','YES','Y','1'].includes(text.toUpperCase());
                else throw new Error();
            } else if (typed.has(dtype)) values[name] = text ? typedText(text, dtype) : null;
            else if (['L','I','LONG','LONGINT','INT','INTEGER','serial','serial4'].includes(dtype)) {
                if (!text) values[name] = null;
                else {
                    if (!/^[+-]?\d(?:_?\d)*$/.test(text) || !Number.isSafeInteger(Number(text.replaceAll('_', '')))) throw new Error();
                    values[name] = Number(text.replaceAll('_', ''));
                }
            } else if (['R','F','REAL','FLOAT'].includes(dtype)) {
                if (!text) values[name] = null;
                else {
                    if (!/^[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/.test(text)) throw new Error();
                    values[name] = Number(text.replaceAll('_', ''));
                    if (!Number.isFinite(values[name])) throw new Error();
                }
            }
        } catch { throw new Error(`column ${name}: ${JSON.stringify(value)} is not a ${dtype} value`); }
    }
    return values;
}
export function decodeTytxRow(line) {
    const decoded = record(fromTytx(line));
    // TYTX JSON carries scalar spelling; never round it through a JS Date/Number.
    const raw = JSON.parse(line.endsWith('::JS') ? line.slice(0, -4) : line);
    for (const [name, text] of Object.entries(raw)) {
        const m = typeof text === 'string' && /^(.*)::([A-Z]+)$/s.exec(text);
        if (m && typed.has(m[2])) decoded[name] = typedText(m[1], m[2]);
    }
    return decoded;
}
export function sqliteImportRecord(values) {
    return Object.fromEntries(Object.entries(record(values)).map(([key, value]) => [key,
        value && typeof value === 'object' && spellings.has(value) ? spellings.get(value)
            : isDecimal(value) ? value.toString() : value instanceof Date ? value.toISOString() : value]));
}
