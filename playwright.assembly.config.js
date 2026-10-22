import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./test/assembly-browser',workers:1,timeout:180_000,
    outputDir:'output/assembly-test-results',use:{trace:'retain-on-failure'}});
