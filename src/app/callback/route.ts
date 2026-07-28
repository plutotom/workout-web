import { handleAuth } from "@workos-inc/authkit-nextjs";

import { mobileAuthEnabled, storeMobileAuthSession } from "@/lib/mobile-auth";
import { sealMobileSession } from "@/lib/mobile-auth-session";

export const GET = handleAuth({
  onSuccess: async (data) => {
    if (!data.state?.startsWith("mobile:")) return;
    if (!mobileAuthEnabled()) return;
    const code = data.state.slice("mobile:".length);
    if (!code) return;
    const session = await sealMobileSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      impersonator: data.impersonator,
      authenticationMethod: data.authenticationMethod,
    });
    await storeMobileAuthSession(code, {
      session,
      accessToken: data.accessToken,
      user: data.user,
    });
  },
});
