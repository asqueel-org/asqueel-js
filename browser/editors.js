import {basicSetup} from 'codemirror';
import {EditorState, Compartment, Transaction} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {javascript} from '@codemirror/lang-javascript';
import {json} from '@codemirror/lang-json';
import {editorCollection} from './editors-definition.js';

export default editorCollection(Base => class extends Base {
    createControl() { return this.ownerDocument.createElement('div'); }
    get commitOnChange() { return true; }
    constructor() {
        super();
        // Use the actual editor control, without a hidden textarea or a second Data writer.
        this.controlBox.replaceChildren(this.control);
        this.configuration = new Compartment();
        this.editor = new EditorView({parent: this.control, root: this.shadowRoot,
            state: EditorState.create({extensions: [basicSetup, EditorView.lineWrapping,
                this.configuration.of([]),
                EditorView.theme({
                    '&': {height: 'var(--editor-height, 55vh)', fontSize: '12px', backgroundColor: 'var(--gramlot-surface)', color: 'var(--gramlot-ink)'},
                    '.cm-scroller': {overflow: 'auto', fontFamily: 'var(--gramlot-font-code, monospace)', lineHeight: '1.5'},
                    '.cm-content': {padding: '14px 0'},
                    '.cm-gutters': {backgroundColor: 'var(--gramlot-surface-subtle)', color: 'var(--gramlot-text-secondary)', border: 'none'},
                    '&.cm-focused': {outline: '2px solid var(--gramlot-focus-ring)', outlineOffset: '-2px'},
                }),
                EditorView.updateListener.of(update => {
                    if (update.docChanged && !this.projecting && !this.control.disabled && !this.control.readOnly) {
                        // Gramlot's ComponentControl owns the two-way value commit and
                        // forwards change to the page's named Logic after updating Data.
                        this.control.dispatchEvent(new this.ownerDocument.defaultView.Event('change'));
                    }
                }),
            ]})});
    }
    projectAttributes(attrs, adapt) {
        const rest = super.projectAttributes(attrs, adapt);
        const {language, disabled, readonly, label} = this.parameters;
        const key = JSON.stringify([language, disabled, readonly, label]);
        if (key !== this.configurationKey) {
            this.configurationKey = key;
            this.editor.dispatch({effects: this.configuration.reconfigure([
                language === 'json' ? json() : javascript(),
                EditorState.readOnly.of(Boolean(disabled || readonly)),
                EditorView.editable.of(!disabled && !readonly),
                EditorView.contentAttributes.of({'aria-label': label, 'aria-disabled': String(Boolean(disabled)), 'aria-readonly': String(Boolean(readonly))}),
            ])});
        }
        return rest;
    }
    readControlValue() { return this.editor.state.doc.toString(); }
    writeControlValue(value) {
        const text = value ?? '';
        if (text === this.readControlValue()) return;
        this.projecting = true;
        try { this.editor.dispatch({changes: {from: 0, to: this.editor.state.doc.length, insert: text},
            annotations: Transaction.addToHistory.of(false)}); }
        finally { this.projecting = false; }
    }
    focus() { this.editor.focus(); }
    releaseControl() { this.editor.destroy(); }
    disconnectedCallback() { this.editor.destroy(); }
});
