"""Tests for current and named shared office layout APIs."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)


def _headers() -> dict[str, str]:
    return {"X-API-Key": get_settings().effective_api_key}


def _snapshot() -> dict[str, object]:
    return {
        "version": 1,
        "updatedAt": 1_760_000_000_000,
        "overrides": {"desk-1": {"x": 412.5, "y": 318, "turn": 1}},
        "inserted": [
            {
                "id": "inserted-test-1",
                "spritePath": "/sprites/desk.png",
                "name": "Extra desk",
                "x": 640,
                "y": 480,
                "turn": 0,
            }
        ],
        "area": "implementation",
    }


def test_named_layout_save_list_and_retrieve() -> None:
    name = f"layout-{uuid4().hex[:12]}"
    saved = client.put(
        f"/api/v1/layout/saved/{name}", json=_snapshot(), headers=_headers()
    )
    assert saved.status_code == 200
    assert saved.json()["name"] == name

    listed = client.get("/api/v1/layout/saved", headers=_headers())
    assert listed.status_code == 200
    summary = next(item for item in listed.json()["layouts"] if item["name"] == name)
    assert isinstance(summary["savedAt"], int)

    loaded = client.get(f"/api/v1/layout/saved/{name}", headers=_headers())
    assert loaded.status_code == 200
    assert loaded.json()["layout"] == _snapshot()
    assert loaded.json()["name"] == name


def test_named_layout_put_upserts_by_name() -> None:
    name = f"layout-{uuid4().hex[:12]}"
    first = _snapshot()
    assert client.put(
        f"/api/v1/layout/saved/{name}", json=first, headers=_headers()
    ).status_code == 200

    replacement = _snapshot()
    replacement["area"] = "review"
    replacement["updatedAt"] = 1_760_000_000_001
    assert client.put(
        f"/api/v1/layout/saved/{name}", json=replacement, headers=_headers()
    ).status_code == 200

    loaded = client.get(f"/api/v1/layout/saved/{name}", headers=_headers())
    assert loaded.status_code == 200
    assert loaded.json()["layout"] == replacement
    listed = client.get("/api/v1/layout/saved", headers=_headers()).json()["layouts"]
    assert sum(item["name"] == name for item in listed) == 1


def test_named_layout_accepts_editor_position_boundaries() -> None:
    for name, x, y in (
        (f"layout-min-{uuid4().hex[:8]}", 20, 20),
        (f"layout-max-{uuid4().hex[:8]}", 1260, 1004),
    ):
        snapshot = _snapshot()
        snapshot["overrides"] = {"desk-1": {"x": x, "y": y}}
        snapshot["inserted"] = [
            {
                "id": "inserted-boundary",
                "spritePath": "/sprites/desk.png",
                "name": "Boundary desk",
                "x": x,
                "y": y,
            }
        ]
        response = client.put(
            f"/api/v1/layout/saved/{name}", json=snapshot, headers=_headers()
        )
        assert response.status_code == 200


def test_named_layout_rejects_positions_outside_editor_bounds() -> None:
    invalid_positions = (
        ("overrides", "x", 19),
        ("overrides", "x", 1261),
        ("overrides", "y", 19),
        ("overrides", "y", 1005),
        ("inserted", "x", 19),
        ("inserted", "x", 1261),
        ("inserted", "y", 19),
        ("inserted", "y", 1005),
    )
    for collection, coordinate, value in invalid_positions:
        snapshot = _snapshot()
        if collection == "overrides":
            snapshot["overrides"] = {
                "desk-1": {"x": 400, "y": 300, coordinate: value}
            }
        else:
            sprite = dict(snapshot["inserted"][0])
            sprite[coordinate] = value
            snapshot["inserted"] = [sprite]
        response = client.put(
            f"/api/v1/layout/saved/layout-{uuid4().hex[:12]}",
            json=snapshot,
            headers=_headers(),
        )
        assert response.status_code == 422, (collection, coordinate, value)


def test_named_layout_accepts_scale_and_tilt() -> None:
    """Issue 361: size and wall-matching slant persist in snapshots."""
    snapshot = _snapshot()
    snapshot["overrides"] = {"desk-1": {"x": 400, "y": 300, "scale": 0.5, "tilt": -12}}
    sprite = dict(snapshot["inserted"][0])
    sprite["scale"] = 1.5
    sprite["tilt"] = 10
    snapshot["inserted"] = [sprite]
    response = client.put(
        f"/api/v1/layout/saved/layout-{uuid4().hex[:12]}",
        json=snapshot,
        headers=_headers(),
    )
    assert response.status_code == 200, response.text


def test_named_layout_rejects_scale_and_tilt_out_of_range() -> None:
    invalid_values = (
        ("overrides", "scale", 0.1),
        ("overrides", "scale", 2.5),
        ("overrides", "tilt", -31),
        ("overrides", "tilt", 31),
        ("inserted", "scale", 0.1),
        ("inserted", "scale", 2.5),
        ("inserted", "tilt", -31),
        ("inserted", "tilt", 31),
    )
    for collection, field, value in invalid_values:
        snapshot = _snapshot()
        if collection == "overrides":
            snapshot["overrides"] = {"desk-1": {"x": 400, "y": 300, field: value}}
        else:
            sprite = dict(snapshot["inserted"][0])
            sprite[field] = value
            snapshot["inserted"] = [sprite]
        response = client.put(
            f"/api/v1/layout/saved/layout-{uuid4().hex[:12]}",
            json=snapshot,
            headers=_headers(),
        )
        assert response.status_code == 422, (collection, field, value)


def test_named_layout_rejects_invalid_names_and_payloads() -> None:
    assert (
        client.put(
            "/api/v1/layout/saved/%20%20", json=_snapshot(), headers=_headers()
        ).status_code
        == 400
    )
    assert (
        client.put(
            f"/api/v1/layout/saved/{'x' * 65}",
            json=_snapshot(),
            headers=_headers(),
        ).status_code
        == 400
    )
    assert (
        client.put(
            f"/api/v1/layout/saved/{uuid4().hex}",
            json={**_snapshot(), "version": 2},
            headers=_headers(),
        ).status_code
        == 422
    )
    invalid_sprite = _snapshot()
    invalid_sprite["inserted"] = [
        {
            "id": "external",
            "spritePath": "https://example.invalid/image.png",
            "name": "External",
            "x": 20,
            "y": 20,
        }
    ]
    assert (
        client.put(
            f"/api/v1/layout/saved/{uuid4().hex}",
            json=invalid_sprite,
            headers=_headers(),
        ).status_code
        == 422
    )


def test_named_layout_rejects_percent_encoded_sprite_paths() -> None:
    snapshot = _snapshot()
    snapshot["inserted"][0]["spritePath"] = "/sprites/%2e%2e/robots.txt"
    response = client.put(
        f"/api/v1/layout/saved/{uuid4().hex}",
        json=snapshot,
        headers=_headers(),
    )
    assert response.status_code == 422


def test_named_layout_enforces_snapshot_and_collection_size_limits(monkeypatch) -> None:
    from app.api.routes import layout as layout_routes

    name = f"layout-{uuid4().hex[:12]}"
    oversized = _snapshot()
    oversized["inserted"] = [
        {
            "id": f"inserted-{index}",
            "spritePath": f"/sprites/{'s' * 480}.png",
            "name": "n" * 100,
            "x": 20,
            "y": 20,
        }
        for index in range(1000)
    ]
    response = client.put(
        f"/api/v1/layout/saved/{name}", json=oversized, headers=_headers()
    )
    assert response.status_code == 413

    monkeypatch.setattr(layout_routes, "MAX_SAVED_LAYOUTS_BYTES", 128)
    response = client.put(
        f"/api/v1/layout/saved/{name}", json=_snapshot(), headers=_headers()
    )
    assert response.status_code == 413


def test_named_layout_enforces_count_limit(monkeypatch) -> None:
    from app.api.routes import layout as layout_routes

    current_count = len(
        client.get("/api/v1/layout/saved", headers=_headers()).json()["layouts"]
    )
    monkeypatch.setattr(layout_routes, "MAX_SAVED_LAYOUTS", current_count + 1)
    first = f"layout-{uuid4().hex[:12]}"
    second = f"layout-{uuid4().hex[:12]}"
    assert (
        client.put(
            f"/api/v1/layout/saved/{first}", json=_snapshot(), headers=_headers()
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"/api/v1/layout/saved/{second}", json=_snapshot(), headers=_headers()
        ).status_code
        == 409
    )


def test_named_layout_put_is_state_changing_but_get_remains_readable(monkeypatch) -> None:
    from app.api import middleware
    from app.config import Settings

    keyless = Settings(CLAUDE_OFFICE_API_KEY="")
    monkeypatch.setattr(middleware, "settings", keyless)
    name = f"layout-{uuid4().hex[:12]}"
    path = f"/api/v1/layout/saved/{name}"

    assert middleware._is_state_changing(path, "PUT") is True
    assert middleware._is_state_changing(path, "GET") is False
    assert client.get("/api/v1/layout/saved").status_code == 200
    assert client.put(path, json=_snapshot()).status_code == 401

    allowed = client.put(
        path,
        json=_snapshot(),
        headers={"X-API-Key": keyless.effective_api_key},
    )
    assert allowed.status_code == 200


def test_current_layout_serves_bundled_default_when_unset() -> None:
    """Issue 359: fresh installations open on the bundled default arrangement."""
    response = client.get("/api/v1/layout", headers=_headers())
    assert response.status_code == 200
    layout = response.json()["layout"]
    assert isinstance(layout, dict)
    assert layout["version"] == 1
    assert isinstance(layout["updatedAt"], int) and layout["updatedAt"] > 0
    assert layout["overrides"]
    assert layout["inserted"]
    assert "area" not in layout


def test_current_layout_round_trips_published_layout() -> None:
    published = _snapshot()
    published.pop("area", None)
    response = client.put(
        "/api/v1/layout", json={"layout": published}, headers=_headers()
    )
    assert response.status_code == 200, response.text
    loaded = client.get("/api/v1/layout", headers=_headers())
    assert loaded.status_code == 200
    assert loaded.json()["layout"] == published
