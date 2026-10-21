import {GramlotWorkerServer} from '@gramlot/gramlot-serverless/gramlot-worker-server';
import {ModelPage} from './pages/models.js';
import {SQLitePage} from './pages/sqlite.js';
import {TransferPage} from './pages/transfer.js';
import {QueryPage} from './pages/queries.js';
import {editorCollection} from './editors-definition.js';
import {PlaygroundIndex} from './pages/index.js';
import layout from '@gramlot/gramlot/components/layout';
import tree from '@gramlot/gramlot/components/tree';
const pages = {models: ModelPage, sqlite: SQLitePage, queries: QueryPage, transfer: TransferPage};
const section = new URL(self.location.href).searchParams.get('page') || 'models';
const embedded = new URL(self.location.href).searchParams.get('embedded') === '1';
PlaygroundIndex.initialSection = Object.hasOwn(pages, section) ? section : 'models';
PlaygroundIndex.compact = new URL(self.location.href).searchParams.get('compact') === '1';
class PlaygroundServer extends GramlotWorkerServer {
    async resolveResources(path, PageClass) {
        const resources = await super.resolveResources(path, PageClass);
        return {...resources, js: resources.js.map(resource => ({...resource, group: embedded ? 'playground' : null}))};
    }
}
new PlaygroundServer(embedded ? (pages[section] || ModelPage) : PlaygroundIndex, {logic: embedded ? 'playground' : 'index',
    collections: [{module: 'editors', grammar: editorCollection().toDocument()},
        {module: 'layout', grammar: layout.toDocument()}, {module: 'tree', grammar: tree.toDocument()}]});
