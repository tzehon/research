import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('Codex config preserves unrelated settings and exact original restoration; refuses drift', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'codex-lab-config-'));
  try {
    mkdirSync(path.join(dir, '.local'));
    const source = path.resolve('scripts/codex-config.py');
    const config = { ...JSON.parse(readFileSync('config.example.json', 'utf8')), gatewayUrl: 'https://gateway.up.railway.app', auth0Domain: 'tenant.auth0.com', oauthClientId: 'public-client' };
    const original = '# keep this comment\nmodel = "original"\nweb_search = "live"\n\n[features]\nexample = true\n';
    const python = `import importlib.util,json,pathlib\ns=importlib.util.spec_from_file_location('cfg',${JSON.stringify(source)})\nm=importlib.util.module_from_spec(s); s.loader.exec_module(m)\nc=json.loads(${JSON.stringify(JSON.stringify(config))})\noriginal=${JSON.stringify(original)}\nresult=m.render(c,original)\nd=m.tomllib.loads(result.decode())\nassert d['features']['example'] is True\nassert '# keep this comment' in result.decode()\nassert d['model_provider']=='railway-auth0-lab'\no=d['model_providers']['railway-auth0-lab']['gateway_oauth']\nassert 'audience=https%3A%2F%2Fcodex-gateway-lab' in o['authorization_url']\nassert 'delivery' not in o\nassert 'secret' not in o\nprint('ok')\n`;
    assert.equal(execFileSync('python3', ['-c', python], { encoding: 'utf8' }).trim(), 'ok');
    const lifecycle = python.replace("print('ok')", `m.LOCAL=pathlib.Path(${JSON.stringify(dir)}) / '.local'
m.os.environ={}
m.Path.home=staticmethod(lambda: pathlib.Path(${JSON.stringify(dir)}))
target=m.Path.home()/'.codex/config.toml'
target.parent.mkdir()
target.write_text(original)
(m.LOCAL/'config.json').write_text(json.dumps(c))
m.sys.argv=['cfg','install']; m.main()
installed=target.read_bytes()
target.write_bytes(installed+b'\\n# later edit\\n')
m.sys.argv=['cfg','restore']
try:
 m.main()
 raise AssertionError('restore should refuse drift')
except ValueError:
 pass
assert target.read_bytes().endswith(b'# later edit\\n')
target.write_bytes(installed)
m.main()
assert target.read_text()==original
assert not (m.LOCAL/'codex-backup.json').exists()
print('lifecycle-ok')`);
    assert.match(execFileSync('python3', ['-c', lifecycle], { encoding: 'utf8' }), /lifecycle-ok/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
