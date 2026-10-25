import {parseDateExpression} from '@genrojs/toolbox';

/** Python compiler.expand_period; natural-language dates are decoded by the toolbox, as genro_toolbox.dates in Python. */
export class PeriodMacro {
    constructor(bindings, environment) {
        this.bindings = bindings;
        this.environment = environment;
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
        if (!Object.hasOwn(bindings.available, name)) throw new Error(`#PERIOD: missing parameter ${name}`);
        if (!this.parameters.has(name)) {
            if (!Object.hasOwn(environment, 'workdate') || !Object.hasOwn(environment, 'locale'))
                throw new Error('#PERIOD requires workdate and locale in the environment');
            const text = bindings.available[name] || '';
            if (typeof text !== 'string') throw new TypeError('#PERIOD requires a text or an empty period');
            // The compiler uses commas as range separators, before the toolbox decoder.
            const result = parseDateExpression(text.replaceAll(',', ';'),
                {workdate: environment.workdate, locale: environment.locale});
            if (!result.ok) throw new Error(`#PERIOD: ${result.error.message}`);
            const start = result.kind === 'date' ? result.date : result.start;
            const end = result.kind === 'date' ? result.date : result.end;
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
