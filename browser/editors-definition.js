import {defineComponent, defineCollection, NativeControl} from '@gramlot/gramlot/components';

// The Worker only needs this DOM-free grammar; the browser supplies the editor.
export function editorCollection(implementation = Base => Base) {
    return defineCollection({name: 'playgroundEditors', components: [defineComponent({
        name: 'codeEditor', tag: 'asqueel-code-editor', base: NativeControl,
        parameters: {
            value: {dtype: 'T', nullable: true, binding: 'twoWay'},
            language: {dtype: 'T', default: 'javascript', binding: 'read'},
            label: {dtype: 'T', default: 'Codice', binding: 'read'},
        },
        implementation,
    })]});
}
