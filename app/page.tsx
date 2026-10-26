"use client";

import React, {
  KeyboardEvent,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/client";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
};

export default function Home() {
  const [input, setInput] = useState("");

  const [isLoading, setIsLoading] =
    useState(false);
async function handleLogout() {
    const supabase = createClient();

    await supabase.auth.signOut();

    window.location.href = "/login";
  }
  const [messages, setMessages] = useState<
    Message[]
  >([
    {
      role: "assistant",
      content:
        "您好，我是企業 SOP 助理。您可以詢問公司制度、行政流程、醫療 SOP 或內部作業問題。",
    },
  ]);

  async function handleSubmit(
    event?: React.FormEvent<HTMLFormElement>
  ) {
    event?.preventDefault();

    const question = input.trim();

    if (!question || isLoading) return;

    setInput("");

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: question,
      },
    ]);

    setIsLoading(true);

    try {
      const response = await fetch(
        "/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            question,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "AI 回答失敗"
        );
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sources: Array.isArray(
            data.sources
          )
            ? data.sources
            : [],
        },
      ]);
    } catch (error) {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "目前無法取得 AI 回答，請稍後再試。",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      if (!isLoading) {
        handleSubmit();
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Enterprise Knowledge System
              </p>

              <h1 className="mt-1 text-2xl font-semibold text-slate-900">
                企業 SOP 助理
              </h1>
            </div>

            <div className="flex items-center gap-3">
  <div className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600">
    RAG 測試版
  </div>

  <button
    onClick={handleLogout}
    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
  >
    登出
  </button>
</div>
          </div>
        </header>

        <section className="flex flex-1 flex-col px-4 py-6 sm:px-6">
          <div className="flex-1 space-y-5 overflow-y-auto pb-6">
            {messages.map(
              (message, index) => {
                const isUser =
                  message.role === "user";

                return (
                  <div
                    key={index}
                    className={`flex ${
                      isUser
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-sm sm:max-w-[75%] ${
                        isUser
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap leading-7">
                          {
                            message.content
                          }
                        </p>
                      ) : (
                        <div className="prose prose-slate max-w-none">
                          <ReactMarkdown>
                            {
                              message.content
                            }
                          </ReactMarkdown>
                        </div>
                      )}

                      {!isUser &&
                        message.sources &&
                        message.sources
                          .length > 0 && (
                          <div className="mt-4 border-t border-slate-200 pt-3">
                            <p className="mb-2 text-xs font-medium text-slate-400">
                              資料來源
                            </p>

                            <div className="flex flex-wrap gap-2">
                              {message.sources.map(
                                (
                                  source,
                                  sourceIndex
                                ) => (
                                  <span
                                    key={
                                      sourceIndex
                                    }
                                    className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600"
                                  >
                                    {
                                      source
                                    }
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                );
              }
            )}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-slate-500 shadow-sm">
                  正在搜尋企業知識庫……
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="sticky bottom-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg"
          >
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(event) =>
                  setInput(
                    event.target.value
                  )
                }
                onKeyDown={handleKeyDown}
                placeholder="例如：病人申請病歷需要什麼流程？"
                rows={2}
                disabled={isLoading}
                className="min-h-[60px] flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 disabled:bg-slate-50"
              />

              <button
                type="submit"
                disabled={isLoading}
                className="self-end rounded-xl bg-slate-900 px-6 py-3 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isLoading
                  ? "搜尋中"
                  : "送出"}
              </button>
            </div>

            <p className="mt-2 px-1 text-xs text-slate-400">
              AI 回答將優先依據企業正式知識庫，並顯示實際引用文件。
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}