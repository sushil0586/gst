import axios from "axios";

import { unwrapApiData } from "@/lib/api/helpers";
import { normalizeApiError } from "@/lib/api/error-handler";
import type { ChangePasswordPayload, ForgotPasswordPayload, ResetPasswordPayload, SelfRegistrationPayload, SessionPayload } from "@/types/api";

export const authService = {
  async login(identifier: string, password: string): Promise<SessionPayload> {
    const response = await axios.post<{ user: SessionPayload }>("/api/auth/login", {
      email: identifier,
      password,
    });
    return response.data.user;
  },

  async register(payload: SelfRegistrationPayload): Promise<SessionPayload> {
    const response = await axios.post<{ user: SessionPayload }>("/api/auth/register", payload);
    return response.data.user;
  },

  async forgotPassword(payload: ForgotPasswordPayload) {
    await axios.post("/api/auth/forgot-password", payload);
  },

  async resetPassword(payload: ResetPasswordPayload) {
    await axios.post("/api/auth/reset-password", payload);
  },

  async changePassword(payload: ChangePasswordPayload) {
    await axios.post("/api/auth/change-password", payload);
  },

  async getCurrentUser(): Promise<SessionPayload | null> {
    try {
      const response = await axios.get("/api/auth/me", {
        withCredentials: true,
      });
      return unwrapApiData<SessionPayload>(response);
    } catch (error) {
      const normalized = normalizeApiError(error);
      if (normalized.statusCode === 401) {
        return null;
      }
      throw error;
    }
  },

  async logout() {
    await axios.post("/api/auth/logout");
  },

  async hasSession() {
    const session = await this.getCurrentUser();
    return Boolean(session);
  },
};
