import {UnsupportedFeatureError} from './query-errors.js';

/** Python compiler.expand_period; natural-language decoding belongs to the supplied parser. */
export class PeriodMacro {
    constructor(bindings, environment, parseDateExpression) {
        this.bindings = bindings;
        this.environment = environment;
        this.parseDateExpression = parseDateExpression;
        this.parameters = new Map();
    }
    expand(text) {
        return text?.replace(/#PERIOD\s*\(\s*((?:\$|@)?[\p{L}\p{N}_.@]+)\s*,\s*:?(\w+)\)/gu,
            (_, field, name) => this.predicate(field, name));
    }
    predicate(field, name) {
        const {bindings, environment} = this;
        if (!Object.hasOwn(bindings.available, name) && name.startsWith('env_') && Object.hasOwn(environment, name.slice(4)))
            bindings.available[name] = environment[name.slice(4)];
        if (!Object.hasOwn(bindings.available, name)) throw new Error(`#PERIOD: parametro mancante ${name}`);
        if (!this.parameters.has(name)) {
            if (!Object.hasOwn(environment, 'workdate') || !Object.hasOwn(environment, 'locale'))
                throw new Error('#PERIOD richiede workdate e locale nell’ambiente');
            const text = bindings.available[name] || '';
            if (typeof text !== 'string') throw new TypeError('#PERIOD richiede un testo o un periodo vuoto');
            if (typeof this.parseDateExpression !== 'function') throw new UnsupportedFeatureError(
                '#PERIOD richiede parseDateExpression nel runtime: usare il parser di @gramlot/gramlot');
            // The compiler uses commas as range separators, before the Toolbox/Gramlot decoder.
            const result = this.parseDateExpression(text.replaceAll(',', ';'),
                {workdate: environment.workdate, locale: environment.locale});
            if (result != null && typeof result.then === 'function') {
                Promise.resolve(result).catch(() => {});
                throw new TypeError('#PERIOD richiede un parser sincrono');
            }
            if (!result?.ok) throw new Error(`#PERIOD: ${result?.error?.message ?? 'risultato del parser non valido'}`);
            if (!['date', 'period'].includes(result.kind)) throw new TypeError('#PERIOD: tipo di risultato del parser non valido');
            const start = result.kind === 'date' ? result.date : result.start;
            const end = result.kind === 'date' ? result.date : result.end;
            for (const value of [start, end]) if (!(value === null && result.kind === 'period') &&
                (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)))
                throw new TypeError('#PERIOD: il parser deve restituire date civili ISO o estremi null');
            const lower = start === null ? null : ':' + bindings.add(name + '_from', start);
            const upper = end === null ? null : end === start ? lower : ':' + bindings.add(name + '_to', end);
            this.parameters.set(name, [lower, upper]);
        }
        const [lower, upper] = this.parameters.get(name);
        if (lower === null && upper === null) return ' true ';
        if (lower === upper) return ` ${field} = ${lower} `;
        if (lower !== null && upper !== null) return ` (${field} BETWEEN ${lower} AND ${upper}) `;
        return lower !== null ? ` ${field} >= ${lower} ` : ` ${field} <= ${upper} `;
    }
}
