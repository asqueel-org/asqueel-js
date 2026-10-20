import {defineModel} from '../src/index.js';

/** Replay Python's unexpanded declaration tree through the actual JS Builder. */
export function sourceModel(source) {
    return defineModel(root => {
        const append = (parent, nodes) => {
            for (const {tag, attributes, children} of nodes) {
                const node = parent[tag](structuredClone(attributes));
                append(node, children);
            }
        };
        append(root, source);
    });
}
