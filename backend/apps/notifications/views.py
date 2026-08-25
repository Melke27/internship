from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    filterset_fields = ["is_read", "kind"]
    search_fields = ["title", "body"]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).select_related("incident").order_by("-created_at")

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"updated": updated})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        return Response({"count": self.get_queryset().filter(is_read=False).count()})


def notify(recipients, title, body="", kind="INFO", incident=None):
    """Create notifications for a set of users, excluding the actor themselves."""
    recipients = {r for r in recipients if r is not None and r.pk}
    Notification.objects.bulk_create(
        [Notification(recipient=r, incident=incident, title=title, body=body, kind=kind) for r in recipients]
    )
