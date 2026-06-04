import { apiClient } from "@/lib/api/client";

function getFilename(contentDisposition?: string, fallback = "report.xlsx") {
  if (!contentDisposition) {
    return fallback;
  }
  const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return filenameMatch?.[1] ?? fallback;
}

export async function downloadFile(
  url: string,
  params: Record<string, string | undefined>,
  fallbackFilename: string,
) {
  const response = await apiClient.get(url, {
    params,
    responseType: "blob",
  });
  const blob = new Blob([response.data]);
  const filename = getFilename(response.headers["content-disposition"], fallbackFilename);
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}
