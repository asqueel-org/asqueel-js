export class RecordNotFoundError extends Error { constructor(message = 'Record non trovato') { super(message); this.name = 'RecordNotFoundError'; } }
export class RecordMultipleRowsError extends Error { constructor(message = 'La query ha restituito più record') { super(message); this.name = 'RecordMultipleRowsError'; } }
export class TransactionStateError extends Error { constructor(message) { super(message); this.name = 'TransactionStateError'; } }
export class UnsupportedFeatureError extends Error { constructor(message) { super(message); this.name = 'UnsupportedFeatureError'; } }
