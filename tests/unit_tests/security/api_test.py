# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
import pytest

from superset.extensions import appbuilder, csrf
from superset.security.manager import (
    SupersetPermissionViewMenuApi,
    SupersetSecurityManager,
)


@pytest.mark.parametrize(
    "app",
    [{"WTF_CSRF_ENABLED": True}],
    indirect=True,
)
def test_csrf_not_exempt(app_context: None) -> None:
    """
    Test that REST API is not exempt from CSRF.
    """
    assert {blueprint.name for blueprint in csrf._exempt_blueprints} == {
        "GroupApi",
        "MenuApi",
        "SecurityApi",
        "OpenApi",
        "SupersetPermissionViewMenuApi",
        "SupersetRoleApi",
        "SupersetUserApi",
        "PermissionApi",
        "ViewMenuApi",
    }


# ---------------------------------------------------------------------------
# Ruten patch 006: SupersetPermissionViewMenuApi dot-notation filter support
# ---------------------------------------------------------------------------


def test_superset_security_manager_uses_custom_permission_view_menu_api(
    app_context: None,
) -> None:
    """SupersetSecurityManager must use the Ruten subclass for permission-view-menu API."""  # noqa: D200
    sm = SupersetSecurityManager(appbuilder)
    assert sm.permission_view_menu_api is SupersetPermissionViewMenuApi


def test_superset_permission_view_menu_api_search_columns(
    app_context: None,
) -> None:
    """search_columns must include dot-notation columns for permission and view_menu."""
    assert "permission.name" in SupersetPermissionViewMenuApi.search_columns
    assert "view_menu.name" in SupersetPermissionViewMenuApi.search_columns
    assert "id" in SupersetPermissionViewMenuApi.search_columns


def test_superset_permission_view_menu_api_injects_dot_notation_filters(
    app_context: None,
) -> None:
    """_init_properties must inject FilterContains for dot-notation columns.

    Verify by inspecting the override method source: it calls super() first,
    then injects FilterContains instances for each dot-notation column.
    """
    import inspect

    source = inspect.getsource(SupersetPermissionViewMenuApi._init_properties)
    assert "FilterContains" in source
    assert "permission.name" in source
    assert "view_menu.name" in source
    assert "_search_filters" in source
