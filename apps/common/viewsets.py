from rest_framework import status
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.common.api import api_response


class StandardizedModelViewSet(ModelViewSet):
    success_message = "Success"

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(api_response(data=serializer.data, message=self.success_message))

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response(api_response(data=serializer.data, message=self.success_message))

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = self.perform_create(serializer)
        output = self.get_serializer(instance)
        return Response(
            api_response(data=output.data, message=f"{self.basename_title} created"),
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated_instance = self.perform_update(serializer)
        output = self.get_serializer(updated_instance)
        return Response(api_response(data=output.data, message=f"{self.basename_title} updated"))

    def destroy(self, request, *args, **kwargs):
        self.perform_destroy(self.get_object())
        return Response(api_response(data=None, message=f"{self.basename_title} deleted"))

    @property
    def basename_title(self):
        return getattr(self, "resource_name", self.__class__.__name__.replace("ViewSet", ""))
