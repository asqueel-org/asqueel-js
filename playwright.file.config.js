import {defineConfig} from '@playwright/test';
// Intentionally no webServer: every test starts from a local HTML file.
export default defineConfig({testDir:'./test/file-browser',workers:1,timeout:120_000,
    use:{trace:'retain-on-failure'}});
