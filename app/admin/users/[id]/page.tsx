import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RepeatReviewButtons from "@/components/RepeatReviewButtons";
import {
  calculateKnowledgeScore,
} from "@/lib/knowledge-score";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function UserDetailPage({
  params,
}: PageProps) {
  const { id } = await params;

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
  // 2. 確認登入者是 manager / admin
  // ========================================

  const {
    data: currentProfile,
  } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !currentProfile ||
    !["manager", "admin"].includes(
      currentProfile.role
    )
  ) {
    redirect("/");
  }

  // ========================================
  // 3. 取得目標員工
  // ========================================

  const {
    data: employee,
    error: employeeError,
  } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, department"
    )
    .eq("id", id)
    .single();

  if (
    employeeError ||
    !employee
  ) {
    redirect("/admin");
  }

  // ========================================
  // 4. 取得員工問題
  // ========================================

  const {
    data: questions,
  } = await supabase
    .from("questions")
    .select(
      `
      id,
      question,
      answerable,
      is_safety_check,
      created_at
      `
    )
    .eq("user_id", id)
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  // ========================================
  // 5. 取得重複事件
  // ========================================

  const {
    data: repeatEvents,
  } = await supabase
    .from("repeat_events")
    .select(
  `
  id,
  current_question_id,
  previous_question_id,
  similarity_score,
  days_since_previous,
  repeat_level,
  excluded_from_score,
  exclude_reason,
  review_status,
  reviewed_by,
  reviewed_at,
  review_note,
  created_at
  `
)
    .eq("user_id", id)
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  const questionMap =
    new Map(
      (questions ?? []).map(
        (question) => [
          question.id,
          question,
        ]
      )
    );

  const totalQuestions =
    questions?.length ?? 0;

  const answerableCount =
    (questions ?? []).filter(
      (q) =>
        q.answerable === true
    ).length;

  const answerableRate =
    totalQuestions > 0
      ? Math.round(
          (answerableCount /
            totalQuestions) *
            1000
        ) / 10
      : 0;

  const totalRepeats =
    repeatEvents?.length ?? 0;

  const excludedRepeats =
    (repeatEvents ?? []).filter(
      (event) =>
        event.excluded_from_score ===
        true
    ).length;

  const attentionRepeats =
    (repeatEvents ?? []).filter(
      (event) =>
        event.excluded_from_score ===
        false
    );

  const knowledgeScoreResult =
  calculateKnowledgeScore(
    repeatEvents ?? []
  );

  // ========================================
  // UI
  // ========================================

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">

        <div className="mb-6">
          <Link
            href="/admin"
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← 返回主管 Dashboard
          </Link>
        </div>

        <div className="mb-8">
          <p className="text-sm font-medium text-slate-500">
            員工知識使用分析
          </p>

          <h1 className="mt-1 text-3xl font-semibold text-slate-900">
            {employee.full_name ||
              "未命名員工"}
          </h1>

          <p className="mt-2 text-slate-600">
            {employee.email}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            身分：
            {employee.role}

            {employee.department
              ? `｜部門：${employee.department}`
              : ""}
          </p>
        </div>

        {/* 統計卡片 */}

        <div className="mb-8 grid gap-4 md:grid-cols-5">

          <StatCard
            label="總提問"
            value={totalQuestions}
          />

          <StatCard
            label="可回答率"
            value={`${answerableRate}%`}
          />

          <StatCard
            label="重複問題"
            value={totalRepeats}
          />

          <StatCard
            label="需主管注意"
            value={
              attentionRepeats.length
            }
          />

          <StatCard
            label="近 90 天知識掌握分數"
            value={
              knowledgeScoreResult.score
            }
          />

        </div>
<div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
  <h2 className="text-lg font-semibold text-slate-900">
    近 90 天知識掌握分數
  </h2>

  <div className="mt-4 flex items-end gap-3">
    <p className="text-5xl font-semibold text-slate-900">
      {knowledgeScoreResult.score}
    </p>

    <p className="pb-1 text-slate-500">
      / 100
    </p>
  </div>

  <div className="mt-5 border-t border-slate-100 pt-4">
    <p className="text-sm text-slate-600">
      主管確認知識缺口：{" "}
      {knowledgeScoreResult.confirmedGapCount} 次
    </p>

    <p className="mt-1 text-sm text-slate-600">
      累計扣分：{" "}
      {knowledgeScoreResult.totalPenalty} 分
    </p>
  </div>
</div>
        {/* 需注意重複問題 */}

        <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-900">
              需主管注意的重複問題
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              已排除同日測試與安全確認。
            </p>
          </div>

          {attentionRepeats.length ===
          0 ? (
            <div className="px-6 py-10 text-slate-500">
              目前沒有需要主管注意的重複問題。
            </div>
          ) : (
            <div className="divide-y divide-slate-100">

              {attentionRepeats.map(
                (event) => {
                  const current =
                    questionMap.get(
                      event.current_question_id
                    );

                  const previous =
                    event.previous_question_id
                      ? questionMap.get(
                          event.previous_question_id
                        )
                      : null;

                  const similarity =
                    Number(
                      event.similarity_score
                    );

                  return (
                    <div
                      key={event.id}
                      className="p-6"
                    >

                      <div className="mb-4 flex flex-wrap items-center gap-3">

                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                          {
                            event.repeat_level
                          }
                        </span>

                        <span className="text-sm text-slate-500">
                          相似度：
                          {(
                            similarity *
                            100
                          ).toFixed(1)}
                          %
                        </span>

                        <span className="text-sm text-slate-500">
                          間隔：
                          {
                            event.days_since_previous
                          }{" "}
                          天
                        </span>

                      </div>

                      <div className="grid gap-4 md:grid-cols-2">

                        <div className="rounded-xl bg-slate-50 p-4">

                          <p className="mb-2 text-xs font-medium text-slate-400">
                            這次問題
                          </p>

                          <p className="text-slate-800">
                            {current?.question ||
                              "找不到問題內容"}
                          </p>

                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">

                          <p className="mb-2 text-xs font-medium text-slate-400">
                            前一次問題
                          </p>

                          <p className="text-slate-800">
                            {previous?.question ||
                              "找不到前一次問題"}
                          </p>

                        </div>

                      </div>
                      <RepeatReviewButtons
  repeatEventId={event.id}
  currentStatus={
    event.review_status
  }
/>
                    </div>
                  );
                }
              )}

            </div>
          )}
        </div>

        {/* 合理排除 */}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 px-6 py-5">

            <h2 className="text-lg font-semibold text-slate-900">
              合理排除紀錄
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              共 {excludedRepeats} 筆
            </p>

          </div>

          <div className="divide-y divide-slate-100">

            {(repeatEvents ?? [])
              .filter(
                (event) =>
                  event.excluded_from_score ===
                  true
              )
              .map((event) => {
                const current =
                  questionMap.get(
                    event.current_question_id
                  );

                return (
                  <div
                    key={event.id}
                    className="px-6 py-5"
                  >

                    <p className="font-medium text-slate-800">
                      {current?.question ||
                        "找不到問題內容"}
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      {event.exclude_reason ||
                        "已排除"}
                    </p>

                  </div>
                );
              })}

          </div>
        </div>

      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number;
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