export type LiveCredentials = {
  baseUrl: string;
  email: string;
  password: string;
};

export function getLiveCredentials(): LiveCredentials | null {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
  const email = process.env.PLAYWRIGHT_LIVE_EMAIL;
  const password = process.env.PLAYWRIGHT_LIVE_PASSWORD;

  if (!baseUrl || !email || !password) {
    return null;
  }

  return {
    baseUrl,
    email,
    password,
  };
}
