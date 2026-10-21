import {readFileSync} from 'node:fs';

const [packed] = JSON.parse(readFileSync(process.argv[2] || 'pack.json'));
const endpoint = `https://registry.npmjs.org/${encodeURIComponent(packed.name)}/${packed.version}`;
for (let attempt = 0; attempt < 20; attempt++) {
  const response = await fetch(endpoint, {signal: AbortSignal.timeout(30000)});
  if (response.ok) {
    const published = await response.json();
    if (published.dist.integrity !== packed.integrity) {
      throw new Error('Published archive differs from the tested archive');
    }
    console.log(`${packed.id}: registry integrity matches the tested archive`);
    process.exit(0);
  }
  if (response.status !== 404) throw new Error(`Registry HTTP ${response.status}`);
  console.log('npm is still processing the release; checking again in 30 seconds');
  await new Promise(resolve => setTimeout(resolve, 30000));
}
throw new Error('Release is still unavailable after 10 minutes; do not publish another version blindly');
