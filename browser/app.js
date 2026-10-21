import {mount} from '@gramlot/gramlot-serverless/standalone';
const section = new URL(location.href).searchParams.get('page') || 'models';
const worker = new URL('./page-worker.js', import.meta.url);
worker.searchParams.set('page', section);
try {
    await mount({workerUrl: worker.href, modules: {
        playground: new URL('./logic.js', import.meta.url).href,
        editors: new URL('./editors.js', import.meta.url).href,
    }});
    document.querySelector('#boot-status').remove();
} catch (error) {
    document.querySelector('#boot-status').textContent = `Avvio Gramlot fallito: ${error.message}`;
    console.error(error);
}
