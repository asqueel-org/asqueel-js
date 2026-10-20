// Every native integration test runs through the public adapter of its runtime.
const driver = process.versions.bun
    ? await import('@asqueel/js/adapters/bun')
    : await import('@asqueel/js/adapters/node');
export const nativeSQLite = driver.openBunSQLite || driver.openNodeSQLite;
