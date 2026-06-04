from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.common.api import api_response


class StandardResultsSetPagination(PageNumberPagination):
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response(
            api_response(
                data=data,
                pagination={
                    "count": self.page.paginator.count,
                    "next": self.get_next_link(),
                    "previous": self.get_previous_link(),
                    "page": self.page.number,
                    "page_size": self.get_page_size(self.request),
                },
            )
        )
