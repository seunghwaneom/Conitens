from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import ensemble


class OwnerAuthorizationCompatibilityTests(unittest.TestCase):
    def test_missing_owner_preserves_not_initialized_reason(self) -> None:
        with patch.object(ensemble, "read_owner", return_value=None):
            self.assertEqual(
                ensemble.is_project_owner(),
                (False, "NOT_INITIALIZED: No OWNER.json found. Run `ensemble init-owner` first."),
            )

    def test_uid_match_remains_first_priority(self) -> None:
        with (
            patch.object(ensemble, "read_owner", return_value={"owner": {"uid": 42}}),
            patch.object(ensemble, "get_current_user_info", return_value={"uid": 42}),
        ):
            self.assertEqual(ensemble.is_project_owner(), (True, "UID_MATCH"))

    def test_username_hostname_match_is_preserved(self) -> None:
        owner = {"owner": {"username": "operator", "hostname": "control", "uid": None}}
        current = {"username": "operator", "hostname": "control", "uid": None}
        with (
            patch.object(ensemble, "read_owner", return_value=owner),
            patch.object(ensemble, "get_current_user_info", return_value=current),
        ):
            self.assertEqual(ensemble.is_project_owner(), (True, "USERNAME_HOSTNAME_MATCH"))

    def test_git_email_match_is_not_an_authorization_factor(self) -> None:
        owner = {
            "owner": {
                "username": "owner",
                "hostname": "control",
                "git_email": "Owner@Example.test",
                "uid": None,
            }
        }
        current = {
            "username": "other",
            "hostname": "host",
            "git_email": "owner@example.test",
            "uid": None,
        }
        with (
            patch.object(ensemble, "read_owner", return_value=owner),
            patch.object(ensemble, "get_current_user_info", return_value=current),
        ):
            allowed, reason = ensemble.is_project_owner()
            self.assertFalse(allowed)
            self.assertTrue(reason.startswith("NOT_OWNER:"))

    def test_mismatch_reason_shape_is_preserved(self) -> None:
        owner = {"owner": {"username": "owner", "hostname": "control", "uid": None}}
        current = {"username": "other", "hostname": "host", "uid": None}
        with (
            patch.object(ensemble, "read_owner", return_value=owner),
            patch.object(ensemble, "get_current_user_info", return_value=current),
        ):
            self.assertEqual(
                ensemble.is_project_owner(),
                (False, "NOT_OWNER: Current user (other@host) does not match owner (owner@control)"),
            )


if __name__ == "__main__":
    unittest.main()
