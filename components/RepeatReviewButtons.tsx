"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ReviewStatus =
  | "confirmed_gap"
  | "reasonable_repeat"
  | "false_positive";

type Props = {
  repeatEventId: string;
  currentStatus?: ReviewStatus | null;
};

export default function RepeatReviewButtons({
  repeatEventId,
  currentStatus,
}: Props) {
  const router = useRouter();

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function handleReview(
    reviewStatus: ReviewStatus
  ) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/admin/repeat-review",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            repeatEventId,
            reviewStatus,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "覆核更新失敗"
        );
      }

      router.refresh();
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "覆核更新失敗"
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-5 border-t border-slate-200 pt-4">
      <p className="mb-3 text-sm font-medium text-slate-700">
        主管人工覆核
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            handleReview(
              "confirmed_gap"
            )
          }
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            currentStatus ===
            "confirmed_gap"
              ? "border-red-300 bg-red-100 text-red-800"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          確認為知識缺口
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            handleReview(
              "reasonable_repeat"
            )
          }
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            currentStatus ===
            "reasonable_repeat"
              ? "border-blue-300 bg-blue-100 text-blue-800"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          合理再次確認
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            handleReview(
              "false_positive"
            )
          }
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            currentStatus ===
            "false_positive"
              ? "border-emerald-300 bg-emerald-100 text-emerald-800"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          系統誤判
        </button>
      </div>

      {isLoading && (
        <p className="mt-3 text-sm text-slate-500">
          正在儲存覆核結果……
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}