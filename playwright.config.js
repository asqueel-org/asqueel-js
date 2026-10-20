import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: './test/browser',
    timeout: 120_000,
    workers: 1,
    retries: 0,
    use: {baseURL: 'http://127.0.0.1:8093', trace: 'retain-on-failure'},
    webServer: {
        command: 'npm run build && npm run serve',
        env: {PORT: '8093'},
        url: 'http://127.0.0.1:8093',
        reuseExistingServer: false,
    },
});
