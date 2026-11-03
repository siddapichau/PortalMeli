import vm from 'node:vm';
import { htmlFiles, read, inlineScripts } from '../tests/helpers.mjs';

let errors = 0;
let total = 0;
for (const filename of htmlFiles) {
  for (const script of inlineScripts(read(filename), filename)) {
    total += 1;
    try {
      new vm.Script(script.code, { filename: script.filename });
    } catch (error) {
      errors += 1;
      console.error(`${script.filename}: ${error.message}`);
    }
  }
}
try {
  new vm.Script(read('apps-script.gs'), { filename: 'apps-script.gs' });
  total += 1;
} catch (error) {
  errors += 1;
  console.error(`apps-script.gs: ${error.message}`);
}
console.log(`${htmlFiles.length} HTMLs e apps-script.gs: ${total} scripts verificados, ${errors} erros de sintaxe.`);
process.exitCode = errors ? 1 : 0;
