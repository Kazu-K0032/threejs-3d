import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// happy-dom 環境では URL クラスが Node のものと違うため、文字列の import.meta.url からパスを組み立てる
const indexPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html');
const indexHtml = readFileSync(indexPath, 'utf8');

// index.html の body を、script を除いて document に読み込む。UI のテストが、実物のマークアップを使うため
export function mountDashboardDom() {
  const body = indexHtml.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
}
