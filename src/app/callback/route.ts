import { handleAuth } from "@workos-inc/authkit-nextjs";
import { cookies } from "next/headers";

import { mobileAuthEnabled, storeMobileAuthSession } from "@/lib/mobile-auth";
import { sealMobileSession } from "@/lib/mobile-auth-session";

export const GET = handleAuth({
  onSuccess: async (data) => {
    if (!data.state?.startsWith("mobile:")) return;
    if (!mobileAuthEnabled()) return;
    const [code, challenge] = data.state.slice("mobile:".length).split(":");
    if (!code) return;
    if (challenge && !/^[a-f0-9]{64}$/.test(challenge))
      throw new Error("Invalid mobile sign-in challenge");
    const session = await sealMobileSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      impersonator: data.impersonator,
      authenticationMethod: data.authenticationMethod,
    });
    await storeMobileAuthSession(
      code,
      {
        session,
        accessToken: data.accessToken,
        user: data.user,
      },
      challenge,
    );
    // handleAuth saves a web cookie before this hook. The native app owns this
    // session now; a browser must not independently rotate its refresh token.
    const jar = await cookies();
    jar.set(process.env.WORKOS_COOKIE_NAME || "wos-session", "", {
      path: "/",
      expires: new Date(0),
      ...(process.env.WORKOS_COOKIE_DOMAIN
        ? { domain: process.env.WORKOS_COOKIE_DOMAIN }
        : {}),
    });
    jar.delete("workos-access-token");
  },
});
