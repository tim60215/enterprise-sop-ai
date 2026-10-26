import { createServerClient } from "@supabase/ssr";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

export async function updateSession(
  request: NextRequest
) {
  let supabaseResponse =
    NextResponse.next({
      request,
    });

  const supabase =
    createServerClient(
      process.env
        .NEXT_PUBLIC_SUPABASE_URL!,
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(cookiesToSet) {
            cookiesToSet.forEach(
              ({
                name,
                value,
              }) => {
                request.cookies.set(
                  name,
                  value
                );
              }
            );

            supabaseResponse =
              NextResponse.next({
                request,
              });

            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                supabaseResponse.cookies.set(
                  name,
                  value,
                  options
                );
              }
            );
          },
        },
      }
    );

  const {
    data,
  } =
    await supabase.auth.getClaims();

  const user =
    data?.claims;

  const pathname =
    request.nextUrl.pathname;

  const isLoginPage =
    pathname === "/login";

  const isAuthCallback =
    pathname.startsWith(
      "/auth/"
    );

  // ========================================
  // 未登入 → 導向 login
  // ========================================

  if (
    !user &&
    !isLoginPage &&
    !isAuthCallback
  ) {
    const url =
      request.nextUrl.clone();

    url.pathname = "/login";

    const redirectResponse =
      NextResponse.redirect(url);

    // 把 Supabase 更新後的 cookies
    // 一顆一顆複製到 redirect response
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => {
        redirectResponse.cookies.set(
          cookie
        );
      });

    return redirectResponse;
  }

  // ========================================
  // 已登入卻進 login → 回首頁
  // ========================================

  if (
    user &&
    isLoginPage
  ) {
    const url =
      request.nextUrl.clone();

    url.pathname = "/";

    const redirectResponse =
      NextResponse.redirect(url);

    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => {
        redirectResponse.cookies.set(
          cookie
        );
      });

    return redirectResponse;
  }

  return supabaseResponse;
}