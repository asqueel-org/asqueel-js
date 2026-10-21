import {Bag, IndexPage} from '@gramlot/gramlot/page';

export class PlaygroundIndex extends IndexPage {
    static title = 'Asqueel JS · Playground';
    static css_theme = 'gramlot-base';
    static css = ['/themes/gramlot-compact/theme.css', '/themes/gramlot-index/theme.css', '/style.css'];
    static devices = ['desktop', 'tablet', 'phone'];
    static initialSection = 'models';
    static compact = false;
    static get navigation() {
        const navigation = new Bag();
        for (const [key, title] of [['models', 'Modello'], ['sqlite', 'Migrazioni SQLite'], ['queries', 'Query'], ['transfer', 'Trasferimento offline']])
            navigation.setItem(key, null, {title, url: `?page=${key}&embedded=1`});
        return navigation;
    }
    main(root) {
        root.dataSetter({destination_path: 'navigationDrawer', value: this.constructor.compact ? 'close' : true});
        super.main(root);
    }
    top(pane) {
        pane.setAttr({height: '42px', class: 'gallery-toolbar'});
        pane.h1('Asqueel JS · Playground');
    }
    left(pane) {
        super.left(pane);
        pane.setAttr({width: '220px', minSize: 160, maxSize: 360,
            drawer: '^navigationDrawer', drawer_label: 'Navigazione', padding: '14px 8px'});
    }
    bottom(pane) {
        pane.setAttr({height: '30px', padding: '6px 16px', class: 'index-footer'});
        pane.span('SQLite su IndexedDB · le pagine aperte mantengono il proprio stato');
    }
    behavior(shell) {
        shell.dataController({func: 'indexMount', _onStart: true,
            shell_id: this.constructor.shellId, initial: this.constructor.initialSection});
    }
}
