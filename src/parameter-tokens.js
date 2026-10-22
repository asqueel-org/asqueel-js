/** SQLite named parameters outside literals, identifiers and comments. */
export function* parameterMatches(sql) {
    const pattern = /'(?:''|[^'])*(?:'|$)|"(?:""|[^"])*(?:"|$)|`(?:``|[^`])*(?:`|$)|\[[^\]]*(?:\]|$)|--[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|\\:|(?<!:):(?<parameter>[\p{L}\p{N}_]+)/gu;
    for (const match of sql.matchAll(pattern)) if (match.groups.parameter) yield match;
}
export function substituteParameters(sql, replace) {
    let result = '', position = 0;
    for (const match of parameterMatches(sql)) {
        result += sql.slice(position, match.index) + replace(match);
        position = match.index + match[0].length;
    }
    return result + sql.slice(position);
}
