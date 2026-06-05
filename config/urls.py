from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import ChangePasswordView, CurrentUserView, EmailOrUsernameTokenObtainPairView, ForgotPasswordView, ResetPasswordConfirmView, SelfRegistrationView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/token/", EmailOrUsernameTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/v1/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/v1/auth/me/", CurrentUserView.as_view(), name="auth_me"),
    path("api/v1/auth/register/", SelfRegistrationView.as_view(), name="auth_register"),
    path("api/v1/auth/forgot-password/", ForgotPasswordView.as_view(), name="auth_forgot_password"),
    path("api/v1/auth/reset-password/", ResetPasswordConfirmView.as_view(), name="auth_reset_password"),
    path("api/v1/auth/change-password/", ChangePasswordView.as_view(), name="auth_change_password"),
    path("api/v1/", include("config.api_urls")),
]

if settings.ENABLE_API_DOCS:
    urlpatterns += [
        path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
        path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
        path("api/v1/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    ]
