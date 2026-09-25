import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderGroupsExampleYaml } from './groups-schema.ts';

const here = import.meta.dirname;
const out = join(here, 'groups.yaml.example');
mkdirSync(here, { recursive: true });
writeFileSync(out, renderGroupsExampleYaml());
console.log(`wrote ${out}`);
