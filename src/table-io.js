import {record} from './sql-expressions.js';
import {decodeTytxRow} from './import-values.js';

export function fileFormat(source, format) {
    if (format != null) {
        if (!['csv', 'json', 'tytx'].includes(format)) throw new Error(`Unknown data format: ${format}`);
        return format;
    }
    const name = source?.name ?? source?.path;
    const suffix = typeof name === 'string' ? /\.([^.\/]+)$/.exec(name)?.[1].toLowerCase() : null;
    if (!['csv', 'json', 'tytx'].includes(suffix)) throw new Error('Specify format or a .csv, .json or .tytx file name');
    return suffix;
}
export function isFileSource(source) {
    return typeof source === 'string' || source instanceof Uint8Array || typeof source?.stream === 'function'
        || typeof source?.getReader === 'function' || typeof source?.[Symbol.asyncIterator] === 'function';
}
async function* textChunks(source) {
    if (typeof source === 'string') { for (let i = 0; i < source.length; i += 65536) yield source.slice(i, i + 65536); return; }
    if (source instanceof Uint8Array) source = [source];
    if (typeof source.stream === 'function') source = source.stream();
    const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
    if (typeof source.getReader === 'function') {
        const reader = source.getReader();
        let done = false;
        try {
            while (true) { const next = await reader.read(); if (next.done) {done = true; break;}
                yield typeof next.value === 'string' ? next.value : decoder.decode(next.value, {stream: true}); }
        } finally { if (!done) await reader.cancel(); reader.releaseLock(); }
    } else {
        for await (const chunk of source) yield typeof chunk === 'string' ? chunk : decoder.decode(chunk, {stream: true});
    }
    const tail = decoder.decode(); if (tail) yield tail;
}
async function* csvRows(source) {
    let cells = [], cell = '', quoted = false, afterQuote = false, fresh = true, skipLF = false, used = false;
    for await (const chunk of textChunks(source)) for (const char of chunk) {
        if (skipLF) {skipLF = false; if (char === '\n') continue;}
        if (quoted) {
            if (char === '"') {quoted = false; afterQuote = true;} else cell += char;
            continue;
        }
        if (afterQuote) {
            afterQuote = false;
            if (char === '"') {cell += '"'; quoted = true; continue;}
        }
        if (char === '"' && fresh) {quoted = true; fresh = false; used = true;}
        else if (char === ',') {cells.push(cell); cell = ''; fresh = true; used = true;}
        else if (char === '\r' || char === '\n') {
            if (used || cells.length || cell) cells.push(cell);
            yield cells;
            cells = []; cell = ''; fresh = true; used = false; skipLF = char === '\r';
        } else {cell += char; fresh = false; used = true;}
    }
    if (used || cells.length || cell) {cells.push(cell); yield cells;}
}
async function* csvRecords(source) {
    let header;
    for await (const cells of csvRows(source)) {
        if (!header) {header = cells; continue;}
        if (!cells.length) continue;
        const row = Object.create(null);
        for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] === '' || cells[i] === undefined ? null : cells[i];
        if (cells.length > header.length) row.null = cells.slice(header.length);
        yield row;
    }
}
async function* jsonRecords(source) {
    let started = false, value = '', depth = 0, quoted = false, escaped = false;
    for await (const chunk of textChunks(source)) for (const char of chunk) {
        if (!value) {
            if (' \t\r\n,'.includes(char)) continue;
            if (!started) {if (char !== '[') throw new Error('The JSON must be an array of records'); started = true; continue;}
            if (char === ']') return;
            if (char !== '{') throw new Error('The JSON must contain objects');
        }
        value += char;
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') depth--;
        if (!depth && !quoted) {yield record(JSON.parse(value)); value = '';}
    }
    throw new Error('File JSON incompleto');
}
async function* tytxRecords(source) {
    let line = '';
    for await (const chunk of textChunks(source)) {
        line += chunk;
        let end;
        while ((end = line.indexOf('\n')) !== -1) {
            const value = line.slice(0, end).replace(/\r$/, ''); line = line.slice(end + 1);
            if (value.trim()) yield decodeTytxRow(value);
        }
    }
    if (line.trim()) yield decodeTytxRow(line.replace(/\r$/, ''));
}
export function readRecords(source, format) {
    return {csv: csvRecords, json: jsonRecords, tytx: tytxRecords}[fileFormat(source, format)](source);
}
