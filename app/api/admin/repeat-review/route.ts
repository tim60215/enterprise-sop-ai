import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedStatuses = [
  "confirmed_gap",
  "reasonable_repeat",
  "false_positive",
];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "未登入" },
        { status: 401 }
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !["manager", "admin"].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: "沒有主管權限" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const repeatEventId =
      typeof body.repeatEventId === "string"
        ? body.repeatEventId
        : "";

    const reviewStatus =
      typeof body.reviewStatus === "string"
        ? body.reviewStatus
        : "";

    const reviewNote =
      typeof body.reviewNote === "string"
        ? body.reviewNote.trim()
        : null;

    if (!repeatEventId) {
      return NextResponse.json(
        { error: "缺少 repeatEventId" },
        { status: 400 }
      );
    }

    if (!allowedStatuses.includes(reviewStatus)) {
      return NextResponse.json(
        { error: "不合法的 reviewStatus" },
        { status: 400 }
      );
    }

    const {
      error: updateError,
    } = await supabase
      .from("repeat_events")
      .update({
        review_status: reviewStatus,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
      })
      .eq("id", repeatEventId);

    if (updateError) {
      console.error(
        "Repeat review update error:",
        updateError
      );

      return NextResponse.json(
        { error: "覆核寫入失敗" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Repeat review API error:",
      error
    );

    return NextResponse.json(
      { error: "系統錯誤" },
      { status: 500 }
    );
  }
}