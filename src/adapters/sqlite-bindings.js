// Preserve Python integer bindings, including safe JS integers beyond int32.
// Node Number binds as REAL; wa-sqlite Number binds as REAL outside int32.
// TEXT affinity would otherwise turn a counter 1 into '1.0'.
export function sqliteBindings(params) {
    const value = v => typeof v === 'number' && Number.isSafeInteger(v) ? BigInt(v) : v;
    return Array.isArray(params) ? params.map(value)
        : Object.fromEntries(Object.entries(params).map(([k, v]) => [k, value(v)]));
}
