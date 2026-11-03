"""Regression tests use temporary homes only; never modify the user's Codex config."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("cfg", ROOT / "scripts/codex-config.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="codex-config-test-")
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.local = self.home / ".local"
        self.local.mkdir()
        self.target = self.home / ".codex/config.toml"
        self.target.parent.mkdir()
        self.config = {**json.loads((ROOT / "config.example.json").read_text()),
                       "gatewayUrl": "https://gateway.example", "auth0Domain": "tenant.auth0.com",
                       "oauthClientId": "public-client"}
        self.cache = {"client_version": "0.166.0", "identity": "private-cache-identity", "models": [
            {"slug": slug, "display_name": slug, "supported_in_api": True, "visibility": "list",
             "priority": 3, "upgrade": {"model": "not-allowed"},
             "model_messages": {"instructions_template": "preserve instructions"},
             "supported_reasoning_levels": [{"effort": "high", "description": "Think hard"}],
             "context_window": 272000, "future_capability": {"keep": True}}
            for slug in ("gpt-6.1-sol", "gpt-6-astra")]}
        self.cache_path = self.target.parent / "models_cache.json"
        self.cache_path.write_text(json.dumps(self.cache))
        self.original = (b'# keep this comment\nmodel = "original"\nweb_search = "live"\n\n'
                         b'[features]\nexample = true\n\n'
                         b'[plugins."computer-history@openai-bundled"]\nenabled = true\n\n'
                         b'[projects."/existing"]\ntrust_level = "trusted"\n')
        self.target.write_bytes(self.original)
        (self.local / "config.json").write_text(json.dumps(self.config))
        for patcher in (patch.object(m, "LOCAL", self.local), patch.object(m.Path, "home", return_value=self.home),
                        patch.dict(os.environ, {}, clear=True)):
            patcher.start()
            self.addCleanup(patcher.stop)

    def install(self):
        m.install(self.config)
        return self.target.read_bytes()

    def archives(self):
        return list((self.local / "recovery").iterdir())

    def test_gateway_picker_filters_catalog_and_preserves_metadata(self):
        before = self.cache_path.read_bytes()
        installed = m.parsed(self.install())
        catalog_path = Path(installed['model_catalog_json'])
        self.assertTrue(catalog_path.is_absolute())
        catalog = json.loads(catalog_path.read_text())
        expected = {**self.cache['models'][0], 'visibility': 'list', 'priority': 0, 'upgrade': None}
        self.assertEqual(catalog, {'models': [expected]})
        self.assertEqual(self.cache_path.read_bytes(), before)
        self.assertEqual(catalog_path.stat().st_mode & 0o777, 0o600)
        m.restore()
        self.assertNotIn('model_catalog_json', m.parsed(self.target.read_bytes()))
        self.assertEqual(self.target.read_bytes(), self.original)

    def test_existing_catalog_and_later_edits_survive_restore_without_cache(self):
        original_catalog = self.home / 'normal-models.json'
        original_catalog.write_text('{"models": []}')
        original = f'model_catalog_json = {json.dumps(str(original_catalog))}\n'.encode() + self.original
        self.target.write_bytes(original)
        installed = self.install()
        self.assertNotEqual(m.parsed(installed)['model_catalog_json'], str(original_catalog))
        self.target.write_bytes(installed + b'\n# keep later edit\n')
        self.cache_path.unlink()
        m.restore()
        self.assertEqual(m.parsed(self.target.read_bytes()), m.parsed(original))
        self.assertIn(b'# keep later edit', self.target.read_bytes())
        self.assertEqual(original_catalog.read_text(), '{"models": []}')

    def test_unusable_catalog_refuses_before_config_or_backup_changes(self):
        for cache in (None, {}, {'client_version': 'test', 'models': []},
                      {**self.cache, 'models': [{**self.cache['models'][0], 'supported_in_api': False}]},
                      {**self.cache, 'models': [self.cache['models'][0], self.cache['models'][0]]}):
            with self.subTest(cache=cache):
                if cache is None:
                    self.cache_path.unlink(missing_ok=True)
                else:
                    self.cache_path.write_text(json.dumps(cache))
                with self.assertRaises(ValueError):
                    self.install()
                self.assertEqual(self.target.read_bytes(), self.original)
                self.assertFalse((self.local / 'codex-backup.json').exists())

    def test_preview_is_complete_and_does_not_change_active_catalog(self):
        active = m.parsed(self.install())
        active_path = Path(active['model_catalog_json'])
        before = active_path.read_bytes()
        self.cache['models'][0]['context_window'] = 400000
        self.cache_path.write_text(json.dumps(self.cache))
        installed = self.target.read_bytes()
        with patch.object(m.sys, 'argv', ['cfg', 'render']):
            m.main()
        preview = m.parsed((self.local / 'codex.config.toml').read_bytes())
        self.assertNotEqual(preview['model_catalog_json'], str(active_path))
        self.assertTrue(Path(preview['model_catalog_json']).is_file())
        self.assertEqual(active_path.read_bytes(), before)
        self.assertEqual(self.target.read_bytes(), installed)

    def test_catalog_follows_configured_allowlist_and_default(self):
        self.config.update(models=['gpt-6.1-sol', 'gpt-6-astra'], defaultModel='gpt-6-astra')
        _, content = m.prepare_catalog(self.config)
        self.assertEqual([m['slug'] for m in json.loads(content)['models']], ['gpt-6-astra', 'gpt-6.1-sol'])
        for models, default in (([], 'gpt-6.1-sol'), (['gpt-6.1-sol'] * 2, 'gpt-6.1-sol'),
                                (['gpt-6.1-sol'], 'gpt-6-astra')):
            with self.subTest(models=models, default=default):
                self.config.update(models=models, defaultModel=default)
                with self.assertRaises(ValueError):
                    m.prepare_catalog(self.config)

    def test_catalog_reads_selected_codex_home(self):
        other = self.home / 'other-home'
        other.mkdir()
        (other / 'models_cache.json').write_text(json.dumps(self.cache))
        self.cache_path.unlink()
        with patch.dict(os.environ, {'CODEX_HOME': str(other)}):
            m.install(self.config)
            self.assertEqual(m.parsed((other / 'config.toml').read_bytes())['model'], 'gpt-6.1-sol')
            m.restore()
        self.assertFalse((other / 'config.toml').exists())
        self.assertEqual(self.target.read_bytes(), self.original)

    def test_render_uses_native_oauth_defaults_and_keeps_settings(self):
        output = m.render(self.config, self.original.decode())
        result = m.parsed(output)
        self.assertTrue(result['features']['example'])
        self.assertIn(b'# keep this comment', output)
        provider = result['model_providers'][m.PROVIDER]
        self.assertNotIn('requires_openai_auth', provider)
        self.assertNotIn('delivery', provider['gateway_oauth'])
        self.assertNotIn('env_key', provider)
        self.assertIn('audience=https%3A%2F%2Fcodex-gateway-lab', provider['gateway_oauth']['authorization_url'])

    def test_demo_switches_get_distinct_grants_and_restore_without_touching_credentials(self):
        secrets = self.target.parent / "secrets"
        secrets.mkdir()
        gateway_store = secrets / "gateway_oauth.age"
        gateway_store.write_bytes(b"opaque encrypted gateway credentials")
        chatgpt_store = self.target.parent / "auth.json"
        chatgpt_store.write_bytes(b"opaque existing ChatGPT credentials")
        first = m.parsed(self.install())['model_providers'][m.PROVIDER]['gateway_oauth']
        m.restore()
        self.assertEqual(self.target.read_bytes(), self.original)
        second = m.parsed(self.install())['model_providers'][m.PROVIDER]['gateway_oauth']
        m.restore()
        for oauth in (first, second):
            query = parse_qs(urlparse(oauth['authorization_url']).query)
            self.assertEqual(query['prompt'], ['login'])
            self.assertRegex(query['codex_demo_run'][0], r'^[0-9a-f]{32}$')
            self.assertEqual(query['audience'], [self.config['audience']])
            self.assertEqual(query['connection'], [self.config['projectName'] + '-users'])
            self.assertIn('offline_access', oauth['scopes'])
        self.assertNotEqual(first['authorization_url'], second['authorization_url'])
        self.assertEqual({k: v for k, v in first.items() if k != 'authorization_url'},
                         {k: v for k, v in second.items() if k != 'authorization_url'})
        self.assertEqual(gateway_store.read_bytes(), b"opaque encrypted gateway credentials")
        self.assertEqual(chatgpt_store.read_bytes(), b"opaque existing ChatGPT credentials")
        self.assertEqual(self.target.read_bytes(), self.original)

    def test_reuse_mode_keeps_stable_authorization_url(self):
        m.install(self.config, fresh_login=False)
        first = m.parsed(self.target.read_bytes())['model_providers'][m.PROVIDER]['gateway_oauth']
        m.restore()
        m.install(self.config, fresh_login=False)
        second = m.parsed(self.target.read_bytes())['model_providers'][m.PROVIDER]['gateway_oauth']
        self.assertEqual(first, second)
        query = parse_qs(urlparse(first['authorization_url']).query)
        self.assertNotIn('prompt', query)
        self.assertNotIn('codex_demo_run', query)
        m.restore()

    def test_exact_restore_retains_all_recovery_copies(self):
        installed = self.install()
        m.restore()
        self.assertEqual(self.target.read_bytes(), self.original)
        archive, = self.archives()
        self.assertEqual((archive / 'installed.toml').read_bytes(), installed)
        self.assertEqual((archive / 'before.toml').read_bytes(), self.original)
        self.assertEqual((archive / 'current.toml').stat().st_mode & 0o777, 0o600)
        self.assertFalse((self.local / 'codex-backup.json').exists())
        m.restore()  # Safe to repeat.
        self.assertEqual(self.target.read_bytes(), self.original)

    def test_codex_plugin_removal_does_not_block_restore(self):
        installed = self.install()
        plugin = b'[plugins."computer-history@openai-bundled"]\nenabled = true\n\n'
        self.target.write_bytes(installed.replace(plugin, b''))
        m.restore()
        self.assertEqual(m.parsed(self.target.read_bytes()), m.parsed(self.original.replace(plugin, b'')))

    def test_new_project_and_comment_survive_restore(self):
        installed = self.install()
        self.target.write_bytes(installed + b'\n# added after install\n[projects."/new"]\ntrust_level = "trusted"\n')
        m.restore()
        result = self.target.read_bytes()
        self.assertIn(b'# added after install', result)
        self.assertEqual(m.parsed(result)['projects']['/new']['trust_level'], 'trusted')
        self.assertNotIn(m.PROVIDER, m.parsed(result).get('model_providers', {}))

    def test_conflicting_managed_change_is_preserved_and_has_escape_hatch(self):
        installed = self.install()
        current = installed.replace(b'model_provider = "railway-auth0-lab"', b'model_provider = "another-provider"')
        self.target.write_bytes(current)
        with self.assertRaisesRegex(ValueError, 'restore --original'):
            m.restore()
        self.assertEqual(self.target.read_bytes(), current)
        self.assertTrue((self.local / 'codex-backup.json').exists())
        m.restore(use_original=True)
        self.assertEqual(self.target.read_bytes(), self.original)
        self.assertTrue(all((a / 'current.toml').read_bytes() == current for a in self.archives()))

    def test_invalid_current_config_can_be_recovered(self):
        self.install()
        self.target.write_bytes(b'[invalid TOML')
        with self.assertRaisesRegex(ValueError, 'restore --original'):
            m.restore()
        m.restore(use_original=True)
        self.assertEqual(self.target.read_bytes(), self.original)

    def test_restore_does_not_need_local_config(self):
        installed = self.install()
        self.target.write_bytes(installed + b'\n# later comment\n')
        (self.local / 'config.json').unlink()
        with patch.object(m.sys, 'argv', ['cfg', 'restore']):
            m.main()
        self.assertIn(b'# later comment', self.target.read_bytes())
        self.assertEqual(m.parsed(self.target.read_bytes()), m.parsed(self.original))

    def test_manual_recovery_closes_journal_without_rewriting_active_file(self):
        self.install()
        self.target.write_bytes(self.original)
        stamp = self.target.stat().st_mtime_ns
        (self.local / 'config.json').unlink()
        m.restore()
        self.assertEqual(self.target.stat().st_mtime_ns, stamp)
        self.assertFalse((self.local / 'codex-backup.json').exists())

    def test_corrupt_original_refuses_even_emergency_restore(self):
        installed = self.install()
        (self.local / 'codex-config.before.toml').write_bytes(b'model = "wrong"\n')
        with self.assertRaisesRegex(ValueError, 'Backup changed'):
            m.restore(use_original=True)
        self.assertEqual(self.target.read_bytes(), installed)

    def test_symlink_target_refused_on_install_and_restore(self):
        destination = self.home / 'other.toml'
        destination.write_bytes(self.original)
        self.target.unlink()
        self.target.symlink_to(destination)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.install()
        self.target.unlink()
        self.target.write_bytes(self.original)
        self.install()
        self.target.unlink()
        self.target.symlink_to(destination)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            m.restore(use_original=True)
        self.assertEqual(destination.read_bytes(), self.original)

    def test_old_install_journal_with_plugin_drift_is_supported(self):
        installed = m.render(self.config, self.original.decode(), legacy=True)
        self.target.write_bytes(installed.replace(b'enabled = true\n', b'enabled = false\n'))
        (self.local / 'codex-config.before.toml').write_bytes(self.original)
        (self.local / 'codex-backup.json').write_text(json.dumps({
            'target': str(self.target), 'existed': True, 'original_sha256': m.digest(self.original),
            'installed_sha256': m.digest(installed)}))
        m.restore()
        self.assertFalse(m.parsed(self.target.read_bytes())['plugins']['computer-history@openai-bundled']['enabled'])

    def test_no_original_config_removes_only_our_settings(self):
        self.target.unlink()
        self.install()
        m.restore()
        self.assertFalse(self.target.exists())
        installed = self.install()
        self.target.write_bytes(installed + b'\n[projects."/new"]\ntrust_level = "trusted"\n')
        m.restore()
        self.assertEqual(m.parsed(self.target.read_bytes()), {'projects': {'/new': {'trust_level': 'trusted'}}})

    def test_changed_provider_block_requires_explicit_recovery(self):
        installed = self.install()
        self.target.write_bytes(installed.replace(b'public-client', b'changed-client'))
        with self.assertRaisesRegex(ValueError, 'restore --original'):
            m.restore()

    def test_active_profile_and_unsafe_render_are_rejected_without_writing(self):
        self.target.write_bytes(b'profile = "custom"\n')
        with self.assertRaises(ValueError):
            self.install()
        self.assertEqual(self.target.read_bytes(), b'profile = "custom"\n')
        self.assertFalse((self.local / 'codex-backup.json').exists())
        self.target.write_bytes(b'model = """a\nb"""\n')
        with self.assertRaises(ValueError):
            self.install()
        self.assertFalse((self.local / 'codex-backup.json').exists())


if __name__ == '__main__':
    unittest.main()
