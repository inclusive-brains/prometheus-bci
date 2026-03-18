"""Tests for the setup UI (parse_env, write_env, schema validation)."""

import pytest
from pathlib import Path
from scripts.setup_ui import parse_env, write_env, SCHEMA, HEADSETS


# ── parse_env ───────────────────────────────────────────────────────────────

class TestParseEnv:

    def test_parses_simple_values(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("EEG_DEVICE=dummy\nPPG_DEVICE=fake\n")
        result = parse_env(env_file)
        assert result == {"EEG_DEVICE": "dummy", "PPG_DEVICE": "fake"}

    def test_ignores_comments(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("# This is a comment\nEEG_DEVICE=dummy\n")
        result = parse_env(env_file)
        assert result == {"EEG_DEVICE": "dummy"}

    def test_ignores_commented_out_vars(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("#MODEL_BLINK=                         # Pre-computed blink model\n")
        result = parse_env(env_file)
        assert "MODEL_BLINK" not in result

    def test_handles_inline_comments(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("OSC_PORT=5005                        # Target OSC server port\n")
        result = parse_env(env_file)
        assert result["OSC_PORT"] == "5005"

    def test_handles_values_with_spaces(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("EEG_DEVICE = emotiv_epochX   # headset\n")
        result = parse_env(env_file)
        assert result["EEG_DEVICE"] == "emotiv_epochX"

    def test_empty_file(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("")
        result = parse_env(env_file)
        assert result == {}

    def test_missing_file(self, tmp_path):
        env_file = tmp_path / ".env_nonexistent"
        result = parse_env(env_file)
        assert result == {}

    def test_empty_value(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("ECG=\n")
        result = parse_env(env_file)
        assert result["ECG"] == ""


# ── write_env ───────────────────────────────────────────────────────────────

class TestWriteEnv:

    def test_roundtrip(self, tmp_path):
        """Write then parse should preserve all non-empty values."""
        env_file = tmp_path / ".env"
        values = {"EEG_DEVICE": "dummy", "PPG_DEVICE": "fake", "CAMERA_ENABLE": "true", "OSC_PORT": "5005"}
        write_env(env_file, values)
        parsed = parse_env(env_file)
        for key, val in values.items():
            assert parsed[key] == val

    def test_empty_values_are_commented_out(self, tmp_path):
        """Empty values should be written as commented-out lines."""
        env_file = tmp_path / ".env"
        write_env(env_file, {"EEG_DEVICE": "dummy"})
        content = env_file.read_text()
        # MODEL_BLINK has default="" in schema, so should be commented
        assert "#MODEL_BLINK=" in content or "#MODEL_BLINK =" in content

    def test_default_eeg_device(self, tmp_path):
        """EEG_DEVICE defaults to 'dummy' if not specified."""
        env_file = tmp_path / ".env"
        write_env(env_file, {})
        parsed = parse_env(env_file)
        assert parsed["EEG_DEVICE"] == "dummy"

    def test_section_headers_present(self, tmp_path):
        """Output should contain section header comments."""
        env_file = tmp_path / ".env"
        write_env(env_file, {"EEG_DEVICE": "dummy"})
        content = env_file.read_text()
        assert "DEVICES" in content
        assert "OSC OUTPUT" in content

    def test_all_schema_keys_present(self, tmp_path):
        """All schema keys should appear in written file (active or commented)."""
        env_file = tmp_path / ".env"
        write_env(env_file, {})
        content = env_file.read_text()
        for section in SCHEMA:
            for field in section["fields"]:
                assert field["key"] in content, f"{field['key']} missing from .env output"


# ── Schema Validation ──────────────────────────────────────────────────────

class TestSchemaIntegrity:

    def test_all_fields_have_required_attributes(self):
        """Every field must have key, label, type, default."""
        for section in SCHEMA:
            assert "section" in section
            assert "fields" in section
            for field in section["fields"]:
                assert "key" in field, f"Missing 'key' in {section['section']}"
                assert "label" in field, f"Missing 'label' in {field.get('key', '?')}"
                assert "type" in field, f"Missing 'type' in {field['key']}"
                assert "default" in field, f"Missing 'default' in {field['key']}"

    def test_field_types_are_valid(self):
        """Field types must be one of the supported types."""
        valid_types = {"select", "text", "number", "bool", "path"}
        for section in SCHEMA:
            for field in section["fields"]:
                assert field["type"] in valid_types, f"{field['key']} has invalid type '{field['type']}'"

    def test_select_fields_have_options(self):
        """Select-type fields must provide options list."""
        for section in SCHEMA:
            for field in section["fields"]:
                if field["type"] == "select":
                    assert "options" in field, f"{field['key']} is select but has no options"
                    assert len(field["options"]) > 0, f"{field['key']} has empty options"

    def test_no_duplicate_keys(self):
        """Schema should not have duplicate keys."""
        keys = []
        for section in SCHEMA:
            for field in section["fields"]:
                keys.append(field["key"])
        assert len(keys) == len(set(keys)), f"Duplicate keys: {[k for k in keys if keys.count(k) > 1]}"

    def test_bool_defaults_are_valid(self):
        """Bool fields should have 'true' or 'false' as default."""
        for section in SCHEMA:
            for field in section["fields"]:
                if field["type"] == "bool":
                    assert field["default"] in ("true", "false"), \
                        f"{field['key']} bool default is '{field['default']}'"


# ── Headsets Validation ─────────────────────────────────────────────────────

class TestHeadsetsIntegrity:

    def test_all_headsets_have_required_fields(self):
        required = {"id", "name", "brand", "description", "channels", "rate", "color", "tag"}
        for headset in HEADSETS:
            for field in required:
                assert field in headset, f"Headset '{headset.get('name', '?')}' missing '{field}'"

    def test_no_duplicate_headset_ids(self):
        ids = [h["id"] for h in HEADSETS]
        assert len(ids) == len(set(ids)), f"Duplicate headset ids: {[i for i in ids if ids.count(i) > 1]}"

    def test_color_format(self):
        """Colors should be valid hex codes."""
        import re
        for headset in HEADSETS:
            assert re.match(r'^#[0-9a-fA-F]{6}$', headset["color"]), \
                f"Invalid color '{headset['color']}' for {headset['name']}"
