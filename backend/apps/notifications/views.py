from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count

from apps.accounts.models import User
from apps.common.permissions import can_manage_users

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    filterset_fields = ["is_read", "kind"]
    search_fields = ["title", "body"]

    def get_permissions(self):
        if self.action == "announce":
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

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

    @action(detail=False, methods=["post"], url_path="announce")
    def announce(self, request):
        """Admin-composed notice delivered to selected recipients (by user id and/or role)."""
        if not can_manage_users(request.user):
            return Response(
                {"detail": "Only administrators may send announcements."},
                status=status.HTTP_403_FORBIDDEN,
            )

        title = (request.data.get("title") or "").strip()
        body = (request.data.get("body") or "").strip()
        if not title:
            return Response({"detail": "An announcement title is required."}, status=status.HTTP_400_BAD_REQUEST)

        recipients = set()

        user_ids = [int(i) for i in request.data.get("recipient_ids", []) if str(i).isdigit()]
        if user_ids:
            recipients.update(User.objects.filter(id__in=user_ids, is_active=True))

        roles = [r for r in request.data.get("roles", []) if r]
        if roles:
            recipients.update(User.objects.filter(role__in=roles, is_active=True))

        recipients.discard(request.user)

        if not recipients:
            return Response(
                {"detail": "No active recipients matched your selection."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        Notification.objects.bulk_create(
            [
                Notification(recipient=r, title=title, body=body, kind="ANNOUNCEMENT")
                for r in recipients
            ]
        )

        return Response({"delivered": len(recipients)}, status=status.HTTP_201_CREATED)


def notify(recipients, title, body="", kind="INFO", incident=None):
    """Create notifications for a set of users, excluding the actor themselves."""
    recipients = {r for r in recipients if r is not None and r.pk}
    Notification.objects.bulk_create(
        [Notification(recipient=r, incident=incident, title=title, body=body, kind=kind) for r in recipients]
    )
