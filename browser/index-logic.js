import {IndexLogic} from '@gramlot/gramlot/page';

// Delegate navigation, remote panels and retained tabs to Gramlot's coordinator.
export class Logic {
    indexMount(node, options) {
        IndexLogic.prototype.indexMount.call(this, node, options);
        node.SET('index.navigationSelection', options.initial);
        const viewport = matchMedia('(max-width: 700px)');
        viewport.addEventListener('change', event => node.SET('navigationDrawer', event.matches ? 'close' : true),
            {signal: this.page.abort.signal});
        // Keep public deep links and the browser Back button in sync with tabs.
        const state = node.GET('index');
        state.subscribe('playground-url', {any: event => {
            if (event.node.label !== 'active' || !event.node.value) return;
            const target = new URL(event.node.value, location.href);
            const current = new URL(location.href);
            if (current.searchParams.get('page') === target.searchParams.get('page')) return;
            current.searchParams.set('page', target.searchParams.get('page'));
            history.pushState(null, '', current);
        }});
        window.addEventListener('popstate', () => {
            const section = new URL(location.href).searchParams.get('page') || 'models';
            if (state.getItem('navigation').getNode(section)) node.SET('index.navigationSelection', section);
        }, {signal: this.page.abort.signal});
        this.page.abort.signal.addEventListener('abort', () => state.unsubscribe('playground-url'), {once: true});
    }
}
