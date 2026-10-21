import {GramlotWorkerServer} from '@gramlot/gramlot-serverless/gramlot-worker-server';
import {ModelPage} from './pages/models.js';
import {SQLitePage} from './pages/sqlite.js';
import {QueryPage} from './pages/queries.js';
const pages = {models: ModelPage, sqlite: SQLitePage, queries: QueryPage};
const section = new URL(self.location.href).searchParams.get('page') || 'models';
class PlaygroundServer extends GramlotWorkerServer {
    async resolveResources(path, PageClass) {
        const resources = await super.resolveResources(path, PageClass);
        return {...resources, js: resources.js.map(resource => ({...resource, group: 'playground'}))};
    }
}
new PlaygroundServer(pages[section] || ModelPage, {logic: 'playground'});
