from apps.audit.models import AuditLog


class AuditMixin:
    """Writes audit log entries for create/update of a model-viewset resource."""

    entity_name = None

    def _audit(self, action, instance, previous=None):
        AuditLog.objects.create(
            user=self.request.user,
            action=action,
            entity=self.entity_name or instance.__class__.__name__,
            entity_id=str(instance.pk),
            previous_value=previous or {},
            new_value={"status": getattr(instance, "status", "")},
        )

    def perform_create(self, serializer):
        instance = serializer.save()
        name = (self.entity_name or instance.__class__.__name__).upper()
        self._audit(f"{name}_CREATED", instance)

    def perform_update(self, serializer):
        instance = self.get_object()
        previous = {"status": getattr(instance, "status", "")}
        super().perform_update(serializer)
        instance.refresh_from_db()
        self._audit(f"{(self.entity_name or instance.__class__.__name__).upper()}_UPDATED", instance, previous)
