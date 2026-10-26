import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  calculateKnowledgeScore,
} from "@/lib/knowledge-score";

type Period =
  | "30"
  | "90"
  | "year"
  | "all";

type EmployeeStats = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;

  totalQuestions: number;
  answerableQuestions: number;
  answerableRate: number;

  repeatCount: number;
  excludedRepeatCount: number;

  pendingReviewCount: number;
  confirmedGapCount: number;
  reasonableRepeatCount: number;
  falsePositiveCount: number;

  knowledgeScore: number;
};

type PageProps = {
  searchParams: Promise<{
    period?: string;
  }>;
};

export default async function AdminPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  const selectedPeriod: Period =
    params.period === "30" ||
    params.period === "90" ||
    params.period === "year" ||
    params.period === "all"
      ? params.period
      : "90";

  const supabase =
    await createClient();

  // ========================================
  // 1. 確認登入者
  // ========================================

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ========================================
  // 2. 確認登入者角色
  // ========================================

  const {
    data: currentProfile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !currentProfile ||
    !["manager", "admin"].includes(
      currentProfile.role
    )
  ) {
    redirect("/");
  }

  // ========================================
  // 3. 計算期間起點
  // ========================================

  const now = new Date();

  let periodStart:
    | Date
    | null = null;

  if (selectedPeriod === "30") {
    periodStart =
      new Date(
        now.getTime() -
          30 *
            24 *
            60 *
            60 *
            1000
      );
  }

  if (selectedPeriod === "90") {
    periodStart =
      new Date(
        now.getTime() -
          90 *
            24 *
            60 *
            60 *
            1000
      );
  }

  if (selectedPeriod === "year") {
    periodStart =
      new Date(
        now.getFullYear(),
        0,
        1
      );
  }

  // ========================================
  // 4. 讀取員工
  // ========================================

  const {
    data: profiles,
    error: profilesError,
  } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role"
    )
    .order("full_name");

  if (profilesError) {
    console.error(
      "Profiles error:",
      profilesError
    );
  }

  // ========================================
  // 5. 讀取問題
  // ========================================

  let questionsQuery =
    supabase
      .from("questions")
      .select(
        `
        id,
        user_id,
        answerable,
        created_at
        `
      );

  if (periodStart) {
    questionsQuery =
      questionsQuery.gte(
        "created_at",
        periodStart.toISOString()
      );
  }

  const {
    data: questions,
    error: questionsError,
  } = await questionsQuery;

  if (questionsError) {
    console.error(
      "Questions error:",
      questionsError
    );
  }

  // ========================================
  // 6. 讀取 repeat events
  // ========================================

  let repeatQuery =
    supabase
      .from("repeat_events")
      .select(
        `
        id,
        user_id,
        excluded_from_score,
        review_status,
        days_since_previous,
        reviewed_at,
        created_at
        `
      );

  if (periodStart) {
    repeatQuery =
      repeatQuery.gte(
        "created_at",
        periodStart.toISOString()
      );
  }

  const {
    data: repeatEvents,
    error: repeatError,
  } = await repeatQuery;

  if (repeatError) {
    console.error(
      "Repeat events error:",
      repeatError
    );
  }

  // ========================================
  // 7. 依期間設定 Knowledge Score
  // ========================================

  const scoreDaysWindow =
    selectedPeriod === "30"
      ? 30
      : selectedPeriod === "90"
      ? 90
      : selectedPeriod === "all"
      ? null
      : null;

  // 今年我們已經用 periodStart
  // 先把資料篩過，因此 score
  // 可以直接計算目前資料集合。

  // ========================================
  // 8. 每位員工統計
  // ========================================

  const stats: EmployeeStats[] =
    (profiles ?? []).map(
      (profile) => {
        const employeeQuestions =
          (questions ?? []).filter(
            (q) =>
              q.user_id ===
              profile.id
          );

        const answerableQuestions =
          employeeQuestions.filter(
            (q) =>
              q.answerable ===
              true
          );

        const employeeRepeats =
          (repeatEvents ?? []).filter(
            (r) =>
              r.user_id ===
              profile.id
          );

        const excludedRepeats =
          employeeRepeats.filter(
            (r) =>
              r.excluded_from_score ===
              true
          );

        const pendingReviewRepeats =
          employeeRepeats.filter(
            (r) =>
              r.excluded_from_score ===
                false &&
              !r.review_status
          );

        const confirmedGaps =
          employeeRepeats.filter(
            (r) =>
              r.review_status ===
              "confirmed_gap"
          );

        const reasonableRepeats =
          employeeRepeats.filter(
            (r) =>
              r.review_status ===
              "reasonable_repeat"
          );

        const falsePositives =
          employeeRepeats.filter(
            (r) =>
              r.review_status ===
              "false_positive"
          );

        const totalQuestions =
          employeeQuestions.length;

        const answerableRate =
          totalQuestions > 0
            ? Math.round(
                (answerableQuestions.length /
                  totalQuestions) *
                  1000
              ) / 10
            : 0;

        const knowledgeScoreResult =
          calculateKnowledgeScore(
            employeeRepeats,
            {
              daysWindow:
                scoreDaysWindow,
            }
          );

        return {
          id: profile.id,
          full_name:
            profile.full_name,
          email: profile.email,
          role: profile.role,

          totalQuestions,

          answerableQuestions:
            answerableQuestions.length,

          answerableRate,

          repeatCount:
            employeeRepeats.length,

          excludedRepeatCount:
            excludedRepeats.length,

          pendingReviewCount:
            pendingReviewRepeats.length,

          confirmedGapCount:
            confirmedGaps.length,

          reasonableRepeatCount:
            reasonableRepeats.length,

          falsePositiveCount:
            falsePositives.length,

          knowledgeScore:
            knowledgeScoreResult.score,
        };
      }
    );

  // ========================================
  // 9. 全體統計
  // ========================================

  const totalQuestions =
    stats.reduce(
      (sum, employee) =>
        sum +
        employee.totalQuestions,
      0
    );

  const totalPendingReview =
    stats.reduce(
      (sum, employee) =>
        sum +
        employee.pendingReviewCount,
      0
    );

  const totalConfirmedGaps =
    stats.reduce(
      (sum, employee) =>
        sum +
        employee.confirmedGapCount,
      0
    );

  const totalReasonableRepeats =
    stats.reduce(
      (sum, employee) =>
        sum +
        employee.reasonableRepeatCount,
      0
    );

  const totalFalsePositives =
    stats.reduce(
      (sum, employee) =>
        sum +
        employee.falsePositiveCount,
      0
    );

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* Header */}

        <div className="mb-8">

          <p className="text-sm font-medium text-slate-500">
            Enterprise Knowledge System
          </p>

          <h1 className="mt-1 text-3xl font-semibold text-slate-900">
            主管 Dashboard
          </h1>

          <p className="mt-2 text-slate-600">
            員工企業知識庫使用與重複提問分析
          </p>

        </div>

        {/* ========================================
            時間篩選
        ======================================== */}

        <div className="mb-8 flex flex-wrap gap-2">

          <PeriodButton
            label="近 30 天"
            period="30"
            selectedPeriod={
              selectedPeriod
            }
          />

          <PeriodButton
            label="近 90 天"
            period="90"
            selectedPeriod={
              selectedPeriod
            }
          />

          <PeriodButton
            label="今年"
            period="year"
            selectedPeriod={
              selectedPeriod
            }
          />

          <PeriodButton
            label="全部"
            period="all"
            selectedPeriod={
              selectedPeriod
            }
          />

        </div>

        {/* ========================================
            總覽
        ======================================== */}

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

          <StatCard
            label="總提問"
            value={totalQuestions}
          />

          <StatCard
            label="未覆核重複"
            value={totalPendingReview}
          />

          <StatCard
            label="確認知識缺口"
            value={totalConfirmedGaps}
          />

          <StatCard
            label="合理再次確認"
            value={
              totalReasonableRepeats
            }
          />

          <StatCard
            label="系統誤判"
            value={
              totalFalsePositives
            }
          />

        </div>

        {/* ========================================
            員工列表
        ======================================== */}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 px-6 py-5">

            <h2 className="text-lg font-semibold text-slate-900">
              員工知識使用概況
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              知識掌握分數只計算主管人工確認的知識缺口。
            </p>

          </div>

          <div className="overflow-x-auto">

            <table className="min-w-full">

              <thead className="bg-slate-50">

                <tr className="text-left text-sm text-slate-500">

                  <th className="px-6 py-4 font-medium">
                    員工
                  </th>

                  <th className="px-6 py-4 font-medium">
                    身分
                  </th>

                  <th className="px-6 py-4 font-medium">
                    總提問
                  </th>

                  <th className="px-6 py-4 font-medium">
                    可回答率
                  </th>

                  <th className="px-6 py-4 font-medium">
                    未覆核
                  </th>

                  <th className="px-6 py-4 font-medium">
                    確認缺口
                  </th>

                  <th className="px-6 py-4 font-medium">
                    合理確認
                  </th>

                  <th className="px-6 py-4 font-medium">
                    系統誤判
                  </th>

                  <th className="px-6 py-4 font-medium">
                    知識掌握分數
                  </th>

                </tr>

              </thead>

              <tbody>

                {stats.map(
                  (employee) => (

                    <tr
                      key={employee.id}
                      className="border-t border-slate-100 text-sm text-slate-700"
                    >

                      <td className="px-6 py-4">

                        <Link
                          href={`/admin/users/${employee.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {employee.full_name ||
                            "未命名"}
                        </Link>

                        <p className="mt-1 text-xs text-slate-500">
                          {employee.email}
                        </p>

                      </td>

                      <td className="px-6 py-4">
                        {employee.role}
                      </td>

                      <td className="px-6 py-4">
                        {employee.totalQuestions}
                      </td>

                      <td className="px-6 py-4">
                        {employee.answerableRate}%
                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge
                          value={
                            employee.pendingReviewCount
                          }
                          type="pending"
                        />
                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge
                          value={
                            employee.confirmedGapCount
                          }
                          type="gap"
                        />
                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge
                          value={
                            employee.reasonableRepeatCount
                          }
                          type="reasonable"
                        />
                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge
                          value={
                            employee.falsePositiveCount
                          }
                          type="falsePositive"
                        />
                      </td>

                      <td className="px-6 py-4">
                        <KnowledgeScoreBadge
                          score={
                            employee.knowledgeScore
                          }
                        />
                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

        </div>

      </div>
    </main>
  );
}

function PeriodButton({
  label,
  period,
  selectedPeriod,
}: {
  label: string;
  period: Period;
  selectedPeriod: Period;
}) {
  const active =
    selectedPeriod === period;

  return (
    <Link
      href={`/admin?period=${period}`}
      className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-semibold text-slate-900">
        {value}
      </p>

    </div>
  );
}

function StatusBadge({
  value,
  type,
}: {
  value: number;
  type:
    | "pending"
    | "gap"
    | "reasonable"
    | "falsePositive";
}) {
  let classes =
    "bg-slate-100 text-slate-700";

  if (
    type === "pending" &&
    value > 0
  ) {
    classes =
      "bg-amber-100 text-amber-800";
  }

  if (
    type === "gap" &&
    value > 0
  ) {
    classes =
      "bg-red-100 text-red-800";
  }

  if (
    type === "reasonable" &&
    value > 0
  ) {
    classes =
      "bg-blue-100 text-blue-800";
  }

  if (
    type === "falsePositive" &&
    value > 0
  ) {
    classes =
      "bg-emerald-100 text-emerald-800";
  }

  return (
    <span
      className={`inline-flex min-w-8 justify-center rounded-full px-3 py-1 text-xs font-medium ${classes}`}
    >
      {value}
    </span>
  );
}

function KnowledgeScoreBadge({
  score,
}: {
  score: number;
}) {
  let classes =
    "bg-emerald-100 text-emerald-800";

  if (score < 70) {
    classes =
      "bg-red-100 text-red-800";
  } else if (score < 85) {
    classes =
      "bg-amber-100 text-amber-800";
  } else if (score < 95) {
    classes =
      "bg-blue-100 text-blue-800";
  }

  return (
    <span
      className={`inline-flex min-w-14 justify-center rounded-full px-3 py-1 text-sm font-semibold ${classes}`}
    >
      {score}
    </span>
  );
}