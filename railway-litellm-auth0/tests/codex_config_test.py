"""Regression tests use temporary homes only; never modify the user's Codex config."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
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
