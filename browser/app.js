import {mount} from '@gramlot/gramlot-serverless/standalone';
// Exposed to the Gramlot page and to the real offline acceptance test.
window.offlineReady = (async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker non disponibile');
    const registration = await navigator.serviceWorker.register('/service-worker.js', {updateViaCache:'none'});
    if (!registration.active) await new Promise((resolve, reject) => {
        const worker = registration.installing || registration.waiting;
        if (!worker) return reject(new Error('Installazione non avviata'));
        const check = () => {
            if (worker.state === 'activated') resolve();
            if (worker.state === 'redundant') reject(new Error('Installazione degli asset fallita: ricarica con la rete disponibile'));
        };
        worker.addEventListener('statechange', check); check();
    });
    if (!navigator.serviceWorker.controller) await new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
    return true;
})();
// The page displays a failure without preventing ordinary online use.
window.offlineReady.catch(() => {});
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
