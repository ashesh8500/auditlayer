from __future__ import annotations

from .config import get_settings
from .billing import checkout_client_from_settings
from .delivery import delivery_from_settings
from .hermes import generator_from_settings
from .pdf import pdf_renderer_from_settings
from .service import AuditLayerService
from .store import Store


def create_service() -> AuditLayerService:
    settings = get_settings()
    service = AuditLayerService(
        store=Store(settings.db_path),
        settings=settings,
        generator=generator_from_settings(settings),
        delivery=delivery_from_settings(settings),
        checkout=checkout_client_from_settings(settings),
        pdf_renderer=pdf_renderer_from_settings(settings),
    )
    service.bootstrap()
    return service
