import { test as base } from "@playwright/test";

import { GstApiMock } from "./gst-api-mocks";

export const test = base.extend<{
  gstApi: GstApiMock;
}>({
  gstApi: async ({ page }, attachGstApi) => {
    const gstApi = new GstApiMock(page);
    await gstApi.mockAuthenticatedWorkspace();
    await attachGstApi(gstApi);
  },
});

export { expect } from "@playwright/test";
