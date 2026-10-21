import {mount} from '@gramlot/gramlot-serverless/standalone';
const section = new URL(location.href).searchParams.get('page') || 'models';
const embedded = new URL(location.href).searchParams.get('embedded') === '1';
document.body.dataset.view = embedded ? 'page' : 'index';
const worker = new URL('./page-worker.js', import.meta.url);
worker.searchParams.set('page', section);
worker.searchParams.set('embedded', embedded ? '1' : '0');
worker.searchParams.set('compact', matchMedia('(max-width: 700px)').matches ? '1' : '0');
try {
    await mount({workerUrl: worker.href, modules: {
        playground: new URL('./logic.js', import.meta.url).href,
        editors: new URL('./editors.js', import.meta.url).href,
        index: new URL('./index-logic.js', import.meta.url).href,
        layout: new URL('./layout.js', import.meta.url).href,
        tree: new URL('./tree.js', import.meta.url).href,
    }});
    document.querySelector('#boot-status').remove();
} catch (error) {
    document.querySelector('#boot-status').textContent = `Avvio Gramlot fallito: ${error.message}`;
    console.error(error);
}
