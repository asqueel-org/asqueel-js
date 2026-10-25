export class RecordNotFoundError extends Error { constructor(message = 'Record not found') { super(message); this.name = 'RecordNotFoundError'; } }
export class RecordMultipleRowsError extends Error { constructor(message = 'The query returned more than one record') { super(message); this.name = 'RecordMultipleRowsError'; } }
export class TransactionStateError extends Error { constructor(message) { super(message); this.name = 'TransactionStateError'; } }
export class UnsupportedFeatureError extends Error { constructor(message) { super(message); this.name = 'UnsupportedFeatureError'; } }
